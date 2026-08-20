import { Router } from 'express';
import { prisma } from '../db';

export const healthRouter = Router();

healthRouter.get('/health', async (_req, res) => {
  const started = Date.now();
  let database = 'ok';
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    database = 'unavailable';
  }
  res.status(database === 'ok' ? 200 : 503).json({
    status: database === 'ok' ? 'ok' : 'degraded',
    service: 'sendwhats-api',
    version: process.env.npm_package_version ?? '0.1.0',
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database, latencyMs: Date.now() - started },
  });
});
