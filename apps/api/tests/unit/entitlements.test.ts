/**
 * cheapestActiveTierId — Finding 5 (2026-09-02 engineering review): create-scan.ts
 * and readiness/create.ts each hand-rolled the same "cheapest active plan
 * permitting X" query to compute a refusal's requiredTier. This pins the
 * extracted helper's behaviour directly, independent of either route.
 */

import { describe, expect, it, beforeEach, afterAll } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { cheapestActiveTierId } from '../../src/services/billing/entitlements.js';

beforeEach(async () => {
  await resetDb();
  // `resetDb` deliberately leaves `Plan` untouched — it is shared reference
  // data most suites seed once via `seedPlans()` and never mutate. This suite
  // plants its own rows under the real tier ids to control `isActive` and
  // `monthlyCredits` precisely, so it clears just those ids first: otherwise,
  // running after any suite that already called `seedPlans()` in the same
  // `--no-file-parallelism` run, `createMany` below would collide with
  // already-seeded 'free'/'starter'/'pro' rows instead of exercising this
  // test's own fixture.
  await testDb.plan.deleteMany({ where: { id: { in: ['free', 'starter', 'pro'] } } });
});

afterAll(closeDb);

describe('cheapestActiveTierId', () => {
  it('returns the cheapest active plan matching the where clause', async () => {
    // Inserted priciest-of-the-matching-pair first and deliberately not in
    // ascending-`monthlyCredits` order: `Plan` carries no explicit ordering
    // guarantee of its own, so a query that dropped `orderBy` (returning
    // whatever order the table scan happens to produce) must not be able to
    // pass this by coincidentally matching insertion order.
    await testDb.plan.createMany({
      data: [
        { id: 'pro', name: 'Pro', monthlyCredits: 2000, creditsRecur: true, isActive: true, allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'], allowLoadGeneration: true, allowReadinessPass: true, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 3, queuePriority: 2, retentionDays: 90 },
        { id: 'free', name: 'Free', monthlyCredits: 0, creditsRecur: false, isActive: true, allowedInputTypes: ['URL'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: false, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 0, retentionDays: 7 },
        { id: 'starter', name: 'Starter', monthlyCredits: 500, creditsRecur: true, isActive: true, allowedInputTypes: ['URL', 'ARCHIVE'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 1, retentionDays: 30 },
      ],
    });
    const id = await cheapestActiveTierId(testDb, { allowedInputTypes: { has: 'ARCHIVE' } });
    expect(id).toBe('starter');
  });

  it('ignores a deactivated plan even if it would otherwise be cheapest', async () => {
    await testDb.plan.createMany({
      data: [
        { id: 'starter', name: 'Starter', monthlyCredits: 500, creditsRecur: true, isActive: false, allowedInputTypes: ['ARCHIVE'], allowLoadGeneration: false, allowReadinessPass: false, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 1, queuePriority: 1, retentionDays: 30 },
        { id: 'pro', name: 'Pro', monthlyCredits: 2000, creditsRecur: true, isActive: true, allowedInputTypes: ['ARCHIVE'], allowLoadGeneration: true, allowReadinessPass: true, allowCreditPurchase: true, allowCustomCapability: false, concurrentScanLimit: 3, queuePriority: 2, retentionDays: 90 },
      ],
    });
    const id = await cheapestActiveTierId(testDb, { allowedInputTypes: { has: 'ARCHIVE' } });
    expect(id).toBe('pro');
  });

  it('returns null when no active plan matches', async () => {
    const id = await cheapestActiveTierId(testDb, { allowReadinessPass: true });
    expect(id).toBeNull();
  });
});
