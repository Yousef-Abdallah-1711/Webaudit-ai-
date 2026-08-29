/**
 * T052 — SC-021: "Zero load-generating checks execute against a target whose
 * control has not been verified, tested adversarially by requesting one against
 * an attested-only target, a target whose verification token was removed after
 * issue, and a target verified by another account."
 *
 * Three named bypasses, three describe blocks. Each is a different mistake:
 *
 *   1. attested-only          — treating "I affirm I own this" as proof
 *   2. token removed          — trusting a stored flag instead of re-checking
 *   3. verified by another    — scoping control to the address, not the account
 *
 * The second is the one R11 was designed around: "Re-confirming at execution
 * time rather than trusting a stored flag is what makes SC-021's third bypass
 * attempt — a target verified once and since changed hands — actually fail."
 *
 * A fourth block covers the case no user action can reach but a bug can: a
 * `Target` row whose `controlLevel` says VERIFIED with no live confirmation
 * behind it. The enum is a cache. The `TargetVerification` row is the truth.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import {
  attestControl,
  AttestationNotPermittedError,
} from '../../src/services/control-gate/attest.js';
import {
  checkVerification,
  startVerification,
  VerificationFailedError,
  type ControlProbe,
} from '../../src/services/control-gate/verify.js';
import {
  assertLoadGenerationAllowed,
  ControlLevelRequiredError,
  reconfirmControl,
} from '../../src/services/control-gate/reconfirm.js';
import { Level1RateBound, level1RateBound } from '../../src/services/control-gate/rate-bound.js';
import { CONTROL_GATE } from '@webaudit/config';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

/**
 * A probe whose published state the test controls.
 *
 * The real probe reaches the target through `@webaudit/safe-net`. Here it is a
 * map, so "the user removed the token" is one `delete` rather than a live host
 * that has to be persuaded to stop serving a file.
 */
class FakeProbe implements ControlProbe {
  readonly files = new Map<string, string>();
  readonly txt = new Map<string, string[]>();
  readonly fileReads: string[] = [];
  readonly txtReads: string[] = [];

  fetchFile(url: string): Promise<string | null> {
    this.fileReads.push(url);
    return Promise.resolve(this.files.get(url) ?? null);
  }

  resolveTxt(name: string): Promise<string[]> {
    this.txtReads.push(name);
    return Promise.resolve(this.txt.get(name) ?? []);
  }
}

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

async function makeTarget(userId: string, origin = 'https://example.com'): Promise<string> {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: origin,
      displayName: origin,
    },
  });
  return target.id;
}

function fileUrlFor(origin: string): string {
  return `${origin}${CONTROL_GATE.verificationFilePath}`;
}

/** Attest, issue a FILE token, publish it, confirm. Leaves the target VERIFIED. */
async function verifyByFile(
  userId: string,
  targetId: string,
  probe: FakeProbe,
  origin = 'https://example.com',
): Promise<string> {
  await attestControl(testDb, { targetId, userId });
  const issued = await startVerification(testDb, { targetId, userId, method: 'FILE' });
  probe.files.set(fileUrlFor(origin), issued.token);
  await checkVerification(testDb, { targetId, userId }, probe);
  return issued.token;
}

async function refusal(fn: () => Promise<unknown>): Promise<ControlLevelRequiredError> {
  try {
    await fn();
  } catch (error) {
    if (error instanceof ControlLevelRequiredError) return error;
    throw new Error(`refused, but not as a control-level refusal: ${String(error)}`);
  }
  throw new Error('resolved. SC-021 requires refusal.');
}

async function creditActivityCount(userId: string): Promise<number> {
  return testDb.creditTransaction.count({ where: { userId } });
}

// ─── Bypass 1 ────────────────────────────────────────────────────────────────

describe('SC-021 bypass 1 - an attested-only target', () => {
  it('refuses a load-generating check, naming the accepted methods', async () => {
    const userId = await makeUser('attested@example.com');
    const targetId = await makeTarget(userId);
    await attestControl(testDb, { targetId, userId });

    const error = await refusal(() =>
      assertLoadGenerationAllowed(testDb, { targetId, userId }, new FakeProbe()),
    );

    expect(error.required).toBe('VERIFIED');
    expect(error.current).toBe('ATTESTED');
    // FR-017: "naming which verification methods are accepted".
    expect([...error.methods].sort()).toEqual(['DNS', 'FILE']);
  });

  it('refuses before anything is charged', async () => {
    const userId = await makeUser('nocharge@example.com');
    const targetId = await makeTarget(userId);
    await attestControl(testDb, { targetId, userId });

    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, new FakeProbe()));

    // Principle VI: the gate is a pre-flight. Nothing may have been billed.
    expect(await creditActivityCount(userId)).toBe(0);
  });

  it('refuses a target with no attestation at all', async () => {
    const userId = await makeUser('none@example.com');
    const targetId = await makeTarget(userId);

    const error = await refusal(() =>
      assertLoadGenerationAllowed(testDb, { targetId, userId }, new FakeProbe()),
    );

    expect(error.current).toBe('NONE');
  });

  it('does not let attestation promote a target to VERIFIED', async () => {
    const userId = await makeUser('selfpromote@example.com');
    const targetId = await makeTarget(userId);

    await attestControl(testDb, { targetId, userId });
    await attestControl(testDb, { targetId, userId });

    const target = await testDb.target.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.controlLevel).toBe('ATTESTED');
    expect(target.attestedBy).toBe(userId);
    expect(target.attestedAt).not.toBeNull();
  });

  it('refuses to attest a target belonging to someone else', async () => {
    const owner = await makeUser('owner1@example.com');
    const stranger = await makeUser('stranger1@example.com');
    const targetId = await makeTarget(owner);

    await expect(attestControl(testDb, { targetId, userId: stranger })).rejects.toBeInstanceOf(
      AttestationNotPermittedError,
    );
  });
});

// ─── Bypass 2 ────────────────────────────────────────────────────────────────

describe('SC-021 bypass 2 - a target whose token was removed after issue', () => {
  it('refuses once the published token is gone', async () => {
    const userId = await makeUser('removed@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    // Verified a moment ago. This is the state a stored flag would trust.
    expect((await testDb.target.findUniqueOrThrow({ where: { id: targetId } })).controlLevel).toBe(
      'VERIFIED',
    );

    probe.files.clear();

    const error = await refusal(() =>
      assertLoadGenerationAllowed(testDb, { targetId, userId }, probe),
    );
    expect(error.required).toBe('VERIFIED');
  });

  it('reports the demotion to its caller, not only in the database', async () => {
    const userId = await makeUser('reports@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    expect(await reconfirmControl(testDb, { targetId, userId }, probe)).toMatchObject({
      level: 'VERIFIED',
      demoted: false,
    });

    probe.files.clear();
    // The caller has to be able to tell "still fine" from "just lost it", so a
    // scan can report the target as unavailable-pending-verification rather
    // than failed (US1 scenario 8).
    expect(await reconfirmControl(testDb, { targetId, userId }, probe)).toMatchObject({
      level: 'ATTESTED',
      demoted: true,
    });
  });

  it('demotes the target rather than leaving a stale VERIFIED behind', async () => {
    const userId = await makeUser('demote@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    probe.files.clear();
    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));

    const target = await testDb.target.findUniqueOrThrow({ where: { id: targetId } });
    // Attestation survives — the user did affirm authorisation. Verification does not.
    expect(target.controlLevel).toBe('ATTESTED');

    const verification = await testDb.targetVerification.findFirstOrThrow({ where: { targetId } });
    expect(verification.revokedAt).not.toBeNull();
    expect(verification.lastCheckedAt).not.toBeNull();
  });

  it('refuses a token that was replaced with a different value', async () => {
    const userId = await makeUser('swapped@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    // Domain changed hands; the new owner publishes their own file.
    probe.files.set(fileUrlFor('https://example.com'), 'some-other-token');

    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));
  });

  it('re-reads the target on every single check, never a cached answer', async () => {
    const userId = await makeUser('recheck@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    const afterVerify = probe.fileReads.length;
    await assertLoadGenerationAllowed(testDb, { targetId, userId }, probe);
    await assertLoadGenerationAllowed(testDb, { targetId, userId }, probe);
    await assertLoadGenerationAllowed(testDb, { targetId, userId }, probe);

    // Three checks, three reads. A memoised result is how bypass 2 gets through.
    expect(probe.fileReads.length).toBe(afterVerify + 3);
  });

  it('lets a re-published token restore verification', async () => {
    const userId = await makeUser('restore@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    const token = await verifyByFile(userId, targetId, probe);

    probe.files.clear();
    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));

    // Demotion is not a punishment. Publishing again and re-checking works.
    const reissued = await startVerification(testDb, { targetId, userId, method: 'FILE' });
    expect(reissued.token).not.toBe(token);
    probe.files.set(fileUrlFor('https://example.com'), reissued.token);
    await checkVerification(testDb, { targetId, userId }, probe);

    await expect(
      assertLoadGenerationAllowed(testDb, { targetId, userId }, probe),
    ).resolves.toMatchObject({ level: 'VERIFIED' });
  });

  it('refuses to confirm a token that was never published', async () => {
    const userId = await makeUser('unpublished@example.com');
    const targetId = await makeTarget(userId);
    await attestControl(testDb, { targetId, userId });
    await startVerification(testDb, { targetId, userId, method: 'FILE' });

    await expect(
      checkVerification(testDb, { targetId, userId }, new FakeProbe()),
    ).rejects.toBeInstanceOf(VerificationFailedError);

    expect((await testDb.target.findUniqueOrThrow({ where: { id: targetId } })).controlLevel).toBe(
      'ATTESTED',
    );
  });

  it('supersedes an older pending token so a stale one cannot be used', async () => {
    const userId = await makeUser('supersede@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await attestControl(testDb, { targetId, userId });

    const first = await startVerification(testDb, { targetId, userId, method: 'FILE' });
    const second = await startVerification(testDb, { targetId, userId, method: 'FILE' });

    // Publishing the superseded token must not confirm anything.
    probe.files.set(fileUrlFor('https://example.com'), first.token);
    await expect(checkVerification(testDb, { targetId, userId }, probe)).rejects.toBeInstanceOf(
      VerificationFailedError,
    );

    probe.files.set(fileUrlFor('https://example.com'), second.token);
    await expect(checkVerification(testDb, { targetId, userId }, probe)).resolves.toMatchObject({
      controlLevel: 'VERIFIED',
    });
  });
});

// ─── Bypass 3 ────────────────────────────────────────────────────────────────

describe('SC-021 bypass 3 - a target verified by another account', () => {
  it('refuses the second account even though the same address is verified', async () => {
    const origin = 'https://shared.example.com';
    const alice = await makeUser('alice@example.com');
    const bob = await makeUser('bob@example.com');
    const aliceTarget = await makeTarget(alice, origin);
    const bobTarget = await makeTarget(bob, origin);

    const probe = new FakeProbe();
    await verifyByFile(alice, aliceTarget, probe, origin);
    await attestControl(testDb, { targetId: bobTarget, userId: bob });

    // Alice's token is published and readable by anyone, Bob included.
    expect(probe.files.get(fileUrlFor(origin))).toBeTruthy();

    const error = await refusal(() =>
      assertLoadGenerationAllowed(testDb, { targetId: bobTarget, userId: bob }, probe),
    );
    expect(error.current).toBe('ATTESTED');

    // Alice is unaffected. Control is per account, not per address.
    await expect(
      assertLoadGenerationAllowed(testDb, { targetId: aliceTarget, userId: alice }, probe),
    ).resolves.toMatchObject({ level: 'VERIFIED' });
  });

  it('refuses when Bob publishes the token Alice was issued', async () => {
    const origin = 'https://copycat.example.com';
    const alice = await makeUser('alice2@example.com');
    const bob = await makeUser('bob2@example.com');
    const aliceTarget = await makeTarget(alice, origin);
    const bobTarget = await makeTarget(bob, origin);

    const probe = new FakeProbe();
    const aliceToken = await verifyByFile(alice, aliceTarget, probe, origin);

    await attestControl(testDb, { targetId: bobTarget, userId: bob });
    await startVerification(testDb, { targetId: bobTarget, userId: bob, method: 'FILE' });
    // Bob copies what he can read. It is not the token issued to him.
    probe.files.set(fileUrlFor(origin), aliceToken);

    await expect(
      checkVerification(testDb, { targetId: bobTarget, userId: bob }, probe),
    ).rejects.toBeInstanceOf(VerificationFailedError);
  });

  it('refuses a stranger reaching another account target by id', async () => {
    const owner = await makeUser('owner3@example.com');
    const stranger = await makeUser('stranger3@example.com');
    const targetId = await makeTarget(owner);
    const probe = new FakeProbe();
    await verifyByFile(owner, targetId, probe);

    // The target is genuinely VERIFIED. The caller is not its owner.
    await expect(
      assertLoadGenerationAllowed(testDb, { targetId, userId: stranger }, probe),
    ).rejects.toBeInstanceOf(ControlLevelRequiredError);
  });
});

// ─── The state no user action can reach ──────────────────────────────────────

describe('SC-021 - the enum is a cache, the verification row is the truth', () => {
  it('refuses a VERIFIED target with no confirmation behind it', async () => {
    const userId = await makeUser('forged@example.com');
    const targetId = await makeTarget(userId);
    // Written straight to the column, as a bug or a bad migration would.
    await testDb.target.update({
      where: { id: targetId },
      data: { controlLevel: 'VERIFIED', attestedAt: new Date(), attestedBy: userId },
    });

    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, new FakeProbe()));
  });

  it('refuses a VERIFIED target whose only verification row is revoked', async () => {
    const userId = await makeUser('revoked@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    await testDb.targetVerification.updateMany({
      where: { targetId },
      data: { revokedAt: new Date() },
    });
    // The column still says VERIFIED. The row says otherwise.
    await testDb.target.update({ where: { id: targetId }, data: { controlLevel: 'VERIFIED' } });

    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));
  });

  it('records every demotion in the audit log', async () => {
    const userId = await makeUser('audited@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);

    probe.files.clear();
    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Target', subjectId: targetId },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => e.action)).toContain('control.demoted');
  });
});

// ─── DNS as the other accepted method ────────────────────────────────────────

describe('FR-017 - DNS verification is equally re-confirmed', () => {
  it('verifies through a TXT record and refuses once it is removed', async () => {
    const userId = await makeUser('dns@example.com');
    const targetId = await makeTarget(userId, 'https://dns.example.com');
    const probe = new FakeProbe();

    await attestControl(testDb, { targetId, userId });
    const issued = await startVerification(testDb, { targetId, userId, method: 'DNS' });
    expect(issued.recordName).toBe(`${CONTROL_GATE.dnsRecordPrefix}.dns.example.com`);

    probe.txt.set(issued.recordName!, ['unrelated-record', issued.token]);
    await checkVerification(testDb, { targetId, userId }, probe);
    await expect(
      assertLoadGenerationAllowed(testDb, { targetId, userId }, probe),
    ).resolves.toMatchObject({ level: 'VERIFIED' });

    probe.txt.clear();
    await refusal(() => assertLoadGenerationAllowed(testDb, { targetId, userId }, probe));
  });
});

// ─── The bound that holds regardless of attestation ──────────────────────────

describe('FR-017 - Level 1 probing is bounded regardless of attestation', () => {
  /** A clock the test advances, so the bound is asserted and not slept through. */
  function fixedClock(): { now: () => number; advance: (ms: number) => void } {
    let t = 1_000_000;
    return {
      now: () => t,
      advance: (ms) => {
        t += ms;
      },
    };
  }

  it('applies the same published rate at every control level', async () => {
    const clock = fixedClock();
    const { maxRequestsPerSecond, burst } = CONTROL_GATE.level1ProbeRate;

    for (const level of ['NONE', 'ATTESTED', 'VERIFIED'] as const) {
      const bound = new Level1RateBound({ now: clock.now });
      const key = `target-${level}`;
      // The burst is spendable...
      for (let i = 0; i < burst; i += 1) {
        expect(bound.tryAcquire(key), `${level} burst ${String(i)}`).toBe(true);
      }
      // ...and then it is not, whatever the user affirmed.
      expect(bound.tryAcquire(key), `${level} over burst`).toBe(false);

      clock.advance(1000);
      let refilled = 0;
      while (bound.tryAcquire(key)) refilled += 1;
      expect(refilled, `${level} refill`).toBe(maxRequestsPerSecond);
    }
    await Promise.resolve();
  });

  it('bounds each target separately, so one target cannot starve another', () => {
    const clock = fixedClock();
    const bound = new Level1RateBound({ now: clock.now });
    for (let i = 0; i < CONTROL_GATE.level1ProbeRate.burst; i += 1) {
      bound.tryAcquire('target-a');
    }
    expect(bound.tryAcquire('target-a')).toBe(false);
    expect(bound.tryAcquire('target-b')).toBe(true);
  });

  it('publishes the rate rather than hiding it in code', () => {
    // FR-017 says "a published request rate". A magic number inside the limiter
    // is not published; a constant in @webaudit/config is.
    expect(CONTROL_GATE.level1ProbeRate.maxRequestsPerSecond).toBeGreaterThan(0);
    expect(CONTROL_GATE.level1ProbeRate.burst).toBeGreaterThanOrEqual(
      CONTROL_GATE.level1ProbeRate.maxRequestsPerSecond,
    );
  });
});

// ─── Fix 3 (2026-08-27 control-gate-enforcement plan review) ─────────────────
//
// `rate-bound.ts`'s own doc comment on `release()` already named the defect:
// nothing in production ever calls it, so the bucket map grows by one entry
// per target ever probed, for the life of the process. `refill()` now evicts
// a bucket in place of returning it once it has idled all the way back to
// full capacity — indistinguishable from a bucket that was never created, so
// dropping it costs nothing — and builds a fresh one lazily on the next
// access, the same way a never-before-seen key already does.

describe('Level1RateBound - idle buckets are evicted rather than held forever (Fix 3)', () => {
  function fixedClock(): { now: () => number; advance: (ms: number) => void } {
    let t = 1_000_000;
    return {
      now: () => t,
      advance: (ms) => {
        t += ms;
      },
    };
  }

  it('actually shrinks the tracked-target count once a bucket idles back to full capacity', () => {
    const clock = fixedClock();
    const bound = new Level1RateBound({ now: clock.now });
    const key = 'idle-target';

    bound.tryAcquire(key);
    // A partially-spent bucket is genuinely tracked.
    expect(bound.size).toBe(1);

    // Idle far longer than it takes to refill from one token spent back to
    // full capacity.
    clock.advance(10_000);
    // Any access refills first. Finding the bucket already back at capacity,
    // it must be dropped, not merely replaced with an equally-tracked one —
    // a delete-then-reinsert on the same key would leave `size` unchanged
    // and is exactly the bug this test exists to catch.
    expect(bound.retryAfterMs(key)).toBe(0);
    expect(bound.size).toBe(0);

    // The next real use still works correctly from a genuinely fresh bucket.
    expect(bound.tryAcquire(key)).toBe(true);
    expect(bound.size).toBe(1);
  });

  it('does not grow without bound across many distinct targets that each idle out', () => {
    const clock = fixedClock();
    const bound = new Level1RateBound({ now: clock.now });

    for (let i = 0; i < 50; i += 1) {
      bound.tryAcquire(`target-${String(i)}`);
    }
    expect(bound.size).toBe(50);

    // Idle long enough for every one of them to refill to capacity.
    clock.advance(10_000);
    // Touch each one once — the map must not still be holding all 50.
    for (let i = 0; i < 50; i += 1) {
      bound.retryAfterMs(`target-${String(i)}`);
    }
    expect(bound.size).toBe(0);
  });

  it('does not evict, and behaves identically to before, under continuous use that never fully idles', () => {
    const clock = fixedClock();
    const bound = new Level1RateBound({ now: clock.now });
    const { maxRequestsPerSecond, burst } = CONTROL_GATE.level1ProbeRate;
    const key = 'continuous-target';

    // Spend the whole burst up front, same as the pre-existing "applies the
    // same published rate" test above.
    for (let i = 0; i < burst; i += 1) {
      expect(bound.tryAcquire(key)).toBe(true);
    }
    expect(bound.tryAcquire(key)).toBe(false);

    // Advance by exactly one second — enough to refill the per-second rate,
    // never enough on its own to reach full capacity again (burst > rate by
    // construction, per the "publishes the rate" test below) — so the
    // bucket never idles all the way back up and must never be evicted
    // mid-use.
    clock.advance(1000);
    let refilled = 0;
    while (bound.tryAcquire(key)) refilled += 1;
    expect(refilled).toBe(maxRequestsPerSecond);

    // Unaffected by the eviction path: still bounded per key exactly as
    // before, on a bucket that has been in continuous use the whole time.
    expect(bound.tryAcquire(key)).toBe(false);
  });
});

// ─── Fix 1 (2026-08-27 control-gate-enforcement plan review) ─────────────────
//
// A rate-limit refusal and "the token genuinely isn't there" produce the
// identical `null`/`[]` shape from a `ControlProbe`. `reconfirmControl` used
// to treat either as loss of verification — revoking the `TargetVerification`
// row and demoting `Target.controlLevel` — which meant any authenticated user
// could exhaust the shared per-hostname `level1RateBound` bucket for a
// victim's domain (by pointing their own `Target` at it and hammering
// `checkVerification`) and silently revoke the victim's real, unrelated
// verification.
//
// The first fix (granting VERIFIED back when the check was merely
// inconclusive) traded that bug for a subtler one: an attacker who once
// verified a target and has since lost control of it could hold VERIFIED
// indefinitely by keeping their own bucket exhausted, since "inconclusive"
// resolved to "trust the stored row" — exactly the "stored artifact instead
// of a live probe" bypass this file exists to close. The fix below denies
// elevation on an inconclusive check instead of granting it, while still
// writing nothing destructive — the stored verification survives for a
// later, unthrottled re-check to confirm for real.

describe('Fix 1 - a rate-limit refusal must not be treated as a removed token, and must not grant trust either', () => {
  it('denies elevation without revoking a genuinely still-published verification when the rate bound is exhausted', async () => {
    const userId = await makeUser('rate-ambiguous@example.com');
    const targetId = await makeTarget(userId); // https://example.com
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe); // token genuinely published; target now VERIFIED

    // Exhaust the production singleton's bucket for this target's FILE-probe
    // key — the same key verify.ts's `fetchFile` derives
    // (`new URL(fileUrlFor(canonicalValue)).hostname`) — matching how the
    // existing "Level 1 probing" suite above exhausts a bound directly.
    const key = new URL(fileUrlFor('https://example.com')).hostname;
    for (let i = 0; i < CONTROL_GATE.level1ProbeRate.burst; i += 1) {
      level1RateBound.tryAcquire(key);
    }
    // Sanity check: genuinely exhausted, not a no-op loop.
    expect(level1RateBound.retryAfterMs(key)).toBeGreaterThan(0);

    try {
      // Simulates exactly what `createSafeNetProbe()` returns when its own
      // rate bound refuses it (even after `acquireOrWait`'s retry) — `null`/
      // `[]`, indistinguishable from "not published" to `isTokenPublished`.
      // The token is, in fact, still genuinely published (`probe.files`
      // still has it); this probe simply never gets to look.
      const rateLimitedProbe: ControlProbe = {
        fetchFile: () => Promise.resolve(null),
        resolveTxt: () => Promise.resolve([]),
      };

      const result = await reconfirmControl(testDb, { targetId, userId }, rateLimitedProbe);
      // Denied for this call — verifyByFile attests before verifying, so the
      // floor is ATTESTED, not NONE — but NOT destroyed: no revocation, no
      // demotion write, no audit entry, and a later unthrottled check can
      // still confirm VERIFIED for real.
      expect(result).toMatchObject({ level: 'ATTESTED', demoted: false });

      const verification = await testDb.targetVerification.findFirstOrThrow({
        where: { targetId },
      });
      expect(verification.revokedAt).toBeNull();

      const target = await testDb.target.findUniqueOrThrow({ where: { id: targetId } });
      expect(target.controlLevel).toBe('VERIFIED'); // the cached column is untouched, not demoted

      const entries = await testDb.auditLogEntry.findMany({
        where: { subjectType: 'Target', subjectId: targetId, action: 'control.demoted' },
      });
      expect(entries).toHaveLength(0);
    } finally {
      // Do not leak this exhausted bucket into any other test in this file.
      level1RateBound.release(key);
    }
  });

  it('does not grant VERIFIED to an attacker who exhausts their own bucket to hide a real loss of control', async () => {
    // The scenario the first version of this fix was vulnerable to: a target
    // was genuinely verified once, control has genuinely been lost (the
    // token is really gone), and the same actor keeps the rate bound
    // exhausted so every re-check reads as "inconclusive". The fix must not
    // let that read as "still VERIFIED" — it must deny elevation, same as
    // any other inconclusive check.
    const userId = await makeUser('rate-hidden-loss@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);
    probe.files.clear(); // control genuinely lost

    const key = new URL(fileUrlFor('https://example.com')).hostname;
    for (let i = 0; i < CONTROL_GATE.level1ProbeRate.burst; i += 1) {
      level1RateBound.tryAcquire(key);
    }
    expect(level1RateBound.retryAfterMs(key)).toBeGreaterThan(0);

    try {
      const rateLimitedProbe: ControlProbe = {
        fetchFile: () => Promise.resolve(null),
        resolveTxt: () => Promise.resolve([]),
      };
      const result = await reconfirmControl(testDb, { targetId, userId }, rateLimitedProbe);
      expect(result.level).not.toBe('VERIFIED');
      expect(result).toMatchObject({ level: 'ATTESTED', demoted: false });
    } finally {
      level1RateBound.release(key);
    }
  });

  it('still demotes when the token is genuinely gone and the rate bound is not exhausted', async () => {
    // Guards against the fix above disabling demotion altogether — a rate
    // bound with headroom must not shield a real removal.
    const userId = await makeUser('rate-genuine-removal@example.com');
    const targetId = await makeTarget(userId);
    const probe = new FakeProbe();
    await verifyByFile(userId, targetId, probe);
    probe.files.clear(); // genuinely removed, no rate-limit involved

    const key = new URL(fileUrlFor('https://example.com')).hostname;
    expect(level1RateBound.retryAfterMs(key)).toBe(0); // sanity: bucket has headroom

    const result = await reconfirmControl(testDb, { targetId, userId }, probe);
    expect(result).toMatchObject({ level: 'ATTESTED', demoted: true });
  });
});
