/**
 * T056 — FR-017: "System MUST bound Level 1 probing to a published request rate
 * regardless of attestation, so that a false attestation cannot itself cause
 * harm."
 *
 * The phrase that shapes this file is *regardless of attestation*. This limiter
 * takes no control level, no user, and no plan. It cannot be told that a target
 * is attested, verified, or owned by a paying customer, because every one of
 * those is a fact the user asserted or bought and none of them is evidence that
 * more traffic is safe. Attestation is an unverified claim, so the bound that
 * makes a false claim harmless cannot be a function of it.
 *
 * The rate lives in `@webaudit/config` rather than here. FR-017 says "a
 * *published* request rate", and a number inside a limiter is not published.
 *
 * Keyed per target, not globally: one customer auditing a busy host must not
 * throttle everyone else's audits. The global cap on deliberate load generation
 * is a different mechanism and belongs to R12 in the probe pool, where the load
 * is actually produced.
 *
 * In-process, and honest about it. One process holds one bucket per target, so
 * N processes permit N times the rate. That was originally reasoned to be
 * acceptable because "the scan orchestrator gives one scan one worker, so a
 * target is not normally being probed from several processes at once" — but
 * that premise no longer holds: `apps/api` (intake, on every `POST /scans`)
 * and `apps/worker` (execution, per phase job) each hold their own
 * independent `level1RateBound` singleton, and both can probe the same
 * target. This is a known, currently-accepted limitation, not a corrected
 * design — the bound this file provides is still real per-process protection
 * against runaway Level 1 traffic, just not a single shared budget across
 * every process that can issue it. If that gap needs closing, this needs the
 * Redis store `ratelimit.middleware.ts` already uses.
 */

import { CONTROL_GATE } from '@webaudit/config';

export interface RateBoundOptions {
  /** Injectable so the adverse suite asserts the bound instead of sleeping through it. */
  readonly now?: () => number;
  readonly maxRequestsPerSecond?: number;
  readonly burst?: number;
}

interface Bucket {
  /** Fractional on purpose: truncating here leaks a fraction of a token per call. */
  tokens: number;
  lastRefillMs: number;
}

/**
 * A token bucket per key. Burst-then-refill rather than a fixed window, because
 * a page load is legitimately a burst of requests and a fixed window either
 * refuses the burst or permits twice the rate across a boundary.
 */
export class Level1RateBound {
  private readonly buckets = new Map<string, Bucket>();
  private readonly now: () => number;
  private readonly ratePerMs: number;
  private readonly capacity: number;

  constructor(options: RateBoundOptions = {}) {
    this.now = options.now ?? Date.now;
    const perSecond =
      options.maxRequestsPerSecond ?? CONTROL_GATE.level1ProbeRate.maxRequestsPerSecond;
    this.capacity = options.burst ?? CONTROL_GATE.level1ProbeRate.burst;
    this.ratePerMs = perSecond / 1000;
  }

  /** True if this probe may proceed. Never blocks, never throws. */
  tryAcquire(targetKey: string): boolean {
    const bucket = this.refill(targetKey);
    if (bucket.tokens < 1) return false;
    bucket.tokens -= 1;
    // `refill` may have handed back an unstored object (a fresh bucket, or
    // one just evicted for being back at capacity) — persist the spend
    // explicitly so it isn't silently lost on the next access.
    this.buckets.set(targetKey, bucket);
    return true;
  }

  /** Milliseconds until the next probe would be permitted; 0 if one is now. */
  retryAfterMs(targetKey: string): number {
    const bucket = this.refill(targetKey);
    if (bucket.tokens >= 1) return 0;
    return Math.ceil((1 - bucket.tokens) / this.ratePerMs);
  }

  /**
   * Drop a target's bucket. No production call site requires this any more
   * (see `refill`'s own eviction below) — kept for tests and any future
   * caller that wants a bucket gone immediately rather than at its next
   * access.
   */
  release(targetKey: string): void {
    this.buckets.delete(targetKey);
  }

  /** Distinct targets currently tracked. Test-only observability into the eviction below. */
  get size(): number {
    return this.buckets.size;
  }

  /**
   * A bucket at full capacity is indistinguishable from one that was never
   * created — both start every future `tryAcquire` from the same full
   * allowance. So a bucket is only ever *stored* while it holds less than
   * full capacity (i.e. genuinely in use); one that refills all the way
   * back to capacity is evicted rather than re-inserted, and a target never
   * seen (or already fully rested) is never stored in the first place.
   * Without this, the map would grow by one entry per target ever probed,
   * for the life of the process, since nothing in production calls
   * `release()`.
   *
   * `tryAcquire` re-stores the bucket itself, after spending a token, so a
   * spend is never lost just because `refill` handed back an unstored
   * object — see its own body. A target probed continuously never reaches
   * capacity between calls (it is still spending tokens), so this never
   * evicts a bucket under active use, only one that has gone idle long
   * enough to fully refill.
   */
  private refill(targetKey: string): Bucket {
    const nowMs = this.now();
    const existing = this.buckets.get(targetKey);
    if (existing === undefined) {
      return { tokens: this.capacity, lastRefillMs: nowMs };
    }
    const elapsed = Math.max(0, nowMs - existing.lastRefillMs);
    const tokens = Math.min(this.capacity, existing.tokens + elapsed * this.ratePerMs);
    if (tokens >= this.capacity) {
      this.buckets.delete(targetKey);
      return { tokens: this.capacity, lastRefillMs: nowMs };
    }
    existing.tokens = tokens;
    existing.lastRefillMs = nowMs;
    return existing;
  }
}

/**
 * The process-wide bound.
 *
 * A single instance because the bound is a property of the platform's outbound
 * behaviour, not of any one caller. A capability that constructed its own would
 * be granting itself a fresh allowance, which is the bypass this module exists
 * to prevent.
 */
export const level1RateBound = new Level1RateBound();
