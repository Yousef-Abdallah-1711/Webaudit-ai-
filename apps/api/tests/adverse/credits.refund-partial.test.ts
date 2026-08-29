import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { grantLot } from '../../src/services/credits/grant.js';
import { debit } from '../../src/services/credits/debit.js';
import {
  refundPartial,
  OverRefundError,
  NotRefundableError,
  AlreadyRefundedError,
} from '../../src/services/credits/refund.js';
import { balanceOf } from '../../src/services/credits/balance.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('refundPartial', () => {
  it('returns a proportional share, rounded down, to the exact lot it was drawn from', async () => {
    const user = await testDb.user.create({
      data: { email: 'r1@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 100,
      source: 'PURCHASE',
      expiresAt: null,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 30,
      reason: 'scan:create',
      scanId: 'scan-1',
    });

    const refunded = await refundPartial(testDb, {
      debitTransactionId: result.id,
      credits: 10,
      reason: 'undelivered:1-of-3',
    });

    expect(refunded.amount).toBe(10);
    expect(refunded.reversesId).toBe(result.id);
    const balance = await balanceOf(testDb, user.id);
    expect(balance.purchased).toBe(80); // 100 granted - 30 debited + 10 refunded
  });

  it('splits proportionally across two lots the debit drew from, floored down, with the remainder on the larger share', async () => {
    const user = await testDb.user.create({
      data: { email: 'r2@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 7,
      source: 'PURCHASE',
      expiresAt: null,
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 100,
      source: 'PURCHASE',
      expiresAt: null,
    });
    // Debit draws 7 from the first lot (expires-first ordering exhausts it), 3 from the second: total 10.
    const result = await debit(testDb, {
      userId: user.id,
      amount: 10,
      reason: 'scan:create',
      scanId: 'scan-2',
    });

    // Refund 1 of the 10 credits charged. Proportional shares: 7*1/10=0.7→0, 3*1/10=0.3→0,
    // distributed=0, remainder=1, goes to the larger allocation (the 7-credit one).
    const refunded = await refundPartial(testDb, {
      debitTransactionId: result.id,
      credits: 1,
      reason: 'undelivered:test',
    });
    expect(refunded.amount).toBe(1);

    const balance = await balanceOf(testDb, user.id);
    expect(balance.purchased).toBe(98); // 107 granted - 10 debited + 1 refunded
  });

  it('refuses to refund more than was charged on the debit', async () => {
    const user = await testDb.user.create({
      data: { email: 'r3@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 50,
      source: 'PURCHASE',
      expiresAt: null,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 20,
      reason: 'scan:create',
      scanId: 'scan-3',
    });

    await expect(
      refundPartial(testDb, { debitTransactionId: result.id, credits: 25, reason: 'too-much' }),
    ).rejects.toThrow(OverRefundError);
  });

  it('refuses a second refund on the same debit', async () => {
    const user = await testDb.user.create({
      data: { email: 'r3b@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 50,
      source: 'PURCHASE',
      expiresAt: null,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 20,
      reason: 'scan:create',
      scanId: 'scan-3b',
    });
    await refundPartial(testDb, { debitTransactionId: result.id, credits: 15, reason: 'first' });

    // A second refund on the same debit is not allowed because reversesId is @unique in the schema.
    await expect(
      refundPartial(testDb, { debitTransactionId: result.id, credits: 5, reason: 'second' }),
    ).rejects.toThrow(AlreadyRefundedError);
  });

  it('routes a partial refund into a fresh lot when the source lot has since expired', async () => {
    const user = await testDb.user.create({
      data: { email: 'r4@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    const soon = new Date(Date.now() + 50);
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PLAN',
      amount: 10,
      source: 'FREE_GRANT',
      expiresAt: soon,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 10,
      reason: 'scan:create',
      scanId: 'scan-4',
    });
    await new Promise((resolve) => setTimeout(resolve, 80)); // let the lot expire

    const refunded = await refundPartial(testDb, {
      debitTransactionId: result.id,
      credits: 4,
      reason: 'undelivered:test',
    });
    expect(refunded.amount).toBe(4);
    const balance = await balanceOf(testDb, user.id);
    // The expired lot cannot receive it back; a new PLAN lot carries the 4 credits instead.
    expect(balance.plan).toBe(4);
  });

  it('rejects a zero or negative refund amount', async () => {
    const user = await testDb.user.create({
      data: { email: 'r5@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 10,
      source: 'PURCHASE',
      expiresAt: null,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 10,
      reason: 'scan:create',
      scanId: 'scan-5',
    });
    await expect(
      refundPartial(testDb, { debitTransactionId: result.id, credits: 0, reason: 'x' }),
    ).rejects.toThrow(NotRefundableError);
  });
});

describe('refund() after the refundPartial refactor', () => {
  it('still refunds the full debit in one call, unchanged from before', async () => {
    const user = await testDb.user.create({
      data: { email: 'r6@example.com', passwordHash: 'x', emailVerifiedAt: new Date() },
    });
    await grantLot(testDb, {
      userId: user.id,
      kind: 'PURCHASED',
      amount: 50,
      source: 'PURCHASE',
      expiresAt: null,
    });
    const result = await debit(testDb, {
      userId: user.id,
      amount: 30,
      reason: 'scan:create',
      scanId: 'scan-6',
    });
    const { refund } = await import('../../src/services/credits/refund.js');
    const refunded = await refund(testDb, result.id, 'platform-fault');
    expect(refunded.amount).toBe(30);
    const balance = await balanceOf(testDb, user.id);
    expect(balance.purchased).toBe(50);
  });
});
