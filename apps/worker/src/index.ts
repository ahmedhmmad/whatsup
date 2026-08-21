import 'dotenv/config';
import { DelayedError, Worker, type Job } from 'bullmq';
import {
  SEND_QUEUE,
  env,
  getRedis,
  logger,
  prisma,
  processMessageJob,
  recordWorkerHeartbeat,
  type SendJobData,
} from '@sendwhats/core';

/**
 * The send worker.
 *
 * Pacing is decided per WhatsApp number rather than per process: a job that arrives
 * while its number is inside a jitter gap, over a rate cap or outside the sending
 * window is pushed back onto the delayed set instead of being sent or failed. That
 * keeps concurrency useful across organizations while each number still trickles.
 */
async function handle(job: Job<SendJobData>, token?: string): Promise<string> {
  const outcome = await processMessageJob(job.data);

  switch (outcome.action) {
    case 'sent':
      logger.info(
        { messageJobId: job.data.messageJobId, nextDelayMs: outcome.nextDelayMs },
        'Message sent',
      );
      return 'sent';

    case 'wait':
    case 'retry': {
      const runAt = Date.now() + Math.max(1000, outcome.retryInMs);
      logger.info(
        { messageJobId: job.data.messageJobId, reason: outcome.reason, retryInMs: outcome.retryInMs },
        outcome.action === 'wait' ? 'Holding message' : 'Retrying message',
      );
      // moveToDelayed + DelayedError is BullMQ's way of saying "not now, not failed".
      await job.moveToDelayed(runAt, token);
      throw new DelayedError();
    }

    case 'failed':
      logger.warn({ messageJobId: job.data.messageJobId, reason: outcome.reason }, 'Message failed');
      return 'failed';

    case 'skipped':
    default:
      logger.info({ messageJobId: job.data.messageJobId, reason: outcome.reason }, 'Message skipped');
      return 'skipped';
  }
}

async function main() {
  const worker = new Worker<SendJobData>(SEND_QUEUE, handle, {
    connection: getRedis(),
    concurrency: env.WORKER_CONCURRENCY,
    // Jobs are paced individually; this only stops a thundering herd on startup.
    limiter: { max: 30, duration: 1000 },
  });

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError) return;
    logger.error({ err, messageJobId: job?.data?.messageJobId }, 'Send job errored');
  });

  worker.on('error', (err) => logger.error({ err }, 'Worker error'));

  // The heartbeat is what lets /health tell "no worker" apart from "nothing to do".
  await recordWorkerHeartbeat({ concurrency: env.WORKER_CONCURRENCY });
  const heartbeat = setInterval(() => {
    void recordWorkerHeartbeat({ concurrency: env.WORKER_CONCURRENCY }).catch((err) =>
      logger.warn({ err }, 'Could not write worker heartbeat'),
    );
  }, 30_000);

  logger.info(
    { concurrency: env.WORKER_CONCURRENCY, queue: SEND_QUEUE },
    'Send worker started',
  );

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, draining worker`);
    clearInterval(heartbeat);
    await worker.close();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Worker failed to start');
  process.exit(1);
});
