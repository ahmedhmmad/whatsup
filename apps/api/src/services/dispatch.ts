import type { Campaign, Organization } from '@prisma/client';
import { enqueueSendJobs, removeCampaignJobs, resolveLimits, sentToday } from '@sendwhats/core';
import { prisma } from '../db';
import { badRequest } from '../errors';
import { requireInstance } from './instances';

/**
 * Hands a prepared campaign to the queue.
 *
 * The MessageJob rows already exist — Phase 4 resolved them from exactly what the
 * admin reviewed — so dispatch only enqueues them. Nothing is re-resolved here,
 * which is what stops the audience drifting between review and send.
 */
export async function dispatchCampaign(
  org: Organization,
  campaign: Campaign,
  options: { scheduledAt?: Date } = {},
) {
  if (!['draft', 'paused', 'scheduled'].includes(campaign.status)) {
    throw badRequest(`A ${campaign.status} campaign cannot be sent`);
  }

  const instance = await requireInstance(org.id);
  if (instance.status !== 'connected') {
    throw badRequest(
      `Connect a WhatsApp number before sending — this one is ${instance.status.replace(/_/g, ' ')}`,
    );
  }

  const pending = await prisma.messageJob.findMany({
    where: { campaignId: campaign.id, status: 'queued' },
    select: { id: true },
  });
  if (!pending.length) throw badRequest('This campaign has no messages left to send');

  // Same layering the worker uses, so the estimate an admin is shown matches the
  // caps that will actually apply.
  const limits = resolveLimits(
    {
      maxPerMinute: instance.maxPerMinute ?? undefined,
      maxPerDay: instance.maxPerDay ?? undefined,
    },
    org.settings,
  );
  const alreadySentToday = await sentToday(instance.evolutionInstanceName);

  // A scheduled campaign is queued exactly like an immediate one; the delay lives on
  // the queue jobs, so the same pacing, caps and connection checks apply when it wakes.
  const delayMs = options.scheduledAt ? Math.max(0, options.scheduledAt.getTime() - Date.now()) : 0;
  const scheduling = delayMs > 0;

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: scheduling ? 'scheduled' : 'queued',
      scheduledAt: options.scheduledAt ?? null,
      startedAt: scheduling ? null : (campaign.startedAt ?? new Date()),
      lastError: null,
    },
  });

  await enqueueSendJobs(
    pending.map((job) => ({
      messageJobId: job.id,
      campaignId: campaign.id,
      organizationId: org.id,
      instanceName: instance.evolutionInstanceName,
    })),
    scheduling ? { delay: delayMs } : {},
  );

  return {
    campaign: updated,
    queued: pending.length,
    limits,
    scheduledAt: updated.scheduledAt,
    /** Surfaced up front so an admin knows if the daily cap will hold the campaign. */
    remainingToday: Math.max(0, limits.maxPerDay - alreadySentToday),
    estimatedMinutes: Math.ceil(
      (pending.length * ((limits.minDelayMs + limits.maxDelayMs) / 2)) / 60_000,
    ),
  };
}

/**
 * Schedules a draft for a future time. The recipient list was already frozen when the
 * draft was created, so what goes out later is what the admin reviewed — not whoever
 * happens to match the filter by then.
 */
export async function scheduleCampaign(org: Organization, campaign: Campaign, scheduledAt: Date) {
  if (!['draft', 'scheduled'].includes(campaign.status)) {
    throw badRequest(`A ${campaign.status} campaign cannot be scheduled`);
  }
  if (scheduledAt.getTime() <= Date.now()) {
    throw badRequest('Pick a time in the future, or send now');
  }

  // Re-scheduling replaces the pending jobs rather than stacking a second set.
  if (campaign.status === 'scheduled') await removeCampaignJobs(campaign.id);

  return dispatchCampaign(org, campaign, { scheduledAt });
}

/** Pulls a scheduled campaign back to draft; nothing is sent. */
export async function unscheduleCampaign(campaign: Campaign) {
  if (campaign.status !== 'scheduled') throw badRequest('This campaign is not scheduled');

  await removeCampaignJobs(campaign.id);
  return prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'draft', scheduledAt: null },
  });
}

/** Stops new sends; anything already handed to Evolution finishes. */
export async function pauseCampaign(campaign: Campaign) {
  // Pausing a scheduled campaign cancels the timer rather than waiting for it to fire.
  if (!['queued', 'running', 'scheduled'].includes(campaign.status)) {
    throw badRequest(`A ${campaign.status} campaign cannot be paused`);
  }

  const updated = await prisma.campaign.update({
    where: { id: campaign.id },
    data: { status: 'paused' },
  });
  // Drop the waiting jobs too, so a pause takes effect now rather than trickling
  // out whatever was already scheduled.
  await removeCampaignJobs(campaign.id);
  return updated;
}

export async function resumeCampaign(org: Organization, campaign: Campaign) {
  if (campaign.status !== 'paused') throw badRequest('Only a paused campaign can be resumed');
  return dispatchCampaign(org, campaign);
}

/** Ends the campaign: queued messages are marked cancelled and never sent. */
export async function cancelCampaign(campaign: Campaign) {
  if (['completed', 'cancelled'].includes(campaign.status)) {
    throw badRequest(`This campaign is already ${campaign.status}`);
  }

  await removeCampaignJobs(campaign.id);
  const [{ count }, updated] = await prisma.$transaction([
    prisma.messageJob.updateMany({
      where: { campaignId: campaign.id, status: 'queued' },
      data: { status: 'cancelled' },
    }),
    prisma.campaign.update({
      where: { id: campaign.id },
      data: { status: 'cancelled', completedAt: new Date() },
    }),
  ]);

  return { campaign: updated, cancelled: count };
}
