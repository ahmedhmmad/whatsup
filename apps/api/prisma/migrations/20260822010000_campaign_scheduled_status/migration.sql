-- Adds the `scheduled` campaign status used by Phase 7 scheduling.
--
-- Placed directly after `draft` so the enum reads in lifecycle order. Postgres 12+
-- allows ADD VALUE inside the transaction Prisma wraps a migration in, as long as the
-- new value is not also *used* in that same transaction — this migration only adds it.
ALTER TYPE "CampaignStatus" ADD VALUE IF NOT EXISTS 'scheduled' AFTER 'draft';
