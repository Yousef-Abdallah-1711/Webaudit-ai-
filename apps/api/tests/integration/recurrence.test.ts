/**
 * T152 — FR-064: "reopen a previously resolved issue that recurs, and MUST
 * retain that it was previously verified."
 *
 * `Issue` is per-scan, so a recurrence is a new row in a later scan whose
 * fingerprint matches a row in an earlier scan of the same target that reached
 * `RESOLVED`. `markRecurrences` re-labels that new row `REOPENED` and sets
 * `previouslyResolved`.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { markRecurrences } from '../../src/services/issues/recurrence.js';

async function makeScan(
  userId: string,
  targetId: string,
  createdAt: Date,
): Promise<{ scanId: string; moduleResultId: string }> {
  const scan = await testDb.scan.create({
    data: {
      userId,
      targetId,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      state: 'COMPLETED',
      createdAt,
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 50 },
  });
  return { scanId: scan.id, moduleResultId: mr.id };
}

async function makeIssue(
  scanId: string,
  moduleResultId: string,
  fingerprint: string,
  state: 'OPEN' | 'RESOLVED',
): Promise<string> {
  const issue = await testDb.issue.create({
    data: {
      scanId,
      moduleResultId,
      fingerprint,
      checkId: 'headers.csp-missing',
      severity: 'HIGH',
      title: 't',
      explanation: 'x',
      consequence: 'y',
      attribution: 'MEASURED',
      fixPrompt: 'z',
      state,
      ...(state === 'RESOLVED' ? { resolvedAt: new Date(), previouslyResolved: true } : {}),
    },
  });
  return issue.id;
}

let userId: string;
let targetId: string;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  const user = await testDb.user.create({
    data: { email: 'recur@example.com', emailVerifiedAt: new Date() },
  });
  userId = user.id;
  const target = await testDb.target.create({
    data: { userId, inputType: 'URL', canonicalValue: 'https://recur.example.com', displayName: 'recur' },
  });
  targetId = target.id;
});
afterAll(closeDb);

describe('markRecurrences', () => {
  it('reopens a new-scan issue whose fingerprint was RESOLVED in an earlier scan', async () => {
    const older = new Date(Date.now() - 86_400_000);
    const a = await makeScan(userId, targetId, older);
    await makeIssue(a.scanId, a.moduleResultId, 'fp-recur', 'RESOLVED');

    const b = await makeScan(userId, targetId, new Date());
    const recurring = await makeIssue(b.scanId, b.moduleResultId, 'fp-recur', 'OPEN');
    const fresh = await makeIssue(b.scanId, b.moduleResultId, 'fp-brand-new', 'OPEN');

    const result = await markRecurrences(testDb, { scanId: b.scanId });
    expect(result.reopened).toBe(1);
    expect(result.fingerprints).toEqual(['fp-recur']);

    const reopened = await testDb.issue.findUniqueOrThrow({ where: { id: recurring } });
    expect(reopened.state).toBe('REOPENED');
    expect(reopened.previouslyResolved).toBe(true);
    expect(reopened.reopenedAt).not.toBeNull();

    const untouched = await testDb.issue.findUniqueOrThrow({ where: { id: fresh } });
    expect(untouched.state).toBe('OPEN');
    expect(untouched.previouslyResolved).toBe(false);
  });

  it('does nothing when the earlier occurrence was never resolved', async () => {
    const a = await makeScan(userId, targetId, new Date(Date.now() - 86_400_000));
    await makeIssue(a.scanId, a.moduleResultId, 'fp-x', 'OPEN');

    const b = await makeScan(userId, targetId, new Date());
    const again = await makeIssue(b.scanId, b.moduleResultId, 'fp-x', 'OPEN');

    const result = await markRecurrences(testDb, { scanId: b.scanId });
    expect(result.reopened).toBe(0);
    expect((await testDb.issue.findUniqueOrThrow({ where: { id: again } })).state).toBe('OPEN');
  });

  it('is safe to run twice', async () => {
    const a = await makeScan(userId, targetId, new Date(Date.now() - 86_400_000));
    await makeIssue(a.scanId, a.moduleResultId, 'fp-recur', 'RESOLVED');
    const b = await makeScan(userId, targetId, new Date());
    await makeIssue(b.scanId, b.moduleResultId, 'fp-recur', 'OPEN');

    expect((await markRecurrences(testDb, { scanId: b.scanId })).reopened).toBe(1);
    expect((await markRecurrences(testDb, { scanId: b.scanId })).reopened).toBe(0);
  });
});
