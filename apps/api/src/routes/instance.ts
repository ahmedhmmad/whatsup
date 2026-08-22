import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { audit } from '../lib/audit';
import { requireAuth, requireOrg, requireOwner } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import {
  connectInstance,
  getInstance,
  instanceView,
  logoutInstance,
  provisionInstance,
  refreshInstanceStatus,
} from '../services/instances';

export const instanceRouter = Router();

instanceRouter.use(requireAuth, requireOrg);

/** Current stored state — cheap, no call to Evolution. */
instanceRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(instanceView(await getInstance(req.org!.id)));
  }),
);

/** Polled by the connect screen: reconciles with Evolution, then returns state. */
instanceRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    res.json(instanceView(await refreshInstanceStatus(req.org!.id)));
  }),
);

instanceRouter.post(
  '/connect',
  asyncHandler(async (req, res) => {
    const payload = await connectInstance(req.org!);
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'instance.connect_requested',
      entityType: 'whatsapp_instance',
    });
    res.json(payload);
  }),
);

instanceRouter.post(
  '/logout',
  requireOwner,
  asyncHandler(async (req, res) => {
    const instance = await logoutInstance(req.org!.id);
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'instance.logged_out',
      entityType: 'whatsapp_instance',
      entityId: instance.id,
    });
    res.json(instanceView(instance));
  }),
);

/**
 * Replacing a banned or rotated number: end the current session, then hand back a
 * fresh QR in one step so the admin isn't left in a half-connected state.
 */
instanceRouter.post(
  '/replace-number',
  requireOwner,
  asyncHandler(async (req, res) => {
    await logoutInstance(req.org!.id);
    const payload = await connectInstance(req.org!);
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'instance.number_replaced',
      entityType: 'whatsapp_instance',
    });
    res.json(payload);
  }),
);

/** Re-runs provisioning against Evolution — for an org onboarded while it was down. */
instanceRouter.post(
  '/provision',
  requireOwner,
  asyncHandler(async (req, res) => {
    const instance = await provisionInstance(req.org!, { force: false });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'instance.provisioned',
      entityType: 'whatsapp_instance',
      entityId: instance.id,
      metadata: { evolutionInstanceName: instance.evolutionInstanceName },
    });
    res.json(instanceView(instance));
  }),
);

const limitsSchema = z.object({
  maxPerMinute: z.number().int().min(1).max(60).nullable().optional(),
  maxPerDay: z.number().int().min(1).max(10000).nullable().optional(),
});

/** Per-instance send caps; the Phase 5 worker reads these before every batch. */
instanceRouter.patch(
  '/limits',
  requireOwner,
  validateBody(limitsSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof limitsSchema>;
    const instance = await prisma.whatsAppInstance.update({
      where: { organizationId: req.org!.id },
      data: { maxPerMinute: input.maxPerMinute, maxPerDay: input.maxPerDay },
    });
    res.json(instanceView(instance));
  }),
);
