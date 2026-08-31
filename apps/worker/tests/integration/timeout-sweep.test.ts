/**
 * Engineering-review finding — `sweepTimedOutScans` (T101 / FR-038) was built
 * and tested but never scheduled. This covers the wiring that closes it: the
 * handler `createTimeoutSweepHandler` builds the sweep's `refund` + `emitterFor`
 * deps correctly against a real database, and `dispatch` routes the repeatable
 * `timeout-sweep` job to it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { debit } from '@webaudit/api/credits';
import { createTimeoutSweepHandler } from '../../src/orchestrator/timeout-scheduler.js';
import { dispatch, JOB_NAMES } from '../../src/queue/workers.js';

const noopPublisher = { publish: () => Promise.resolve(1) };

describe('FR-038 timeout sweep — scheduled and wired', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });
  afterAll(closeDb);

  it('terminates a scan stuck past its deadline and refunds the undelivered share', async () => {
    const user = await db.user.create({
      data: { email: 'sweep@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
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
        canonicalValue: 'https://example.com',
        displayName: 'https://example.com',
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
        // 30 minutes ago — well past the 15-minute default.
        startedAt: new Date(Date.now() - 30 * 60_000),
      },
    });
    await debit(db, { userId: user.id, amount: 30, reason: 'scan:create', scanId: scan.id });
    // SECURITY delivered, SEO did not.
    await db.moduleResult.create({
      data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 90 },
    });

    const run = createTimeoutSweepHandler({ db, publisher: noopPublisher });
    await run();

    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.state).toBe('TIMED_OUT');

    const refund = await db.creditTransaction.findFirst({
      where: { scanId: scan.id, type: 'REFUND' },
      select: { amount: true },
    });
    expect(refund, 'the undelivered SEO share must be refunded').not.toBeNull();
    expect(refund!.amount).toBeGreaterThan(0);
  });

  it('does not touch a scan that is still within its deadline', async () => {
    const user = await db.user.create({
      data: { email: 'sweep2@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    const target = await db.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'x',
        controlLevel: 'NONE',
      },
    });
    const scan = await db.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'RUNNING_PHASE_1',
        startedAt: new Date(),
      },
    });

    await createTimeoutSweepHandler({ db, publisher: noopPublisher })();

    const after = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
    expect(after.state).toBe('RUNNING_PHASE_1');
  });

  it('dispatch routes the repeatable timeout-sweep job to the handler', async () => {
    let ran = false;
    await dispatch(
      { name: JOB_NAMES.timeoutSweep, queueName: 'maintenance', data: { kind: 'timeout-sweep' } },
      { timeoutSweep: () => ((ran = true), Promise.resolve()) },
    );
    expect(ran).toBe(true);
  });
});
