/**
 * The expiry sweep is the one credit mutator that took no row lock.
 *
 * `debit` locks its candidate lots `FOR UPDATE` and its own comment explains
 * why — "without the row lock the ordering guarantee is decoration". `refund`
 * runs under `withRetry`. `expireRenewedLots` did neither, and the shipped
 * property suite is entirely sequential while the shipped concurrency suite
 * races debit against debit only. Nothing anywhere ran the sweep beside anything
 * else, so two races survived every green tick.
 *
 * **A refund into a lot the sweep is killing.** `refund` decides `lotIsAlive`
 * from a lot it read without a lock, and the sweep clamps `expiresAt` to the
 * past between that read and the `increment`. The credits land in a lot that
 * became expired in the same instant: unspendable for ever, with no EXPIRE ever
 * written against them. The user is told they were refunded and their balance
 * does not move. FR-075 says a platform fault is refunded; a refund that cannot
 * be spent is not one.
 *
 * **An EXPIRE row that overstates what died.** The sweep totals
 * `creditsDestroyed` from a `findMany` snapshot, then blocks on the row lock a
 * concurrent debit holds and zeroes whatever is actually left. The row records
 * the pre-debit total. Principle VI makes the movement history authoritative, so
 * a statement rebuilt from `CreditTransaction` shows a balance that disagrees
 * with the lots by exactly the racing debit — and it can go negative. The money
 * direction is safe either way; the *ledger* is what breaks, and this file's own
 * comment says silent destruction is what makes users distrust a balance.
 *
 * Both are latent: `expireRenewedLots` has no production caller until billing at
 * T180. They become live the moment a renewal sweep runs beside ordinary scan
 * traffic, which is the steady state, not an edge case.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit } from '../../src/services/credits/debit.js';
import { refund } from '../../src/services/credits/refund.js';
import { expireRenewedLots } from '../../src/services/credits/expiry.js';
import { balanceOf } from '../../src/services/credits/balance.js';

/** Spendable credits of either kind. `balanceOf` reports the two separately. */
async function spendableTotal(userId: string): Promise<number> {
  const balance = await balanceOf(testDb, userId);
  return balance.plan + balance.purchased;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

/** Sum of every movement, which Principle VI makes the authoritative balance. */
async function ledgerBalance(userId: string): Promise<number> {
  const rows = await testDb.creditTransaction.findMany({
    where: { userId },
    select: { type: true, amount: true },
  });
  return rows.reduce((total, row) => {
    if (row.type === 'GRANT' || row.type === 'REFUND') return total + row.amount;
    return total - row.amount;
  }, 0);
}

describe('a refund racing the sweep still leaves spendable credits', () => {
  it('does not park refunded credits in a lot that just expired', async () => {
    const userId = await makeUser('refund-race@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });
    const spent = await debit(testDb, { userId, amount: 60, reason: 'scan:race' });

    await Promise.allSettled([
      refund(testDb, spent.id, 'platform-fault'),
      expireRenewedLots(testDb, userId, boundary),
    ]);

    // The credits the user was told they got back must be spendable. Landing
    // them in a lot that expired in the same instant is worse than refusing the
    // refund, because the refund was reported as successful.
    const spendable = await spendableTotal(userId);
    const held = await testDb.creditLot.aggregate({
      where: { userId },
      _sum: { amountRemaining: true },
    });

    expect(spendable).toBe(held._sum.amountRemaining ?? 0);
  });

  it('reaches the same outcome as running the two operations in order', async () => {
    // The control the concurrent case is measured against: whatever interleaving
    // occurs, the user must not end up worse off than under either serial order.
    const userId = await makeUser('refund-serial@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });
    const spent = await debit(testDb, { userId, amount: 60, reason: 'scan:serial' });

    await refund(testDb, spent.id, 'platform-fault');
    await expireRenewedLots(testDb, userId, boundary);

    const serial = await spendableTotal(userId);
    expect(serial).toBe(0);
  });
});

describe('an EXPIRE row records what actually died', () => {
  it('does not overstate the loss when a debit commits first', async () => {
    const userId = await makeUser('expire-race@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });

    await Promise.allSettled([
      debit(testDb, { userId, amount: 40, reason: 'scan:concurrent' }),
      expireRenewedLots(testDb, userId, boundary),
    ]);

    const held = await testDb.creditLot.aggregate({
      where: { userId },
      _sum: { amountRemaining: true },
    });

    // The ledger is the authority. If it disagrees with the lots, a statement
    // and a balance built from the same data show different numbers.
    expect(await ledgerBalance(userId)).toBe(held._sum.amountRemaining ?? 0);
  });

  it('never writes a ledger that sums below zero', async () => {
    const userId = await makeUser('expire-negative@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });

    await Promise.allSettled([
      debit(testDb, { userId, amount: 40, reason: 'scan:neg-a' }),
      debit(testDb, { userId, amount: 30, reason: 'scan:neg-b' }),
      expireRenewedLots(testDb, userId, boundary),
    ]);

    expect(await ledgerBalance(userId)).toBeGreaterThanOrEqual(0);
  });

  it('still destroys exactly the remainder when nothing races it', async () => {
    // The ordinary path, kept so a fix that adds locking cannot also change what
    // an uncontended sweep does.
    const userId = await makeUser('expire-quiet@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });
    await debit(testDb, { userId, amount: 40, reason: 'scan:quiet' });

    const result = await expireRenewedLots(testDb, userId, boundary);
    expect(result).toEqual({ lotsExpired: 1, creditsDestroyed: 60 });
    expect(await spendableTotal(userId)).toBe(0);
  });

  it('leaves purchased credits alone however the sweep is raced', async () => {
    // SC-022's headline promise, asserted under contention rather than in
    // isolation: purchased credits have a null expiry and cannot be selected.
    const userId = await makeUser('expire-purchased@example.com');
    const boundary = new Date(Date.now() + 30 * 86_400_000);

    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });

    /**
     * Both interleavings are legitimate and they leave different balances, so
     * the assertion has to be the invariant rather than one of the outcomes.
     *
     * Debit first: it draws 40 from the expiring plan lot (expiry order), the
     * sweep destroys the remaining 60, and 50 purchased credits survive. Sweep
     * first: it destroys all 100, the debit then has only the purchased lot to
     * draw from, and 10 survive. Asserting 50 was asserting that the debit wins
     * a race with no ordering guarantee — green on most runs and red on the runs
     * where the sweep commits first, which is exactly the interleaving this file
     * exists to exercise.
     *
     * What must hold either way is that **no purchased credit was destroyed**:
     * the sweep's own total accounts for plan credits only, so the surviving
     * balance is fully explained by the grant minus the debit minus what the
     * sweep says it destroyed. A sweep that reached the purchased lot would push
     * `creditsDestroyed` above the 100 plan credits ever granted and break the
     * identity, whichever side won.
     */
    const [debited, swept] = await Promise.allSettled([
      debit(testDb, { userId, amount: 40, reason: 'scan:mixed' }),
      expireRenewedLots(testDb, userId, boundary),
    ]);
    expect(debited.status).toBe('fulfilled');
    expect(swept.status).toBe('fulfilled');
    const destroyed = swept.status === 'fulfilled' ? swept.value.creditsDestroyed : -1;

    expect(destroyed).toBeLessThanOrEqual(100);
    expect(await spendableTotal(userId)).toBe(150 - 40 - destroyed);
    expect(await ledgerBalance(userId)).toBe(await spendableTotal(userId));
  });
});
