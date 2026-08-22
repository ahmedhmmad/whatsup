import type { NextFunction, Request, Response } from 'express';
import type { Organization } from '@prisma/client';
import type { UserRole } from '@sendwhats/shared';
import { getOrgTypeConfig } from '@sendwhats/shared';
import { prisma } from '../db';
import { forbidden, unauthorized, notFound, badRequest } from '../errors';
import { verifyToken, type TokenPayload } from '../lib/tokens';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: TokenPayload;
      org?: Organization;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next(unauthorized());
  try {
    req.auth = verifyToken(header.slice('Bearer '.length).trim());
    next();
  } catch {
    next(unauthorized('Invalid or expired token'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.auth) return next(unauthorized());
    if (!roles.includes(req.auth.role)) return next(forbidden());
    next();
  };
}

/**
 * Restricts an action to the organization's owner (a super admin acting on the org
 * is always allowed).
 *
 * Staff do the daily work — contacts, imports, composing and sending campaigns —
 * but the actions that can break the workspace for everyone else stay with the
 * owner: managing users, unlinking or replacing the WhatsApp number, and changing
 * the send limits that protect that number from a ban.
 */
export function requireOwner(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(unauthorized());
  if (req.auth.role === 'super_admin' || req.auth.role === 'owner') return next();
  next(forbidden('Only the organization owner can do this'));
}

/**
 * Resolves the tenant for org-scoped routes and hangs it off req.org.
 *
 * Org users are pinned to their own organization — an explicit orgId that isn't theirs
 * is rejected, so cross-tenant reads are impossible regardless of what a route does.
 * A super_admin may target any organization via ?orgId= or the X-Org-Id header.
 */
export async function requireOrg(req: Request, _res: Response, next: NextFunction) {
  try {
    if (!req.auth) throw unauthorized();

    const requested =
      (req.query.orgId as string | undefined) ??
      (req.headers['x-org-id'] as string | undefined) ??
      undefined;

    let orgId: string;
    if (req.auth.role === 'super_admin') {
      if (!requested) throw badRequest('Super admins must specify an organization (orgId)');
      orgId = requested;
    } else {
      if (!req.auth.organizationId) throw forbidden('User is not attached to an organization');
      if (requested && requested !== req.auth.organizationId) throw forbidden();
      orgId = req.auth.organizationId;
    }

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw notFound('Organization not found');
    if (!org.isActive && req.auth.role !== 'super_admin') throw forbidden('Organization is suspended');

    req.org = org;
    next();
  } catch (err) {
    next(err);
  }
}

export function orgContext(org: Organization) {
  const config = getOrgTypeConfig(org.type);
  return {
    id: org.id,
    name: org.name,
    type: org.type,
    countryCode: org.countryCode,
    labels: config.labels,
    customFields: config.customFields,
    defaultMergeTarget: config.defaultMergeTarget,
  };
}
