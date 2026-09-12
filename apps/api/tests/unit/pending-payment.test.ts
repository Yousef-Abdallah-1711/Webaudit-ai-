import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { PendingPaymentStatus } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { transitionPendingPayment } from '../../src/services/billing/pending-payment.js';

describe('transitionPendingPayment', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it('refuses a second terminal transition after the PENDING writer wins', async () => {
    const user = await testDb.user.create({
      data: { email: 'pending-payment@example.com', passwordHash: 'test-password' },
    });
    const payment = await testDb.pendingPayment.create({
      data: {
        userId: user.id,
        kind: 'credits',
        providerReference: 'pending-payment-reference',
        amountMicros: 1_000_000,
        metadata: { kind: 'credits', credits: '10' },
      },
    });

    await expect(
      transitionPendingPayment(testDb, {
        pendingPaymentId: payment.id,
        status: PendingPaymentStatus.SUCCEEDED,
      }),
    ).resolves.toBe(true);

    await expect(
      transitionPendingPayment(testDb, {
        pendingPaymentId: payment.id,
        status: PendingPaymentStatus.EXPIRED,
      }),
    ).resolves.toBe(false);

    await expect(
      testDb.pendingPayment.findUniqueOrThrow({ where: { id: payment.id } }),
    ).resolves.toMatchObject({
      status: PendingPaymentStatus.SUCCEEDED,
    });
  });
});
