import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { getOrgTypeConfig } from '@sendwhats/shared';
import { prisma } from '../db';
import { asyncHandler, badRequest, notFound } from '../errors';
import { audit } from '../lib/audit';
import { requireAuth, requireOrg } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { commitImport, parseImportFile, type ParsedRow } from '../services/contactImport';
import { buildImportColumns } from '../services/importSchema';
import { buildImportTemplate } from '../services/importTemplate';

export const importsRouter = Router();

importsRouter.use(requireAuth, requireOrg);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
});

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** The columns this organization's sheet is expected to have — drives the preview UI. */
importsRouter.get(
  '/columns',
  asyncHandler(async (req, res) => {
    const columns = buildImportColumns(req.org!.type).map((c) => ({
      target: c.target,
      key: c.key ?? c.target,
      header: c.header,
      required: c.required,
      note: c.note,
    }));
    res.json({ columns, labels: getOrgTypeConfig(req.org!.type).labels });
  }),
);

importsRouter.get(
  '/template',
  asyncHandler(async (req, res) => {
    const org = req.org!;
    const groups = await prisma.group.findMany({
      where: { organizationId: org.id },
      orderBy: { name: 'asc' },
      select: { name: true },
    });

    const buffer = await buildImportTemplate(org.type, groups.map((g) => g.name));
    const fileName = `${org.name.replace(/[^\w-]+/g, '-').toLowerCase()}-import-template.xlsx`;

    res.setHeader('Content-Type', XLSX_MIME);
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.send(buffer);
  }),
);

/**
 * Parses an uploaded sheet and stores the validated result as a pending batch.
 * Nothing is written to contacts until the admin confirms the preview.
 */
importsRouter.post(
  '/preview',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const org = req.org!;
    if (!req.file) throw badRequest('No file uploaded');

    const defaultGroupId = (req.body?.groupId as string | undefined) || null;
    const createMissingGroups = req.body?.createMissingGroups !== 'false';

    const { rows, summary } = await parseImportFile(org, req.file.buffer, {
      defaultGroupId,
      createMissingGroups,
    });

    const batch = await prisma.importBatch.create({
      data: {
        organizationId: org.id,
        createdById: req.auth!.sub,
        fileName: req.file.originalname,
        defaultGroupId,
        createMissingGroups,
        summary: summary as object,
        rows: rows as unknown as object,
      },
      select: { id: true, fileName: true, createdAt: true },
    });

    res.status(201).json({ batch, summary, rows });
  }),
);

importsRouter.get(
  '/batches/:id',
  asyncHandler(async (req, res) => {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id },
    });
    if (!batch) throw notFound('Import batch not found');
    res.json(batch);
  }),
);

const commitSchema = z.object({
  /** Rows the admin unticked in the preview are left out. */
  excludeRowNumbers: z.array(z.number()).optional(),
});

importsRouter.post(
  '/batches/:id/commit',
  validateBody(commitSchema),
  asyncHandler(async (req, res) => {
    const org = req.org!;
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.id, organizationId: org.id },
    });
    if (!batch) throw notFound('Import batch not found');
    if (batch.status !== 'pending') {
      throw badRequest(`This import was already ${batch.status}`);
    }

    const excluded = new Set((req.body as z.infer<typeof commitSchema>).excludeRowNumbers ?? []);
    const rows = (batch.rows as unknown as ParsedRow[]).filter((r) => !excluded.has(r.rowNumber));

    const result = await commitImport(org, rows, batch.createMissingGroups);

    await prisma.importBatch.update({
      where: { id: batch.id },
      data: { status: 'committed', committedAt: new Date(), summary: { ...(batch.summary as object), result } },
    });

    await audit({
      organizationId: org.id,
      userId: req.auth!.sub,
      action: 'contacts.imported',
      entityType: 'import_batch',
      entityId: batch.id,
      metadata: { fileName: batch.fileName, ...result },
    });

    res.json(result);
  }),
);

importsRouter.post(
  '/batches/:id/cancel',
  asyncHandler(async (req, res) => {
    const batch = await prisma.importBatch.findFirst({
      where: { id: req.params.id, organizationId: req.org!.id, status: 'pending' },
    });
    if (!batch) throw notFound('Pending import batch not found');

    await prisma.importBatch.update({ where: { id: batch.id }, data: { status: 'cancelled' } });
    res.status(204).end();
  }),
);
