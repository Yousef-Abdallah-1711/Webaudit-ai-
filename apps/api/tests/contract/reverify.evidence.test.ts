/**
 * T145 — FR-061: "return current failing evidence when a re-check does not
 * pass" — not merely a negative verdict.
 *
 * Two halves:
 *   - `recordVerificationAttempt` refuses a `FAILED` outcome with no evidence
 *     (`VerificationEvidenceMissingError`) — the requirement is a precondition,
 *     checked before any write.
 *   - a `FAILED` attempt's evidence survives the round trip and is readable
 *     over `GET /issues/:id/attempts` (FR-065: the issue's verification
 *     history).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import {
  recordVerificationAttempt,
  VerificationEvidenceMissingError,
} from '../../src/services/issues/attempts.js';

const captured: { issueId: string }[] = [];
const fakeProducer = {
  enqueueReverify(input: { issueId: string; creditsCharged: number }): Promise<{ jobId: string }> {
    captured.push({ issueId: input.issueId });
    return Promise.resolve({ jobId: `fake:${input.issueId}` });
  },
  close: () => Promise.resolve(),
};

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, issues: { producer: fakeProducer } });
const CREDS = { email: 'fr061@example.com', password: 'correct-horse-battery-staple' };

async function signInAndSeed(): Promise<{ token: string; issueId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  const token = (res.body as { accessToken: string }).accessToken;

  const target = await testDb.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://fr061.example.com', displayName: 'fr061' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SEO'],
      capabilitySnapshot: {},
      quotedCredits: 10,
      state: 'COMPLETED',
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SEO', state: 'COMPLETE', score: 50 },
  });
  const issue = await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp-1',
      checkId: 'meta.title-missing',
      severity: 'HIGH',
      title: 'Missing page title',
      explanation: 'x',
      consequence: 'y',
      location: 'https://fr061.example.com/',
      attribution: 'MEASURED',
      fixPrompt: 'add a title',
    },
  });
  return { token, issueId: issue.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  captured.length = 0;
});
afterAll(closeDb);

describe('FR-061 — a failed re-check returns current failing evidence', () => {
  it('refuses to record a FAILED attempt with no evidence', async () => {
    const { token, issueId } = await signInAndSeed();
    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);

    await expect(
      recordVerificationAttempt(testDb, {
        issueId,
        outcome: 'FAILED',
        creditsCharged: 3,
        durationMs: 4,
      }),
    ).rejects.toBeInstanceOf(VerificationEvidenceMissingError);
  });

  it('stores the failing evidence and returns it over GET /issues/:id/attempts', async () => {
    const { token, issueId } = await signInAndSeed();
    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);

    const evidence = {
      url: 'https://fr061.example.com/',
      title: null,
      note: 'No non-empty <title> tag was found.',
    };
    await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'FAILED',
      evidence,
      creditsCharged: 3,
      durationMs: 21,
    });

    const res = await request(app).get(`/issues/${issueId}/attempts`).set(auth(token)).expect(200);
    const body = res.body as { attempts: { outcome: string; evidence: unknown }[] };
    expect(body.attempts).toHaveLength(1);
    expect(body.attempts[0]?.outcome).toBe('FAILED');
    expect(body.attempts[0]?.evidence).toEqual(evidence);
  });
});

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}
