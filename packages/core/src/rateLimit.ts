import { env } from './env';
import { getRedis } from './queue';

/**
 * Per-instance send pacing — the anti-ban core.
 *
 * WhatsApp bans numbers that send in bursts, so a send is allowed only when all of
 * these hold: nothing sent too recently (jittered gap), the per-minute cap is free,
 * the per-day cap is free, and we are inside the sending window.
 *
 * Checking and reserving happen in one Lua script. With several workers running,
 * a check-then-act gate would let every concurrent job read "clear" before any of
 * them recorded a send — which is precisely the burst this is meant to prevent.
 * State lives in Redis so it holds across processes and survives restarts.
 */

export interface InstanceLimits {
  minDelayMs: number;
  maxDelayMs: number;
  maxPerMinute: number;
  maxPerDay: number;
  batchSize: number;
  batchCooldownMs: number;
}

export interface BusinessHours {
  /** Minutes from midnight, in the organization's offset. */
  startMinute: number;
  endMinute: number;
  /** 0 = Sunday. Empty means every day. */
  days?: number[];
  /** Minutes to add to UTC to reach the organization's local time. */
  utcOffsetMinutes: number;
}

export type GateReason = 'pacing' | 'per_minute_cap' | 'per_day_cap' | 'outside_hours';

export type Reservation =
  | { allowed: true; nextDelayMs: number; batchCooldown: boolean }
  | { allowed: false; reason: GateReason; retryInMs: number; detail: string };

export function resolveLimits(overrides: Partial<InstanceLimits> = {}): InstanceLimits {
  return {
    minDelayMs: overrides.minDelayMs ?? env.SEND_MIN_DELAY_MS,
    maxDelayMs: overrides.maxDelayMs ?? env.SEND_MAX_DELAY_MS,
    maxPerMinute: overrides.maxPerMinute ?? env.SEND_MAX_PER_MINUTE,
    maxPerDay: overrides.maxPerDay ?? env.SEND_MAX_PER_DAY,
    batchSize: overrides.batchSize ?? env.SEND_BATCH_SIZE,
    batchCooldownMs: overrides.batchCooldownMs ?? env.SEND_BATCH_COOLDOWN_MS,
  };
}

const keys = {
  next: (instance: string) => `sw:rl:${instance}:next`,
  minute: (instance: string, stamp: string) => `sw:rl:${instance}:min:${stamp}`,
  day: (instance: string, stamp: string) => `sw:rl:${instance}:day:${stamp}`,
  batch: (instance: string) => `sw:rl:${instance}:batch`,
};

const minuteStamp = (now: Date) => now.toISOString().slice(0, 16).replace(/\D/g, '');
const dayStamp = (now: Date) => now.toISOString().slice(0, 10).replace(/-/g, '');

/** Randomized gap so outgoing traffic never looks machine-timed. */
export function jitteredDelay(limits: InstanceLimits): number {
  const min = Math.min(limits.minDelayMs, limits.maxDelayMs);
  const max = Math.max(limits.minDelayMs, limits.maxDelayMs);
  return Math.round(min + Math.random() * (max - min));
}

/**
 * Atomically: verify the gaps and caps, and if they are clear, consume a slot and
 * arm the next gap. Returns 1/reason/delay so the caller knows what happened.
 */
const RESERVE_SCRIPT = `
local now        = tonumber(ARGV[1])
local perMinute  = tonumber(ARGV[2])
local perDay     = tonumber(ARGV[3])
local delay      = tonumber(ARGV[4])
local batchSize  = tonumber(ARGV[5])
local cooldown   = tonumber(ARGV[6])

local nextAt = tonumber(redis.call('GET', KEYS[1]) or '0')
if nextAt > now then
  return {0, 'pacing', nextAt - now}
end

local dayCount = tonumber(redis.call('GET', KEYS[3]) or '0')
if dayCount >= perDay then
  return {0, 'per_day_cap', 0}
end

local minuteCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if minuteCount >= perMinute then
  return {0, 'per_minute_cap', 0}
end

local cooled = 0
local batch = redis.call('INCR', KEYS[4])
if batchSize > 0 and batch % batchSize == 0 then
  delay = delay + cooldown
  cooled = 1
end

redis.call('SET', KEYS[1], tostring(now + delay), 'PX', delay + 60000)
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], 120)
redis.call('INCR', KEYS[3])
redis.call('EXPIRE', KEYS[3], 93600)

return {1, 'ok', delay, cooled}
`;

function businessHoursGate(hours: BusinessHours | null, now: Date): Reservation | null {
  if (!hours) return null;

  const local = new Date(now.getTime() + hours.utcOffsetMinutes * 60_000);
  const minuteOfDay = local.getUTCHours() * 60 + local.getUTCMinutes();
  const day = local.getUTCDay();
  const dayAllowed = !hours.days?.length || hours.days.includes(day);

  if (dayAllowed && minuteOfDay >= hours.startMinute && minuteOfDay < hours.endMinute) {
    return null;
  }

  // Wait for the next window rather than failing the message.
  const waitMinutes =
    dayAllowed && minuteOfDay < hours.startMinute
      ? hours.startMinute - minuteOfDay
      : 24 * 60 - minuteOfDay + hours.startMinute;

  return {
    allowed: false,
    reason: 'outside_hours',
    retryInMs: Math.max(60_000, waitMinutes * 60_000),
    detail: 'Outside the configured sending window',
  };
}

/**
 * Reserves the right to send one message on this number, or explains how long to
 * wait. A reserved slot is consumed even if the send then fails — erring toward
 * sending less is the safe direction for a number that can be banned.
 */
export async function reserveSendSlot(
  instanceName: string,
  limits: InstanceLimits,
  hours: BusinessHours | null = null,
  now = new Date(),
): Promise<Reservation> {
  const window = businessHoursGate(hours, now);
  if (window) return window;

  const result = (await getRedis().eval(
    RESERVE_SCRIPT,
    4,
    keys.next(instanceName),
    keys.minute(instanceName, minuteStamp(now)),
    keys.day(instanceName, dayStamp(now)),
    keys.batch(instanceName),
    String(now.getTime()),
    String(limits.maxPerMinute),
    String(limits.maxPerDay),
    String(jitteredDelay(limits)),
    String(limits.batchSize),
    String(limits.batchCooldownMs),
  )) as [number, string, number, number?];

  const [ok, reason, value, cooled] = result;

  if (ok === 1) {
    return { allowed: true, nextDelayMs: Number(value), batchCooldown: cooled === 1 };
  }

  if (reason === 'per_day_cap') {
    const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
    return {
      allowed: false,
      reason: 'per_day_cap',
      retryInMs: midnight - now.getTime(),
      detail: `Daily cap of ${limits.maxPerDay} reached for this number`,
    };
  }

  if (reason === 'per_minute_cap') {
    return {
      allowed: false,
      reason: 'per_minute_cap',
      retryInMs: 60_000 - (now.getTime() % 60_000),
      detail: `Rate cap of ${limits.maxPerMinute}/minute reached for this number`,
    };
  }

  return {
    allowed: false,
    reason: 'pacing',
    retryInMs: Math.max(250, Number(value)),
    detail: 'Waiting out the gap since the previous message',
  };
}

/** Pushes the next allowed send further out — used when WhatsApp signals throttling. */
export async function backOff(instanceName: string, ms: number, now = new Date()): Promise<void> {
  const redis = getRedis();
  const current = Number((await redis.get(keys.next(instanceName))) ?? 0);
  const until = Math.max(current, now.getTime() + ms);
  await redis.set(keys.next(instanceName), String(until), 'PX', ms + 60_000);
}

export async function sentToday(instanceName: string, now = new Date()): Promise<number> {
  const value = await getRedis().get(keys.day(instanceName, dayStamp(now)));
  return Number(value ?? 0);
}

/** Reads business hours out of an organization's settings JSON, if configured. */
export function parseBusinessHours(settings: unknown): BusinessHours | null {
  const record = settings && typeof settings === 'object' ? (settings as Record<string, unknown>) : {};
  const hours = record.businessHours as Record<string, unknown> | undefined;
  if (!hours || hours.enabled === false) return null;

  const startMinute = Number(hours.startMinute);
  const endMinute = Number(hours.endMinute);
  if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
    return null;
  }

  return {
    startMinute,
    endMinute,
    days: Array.isArray(hours.days) ? (hours.days as number[]) : undefined,
    utcOffsetMinutes: Number.isFinite(Number(hours.utcOffsetMinutes))
      ? Number(hours.utcOffsetMinutes)
      : 0,
  };
}
