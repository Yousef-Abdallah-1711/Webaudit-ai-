import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createStubPaymentProvider,
  type StubPaymentProviderOptions,
} from '../../src/services/billing/stub-payment-provider.js';
import type { PaymentEvent } from '../../src/services/billing/payment-provider.js';

function signedBody(
  secret: string,
  events: readonly PaymentEvent[],
): { body: Buffer; signature: string } {
  const body = Buffer.from(JSON.stringify({ events }), 'utf8');
  const signature = createHmac('sha256', secret).update(body).digest('hex');
  return { body, signature };
}

describe('stub payment provider', () => {
  it('returns a deterministic fake checkout URL and provider reference', async () => {
    const provider = createStubPaymentProvider({ baseUrl: 'https://payments.test' });

    const checkout = await provider.initCheckout({
      userId: 'user_1',
      amountMicros: 9_900_000,
      kind: 'credits',
      metadata: { credits: '100' },
    });

    expect(checkout).toEqual({
      checkoutUrl: 'https://payments.test/checkout/stub_user_1_credits_9900000',
      providerReference: 'stub_user_1_credits_9900000',
    });
  });

  it('returns configurable webhook verification results', async () => {
    const event: PaymentEvent = {
      id: 'evt_stub_1',
      type: 'payment.succeeded',
      providerReference: 'stub_ref',
      userId: 'user_1',
      amountMicros: 9_900_000,
      metadata: { kind: 'credits' },
    };
    const options: StubPaymentProviderOptions = {
      webhookResult: { valid: true, events: [event] },
    };

    await expect(
      createStubPaymentProvider(options).verifyWebhook(Buffer.from('{}'), {}),
    ).resolves.toEqual({
      valid: true,
      events: [event],
    });
  });

  it('defaults webhook verification to invalid and refunds to success', async () => {
    const provider = createStubPaymentProvider();

    await expect(provider.verifyWebhook(Buffer.from('{}'), {})).resolves.toEqual({
      valid: false,
      events: [],
    });
    await expect(provider.refund('stub_ref', 1_000_000)).resolves.toEqual({ refunded: true });
  });

  it('verifies a real HMAC-signed webhook body and parses its events, with no override configured', async () => {
    const event: PaymentEvent = {
      id: 'evt_real_1',
      type: 'payment.succeeded',
      providerReference: 'stub_user_1_credits_9900000',
      userId: 'user_1',
      amountMicros: 9_900_000,
      metadata: { kind: 'credits', credits: '100' },
    };
    const provider = createStubPaymentProvider({ webhookSecret: 'dev-secret' });
    const { body, signature } = signedBody('dev-secret', [event]);

    await expect(
      provider.verifyWebhook(body, { 'x-webhook-signature': signature }),
    ).resolves.toEqual({ valid: true, events: [event] });
  });

  it('rejects a webhook body whose signature does not match the configured secret', async () => {
    const event: PaymentEvent = {
      id: 'evt_real_2',
      type: 'payment.succeeded',
      providerReference: 'stub_user_1_credits_9900000',
      userId: 'user_1',
      amountMicros: 9_900_000,
      metadata: { kind: 'credits' },
    };
    const provider = createStubPaymentProvider({ webhookSecret: 'dev-secret' });
    const { body } = signedBody('wrong-secret', [event]);

    await expect(
      provider.verifyWebhook(body, { 'x-webhook-signature': 'not-the-real-signature' }),
    ).resolves.toEqual({ valid: false, events: [] });
    // A body signed with the wrong secret must also fail even if the header is present.
    const wrongSig = createHmac('sha256', 'wrong-secret').update(body).digest('hex');
    await expect(
      provider.verifyWebhook(body, { 'x-webhook-signature': wrongSig }),
    ).resolves.toEqual({ valid: false, events: [] });
  });
});
