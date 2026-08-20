import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { asyncHandler, notFound } from '../errors';
import { audit } from '../lib/audit';
import { requireAuth, requireOrg } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const groupsRouter = Router();

groupsRouter.use(requireAuth, requireOrg);

groupsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const groups = await prisma.group.findMany({
      where: { organizationId: req.org!.id },
      orderBy: { name: 'asc' },
      include: { _count: { select: { contacts: true } } },
    });
    res.json({
      items: groups.map((g) => ({
        id: g.id,
        name: g.name,
        description: g.description,
        contactCount: g._count.contacts,
        createdAt: g.createdAt,
      })),
    });
  }),
);

const groupSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional().nullable(),
});

groupsRouter.post(
  '/',
  validateBody(groupSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof groupSchema>;
    const group = await prisma.group.create({
      data: { organizationId: req.org!.id, name: input.name, description: input.description ?? null },
    });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'group.created',
      entityType: 'group',
      entityId: group.id,
      metadata: { name: group.name },
    });
    res.status(201).json(group);
  }),
);

groupsRouter.patch(
  '/:id',
  validateBody(groupSchema.partial()),
  asyncHandler(async (req, res) => {
    const existing = await prisma.group.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Group not found');

    const group = await prisma.group.update({
      where: { id: existing.id },
      data: req.body as z.infer<typeof groupSchema>,
    });
    res.json(group);
  }),
);

groupsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.group.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
      include: { _count: { select: { contacts: true } } },
    });
    if (!existing) throw notFound('Group not found');

    // Contacts survive their group (Contact.groupId is SetNull) so a deleted class
    // never silently takes its students with it.
    await prisma.group.delete({ where: { id: existing.id } });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'group.deleted',
      entityType: 'group',
      entityId: existing.id,
      metadata: { name: existing.name, orphanedContacts: existing._count.contacts },
    });
    res.status(204).end();
  }),
);
