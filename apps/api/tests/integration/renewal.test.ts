/**
 * T181 — FR-078 / SC-022: plan credits expire at renewal; purchased credits
 * survive it, untouched.
 *
 * Scenario 7 exactly: a paid user with unused plan credits *and* purchased
 * credits renews; the plan credits are gone, the purchased ones are not.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { balanceOf } from '../../src/services/credits/balance.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { renewSubscription, subscribe } from '../../src/services/billing/subscription.service.js';

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('FR-078 — renewal replaces plan credits and spares purchased', () => {
  it('unused plan credits are gone at renewal; purchased credits remain', async () => {
    const userId = await makeUser('renew1@example.com');

    // Subscribe to Pro: grants 1200 plan credits expiring at periodEnd.
    const sub = await subscribe(testDb, { userId, planId: 'pro' });
    // Buy 200 that never expire.
    await grantLot(testDb, {
      userId,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      amount: 200,
      expiresAt: null,
    });

    let balance = await balanceOf(testDb, userId);
    expect(balance.plan).toBe(1200);
    expect(balance.purchased).toBe(200);

    // Renew one period after periodEnd.
    const after = new Date(sub.periodEnd.getTime() + 1000);
    await renewSubscription(testDb, { userId }, after);

    balance = await balanceOf(testDb, userId);
    // The old 1200 expired; a fresh 1200 was granted. Purchased untouched.
    expect(balance.plan).toBe(1200);
    expect(balance.purchased).toBe(200);

    // The ledger explains it: an EXPIRE for 1200, then a GRANT for 1200.
    const expires = await testDb.creditTransaction.findMany({
      where: { userId, type: 'EXPIRE' },
    });
    expect(expires.reduce((n, t) => n + t.amount, 0)).toBe(1200);

    // Exactly one PURCHASED lot, still full, still non-expiring.
    const purchasedLots = await testDb.creditLot.findMany({ where: { userId, kind: 'PURCHASED' } });
    expect(purchasedLots).toHaveLength(1);
    expect(purchasedLots[0]?.amountRemaining).toBe(200);
    expect(purchasedLots[0]?.expiresAt).toBeNull();
  });

  it('partially-spent plan credits still fully expire at renewal', async () => {
    const userId = await makeUser('renew2@example.com');
    const sub = await subscribe(testDb, { userId, planId: 'starter' }); // 300

    // Spend 100 of the plan allocation.
    const { debit } = await import('../../src/services/credits/debit.js');
    await debit(testDb, { userId, amount: 100, reason: 'scan:create' });
    expect((await balanceOf(testDb, userId)).plan).toBe(200);

    await renewSubscription(testDb, { userId }, new Date(sub.periodEnd.getTime() + 1000));

    // The remaining 200 expired; a fresh 300 replaced it.
    expect((await balanceOf(testDb, userId)).plan).toBe(300);
  });

  it('a subscription set to cancel does not renew — it lapses and grants nothing', async () => {
    const userId = await makeUser('renew3@example.com');
    const sub = await subscribe(testDb, { userId, planId: 'pro' });
    await testDb.subscription.update({ where: { userId }, data: { cancelAtPeriodEnd: true } });

    await renewSubscription(testDb, { userId }, new Date(sub.periodEnd.getTime() + 1000));

    const row = await testDb.subscription.findUniqueOrThrow({ where: { userId } });
    expect(row.status).toBe('EXPIRED');
    expect((await balanceOf(testDb, userId)).plan).toBe(0);
  });
});
