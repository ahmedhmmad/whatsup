import type { Prisma } from '@prisma/client';
import type { TargetFilter } from '@sendwhats/shared';

export interface ContactQueryOptions {
  groupIds?: string[];
  /** { gender: ['female'] } — values OR'd within a field, fields AND'd together. */
  customFieldFilters?: Record<string, string[]>;
  contactIds?: string[];
  search?: string;
  includeInactive?: boolean;
  ungroupedOnly?: boolean;
}

/**
 * Single place where a contact selection becomes a Prisma filter — used by the
 * contacts list, the campaign recipient preview and the queue's recipient resolution,
 * so what an admin sees in the UI is exactly what gets messaged.
 * organizationId is always applied: no caller can widen the query past its tenant.
 */
export function buildContactWhere(
  organizationId: string,
  opts: ContactQueryOptions,
): Prisma.ContactWhereInput {
  const and: Prisma.ContactWhereInput[] = [{ organizationId }];

  if (!opts.includeInactive) and.push({ status: 'active' });
  // An explicit list is honoured even when empty: "these groups" or "these contacts"
  // with nothing chosen means nobody, never everybody. Only `undefined` means
  // "no constraint" — the difference decides whether a send reaches one class or
  // the whole organization.
  if (opts.ungroupedOnly) and.push({ groupId: null });
  else if (opts.groupIds) and.push({ groupId: { in: opts.groupIds } });
  if (opts.contactIds) and.push({ id: { in: opts.contactIds } });

  if (opts.search?.trim()) {
    const search = opts.search.trim();
    and.push({
      OR: [
        { fullName: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search.replace(/\D/g, '') || search } },
      ],
    });
  }

  for (const [key, values] of Object.entries(opts.customFieldFilters ?? {})) {
    const clean = values.filter((v) => v !== undefined && v !== null && v !== '');
    if (!clean.length) continue;
    and.push({
      OR: clean.map((value) => ({
        customFields: { path: [key], equals: value },
      })),
    });
  }

  return { AND: and };
}

/** Translates a stored campaign TargetFilter into contact query options. */
export function targetFilterToQuery(filter: TargetFilter): ContactQueryOptions {
  switch (filter.mode) {
    case 'manual':
      return { contactIds: filter.contactIds ?? [], includeInactive: filter.includeInactive };
    case 'groups':
      return {
        groupIds: filter.groupIds ?? [],
        customFieldFilters: filter.customFieldFilters,
        search: filter.search,
        includeInactive: filter.includeInactive,
      };
    case 'all':
    default:
      return {
        customFieldFilters: filter.customFieldFilters,
        search: filter.search,
        includeInactive: filter.includeInactive,
      };
  }
}
