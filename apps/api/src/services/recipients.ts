import type { Contact, MessageTemplate, Organization } from '@prisma/client';
import {
  getOrgTypeConfig,
  renderTemplate,
  resolveTargetPhone,
  type TargetFilter,
} from '@sendwhats/shared';
import { prisma } from '../db';
import { buildContactWhere, targetFilterToQuery } from './contactQuery';

export type SkipReason = 'no_phone' | 'no_consent' | 'duplicate_number';

export interface ResolvedRecipient {
  contactId: string;
  fullName: string;
  groupName: string | null;
  /** Destination number, digits only — guardian_phone for schools, phone otherwise. */
  phone: string;
  renderedText: string;
}

export interface SkippedRecipient {
  contactId: string;
  fullName: string;
  reason: SkipReason;
  detail?: string;
}

export interface ResolvedAudience {
  /** Recipient rows — a sample when `limit` was used; `total` always counts them all. */
  recipients: ResolvedRecipient[];
  /** Every resolved recipient, regardless of `limit`. */
  total: number;
  skipped: SkippedRecipient[];
  /** Contacts matched by the filter, before exclusions. */
  matched: number;
  /** Distinct destination numbers across all recipients. */
  distinctNumbers: number;
  mergeTarget: string;
  templateBody: string;
}

const SKIP_LABELS: Record<SkipReason, string> = {
  no_phone: 'No destination number',
  no_consent: 'Consent not confirmed',
  duplicate_number: 'Same number as an earlier recipient',
};

export const skipLabel = (reason: SkipReason) => SKIP_LABELS[reason];

export interface ResolveOptions {
  filter: TargetFilter;
  messageText: string;
  template?: Pick<MessageTemplate, 'body' | 'mergeTarget'> | null;
  /**
   * Send at most one message per number. Off by default: for a school, two siblings
   * share a guardian number and each message names a different student, so collapsing
   * them would drop information the guardian needs.
   */
  dedupeByPhone?: boolean;
  /** Cap the returned rows; counts still reflect the whole audience. */
  limit?: number;
}

/**
 * Turns a target filter plus a message into the exact list of numbers and rendered
 * texts that would be sent.
 *
 * The composer preview, the draft campaign and (in Phase 5) the queue all call this,
 * so the count an admin approves is the count that goes out — and every exclusion is
 * reported rather than silently dropped.
 */
export async function resolveAudience(
  org: Organization,
  options: ResolveOptions,
): Promise<ResolvedAudience> {
  const config = getOrgTypeConfig(org.type);
  const mergeTarget = options.template?.mergeTarget ?? config.defaultMergeTarget;
  const templateBody = options.template?.body ?? '{{message}}';

  const where = buildContactWhere(org.id, targetFilterToQuery(options.filter));
  const contacts = await prisma.contact.findMany({
    where,
    orderBy: { fullName: 'asc' },
    include: { group: { select: { name: true } } },
  });

  const recipients: ResolvedRecipient[] = [];
  const skipped: SkippedRecipient[] = [];
  const seenNumbers = new Set<string>();

  for (const contact of contacts as (Contact & { group: { name: string } | null })[]) {
    const renderable = {
      fullName: contact.fullName,
      phone: contact.phone,
      customFields: contact.customFields as Record<string, unknown>,
      groupName: contact.group?.name ?? null,
    };

    const phone = resolveTargetPhone(renderable, mergeTarget);
    if (!phone) {
      const field = config.customFields.find((f) => f.key === mergeTarget);
      skipped.push({
        contactId: contact.id,
        fullName: contact.fullName,
        reason: 'no_phone',
        detail: field ? `${field.label} is empty` : 'No phone number',
      });
      continue;
    }

    if (!contact.consentConfirmed) {
      skipped.push({ contactId: contact.id, fullName: contact.fullName, reason: 'no_consent' });
      continue;
    }

    if (options.dedupeByPhone && seenNumbers.has(phone)) {
      skipped.push({ contactId: contact.id, fullName: contact.fullName, reason: 'duplicate_number' });
      continue;
    }
    seenNumbers.add(phone);

    recipients.push({
      contactId: contact.id,
      fullName: contact.fullName,
      groupName: renderable.groupName,
      phone,
      renderedText: renderTemplate(templateBody, renderable, options.messageText),
    });
  }

  return {
    recipients: options.limit ? recipients.slice(0, options.limit) : recipients,
    total: recipients.length,
    skipped,
    matched: contacts.length,
    distinctNumbers: new Set(recipients.map((r) => r.phone)).size,
    mergeTarget,
    templateBody,
  };
}

/** Summary counts for the composer's live recipient count. */
export function audienceSummary(audience: ResolvedAudience) {
  const bySkipReason = audience.skipped.reduce<Record<string, number>>((acc, item) => {
    acc[item.reason] = (acc[item.reason] ?? 0) + 1;
    return acc;
  }, {});

  return {
    matched: audience.matched,
    // Counts describe the whole audience even when only a sample was returned.
    recipients: audience.total,
    skipped: audience.skipped.length,
    bySkipReason,
    distinctNumbers: audience.distinctNumbers,
    /** How many messages would land on a number that also receives another message. */
    sharedNumbers: audience.total - audience.distinctNumbers,
  };
}
