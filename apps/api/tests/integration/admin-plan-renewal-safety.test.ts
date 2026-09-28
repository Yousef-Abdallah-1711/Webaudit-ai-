/**
 * Phase 3 (master plan) — the real financial-safety bug found while
 * designing admin plan assignment, proven fixed: `renewDueSubscriptions`
 * must never auto-renew (and therefore never re-grant credits for) a
 * subscription an operator assigned manually. See
 * `apps/api/src/services/billing/index.ts`'s own module note and
 * `apps/api/src/services/admin/plan-assignment.service.ts`'s module note for
 * the full reasoning.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { renewDueSubscriptions } from '../../src/services/billing/index.js';
import { assignPlan } from '../../src/services/admin/plan-assignment.service.js';
import { subscribe } from '../../src/services/billing/subscription.service.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

describe('renewDueSubscriptions never touches an admin-assigned subscription', () => {
  it(
    'an admin-assigned subscription whose periodEnd has passed is NOT renewed and grants no credits',
    async () => {
      const operatorId = await makeUser('operator@example.com');
      const userId = await makeUser('admin-assigned@example.com');

      await assignPlan(testDb, {
        operatorId,
        targetUserId: userId,
        planId: 'pro',
        // A periodEnd already in the past — the exact shape that would have
        // been silently "renewed" (and re-granted pro's monthly credits)
        // before this fix, every sweep cycle, forever.
        periodEnd: new Date(Date.now() + 1000), // validation requires future...
        reason: 'about to backdate for the test',
      });
      // ...then backdate it directly, past validation, to simulate time
      // having passed since a real indefinite/time-boxed assignment.
      await testDb.subscription.update({
        where: { userId },
        data: { periodEnd: new Date(Date.now() - 86_400_000) },
      });

      const before = await testDb.creditLot.findMany({ where: { userId } });
      expect(before).toHaveLength(0);

      const result = await renewDueSubscriptions(testDb);

      expect(result.renewed).toBe(0);
      expect(result.lapsed).toBe(0);

      const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId } });
      // Still ACTIVE — resolveEffectivePlan grants the plan regardless of
      // periodEnd for an ACTIVE row, so being skipped by the sweep costs
      // this user nothing.
      expect(sub.status).toBe('ACTIVE');
      expect(sub.planId).toBe('pro');

      const after = await testDb.creditLot.findMany({ where: { userId } });
      expect(after, 'no credit lot must ever be granted by the sweep for an admin-assigned row').toHaveLength(
        0,
      );
    },
  );

  it('a real (dev-stubbed) subscription past its periodEnd IS renewed and grants fresh plan credits', async () => {
    const userId = await makeUser('real-subscriber@example.com');
    await subscribe(testDb, { userId, planId: 'pro' });
    await testDb.subscription.update({
      where: { userId },
      data: { periodEnd: new Date(Date.now() - 1000) },
    });

    const result = await renewDueSubscriptions(testDb);
    expect(result.renewed).toBe(1);

    const lots = await testDb.creditLot.findMany({ where: { userId, source: 'PLAN_RENEWAL' } });
    expect(lots.length).toBeGreaterThanOrEqual(1);
  });

  it('subscribe() clears a stale admin-assigned flag when a user later pays for real', async () => {
    const operatorId = await makeUser('operator2@example.com');
    const userId = await makeUser('later-real-subscriber@example.com');

    await assignPlan(testDb, {
      operatorId,
      targetUserId: userId,
      planId: 'starter',
      reason: 'temporary access',
    });
    expect((await testDb.subscription.findUniqueOrThrow({ where: { userId } })).adminAssigned).toBe(
      true,
    );

    await subscribe(testDb, { userId, planId: 'pro', external: { subscriptionId: 'paymob-sub-123' } });

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId } });
    expect(sub.adminAssigned).toBe(false);
    expect(sub.planId).toBe('pro');
    expect(sub.externalSubscriptionId).toBe('paymob-sub-123');
  });
});
