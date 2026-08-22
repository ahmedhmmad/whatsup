import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, badRequest, conflict, notFound } from '../errors';
import { audit } from '../lib/audit';
import { hashPassword } from '../lib/password';
import { orgContext, requireAuth, requireOrg, requireOwner } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const orgRouter = Router();

orgRouter.use(requireAuth, requireOrg);

/** Everything the admin UI needs to render itself for this org type. */
orgRouter.get(
  '/context',
  asyncHandler(async (req, res) => {
    const org = req.org!;
    const [groups, contacts, campaigns, instance, templates] = await Promise.all([
      prisma.group.count({ where: { organizationId: org.id } }),
      prisma.contact.count({ where: { organizationId: org.id } }),
      prisma.campaign.count({ where: { organizationId: org.id } }),
      prisma.whatsAppInstance.findUnique({
        where: { organizationId: org.id },
        select: { status: true, phoneNumber: true, lastConnectedAt: true },
      }),
      prisma.messageTemplate.findMany({
        where: { organizationId: org.id },
        orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
      }),
    ]);

    res.json({
      organization: orgContext(org),
      counts: { groups, contacts, campaigns },
      instance: instance ?? { status: 'not_provisioned', phoneNumber: null, lastConnectedAt: null },
      templates,
    });
  }),
);

orgRouter.get(
  '/users',
  asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
      where: { organizationId: req.org!.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, lastLoginAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ items: users });
  }),
);

const USER_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
} as const;

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().max(120).optional(),
  role: z.enum(['owner', 'staff']).default('staff'),
});

/** Owners add their own staff without going through the platform operator. */
orgRouter.post(
  '/users',
  requireOwner,
  validateBody(createUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createUserSchema>;
    const email = input.email.toLowerCase();

    if (await prisma.user.findUnique({ where: { email } })) {
      throw conflict('A user with this email already exists');
    }

    const user = await prisma.user.create({
      data: {
        organizationId: req.org!.id,
        email,
        passwordHash: await hashPassword(input.password),
        name: input.name ?? email.split('@')[0],
        role: input.role,
      },
      select: USER_FIELDS,
    });

    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'user.created',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: user.role, email: user.email },
    });

    res.status(201).json(user);
  }),
);

const updateUserSchema = z.object({
  name: z.string().max(120).optional(),
  role: z.enum(['owner', 'staff']).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

/** Loads a user and proves they belong to this organization. */
async function requireOrgUser(organizationId: string, id: string) {
  const user = await prisma.user.findFirst({ where: { id, organizationId } });
  if (!user) throw notFound('User not found in this organization');
  return user;
}

orgRouter.patch(
  '/users/:id',
  requireOwner,
  validateBody(updateUserSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof updateUserSchema>;
    const target = await requireOrgUser(req.org!.id, req.params.id);

    // Demoting or disabling the last owner would leave the workspace unmanageable.
    const losingOwner =
      target.role === 'owner' && (input.role === 'staff' || input.isActive === false);
    if (losingOwner) {
      const owners = await prisma.user.count({
        where: { organizationId: req.org!.id, role: 'owner', isActive: true },
      });
      if (owners <= 1) throw badRequest('This organization needs at least one active owner');
    }

    const user = await prisma.user.update({
      where: { id: target.id },
      data: {
        name: input.name,
        role: input.role,
        isActive: input.isActive,
        ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
      },
      select: USER_FIELDS,
    });

    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      metadata: { role: input.role, isActive: input.isActive, passwordReset: Boolean(input.password) },
    });

    res.json(user);
  }),
);

orgRouter.delete(
  '/users/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const target = await requireOrgUser(req.org!.id, req.params.id);
    if (target.id === req.auth!.sub) throw badRequest('You cannot remove your own account');

    if (target.role === 'owner') {
      const owners = await prisma.user.count({
        where: { organizationId: req.org!.id, role: 'owner', isActive: true },
      });
      if (owners <= 1) throw badRequest('This organization needs at least one active owner');
    }

    await prisma.user.delete({ where: { id: target.id } });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'user.deleted',
      entityType: 'user',
      entityId: target.id,
      metadata: { email: target.email },
    });

    res.status(204).end();
  }),
);
