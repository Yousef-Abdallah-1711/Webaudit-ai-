/**
 * Regression test — Phase 5 engineering review (2026-09-02), Finding 1.
 *
 * The congratulations email (T166) and the certificate (T167) used to share
 * one placeholder-claim guard on `certificateKey`. A mailer failure after the
 * certificate had already been committed to its real key made the
 * release-on-failure `updateMany` match nothing — it filtered on the
 * now-overwritten placeholder — so the email was silently and permanently
 * skipped with no retry. `certificateEmailSentAt` is a second, independent
 * guard so each half can fail and retry without touching the other's state.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import type { Mailer } from '../../src/services/email/mailer.js';
import type { ReportStorage } from '../../src/services/storage/reports.js';

const CREDS = { email: 'fr072-guard@example.com', password: 'correct-horse-battery-staple' };

// No route under test enqueues a phase job, but the router constructs a
// default producer regardless of which route is hit — a fake avoids a real
// queue connection, matching readiness.premature.test.ts's convention.
const fakeProducer = {
  enqueueFirstPhase: () => Promise.resolve({ jobId: 'fake:unused' }),
  enqueuePhaseTwo: () => Promise.resolve({ jobId: 'fake:unused' }),
  close: () => Promise.resolve(),
};

async function signIn(
  app: ReturnType<typeof createApp>,
): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

async function seedGoVerdict(userId: string): Promise<{ scanId: string }> {
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: 'URL',
      canonicalValue: 'https://fr072.example.com',
      displayName: 'fr072',
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
      overallScore: 62,
    },
  });
  const readiness = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      kind: 'READINESS',
      baselineScanId: baseline.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state: 'COMPLETED',
      overallScore: 91,
      completedAt: new Date(),
    },
  });
  await testDb.readinessVerdict.create({
    data: {
      scanId: readiness.id,
      baselineScanId: baseline.id,
      isReady: true,
      overallScore: 91,
      baselineScore: 62,
      moduleOutcomes: [{ module: 'SECURITY', score: 91, threshold: 80, pass: true }],
      regressions: [],
      improvements: [],
      blockers: [],
      certificateKey: null,
    },
  });
  return { scanId: readiness.id };
}

function fakeStorage(puts: { key: string }[]): ReportStorage {
  return {
    putObject: (_scanId, key) => {
      puts.push({ key });
      return Promise.resolve();
    },
    getObject: () => Promise.reject(new Error('not used')),
    deleteScanObjects: () => Promise.resolve(0),
  };
}

/** Rejects the Nth call (1-indexed) to sendReadinessAchieved, resolves every other call. */
function flakyMailer(failOnCall: number): { mailer: Mailer; sent: number[] } {
  let calls = 0;
  const sent: number[] = [];
  const mailer: Mailer = {
    sendVerification: () => Promise.resolve(),
    sendPasswordReset: () => Promise.resolve(),
    sendPaymentConfirmation: () => Promise.resolve(),
    sendReadinessAchieved: () => {
      calls += 1;
      if (calls === failOnCall) {
        return Promise.reject(new Error('mailer unavailable'));
      }
      sent.push(calls);
      return Promise.resolve();
    },
    sendRenewalWarning: () => Promise.resolve(),
    sendRetentionWarning: () => Promise.resolve(),
  };
  return { mailer, sent };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('readiness certificate + email guard are independent (Finding 1 regression)', () => {
  it('retries the congratulations email on a later GET after the mailer fails, without regenerating the certificate', async () => {
    const puts: { key: string }[] = [];
    const { mailer } = flakyMailer(1); // fails the first send attempt
    const app = createApp({
      db: testDb,
      mailer,
      readiness: { storage: fakeStorage(puts), producer: fakeProducer },
    });
    const { token, userId } = await signIn(app);
    const { scanId } = await seedGoVerdict(userId);

    // First GET: certificate generates and commits; email attempt fails.
    const first = await request(app).get(`/scans/${scanId}/readiness`).set(auth(token)).expect(200);
    const firstVerdict = (
      first.body as { readiness: { verdict: { certificateKey: string | null } } }
    ).readiness.verdict;
    expect(firstVerdict.certificateKey).not.toBeNull();
    expect(puts).toHaveLength(1);

    const afterFirst = await testDb.readinessVerdict.findFirstOrThrow({ where: { scanId } });
    expect(afterFirst.certificateKey).not.toBeNull();
    expect(afterFirst.certificateEmailSentAt).toBeNull();

    // Second GET: certificate is not regenerated; email retries and succeeds.
    const second = await request(app)
      .get(`/scans/${scanId}/readiness`)
      .set(auth(token))
      .expect(200);
    const secondVerdict = (
      second.body as { readiness: { verdict: { certificateKey: string | null } } }
    ).readiness.verdict;
    expect(secondVerdict.certificateKey).toBe(firstVerdict.certificateKey);
    expect(puts).toHaveLength(1); // no second putObject call

    const afterSecond = await testDb.readinessVerdict.findFirstOrThrow({ where: { scanId } });
    expect(afterSecond.certificateEmailSentAt).not.toBeNull();
  });

  it('sends the email on the very first GET when nothing fails', async () => {
    const puts: { key: string }[] = [];
    const { mailer, sent } = flakyMailer(-1); // never fails
    const app = createApp({
      db: testDb,
      mailer,
      readiness: { storage: fakeStorage(puts), producer: fakeProducer },
    });
    const { token, userId } = await signIn(app);
    const { scanId } = await seedGoVerdict(userId);

    await request(app).get(`/scans/${scanId}/readiness`).set(auth(token)).expect(200);
    expect(sent).toEqual([1]);

    const verdict = await testDb.readinessVerdict.findFirstOrThrow({ where: { scanId } });
    expect(verdict.certificateEmailSentAt).not.toBeNull();

    // A third GET must not re-send.
    await request(app).get(`/scans/${scanId}/readiness`).set(auth(token)).expect(200);
    expect(sent).toEqual([1]);
  });

  it('returns 202 GENERATING for the certificate while it is mid-claim, not a plain 404', async () => {
    // A storage whose putObject never resolves during this test's own request,
    // so the claim placeholder ('') is still in place when /certificate is hit.
    const stallingStorage: ReportStorage = {
      putObject: () => new Promise(() => {}),
      getObject: () => Promise.reject(new Error('not used')),
      deleteScanObjects: () => Promise.resolve(0),
    };
    const { mailer } = flakyMailer(-1);
    const app = createApp({
      db: testDb,
      mailer,
      readiness: { storage: stallingStorage, producer: fakeProducer },
    });
    const { token, userId } = await signIn(app);
    const { scanId } = await seedGoVerdict(userId);

    // supertest's Test object is a thenable that only dispatches once .then()/.end()/await
    // is invoked on it — a bare, unchained call never sends the request at all. Attaching
    // .catch() here forces dispatch while still not awaiting the response, and swallows
    // (rather than leaving unhandled) a rejection if this request ever settles non-2xx.
    void request(app)
      .get(`/scans/${scanId}/readiness`)
      .set(auth(token))
      .catch(() => {});
    await new Promise((r) => setTimeout(r, 50)); // let the claim's updateMany land

    const res = await request(app).get(`/scans/${scanId}/readiness/certificate`).set(auth(token));
    expect(res.status).toBe(202);
    expect((res.body as { error: { code: string } }).error.code).toBe('CERTIFICATE_GENERATING');
  });
});
