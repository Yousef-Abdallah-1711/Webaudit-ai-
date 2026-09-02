/**
 * T183 — FR-016: "refuse an input type the user's plan does not permit, naming
 * the tier that permits it, before charging."
 *
 * Exercised through `resolveEffectivePlan` / `assertEntitled` directly (the
 * decision logic) and through the readiness route (a real "before charging"
 * refusal path): a free user asking for the readiness pass is `403` with the
 * permitting tier, and no `DEBIT` is written.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import {
  EntitlementError,
  assertEntitled,
  permittingTierFor,
  resolveEffectivePlan,
} from '../../src/services/billing/entitlements.js';
import { subscribe } from '../../src/services/billing/subscription.service.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, readiness: { storage: null } });
const CREDS = { email: 't183@example.com', password: 'correct-horse-battery-staple' };

async function makeUser(): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  return user.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('FR-016 / FR-079 — entitlements name the permitting tier', () => {
  it('the effective plan is free with no subscription, and the plan once subscribed', async () => {
    const userId = await makeUser();
    expect((await resolveEffectivePlan(testDb, userId)).id).toBe('free');

    await subscribe(testDb, { userId, planId: 'pro' });
    expect((await resolveEffectivePlan(testDb, userId)).id).toBe('pro');
  });

  it('assertEntitled throws EntitlementError naming the cheapest permitting tier', async () => {
    const userId = await makeUser();

    await expect(assertEntitled(testDb, userId, 'REPOSITORY_INPUT')).rejects.toMatchObject({
      name: 'EntitlementError',
      currentTier: 'free',
      requiredTier: 'pro',
    });
    await expect(assertEntitled(testDb, userId, 'ARCHIVE_INPUT')).rejects.toMatchObject({
      requiredTier: 'starter',
    });
    await expect(assertEntitled(testDb, userId, 'LOAD_GENERATION')).rejects.toMatchObject({
      requiredTier: 'pro',
    });

    // Once on Business, everything is permitted.
    await subscribe(testDb, { userId, planId: 'business' });
    await expect(assertEntitled(testDb, userId, 'CUSTOM_CAPABILITY')).resolves.toMatchObject({
      id: 'business',
    });
  });

  it('permittingTierFor is the cheapest tier, from the shared tier table', () => {
    expect(permittingTierFor('ARCHIVE_INPUT')).toBe('starter');
    expect(permittingTierFor('REPOSITORY_INPUT')).toBe('pro');
    expect(permittingTierFor('CUSTOM_CAPABILITY')).toBe('business');
  });

  it('a real route refuses before charging: free user + readiness pass = 403, no DEBIT', async () => {
    const userId = await makeUser();
    const res = await request(app).post('/auth/login').send(CREDS).expect(200);
    const token = (res.body as { accessToken: string }).accessToken;

    const target = await testDb.target.create({
      data: { userId, inputType: 'URL', canonicalValue: 'https://t183.example.com', displayName: 't183' },
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
        overallScore: 80,
      },
    });

    const refusal = await request(app)
      .post(`/scans/${baseline.id}/readiness`)
      .set({ Authorization: `Bearer ${token}` })
      .send({ acceptedQuote: 60 })
      .expect(403);
    expect((refusal.body as { error: { code: string } }).error.code).toBe('PLAN_UPGRADE_REQUIRED');

    const debits = await testDb.creditTransaction.count({
      where: { userId, type: 'DEBIT', reason: 'scan:readiness' },
    });
    expect(debits).toBe(0);
  });

  it('EntitlementError carries a null requiredTier when nothing offers the feature', () => {
    // Sanity: every feature in the enum maps to at least one tier today, so
    // this asserts the shape rather than a real "no plan" case.
    const err = new EntitlementError('CUSTOM_CAPABILITY', 'free', null, 'x');
    expect(err.requiredTier).toBeNull();
  });
});
