/**
 * ADMIN-003 (PLAN.md §15) — two concurrent `adjustCredits` calls against the
 * same user must not interleave badly: no lost audit record, no mismatched
 * before/after balance snapshot, and the final balance reflects both grants,
 * not one overwriting the other.
 *
 * `adjustCredits` is a pure insert (like `grantLot`) — no shared mutable row
 * to lock — so this test is expected to pass without any new locking code.
 * If it doesn't, that is a real finding in `adjustCredits` itself, not a
 * reason to add a lock speculatively.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { adjustCredits } from '../../src/services/credits/adjust.js';
import { balanceOf } from '../../src/services/credits/balance.js';

beforeEach(resetDb);
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

describe('concurrent admin grants on one user', () => {
  it('both grants land, both are audited, and the balance reflects the sum', async () => {
    const targetUserId = await makeUser('concurrent-grant-target@example.com');

    const [a, b] = await Promise.all([
      adjustCredits(testDb, {
        operatorId: 'operator-a',
        targetUserId,
        amount: 100,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'grant A',
      }),
      adjustCredits(testDb, {
        operatorId: 'operator-b',
        targetUserId,
        amount: 250,
        kind: 'PURCHASED',
        expiresAt: null,
        reason: 'grant B',
      }),
    ]);

    expect(a.transactionId).not.toBe(b.transactionId);
    expect(a.lotId).not.toBe(b.lotId);

    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(2);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: targetUserId, action: 'credits.adjust' },
    });
    expect(entries).toHaveLength(2);
    expect(new Set(entries.map((e) => e.actorId))).toEqual(new Set(['operator-a', 'operator-b']));

    const finalBalance = await balanceOf(testDb, targetUserId);
    expect(finalBalance.plan).toBe(100);
    expect(finalBalance.purchased).toBe(250);
  });

  it('ten concurrent grants all land, none lost', async () => {
    const targetUserId = await makeUser('concurrent-grant-ten@example.com');

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        adjustCredits(testDb, {
          operatorId: `operator-${String(i)}`,
          targetUserId,
          amount: 10,
          kind: 'PLAN',
          expiresAt: null,
          reason: `grant ${String(i)}`,
        }),
      ),
    );

    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(10);
    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: targetUserId, action: 'credits.adjust' },
    });
    expect(entries).toHaveLength(10);

    const finalBalance = await balanceOf(testDb, targetUserId);
    expect(finalBalance.plan).toBe(100);
  });
});
