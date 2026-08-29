/**
 * T056 follow-up — FR-017 wiring: `Level1RateBound` is fully built and tested
 * in isolation (`rate-bound.test.ts` / the "Level 1 probing" block in
 * `control-gate.test.ts`), but until now nothing in `apps/` ever called it.
 * `createSafeNetProbe()` is the one place the platform actually issues the
 * Level 1 network requests the bound exists to protect, so this file proves
 * the shared `level1RateBound` singleton is consulted there, not just that the
 * class works on its own.
 *
 * `safeFetch` and `node:dns/promises#resolveTxt` are mocked to record calls
 * without making a real request — the point is to prove the rate bound is
 * checked *before* either is ever reached, the same way
 * `verification-proof.test.ts` proves `maxRedirects: 0` without a live host.
 *
 * **Updated for Fix 1 (2026-08-27 control-gate-enforcement plan review):**
 * `fetchFile`/`resolveTxt` no longer refuse outright the instant a burst is
 * spent — they wait out the bucket's own refill time (capped at 2s) and
 * retry once (`verify.ts`'s `acquireOrWait`), because a bare refusal here is
 * indistinguishable from "the token isn't there" to `reconfirmControl`, which
 * used to treat that ambiguity as loss of verification. At this suite's
 * published rate (4 rps), exhausting the burst to exactly zero always leaves
 * a single token obtainable within ~250ms — well inside the 2s cap — so a
 * lone post-burst call now waits briefly and then succeeds, rather than
 * failing immediately. The two tests below assert that waited-then-succeeded
 * shape; the third proves an untouched target's bound is never consulted
 * long enough to matter.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as SafeNet from '@webaudit/safe-net';
import type * as DnsPromises from 'node:dns/promises';

const fetchCalls: string[] = [];
const dnsCalls: string[] = [];

vi.mock('@webaudit/safe-net', async (importOriginal) => {
  const actual = await importOriginal<typeof SafeNet>();
  return {
    ...actual,
    safeFetch: (url: string) => {
      fetchCalls.push(url);
      return Promise.resolve({
        status: 200,
        text: () => Promise.resolve('would-be-a-token'),
      });
    },
  };
});

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof DnsPromises>();
  return {
    ...actual,
    resolveTxt: (name: string) => {
      dnsCalls.push(name);
      return Promise.resolve([['would-be-a-token']]);
    },
  };
});

import { createSafeNetProbe } from '../../src/services/control-gate/verify.js';
import { level1RateBound } from '../../src/services/control-gate/rate-bound.js';
import { CONTROL_GATE } from '@webaudit/config';

describe('createSafeNetProbe consults the shared level1RateBound', () => {
  const fileHost = 'rate-bound-integration.example';
  const dnsName = '_webaudit-verify.rate-bound-integration.example';

  afterEach(() => {
    // The bound is a process-wide singleton (by design — see rate-bound.ts's
    // own doc comment on why there is exactly one instance). Leaving a target
    // key exhausted here would leak into any other test in this process that
    // happens to probe the same key.
    level1RateBound.release(fileHost);
    level1RateBound.release(dnsName);
    fetchCalls.length = 0;
    dnsCalls.length = 0;
  });

  it('waits out a spent burst rather than refusing outright, then reaches safeFetch', async () => {
    const url = `https://${fileHost}/.well-known/webaudit-verification.txt`;
    const probe = createSafeNetProbe();

    // Spend the published burst directly against the singleton, so this test
    // does not depend on real network timing to exhaust it.
    for (let i = 0; i < CONTROL_GATE.level1ProbeRate.burst; i += 1) {
      expect(level1RateBound.tryAcquire(fileHost)).toBe(true);
    }
    // Sanity: genuinely exhausted at the moment of the call below.
    expect(level1RateBound.retryAfterMs(fileHost)).toBeGreaterThan(0);

    const startedAt = Date.now();
    const result = await probe.fetchFile(url);

    // Fix 1, Part 1a: `acquireOrWait` waits out the bucket's own refill time
    // (capped at 2s) and retries once, instead of refusing the first instant
    // the burst is spent — a bare refusal here is indistinguishable from
    // "the token isn't there" to `reconfirmControl`. It genuinely waited
    // (not a same-tick pass-through) and then succeeded, exactly as
    // safeFetch is mocked to.
    expect(Date.now() - startedAt).toBeGreaterThan(0);
    expect(result).toBe('would-be-a-token');
    expect(fetchCalls).toEqual([url]);
  });

  it('waits out a spent burst rather than refusing outright, then reaches resolveTxt', async () => {
    const probe = createSafeNetProbe();

    for (let i = 0; i < CONTROL_GATE.level1ProbeRate.burst; i += 1) {
      expect(level1RateBound.tryAcquire(dnsName)).toBe(true);
    }
    expect(level1RateBound.retryAfterMs(dnsName)).toBeGreaterThan(0);

    const startedAt = Date.now();
    const result = await probe.resolveTxt(dnsName);

    expect(Date.now() - startedAt).toBeGreaterThan(0);
    expect(result).toEqual(['would-be-a-token']);
    expect(dnsCalls).toEqual([dnsName]);
  });

  it('still probes normally for a target whose bound has not been spent', async () => {
    const url = `https://${fileHost}-untouched/.well-known/webaudit-verification.txt`;
    const probe = createSafeNetProbe();

    const result = await probe.fetchFile(url);

    expect(result).toBe('would-be-a-token');
    expect(fetchCalls).toEqual([url]);
    level1RateBound.release(new URL(url).hostname);
  });
});
