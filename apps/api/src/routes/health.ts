import { Router } from 'express';
import { getQueueHealth } from '@sendwhats/core';
import { prisma } from '../db';

export const healthRouter = Router();

/**
 * Liveness for the whole send path, not just this process: the database, Redis, and
 * whether the separate worker is still writing its heartbeat. A dead worker is the
 * failure most likely to go unnoticed, since the UI keeps working while nothing sends.
 */
healthRouter.get('/health', async (_req, res) => {
  const started = Date.now();

  const [database, queue] = await Promise.all([
    prisma
      .$queryRaw`SELECT 1`
      .then(() => 'ok' as const)
      .catch(() => 'unavailable' as const),
    getQueueHealth(),
  ]);

  const healthy = database === 'ok' && queue.redis === 'ok';
  const degraded = healthy && queue.worker !== 'alive';

  res.status(healthy ? 200 : 503).json({
    status: !healthy ? 'unhealthy' : degraded ? 'degraded' : 'ok',
    service: 'sendwhats-api',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    checks: {
      database,
      redis: queue.redis,
      worker: queue.worker,
      workerLastSeenAt: queue.workerLastSeenAt,
      queueDepth: queue.depth,
      latencyMs: Date.now() - started,
    },
  });
});
