/**
 * T144 — SC-007, stated adversarially: "Zero issues turn green without a check
 * passing, verified by adversarial testing in which issues are falsely
 * asserted as fixed."
 *
 * The three shapes the criterion names:
 *
 *   - **unchanged assertion** — a user presses "I fixed this" having changed
 *     nothing. The re-check returns `FAILED`; the issue must stay `OPEN`.
 *   - **bulk assert-all** — every issue asserted at once, nothing changed.
 *     Not one turns green.
 *   - **a throwing check** — the re-verification check itself errors. That is
 *     `ERRORED`, not a pass; the issue does not resolve, and the charge is
 *     refunded (FR-075).
 *
 * All three run through `recordVerificationAttempt` (`services/issues/
 * attempts.ts`), which is the **only** writer of `Issue.state = RESOLVED`
 * anywhere in the system. `outcomeToState` is a total function whose only
 * `RESOLVED` branch is `PASSED`, and `assertResolvedOnlyOnPass` re-checks that
 * at runtime before the guarded write. The positive control at the end proves
 * a genuine `PASSED` *does* resolve — so the suite is testing a lock, not a
 * wall.
 *
 * The assertion itself goes through the real `POST /issues/:id/assert-fixed`
 * route (with a capturing fake re-verify producer, so no worker is needed);
 * the verdict is then applied directly, standing in for the worker's runner.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import {
  assertResolvedOnlyOnPass,
  outcomeToState,
} from '../../src/services/issues/state-machine.js';
import { recordVerificationAttempt } from '../../src/services/issues/attempts.js';

interface CapturedJob {
  issueId: string;
  debitTransactionId?: string;
  creditsCharged: number;
}

const captured: CapturedJob[] = [];
const fakeProducer = {
  enqueueReverify(input: CapturedJob): Promise<{ jobId: string }> {
    captured.push(input);
    return Promise.resolve({ jobId: `fake:${input.issueId}` });
  },
  close: () => Promise.resolve(),
};

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, issues: { producer: fakeProducer } });

const CREDS = { email: 'sc007@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

async function seedScanWithIssues(
  userId: string,
  count: number,
): Promise<{ scanId: string; issueIds: string[] }> {
  const target = await testDb.target.create({
    data: { userId, inputType: 'URL', canonicalValue: 'https://sc007.example.com', displayName: 'sc007' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId: target.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      state: 'COMPLETED',
    },
  });
  const moduleResult = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 40 },
  });
  const issueIds: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const issue = await testDb.issue.create({
      data: {
        scanId: scan.id,
        moduleResultId: moduleResult.id,
        fingerprint: `fp-${String(i)}`,
        checkId: 'headers.csp-missing',
        severity: 'HIGH',
        title: `Issue ${String(i)}`,
        explanation: 'x',
        consequence: 'y',
        location: 'https://sc007.example.com/',
        attribution: 'MEASURED',
        fixPrompt: 'do the thing',
      },
    });
    issueIds.push(issue.id);
  }
  return { scanId: scan.id, issueIds };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function debitIdFor(issueId: string): Promise<string> {
  const tx = await testDb.creditTransaction.findFirst({
    where: { issueId, type: 'DEBIT' },
    orderBy: { createdAt: 'desc' },
  });
  if (tx === null) throw new Error(`no debit for issue ${issueId}`);
  return tx.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  captured.length = 0;
});
afterAll(closeDb);

describe('SC-007 — nothing turns green unearned', () => {
  it('an unchanged assertion leaves the issue OPEN with failing evidence, never RESOLVED', async () => {
    const { token, userId } = await signIn();
    const { issueIds } = await seedScanWithIssues(userId, 1);
    const issueId = issueIds[0]!;

    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    expect((await testDb.issue.findUniqueOrThrow({ where: { id: issueId } })).state).toBe(
      'ASSERTED_FIXED',
    );

    // The check looked, and the defect is still there.
    const result = await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'FAILED',
      evidence: { url: 'https://sc007.example.com/', 'content-security-policy': null },
      creditsCharged: 3,
      durationMs: 12,
      debitTransactionId: await debitIdFor(issueId),
    });

    expect(result.issueState).toBe('OPEN');
    const issue = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.state).toBe('OPEN');
    expect(issue.resolvedAt).toBeNull();

    const attempts = await testDb.verificationAttempt.findMany({ where: { issueId } });
    expect(attempts).toHaveLength(1);
    expect(attempts[0]?.outcome).toBe('FAILED');
    expect(attempts[0]?.evidence).toMatchObject({ 'content-security-policy': null });
  });

  it('marking every issue fixed at once turns none of them green', async () => {
    const { token, userId } = await signIn();
    const { issueIds } = await seedScanWithIssues(userId, 15);

    for (const issueId of issueIds) {
      await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    }
    // Every re-check comes back FAILED — nothing was actually changed.
    for (const issueId of issueIds) {
      await recordVerificationAttempt(testDb, {
        issueId,
        outcome: 'FAILED',
        evidence: { note: 'still failing' },
        creditsCharged: 3,
        durationMs: 5,
        debitTransactionId: await debitIdFor(issueId),
      });
    }

    const resolved = await testDb.issue.count({
      where: { id: { in: issueIds }, state: 'RESOLVED' },
    });
    expect(resolved).toBe(0);
  });

  it('a throwing check produces ERRORED, does not resolve, and refunds the charge', async () => {
    const { token, userId } = await signIn();
    const { issueIds } = await seedScanWithIssues(userId, 1);
    const issueId = issueIds[0]!;

    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);
    const debitId = await debitIdFor(issueId);

    const result = await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'ERRORED',
      evidence: { error: 'ECONNRESET' },
      creditsCharged: 3,
      durationMs: 30_001,
      debitTransactionId: debitId,
    });

    expect(result.issueState).toBe('OPEN');
    expect(result.creditsRefunded).toBe(3);
    const issue = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.state).not.toBe('RESOLVED');

    const refund = await testDb.creditTransaction.findFirst({
      where: { reversesId: debitId, type: 'REFUND' },
    });
    expect(refund?.amount).toBe(3);
  });

  it('the outcome→state map has exactly one path to RESOLVED', () => {
    expect(outcomeToState('PASSED')).toBe('RESOLVED');
    expect(outcomeToState('FAILED')).toBe('OPEN');
    expect(outcomeToState('UNVERIFIABLE')).toBe('UNVERIFIABLE');
    expect(outcomeToState('ERRORED')).toBe('OPEN');

    // The runtime lock: RESOLVED on anything but PASSED throws.
    for (const outcome of ['FAILED', 'UNVERIFIABLE', 'ERRORED'] as const) {
      expect(() => {
        assertResolvedOnlyOnPass(outcome, 'RESOLVED');
      }).toThrow(/passing check/i);
    }
    expect(() => {
      assertResolvedOnlyOnPass('PASSED', 'RESOLVED');
    }).not.toThrow();
  });

  it('positive control: a genuine PASSED does resolve the issue', async () => {
    const { token, userId } = await signIn();
    const { issueIds } = await seedScanWithIssues(userId, 1);
    const issueId = issueIds[0]!;

    await request(app).post(`/issues/${issueId}/assert-fixed`).set(auth(token)).expect(202);

    const result = await recordVerificationAttempt(testDb, {
      issueId,
      outcome: 'PASSED',
      creditsCharged: 3,
      durationMs: 8,
      debitTransactionId: await debitIdFor(issueId),
    });

    expect(result.issueState).toBe('RESOLVED');
    const issue = await testDb.issue.findUniqueOrThrow({ where: { id: issueId } });
    expect(issue.state).toBe('RESOLVED');
    expect(issue.resolvedAt).not.toBeNull();
    expect(issue.previouslyResolved).toBe(true);
    // A PASSED verdict is a delivered service — no refund.
    expect(result.creditsRefunded).toBe(0);
  });
});
