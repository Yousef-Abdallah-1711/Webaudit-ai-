/**
 * T151 follow-up (2026-09-02 review, Finding 7) — `listFailingEvidenceForScan`
 * is the batched counterpart to `listVerificationAttempts`: one query for the
 * whole scan instead of one `GET /issues/:id/attempts` per issue. This test
 * exists to prove the "last FAILED wins" ordering specifically — a bug that
 * kept the first FAILED attempt instead of the last would still pass a test
 * that only checked "some evidence came back," so this seeds two FAILED
 * attempts with distinguishable evidence and asserts on the second one.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { resetDb, testDb } from '../helpers/db.js';
import { listFailingEvidenceForScan } from '../../src/services/issues/attempts.js';

beforeEach(resetDb);

describe('listFailingEvidenceForScan', () => {
  it('returns the last FAILED attempt per issue, in one query', async () => {
    const user = await testDb.user.create({
      data: { email: 'batch@example.com', emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://batch.example.com',
        displayName: 'batch',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        kind: 'INITIAL',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 10,
        chargedCredits: 10,
        state: 'COMPLETED',
      },
    });
    const mr = await testDb.moduleResult.create({
      data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 50 },
    });
    const issue = await testDb.issue.create({
      data: {
        scanId: scan.id,
        moduleResultId: mr.id,
        fingerprint: 'fp-1',
        checkId: 'headers.csp-missing',
        severity: 'HIGH',
        title: 't',
        explanation: 'e',
        consequence: 'c',
        attribution: 'MEASURED',
        fixPrompt: 'f',
        state: 'ASSERTED_FIXED',
      },
    });
    await testDb.verificationAttempt.create({
      data: {
        issueId: issue.id,
        outcome: 'FAILED',
        evidence: { first: true },
        creditsCharged: 3,
        durationMs: 10,
      },
    });
    await testDb.verificationAttempt.create({
      data: {
        issueId: issue.id,
        outcome: 'FAILED',
        evidence: { second: true },
        creditsCharged: 3,
        durationMs: 10,
      },
    });

    const evidence = await listFailingEvidenceForScan(testDb, scan.id);
    expect(evidence[issue.id]).toEqual({ second: true }); // the most recent FAILED wins
  });

  it('omits an issue with no FAILED attempt', async () => {
    const evidence = await listFailingEvidenceForScan(testDb, 'no-such-scan');
    expect(evidence).toEqual({});
  });
});
