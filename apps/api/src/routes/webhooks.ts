import { Router } from 'express';
import type { InstanceStatus } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { jidToDigits } from '../lib/evolution';
import { logger } from '../logger';

export const webhooksRouter = Router();

/**
 * Receiver for the webhook registered at provisioning time.
 *
 * Phase 3 consumes the connection lifecycle only, so a number that drops overnight
 * is visible without anyone opening the connect screen. Message delivery events are
 * logged and left for Phase 6, which maps them onto MessageJob rows.
 *
 * Unauthenticated by design — Evolution posts here — so it is deliberately inert:
 * it looks the instance up by name and only ever writes connection state.
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
        state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : state === 'close' ? 'disconnected' : null;
      if (!status) return;

      const phoneNumber = jidToDigits(data.wuid ?? data.ownerJid ?? data.number);
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status,
          phoneNumber: phoneNumber ?? instance.phoneNumber,
          lastConnectedAt: status === 'connected' ? new Date() : instance.lastConnectedAt,
          lastError:
            status === 'disconnected' ? (String(data.statusReason ?? '') || 'Disconnected') : null,
        },
      });
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

    logger.debug({ instanceName, event }, 'Unhandled Evolution webhook event');
  }),
);
