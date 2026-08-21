import { Router } from 'express';
import type { InstanceStatus } from '@prisma/client';
import {
  applyDeliveryUpdate,
  extractMessageId,
  jidToDigits,
  mapDeliveryStatus,
} from '@sendwhats/core';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { logger } from '../logger';

export const webhooksRouter = Router();

/**
 * Receiver for the webhook registered when an instance is provisioned.
 *
 * Handles the connection lifecycle (so a number that drops overnight is visible
 * without anyone opening the connect screen) and delivery receipts (so message
 * status advances past "sent" on its own).
 *
 * Unauthenticated by design — Evolution posts here — so it is deliberately inert:
 * it looks the instance up by name and only ever writes connection state or
 * advances a message it can match by provider id.
 */
webhooksRouter.post(
  '/evolution/:instanceName',
  asyncHandler(async (req, res) => {
    // Always 200: a webhook receiver that errors makes Evolution retry forever.
    res.status(200).json({ received: true });

    const instanceName = req.params.instanceName;
    const body = (req.body ?? {}) as Record<string, unknown>;
    const event = String(body.event ?? '').toUpperCase().replace(/\./g, '_');
    const data = (body.data ?? {}) as Record<string, unknown>;

    const instance = await prisma.whatsAppInstance.findUnique({
      where: { evolutionInstanceName: instanceName },
    });
    if (!instance) {
      logger.warn({ instanceName, event }, 'Webhook for an unknown instance');
      return;
    }

    if (event === 'CONNECTION_UPDATE') {
      const state = String(data.state ?? data.status ?? '').toLowerCase();
      const status: InstanceStatus | null =
        state === 'open'
          ? 'connected'
          : state === 'connecting'
            ? 'connecting'
            : state === 'close'
              ? 'disconnected'
              : null;
      if (!status) return;

      const phoneNumber = jidToDigits(data.wuid ?? data.ownerJid ?? data.number);
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status,
          phoneNumber: phoneNumber ?? instance.phoneNumber,
          lastConnectedAt: status === 'connected' ? new Date() : instance.lastConnectedAt,
          lastError:
            status === 'disconnected' ? String(data.statusReason ?? '') || 'Disconnected' : null,
        },
      });

      if (status === 'disconnected') {
        // Recorded as an event so the alerts feed can surface it after the fact.
        await prisma.auditLog.create({
          data: {
            organizationId: instance.organizationId,
            action: 'instance.disconnected',
            entityType: 'whatsapp_instance',
            entityId: instance.id,
            metadata: { reason: String(data.statusReason ?? '') || 'Disconnected' },
          },
        });
      }

      logger.info({ instanceName, status }, 'Instance connection updated via webhook');
      return;
    }

    if (event === 'QRCODE_UPDATED') {
      if (instance.status !== 'connecting') {
        await prisma.whatsAppInstance.update({
          where: { id: instance.id },
          data: { status: 'connecting' },
        });
      }
      return;
    }

    if (event === 'MESSAGES_UPDATE' || event === 'SEND_MESSAGE' || event === 'MESSAGES_UPSERT') {
      const messageId = extractMessageId(data);
      const status = mapDeliveryStatus(data.status ?? data.ack ?? data.update);
      if (!messageId || !status) {
        logger.debug({ instanceName, event, messageId, raw: data.status }, 'Unusable delivery receipt');
        return;
      }

      const matched = await applyDeliveryUpdate({ instanceName, messageId, status });
      if (!matched) {
        // Evolution reports on the whole number, including chats typed on the phone.
        logger.debug({ instanceName, messageId }, 'Receipt for a message we did not send');
      }
      return;
    }

    logger.debug({ instanceName, event }, 'Unhandled Evolution webhook event');
  }),
);
