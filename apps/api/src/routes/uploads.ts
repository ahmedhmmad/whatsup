import { randomUUID } from 'crypto';
import { existsSync, mkdirSync } from 'fs';
import path from 'path';
import { Router } from 'express';
import multer from 'multer';
import { asyncHandler, badRequest, forbidden, notFound } from '../errors';
import { requireAuth, requireOrg } from '../middleware/auth';

export const uploadsRouter = Router();

uploadsRouter.use(requireAuth, requireOrg);

export const UPLOAD_ROOT = path.resolve(process.cwd(), 'uploads');

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const DOCUMENT_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
];

/**
 * Attachments are stored per organization, under a generated name — an uploaded
 * filename never reaches the filesystem, so it cannot escape the tenant directory.
 */
const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(UPLOAD_ROOT, req.org!.id);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 10).replace(/[^.\w]/g, '');
    cb(null, `${randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 16 * 1024 * 1024, files: 1 },
  fileFilter(_req, file, cb) {
    if ([...IMAGE_TYPES, ...DOCUMENT_TYPES].includes(file.mimetype)) cb(null, true);
    else cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

uploadsRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('No file uploaded');

    res.status(201).json({
      type: IMAGE_TYPES.includes(req.file.mimetype) ? 'image' : 'document',
      url: `/api/v1/uploads/${req.org!.id}/${req.file.filename}`,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      sizeBytes: req.file.size,
    });
  }),
);

uploadsRouter.get(
  '/:orgId/:fileName',
  asyncHandler(async (req, res) => {
    // Serving is tenant-checked: the path's org must be the caller's org.
    if (req.params.orgId !== req.org!.id) throw forbidden();

    const fileName = path.basename(req.params.fileName);
    const filePath = path.join(UPLOAD_ROOT, req.org!.id, fileName);
    if (!filePath.startsWith(path.join(UPLOAD_ROOT, req.org!.id)) || !existsSync(filePath)) {
      throw notFound('File not found');
    }

    res.sendFile(filePath);
  }),
);
