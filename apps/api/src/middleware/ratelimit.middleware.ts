/**
 * Rate limiting for the HTTP surface.
 *
 * Why this exists ahead of the Polish phase (T230): `/auth/login`,
 * `/auth/register`, `/auth/forgot-password` and `/auth/reset-password` are
 * already live. Two of them are unauthenticated write paths that send mail, and
 * login is worse than it looks — passwords are bcrypt-hashed at cost 12
 * (constitution, Security Requirements), so every login attempt buys the caller
 * roughly a quarter-second of our CPU for the price of one TCP connection. An
 * endpoint that converts a request into guaranteed server CPU is a denial-of-
 * service primitive, not merely a brute-force target. Deferring the limiter
 * until after the endpoint ships gets the order backwards.
 *
 * Why Redis: the API runs behind a load balancer with more than one replica.
 * An in-memory counter divides the real limit by the replica count and resets
 * on every deploy, which is indistinguishable from having no limiter at all.
 * Redis holds the shared counter. The constitution permits exactly this —
 * "Redis is cache, queue, and rate-limit state only, never a system of record"
 * — and nothing here is a record: losing the whole keyspace costs one window.
 *
 * Why it degrades instead of failing: a rate limiter is a control, not the
 * service. If Redis is unreachable, refusing every request would turn a cache
 * outage into a full outage and hand an attacker a cheaper way to take the API
 * down than the one the limiter exists to prevent. So each store falls back to
 * a local in-memory counter — weaker, per-replica, but never open — warns once,
 * and opens a short circuit so a dead Redis is not probed on every request.
 */

import {
  MemoryStore,
  rateLimit,
  type AugmentedRequest,
  type ClientRateLimitInfo,
  type IncrementResponse,
  type Options,
  type RateLimitRequestHandler,
  type Store,
} from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import type { NextFunction, Request, Response } from 'express';

// ─── Tunables ─────────────────────────────────────────────────────────────────

/**
 * Credential endpoints. Ten attempts per quarter hour per client is generous
 * for a human who has forgotten a password and ruinous for a password-spraying
 * script: at cost 12 it caps an attacker at about 2.5 seconds of our CPU per
 * quarter hour per address.
 */
const STRICT_WINDOW_MS = 15 * 60 * 1000;
const STRICT_LIMIT = 10;

/** Everything else. Sized to be invisible to a real client. */
const GENERAL_WINDOW_MS = 60 * 1000;
const GENERAL_LIMIT = 120;

/** A limiter that hangs is worse than a limiter that is wrong. */
const REDIS_OP_TIMEOUT_MS = 500;

/** Consecutive Redis failures before the store stops trying for a while. */
const FAILURE_THRESHOLD = 3;

/** How long the store stays on the in-memory fallback before retrying Redis. */
const CIRCUIT_OPEN_MS = 10_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'unknown error';
}

const warned = new Set<string>();

/**
 * Once, not per request. A degraded limiter under load would otherwise write
 * the log line that hides the incident.
 */
function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(`[ratelimit] ${message}`);
}

function alwaysWarn(message: string): void {
  console.warn(`[ratelimit] ${message}`);
}

/** Rejects rather than waiting for ioredis to give up on its own schedule. */
async function withTimeout<T>(work: Promise<T> | T, ms: number, label: string): Promise<T> {
  if (!(work instanceof Promise)) return work;
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * The bucket a request counts against.
 *
 * Two corrections to the library default (`request.ip`):
 *
 *   1. `::ffff:127.0.0.1` and `127.0.0.1` are the same client. Left alone they
 *      are two buckets, which doubles the allowance for anyone who can reach
 *      the service over both stacks.
 *   2. A single IPv6 subscriber routinely holds an entire /64. Keying on the
 *      full address would give one attacker 2^64 buckets, i.e. no limit at all.
 *      The /64 is the smallest unit that reliably means "one customer".
 *
 * Requires `trust proxy` to be set (see app.ts) or `request.ip` is the load
 * balancer's address and every client shares one bucket.
 */
export function clientKey(req: Request): string {
  const raw = req.ip ?? req.socket.remoteAddress ?? 'unknown';
  const ip = raw.startsWith('::ffff:') ? raw.slice('::ffff:'.length) : raw;
  if (!ip.includes(':')) return ip;
  return `${ip.split(':').slice(0, 4).join(':')}::/64`;
}

// ─── The resilient store ──────────────────────────────────────────────────────

/**
 * Wraps the Redis store and falls back to a process-local counter when Redis is
 * unreachable, slow, or wrong.
 *
 * The fallback is deliberately not silent and deliberately not permanent: it
 * warns on entry, warns on recovery, and re-probes Redis after CIRCUIT_OPEN_MS.
 * A limiter that quietly degrades to per-replica counting and never says so is
 * how a service ends up believing it is protected when it is not.
 */
class ResilientStore implements Store {
  /** False because the authoritative counter is shared; see Store.localKeys. */
  public readonly localKeys = false;

  public readonly prefix: string;

  private readonly fallback = new MemoryStore();

  private failures = 0;

  private circuitOpenUntil = 0;

  private degraded = false;

  constructor(
    private readonly primary: Store,
    private readonly label: string,
    prefix: string,
  ) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.primary.init?.(options);
    this.fallback.init(options);
  }

  increment(key: string): Promise<IncrementResponse> {
    return this.attempt<IncrementResponse>(
      () => this.primary.increment(key),
      () => this.fallback.increment(key),
    );
  }

  decrement(key: string): Promise<void> {
    return this.attempt<void>(
      () => this.primary.decrement(key),
      () => this.fallback.decrement(key),
    );
  }

  resetKey(key: string): Promise<void> {
    return this.attempt<void>(
      () => this.primary.resetKey(key),
      () => this.fallback.resetKey(key),
    );
  }

  get(key: string): Promise<ClientRateLimitInfo | undefined> {
    return this.attempt<ClientRateLimitInfo | undefined>(
      () => this.primary.get?.(key),
      () => this.fallback.get(key),
    );
  }

  async resetAll(): Promise<void> {
    await this.fallback.resetAll();
    if (this.primary.resetAll) await this.primary.resetAll();
  }

  async shutdown(): Promise<void> {
    this.fallback.shutdown();
    if (this.primary.shutdown) await this.primary.shutdown();
  }

  /**
   * The whole fallback policy, in one place. Every store method routes through
   * it so there is exactly one definition of "Redis is not answering".
   */
  private async attempt<T>(
    onPrimary: () => Promise<T> | T,
    onFallback: () => Promise<T> | T,
  ): Promise<T> {
    if (Date.now() < this.circuitOpenUntil) return onFallback();

    try {
      const result = await withTimeout(onPrimary(), REDIS_OP_TIMEOUT_MS, `${this.label} redis op`);
      this.failures = 0;
      if (this.degraded) {
        this.degraded = false;
        warned.delete(`degraded:${this.label}`);
        alwaysWarn(`${this.label}: Redis is answering again — limits are shared once more.`);
      }
      return result;
    } catch (err) {
      this.failures += 1;
      if (this.failures >= FAILURE_THRESHOLD) {
        this.circuitOpenUntil = Date.now() + CIRCUIT_OPEN_MS;
        this.failures = 0;
      }
      this.degraded = true;
      warnOnce(
        `degraded:${this.label}`,
        `${this.label}: Redis unavailable (${describeError(err)}). ` +
          'Falling back to a per-replica in-memory counter — the effective limit is now ' +
          'multiplied by the replica count. Requests are still counted; nothing is open.',
      );
      // The MemoryStore has not seen the earlier hits from before the outage, so
      // the first window after a failover is more permissive than configured.
      // Accepted: the alternative is refusing traffic because a cache is down.
      return onFallback();
    }
  }
}

// ─── Construction ─────────────────────────────────────────────────────────────

/**
 * `REDIS_URL` is read here rather than from `config/env.ts` on purpose: that
 * module is the auth secrets schema and is owned elsewhere. When a datastore
 * section is added there, this should import it instead of touching
 * `process.env`.
 */
function redisUrl(): string | undefined {
  const raw = process.env['REDIS_URL'];
  return raw !== undefined && raw.trim() !== '' ? raw.trim() : undefined;
}

/**
 * Fail-fast client settings. Every one of these exists so that a Redis problem
 * surfaces as a fallback within milliseconds instead of as a stalled request:
 * bounded connect, bounded command, one retry, and no unbounded offline queue
 * growth while the server is down.
 */
function createClient(url: string): Redis {
  const client = new Redis(url, {
    connectTimeout: 2_000,
    commandTimeout: REDIS_OP_TIMEOUT_MS,
    maxRetriesPerRequest: 1,
    // Bounded, not disabled: with lazyConnect the very first command arrives
    // before the socket is ready, and disabling the queue would reject it and
    // mark a perfectly healthy Redis as down.
    enableOfflineQueue: true,
    lazyConnect: true,
    retryStrategy: (times: number) => Math.min(times * 250, 5_000),
  });

  // ioredis emits 'error' on every failed reconnection attempt, and an
  // unhandled 'error' on an EventEmitter takes the process down. A rate limiter
  // must never be able to kill the API it protects.
  client.on('error', (err: Error) => {
    warnOnce('client', `Redis client error: ${err.message}`);
  });

  return client;
}

function redisStore(client: Redis, prefix: string): Store {
  const store = new RedisStore({
    prefix,
    sendCommand: async (...args: string[]): Promise<RedisReply> => {
      const [command, ...rest] = args;
      if (command === undefined) throw new Error('sendCommand called with no command');
      return (await client.call(command, rest)) as RedisReply;
    },
  });

  // `RedisStore` sends its LUA scripts to Redis from its own constructor and
  // parks the two promises in fields, expecting the first request to await them.
  // With Redis down they reject before any request arrives, and since Node 15 an
  // unhandled rejection terminates the process by default — so an unreachable
  // cache would kill the API on boot, which is precisely the outcome the
  // fallback below exists to prevent. Observed: exactly four unhandled
  // rejections, two per store. Attaching an inert handler marks them handled
  // without swallowing anything: `retryableIncrement` still awaits the same
  // promise, still sees the rejection, and still reloads the script on demand.
  for (const field of ['incrementScriptSha', 'getScriptSha']) {
    const pending: unknown = (store as unknown as Record<string, unknown>)[field];
    if (pending instanceof Promise) void pending.catch(() => undefined);
  }

  return store;
}

/** Matches the error envelope every other route in this API returns. */
function limitExceeded(label: string) {
  return (req: Request, res: Response, _next: NextFunction, options: Options): void => {
    const info = (req as AugmentedRequest)['rateLimit'];
    const resetTime = info?.resetTime;
    const retryAfterSeconds =
      resetTime instanceof Date
        ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
        : Math.ceil(options.windowMs / 1000);

    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(options.statusCode).json({
      error: {
        code: 'RATE_LIMITED',
        // No counts, no window, no hint about which bucket was hit: an attacker
        // tuning a script should not be told how close they are.
        message: 'Too many requests. Try again shortly.',
        retryAfterSeconds,
      },
    });
    // `originalUrl`, not `path`: the strict limiter is mounted at the credential
    // path itself, so `req.path` is always "/" here and the log would not say
    // which endpoint was hit. Deliberately not warnOnce — repeated 429s on a
    // credential path are the signal an operator needs.
    console.warn(`[ratelimit] ${label}: refused ${req.method} ${req.originalUrl}`);
  };
}

export interface RateLimiters {
  /** Credential endpoints: login, register, password reset, mail resend. */
  readonly strict: RateLimitRequestHandler;
  /** Everything else. */
  readonly general: RateLimitRequestHandler;
  /** Releases the Redis connection and the fallback stores' timers. */
  readonly shutdown: () => Promise<void>;
}

export interface RateLimiterOptions {
  /**
   * Override the Redis URL. Omit to read `REDIS_URL`. Pass `null` to skip Redis
   * entirely and use in-memory counters (single-process use only).
   */
  readonly redisUrl?: string | null;
  readonly strictLimit?: number;
  readonly strictWindowMs?: number;
  readonly generalLimit?: number;
  readonly generalWindowMs?: number;
}

/**
 * Builds the limiters. Each limiter gets its own store instance and its own
 * Redis key prefix — express-rate-limit refuses a store shared between two
 * limiters, and correctly so: a shared counter would let a burst of harmless
 * reads spend the login budget.
 */
export function createRateLimiters(options: RateLimiterOptions = {}): RateLimiters {
  const url = options.redisUrl === undefined ? redisUrl() : options.redisUrl;

  let client: Redis | undefined;
  if (url === null || url === undefined) {
    alwaysWarn(
      'REDIS_URL is not set — rate limits are per-process and reset on deploy. ' +
        'Behind more than one replica this is not a real limit. Set REDIS_URL.',
    );
  } else {
    client = createClient(url);
  }

  const store = (prefix: string, label: string): Store | undefined =>
    client === undefined
      ? undefined
      : new ResilientStore(redisStore(client, prefix), label, prefix);

  const strictStore = store('rl:auth:', 'strict');
  const generalStore = store('rl:api:', 'general');

  const shared = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: clientKey,
    // A preflight is not an attempt at anything and must not spend the budget.
    skip: (req: Request) => req.method === 'OPTIONS',
  } as const;

  const strict = rateLimit({
    ...shared,
    windowMs: options.strictWindowMs ?? STRICT_WINDOW_MS,
    limit: options.strictLimit ?? STRICT_LIMIT,
    // Successes are counted too. Counting only failures would leave the CPU
    // exhaustion vector wide open: valid credentials replayed in a loop cost
    // exactly as much bcrypt work as wrong ones.
    skipSuccessfulRequests: false,
    handler: limitExceeded('strict'),
    ...(strictStore ? { store: strictStore } : {}),
  });

  const general = rateLimit({
    ...shared,
    windowMs: options.generalWindowMs ?? GENERAL_WINDOW_MS,
    limit: options.generalLimit ?? GENERAL_LIMIT,
    handler: limitExceeded('general'),
    ...(generalStore ? { store: generalStore } : {}),
  });

  const shutdown = async (): Promise<void> => {
    for (const s of [strictStore, generalStore]) {
      if (s?.shutdown) await s.shutdown();
    }
    if (client) {
      try {
        await client.quit();
      } catch {
        client.disconnect();
      }
    }
  };

  return { strict, general, shutdown };
}
