/**
 * T037 — Concurrent debits cannot double-spend one lot.
 *
 * Two audits starting at the same moment is the ordinary case, not an edge
 * case: a Pro plan permits three concurrent scans. Without row locking, both
 * read the same `amountRemaining`, both decide they can afford it, and both
 * decrement — and the user gets audits they did not pay for.
 *
 * The lot is the shared mutable resource, so the lock has to be on the lot.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit, InsufficientCreditsError } from '../../src/services/credits/debit.js';
import { balanceOf } from '../../src/services/credits/balance.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

/** Counts fulfilled results, treating a shortfall as a legitimate outcome. */
function tally(results: PromiseSettledResult<unknown>[]): { ok: number; short: number } {
  let ok = 0;
  let short = 0;
  for (const r of results) {
    if (r.status === 'fulfilled') ok++;
    else if (r.reason instanceof InsufficientCreditsError) short++;
    else throw r.reason;
  }
  return { ok, short };
}

describe('concurrent debits', () => {
  it('lets exactly one of two racing debits succeed when only one is affordable', async () => {
    const userId = await makeUser('race2@example.com');
    // 80 credits, two audits of 80. Exactly one may win.
    await grantLot(testDb, {
      userId,
      amount: 80,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const results = await Promise.allSettled([
      debit(testDb, { userId, amount: 80, reason: 'race:a' }),
      debit(testDb, { userId, amount: 80, reason: 'race:b' }),
    ]);

    const { ok, short } = tally(results);
    expect(ok).toBe(1);
    expect(short).toBe(1);

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(0);
    // Never negative: that is the double-spend signature.
    expect(bal.plan).toBeGreaterThanOrEqual(0);
  });

  it('never oversells under a 10-way race', async () => {
    const userId = await makeUser('race10@example.com');
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    // Ten concurrent debits of 30 against 100 credits: at most three can win.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, (_, i) =>
        debit(testDb, { userId, amount: 30, reason: `race10:${i}` }),
      ),
    );

    const { ok } = tally(results);
    expect(ok).toBeLessThanOrEqual(3);

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(100 - ok * 30);
    expect(bal.plan).toBeGreaterThanOrEqual(0);
  });

  it('keeps allocations consistent with lot balances after a race', async () => {
    const userId = await makeUser('consistent@example.com');
    await grantLot(testDb, {
      userId,
      amount: 60,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await grantLot(testDb, {
      userId,
      amount: 60,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        debit(testDb, { userId, amount: 25, reason: `consistent:${i}` }),
      ),
    );

    // The ledger must reconcile: every lot's remaining equals granted minus the
    // net of the allocations against it.
    const lots = await testDb.creditLot.findMany({
      where: { userId },
      include: { allocations: { include: { transaction: true } } },
    });
    for (const lot of lots) {
      const net = lot.allocations.reduce(
        (n, a) => n + (a.transaction.type === 'DEBIT' ? a.amount : -a.amount),
        0,
      );
      expect(lot.amountRemaining, `lot ${lot.id} out of balance`).toBe(lot.amountGranted - net);
      expect(lot.amountRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it('preserves consumption order under concurrency', async () => {
    const userId = await makeUser('orderrace@example.com');
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    await grantLot(testDb, {
      userId,
      amount: 500,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    // Five debits of 10 fit entirely inside the plan allocation, so no
    // purchased credit may move no matter how they interleave.
    await Promise.allSettled(
      Array.from({ length: 5 }, (_, i) =>
        debit(testDb, { userId, amount: 10, reason: `orderrace:${i}` }),
      ),
    );

    const bal = await balanceOf(testDb, userId);
    expect(bal.purchased).toBe(500);
    expect(bal.plan).toBe(0);
  });
});
