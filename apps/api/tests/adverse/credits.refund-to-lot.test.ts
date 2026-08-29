/**
 * T036 — FR-075: a refund returns credits to the lots they came from.
 *
 * This is the case a two-column balance cannot get right. Once operations
 * interleave, "give back 50 credits" has no single correct answer unless the
 * system recorded which lots the original debit drew from — and getting it
 * wrong either destroys credits someone paid cash for, or hands out permanent
 * credits in place of expiring ones.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit } from '../../src/services/credits/debit.js';
import { AlreadyRefundedError, refund } from '../../src/services/credits/refund.js';
import { balanceOf } from '../../src/services/credits/balance.js';
import { expireRenewedLots } from '../../src/services/credits/expiry.js';

const DAY = 86_400_000;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

describe('refund returns to the originating lot', () => {
  it('returns a single-lot debit to that exact lot', async () => {
    const userId = await makeUser('single@example.com');
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 30 * DAY),
    });

    const lotBefore = await testDb.creditLot.findFirstOrThrow({ where: { userId } });
    const tx = await debit(testDb, { userId, amount: 40, reason: 'single:test' });
    await refund(testDb, tx.id, 'single:refund');

    const lotAfter = await testDb.creditLot.findUniqueOrThrow({ where: { id: lotBefore.id } });
    expect(lotAfter.amountRemaining).toBe(100);
  });

  it('splits a refund back across every lot the debit drew from, proportionally', async () => {
    const userId = await makeUser('split@example.com');
    await grantLot(testDb, {
      userId,
      amount: 30,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + DAY),
    });
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    // Spans both: 30 from plan, 20 from purchased.
    const tx = await debit(testDb, { userId, amount: 50, reason: 'split:test' });
    await refund(testDb, tx.id, 'split:refund');

    const bal = await balanceOf(testDb, userId);
    // Each kind is made whole in its own currency — not 50 credits dumped into
    // whichever lot happened to be first.
    expect(bal.plan).toBe(30);
    expect(bal.purchased).toBe(100);
  });

  it('preserves the distinction between kinds rather than refunding one bucket', async () => {
    const userId = await makeUser('kinds@example.com');
    await grantLot(testDb, {
      userId,
      amount: 10,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + DAY),
    });
    await grantLot(testDb, {
      userId,
      amount: 90,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 100, reason: 'kinds:test' });
    expect((await balanceOf(testDb, userId)).plan).toBe(0);

    await refund(testDb, tx.id, 'kinds:refund');

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(10);
    expect(bal.purchased).toBe(90);
  });

  it('writes a REFUND transaction linked to the debit it reverses', async () => {
    const userId = await makeUser('link@example.com');
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 20, reason: 'link:test' });
    const rf = await refund(testDb, tx.id, 'link:refund');

    expect(rf.type).toBe('REFUND');
    expect(rf.amount).toBe(20);
    expect(rf.reversesId).toBe(tx.id);
  });

  it('refuses to refund the same debit twice', async () => {
    const userId = await makeUser('twice@example.com');
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 20, reason: 'twice:test' });
    await refund(testDb, tx.id, 'twice:refund');

    // Double-refunding would mint credits out of nothing.
    await expect(refund(testDb, tx.id, 'twice:again')).rejects.toThrow(AlreadyRefundedError);
    expect((await balanceOf(testDb, userId)).plan).toBe(50);
  });

  it('never returns credits to a lot beyond what it originally granted', async () => {
    const userId = await makeUser('cap@example.com');
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const a = await debit(testDb, { userId, amount: 25, reason: 'cap:a' });
    const b = await debit(testDb, { userId, amount: 25, reason: 'cap:b' });
    await refund(testDb, a.id, 'cap:refund-a');
    await refund(testDb, b.id, 'cap:refund-b');

    const lot = await testDb.creditLot.findFirstOrThrow({ where: { userId } });
    expect(lot.amountRemaining).toBe(lot.amountGranted);
    expect(lot.amountRemaining).toBe(50);
  });

  it('lands in a fresh lot of the same kind when the original has expired', async () => {
    const userId = await makeUser('dead@example.com');
    const boundary = new Date(Date.now() + 2000);
    await grantLot(testDb, {
      userId,
      amount: 60,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });

    const tx = await debit(testDb, { userId, amount: 40, reason: 'dead:test' });

    // The lot dies while we are holding the user's credits.
    await testDb.creditLot.updateMany({
      where: { userId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await refund(testDb, tx.id, 'dead:refund');

    // A user must never be refunded into credits that died in our custody, so
    // the refund lands in a new lot of the same kind.
    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(40);

    const refundLot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'REFUND' },
    });
    expect(refundLot.kind).toBe('PLAN');
    expect(refundLot.amountRemaining).toBe(40);
  });

  it('refuses to refund a transaction that is not a debit', async () => {
    const userId = await makeUser('nondebit@example.com');
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'FREE_GRANT',
      expiresAt: null,
    });

    const grant = await testDb.creditTransaction.findFirstOrThrow({
      where: { userId, type: 'GRANT' },
    });
    await expect(refund(testDb, grant.id, 'nondebit:test')).rejects.toThrow();
  });
});

/**
 * C1 regression — a replacement lot must carry an expiry consistent with its
 * kind, or the refund silently converts expiring plan credits into credits that
 * sort level with permanent purchased ones.
 *
 * Debit orders by `expiresAt ASC NULLS LAST, createdAt ASC`. A PLAN refund lot
 * created with `expiresAt: null` therefore ties with every PURCHASED lot and
 * loses to any purchase made earlier — so the next spend draws cash-bought
 * credits while plan credits sit unspent, which is exactly what SC-022 forbids.
 */
describe('C1 — a refund lot must not lose its place in the consumption order', () => {
  it('draws PLAN after a plan debit is refunded, even when the purchase is older', async () => {
    const userId = await makeUser('c1-order@example.com');

    // The purchase is FIRST, so `createdAt` cannot save us: if the refund lot
    // has a null expiry it ties on `expiresAt` and loses on `createdAt`.
    await grantLot(testDb, {
      userId,
      amount: 100,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId,
      amount: 50,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 2000),
    });

    // Spend the whole plan lot, then let that lot die while we hold the credits.
    const tx = await debit(testDb, { userId, amount: 50, reason: 'c1:debit' });
    await testDb.creditLot.updateMany({
      where: { userId, kind: 'PLAN' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refund(testDb, tx.id, 'c1:refund');

    const before = await balanceOf(testDb, userId);
    expect(before.plan).toBe(50);
    expect(before.purchased).toBe(100);

    // The refund lot must be spendable and must still expire — a plan credit
    // that never expires is not a plan credit.
    const refundLot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'REFUND' },
    });
    expect(refundLot.kind).toBe('PLAN');
    expect(refundLot.expiresAt).not.toBeNull();
    expect(refundLot.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    const spend = await debit(testDb, { userId, amount: 30, reason: 'c1:spend' });
    const touched = await testDb.creditAllocation.findMany({
      where: { transactionId: spend.id },
      include: { lot: true },
    });
    // SC-022: not one purchased credit may move while plan credits remain.
    expect(touched.map((a) => a.lot.kind)).toEqual(['PLAN']);
    expect(touched[0]?.lotId).toBe(refundLot.id);

    const after = await balanceOf(testDb, userId);
    expect(after.plan).toBe(20);
    expect(after.purchased).toBe(100);
  });

  it('uses the current subscription period end as the refund lot expiry', async () => {
    const userId = await makeUser('c1-sub@example.com');
    const periodEnd = new Date(Date.now() + 15 * DAY);
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(Date.now() - 15 * DAY),
        periodEnd,
      },
    });

    await grantLot(testDb, {
      userId,
      amount: 40,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: new Date(Date.now() + 2000),
    });
    const tx = await debit(testDb, { userId, amount: 40, reason: 'c1sub:debit' });
    await testDb.creditLot.updateMany({
      where: { userId, kind: 'PLAN' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await refund(testDb, tx.id, 'c1sub:refund');

    const refundLot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'REFUND' },
    });
    // Refunded plan credits live exactly as long as credits granted for this
    // period would have: they die at the renewal boundary, not before or after.
    expect(refundLot.expiresAt?.getTime()).toBe(periodEnd.getTime());
  });

  it('keeps a purchased refund lot permanent', async () => {
    const userId = await makeUser('c1-purchased@example.com');
    await grantLot(testDb, {
      userId,
      amount: 70,
      kind: 'PURCHASED',
      source: 'PURCHASE',
      expiresAt: null,
    });

    const tx = await debit(testDb, { userId, amount: 70, reason: 'c1p:debit' });
    // Purchased lots never expire, so force the orphan path the only other way
    // it can be reached: no headroom left on the originating lot.
    await testDb.creditLot.updateMany({
      where: { userId, kind: 'PURCHASED' },
      data: { amountRemaining: 70 },
    });
    await refund(testDb, tx.id, 'c1p:refund');

    const refundLot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'REFUND' },
    });
    expect(refundLot.kind).toBe('PURCHASED');
    expect(refundLot.expiresAt).toBeNull();
  });
});

/**
 * H4 regression — a refund must not resurrect credits the expiry sweep already
 * destroyed.
 *
 * The sweep runs at a renewal boundary, which is normally ahead of the wall
 * clock. If it only zeroes `amountRemaining`, the emptied lot keeps a future
 * `expiresAt` and every reader still calls it alive — so `refund` walks credits
 * straight back into a lot that already has an EXPIRE transaction against it.
 * The credits come back to life, and the next sweep destroys them a second time.
 */
describe('H4 — a swept lot is dead to a refund', () => {
  it('routes a refund to a fresh lot instead of a lot the sweep emptied', async () => {
    const userId = await makeUser('swept@example.com');
    const boundary = new Date(Date.now() + 30 * DAY);
    await grantLot(testDb, {
      userId,
      amount: 60,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: boundary,
    });
    const originalLot = await testDb.creditLot.findFirstOrThrow({ where: { userId } });

    const tx = await debit(testDb, { userId, amount: 40, reason: 'swept:debit' });

    // Renewal arrives and destroys the 20 still sitting in the lot. The boundary
    // is in the future relative to the wall clock — that is the ordinary case,
    // and the one that used to leave the lot looking alive.
    const swept = await expireRenewedLots(testDb, userId, boundary);
    expect(swept.creditsDestroyed).toBe(20);

    await refund(testDb, tx.id, 'swept:refund');

    const after = await testDb.creditLot.findUniqueOrThrow({ where: { id: originalLot.id } });
    // Not one credit may come back into it, and it must read as expired to
    // everyone, not merely as empty.
    expect(after.amountRemaining).toBe(0);
    expect(after.expiresAt).not.toBeNull();
    expect(after.expiresAt!.getTime()).toBeLessThanOrEqual(Date.now());

    // The refunded credits still belong to the user — in a live lot.
    const refundLot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'REFUND' },
    });
    expect(refundLot.kind).toBe('PLAN');
    expect(refundLot.amountRemaining).toBe(40);
    expect(refundLot.expiresAt!.getTime()).toBeGreaterThan(Date.now());

    const bal = await balanceOf(testDb, userId);
    expect(bal.plan).toBe(40);
  });

  it('leaves an already-past boundary alone when sweeping', async () => {
    const userId = await makeUser('backdated@example.com');
    const diedAt = new Date(Date.now() - 5 * DAY);
    await grantLot(testDb, {
      userId,
      amount: 25,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      expiresAt: diedAt,
    });

    await expireRenewedLots(testDb, userId, new Date());

    const lot = await testDb.creditLot.findFirstOrThrow({ where: { userId } });
    // The clamp may only ever move a boundary earlier. Rewriting this one to
    // "now" would hand back five days the credits never had.
    expect(lot.expiresAt?.getTime()).toBe(diedAt.getTime());
    expect(lot.amountRemaining).toBe(0);
  });
});
