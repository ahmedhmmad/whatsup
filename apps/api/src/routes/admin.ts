import { Router } from 'express';
import { z } from 'zod';
import { ORG_TYPES, ORG_TYPE_VALUES } from '@sendwhats/shared';
import { prisma } from '../db';
import { asyncHandler, conflict, notFound } from '../errors';
import { audit } from '../lib/audit';
import { hashPassword } from '../lib/password';
import { requireAuth, requireRole } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { createOrganization } from '../services/organizations';
import {
  deprovisionInstance,
  instanceView,
  provisionInstance,
  refreshInstanceStatus,
  tryProvisionInstance,
} from '../services/instances';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('super_admin'));

adminRouter.get('/org-types', (_req, res) => {
  res.json({ items: Object.values(ORG_TYPES) });
});

adminRouter.get(
  '/organizations',
  asyncHandler(async (_req, res) => {
    const orgs = await prisma.organization.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        instance: true,
        _count: { select: { users: true, groups: true, contacts: true, campaigns: true } },
      },
    });
    res.json({ items: orgs });
  }),
);

const createOrgSchema = z.object({
  name: z.string().min(2).max(120),
  type: z.enum(ORG_TYPE_VALUES as [string, ...string[]]),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  owner: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().max(120).optional(),
  }),
});

adminRouter.post(
  '/organizations',
  validateBody(createOrgSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createOrgSchema>;

    const existingUser = await prisma.user.findUnique({
      where: { email: input.owner.email.toLowerCase() },
    });
    if (existingUser) throw conflict('A user with this email already exists');

    const { org, owner, instance } = await createOrganization({
      name: input.name,
      type: input.type as never,
      countryCode: input.countryCode,
      owner: input.owner,
    });

    // Provisioning talks to an external server; a slow or down Evolution must not
    // fail onboarding, so the org is created either way and the admin can retry.
    await tryProvisionInstance(org);
    const provisioned = await prisma.whatsAppInstance.findUnique({ where: { organizationId: org.id } });

    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'organization.created',
      entityType: 'organization',
      entityId: org.id,
      metadata: { type: org.type, ownerEmail: owner.email, instanceStatus: provisioned?.status },
    });

    res.status(201).json({
      organization: org,
      owner: { id: owner.id, email: owner.email, name: owner.name, role: owner.role },
      instance: instanceView(provisioned ?? instance),
    });
  }),
);

adminRouter.get(
  '/organizations/:id',
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({
      where: { id: req.params.id },
      include: {
        instance: true,
        users: { select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true } },
        _count: { select: { groups: true, contacts: true, campaigns: true } },
      },
    });
    if (!org) throw notFound('Organization not found');
    res.json(org);
  }),
);

const updateOrgSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});

adminRouter.patch(
  '/organizations/:id',
  validateBody(updateOrgSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof updateOrgSchema>;
    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: { ...data, settings: data.settings as object | undefined },
    });
    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: org.id,
      metadata: data,
    });
    res.json(org);
  }),
);

adminRouter.delete(
  '/organizations/:id',
  asyncHandler(async (req, res) => {
    await prisma.organization.delete({ where: { id: req.params.id } });
    await audit({
      userId: req.auth!.sub,
      action: 'organization.deleted',
      entityType: 'organization',
      entityId: req.params.id,
    });
    res.status(204).end();
  }),
);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().max(120).optional(),
  role: z.enum(['owner', 'staff']).default('staff'),
});

adminRouter.post(
  '/organizations/:id/users',
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createUserSchema>;
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound('Organization not found');

    const user = await prisma.user.create({
      data: {
        organizationId: org.id,
        email: input.email.toLowerCase(),
        passwordHash: await hashPassword(input.password),
        name: input.name ?? input.email.split('@')[0],
        role: input.role,
      },
      select: { id: true, email: true, name: true, role: true, isActive: true },
    });

    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: user.role },
    });

    res.status(201).json(user);
  }),
);

/** Re-runs provisioning for an organization onboarded while Evolution was unreachable. */
adminRouter.post(
  '/organizations/:id/instance/provision',
  asyncHandler(async (req, res) => {
    const org = await prisma.organization.findUnique({ where: { id: req.params.id } });
    if (!org) throw notFound('Organization not found');

    const force = req.query.force === 'true';
    const instance = await provisionInstance(org, { force });
    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'instance.provisioned',
      entityType: 'whatsapp_instance',
      entityId: instance.id,
      metadata: { evolutionInstanceName: instance.evolutionInstanceName, force },
    });
    res.json(instanceView(instance));
  }),
);

adminRouter.get(
  '/organizations/:id/instance/status',
  asyncHandler(async (req, res) => {
    res.json(instanceView(await refreshInstanceStatus(req.params.id)));
  }),
);

/** Removes the instance from the Evolution server entirely. */
adminRouter.delete(
  '/organizations/:id/instance',
  asyncHandler(async (req, res) => {
    const instance = await deprovisionInstance(req.params.id);
    await audit({
      organizationId: req.params.id,
      userId: req.auth!.sub,
      action: 'instance.deprovisioned',
      entityType: 'whatsapp_instance',
      entityId: instance.id,
    });
    res.json(instanceView(instance));
  }),
);
