import 'dotenv/config';
import pino from 'pino';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/**
 * Phase 0 placeholder.
 *
 * Phase 5 turns this into the BullMQ consumer for the send queue: one worker per
 * WhatsApp instance, jittered delays, per-instance rate caps, batch cooldowns and
 * backoff on Evolution API errors. It stays a separate process from the API so a
 * slow or paused campaign can never block HTTP requests.
 */
async function main() {
  logger.info('Worker started (no queues registered yet — Phase 5)');
  const heartbeat = setInterval(() => logger.debug('worker heartbeat'), 60_000);

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down worker`);
    clearInterval(heartbeat);
    process.exit(0);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
