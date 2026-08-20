import { prisma } from '../db';
import { logger } from '../logger';

export async function audit(entry: {
  organizationId?: string | null;
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: entry.organizationId ?? null,
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: (entry.metadata ?? {}) as object,
      },
    });
  } catch (err) {
    // Auditing must never break the request it is recording.
    logger.warn({ err, action: entry.action }, 'Failed to write audit log');
  }
}
