/**
 * T199/T200 — FR-040/FR-041/FR-042: the user-facing side of the mid-audit
 * design-intent questionnaire.
 *
 *   GET  /scans/:id/questionnaire         FR-040
 *   POST /scans/:id/questionnaire         FR-040. Resumes the scan (R4).
 *   POST /scans/:id/questionnaire/skip    FR-042
 *
 * `apps/worker`'s own `awaitQuestionnaire`/`resumeAfterQuestionnaire`
 * (`phases.ts`, T194) and the deadline-side handler
 * (`questionnaire-timeout-handler.ts`, T196) are already built and tested in
 * isolation. This file is the executable spec for the other side of that
 * same race: the API routes a human actually hits. Scans are seeded directly
 * at `AWAITING_QUESTIONNAIRE` (and, for the race test, directly at
 * `RUNNING_PHASE_2`) rather than driven there through a real worker — that
 * pause is `apps/worker`'s own already-tested behaviour, not this file's
 * concern.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();

const enqueuedFirst: { scanId: string }[] = [];
const enqueuedSecond: {
  scanId: string;
  modules: readonly string[];
  /**
   * Whether a `DesignIntent` row for this scan was already durable at the
   * instant the enqueue happened.
   *
   * The enqueue is the moment the phase-2 job becomes visible to a worker, and
   * reading that row is among the job's first acts
   * (`buildDesignIntentInput`). `resume()` used to write the row *after* the
   * enqueue, so a fast worker could find nothing, omit `designIntent` from
   * `CapabilityInput` entirely, and silently audit the design with none of the
   * answers the user just typed. This fake stands in for that fast worker: it
   * observes the database from inside the enqueue, which is the only place the
   * ordering is visible at all.
   */
  designIntentAlreadyWritten: boolean;
}[] = [];
const fakeProducer = {
  enqueueFirstPhase: (input: { scanId: string }) => {
    enqueuedFirst.push({ scanId: input.scanId });
    return Promise.resolve({ jobId: `fake:${input.scanId}:1` });
  },
  enqueuePhaseTwo: async (input: { scanId: string; modules: readonly string[] }) => {
    const intent = await testDb.designIntent.findUnique({ where: { scanId: input.scanId } });
    enqueuedSecond.push({
      scanId: input.scanId,
      modules: input.modules,
      designIntentAlreadyWritten: intent !== null,
    });
    return { jobId: `fake:${input.scanId}:2` };
  },
  close: () => Promise.resolve(),
};

const app = createApp({ db: testDb, mailer, scans: { producer: fakeProducer } });

const CREDS = { email: 'questionnaire@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function seedScan(
  userId: string,
  state: 'AWAITING_QUESTIONNAIRE' | 'RUNNING_PHASE_2',
  deadline: Date | null,
): Promise<{ scanId: string }> {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: 'https://questionnaire.example.com',
      displayName: 'questionnaire-target',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      kind: 'INITIAL',
      requestedModules: ['UI'],
      capabilitySnapshot: {},
      quotedCredits: 15,
      chargedCredits: 15,
      state,
      questionnaireDeadline: deadline,
    },
  });
  return { scanId: scan.id };
}

let token = '';
let userId = '';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  enqueuedFirst.length = 0;
  enqueuedSecond.length = 0;
  const signed = await signIn();
  token = signed.token;
  userId = signed.userId;
});
afterAll(closeDb);

describe('GET /scans/:id/questionnaire (FR-040)', () => {
  it('returns the deadline and the published questions for a paused scan', async () => {
    const deadline = new Date(Date.now() + 600_000);
    const { scanId } = await seedScan(userId, 'AWAITING_QUESTIONNAIRE', deadline);

    const res = await request(app)
      .get(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .expect(200);

    const body = (
      res.body as {
        questionnaire: {
          state: string;
          resolved: boolean;
          questionnaireDeadline: string;
          questions: { id: string }[];
          waitMs: number;
        };
      }
    ).questionnaire;
    expect(body.state).toBe('AWAITING_QUESTIONNAIRE');
    expect(body.resolved).toBe(false);
    expect(new Date(body.questionnaireDeadline).getTime()).toBe(deadline.getTime());
    expect(body.questions.map((q) => q.id)).toEqual([
      'audience',
      'stylePreference',
      'admiredReferences',
      'brandColors',
    ]);
    expect(body.waitMs).toBeGreaterThan(0);
  });

  it('reports resolved once the scan has moved past the pause', async () => {
    const { scanId } = await seedScan(userId, 'RUNNING_PHASE_2', null);

    const res = await request(app)
      .get(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .expect(200);

    const body = (res.body as { questionnaire: { state: string; resolved: boolean } })
      .questionnaire;
    expect(body.state).toBe('RUNNING_PHASE_2');
    expect(body.resolved).toBe(true);
  });

  it('404s for a scan that does not exist', async () => {
    const res = await request(app)
      .get('/scans/does-not-exist/questionnaire')
      .set(auth(token))
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /scans/:id/questionnaire (FR-040)', () => {
  it('answers, resumes the scan, records SUPPLIED, and enqueues phase 2', async () => {
    const { scanId } = await seedScan(
      userId,
      'AWAITING_QUESTIONNAIRE',
      new Date(Date.now() + 600_000),
    );

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .send({
        audience: 'Small business owners',
        stylePreference: 'Minimal',
        admiredReferences: ['https://stripe.com'],
        brandColors: ['#123456'],
      })
      .expect(200);

    expect((res.body as { scan: { state: string } }).scan.state).toBe('RUNNING_PHASE_2');

    const scan = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan.state).toBe('RUNNING_PHASE_2');
    expect(scan.questionnaireDeadline).toBeNull();

    const intent = await testDb.designIntent.findUniqueOrThrow({ where: { scanId } });
    expect(intent.source).toBe('SUPPLIED');
    expect(intent.answeredAt).not.toBeNull();
    expect(intent.audience).toBe('Small business owners');
    expect(intent.stylePreference).toBe('Minimal');
    expect(intent.admiredReferences).toEqual(['https://stripe.com']);
    expect(intent.brandColors).toEqual(['#123456']);

    expect(enqueuedSecond).toHaveLength(1);
    expect(enqueuedSecond[0]?.scanId).toBe(scanId);
    expect(enqueuedSecond[0]?.modules).toEqual(['UI']);
    // The answers were durable before the job a worker could pick up existed.
    expect(
      enqueuedSecond[0]?.designIntentAlreadyWritten,
      'the DesignIntent row must be written before phase 2 is enqueued, or a fast ' +
        'worker audits the design with no answers at all',
    ).toBe(true);
  });

  it('accepts a partial answer — every field is optional', async () => {
    const { scanId } = await seedScan(
      userId,
      'AWAITING_QUESTIONNAIRE',
      new Date(Date.now() + 600_000),
    );

    await request(app)
      .post(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .send({ audience: 'Just this one field' })
      .expect(200);

    const intent = await testDb.designIntent.findUniqueOrThrow({ where: { scanId } });
    expect(intent.source).toBe('SUPPLIED');
    expect(intent.audience).toBe('Just this one field');
    expect(intent.stylePreference).toBeNull();
    expect(intent.admiredReferences).toEqual([]);
  });

  it('400s a wrong-typed field', async () => {
    const { scanId } = await seedScan(
      userId,
      'AWAITING_QUESTIONNAIRE',
      new Date(Date.now() + 600_000),
    );

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .send({ audience: 12345 })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(await testDb.designIntent.count()).toBe(0);
    expect(enqueuedSecond).toHaveLength(0);
  });

  it('409s when the deadline has already won the race, and writes nothing', async () => {
    // Simulates the worker's own deadline handler having already resumed this
    // scan — seeded directly at RUNNING_PHASE_2, deadline already cleared,
    // exactly what resumeAfterQuestionnaire's guarded transition leaves
    // behind.
    const { scanId } = await seedScan(userId, 'RUNNING_PHASE_2', null);

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .send({ audience: 'too late' })
      .expect(409);

    expect(res.body.error.code).toBe('QUESTIONNAIRE_ALREADY_RESOLVED');
    expect(await testDb.designIntent.count()).toBe(0);
    expect(enqueuedSecond).toHaveLength(0);
  });

  it("404s for a scan that is not the caller's", async () => {
    const other = await testDb.user.create({
      data: { email: 'someone-else@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    const { scanId } = await seedScan(
      other.id,
      'AWAITING_QUESTIONNAIRE',
      new Date(Date.now() + 600_000),
    );

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire`)
      .set(auth(token))
      .send({})
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});

describe('POST /scans/:id/questionnaire/skip (FR-042)', () => {
  it('skips, resumes the scan, records SKIPPED with no content fields, and enqueues phase 2', async () => {
    const { scanId } = await seedScan(
      userId,
      'AWAITING_QUESTIONNAIRE',
      new Date(Date.now() + 600_000),
    );

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire/skip`)
      .set(auth(token))
      .expect(200);

    expect((res.body as { scan: { state: string } }).scan.state).toBe('RUNNING_PHASE_2');

    const intent = await testDb.designIntent.findUniqueOrThrow({ where: { scanId } });
    expect(intent.source).toBe('SKIPPED');
    expect(intent.answeredAt).toBeNull();
    expect(intent.audience).toBeNull();
    expect(intent.admiredReferences).toEqual([]);

    expect(enqueuedSecond).toHaveLength(1);
    expect(enqueuedSecond[0]?.scanId).toBe(scanId);
    // Same ordering on the skip path — the SKIPPED row is what tells the report
    // intent was declined rather than never asked for.
    expect(enqueuedSecond[0]?.designIntentAlreadyWritten).toBe(true);
  });

  it('409s when already resolved, and writes nothing', async () => {
    const { scanId } = await seedScan(userId, 'RUNNING_PHASE_2', null);

    const res = await request(app)
      .post(`/scans/${scanId}/questionnaire/skip`)
      .set(auth(token))
      .expect(409);

    expect(res.body.error.code).toBe('QUESTIONNAIRE_ALREADY_RESOLVED');
    expect(await testDb.designIntent.count()).toBe(0);
    expect(enqueuedSecond).toHaveLength(0);
  });

  it('404s for a scan that does not exist', async () => {
    const res = await request(app)
      .post('/scans/does-not-exist/questionnaire/skip')
      .set(auth(token))
      .expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
