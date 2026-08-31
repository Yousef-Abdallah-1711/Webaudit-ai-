/**
 * T108 — US1 acceptance scenario 8: "Given a target the user has attested
 * to but not verified control of, When an audit including load generation
 * is requested, Then the audit runs every other check, reports the
 * load-generating check as unavailable pending verification, and does not
 * charge for it."
 *
 * **Scoped at module granularity, not check granularity — a deliberate
 * simplification, not an oversight.** The credit schedule
 * (`packages/config/src/pricing.ts`) prices whole modules (`SECURITY`=20,
 * `SEO`=10, …), never individual checks — there is no per-check price to
 * exclude. None of the first vertical slice's six capabilities (T119–124)
 * requires `VERIFIED` control either, so there is no real capability today
 * whose selection can exercise a genuinely mixed gated/non-gated module.
 * This file treats "the load-generating check" as if it were an entire
 * module's worth of checks, via the same `AppDeps.scans.
 * resolveRequiredControlLevel` seam T106 (`scans.refusals.test.ts`)
 * established: `SECURITY` resolves to `VERIFIED` on this target, `SEO`
 * does not. True per-check gating inside a single module needs a real
 * capability with `requiredControlLevel: 'VERIFIED'` (none exist yet) and
 * belongs to a finer-grained test once one does.
 *
 * **GREEN as of the 2026-08-30 engineering-review remediation.** The second
 * assertion (`chargedCredits < quotedCredits`) was a long-standing documented
 * RED — `create-scan.ts` debited the whole accepted quote and never excluded a
 * gated module's share. It now debits only the modules whose control gate is
 * met, and this test raises every SECURITY capability to
 * `requiredControlLevel: VERIFIED` in the registry the orchestrator reads, so
 * SECURITY is genuinely gated at execution and resolves NOT_APPLICABLE while
 * SEO completes. Same real `startApi` + `startWorker` composition as T107.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { WebSocket } from 'ws';
import { QueueEvents, type ConnectionOptions } from 'bullmq';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { createApp } from '../../src/app.js';
import { startApi, type ApiService } from '../../src/index.js';
import { startWorker, type WorkerService } from '@webaudit/worker';

const connection: ConnectionOptions = {
  url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
  maxRetriesPerRequest: null,
};

/** SECURITY needs VERIFIED control on this suite's target; SEO needs none. */
const requiredControlLevel: Record<string, 'NONE' | 'ATTESTED' | 'VERIFIED'> = {
  SECURITY: 'VERIFIED',
  SEO: 'NONE',
};

const mailer = createCapturingMailer();
const app = createApp({
  db: testDb,
  mailer,
  scans: {
    resolveRequiredControlLevel: (moduleType: string) => requiredControlLevel[moduleType] ?? 'NONE',
  },
});

let api: ApiService | undefined;
let worker: WorkerService | undefined;
let queueEvents: QueueEvents | undefined;

const CREDS = { email: 'gated@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

function auth(bearer: string) {
  return { Authorization: `Bearer ${bearer}` };
}

async function connect(port: number): Promise<{
  send(message: unknown): void;
  next(ms?: number): Promise<Record<string, unknown> | undefined>;
  close(): void;
}> {
  const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/realtime`);
  const waiting: ((value: Record<string, unknown>) => void)[] = [];
  const buffered: Record<string, unknown>[] = [];

  socket.on('message', (data: Buffer) => {
    const parsed = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
    const next = waiting.shift();
    if (next !== undefined) next(parsed);
    else buffered.push(parsed);
  });

  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  return {
    send: (message) => socket.send(JSON.stringify(message)),
    next: (ms = 500) => {
      const already = buffered.shift();
      if (already !== undefined) return Promise.resolve(already);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(undefined), ms);
        waiting.push((value) => {
          clearTimeout(timer);
          resolve(value);
        });
      });
    },
    close: () => socket.close(),
  };
}

beforeEach(async () => {
  process.env['WORKSPACE_BASE_DIR'] = tmpdir();
  await resetDb();
  await seedPlans();
  mailer.clear();
});

afterEach(async () => {
  await queueEvents?.close();
  queueEvents = undefined;
  await worker?.shutdown('test cleanup');
  worker = undefined;
  await api?.shutdown('test cleanup');
  api = undefined;
});

afterAll(closeDb);

describe('a scan mixing a gated and a non-gated module (US1 scenario 8)', () => {
  it('starts rather than refusing, on an attested-only (not verified) target', async () => {
    const token = await signIn();
    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(201);
    const targetId = (target.body as { target: { id: string } }).target.id;
    await request(app).post(`/targets/${targetId}/attest`).set(auth(token)).expect(200);

    const quote = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'] })
      .expect(200);

    // The contract's own words: "A scan whose selection includes a gated
    // check still starts." Not 403 — this is the boundary T106 already
    // draws around this file: 403 is only for a selection that is *entirely*
    // gated out.
    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({
        targetId,
        modules: ['SECURITY', 'SEO'],
        acceptedQuote: (quote.body as { quote: { credits: number } }).quote.credits,
      })
      .expect(201);

    expect((res.body as { scan: { state: string } }).scan.state).not.toBe('FAILED');
  });

  it('completes the non-gated module and does not charge for the gated one', async () => {
    api = await startApi({ db: testDb, port: 0, installSignalHandlers: false });
    // `startApi` reconciled the 13 real capabilities at their manifest control
    // levels (all NONE). This scenario needs SECURITY to be genuinely gated at
    // *execution* time, not only at the create-time seam — so raise every
    // SECURITY capability to VERIFIED in the registry the orchestrator reads.
    // With the target only attested, all of them are skipped and SECURITY
    // resolves NOT_APPLICABLE; SEO is untouched and completes; create-scan
    // charges for SEO only.
    await testDb.capability.updateMany({
      where: { module: 'SECURITY' },
      data: { requiredControlLevel: 'VERIFIED' },
    });
    worker = startWorker({ connection, db: testDb, installSignalHandlers: false });
    queueEvents = new QueueEvents(worker.queues.scanPhase.name, { connection });
    await queueEvents.waitUntilReady();

    const token = await signIn();
    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'URL', value: 'https://example.com/' })
      .expect(201);
    const targetId = (target.body as { target: { id: string } }).target.id;
    await request(app).post(`/targets/${targetId}/attest`).set(auth(token)).expect(200);

    const quote = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'] })
      .expect(200);
    const quotedCredits = (quote.body as { quote: { credits: number } }).quote.credits;

    const created = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'], acceptedQuote: quotedCredits })
      .expect(201);
    const scanId = (created.body as { scan: { id: string } }).scan.id;

    const client = await connect(api.port);
    client.send({ action: 'subscribe', scanId, token });
    expect(await client.next(2_000)).toEqual({ type: 'subscribed', scanId });

    // Wait for whatever this scan's phase job settles as — currently a
    // JobNotImplementedError failure, later a real completed phase.
    await new Promise<void>((resolve) => {
      queueEvents?.on('failed', () => resolve());
      queueEvents?.on('completed', () => resolve());
      setTimeout(resolve, 3_000);
    });

    const row = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });

    // FR-053/US1 scenario 8: the gated module contributes nothing to the
    // charge, and the non-gated module's full cost is still collected —
    // chargedCredits must land strictly between "nothing" and the full
    // quoted price for both.
    expect(row.chargedCredits).toBeGreaterThan(0);
    expect(row.chargedCredits).toBeLessThan(quotedCredits);

    const securityResult = await testDb.moduleResult.findUnique({
      where: { scanId_module: { scanId, module: 'SECURITY' } },
    });
    const seoResult = await testDb.moduleResult.findUnique({
      where: { scanId_module: { scanId, module: 'SEO' } },
    });
    // The gated module never reads as a pass (FR-053) — NOT_APPLICABLE or
    // DEGRADED, never COMPLETE, since the control level was never met.
    expect(securityResult?.state).not.toBe('COMPLETE');
    // The non-gated module is unaffected by its sibling's gating (FR-043's
    // sibling guarantee, applied across modules rather than across the
    // questionnaire pause it was written for).
    expect(seoResult?.state).toBe('COMPLETE');

    client.close();
  }, 20_000);
});
