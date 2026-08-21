import type { MessageJobStatus } from '@prisma/client';
import { prisma } from './db';
import { logger } from './logger';
import { refreshCampaignProgress } from './sender';

/**
 * Delivery receipts from Evolution.
 *
 * Evolution passes Baileys' ack values straight through, and their shape varies by
 * version: a string on some builds, the numeric ack on others, nested under
 * different keys. Everything here is read permissively — an unrecognized receipt is
 * logged and ignored rather than corrupting a message's state.
 */

const STATUS_BY_NAME: Record<string, MessageJobStatus> = {
  PENDING: 'sending',
  SERVER_ACK: 'sent',
  DELIVERY_ACK: 'delivered',
  DELIVERED: 'delivered',
  READ: 'read',
  PLAYED: 'read',
  ERROR: 'failed',
  FAILED: 'failed',
};

/** Baileys ack codes: 0 error, 1 pending, 2 server, 3 delivered, 4 read, 5 played. */
const STATUS_BY_ACK: Record<number, MessageJobStatus> = {
  0: 'failed',
  1: 'sending',
  2: 'sent',
  3: 'delivered',
  4: 'read',
  5: 'read',
};

/** Never walk a message backwards: a late SERVER_ACK must not undo a READ. */
const RANK: Record<MessageJobStatus, number> = {
  queued: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  read: 4,
  failed: 5,
  cancelled: 5,
};

export function mapDeliveryStatus(raw: unknown): MessageJobStatus | null {
  if (typeof raw === 'number') return STATUS_BY_ACK[raw] ?? null;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (/^\d+$/.test(trimmed)) return STATUS_BY_ACK[Number(trimmed)] ?? null;
    return STATUS_BY_NAME[trimmed.toUpperCase().replace(/[\s-]/g, '_')] ?? null;
  }
  return null;
}

/** Digs the provider message id out of the shapes Evolution uses. */
export function extractMessageId(data: Record<string, unknown>): string | null {
  const key = (data.key ?? {}) as Record<string, unknown>;
  const candidates = [data.keyId, key.id, data.messageId, data.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) return candidate;
  }
  return null;
}

export interface DeliveryUpdate {
  instanceName: string;
  messageId: string;
  status: MessageJobStatus;
}

/**
 * Applies a receipt to the matching message job. Returns false when the receipt is
 * for a message this platform did not send — Evolution reports on the whole number,
 * including chats typed on the phone.
 */
export async function applyDeliveryUpdate(update: DeliveryUpdate): Promise<boolean> {
  const job = await prisma.messageJob.findFirst({
    where: { providerMessageId: update.messageId },
    select: { id: true, status: true, campaignId: true },
  });
  if (!job) return false;

  if (RANK[update.status] <= RANK[job.status]) {
    logger.debug(
      { messageId: update.messageId, from: job.status, to: update.status },
      'Ignoring out-of-order delivery receipt',
    );
    return true;
  }

  await prisma.messageJob.update({
    where: { id: job.id },
    data: {
      status: update.status,
      deliveredAt:
        update.status === 'delivered' || update.status === 'read' ? new Date() : undefined,
    },
  });

  await refreshCampaignProgress(job.campaignId);
  return true;
}
