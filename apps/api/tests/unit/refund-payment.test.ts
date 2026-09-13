import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PendingPaymentStatus } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  RefundNotAuthorizedError,
  refundPayment,
} from '../../src/services/billing/refund-payment.js';
import type { PaymentProvider } from '../../src/services/billing/payment-provider.js';

function fakeProvider(): PaymentProvider & { readonly refundCalls: unknown[] } {
  const refundCalls: unknown[] = [];
  return {
    refundCalls,
    initCheckout: vi.fn(),
    verifyWebhook: vi.fn(),
    refund: vi.fn(async (providerReference: string, amountMicros: number) => {
      refundCalls.push({ providerReference, amountMicros });
      return { refunded: true };
    }),
  };
}

describe('refundPayment', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  async function createPending(
    status: PendingPaymentStatus,
    amountMicros = 5_000_000,
  ): Promise<{ providerReference: string }> {
    const user = await testDb.user.create({
      data: { email: `refund-${Date.now()}-${Math.random()}@example.com`, passwordHash: 'x' },
    });
    const providerReference = `ref-${user.id}`;
    await testDb.pendingPayment.create({
      data: {
        userId: user.id,
        kind: 'credits',
        providerReference,
        amountMicros,
        status,
        metadata: { kind: 'credits', credits: '10' },
      },
    });
    return { providerReference };
  }

  it('refunds only a payment this system recorded as SUCCEEDED', async () => {
    const { providerReference } = await createPending(PendingPaymentStatus.SUCCEEDED);
    const provider = fakeProvider();

    const result = await refundPayment(testDb, provider, {
      providerReference,
      amountMicros: 5_000_000,
    });

    expect(result).toEqual({ refunded: true });
    expect(provider.refundCalls).toEqual([{ providerReference, amountMicros: 5_000_000 }]);
  });

  it('refuses a refund for a payment that is still PENDING', async () => {
    const { providerReference } = await createPending(PendingPaymentStatus.PENDING);
    const provider = fakeProvider();

    await expect(
      refundPayment(testDb, provider, { providerReference, amountMicros: 5_000_000 }),
    ).rejects.toThrow(RefundNotAuthorizedError);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('refuses a refund for a payment that already FAILED', async () => {
    const { providerReference } = await createPending(PendingPaymentStatus.FAILED);
    const provider = fakeProvider();

    await expect(
      refundPayment(testDb, provider, { providerReference, amountMicros: 5_000_000 }),
    ).rejects.toThrow(RefundNotAuthorizedError);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('refuses a refund with no matching recorded payment at all', async () => {
    const provider = fakeProvider();

    await expect(
      refundPayment(testDb, provider, {
        providerReference: 'no-such-reference',
        amountMicros: 1_000_000,
      }),
    ).rejects.toThrow(RefundNotAuthorizedError);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('refuses a refund amount greater than what was actually charged', async () => {
    const { providerReference } = await createPending(PendingPaymentStatus.SUCCEEDED, 2_000_000);
    const provider = fakeProvider();

    await expect(
      refundPayment(testDb, provider, { providerReference, amountMicros: 2_000_001 }),
    ).rejects.toThrow(RefundNotAuthorizedError);
    expect(provider.refund).not.toHaveBeenCalled();
  });

  it('refuses a non-positive refund amount before ever touching the database', async () => {
    const provider = fakeProvider();

    await expect(
      refundPayment(testDb, provider, { providerReference: 'irrelevant', amountMicros: 0 }),
    ).rejects.toThrow(RefundNotAuthorizedError);
    expect(provider.refund).not.toHaveBeenCalled();
  });
});
