import { Queue, type JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { env } from './env';

export const SEND_QUEUE = 'campaign-send';

export interface SendJobData {
  messageJobId: string;
  campaignId: string;
  organizationId: string;
  /** Evolution instance name, carried so the worker can pace per number. */
  instanceName: string;
}

let connection: IORedis | null = null;

/**
 * BullMQ requires maxRetriesPerRequest: null on the connection it blocks on, and
 * reuses one connection across queues, so it is created once here.
 */
export function getRedis(): IORedis {
  if (!connection) {
    connection = new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });
  }
  return connection;
}

let sendQueue: Queue<SendJobData> | null = null;

export function getSendQueue(): Queue<SendJobData> {
  if (!sendQueue) {
    sendQueue = new Queue<SendJobData>(SEND_QUEUE, {
      connection: getRedis(),
      defaultJobOptions: {
        // Sends are retried by the worker's own backoff logic, which knows the
        // difference between "WhatsApp is throttling" and "this number is invalid".
        attempts: 1,
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return sendQueue;
}

/**
 * Job id is derived from the message so a campaign cannot be double-enqueued.
 * BullMQ rejects custom ids containing ':', so this uses a dash.
 */
export const sendJobId = (messageJobId: string) => `msg-${messageJobId}`;

export async function enqueueSendJobs(jobs: SendJobData[], options: JobsOptions = {}) {
  if (!jobs.length) return 0;
  const queue = getSendQueue();
  await queue.addBulk(
    jobs.map((data) => ({
      name: 'send',
      data,
      opts: { jobId: sendJobId(data.messageJobId), ...options },
    })),
  );
  return jobs.length;
}

/** Drops every not-yet-running job for a campaign (pause/cancel). */
export async function removeCampaignJobs(campaignId: string): Promise<number> {
  const queue = getSendQueue();
  const jobs = await queue.getJobs(['waiting', 'delayed', 'prioritized', 'paused']);
  let removed = 0;
  for (const job of jobs) {
    if (job.data?.campaignId !== campaignId) continue;
    try {
      await job.remove();
      removed++;
    } catch {
      // A job that started while we were iterating is handled by the worker's own
      // campaign-status check instead.
    }
  }
  return removed;
}

export async function closeQueue() {
  await sendQueue?.close();
  sendQueue = null;
  connection?.disconnect();
  connection = null;
}
