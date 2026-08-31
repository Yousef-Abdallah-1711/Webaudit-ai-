/**
 * T149 + T150 — the re-verification runner: resolve one check, run only it,
 * persist the verdict through `recordVerificationAttempt`.
 *
 * Covers, against a real test database:
 *   - a capability's `reverify` returning PASSED → issue RESOLVED, no refund;
 *   - FAILED → issue OPEN, evidence stored, still charged;
 *   - UNVERIFIABLE from the capability → issue UNVERIFIABLE, refunded;
 *   - a checkId with no owning capability (`resolve-check.ts` returns nothing)
 *     → UNVERIFIABLE, refunded — FR-063's "no entry point" case;
 *   - a `reverify` that throws → ERRORED, issue OPEN, refunded, host survives;
 *   - a stale job (issue no longer ASSERTED_FIXED) → no-op, no second attempt;
 *   - an `issue:verified` event is published for every applied verdict.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import type { AuditCapability, ReverifyResult } from '@webaudit/capability-sdk';
import { runReverification } from '../../src/reverify/runner.js';

function fakeCapability(id: string, result: ReverifyResult | (() => Promise<ReverifyResult>)): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    reverify: typeof result === 'function' ? () => result() : () => Promise.resolve(result),
  };
}

const published: unknown[] = [];
const publisher = {
  publish: (_channel: string, message: string) => {
    published.push(JSON.parse(message));
    return Promise.resolve(1);
  },
};

async function seedAssertedIssue(checkId = 'headers.csp-missing'): Promise<{
  issueId: string;
  scanId: string;
  debitId: string;
}> {
  const user = await db.user.create({
    data: { email: `rv-${String(Date.now())}-${String(Math.random())}@example.com`, emailVerifiedAt: new Date() },
  });
  const lot = await db.creditLot.create({
    data: { userId: user.id, kind: 'PLAN', source: 'FREE_GRANT', amountGranted: 50, amountRemaining: 47, expiresAt: null },
  });
  const target = await db.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://rv.example.com', displayName: 'rv' },
  });
  const scan = await db.scan.create({
    data: { userId: user.id, targetId: target.id, requestedModules: ['SECURITY'], capabilitySnapshot: {}, quotedCredits: 20, state: 'COMPLETED' },
  });
  const mr = await db.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 40 },
  });
  const issue = await db.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: `fp-${String(Math.random())}`,
      checkId,
      severity: 'HIGH',
      title: 'x',
      explanation: 'x',
      consequence: 'y',
      location: 'https://rv.example.com/',
      attribution: 'MEASURED',
      fixPrompt: 'z',
      state: 'ASSERTED_FIXED',
      assertedFixedAt: new Date(),
    },
  });
  const debit = await db.creditTransaction.create({
    data: { userId: user.id, type: 'DEBIT', amount: 3, reason: 'reverify:issue', issueId: issue.id, scanId: scan.id },
  });
  await db.creditAllocation.create({
    data: { transactionId: debit.id, lotId: lot.id, amount: 3 },
  });
  return { issueId: issue.id, scanId: scan.id, debitId: debit.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  published.length = 0;
});
afterAll(closeDb);

describe('runReverification', () => {
  it('PASSED → issue RESOLVED, no refund, event published', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    const result = await runReverification(
      { db, publisher, loadForModule: () => Promise.resolve([fakeCapability('headers-checker', { outcome: 'PASSED' })]) },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.outcome).toBe('PASSED');
    expect(result.issueState).toBe('RESOLVED');
    expect(result.creditsRefunded).toBe(0);
    expect((await db.issue.findUniqueOrThrow({ where: { id: issueId } })).state).toBe('RESOLVED');
    expect(published.some((e) => (e as { event?: { type?: string } }).event?.type === 'issue:verified')).toBe(true);
  });

  it('FAILED → issue OPEN, evidence stored, still charged', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    const result = await runReverification(
      {
        db,
        publisher,
        loadForModule: () =>
          Promise.resolve([fakeCapability('headers-checker', { outcome: 'FAILED', evidence: { header: 'content-security-policy', observed: null } })]),
      },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.issueState).toBe('OPEN');
    expect(result.creditsRefunded).toBe(0);
    const attempts = await db.verificationAttempt.findMany({ where: { issueId } });
    expect(attempts[0]?.evidence).toMatchObject({ header: 'content-security-policy' });
  });

  it('capability UNVERIFIABLE → issue UNVERIFIABLE, refunded', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    const result = await runReverification(
      { db, publisher, loadForModule: () => Promise.resolve([fakeCapability('headers-checker', { outcome: 'UNVERIFIABLE', reason: 'gone' })]) },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.issueState).toBe('UNVERIFIABLE');
    expect(result.creditsRefunded).toBe(3);
  });

  it('no owning capability for the checkId → UNVERIFIABLE, refunded (FR-063 "no entry point")', async () => {
    const { issueId, debitId } = await seedAssertedIssue('ai.security.judgment');
    const result = await runReverification(
      { db, publisher, loadForModule: () => Promise.resolve([]) },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.outcome).toBe('UNVERIFIABLE');
    expect(result.issueState).toBe('UNVERIFIABLE');
    expect(result.creditsRefunded).toBe(3);
  });

  it('a reverify that throws → ERRORED, issue OPEN, refunded, no exception escapes', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    const result = await runReverification(
      {
        db,
        publisher,
        loadForModule: () =>
          Promise.resolve([
            fakeCapability('headers-checker', () => Promise.reject(new Error('boom'))),
          ]),
      },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.outcome).toBe('ERRORED');
    expect(result.issueState).toBe('OPEN');
    expect(result.creditsRefunded).toBe(3);
  });

  it('a stale job (issue already OPEN) is a no-op — no second attempt, no double refund', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    await db.issue.update({ where: { id: issueId }, data: { state: 'OPEN' } });
    const result = await runReverification(
      { db, publisher, loadForModule: () => Promise.resolve([fakeCapability('headers-checker', { outcome: 'PASSED' })]) },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.applied).toBe(false);
    expect(await db.verificationAttempt.count({ where: { issueId } })).toBe(0);
  });

  it('an aborted/hung reverify times out to ERRORED rather than hanging', async () => {
    const { issueId, debitId } = await seedAssertedIssue();
    const hang = fakeCapability('headers-checker', () => new Promise<ReverifyResult>(() => {}));
    const result = await runReverification(
      { db, publisher, loadForModule: () => Promise.resolve([hang]), timeoutMs: 50 },
      { issueId, debitTransactionId: debitId, creditsCharged: 3 },
    );
    expect(result.outcome).toBe('ERRORED');
    expect(result.issueState).toBe('OPEN');
  });
});
