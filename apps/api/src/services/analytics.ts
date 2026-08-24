import { prisma } from '../db';

/**
 * Campaign performance for an organization.
 *
 * Delivery and read counts come from Evolution's receipts, which only arrive once
 * the platform is reachable from the Evolution server. Until then those rates are
 * reported as unavailable rather than as zero — a school reading "0% delivered"
 * would reasonably conclude nothing arrived, which is not what the data says.
 */

export interface AnalyticsRange {
  /** Inclusive lower bound; defaults to 30 days back. */
  since: Date;
  until: Date;
}

export function resolveRange(days = 30): AnalyticsRange {
  const until = new Date();
  const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
  return { since, until };
}

export interface AnalyticsSummary {
  campaigns: number;
  messages: number;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  cancelled: number;
  pending: number;
  /** Percentages of messages that reached the provider, 0–100. */
  successRate: number | null;
  /** Null while no receipts have ever arrived — see the note above. */
  deliveryRate: number | null;
  readRate: number | null;
  receiptsSeen: boolean;
}

const pct = (part: number, whole: number): number | null =>
  whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

export async function getAnalytics(
  organizationId: string,
  range: AnalyticsRange,
  /**
   * Minutes ahead of UTC to report send hours in. "Best time to send" is only
   * meaningful in the reader's own clock — a Cairo school's 9am send would
   * otherwise be reported as 06:00.
   */
  utcOffsetMinutes = 0,
) {
  const window = { gte: range.since, lte: range.until };

  const [byStatus, campaigns, hourly, perCampaign, failures] = await Promise.all([
    prisma.messageJob.groupBy({
      by: ['status'],
      where: { campaign: { organizationId }, createdAt: window },
      _count: { _all: true },
    }),
    prisma.campaign.count({ where: { organizationId, createdAt: window } }),
    // Send hour vs. how often those messages were delivered — the raw material for
    // "best time to send". Grouped in SQL because the row count can be large.
    prisma.$queryRaw<{ hour: number; sent: bigint; delivered: bigint }[]>`
      -- Prisma binds the offset as bigint; make_interval needs an int.
      SELECT EXTRACT(HOUR FROM j.sent_at + make_interval(mins => ${utcOffsetMinutes}::int))::int AS hour,
             COUNT(*)::bigint AS sent,
             COUNT(*) FILTER (WHERE j.status IN ('delivered', 'read'))::bigint AS delivered
      FROM message_jobs j
      JOIN campaigns c ON c.id = j.campaign_id
      WHERE c.organization_id = ${organizationId}
        AND j.sent_at IS NOT NULL
        AND j.sent_at BETWEEN ${range.since} AND ${range.until}
      GROUP BY 1
      ORDER BY 1
    `,
    prisma.campaign.findMany({
      where: { organizationId, createdAt: window },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        name: true,
        status: true,
        createdAt: true,
        totalRecipients: true,
        sentCount: true,
        deliveredCount: true,
        failedCount: true,
      },
    }),
    // What actually goes wrong, most common first.
    prisma.$queryRaw<{ error: string; count: bigint }[]>`
      SELECT COALESCE(j.error, 'Unknown error') AS error, COUNT(*)::bigint AS count
      FROM message_jobs j
      JOIN campaigns c ON c.id = j.campaign_id
      WHERE c.organization_id = ${organizationId}
        AND j.status = 'failed'
        AND j.created_at BETWEEN ${range.since} AND ${range.until}
      GROUP BY 1
      ORDER BY count DESC
      LIMIT 10
    `,
  ]);

  const counts = Object.fromEntries(byStatus.map((row) => [row.status, row._count._all]));
  const delivered = (counts.delivered ?? 0) + (counts.read ?? 0);
  const read = counts.read ?? 0;
  const failed = counts.failed ?? 0;
  const cancelled = counts.cancelled ?? 0;
  const pending = (counts.queued ?? 0) + (counts.sending ?? 0);
  // Anything that reached the provider, whether or not a receipt came back.
  const sent = (counts.sent ?? 0) + delivered;
  const messages = sent + failed + cancelled + pending;
  const receiptsSeen = delivered > 0;

  const summary: AnalyticsSummary = {
    campaigns,
    messages,
    sent,
    delivered,
    read,
    failed,
    cancelled,
    pending,
    successRate: pct(sent, sent + failed),
    deliveryRate: receiptsSeen ? pct(delivered, sent) : null,
    readRate: receiptsSeen ? pct(read, sent) : null,
    receiptsSeen,
  };

  return {
    range,
    summary,
    byHour: hourly.map((row) => ({
      hour: row.hour,
      sent: Number(row.sent),
      delivered: Number(row.delivered),
      deliveryRate: receiptsSeen ? pct(Number(row.delivered), Number(row.sent)) : null,
    })),
    campaigns: perCampaign.map((campaign) => ({
      ...campaign,
      successRate: pct(campaign.sentCount, campaign.sentCount + campaign.failedCount),
      deliveryRate: receiptsSeen ? pct(campaign.deliveredCount, campaign.sentCount) : null,
    })),
    topFailures: failures.map((row) => ({ error: row.error, count: Number(row.count) })),
  };
}
