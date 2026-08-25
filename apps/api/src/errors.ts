import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import { translateServerMessage } from '@sendwhats/shared';
import { localeOf } from './middleware/locale';
import { logger } from './logger';

export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);
export const unauthorized = (message = 'Authentication required') =>
  new AppError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this resource') =>
  new AppError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new AppError(404, 'not_found', message);
export const conflict = (message: string, details?: unknown) =>
  new AppError(409, 'conflict', message, details);

export function notFoundHandler(req: Request, res: Response) {
  res
    .status(404)
    .json({ error: { code: 'not_found', message: say(req, 'Route not found') } });
}

/** Translates a message into the requester's language, falling back to English. */
const say = (req: Request, message: string) => translateServerMessage(localeOf(req), message);

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: {
        code: err.code,
        message: say(req, err.message),
        // Field-level messages are what the form actually shows, so they are
        // translated too rather than leaving a bilingual error panel.
        details: Array.isArray(err.details)
          ? (err.details as { message?: string }[]).map((detail) =>
              detail && typeof detail.message === 'string'
                ? { ...detail, message: say(req, detail.message) }
                : detail,
            )
          : err.details,
      },
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        code: 'validation_error',
        message: say(req, 'Request validation failed'),
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: say(req, i.message) })),
      },
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = (err.meta?.target as string[] | undefined)?.join(', ') ?? 'field';
      return res.status(409).json({
        error: { code: 'conflict', message: say(req, `A record with this ${target} already exists`) },
      });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: { code: 'not_found', message: say(req, 'Not found') } });
    }
  }

  logger.error({ err }, 'Unhandled error');
  return res
    .status(500)
    .json({ error: { code: 'internal_error', message: say(req, 'Internal server error') } });
}

/** Wraps an async route handler so rejections reach the error middleware. */
export function asyncHandler<T extends Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req as T, res, next).catch(next);
  };
}
