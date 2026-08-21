import { prisma } from './db';
import { env } from './env';
import { evolution, EvolutionError } from './evolution';
import { logger } from './logger';
import { backOff, parseBusinessHours, reserveSendSlot, resolveLimits } from './rateLimit';
import type { SendJobData } from './queue';

/**
 * What the worker should do with a job after processing it.
 * `wait` reschedules rather than failing — a closed rate gate is not an error, and
 * a message must never be dropped because the number was busy.
 */
export type SendOutcome =
  | { action: 'sent'; nextDelayMs: number }
  | { action: 'wait'; retryInMs: number; reason: string }
  | { action: 'retry'; retryInMs: number; reason: string }
  | { action: 'failed'; reason: string }
  | { action: 'skipped'; reason: string };

/** Errors that will never succeed on retry — the recipient is the problem. */
function isPermanent(err: unknown): boolean {
  if (!(err instanceof EvolutionError)) return false;
  if (err.isTransport || err.isRateLimited) return false;
  return err.status === 400 || err.status === 404 || err.status === 422;
}

async function refreshCampaignProgress(campaignId: string): Promise<void> {
  const grouped = await prisma.messageJob.groupBy({
    by: ['status'],
    where: { campaignId },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));

  const sent = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0);
  const failed = counts.failed ?? 0;
  const delivered = (counts.delivered ?? 0) + (counts.read ?? 0);
  const outstanding = (counts.queued ?? 0) + (counts.sending ?? 0);

  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { status: true },
  });
  if (!campaign) return;

  const finished = outstanding === 0 && ['running', 'queued'].includes(campaign.status);

  await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      sentCount: sent,
      failedCount: failed,
      deliveredCount: delivered,
      ...(finished
        ? {
            // A run where nothing got through is a failure, not a success.
            status: sent > 0 ? ('completed' as const) : ('failed' as const),
            completedAt: new Date(),
          }
        : {}),
    },
  });
}

/**
 * Processes one queued message: checks the campaign is still running, asks the rate
 * gates for permission, sends through Evolution, and records the result.
 *
 * Every branch either advances the message to a terminal state or asks to be retried
 * later — nothing is silently dropped, which is what "no babysitting" requires.
 */
export async function processMessageJob(data: SendJobData): Promise<SendOutcome> {
  const job = await prisma.messageJob.findUnique({
    where: { id: data.messageJobId },
    include: {
      campaign: {
        include: {
          organization: { include: { instance: true } },
        },
      },
    },
  });

  if (!job) return { action: 'skipped', reason: 'Message no longer exists' };
  if (job.status !== 'queued') {
    return { action: 'skipped', reason: `Message is already ${job.status}` };
  }

  const campaign = job.campaign;
  const org = campaign.organization;
  const instance = org.instance;

  if (campaign.status === 'cancelled') {
    await prisma.messageJob.update({ where: { id: job.id }, data: { status: 'cancelled' } });
    return { action: 'skipped', reason: 'Campaign cancelled' };
  }
  if (campaign.status === 'paused') {
    return { action: 'wait', retryInMs: 30_000, reason: 'Campaign paused' };
  }

  if (!instance) {
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'paused', lastError: 'No WhatsApp instance is provisioned' },
    });
    return { action: 'wait', retryInMs: 60_000, reason: 'No instance provisioned' };
  }

  const limits = resolveLimits(
    {
      maxPerMinute: instance.maxPerMinute ?? undefined,
      maxPerDay: instance.maxPerDay ?? undefined,
    },
    org.settings,
  );

  // The number must actually be connected. A mid-campaign disconnect pauses the
  // campaign and surfaces the reason rather than burning through messages that fail.
  if (instance.status !== 'connected') {
    let state: string = instance.status;
    try {
      const live = await evolution.connectionState(
        instance.evolutionInstanceName,
        instance.apiKey ?? undefined,
      );
      state = live === 'open' ? 'connected' : live;
      if (live === 'open') {
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'connected', lastError: null },
        });
      }
    } catch (err) {
      logger.warn({ err, instance: instance.evolutionInstanceName }, 'Connection check failed');
    }

    if (state !== 'connected') {
      await prisma.$transaction([
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { status: 'paused', lastError: `WhatsApp number is ${state}` },
        }),
        prisma.auditLog.create({
          data: {
            organizationId: org.id,
            action: 'campaign.paused_disconnected',
            entityType: 'campaign',
            entityId: campaign.id,
            metadata: { instanceState: state },
          },
        }),
      ]);
      return { action: 'wait', retryInMs: 60_000, reason: `Number is ${state}` };
    }
  }

  // Reserve last, immediately before sending: a slot consumed while the number is
  // offline would eat into the daily cap for messages that never went out.
  const gate = await reserveSendSlot(
    instance.evolutionInstanceName,
    limits,
    parseBusinessHours(org.settings),
  );
  if (!gate.allowed) {
    // A daily cap or a closed window can hold a campaign for hours; say so on the
    // campaign so the dashboard explains the pause instead of looking stalled.
    if (gate.reason === 'per_day_cap' || gate.reason === 'outside_hours') {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { lastError: gate.detail },
      });
    }
    return { action: 'wait', retryInMs: gate.retryInMs, reason: gate.detail };
  }

  await prisma.$transaction([
    prisma.messageJob.update({
      where: { id: job.id },
      data: { status: 'sending', attempts: { increment: 1 } },
    }),
    ...(campaign.status === 'queued'
      ? [
          prisma.campaign.update({
            where: { id: campaign.id },
            data: { status: 'running', startedAt: campaign.startedAt ?? new Date() },
          }),
        ]
      : []),
  ]);

  try {
    const response = await evolution.sendText(
      instance.evolutionInstanceName,
      { number: job.phone, text: job.renderedText },
      instance.apiKey ?? undefined,
    );

    const providerMessageId =
      (response as { key?: { id?: string } } | null)?.key?.id ?? null;

    await prisma.messageJob.update({
      where: { id: job.id },
      data: {
        status: 'sent',
        sentAt: new Date(),
        providerMessageId,
        rawResponse: response as object,
        error: null,
      },
    });
    await refreshCampaignProgress(campaign.id);

    return { action: 'sent', nextDelayMs: gate.nextDelayMs };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Keep whatever Evolution said about the failure — it is what makes a bad
    // number distinguishable from a sick server when someone debugs later.
    const errorBody =
      err instanceof EvolutionError && err.body !== undefined && err.body !== null
        ? ({ error: err.body } as object)
        : undefined;

    if (err instanceof EvolutionError && err.isRateLimited) {
      // Back the whole number off, not just this message.
      await backOff(instance.evolutionInstanceName, 60_000);
      await prisma.$transaction([
        prisma.messageJob.update({
          where: { id: job.id },
          data: { status: 'queued', error: message.slice(0, 500) },
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { lastError: 'WhatsApp is rate limiting this number — backing off' },
        }),
      ]);
      return { action: 'retry', retryInMs: 60_000, reason: 'Rate limited' };
    }

    const permanent = isPermanent(err);
    const exhausted = job.attempts + 1 >= env.SEND_MAX_ATTEMPTS;

    if (permanent || exhausted) {
      await prisma.messageJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          error: message.slice(0, 500),
          ...(errorBody ? { rawResponse: errorBody } : {}),
        },
      });
      await refreshCampaignProgress(campaign.id);
      return { action: 'failed', reason: message };
    }

    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: 'queued', error: message.slice(0, 500) },
    });
    // Exponential-ish backoff on transport trouble.
    return {
      action: 'retry',
      retryInMs: Math.min(5 * 60_000, 15_000 * 2 ** job.attempts),
      reason: message,
    };
  }
}

export { refreshCampaignProgress };
