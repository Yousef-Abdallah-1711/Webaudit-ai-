/**
 * N04 (FR-027/FR-027a): authenticated progress recovery. Realtime events are best-effort; the authoritative recovery
 * path after a reconnect is `GET /scans/:id` (database state, tenant-scoped). The WebSocket channel's per-subscribe
 * authorisation is covered by `tests/adverse/realtime-authorisation.test.ts`; this file covers the HTTP channel and the
 * no-resurrection rule for a client that missed events.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { snapshotProgress } from '../../src/services/execution-runtime/progress.js';

const app = createApp({ db: testDb, mailer: createCapturingMailer() });
const PASSWORD = 'correct-horse-battery-staple';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signIn(email: string): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send({ email, password: PASSWORD }).expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

async function scanWithRunningUnit(userId: string) {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: `https://${userId}.example.com`,
      displayName: 'e',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      state: 'RUNNING_PHASE_1',
      requestedModules: ['SECURITY'],
      capabilitySnapshot: [],
      quotedCredits: 0,
      chargedCredits: 0,
      startedAt: new Date(),
    },
  });
  const plan = await testDb.scanPlan.create({
    data: { kind: 'INITIAL', userId, scanId: scan.id, state: 'RESOLVED', deadlineMs: 900_000 },
  });
  const unit = await testDb.executionUnit.create({
    data: {
      id: `recov-${userId}`,
      scanPlanId: plan.id,
      userId,
      targetId: target.id,
      executionUnitClass: 'BROWSER',
      engineId: 'e',
      configuration: {},
      priority: 0,
      timeoutPolicyMs: 60_000,
      retryPolicy: { maxAttempts: 1 },
      requiresSafetyCheckpoint: true,
      idempotencyKey: `recov-${userId}:1`,
      status: 'RUNNING',
    },
  });
  return { scan, unit };
}

beforeEach(resetDb);
afterAll(closeDb);

describe('progress recovery over HTTP', () => {
  it('serves the latest durable unit snapshot, then the terminal state, to a client that missed every event', async () => {
    const { token, userId } = await signIn('recover-owner@example.com');
    const { scan, unit } = await scanWithRunningUnit(userId);

    expect(
      await snapshotProgress(
        testDb,
        unit.id,
        { label: 'crawl', completedUnits: 3, totalUnits: 10 },
        { boundary: true },
      ),
    ).toBe('APPLIED');
    const mid = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const midUnit = (
      mid.body as {
        scan: {
          executionPlans: Array<{
            units: Array<{ status: string; progressSnapshot: { completedUnits: number } }>;
          }>;
        };
      }
    ).scan.executionPlans[0]?.units[0];
    expect(midUnit?.status).toBe('RUNNING');
    expect(midUnit?.progressSnapshot.completedUnits).toBe(3);

    // The unit finishes while the client is disconnected; the next read must show the terminal state (no missed terminal).
    await testDb.$queryRaw`SELECT public.fahes_finalize_unit(${unit.id}, ${unit.idempotencyKey}, 'COMPLETED', NULL, NULL, NULL)`;
    const after = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const unitAfter = (
      after.body as { scan: { executionPlans: Array<{ units: Array<{ status: string }> }> } }
    ).scan.executionPlans[0]?.units[0];
    expect(unitAfter?.status).toBe('COMPLETED');
  });

  it('never lets a late progress write resurrect a terminal unit', async () => {
    const { token, userId } = await signIn('recover-late@example.com');
    const { scan, unit } = await scanWithRunningUnit(userId);
    await testDb.$queryRaw`SELECT public.fahes_finalize_unit(${unit.id}, ${unit.idempotencyKey}, 'COMPLETED', NULL, NULL, NULL)`;
    const anomalies: string[] = [];
    expect(
      await snapshotProgress(
        testDb,
        unit.id,
        { label: 'late', completedUnits: 1, totalUnits: 2 },
        { boundary: true, onAnomaly: (m) => anomalies.push(m) },
      ),
    ).toBe('REJECTED_TERMINAL');
    expect(anomalies).toHaveLength(1);
    const res = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const u = (
      res.body as {
        scan: {
          executionPlans: Array<{ units: Array<{ status: string; progressSnapshot: unknown }> }>;
        };
      }
    ).scan.executionPlans[0]?.units[0];
    expect(u?.status).toBe('COMPLETED');
    expect(JSON.stringify(u?.progressSnapshot ?? null)).not.toContain('late');
  });

  it('does not expose another tenant scan or its units on the recovery read', async () => {
    const owner = await signIn('recover-a@example.com');
    const other = await signIn('recover-b@example.com');
    const { scan } = await scanWithRunningUnit(owner.userId);
    await request(app).get(`/scans/${scan.id}`).set(auth(other.token)).expect(404);
    await request(app).get(`/scans/${scan.id}`).expect(401);
  });
});
