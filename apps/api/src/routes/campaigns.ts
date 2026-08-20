import { Router } from 'express';
import { z } from 'zod';
import type { TargetFilter } from '@sendwhats/shared';
import { prisma } from '../db';
import { asyncHandler, badRequest, notFound } from '../errors';
import { audit } from '../lib/audit';
import { requireAuth, requireOrg } from '../middleware/auth';
import { getQuery, validateBody, validateQuery } from '../middleware/validate';
import { audienceSummary, resolveAudience } from '../services/recipients';

export const campaignsRouter = Router();

campaignsRouter.use(requireAuth, requireOrg);

const targetFilterSchema = z.object({
  mode: z.enum(['all', 'groups', 'manual']),
  groupIds: z.array(z.string()).optional(),
  customFieldFilters: z.record(z.array(z.string())).optional(),
  contactIds: z.array(z.string()).optional(),
  search: z.string().optional(),
  includeInactive: z.boolean().optional(),
});

const attachmentSchema = z.object({
  type: z.enum(['image', 'document']),
  url: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().optional(),
});

const previewSchema = z.object({
  targetFilter: targetFilterSchema,
  messageText: z.string().default(''),
  templateId: z.string().nullable().optional(),
  dedupeByPhone: z.boolean().optional(),
  /** How many rendered rows to return for the preview list. */
  sampleSize: z.number().int().min(1).max(50).default(5),
});

async function loadTemplate(organizationId: string, templateId?: string | null) {
  if (templateId) {
    const template = await prisma.messageTemplate.findFirst({
      where: { id: templateId, organizationId },
    });
    if (!template) throw badRequest('Template not found in this organization');
    return template;
  }
  return prisma.messageTemplate.findFirst({
    where: { organizationId, isDefault: true },
  });
}

/**
 * Live recipient count and personalized preview for the composer.
 * Resolves the same way the draft will, so the number shown is the number sent.
 */
campaignsRouter.post(
  '/preview',
  validateBody(previewSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof previewSchema>;
    const template = await loadTemplate(req.org!.id, input.templateId);

    const audience = await resolveAudience(req.org!, {
      filter: input.targetFilter as TargetFilter,
      messageText: input.messageText,
      template,
      dedupeByPhone: input.dedupeByPhone,
      limit: input.sampleSize,
    });

    res.json({
      summary: audienceSummary(audience),
      sample: audience.recipients,
      // Only the first few skips are listed; the summary carries the full counts.
      skippedSample: audience.skipped.slice(0, 20),
      mergeTarget: audience.mergeTarget,
      templateBody: audience.templateBody,
      template: template ? { id: template.id, name: template.name } : null,
    });
  }),
);

const createSchema = z.object({
  name: z.string().max(160).optional(),
  messageText: z.string().min(1, 'A message is required'),
  templateId: z.string().nullable().optional(),
  targetFilter: targetFilterSchema,
  attachments: z.array(attachmentSchema).max(5).default([]),
  dedupeByPhone: z.boolean().optional(),
});

/**
 * Creates a draft campaign with its recipient list already resolved into MessageJob
 * rows — the exact numbers and rendered texts the admin reviewed. Nothing sends:
 * Phase 5 picks these rows up and pushes them to the queue.
 */
campaignsRouter.post(
  '/',
  validateBody(createSchema),
  asyncHandler(async (req, res) => {
    const input = req.body as z.infer<typeof createSchema>;
    const template = await loadTemplate(req.org!.id, input.templateId);

    const audience = await resolveAudience(req.org!, {
      filter: input.targetFilter as TargetFilter,
      messageText: input.messageText,
      template,
      dedupeByPhone: input.dedupeByPhone,
    });

    if (audience.total === 0) {
      throw badRequest('This selection resolves to no reachable recipients', {
        summary: audienceSummary(audience),
      });
    }

    const campaign = await prisma.campaign.create({
      data: {
        organizationId: req.org!.id,
        name: input.name || null,
        messageText: input.messageText,
        templateId: template?.id ?? null,
        attachments: input.attachments as object,
        targetFilter: input.targetFilter as object,
        status: 'draft',
        createdById: req.auth!.sub,
        totalRecipients: audience.total,
        jobs: {
          create: audience.recipients.map((recipient) => ({
            contactId: recipient.contactId,
            phone: recipient.phone,
            renderedText: recipient.renderedText,
            status: 'queued' as const,
          })),
        },
      },
      include: { _count: { select: { jobs: true } } },
    });

    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'campaign.drafted',
      entityType: 'campaign',
      entityId: campaign.id,
      metadata: { recipients: audience.total, skipped: audience.skipped.length },
    });

    res.status(201).json({ campaign, summary: audienceSummary(audience) });
  }),
);

campaignsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const campaigns = await prisma.campaign.findMany({
      where: { organizationId: req.org!.id },
      orderBy: { createdAt: 'desc' },
      include: {
        template: { select: { id: true, name: true } },
        createdBy: { select: { id: true, email: true, name: true } },
        _count: { select: { jobs: true } },
      },
    });
    res.json({ items: campaigns });
  }),
);

const jobsQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(200).default(50),
  status: z.string().optional(),
});

campaignsRouter.get(
  '/:id',
  validateQuery(jobsQuerySchema),
  asyncHandler(async (req, res) => {
    const q = getQuery<z.infer<typeof jobsQuerySchema>>(req);
    const campaign = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
      include: {
        template: { select: { id: true, name: true, body: true, mergeTarget: true } },
        createdBy: { select: { id: true, email: true, name: true } },
      },
    });
    if (!campaign) throw notFound('Campaign not found');

    const where = {
      campaignId: campaign.id,
      ...(q.status ? { status: q.status as never } : {}),
    };
    const [jobs, total, grouped] = await Promise.all([
      prisma.messageJob.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (q.page - 1) * q.pageSize,
        take: q.pageSize,
        include: { contact: { select: { id: true, fullName: true } } },
      }),
      prisma.messageJob.count({ where }),
      prisma.messageJob.groupBy({
        by: ['status'],
        where: { campaignId: campaign.id },
        _count: { _all: true },
      }),
    ]);

    res.json({
      campaign,
      counts: Object.fromEntries(grouped.map((row) => [row.status, row._count._all])),
      jobs: { items: jobs, total, page: q.page, pageSize: q.pageSize },
    });
  }),
);

const updateSchema = z.object({
  name: z.string().max(160).nullable().optional(),
  messageText: z.string().min(1).optional(),
  attachments: z.array(attachmentSchema).max(5).optional(),
});

/** Drafts only: once a campaign has been handed to the queue its jobs are frozen. */
campaignsRouter.patch(
  '/:id',
  validateBody(updateSchema),
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Campaign not found');
    if (existing.status !== 'draft') throw badRequest('Only draft campaigns can be edited');

    const input = req.body as z.infer<typeof updateSchema>;
    const campaign = await prisma.campaign.update({
      where: { id: existing.id },
      data: {
        name: input.name === undefined ? undefined : input.name,
        messageText: input.messageText,
        attachments: input.attachments as object | undefined,
      },
    });

    // The stored jobs carry the text that was reviewed, so editing the message has
    // to re-render them or the two would disagree about what gets sent.
    if (input.messageText && input.messageText !== existing.messageText) {
      const template = await loadTemplate(req.org!.id, existing.templateId);
      const audience = await resolveAudience(req.org!, {
        filter: existing.targetFilter as unknown as TargetFilter,
        messageText: input.messageText,
        template,
      });
      await prisma.$transaction([
        prisma.messageJob.deleteMany({ where: { campaignId: campaign.id } }),
        prisma.messageJob.createMany({
          data: audience.recipients.map((recipient) => ({
            campaignId: campaign.id,
            contactId: recipient.contactId,
            phone: recipient.phone,
            renderedText: recipient.renderedText,
          })),
        }),
        prisma.campaign.update({
          where: { id: campaign.id },
          data: { totalRecipients: audience.total },
        }),
      ]);
    }

    res.json(campaign);
  }),
);

campaignsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const existing = await prisma.campaign.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!existing) throw notFound('Campaign not found');
    if (!['draft', 'completed', 'cancelled', 'failed'].includes(existing.status)) {
      throw badRequest('Pause or cancel this campaign before deleting it');
    }

    await prisma.campaign.delete({ where: { id: existing.id } });
    await audit({
      organizationId: req.org!.id,
      userId: req.auth!.sub,
      action: 'campaign.deleted',
      entityType: 'campaign',
      entityId: existing.id,
    });
    res.status(204).end();
  }),
);
