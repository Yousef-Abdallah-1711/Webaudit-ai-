/**
 * GET /scans/:id/coverage (N03, FR-038/039): what ran, what did not, and why — facts only. Tenant-scoped, never
 * discloses engine ids / configuration / credential references, and a legacy scan (no plan) answers an empty list.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const app = createApp({ db: testDb, mailer: createCapturingMailer() });
const PASSWORD = 'correct-horse-battery-staple';

async function signIn(email: string): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send({ email, password: PASSWORD }).expect(201);
  await testDb.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  const user = await testDb.user.findUniqueOrThrow({ where: { email } });
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

const auth = (bearer: string) => ({ Authorization: `Bearer ${bearer}` });

async function makeScan(userId: string, state: 'RUNNING_PHASE_1' | 'QUEUED' = 'RUNNING_PHASE_1') {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: `https://${userId}.example.com`,
      displayName: 'example.com',
    },
  });
  return testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      state,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: [],
      quotedCredits: 30,
      chargedCredits: 30,
      startedAt: new Date(),
    },
  });
}

async function makePlanWithUnits(userId: string, scanId: string, targetId: string) {
  const plan = await testDb.scanPlan.create({
    data: { kind: 'INITIAL', userId, scanId, state: 'RESOLVED', deadlineMs: 600_000 },
  });
  const base = {
    scanPlanId: plan.id,
    userId,
    targetId,
    configuration: { secret: 'config-must-not-leak' },
    priority: 1,
    timeoutPolicyMs: 30_000,
    retryPolicy: { maxAttempts: 1 },
    requiresSafetyCheckpoint: true,
    credentialBindingRef: 'credential-ref-must-not-leak',
  };
  await testDb.executionUnit.create({
    data: {
      ...base,
      id: 'cov-unit-done',
      executionUnitClass: 'BROWSER',
      engineId: 'browser.engine',
      idempotencyKey: 'cov-unit-done:1',
      status: 'COMPLETED',
    },
  });
  await testDb.executionUnit.create({
    data: {
      ...base,
      id: 'cov-unit-skipped',
      executionUnitClass: 'SOURCE_STATIC',
      engineId: 'source.engine',
      idempotencyKey: 'cov-unit-skipped:1',
      status: 'SKIPPED',
      requiresSafetyCheckpoint: false,
      skippedReason: 'no repository supplied',
    },
  });
  await testDb.executionUnit.create({
    data: {
      ...base,
      id: 'cov-unit-refused',
      executionUnitClass: 'ACTIVE_SECURITY',
      engineId: 'probe.engine',
      idempotencyKey: 'cov-unit-refused:1',
      status: 'REFUSED',
      terminalReason: 'AUTHORIZATION_EXPIRED',
    },
  });
  return plan;
}

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /scans/:id/coverage', () => {
  it('lists completed and non-completed units with reasons, without engine ids or secrets', async () => {
    const { token, userId } = await signIn('cov-owner@example.com');
    const scan = await makeScan(userId);
    const plan = await makePlanWithUnits(userId, scan.id, scan.targetId);

    const res = await request(app).get(`/scans/${scan.id}/coverage`).set(auth(token)).expect(200);
    const body = res.body as {
      coverage: Array<{
        planId: string;
        kind: string;
        completedUnits: Array<{ id: string; executionUnitClass: string }>;
        nonCompletedUnits: Array<{
          id: string;
          executionUnitClass: string;
          status: string;
          reason: string | null;
        }>;
      }>;
    };

    expect(body.coverage).toHaveLength(1);
    const [entry] = body.coverage;
    expect(entry?.planId).toBe(plan.id);
    expect(entry?.kind).toBe('INITIAL');
    expect(entry?.completedUnits).toEqual([{ id: 'cov-unit-done', executionUnitClass: 'BROWSER' }]);
    expect(entry?.nonCompletedUnits).toEqual(
      expect.arrayContaining([
        {
          id: 'cov-unit-skipped',
          executionUnitClass: 'SOURCE_STATIC',
          status: 'SKIPPED',
          reason: 'no repository supplied',
        },
        {
          id: 'cov-unit-refused',
          executionUnitClass: 'ACTIVE_SECURITY',
          status: 'REFUSED',
          reason: 'AUTHORIZATION_EXPIRED',
        },
      ]),
    );
    expect(entry?.nonCompletedUnits).toHaveLength(2);
    const text = JSON.stringify(body);
    for (const leaked of [
      'config-must-not-leak',
      'credential-ref-must-not-leak',
      'browser.engine',
      'source.engine',
      'probe.engine',
    ]) {
      expect(text).not.toContain(leaked);
    }
    // facts only: no verdict or score
    expect(text).not.toMatch(/score|verdict/i);
  });

  it('answers an empty list for a legacy scan that has no plan', async () => {
    const { token, userId } = await signIn('cov-legacy@example.com');
    const scan = await makeScan(userId, 'QUEUED');
    const res = await request(app).get(`/scans/${scan.id}/coverage`).set(auth(token)).expect(200);
    expect(res.body).toEqual({ coverage: [] });
  });

  it('does not disclose another tenant’s coverage for a guessed scan id', async () => {
    const owner = await signIn('cov-owner2@example.com');
    const scan = await makeScan(owner.userId);
    await makePlanWithUnits(owner.userId, scan.id, scan.targetId);
    const other = await signIn('cov-other@example.com');
    const res = await request(app)
      .get(`/scans/${scan.id}/coverage`)
      .set(auth(other.token))
      .expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No such scan.' } });
  });

  it('requires authentication', async () => {
    await request(app).get('/scans/anything/coverage').expect(401);
  });
});

describe('GET /scans/:id/report carries the same coverage (N03)', () => {
  it('includes partial coverage with reasons, in the same shape as the coverage endpoint, without leaks', async () => {
    const { token, userId } = await signIn('cov-report@example.com');
    const scan = await makeScan(userId);
    await makePlanWithUnits(userId, scan.id, scan.targetId);
    const report = await request(app).get(`/scans/${scan.id}/report`).set(auth(token)).expect(200);
    const endpoint = await request(app)
      .get(`/scans/${scan.id}/coverage`)
      .set(auth(token))
      .expect(200);
    expect((report.body as { report: { coverage: unknown } }).report.coverage).toEqual(
      (endpoint.body as { coverage: unknown }).coverage,
    );
    const text = JSON.stringify(report.body);
    for (const leaked of [
      'config-must-not-leak',
      'credential-ref-must-not-leak',
      'browser.engine',
      'probe.engine',
    ]) {
      expect(text).not.toContain(leaked);
    }
  });

  it('is an empty list for a legacy scan and for failed or cancelled scans without a plan', async () => {
    const { token, userId } = await signIn('cov-report-legacy@example.com');
    const legacy = await makeScan(userId, 'QUEUED');
    const res = await request(app).get(`/scans/${legacy.id}/report`).set(auth(token)).expect(200);
    expect((res.body as { report: { coverage: unknown[] } }).report.coverage).toEqual([]);
    for (const state of ['FAILED', 'CANCELLED'] as const) {
      await testDb.scan.update({
        where: { id: legacy.id },
        data: { state, completedAt: new Date() },
      });
      const r = await request(app).get(`/scans/${legacy.id}/report`).set(auth(token)).expect(200);
      expect((r.body as { report: { coverage: unknown[] } }).report.coverage).toEqual([]);
    }
  });

  it('keeps coverage of a cancelled scan with a plan, and hides it from other tenants', async () => {
    const owner = await signIn('cov-report-own@example.com');
    const scan = await makeScan(owner.userId);
    await makePlanWithUnits(owner.userId, scan.id, scan.targetId);
    await testDb.scan.update({
      where: { id: scan.id },
      data: { state: 'CANCELLED', completedAt: new Date() },
    });
    const mine = await request(app)
      .get(`/scans/${scan.id}/report`)
      .set(auth(owner.token))
      .expect(200);
    expect((mine.body as { report: { coverage: unknown[] } }).report.coverage).toHaveLength(1);
    const other = await signIn('cov-report-other@example.com');
    await request(app).get(`/scans/${scan.id}/report`).set(auth(other.token)).expect(404);
  });
});
