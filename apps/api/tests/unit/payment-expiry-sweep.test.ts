import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PendingPaymentStatus } from '../../prisma/generated/client/index.js';
import { sweepExpiredPendingPayments } from '../../src/services/billing/payment-expiry-sweep.js';
import { transitionPendingPayment } from '../../src/services/billing/pending-payment.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

describe('sweepExpiredPendingPayments', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it('expires only PENDING payments older than the abandonment window', async () => {
    const user = await testDb.user.create({
      data: { email: 'expiry@example.com', passwordHash: 'test-password' },
    });
    const now = new Date('2026-09-12T12:00:00.000Z');
    const old = await testDb.pendingPayment.create({
      data: {
        userId: user.id,
        kind: 'credits',
        providerReference: 'old-payment',
        amountMicros: 1_000_000,
        metadata: {},
        createdAt: new Date(now.getTime() - 61 * 60_000),
      },
    });
    const current = await testDb.pendingPayment.create({
      data: {
        userId: user.id,
        kind: 'credits',
        providerReference: 'current-payment',
        amountMicros: 1_000_000,
        metadata: {},
        createdAt: new Date(now.getTime() - 59 * 60_000),
      },
    });

    await expect(
      sweepExpiredPendingPayments(testDb, { now, abandonmentWindowMs: 60 * 60_000 }),
    ).resolves.toBe(1);
    await expect(
      testDb.pendingPayment.findUniqueOrThrow({ where: { id: old.id } }),
    ).resolves.toMatchObject({
      status: PendingPaymentStatus.EXPIRED,
    });
    await expect(
      testDb.pendingPayment.findUniqueOrThrow({ where: { id: current.id } }),
    ).resolves.toMatchObject({
      status: PendingPaymentStatus.PENDING,
    });
  });

  it('leaves a payment SUCCEEDED when completion wins after the sweep reads it', async () => {
    const user = await testDb.user.create({
      data: { email: 'expiry-race@example.com', passwordHash: 'test-password' },
    });
    const now = new Date('2026-09-12T12:00:00.000Z');
    const payment = await testDb.pendingPayment.create({
      data: {
        userId: user.id,
        kind: 'credits',
        providerReference: 'race-payment',
        amountMicros: 1_000_000,
        metadata: {},
        createdAt: new Date(now.getTime() - 61 * 60_000),
      },
    });

    await expect(
      sweepExpiredPendingPayments(testDb, {
        now,
        abandonmentWindowMs: 60 * 60_000,
        onBeforeTransition: async () => {
          await transitionPendingPayment(testDb, {
            pendingPaymentId: payment.id,
            status: PendingPaymentStatus.SUCCEEDED,
          });
        },
      }),
    ).resolves.toBe(0);
    await expect(
      testDb.pendingPayment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({
      status: PendingPaymentStatus.SUCCEEDED,
    });
  });
});
