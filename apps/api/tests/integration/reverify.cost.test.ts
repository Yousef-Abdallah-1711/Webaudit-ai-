/**
 * T146 — SC-005 / FR-062: "A targeted re-check costs no more than 5% of what a
 * full audit costs" / "charge materially less for a targeted re-check than for
 * the audit that found the issue."
 *
 * The credit schedule (`@webaudit/config`): a full audit is 80, a re-check is
 * 3. This asserts `POST /issues/:id/assert-fixed` debits exactly 3, that 3 is
 * within the 5% bar, and that the debit is attributed to the issue (so margin
 * per re-check is reconcilable, Principle VI).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { FULL_AUDIT_COST, REVERIFY_COST } from '@webaudit/config';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { totalAvailable } from '../../src/services/credits/balance.js';

const fakeProducer = {
  enqueueReverify: (input: { issueId: string }) =>
    Promise.resolve({ jobId: `fake:${input.issueId}` }),
  close: () => Promise.resolve(),
};

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, issues: { producer: fakeProducer } });
const CREDS = { email: 'sc005@example.com', password: 'correct-horse-battery-staple' };

async function signInAndSeed(): Promise<{ token: string; userId: string; issueId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  const token = (res.body as { accessToken: string }).accessToken;

  const target = await testDb.target.create({
    data: { userId: user.id, inputType: 'URL', canonicalValue: 'https://sc005.example.com', displayName: 'sc005' },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 20,
      state: 'COMPLETED',
    },
  });
  const mr = await testDb.moduleResult.create({
    data: { scanId: scan.id, module: 'SECURITY', state: 'COMPLETE', score: 40 },
  });
  const issue = await testDb.issue.create({
    data: {
      scanId: scan.id,
      moduleResultId: mr.id,
      fingerprint: 'fp-1',
      checkId: 'headers.csp-missing',
      severity: 'HIGH',
      title: 'Missing CSP',
      explanation: 'x',
      consequence: 'y',
      location: 'https://sc005.example.com/',
      attribution: 'MEASURED',
      fixPrompt: 'add a CSP',
    },
  });
  return { token, userId: user.id, issueId: issue.id };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('SC-005 — a re-check costs a small fraction of a full audit', () => {
  it('debits exactly REVERIFY_COST (3), attributed to the issue', async () => {
    const { token, userId, issueId } = await signInAndSeed();
    const before = await totalAvailable(testDb, userId);

    const res = await request(app)
      .post(`/issues/${issueId}/assert-fixed`)
      .set({ Authorization: `Bearer ${token}` })
      .expect(202);
    expect((res.body as { reverification: { creditsCharged: number } }).reverification.creditsCharged).toBe(
      REVERIFY_COST,
    );

    const after = await totalAvailable(testDb, userId);
    expect(before - after).toBe(REVERIFY_COST);

    const debit = await testDb.creditTransaction.findFirst({
      where: { issueId, type: 'DEBIT' },
    });
    expect(debit?.amount).toBe(REVERIFY_COST);
    expect(debit?.reason).toBe('reverify:issue');
  });

  it('REVERIFY_COST is within 5% of a full audit (SC-005)', () => {
    expect(REVERIFY_COST).toBe(3);
    expect(REVERIFY_COST).toBeLessThanOrEqual(FULL_AUDIT_COST * 0.05);
  });
});
