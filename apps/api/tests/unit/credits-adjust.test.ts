/**
 * ADMIN-001 (PLAN.md, Finding HIGH-2) — `adjustCredits`, the operator's only
 * way to grant credits directly. Before this file existed, this capability
 * did not exist anywhere in the codebase.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { adjustCredits, InvalidCreditAdjustmentError } from '../../src/services/credits/adjust.js';
import { UserNotFoundError } from '../../src/services/admin/users.service.js';

beforeEach(resetDb);
afterAll(closeDb);

async function makeUser(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

describe('adjustCredits', () => {
  it('grants PLAN credits with a future expiry, sourced ADMIN_GRANT', async () => {
    const targetUserId = await makeUser('grant-target@example.com');
    const expiresAt = new Date(Date.now() + 30 * 86_400_000);

    const result = await adjustCredits(testDb, {
      operatorId: 'operator-1',
      targetUserId,
      amount: 100,
      kind: 'PLAN',
      expiresAt,
      reason: 'goodwill credit for a support ticket',
    });

    expect(result.balanceBefore.plan).toBe(0);
    expect(result.balanceAfter.plan).toBe(100);

    const lot = await testDb.creditLot.findUniqueOrThrow({ where: { id: result.lotId } });
    expect(lot.kind).toBe('PLAN');
    expect(lot.source).toBe('ADMIN_GRANT');
    expect(lot.amountGranted).toBe(100);
    expect(lot.amountRemaining).toBe(100);
    expect(lot.expiresAt?.getTime()).toBe(expiresAt.getTime());

    const transaction = await testDb.creditTransaction.findUniqueOrThrow({
      where: { id: result.transactionId },
    });
    expect(transaction.type).toBe('GRANT');
    expect(transaction.amount).toBe(100);
    expect(transaction.reason).toBe('goodwill credit for a support ticket');
  });

  it('grants PURCHASED credits with a null expiry', async () => {
    const targetUserId = await makeUser('grant-purchased@example.com');

    const result = await adjustCredits(testDb, {
      operatorId: 'operator-1',
      targetUserId,
      amount: 250,
      kind: 'PURCHASED',
      expiresAt: null,
      reason: 'billing correction: undercharged last invoice',
    });

    expect(result.balanceAfter.purchased).toBe(250);
    const lot = await testDb.creditLot.findUniqueOrThrow({ where: { id: result.lotId } });
    expect(lot.expiresAt).toBeNull();
    expect(lot.source).toBe('ADMIN_GRANT');
  });

  it('rejects amount <= 0 before writing anything', async () => {
    const targetUserId = await makeUser('reject-amount@example.com');

    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId,
        amount: 0,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'x',
      }),
    ).rejects.toThrow(InvalidCreditAdjustmentError);

    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId,
        amount: -5,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'x',
      }),
    ).rejects.toThrow(InvalidCreditAdjustmentError);

    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(0);
    const entries = await testDb.auditLogEntry.findMany({ where: { subjectId: targetUserId } });
    expect(entries).toHaveLength(0);
  });

  it('rejects a non-integer amount', async () => {
    const targetUserId = await makeUser('reject-fraction@example.com');
    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId,
        amount: 1.5,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'x',
      }),
    ).rejects.toThrow(InvalidCreditAdjustmentError);
  });

  it('rejects kind: PURCHASED with a non-null expiresAt', async () => {
    const targetUserId = await makeUser('reject-purchased-expiry@example.com');
    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId,
        amount: 10,
        kind: 'PURCHASED',
        expiresAt: new Date(Date.now() + 86_400_000),
        reason: 'x',
      }),
    ).rejects.toThrow(InvalidCreditAdjustmentError);

    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(0);
  });

  it('rejects an empty or whitespace-only reason', async () => {
    const targetUserId = await makeUser('reject-reason@example.com');
    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId,
        amount: 10,
        kind: 'PLAN',
        expiresAt: null,
        reason: '   ',
      }),
    ).rejects.toThrow(InvalidCreditAdjustmentError);
  });

  it('rejects a nonexistent target user, writing nothing', async () => {
    await expect(
      adjustCredits(testDb, {
        operatorId: 'operator-1',
        targetUserId: 'does-not-exist',
        amount: 10,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'x',
      }),
    ).rejects.toThrow(UserNotFoundError);
  });

  it('writes exactly one AuditLogEntry with actor, subject, and before/after balances', async () => {
    const targetUserId = await makeUser('audit-check@example.com');

    await adjustCredits(testDb, {
      operatorId: 'operator-42',
      targetUserId,
      amount: 60,
      kind: 'PLAN',
      expiresAt: null,
      reason: 'manual correction',
    });

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: targetUserId, action: 'credits.adjust' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe('operator-42');
    expect(entries[0]?.before).toEqual({ plan: 0, purchased: 0 });
    expect(entries[0]?.after).toEqual({ plan: 60, purchased: 0 });
  });
});
