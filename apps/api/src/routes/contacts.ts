import { Router, type Request } from 'express';
import { z } from 'zod';
import { validateCustomFields, getOrgTypeConfig } from '@sendwhats/shared';
import { prisma } from '../db';
import { asyncHandler, badRequest, notFound } from '../errors';
import { audit } from '../lib/audit';
import { normalizeAndValidate } from '../lib/phone';
import { requireAuth, requireOrg } from '../middleware/auth';
import { getQuery, validateBody, validateQuery } from '../middleware/validate';
import { buildContactWhere } from '../services/contactQuery';

export const contactsRouter = Router();

contactsRouter.use(requireAuth, requireOrg);

const listQuerySchema = z
  .object({
    page: z.coerce.number().min(1).default(1),
    pageSize: z.coerce.number().min(1).max(200).default(50),
    search: z.string().optional(),
    groupId: z.string().optional(),
    ungrouped: z.coerce.boolean().optional(),
    includeInactive: z.coerce.boolean().optional(),
    orgId: z.string().optional(),
  })
  // Custom-field filters arrive as ?cf.gender=female
  .passthrough();

contactsRouter.get(
  '/',
  validateQuery(listQuerySchema),
  asyncHandler(async (req, res) => {
    const q = getQuery<z.infer<typeof listQuerySchema>>(req);
    const customFieldFilters: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(q)) {
      if (!key.startsWith('cf.')) continue;
      customFieldFilters[key.slice(3)] = Array.isArray(value) ? (value as string[]) : [String(value)];
    }

    const where = buildContactWhere(req.org!.id, {
      groupIds: q.groupId ? [q.groupId] : undefined,
      ungroupedOnly: q.ungrouped,
      search: q.search,
      includeInactive: q.includeInactive,
      customFieldFilters,
    });

    const [items, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { fullName: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { group: { select: { id: true, name: true } } },
      }),
      prisma.contact.count({ where }),
    ]);

    res.json({ items, total, page: q.page, pageSize: q.pageSize });
  }),
);

const contactSchema = z.object({
  fullName: z.string().min(1).max(160),
  phone: z.string().max(40).optional().nullable(),
  groupId: z.string().optional().nullable(),
  status: z.enum(['active', 'inactive']).default('active'),
  consentConfirmed: z.boolean().default(true),
  customFields: z.record(z.unknown()).default({}),
  externalId: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

type ContactInput = z.infer<typeof contactSchema>;

/** Validates phone + custom fields against the org's type schema; throws on any error. */
async function prepareContactData(req: Request, input: Partial<ContactInput>) {
  const org = req.org!;
  const config = getOrgTypeConfig(org.type);
  const errors: { key: string; message: string }[] = [];

  let phone: string | null | undefined;
  if (input.phone !== undefined) {
    if (!input.phone) {
      phone = null;
    } else {
      const result = normalizeAndValidate(input.phone, org.countryCode);
      if (!result.ok) errors.push({ key: 'phone', message: result.reason });
      else phone = result.digits;
    }
  }

  let customFields: Record<string, unknown> | undefined;
  if (input.customFields !== undefined) {
    const validated = validateCustomFields(org.type, input.customFields);
    errors.push(...validated.errors);
    customFields = validated.values;

    // Normalize every phone-typed custom field (e.g. guardian_phone) the same way.
    for (const field of config.customFields) {
      if (field.type !== 'phone') continue;
      const raw = customFields[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      const result = normalizeAndValidate(String(raw), org.countryCode);
      if (!result.ok) errors.push({ key: field.key, message: `${field.label}: ${result.reason}` });
      else customFields[field.key] = result.digits;
    }
  }

  if (input.groupId) {
    const group = await prisma.group.findFirst({
      where: { id: input.groupId, organizationId: org.id },
    });
    if (!group) errors.push({ key: 'groupId', message: 'Group does not belong to this organization' });
  }

  if (errors.length) throw badRequest('Contact validation failed', errors);
  return { phone, customFields };
}

contactsRouter.post(
  '/',
  validateBody(contactSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as ContactInput;
    const { phone, customFields } = await prepareContactData(req, input);

    const contact = await prisma.contact.create({
      data: {
        organizationId: req.org!.id,
        groupId: input.groupId || null,
        fullName: input.fullName,
        phone: phone ?? null,
        status: input.status,
        consentConfirmed: input.consentConfirmed,
        customFields: (customFields ?? {}) as object,
        externalId: input.externalId || null,
        notes: input.notes || null,
      },
      include: { group: { select: { id: true, name: true } } },
    });

    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'contact.created',
      entityType: 'contact',
      entityId: contact.id,
    });
    res.status(201).json(contact);
  }),
);

contactsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const contact = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
      include: { group: { select: { id: true, name: true } } },
    });
    if (!contact) throw notFound('Contact not found');
    res.json(contact);
  }),
);

contactsRouter.patch(
  '/:id',
  validateBody(contactSchema.partial()),
  asyncHandler(async (req, res) => {
    const input = req.body as Partial<ContactInput>;
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Contact not found');

    // Custom fields are merged, not replaced, so a partial edit can't drop stored data.
    const merged =
      input.customFields === undefined
        ? undefined
        : { ...(existing.customFields as Record<string, unknown>), ...input.customFields };
    const { phone, customFields } = await prepareContactData(req, { ...input, customFields: merged });

    const contact = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        fullName: input.fullName,
        phone: input.phone === undefined ? undefined : (phone ?? null),
        groupId: input.groupId === undefined ? undefined : input.groupId || null,
        status: input.status,
        consentConfirmed: input.consentConfirmed,
        customFields: customFields as object | undefined,
        externalId: input.externalId === undefined ? undefined : input.externalId || null,
        notes: input.notes === undefined ? undefined : input.notes || null,
      },
      include: { group: { select: { id: true, name: true } } },
    });
    res.json(contact);
  }),
);

contactsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.contact.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Contact not found');

    await prisma.contact.delete({ where: { id: existing.id } });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'contact.deleted',
      entityType: 'contact',
      entityId: existing.id,
      metadata: { fullName: existing.fullName },
    });
    res.status(204).end();
  }),
);

const bulkSchema = z.object({
  contactIds: z.array(z.string()).min(1).max(1000),
  action: z.enum(['delete', 'activate', 'deactivate', 'move']),
  groupId: z.string().optional().nullable(),
});

contactsRouter.post(
  '/bulk',
  validateBody(bulkSchema),
  asyncHandler(async (req, res) => {
    const { contactIds, action, groupId } = req.body as z.infer<typeof bulkSchema>;
    // Ids are scoped to the tenant before anything is written.
    const scoped = { id: { in: contactIds }, organizationId: req.org!.id };

    let affected = 0;
    if (action === 'delete') {
      affected = (await prisma.contact.deleteMany({ where: scoped })).count;
    } else if (action === 'move') {
      if (groupId) {
        const group = await prisma.group.findFirst({
          where: { id: groupId, organizationId: req.org!.id },
        });
        if (!group) throw badRequest('Group does not belong to this organization');
      }
      affected = (
        await prisma.contact.updateMany({ where: scoped, data: { groupId: groupId ?? null } })
      ).count;
    } else {
      affected = (
        await prisma.contact.updateMany({
          where: scoped,
          data: { status: action === 'activate' ? 'active' : 'inactive' },
        })
      ).count;
    }

    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: `contact.bulk_${action}`,
      metadata: { affected },
    });
    res.json({ affected });
  }),
);
