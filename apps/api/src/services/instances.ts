import type { InstanceStatus, Organization, WhatsAppInstance } from '@prisma/client';
import QRCode from 'qrcode';
import { prisma } from '../db';
import { env } from '../env';
import { badRequest, notFound } from '../errors';
import { evolution, EvolutionError, type EvolutionState } from '../lib/evolution';
import { logger } from '../logger';
import { buildInstanceName } from './organizations';

/** Where Evolution should post delivery/connection events (Phase 6 consumes them). */
export const webhookUrlFor = (instanceName: string) =>
  `${env.PUBLIC_API_URL.replace(/\/+$/, '')}/api/v1/webhooks/evolution/${instanceName}`;

const STATUS_BY_STATE: Record<EvolutionState, InstanceStatus> = {
  open: 'connected',
  connecting: 'connecting',
  close: 'disconnected',
  unknown: 'provisioned',
};

/** Public view of an instance — never exposes the instance API key. */
export function instanceView(instance: WhatsAppInstance | null) {
  if (!instance) {
    return { status: 'not_provisioned' as InstanceStatus, phoneNumber: null, lastConnectedAt: null };
  }
  return {
    id: instance.id,
    status: instance.status,
    phoneNumber: instance.phoneNumber,
    lastConnectedAt: instance.lastConnectedAt,
    lastError: instance.lastError,
    evolutionInstanceName: instance.evolutionInstanceName,
    maxPerMinute: instance.maxPerMinute,
    maxPerDay: instance.maxPerDay,
  };
}

export async function getInstance(organizationId: string): Promise<WhatsAppInstance | null> {
  return prisma.whatsAppInstance.findUnique({ where: { organizationId } });
}

export async function requireInstance(organizationId: string): Promise<WhatsAppInstance> {
  const instance = await getInstance(organizationId);
  if (!instance) throw notFound('This organization has no WhatsApp instance yet');
  return instance;
}

async function recordError(instance: WhatsAppInstance, err: unknown): Promise<WhatsAppInstance> {
  const message = err instanceof Error ? err.message : String(err);
  return prisma.whatsAppInstance.update({
    where: { id: instance.id },
    data: {
      // A server we cannot reach says nothing about the pairing, so the status is
      // left alone and only the error surfaces; a real API rejection is a fault.
      status: err instanceof EvolutionError && err.isTransport ? instance.status : 'error',
      lastError: message.slice(0, 500),
    },
  });
}

/**
 * Creates the instance on the Evolution server and stores its name/key against the
 * organization. Idempotent: an instance name that already exists there is adopted
 * rather than treated as a failure, so a retried provision converges.
 */
export async function provisionInstance(
  org: Organization,
  options: { force?: boolean } = {},
): Promise<WhatsAppInstance> {
  if (!evolution.isConfigured) {
    throw badRequest('Evolution API is not configured (set EVOLUTION_API_URL and EVOLUTION_API_KEY)');
  }

  let instance = await getInstance(org.id);
  // A failed attempt leaves nothing on the Evolution server, so both of those
  // states mean "there is no instance yet" and a retry must actually retry.
  const needsProvisioning =
    !instance || instance.status === 'not_provisioned' || instance.status === 'error';
  if (instance && !needsProvisioning && !options.force) {
    return instance;
  }

  const instanceName = instance?.evolutionInstanceName ?? buildInstanceName(org.name);

  try {
    const created = await evolution.createInstance(instanceName, {
      webhookUrl: webhookUrlFor(instanceName),
    });

    const data = {
      evolutionInstanceName: created.instanceName,
      apiKey: created.apiKey ?? null,
      status: 'provisioned' as InstanceStatus,
      lastError: null,
    };

    instance = instance
      ? await prisma.whatsAppInstance.update({ where: { id: instance.id }, data })
      : await prisma.whatsAppInstance.create({ data: { organizationId: org.id, ...data } });

    return instance;
  } catch (err) {
    // Evolution rejects a duplicate name with 403/409 — that instance is ours from
    // a previous attempt, so adopt it and let the status refresh sort out its state.
    const isDuplicate = err instanceof EvolutionError && [403, 409].includes(err.status);
    if (isDuplicate) {
      logger.info({ instanceName }, 'Evolution instance already exists — adopting it');
      const data = { evolutionInstanceName: instanceName, status: 'provisioned' as InstanceStatus, lastError: null };
      instance = instance
        ? await prisma.whatsAppInstance.update({ where: { id: instance.id }, data })
        : await prisma.whatsAppInstance.create({ data: { organizationId: org.id, ...data } });
      return instance;
    }

    // Creation failed, so nothing exists on the Evolution server: the instance is
    // not provisioned rather than broken, and lastError says why. Recording it as
    // 'error' would make a later retry look like an already-working instance.
    if (instance) {
      await prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: {
          status: 'not_provisioned',
          lastError: (err instanceof Error ? err.message : String(err)).slice(0, 500),
        },
      });
    }
    throw err;
  }
}

/** Best-effort provisioning used when an organization is created: never blocks onboarding. */
export async function tryProvisionInstance(org: Organization): Promise<void> {
  if (!evolution.isConfigured) {
    logger.warn({ orgId: org.id }, 'Evolution API not configured — instance left unprovisioned');
    return;
  }
  try {
    await provisionInstance(org);
  } catch (err) {
    logger.warn({ err, orgId: org.id }, 'Auto-provisioning the WhatsApp instance failed');
  }
}

export interface ConnectPayload {
  status: InstanceStatus;
  /** QR image as a data URI, ready for <img src>. Absent once connected. */
  qrDataUrl: string | null;
  pairingCode: string | null;
  phoneNumber: string | null;
}

/**
 * Asks Evolution for a fresh QR. Evolution returns either a rendered image or the
 * raw QR payload depending on version, so the payload is rendered here when needed
 * and the UI only ever deals with an image.
 */
export async function connectInstance(org: Organization): Promise<ConnectPayload> {
  let instance = await requireInstance(org.id);
  if (instance.status === 'not_provisioned') instance = await provisionInstance(org);

  try {
    const state = await evolution.connectionState(instance.evolutionInstanceName, instance.apiKey ?? undefined);
    if (state === 'open') {
      const refreshed = await refreshInstanceStatus(org.id);
      return {
        status: refreshed.status,
        qrDataUrl: null,
        pairingCode: null,
        phoneNumber: refreshed.phoneNumber,
      };
    }

    const result = await evolution.connect(instance.evolutionInstanceName, instance.apiKey ?? undefined);
    const qrDataUrl = result.base64
      ? result.base64.startsWith('data:')
        ? result.base64
        : `data:image/png;base64,${result.base64}`
      : result.code
        ? await QRCode.toDataURL(result.code, { margin: 1, width: 320 })
        : null;

    const updated = await prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: { status: 'connecting', lastError: null },
    });

    return {
      status: updated.status,
      qrDataUrl,
      pairingCode: result.pairingCode ?? null,
      phoneNumber: updated.phoneNumber,
    };
  } catch (err) {
    await recordError(instance, err);
    throw err;
  }
}

/**
 * Reconciles our record with the Evolution server. Called by the connect screen's
 * poll, so it must be cheap and must never throw for a transport blip — an
 * unreachable server is reported through lastError, not a failed request.
 */
export async function refreshInstanceStatus(organizationId: string): Promise<WhatsAppInstance> {
  const instance = await requireInstance(organizationId);
  if (instance.status === 'not_provisioned' || !evolution.isConfigured) return instance;

  try {
    const details = await evolution.fetchInstance(
      instance.evolutionInstanceName,
      instance.apiKey ?? undefined,
    );

    let state = details.state;
    if (state === 'unknown') {
      // fetchInstances is the only source of the owner number but the least
      // consistent about state; fall back to the dedicated endpoint.
      state = await evolution.connectionState(instance.evolutionInstanceName, instance.apiKey ?? undefined);
    }

    const status = STATUS_BY_STATE[state];
    return prisma.whatsAppInstance.update({
      where: { id: instance.id },
      data: {
        status,
        phoneNumber: details.phoneNumber ?? instance.phoneNumber,
        lastConnectedAt: status === 'connected' ? new Date() : instance.lastConnectedAt,
        lastError: status === 'connected' ? null : instance.lastError,
      },
    });
  } catch (err) {
    if (err instanceof EvolutionError && err.isNotFound) {
      // The instance is gone from the Evolution server — surface that plainly so an
      // admin re-provisions instead of waiting on a QR that will never arrive.
      return prisma.whatsAppInstance.update({
        where: { id: instance.id },
        data: { status: 'not_provisioned', lastError: 'Instance no longer exists on the Evolution server' },
      });
    }
    return recordError(instance, err);
  }
}

/** Ends the WhatsApp session but keeps the instance, ready for a new QR scan. */
export async function logoutInstance(organizationId: string): Promise<WhatsAppInstance> {
  const instance = await requireInstance(organizationId);
  try {
    await evolution.logout(instance.evolutionInstanceName, instance.apiKey ?? undefined);
  } catch (err) {
    // A logout against an already-closed session is not a failure worth blocking on.
    if (!(err instanceof EvolutionError && (err.isNotFound || err.status === 400))) {
      await recordError(instance, err);
      throw err;
    }
  }

  return prisma.whatsAppInstance.update({
    where: { id: instance.id },
    data: { status: 'disconnected', phoneNumber: null, lastError: null },
  });
}

/** Deletes the instance on Evolution and resets our record (super admin only). */
export async function deprovisionInstance(organizationId: string): Promise<WhatsAppInstance> {
  const instance = await requireInstance(organizationId);
  try {
    await evolution.deleteInstance(instance.evolutionInstanceName, instance.apiKey ?? undefined);
  } catch (err) {
    if (!(err instanceof EvolutionError && err.isNotFound)) throw err;
  }

  return prisma.whatsAppInstance.update({
    where: { id: instance.id },
    data: { status: 'not_provisioned', phoneNumber: null, apiKey: null, lastError: null },
  });
}
