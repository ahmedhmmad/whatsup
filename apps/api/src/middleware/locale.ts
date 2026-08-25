import type { NextFunction, Request, Response } from 'express';
import { DEFAULT_LOCALE, localeFromHeader, type Locale } from '@sendwhats/shared';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      locale: Locale;
    }
  }
}

/**
 * Resolves the language for this request.
 *
 * `?locale=` wins over Accept-Language so a link can be shared in a specific
 * language, and anything unrecognized falls back to English rather than failing —
 * a request should never be rejected over a preference.
 */
export function resolveLocale(req: Request, _res: Response, next: NextFunction) {
  const explicit = String(req.query.locale ?? '').toLowerCase();
  req.locale =
    explicit === 'ar' || explicit === 'en'
      ? (explicit as Locale)
      : localeFromHeader(req.headers['accept-language']);
  next();
}

export const localeOf = (req: Request): Locale => req.locale ?? DEFAULT_LOCALE;
