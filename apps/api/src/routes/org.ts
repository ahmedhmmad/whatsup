import { Router } from 'express';
import { prisma } from '../db';
import { asyncHandler } from '../errors';
import { orgContext, requireAuth, requireOrg } from '../middleware/auth';

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
