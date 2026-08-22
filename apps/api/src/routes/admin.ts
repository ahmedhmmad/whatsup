import { Router } from 'express';
import { z } from 'zod';
import { ORG_TYPES, ORG_TYPE_VALUES, resolveOrgConfig } from '@sendwhats/shared';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { asyncHandler, badRequest, conflict, notFound } from '../errors';
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

const customFieldSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(40)
    // The key becomes a custom_fields JSON key and a spreadsheet column, so keep it
    // to something both can carry safely.
    .regex(/^[a-z][a-z0-9_]*$/, 'Use lowercase letters, numbers and underscores'),
  label: z.string().min(1).max(80),
  type: z.enum(['text', 'phone', 'select', 'number']),
  required: z.boolean().default(false),
  options: z.array(z.object({ value: z.string().min(1), label: z.string().min(1) })).optional(),
  filterable: z.boolean().optional(),
  isPhoneTarget: z.boolean().optional(),
  helpText: z.string().max(200).optional(),
});

const fieldSchemaSchema = z.object({
  labels: z
    .object({
      organization: z.string().min(1).max(40).optional(),
      group: z.string().min(1).max(40).optional(),
      groupPlural: z.string().min(1).max(40).optional(),
      contact: z.string().min(1).max(40).optional(),
      contactPlural: z.string().min(1).max(40).optional(),
    })
    .optional(),
  customFields: z.array(customFieldSchema).max(20).optional(),
  defaultMergeTarget: z.string().min(1).max(40).optional(),
  defaultTemplateBody: z.string().min(1).max(4000).optional(),
});

const updateOrgSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  countryCode: z.string().regex(/^\d{1,4}$/).optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
  /** null clears the override and returns the org to its built-in vertical. */
  fieldSchema: fieldSchemaSchema.nullable().optional(),
});

/** A merge target has to be a phone field that actually exists in the schema. */
function assertSchemaCoherent(schema: z.infer<typeof fieldSchemaSchema> | null | undefined) {
  if (!schema?.defaultMergeTarget || schema.defaultMergeTarget === 'contact') return;
  const field = schema.customFields?.find((f) => f.key === schema.defaultMergeTarget);
  if (!field || field.type !== 'phone') {
    throw badRequest(
      `defaultMergeTarget "${schema.defaultMergeTarget}" must name a phone field defined in customFields`,
    );
  }
}

adminRouter.patch(
  '/organizations/:id',
  validateBody(updateOrgSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as z.infer<typeof updateOrgSchema>;
    assertSchemaCoherent(data.fieldSchema);

    const org = await prisma.organization.update({
      where: { id: req.params.id },
      data: {
        ...data,
        settings: data.settings as object | undefined,
        fieldSchema:
          data.fieldSchema === undefined
            ? undefined
            : data.fieldSchema === null
              ? Prisma.DbNull
              : (data.fieldSchema as object),
      },
    });

    // Redefining the vertical has to re-point the default template too, or campaigns
    // keep addressing the old merge target and the new schema is only half applied.
    // A template someone has edited is left alone and reported instead of clobbered.
    let templateNote: string | undefined;
    if (data.fieldSchema !== undefined) {
      const resolved = resolveOrgConfig(org);
      const template = await prisma.messageTemplate.findFirst({
        where: { organizationId: org.id, isDefault: true },
      });

      if (template) {
        const untouched = ORG_TYPE_VALUES.some(
          (type) => ORG_TYPES[type as keyof typeof ORG_TYPES].defaultTemplateBody === template.body,
        );
        if (untouched) {
          await prisma.messageTemplate.update({
            where: { id: template.id },
            data: { body: resolved.defaultTemplateBody, mergeTarget: resolved.defaultMergeTarget },
          });
        } else if (template.mergeTarget !== resolved.defaultMergeTarget) {
          templateNote = `The default template "${template.name}" was edited, so it was left as-is — it still sends to "${template.mergeTarget}".`;
        }
      }
    }
    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'organization.updated',
      entityType: 'organization',
      entityId: org.id,
      metadata: data,
    });
    res.json({ ...org, templateNote });
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
