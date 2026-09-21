/**
 * T040-closure — atomic admission control for `SCAN_QUEUE_MAX_WAITING`.
 *
 * `create-scan.ts`'s capacity refusal used to read the live BullMQ queue
 * depth and compare it to the configured capacity as two separate steps
 * (`getWaitingCount()` then a plain `if`), with credit debit and DB scan
 * creation in between before the job is actually enqueued. Under real
 * concurrent load, many requests read the *same* pre-enqueue depth and all
 * pass the check — reproduced live: 10 concurrent requests against a
 * capacity of 3, worker paused, queue starting at depth 0, all 10 admitted.
 * `queue-backpressure.test.ts`'s existing coverage is sequential-only, which
 * is why this was never caught.
 *
 * The fix is a single atomic Redis Lua script: prune expired reservations,
 * count the live ones, and admit a new one only if `queueDepth +
 * liveReservations < capacity` — check-and-reserve in one round trip, so no
 * two concurrent callers can observe the same pre-reservation count. This
 * works across API processes (the state lives in Redis, not in this
 * process), and reservations self-expire via a sorted-set score (no
 * separate sweep/cron needed — pruning happens lazily on the next `reserve`
 * call), so a crashed API process cannot permanently consume capacity even
 * if `release` is never called for it.
 *
 * Mirrors `services/billing/checkout-lock.ts`'s existing shape: a factory
 * that takes an `ioredis` client (defaulting to `REDIS_URL`), a token/id the
 * caller never sees influence over from outside, and a release path that
 * logs rather than throws on a transient Redis failure (the TTL is the real
 * safety net).
 */
import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

/**
 * Safely longer than the reservation -> debit -> DB scan creation -> enqueue
 * sequence measured in the T040 capacity pass (low hundreds of ms even at 30
 * concurrent). Generous margin for a slow DB under real load without letting
 * a genuinely abandoned reservation linger long enough to matter.
 */
export const ADMISSION_RESERVATION_TTL_MS = 30_000;

export interface AdmissionResult {
  readonly admitted: boolean;
  /** Present only when `admitted` — pass to `release` once the outcome is known. */
  readonly reservationId: string | null;
  /** `queueDepth + live reservations` at decision time (after this call, if admitted). */
  readonly effectiveDepth: number;
}

export interface AdmissionGate {
  /**
   * Atomically decides whether another concurrent admission may proceed and,
   * if so, reserves a slot for it. `queueDepth` is the real BullMQ depth,
   * read by the caller immediately before this call — reservations track
   * *in-flight* admissions not yet reflected in that depth.
   */
  reserve(queueDepth: number, capacity: number): Promise<AdmissionResult>;
  /** Idempotent — safe to call once, twice, or after the reservation already expired. */
  release(reservationId: string): Promise<void>;
}

// KEYS[1] = reservation sorted-set key, one per queue.
// ARGV[1] = now (ms). ARGV[2] = ttl (ms). ARGV[3] = capacity.
// ARGV[4] = real queue depth. ARGV[5] = server-generated reservation id.
//
// Sorted-set score is each reservation's own expiry timestamp, which is what
// makes pruning a plain range-by-score delete rather than a separate expiry
// index. `PEXPIRE` on the key itself is a belt-and-braces backstop only (an
// idle key with no further `reserve` calls has no capacity impact either
// way — nothing else ever reads a key that would remain past every member's
// own expiry — this just keeps a fully-abandoned queue's key from lingering
// in Redis forever after the fact).
const RESERVE_SCRIPT = `
local key = KEYS[1]
local now = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local queueDepth = tonumber(ARGV[4])
local id = ARGV[5]
redis.call('ZREMRANGEBYSCORE', key, '-inf', now)
local reservations = redis.call('ZCARD', key)
local effectiveDepth = queueDepth + reservations
if effectiveDepth >= capacity then
  return { 0, effectiveDepth }
end
redis.call('ZADD', key, now + ttl, id)
redis.call('PEXPIRE', key, ttl + 5000)
return { 1, effectiveDepth + 1 }
`;

export function createRedisAdmissionGate(
  queueName: string,
  client: Redis = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6389', {
    maxRetriesPerRequest: 1,
  }),
  ttlMs: number = ADMISSION_RESERVATION_TTL_MS,
): AdmissionGate {
  const key = `admission:${queueName}`;
  return {
    async reserve(queueDepth, capacity): Promise<AdmissionResult> {
      const id = randomUUID();
      const now = Date.now();
      const raw = (await client.eval(
        RESERVE_SCRIPT,
        1,
        key,
        String(now),
        String(ttlMs),
        String(capacity),
        String(queueDepth),
        id,
      )) as [number, number];
      const [admittedFlag, effectiveDepth] = raw;
      return {
        admitted: admittedFlag === 1,
        reservationId: admittedFlag === 1 ? id : null,
        effectiveDepth,
      };
    },
    async release(reservationId): Promise<void> {
      try {
        await client.zrem(key, reservationId);
      } catch (error) {
        // Mirrors withCheckoutLock's release-failure handling: the TTL is
        // the real safety net, so a transient Redis error here must not
        // surface as the request's own failure.
        console.error('[queue.admission] failed to release a reservation', {
          queueName,
          error,
        });
      }
    },
  };
}
