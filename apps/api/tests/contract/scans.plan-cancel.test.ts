/**
 * V02 (flag ON, isolated): cancellation and billing invariants on a scan that holds a SPEC 009 plan. Real PostgreSQL;
 * queue producers are stubs. Approved billing only: a cancelled scan refunds the undelivered share once.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { totalAvailable } from '../../src/services/credits/balance.js';
import { passiveBaselineRegistry } from '../../src/services/planning/index.js';
import { completePassiveUnits } from '../../src/services/execution-runtime/passive-completion.js';

const producer = {
  enqueueFirstPhase: (i: { scanId: string }) => Promise.resolve({ jobId: `f:${i.scanId}` }),
  enqueuePhaseTwo: (i: { scanId: string }) => Promise.resolve({ jobId: `f:${i.scanId}` }),
  close: () => Promise.resolve(),
};
const published: string[] = [];
const app = createApp({
  db: testDb,
  mailer: createCapturingMailer(),
  scans: {
    producer,
    cancelPublisher: {
      publishCancellation: (id: string) => {
        published.push(id);
        return Promise.resolve();
      },
      close: () => Promise.resolve(),
    },
    teardownProducer: {
      enqueueTeardown: (i: { scanId: string }) => Promise.resolve({ jobId: `t:${i.scanId}` }),
      close: () => Promise.resolve(),
    },
    planIntegration: { registry: passiveBaselineRegistry() },
  },
});
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function startScan(email: string) {
  await request(app)
    .post('/auth/register')
    .send({ email, password: 'correct-horse-battery-staple' })
    .expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const login = await request(app)
    .post('/auth/login')
    .send({ email, password: 'correct-horse-battery-staple' })
    .expect(200);
  const token = (login.body as { accessToken: string }).accessToken;
  const tgt = await request(app)
    .post('/targets')
    .set(auth(token))
    .send({ inputType: 'URL', value: 'https://example.com/' })
    .expect(201);
  const targetId = (tgt.body as { target: { id: string } }).target.id;
  const modules = ['SECURITY', 'SEO'];
  const q = await request(app)
    .post('/scans/quote')
    .set(auth(token))
    .send({ targetId, modules })
    .expect(200);
  const before = await totalAvailable(testDb, user.id);
  const created = await request(app)
    .post('/scans')
    .set(auth(token))
    .send({
      targetId,
      modules,
      acceptedQuote: (q.body as { quote: { credits: number } }).quote.credits,
    })
    .expect(201);
  return {
    token,
    userId: user.id,
    before,
    scanId: (created.body as { scan: { id: string } }).scan.id,
  };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  published.length = 0;
});
afterAll(closeDb);

describe('cancel on a planned scan', () => {
  it('cancels, refunds the undelivered share exactly once, and a duplicate cancel changes nothing', async () => {
    const s = await startScan('plan-cancel@example.com');
    expect(await totalAvailable(testDb, s.userId)).toBeLessThan(s.before);
    await request(app).post(`/scans/${s.scanId}/cancel`).set(auth(s.token)).expect(200);
    expect(await totalAvailable(testDb, s.userId)).toBe(s.before);
    const dup = await request(app).post(`/scans/${s.scanId}/cancel`).set(auth(s.token)).expect(409);
    expect(dup.body.error.code).toBe('ALREADY_TERMINAL');
    expect(await totalAvailable(testDb, s.userId)).toBe(s.before);
    expect(published).toEqual([s.scanId]);
    const refunds = await testDb.creditTransaction.count({
      where: { scanId: s.scanId, type: 'REFUND' },
    });
    expect(refunds).toBe(1);
  });

  it('never completes the passive units of a cancelled scan', async () => {
    const s = await startScan('plan-cancel-units@example.com');
    await request(app).post(`/scans/${s.scanId}/cancel`).set(auth(s.token)).expect(200);
    const plan = await testDb.scanPlan.findFirstOrThrow({ where: { scanId: s.scanId } });
    await testDb.moduleResult.createMany({
      data: [
        { scanId: s.scanId, module: 'SECURITY', state: 'COMPLETE' },
        { scanId: s.scanId, module: 'SEO', state: 'COMPLETE' },
      ],
    });
    const out = await completePassiveUnits(testDb, plan.id);
    expect(out.completed).toEqual([]);
    expect(out.deferred).toHaveLength(2);
    const units = await testDb.executionUnit.findMany({ where: { scanPlanId: plan.id } });
    expect(units.every((u) => u.status === 'PLANNED')).toBe(true);
  });

  it('refuses cancelling a scan that already completed and refunds nothing', async () => {
    const s = await startScan('plan-cancel-done@example.com');
    await testDb.scan.update({
      where: { id: s.scanId },
      data: { state: 'COMPLETED', completedAt: new Date() },
    });
    const after = await totalAvailable(testDb, s.userId);
    await request(app).post(`/scans/${s.scanId}/cancel`).set(auth(s.token)).expect(409);
    expect(await totalAvailable(testDb, s.userId)).toBe(after);
  });

  it('does not let another tenant cancel the scan or touch its refund', async () => {
    const s = await startScan('plan-cancel-owner@example.com');
    await request(app)
      .post('/auth/register')
      .send({ email: 'plan-cancel-x@example.com', password: 'correct-horse-battery-staple' })
      .expect(201);
    await testDb.user.update({
      where: { email: 'plan-cancel-x@example.com' },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'plan-cancel-x@example.com', password: 'correct-horse-battery-staple' })
      .expect(200);
    await request(app)
      .post(`/scans/${s.scanId}/cancel`)
      .set(auth((login.body as { accessToken: string }).accessToken))
      .expect(404);
    expect((await testDb.scan.findUniqueOrThrow({ where: { id: s.scanId } })).state).not.toBe(
      'CANCELLED',
    );
  });
});
