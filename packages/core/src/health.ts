import { getRedis, getSendQueue } from './queue';

/**
 * Liveness signals for the queue side of the platform.
 *
 * The worker is a separate process, so "the API is up" says nothing about whether
 * messages are moving. It writes a heartbeat; the API reads it, which is what makes
 * a dead worker visible instead of looking like a permanently slow campaign.
 */

const HEARTBEAT_KEY = 'sw:worker:heartbeat';
const HEARTBEAT_TTL_SECONDS = 90;

export async function recordWorkerHeartbeat(details: Record<string, unknown> = {}): Promise<void> {
  await getRedis().set(
    HEARTBEAT_KEY,
    JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...details }),
    'EX',
    HEARTBEAT_TTL_SECONDS,
  );
}

export interface QueueHealth {
  redis: 'ok' | 'unavailable';
  worker: 'alive' | 'stale' | 'unknown';
  workerLastSeenAt: string | null;
  /** Jobs waiting, delayed (paced or held) and actively sending. */
  depth: { waiting: number; delayed: number; active: number; failed: number } | null;
}

export async function getQueueHealth(): Promise<QueueHealth> {
  try {
    const redis = getRedis();
    await redis.ping();

    const [raw, counts] = await Promise.all([
      redis.get(HEARTBEAT_KEY),
      getSendQueue().getJobCounts('waiting', 'delayed', 'active', 'failed'),
    ]);

    const heartbeat = raw ? (JSON.parse(raw) as { at?: string }) : null;

    return {
      redis: 'ok',
      // The key carries a TTL, so its absence while Redis is healthy means the
      // worker stopped writing — that is the signal worth alerting on.
      worker: heartbeat ? 'alive' : 'stale',
      workerLastSeenAt: heartbeat?.at ?? null,
      depth: {
        waiting: counts.waiting ?? 0,
        delayed: counts.delayed ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
      },
    };
  } catch {
    return { redis: 'unavailable', worker: 'unknown', workerLastSeenAt: null, depth: null };
  }
}
