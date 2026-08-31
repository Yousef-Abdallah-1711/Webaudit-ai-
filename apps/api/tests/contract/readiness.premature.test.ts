/**
 * T160 — FR-066: "offer a readiness pass, and MUST indicate when it is
 * premature because critical or high issues remain outstanding."
 *
 *   - `POST /scans/:baseline/readiness` is refused `403 READINESS_PREMATURE`
 *     (with the outstanding count) while any CRITICAL/HIGH issue on the
 *     baseline is not RESOLVED — and charges nothing.
 *   - `GET /scans/:baseline/readiness` reports `premature: true` with the same
 *     count, so the UI can *offer* the pass and mark it premature rather than
 *     hide it.
 *   - once the blocking issues are resolved, the pass starts (`201`).
 *   - the free tier is refused `403 PLAN_UPGRADE_REQUIRED` regardless.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { READINESS_PASS_COST } from '@webaudit/config';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const captured: { scanId: string }[] = [];
const fakeProducer = {
  enqueueFirstPhase: (input: { scanId: string }) => {
    captured.push({ scanId: input.scanId });
    return Promise.resolve({ jobId: `fake:${input.scanId}` });
  },
  close: () => Promise.resolve(),
};

const mailer = createCapturingMailer();
const app = createApp({
  db: testDb,
  mailer,
  readiness: { producer: fakeProducer, storage: null },
});

const CREDS = { email: 'fr066@example.com', password: 'correct-horse-battery-staple' };

async function signIn(plan: 'free' | 'pro'): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  if (plan === 'pro') {
    await testDb.subscription.create({
      data: {
        userId: user.id,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    // Pro renewal grants credits; make sure a readiness pass is affordable.
    await testDb.creditLot.create({
      data: { userId: user.id, kind: 'PLAN', source: 'PLAN_RENEWAL', amountGranted: 1200, amountRemaining: 1200, expiresAt: new Date(Date.now() + 30 * 86_400_000) },
    });
  }
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

async function seedCompletedBaseline(
  userId: string,
  blocking: readonly ('CRITICAL' | 'HIGH')[],
): Promise<string> {
  const target = await testDb.target.create({
    data: { userId, inputType: 'URL', canonicalValue: 'https://fr066.example.com', displayName: 'fr066' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      kind: 'INITIAL',
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state: 'COMPLETED',
      overallScore: 55,
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 55 },
  });
  let i = 0;
  for (const severity of blocking) {
    await testDb.issue.create({
      data: {
        scanId: scan.id,
        moduleResultId: mr.id,
        fingerprint: `fp-${String(i++)}`,
        checkId: 'headers.csp-missing',
        severity,
        title: `Blocking ${severity}`,
        explanation: 'x',
        consequence: 'y',
        attribution: 'MEASURED',
        fixPrompt: 'z',
        state: 'OPEN',
      },
    });
  }
  return scan.id;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  captured.length = 0;
});
afterAll(closeDb);

describe('FR-066 — the readiness pass is offered but marked premature', () => {
  it('refuses POST with 403 READINESS_PREMATURE and the outstanding count, charging nothing', async () => {
    const { token, userId } = await signIn('pro');
    const baselineId = await seedCompletedBaseline(userId, ['CRITICAL', 'HIGH']);

    const res = await request(app)
      .post(`/scans/${baselineId}/readiness`)
      .set(auth(token))
      .send({ acceptedQuote: READINESS_PASS_COST })
      .expect(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('READINESS_PREMATURE');
    expect((res.body as { error: { details: { outstandingBlocking: number } } }).error.details.outstandingBlocking).toBe(2);

    expect(captured).toHaveLength(0);
    const debits = await testDb.creditTransaction.count({ where: { type: 'DEBIT', reason: 'scan:readiness' } });
    expect(debits).toBe(0);
  });

  it('GET reports premature with the count so the pass can be offered, not hidden', async () => {
    const { token, userId } = await signIn('pro');
    const baselineId = await seedCompletedBaseline(userId, ['HIGH']);

    const res = await request(app).get(`/scans/${baselineId}/readiness`).set(auth(token)).expect(200);
    expect((res.body as { readiness: { premature: boolean; outstandingBlocking: number } }).readiness).toMatchObject({
      premature: true,
      outstandingBlocking: 1,
    });
  });

  it('starts the pass once the blocking issues are resolved', async () => {
    const { token, userId } = await signIn('pro');
    const baselineId = await seedCompletedBaseline(userId, ['CRITICAL']);

    await testDb.issue.updateMany({
      where: { scanId: baselineId },
      data: { state: 'RESOLVED', resolvedAt: new Date() },
    });

    const before = await request(app).get(`/scans/${baselineId}/readiness`).set(auth(token)).expect(200);
    expect((before.body as { readiness: { premature: boolean } }).readiness.premature).toBe(false);

    const res = await request(app)
      .post(`/scans/${baselineId}/readiness`)
      .set(auth(token))
      .send({ acceptedQuote: READINESS_PASS_COST })
      .expect(201);
    const scan = (res.body as { scan: { kind: string; baselineScanId: string } }).scan;
    expect(scan.kind).toBe('READINESS');
    expect(scan.baselineScanId).toBe(baselineId);
    expect(captured).toHaveLength(1);
  });

  it('refuses the free tier with 403 PLAN_UPGRADE_REQUIRED', async () => {
    const { token, userId } = await signIn('free');
    const baselineId = await seedCompletedBaseline(userId, []);

    const res = await request(app)
      .post(`/scans/${baselineId}/readiness`)
      .set(auth(token))
      .send({ acceptedQuote: READINESS_PASS_COST })
      .expect(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('PLAN_UPGRADE_REQUIRED');
  });
});
