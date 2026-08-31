/**
 * T147 — FR-063: "mark an issue unverifiable, rather than resolved, when its
 * check can no longer be performed."
 *
 * The worker's runner produces `UNVERIFIABLE` in two cases — a check with no
 * registered re-verification entry point (`resolve-check.ts` returns nothing),
 * and a capability whose `reverify` answers `{ outcome: 'UNVERIFIABLE' }`. Both
 * arrive here, at `recordVerificationAttempt`, as `outcome: 'UNVERIFIABLE'`.
 * This suite pins what that must and must not do:
 *
 *   - it lands the issue in `UNVERIFIABLE`, never `RESOLVED` (SC-007 again);
 *   - the 3-credit re-check charge is refunded — "we cannot check this" is a
 *     gap in our coverage, not a service (FR-075);
 *   - the issue can be asserted fixed again from `UNVERIFIABLE`, so a user who
 *     later makes the check performable is not locked out.
 *
 * The worker-side detection of "no entry point" has its own test in
 * `apps/worker/tests/integration/reverify.test.ts`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import {
  assertResolvedOnlyOnPass,
  canAssertFixed,
  outcomeToState,
} from '../../src/services/issues/state-machine.js';
import { recordVerificationAttempt } from '../../src/services/issues/attempts.js';

const fakeProducer = {
  enqueueReverify: (input: { issueId: string }) =>
    Promise.resolve({ jobId: `fake:${input.issueId}` }),
  close: () => Promise.resolve(),
};

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, issues: { producer: fakeProducer } });
const CREDS = { email: 'fr063@example.com', password: 'correct-horse-battery-staple' };

async function signInAndSeed(): Promise<{ token: string; issueId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  const token = (res.body as { accessToken: string }).accessToken;

  const target = await testDb.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://fr063.example.com', displayName: 'fr063' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['UI'],
      capabilitySnapshot: {},
      quotedCredits: 25,
      state: 'COMPLETED',
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'UI', state: 'DEGRADED', score: 60 },
  });
  // An AI-judgment issue: no code-layer check owns it, so it has no
  // re-verification entry point — exactly FR-063's case.
  const issue = await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp-ai-1',
      checkId: 'ai.ui.judgment',
      severity: 'HIGH',
      title: 'CTA and severity chips share a hue',
      explanation: 'x',
      consequence: 'y',
      location: null,
      attribution: 'AI_JUDGMENT',
      fixPrompt: 'give chips a distinct hue',
    },
  });
  return { token, issueId: issue.id };
}

async function debitIdFor(issueId: string): Promise<string> {
  const tx = await testDb.creditTransaction.findFirst({
    where: { issueId, type: 'DEBIT' },
    orderBy: { createdAt: 'desc' },
  });
  return tx!.id;
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('FR-063 — an uncheckable issue is UNVERIFIABLE, never RESOLVED', () => {
  it('UNVERIFIABLE can never map to RESOLVED', () => {
    expect(outcomeToState('UNVERIFIABLE')).toBe('UNVERIFIABLE');
    expect(() => {
      assertResolvedOnlyOnPass('UNVERIFIABLE', 'RESOLVED');
    }).toThrow();
  });

  it('records UNVERIFIABLE, refunds the re-check, and stays re-assertable', async () => {
    const { token, issueId } = await signInAndSeed();
    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    const debitId = await debitIdFor(issueId);

    const result = await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'UNVERIFIABLE',
      evidence: { reason: 'No re-verification entry point is registered for ai.ui.judgment.' },
      creditsCharged: 3,
      durationMs: 2,
      debitTransactionId: debitId,
    });

    expect(result.issueState).toBe('UNVERIFIABLE');
    expect(result.creditsRefunded).toBe(3);

    const issue = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.state).toBe('UNVERIFIABLE');
    expect(issue.resolvedAt).toBeNull();

    const refund = await testDb.creditTransaction.findFirst({
      where: { reversesId: debitId, type: 'REFUND' },
    });
    expect(refund?.amount).toBe(3);

    // FR: the user can try again once the check becomes performable.
    expect(canAssertFixed(issue.state)).toBe(true);
  });

  it('a second assert-fixed from UNVERIFIABLE is accepted by the route', async () => {
    const { token, issueId } = await signInAndSeed();
    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'UNVERIFIABLE',
      evidence: { reason: 'no entry point' },
      creditsCharged: 3,
      durationMs: 1,
      debitTransactionId: await debitIdFor(issueId),
    });

    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    expect((await testDb.issue.findUniqueOrThrow({ where: { id: issueId } })).state).toBe(
      'ASSERTED_FIXED',
    );
  });
});
