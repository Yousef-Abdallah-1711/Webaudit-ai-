/**
 * GET /scans/:id — found missing while manually testing the live-progress
 * screen (apps/web/components/scan/ScanProgress.tsx): its per-module
 * "Waiting"/"Running"/"Complete" badges update ONLY from realtime
 * `module:started`/`module:complete` WebSocket events, with no REST fallback
 * — so a dropped or raced connection (observed live: React's dev-mode
 * double-effect racing against an already-fast scan) leaves every badge
 * stuck on "Waiting" forever, even after the scan has genuinely completed
 * and the report is ready. FR-047 says a client recovers "current state"
 * from the database on reconnect; per-module state was never part of that
 * state. This is the fix: `moduleResults` on the response, so the
 * frontend's own resync (`onResync` -> `refetch`) can backfill it.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const CREDS = { email: 'scan-get@example.com', password: 'correct-horse-battery-staple' };

async function signIn(credentials = CREDS): Promise<string> {
  await request(app).post('/auth/register').send(credentials).expect(201);
  await testDb.user.update({
    where: { email: credentials.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(credentials).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

function auth(bearer: string) {
  return { Authorization: `Bearer ${bearer}` };
}

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /scans/:id', () => {
  it("includes each requested module's real state, not just the aggregate scan state", async () => {
    const token = await signIn();
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'example.com',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        state: 'COMPLETED',
        requestedModules: ['SECURITY', 'SEO'],
        capabilitySnapshot: [],
        quotedCredits: 30,
        chargedCredits: 30,
      },
    });
    await testDb.moduleResult.create({
      data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 69 },
    });
    await testDb.moduleResult.create({
      data: {
        scanId: scan.id,
        module: 'SEO',
        state: 'DEGRADED',
        score: 91,
        degradedReason: 'provider exhausted',
      },
    });

    const res = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const body = res.body as {
      scan: { moduleResults: { module: string; state: string }[] };
    };

    expect(body.scan.moduleResults).toHaveLength(2);
    const byModule = new Map(body.scan.moduleResults.map((m) => [m.module, m.state]));
    expect(byModule.get('SECURITY')).toBe('COMPLETE');
    expect(byModule.get('SEO')).toBe('DEGRADED');
  });

  it('returns an empty moduleResults array before any phase has run', async () => {
    const token = await signIn();
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'example.com',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        state: 'QUEUED',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: [],
        quotedCredits: 20,
      },
    });

    const res = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const body = res.body as { scan: { moduleResults: unknown[] } };
    expect(body.scan.moduleResults).toEqual([]);
  });

  it('returns the durable execution-unit progress snapshot without execution secrets', async () => {
    const token = await signIn();
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'example.com',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        state: 'RUNNING_PHASE_1',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: [],
        quotedCredits: 30,
        chargedCredits: 30,
        startedAt: new Date(),
      },
    });
    const plan = await testDb.scanPlan.create({
      data: {
        kind: 'INITIAL',
        userId: user.id,
        scanId: scan.id,
        state: 'RESOLVED',
        deadlineMs: 600_000,
      },
    });
    const unit = await testDb.executionUnit.create({
      data: {
        id: 'scan-get-progress-unit',
        scanPlanId: plan.id,
        userId: user.id,
        targetId: target.id,
        executionUnitClass: 'BROWSER',
        engineId: 'browser.engine',
        configuration: { secret: 'config-must-not-leak' },
        priority: 1,
        timeoutPolicyMs: 30_000,
        retryPolicy: { maxAttempts: 1 },
        requiresSafetyCheckpoint: true,
        idempotencyKey: 'scan-get-progress-unit:1',
        status: 'RUNNING',
        progressSnapshot: {
          label: 'Opening pages',
          completedUnits: null,
          totalUnits: null,
          at: new Date().toISOString(),
        },
        progressIndeterminate: true,
        credentialBindingRef: 'credential-ref-must-not-leak',
        startedAt: new Date(),
      },
    });

    const res = await request(app).get(`/scans/${scan.id}`).set(auth(token)).expect(200);
    const body = res.body as {
      scan: {
        executionPlans: {
          kind: string;
          state: string;
          id: string;
          units: {
            id: string;
            executionUnitClass: string;
            status: string;
            progressSnapshot: { label: string };
            progressIndeterminate: boolean;
          }[];
        }[];
      };
    };

    expect(body.scan.executionPlans).toEqual([
      {
        id: plan.id,
        kind: 'INITIAL',
        state: 'RESOLVED',
        units: [
          {
            id: unit.id,
            executionUnitClass: 'BROWSER',
            status: 'RUNNING',
            progressSnapshot: expect.objectContaining({ label: 'Opening pages' }),
            progressIndeterminate: true,
          },
        ],
      },
    ]);
    expect(JSON.stringify(body)).not.toContain('config-must-not-leak');
    expect(JSON.stringify(body)).not.toContain('credential-ref-must-not-leak');
    expect(JSON.stringify(body)).not.toContain('browser.engine');
  });

  it('does not disclose another tenant’s execution plans for a guessed scan id', async () => {
    const ownerToken = await signIn({
      email: 'scan-get-owner@example.com',
      password: CREDS.password,
    });
    const owner = await testDb.user.findUniqueOrThrow({
      where: { email: 'scan-get-owner@example.com' },
    });
    const target = await testDb.target.create({
      data: {
        userId: owner.id,
        inputType: 'URL',
        canonicalValue: 'https://owner.example.com',
        displayName: 'owner.example.com',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: owner.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: [],
        quotedCredits: 30,
        chargedCredits: 30,
      },
    });

    const otherToken = await signIn({
      email: 'scan-get-other@example.com',
      password: CREDS.password,
    });
    const res = await request(app).get(`/scans/${scan.id}`).set(auth(otherToken)).expect(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'No such scan.' } });
    expect(ownerToken).not.toBe(otherToken);
  });
});
