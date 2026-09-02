/**
 * T184 — subscription lifecycle: subscribe, change plan, cancel, and the
 * effective plan each produces.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { balanceOf } from '../../src/services/credits/balance.js';
import {
  NoSubscriptionError,
  PlanNotSubscribableError,
  cancelSubscription,
  changePlan,
  subscribe,
} from '../../src/services/billing/subscription.service.js';
import { resolveEffectivePlan } from '../../src/services/billing/entitlements.js';

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('subscription lifecycle', () => {
  it('subscribe grants the plan allocation as a lot expiring at period end', async () => {
    const userId = await makeUser('sub1@example.com');
    const sub = await subscribe(testDb, { userId, planId: 'starter' });

    expect(sub.status).toBe('ACTIVE');
    const lots = await testDb.creditLot.findMany({ where: { userId, source: 'PLAN_RENEWAL' } });
    expect(lots).toHaveLength(1);
    expect(lots[0]?.amountRemaining).toBe(300);
    expect(lots[0]?.expiresAt?.getTime()).toBe(sub.periodEnd.getTime());
    expect((await balanceOf(testDb, userId)).plan).toBe(300);
  });

  it('subscribing keeps whatever free-grant credits the user still has', async () => {
    const userId = await makeUser('sub2@example.com');
    await testDb.creditLot.create({
      data: { userId, kind: 'PLAN', source: 'FREE_GRANT', amountGranted: 50, amountRemaining: 50, expiresAt: null },
    });
    await subscribe(testDb, { userId, planId: 'pro' });
    expect((await balanceOf(testDb, userId)).plan).toBe(1250); // 50 free + 1200 plan
  });

  it('the free tier is not subscribable', async () => {
    const userId = await makeUser('sub3@example.com');
    await expect(subscribe(testDb, { userId, planId: 'free' })).rejects.toBeInstanceOf(
      PlanNotSubscribableError,
    );
  });

  it('changePlan swaps the tier immediately without re-granting credits', async () => {
    const userId = await makeUser('sub4@example.com');
    await subscribe(testDb, { userId, planId: 'starter' });
    const before = (await balanceOf(testDb, userId)).plan;

    await changePlan(testDb, { userId, planId: 'pro' });

    expect((await resolveEffectivePlan(testDb, userId)).id).toBe('pro');
    // No new grant — the pro allowance lands at the next renewal.
    expect((await balanceOf(testDb, userId)).plan).toBe(before);
  });

  it('changePlan without a subscription is refused', async () => {
    const userId = await makeUser('sub5@example.com');
    await expect(changePlan(testDb, { userId, planId: 'pro' })).rejects.toBeInstanceOf(
      NoSubscriptionError,
    );
  });

  it('cancel keeps the plan until period end and reports the retention consequence', async () => {
    const userId = await makeUser('sub6@example.com');
    const sub = await subscribe(testDb, { userId, planId: 'pro' });

    const outcome = await cancelSubscription(testDb, { userId });
    expect(outcome.cancelAtPeriodEnd).toBe(true);
    expect(outcome.status).toBe('ACTIVE'); // still owns the paid period
    // pro retention is 365 days past the period end.
    const expectedReadable = sub.periodEnd.getTime() + 365 * 86_400_000;
    expect(outcome.reportsReadableUntil.getTime()).toBe(expectedReadable);

    // Effective plan is still pro until the period ends.
    expect((await resolveEffectivePlan(testDb, userId)).id).toBe('pro');
  });

  it('a cancelled subscription whose period has ended falls back to free', async () => {
    const userId = await makeUser('sub7@example.com');
    await subscribe(testDb, { userId, planId: 'pro' });
    await testDb.subscription.update({
      where: { userId },
      data: { status: 'CANCELLED', periodEnd: new Date(Date.now() - 1000) },
    });
    expect((await resolveEffectivePlan(testDb, userId)).id).toBe('free');
  });
});
