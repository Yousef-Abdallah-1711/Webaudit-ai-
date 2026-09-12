import { describe, expect, it } from 'vitest';
import type {
  PaymentEvent,
  PaymentProvider,
  PaymentProviderCheckoutInput,
} from '../../src/services/billing/payment-provider.js';
import { PaymentProviderNotConfiguredError } from '../../src/services/billing/payment-provider.js';

describe('PaymentProvider contract', () => {
  it('describes checkout initiation, webhook verification, and refunds in integer micros', async () => {
    const events: PaymentEvent[] = [
      {
        id: 'evt_1',
        type: 'payment.succeeded',
        providerReference: 'pay_ref_1',
        userId: 'user_1',
        amountMicros: 12_500_000,
        metadata: { kind: 'credits', credits: '100' },
      },
    ];
    const provider: PaymentProvider = {
      initCheckout(input: PaymentProviderCheckoutInput) {
        expect(Number.isInteger(input.amountMicros)).toBe(true);
        expect(input.amountMicros).toBeGreaterThan(0);
        return Promise.resolve({
          checkoutUrl: `https://payments.test/checkout/${input.metadata['kind']}`,
          providerReference: 'pay_ref_1',
        });
      },
      verifyWebhook(rawBody, headers) {
        expect(rawBody).toBeInstanceOf(Buffer);
        expect(headers['x-test-signature']).toBe('valid');
        return Promise.resolve({ valid: true, events });
      },
      refund(providerReference, amountMicros) {
        expect(providerReference).toBe('pay_ref_1');
        expect(amountMicros).toBe(12_500_000);
        return Promise.resolve({ refunded: true });
      },
    };

    const checkout = await provider.initCheckout({
      userId: 'user_1',
      amountMicros: 12_500_000,
      kind: 'credits',
      metadata: { kind: 'credits', credits: '100' },
    });
    const verified = await provider.verifyWebhook(Buffer.from('{}'), {
      'x-test-signature': 'valid',
    });
    const refund = await provider.refund(checkout.providerReference, 12_500_000);

    expect(checkout).toEqual({
      checkoutUrl: 'https://payments.test/checkout/credits',
      providerReference: 'pay_ref_1',
    });
    expect(verified).toEqual({ valid: true, events });
    expect(refund).toEqual({ refunded: true });
  });

  it('has a loud unconfigured-provider error for production wiring', () => {
    expect(() => {
      throw new PaymentProviderNotConfiguredError('PAYMENT_PROVIDER');
    }).toThrow(/PAYMENT_PROVIDER/);
  });
});
