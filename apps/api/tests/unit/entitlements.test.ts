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
  // builds its own fixture plans from scratch in every test below and never
  // reads a `seedPlans()` default, so it clears the *entire* table rather
  // than naming specific ids: naming ids is fragile the moment `PLAN_TIERS`
  // gains a fifth tier, and it already under-covered 'business' once (that
  // tier's `allowReadinessPass: true` / `isActive: true` / `monthlyCredits:
  // 4000` survived an id-scoped delete and made the "no active plan matches"
  // case find 'business' instead of nothing, since at least 16 other test
  // files call `seedPlans()` — which upserts all four `PLAN_TIERS`, including
  // 'business' — ahead of this file in the same `--no-file-parallelism` run).
  await testDb.plan.deleteMany();
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
        {
          id: 'pro',
          name: 'Pro',
          monthlyCredits: 2000,
          creditsRecur: true,
          isActive: true,
          allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'],
          allowLoadGeneration: true,
          allowReadinessPass: true,
          allowCreditPurchase: true,
          allowCustomCapability: false,
          concurrentScanLimit: 3,
          queuePriority: 2,
          retentionDays: 90,
        },
        {
          id: 'free',
          name: 'Free',
          monthlyCredits: 0,
          creditsRecur: false,
          isActive: true,
          allowedInputTypes: ['URL'],
          allowLoadGeneration: false,
          allowReadinessPass: false,
          allowCreditPurchase: false,
          allowCustomCapability: false,
          concurrentScanLimit: 1,
          queuePriority: 0,
          retentionDays: 7,
        },
        {
          id: 'starter',
          name: 'Starter',
          monthlyCredits: 500,
          creditsRecur: true,
          isActive: true,
          allowedInputTypes: ['URL', 'ARCHIVE'],
          allowLoadGeneration: false,
          allowReadinessPass: false,
          allowCreditPurchase: true,
          allowCustomCapability: false,
          concurrentScanLimit: 1,
          queuePriority: 1,
          retentionDays: 30,
        },
      ],
    });
    const id = await cheapestActiveTierId(testDb, { allowedInputTypes: { has: 'ARCHIVE' } });
    expect(id).toBe('starter');
  });

  it('ignores a deactivated plan even if it would otherwise be cheapest', async () => {
    await testDb.plan.createMany({
      data: [
        {
          id: 'starter',
          name: 'Starter',
          monthlyCredits: 500,
          creditsRecur: true,
          isActive: false,
          allowedInputTypes: ['ARCHIVE'],
          allowLoadGeneration: false,
          allowReadinessPass: false,
          allowCreditPurchase: true,
          allowCustomCapability: false,
          concurrentScanLimit: 1,
          queuePriority: 1,
          retentionDays: 30,
        },
        {
          id: 'pro',
          name: 'Pro',
          monthlyCredits: 2000,
          creditsRecur: true,
          isActive: true,
          allowedInputTypes: ['ARCHIVE'],
          allowLoadGeneration: true,
          allowReadinessPass: true,
          allowCreditPurchase: true,
          allowCustomCapability: false,
          concurrentScanLimit: 3,
          queuePriority: 2,
          retentionDays: 90,
        },
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
