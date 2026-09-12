import { randomUUID } from 'node:crypto';
import { Redis } from 'ioredis';

// The provider flow performs three sequential network calls (auth, order,
// payment-key).  Each call may consume the configured 10s timeout, so the
// lock must outlive the worst case or a second checkout can start before the
// first one finishes.
const CHECKOUT_LOCK_TTL_MS = 45_000;

export interface CheckoutLock {
  acquire(userId: string): Promise<string | null>;
  release(userId: string, token: string): Promise<void>;
}

export class CheckoutInProgressError extends Error {
  constructor() {
    super('A checkout is already being started for this account.');
  }
}

export function createRedisCheckoutLock(
  client = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6389', {
    maxRetriesPerRequest: 1,
  }),
): CheckoutLock {
  return {
    async acquire(userId: string): Promise<string | null> {
      const token = randomUUID();
      const result = await client.set(
        `checkout:${userId}`,
        token,
        'PX',
        CHECKOUT_LOCK_TTL_MS,
        'NX',
      );
      return result === 'OK' ? token : null;
    },
    async release(userId: string, token: string): Promise<void> {
      await client.eval(
        "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0",
        1,
        `checkout:${userId}`,
        token,
      );
    },
  };
}

export async function withCheckoutLock<T>(
  lock: CheckoutLock,
  userId: string,
  run: () => Promise<T>,
): Promise<T> {
  const token = await lock.acquire(userId);
  if (token === null) throw new CheckoutInProgressError();
  try {
    return await run();
  } finally {
    // Release is attempted for every outcome.  A transient Redis failure
    // must not mask the original checkout result; the bounded TTL remains the
    // safety net and a retry handles short-lived connection errors.
    try {
      await lock.release(userId, token);
    } catch (firstError) {
      try {
        await lock.release(userId, token);
      } catch (secondError) {
        console.error('[billing.checkout] failed to release checkout lock', {
          userId,
          firstError,
          secondError,
        });
      }
    }
  }
}
