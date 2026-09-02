/**
 * T189 — report retention (FR-092): warn before removal, then remove.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { enforceRetention } from '../../src/services/storage/retention.js';

const mailer = createCapturingMailer();
const deps = { mailer, storage: null, webUrl: 'https://app.example' };

const DAY = 86_400_000;

async function completedScan(email: string, completedDaysAgo: number): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  const target = await testDb.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: `https://${email}`, displayName: 'ret' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      chargedCredits: 20,
      state: 'COMPLETED',
      overallScore: 70,
      summary: 'x',
      completedAt: new Date(Date.now() - completedDaysAgo * DAY),
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 70 },
  });
  await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp',
      checkId: 'headers.csp-missing',
      severity: 'HIGH',
      title: 't',
      explanation: 'x',
      consequence: 'y',
      attribution: 'MEASURED',
      fixPrompt: 'z',
    },
  });
  return scan.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('enforceRetention', () => {
  it('warns once for a free-tier report within 3 days of its 7-day expiry', async () => {
    // free retention is 7 days; completed 5 days ago → expires in 2 → within the 3-day window.
    const scanId = await completedScan('ret-warn@example.com', 5);

    const first = await enforceRetention(testDb, deps);
    expect(first.warned).toBe(1);
    expect(mailer.retentionWarnings()).toHaveLength(1);
    expect(mailer.retentionWarnings()[0]?.mail.exportUrl).toContain(`/scans/${scanId}/export`);

    // Second run does not re-warn.
    mailer.clear();
    const second = await enforceRetention(testDb, deps);
    expect(second.warned).toBe(0);
    expect(mailer.retentionWarnings()).toHaveLength(0);
  });

  it('removes a report past its retention period: findings gone, row kept, flag set', async () => {
    const scanId = await completedScan('ret-remove@example.com', 10); // > 7 days on free

    const result = await enforceRetention(testDb, deps);
    expect(result.removed).toBe(1);

    const scan = await testDb.scan.findUniqueOrThrow({ where: { id: scanId } });
    expect(scan.reportRemovedAt).not.toBeNull();
    expect(scan.overallScore).toBeNull();
    expect(scan.summary).toBeNull();
    expect(await testDb.issue.count({ where: { scanId } })).toBe(0);
    expect(await testDb.moduleResult.count({ where: { scanId } })).toBe(0);
  });

  it('leaves a fresh report alone', async () => {
    await completedScan('ret-fresh@example.com', 1);
    const result = await enforceRetention(testDb, deps);
    expect(result).toEqual({ warned: 0, removed: 0 });
  });
});
