/**
 * P0-TIMEOUT-1 — "the timeout sweep must never refund a module as
 * undelivered once it has actually been delivered."
 *
 * Reproduces the exact race the full-workflow review found
 * (docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md, Section
 * 6): `sweepTimedOutScans` snapshots candidate scans' `moduleResults` in one
 * batch `findMany`, then `terminate()` used to compute the refund from that
 * same stale snapshot. A module that completes and is persisted *after* the
 * batch read but *before* this specific scan's own turn in the sweep was
 * therefore still refunded as undelivered.
 *
 * `onBeforeScan` (added alongside the fix, `timeout.ts`'s own `SweepOptions`)
 * is the deterministic seam this test uses to land that `ModuleResult` write
 * in exactly that window — production code never sets it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { debit } from '@webaudit/api/credits';
import { sweepTimedOutScans, type SweepOptions } from '../../src/orchestrator/timeout.js';

function recordingEmitter() {
  return {
    emitterFor: () => ({
      emit: async (_e: unknown, persist: () => Promise<void>) => {
        await persist();
        return { persisted: true as const, published: true };
      },
    }),
  };
}

describe('P0-TIMEOUT-1 — a module delivered during batch processing is never refunded as undelivered', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });
  afterAll(closeDb);

  it("reflects the module as delivered when it completes between the batch read and this scan's own refund decision", async () => {
    const user = await db.user.create({
      data: {
        email: 'timeout-staleness@example.com',
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
      },
    });
    await db.creditLot.create({
      data: {
        userId: user.id,
        kind: 'PURCHASED',
        source: 'PURCHASE',
        amountGranted: 100,
        amountRemaining: 100,
        expiresAt: null,
      },
    });
    const target = await db.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://timeout-staleness.example.com',
        displayName: 'timeout-staleness',
        controlLevel: 'NONE',
      },
    });
    const scan = await db.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY', 'SEO'],
        capabilitySnapshot: {},
        quotedCredits: 30,
        chargedCredits: 30,
        state: 'RUNNING_PHASE_1',
        startedAt: new Date(Date.now() - 30 * 60_000),
      },
    });
    await debit(db, { userId: user.id, amount: 30, reason: 'scan:create', scanId: scan.id });
    // At the moment of the batch `findMany`, neither module has landed yet —
    // both would be undelivered under the stale-snapshot bug.

    const outcomes = await sweepTimedOutScans({
      db: db as unknown as SweepOptions['db'],
      emitterFor: recordingEmitter().emitterFor,
      refund: async (input) => {
        await db.creditTransaction.create({
          data: {
            userId: user.id,
            type: 'REFUND',
            amount: input.credits,
            reason: input.reason,
            scanId: input.scanId,
          },
        });
      },
      maxDurationMs: 15 * 60_000,
      // The seam this fix adds: simulates SECURITY's `ModuleResult` landing
      // for real (via a real capability finishing and persisting) in the
      // exact window between the batch read (already taken, above, before
      // this call) and this scan's own refund/transition step.
      onBeforeScan: async (scanId) => {
        if (scanId !== scan.id) return;
        await db.moduleResult.create({
          data: { scanId, module: 'SECURITY', state: 'COMPLETE', score: 88 },
        });
      },
    });

    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]?.timedOut).toBe(true);
    // SECURITY must be counted as delivered — it landed before this scan's
    // own refund decision was made, even though it wasn't there at batch-read
    // time.
    expect(outcomes[0]?.deliveredModules).toContain('SECURITY');
    expect(outcomes[0]?.undeliveredModules).toEqual(['SEO']);

    const refund = await db.creditTransaction.findFirst({
      where: { scanId: scan.id, type: 'REFUND' },
      select: { amount: true },
    });
    expect(refund).not.toBeNull();
    // Half the charge (one of two modules undelivered), not the whole 30 —
    // the stale-snapshot bug would have refunded the full amount since
    // neither module existed in the batch snapshot.
    expect(refund!.amount).toBe(15);

    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.state).toBe('TIMED_OUT');
  });
});
