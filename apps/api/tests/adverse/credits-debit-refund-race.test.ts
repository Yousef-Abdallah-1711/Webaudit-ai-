/**
 * CONC-006 (PLAN.md §7, threat-table row 10) — a debit and a refund racing
 * against the same lot. `debit.ts` and `refund.ts` both lock candidate lots
 * `FOR UPDATE` (`refund.ts`'s own module note: "`ORDER BY id` matches the
 * sweep's lock order... two transactions taking the same locks in opposite
 * orders deadlock instead of queueing"), so this is expected to serialize
 * cleanly rather than expose a new gap. Written to actually prove that,
 * rather than assume it from reading the code.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit } from '../../src/services/credits/debit.js';
import { refund } from '../../src/services/credits/refund.js';
import { balanceOf } from '../../src/services/credits/balance.js';

beforeEach(resetDb);
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

describe('a debit and a refund racing the same lot', () => {
  it('both complete, in either order, ending at the one consistent balance with no impossible lot state', async () => {
    const userId = await makeUser('debit-refund-race@example.com');
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const firstDebit = await debit(testDb, { userId, amount: 40, reason: 'scan:full_audit' });
    // Lot now has 60 remaining. Race a refund of the first debit against a
    // second debit for exactly what should be available either way the race
    // resolves (60, whether or not the refund has landed yet — see the
    // module note above on why FOR UPDATE makes this deterministic).
    const [refundResult, secondDebit] = await Promise.all([
      refund(testDb, firstDebit.id, 'reverify:lost-assert-race'),
      debit(testDb, { userId, amount: 60, reason: 'scan:reverify' }),
    ]);

    expect(refundResult.amount).toBe(40);
    expect(secondDebit.amount).toBe(60);

    // 100 - 40 (first debit) - 60 (second debit) + 40 (refund) = 40, no
    // matter which of the two operations the lock let through first.
    const balance = await balanceOf(testDb, userId);
    expect(balance.purchased).toBe(40);

    const lot = await testDb.creditLot.findFirstOrThrow({ where: { userId } });
    expect(lot.amountRemaining).toBeGreaterThanOrEqual(0);
    expect(lot.amountRemaining).toBeLessThanOrEqual(lot.amountGranted);
  });

  it('a debit racing a refund never oversells even when the debit would only fit after the refund lands', async () => {
    const userId = await makeUser('debit-refund-race-2@example.com');
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const firstDebit = await debit(testDb, { userId, amount: 40, reason: 'scan:full_audit' });
    // 60 remains. A racing debit for 90 can only succeed if the refund (+40)
    // lands first; if the debit's lock wins first, it must be refused rather
    // than oversell.
    const results = await Promise.allSettled([
      refund(testDb, firstDebit.id, 'reverify:lost-assert-race'),
      debit(testDb, { userId, amount: 90, reason: 'scan:reverify' }),
    ]);

    const [refundOutcome, debitOutcome] = results;
    expect(refundOutcome.status).toBe('fulfilled');

    const balance = await balanceOf(testDb, userId);
    if (debitOutcome.status === 'fulfilled') {
      // The refund won the race first: 100 - 40 + 40 - 90 = 10.
      expect(balance.purchased).toBe(10);
    } else {
      // The debit lost the race (only 60 was available): 100 - 40 + 40 = 100.
      expect(balance.purchased).toBe(100);
    }

    const lot = await testDb.creditLot.findFirstOrThrow({ where: { userId } });
    expect(lot.amountRemaining).toBeGreaterThanOrEqual(0);
    expect(lot.amountRemaining).toBeLessThanOrEqual(lot.amountGranted);
  });
});
