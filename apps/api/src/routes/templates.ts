import { Router } from 'express';
import { z } from 'zod';
import { getOrgTypeConfig, renderTemplate, templatePlaceholders } from '@sendwhats/shared';
import { prisma } from '../db';
import { asyncHandler, badRequest, notFound } from '../errors';
import { requireAuth, requireOrg } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

export const templatesRouter = Router();

templatesRouter.use(requireAuth, requireOrg);

/** Placeholders an admin can use, given this organization's type. */
function availablePlaceholders(orgType: string) {
  const config = getOrgTypeConfig(orgType);
  return [
    { key: 'name', label: `${config.labels.contact} name` },
    { key: 'group', label: config.labels.group },
    { key: 'message', label: 'The campaign message' },
    ...config.customFields.map((field) => ({ key: field.key, label: field.label })),
  ];
}

templatesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const items = await prisma.messageTemplate.findMany({
      where: { organizationId: req.org!.id },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
    res.json({
      items,
      placeholders: availablePlaceholders(req.org!.type),
      mergeTargets: [
        { value: 'contact', label: `${getOrgTypeConfig(req.org!.type).labels.contact} phone` },
        ...getOrgTypeConfig(req.org!.type)
          .customFields.filter((f) => f.type === 'phone')
          .map((f) => ({ value: f.key, label: f.label })),
      ],
    });
  }),
);

const templateSchema = z.object({
  name: z.string().min(1).max(120),
  body: z.string().min(1).max(4000),
  mergeTarget: z.string().default('contact'),
  isDefault: z.boolean().default(false),
});

/** A merge target must be the contact's own phone or a phone-typed custom field. */
function assertMergeTarget(orgType: string, mergeTarget: string) {
  if (mergeTarget === 'contact') return;
  const field = getOrgTypeConfig(orgType).customFields.find((f) => f.key === mergeTarget);
  if (!field || field.type !== 'phone') {
    throw badRequest(`"${mergeTarget}" is not a phone field for this organization type`);
  }
}

templatesRouter.post(
  '/',
  validateBody(templateSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof templateSchema>;
    assertMergeTarget(req.org!.type, input.mergeTarget);

    const template = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.messageTemplate.updateMany({
          where: { organizationId: req.org!.id },
          data: { isDefault: false },
        });
      }
      return tx.messageTemplate.create({ data: { organizationId: req.org!.id, ...input } });
    });

    res.status(201).json(template);
  }),
);

templatesRouter.patch(
  '/:id',
  validateBody(templateSchema.partial()),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<z.infer<typeof templateSchema>>;
    const existing = await prisma.messageTemplate.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Template not found');
    if (input.mergeTarget) assertMergeTarget(req.org!.type, input.mergeTarget);

    const template = await prisma.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.messageTemplate.updateMany({
          where: { organizationId: req.org!.id },
          data: { isDefault: false },
        });
      }
      return tx.messageTemplate.update({ where: { id: existing.id }, data: input });
    });

    res.json(template);
  }),
);

templatesRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.messageTemplate.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Template not found');
    if (existing.isDefault) throw badRequest('Make another template the default before deleting this one');

    await prisma.messageTemplate.delete({ where: { id: existing.id } });
    res.status(204).end();
  }),
);

const renderSchema = z.object({
  body: z.string().max(4000),
  messageText: z.string().default(''),
  contactId: z.string().optional(),
});

/** Renders a template against a real contact so an admin can check it before saving. */
templatesRouter.post(
  '/render',
  validateBody(renderSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof renderSchema>;
    const contact = input.contactId
      ? await prisma.contact.findFirst({
          where: { id: input.contactId, organizationId: req.org!.id },
          include: { group: { select: { name: true } } },
        })
      : await prisma.contact.findFirst({
          where: { organizationId: req.org!.id, status: 'active' },
          include: { group: { select: { name: true } } },
          orderBy: { fullName: 'asc' },
        });

    const renderable = contact
      ? {
          fullName: contact.fullName,
          phone: contact.phone,
          customFields: contact.customFields as Record<string, unknown>,
          groupName: contact.group?.name ?? null,
        }
      : { fullName: 'Sample Contact', phone: null, customFields: {}, groupName: null };

    res.json({
      rendered: renderTemplate(input.body, renderable, input.messageText),
      placeholders: templatePlaceholders(input.body),
      basedOn: contact ? { id: contact.id, fullName: contact.fullName } : null,
    });
  }),
);
