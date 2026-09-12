/**
 * Full-workflow security/credit review (2026-09-10) — P0-CREDIT-1.
 *
 * `createScan` and `createReadinessScan` both debit credits, then call
 * `producer.enqueueFirstPhase` unguarded. Before this fix, a transient queue
 * failure there (Redis unreachable, a rejected `add()`) left the scan row
 * permanently `QUEUED` with its credits already spent: `startedAt` is only
 * ever written on the `QUEUED -> RUNNING_PHASE_1` transition
 * (`apps/worker/src/orchestrator/state-machine.ts`), so the timeout sweep's
 * `startedAt < cutoff` filter (`apps/worker/src/orchestrator/timeout.ts`)
 * never matches a row whose `startedAt` is `NULL` — no other backstop exists
 * either (`terminal-refund.ts` only fires from a worker-side `transition()`,
 * which likewise never runs for a job that was never enqueued). The user is
 * charged forever for a scan that will never run.
 *
 * The fix: a failed `enqueueFirstPhase` now refunds the debit in full and
 * transitions the scan straight to `FAILED` (a legal `QUEUED` target) instead
 * of leaving it `QUEUED`, and instead of deleting the row outright — deleting
 * would orphan the `CreditTransaction`/`CreditAllocation` rows the debit
 * already committed, which still reference this `scanId`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { READINESS_PASS_COST } from '@webaudit/config';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { totalAvailable } from '../../src/services/credits/balance.js';

const mailer = createCapturingMailer();

const failingProducer = {
  enqueueFirstPhase: () => Promise.reject(new Error('ECONNREFUSED: redis unreachable')),
  enqueuePhaseTwo: (input: { scanId: string }) =>
    Promise.resolve({ jobId: `fake:${input.scanId}` }),
  close: () => Promise.resolve(),
};

const app = createApp({
  db: testDb,
  mailer,
  scans: { producer: failingProducer },
  readiness: { producer: failingProducer, storage: null },
});

const CREDS = { email: 'enqueue-failure@example.com', password: 'correct-horse-battery-staple' };
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signIn(): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('P0-CREDIT-1 — a debit that commits but whose job never gets enqueued must not strand a charge', () => {
  it('POST /scans: refunds in full and fails the scan, never leaving it charged and QUEUED forever', async () => {
    const { token, userId } = await signIn();
    const before = await totalAvailable(testDb, userId);

    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(201);
    const targetId = (target.body as { target: { id: string } }).target.id;
    const quote = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'] })
      .expect(200);
    const cost = (quote.body as { quote: { credits: number } }).quote.credits;

    // The queue is down; creation must still surface an error to the caller...
    await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'], acceptedQuote: cost })
      .expect(500);

    // ...but must never leave a charged, un-runnable scan behind.
    const scan = await testDb.scan.findFirstOrThrow({ where: { userId, targetId } });
    expect(scan.state).toBe('FAILED');
    expect(scan.state).not.toBe('QUEUED');
    expect(scan.startedAt).toBeNull();
    expect(scan.failureReason).toBeTruthy();

    const after = await totalAvailable(testDb, userId);
    expect(after).toBe(before); // made whole — the debit was fully refunded

    const debits = await testDb.creditTransaction.findMany({
      where: { scanId: scan.id, type: 'DEBIT' },
    });
    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId: scan.id, type: 'REFUND' },
    });
    expect(debits).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.reversesId).toBe(debits[0]?.id);
    expect(refunds[0]?.amount).toBe(debits[0]?.amount);

    // Confirmed structurally, not just behaviorally: this scan would never
    // have been caught by the timeout sweep even if left QUEUED, because
    // `startedAt` stays null forever for a job that was never enqueued.
  });

  it('POST /scans/:id/readiness: same refund-and-fail behavior, not a stranded charge', async () => {
    const { token, userId } = await signIn();
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    await testDb.creditLot.create({
      data: {
        userId,
        kind: 'PLAN',
        source: 'PLAN_RENEWAL',
        amountGranted: 1200,
        amountRemaining: 1200,
        expiresAt: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const target = await testDb.target.create({
      data: {
        userId,
        inputType: 'URL',
        canonicalValue: 'https://readiness-enqueue-fail.example.com',
        displayName: 'readiness-enqueue-fail',
      },
    });
    const baseline = await testDb.scan.create({
      data: {
        userId,
        targetId: target.id,
        kind: 'INITIAL',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 20,
        chargedCredits: 20,
        state: 'COMPLETED',
        overallScore: 90,
      },
    });
    await testDb.moduleResult.create({
      data: { scanId: baseline.id, module: 'SECURITY', state: 'COMPLETE', score: 90 },
    });

    const before = await totalAvailable(testDb, userId);

    await request(app)
      .post(`/scans/${baseline.id}/readiness`)
      .set(auth(token))
      .send({ acceptedQuote: READINESS_PASS_COST })
      .expect(500);

    const readinessScan = await testDb.scan.findFirstOrThrow({
      where: { userId, kind: 'READINESS' },
    });
    expect(readinessScan.state).toBe('FAILED');
    expect(readinessScan.startedAt).toBeNull();
    expect(readinessScan.failureReason).toBeTruthy();

    const after = await totalAvailable(testDb, userId);
    expect(after).toBe(before);

    const refunds = await testDb.creditTransaction.findMany({
      where: { scanId: readinessScan.id, type: 'REFUND' },
    });
    expect(refunds).toHaveLength(1);
    expect(refunds[0]?.amount).toBe(READINESS_PASS_COST);
  });
});
