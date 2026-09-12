import { describe, expect, it, vi } from 'vitest';
import { createPaymobPaymentProvider } from '../../src/services/billing/paymob-payment-provider.js';

const config = {
  apiKey: 'api-key',
  hmacSecret: 'hmac-secret',
  integrationId: '123456',
  baseUrl: 'https://accept.paymob.test',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('PaymobPaymentProvider', () => {
  it('fails closed when any required credential is missing', () => {
    expect(() => createPaymobPaymentProvider({ ...config, apiKey: '' })).toThrow(/PAYMOB_API_KEY/);
    expect(() => createPaymobPaymentProvider({ ...config, hmacSecret: '' })).toThrow(
      /PAYMOB_HMAC_SECRET/,
    );
    expect(() => createPaymobPaymentProvider({ ...config, integrationId: '' })).toThrow(
      /PAYMOB_INTEGRATION_ID/,
    );
  });

  it('exchanges auth, creates an order, then creates a payment key using piasters', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'auth-token' }))
      .mockResolvedValueOnce(json({ id: 99 }))
      .mockResolvedValueOnce(json({ token: 'payment-key' }));
    const provider = createPaymobPaymentProvider({
      ...config,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(
      provider.initCheckout({
        userId: 'user_1',
        amountMicros: 12_500_000,
        kind: 'credits',
        metadata: { kind: 'credits', credits: '100' },
      }),
    ).resolves.toEqual({
      providerReference: '99',
      checkoutUrl:
        'https://accept.paymob.test/api/acceptance/iframes/123456?payment_token=payment-key',
    });

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://accept.paymob.test/api/auth/tokens',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ api_key: 'api-key' }) }),
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toMatchObject({
      auth_token: 'auth-token',
      amount_cents: 1250,
      currency: 'EGP',
      delivery_needed: false,
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({
      auth_token: 'auth-token',
      order_id: 99,
      amount_cents: 1250,
      integration_id: 123456,
      currency: 'EGP',
    });
  });

  it.each([
    [401, 'AUTH_FAILED'],
    [429, 'RATE_LIMITED'],
    [503, 'SERVER_ERROR'],
  ] as const)('maps HTTP %i to a typed %s error', async (status, code) => {
    const provider = createPaymobPaymentProvider({
      ...config,
      fetchImpl: vi.fn().mockResolvedValue(json({ message: 'nope' }, status)),
    });

    await expect(
      provider.initCheckout({
        userId: 'user_1',
        amountMicros: 10_000,
        kind: 'credits',
        metadata: {},
      }),
    ).rejects.toMatchObject({ code });
  });

  it('maps an aborted request to a typed timeout error', async () => {
    const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const provider = createPaymobPaymentProvider({
      ...config,
      fetchImpl: vi.fn().mockRejectedValue(aborted),
    });

    await expect(
      provider.initCheckout({
        userId: 'user_1',
        amountMicros: 10_000,
        kind: 'credits',
        metadata: {},
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('maps only a valid signed Paymob transaction callback into the shared payment event', async () => {
    const provider = createPaymobPaymentProvider({ ...config, fetchImpl: vi.fn() });
    const payload = {
      obj: {
        amount_cents: 1250,
        created_at: '2026-09-12T10:11:12.000000+02:00',
        currency: 'EGP',
        error_occured: false,
        has_parent_transaction: false,
        id: 987654,
        integration_id: 123456,
        is_3d_secure: true,
        is_auth: false,
        is_capture: false,
        is_refunded: false,
        is_standalone_payment: true,
        is_voided: false,
        order: {
          id: 99,
          merchant_order_id:
            'webaudit:eyJ1c2VySWQiOiJ1c2VyXzEiLCJraW5kIjoiY3JlZGl0cyIsIm1ldGFkYXRhIjp7ImtpbmQiOiJjcmVkaXRzIiwiY3JlZGl0cyI6IjEwMCJ9fQ',
        },
        owner: 42,
        pending: false,
        source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
        success: true,
      },
    };
    const signature =
      'f506bdbf4737c83398cddc488a2bf52c4d889ce22a2dfe3ccbdedba94f609b58' +
      '37f3f65284c6728ea16026cf674917ef8d2cd26f571d61242dd29f44aadcfbb1';

    await expect(
      provider.verifyWebhook(Buffer.from(JSON.stringify(payload)), { hmac: signature }),
    ).resolves.toEqual({
      valid: true,
      events: [
        {
          id: '987654',
          type: 'payment.succeeded',
          providerReference: '99',
          userId: 'user_1',
          amountMicros: 12_500_000,
          metadata: { kind: 'credits', credits: '100' },
        },
      ],
    });
    await expect(
      provider.verifyWebhook(Buffer.from(JSON.stringify(payload)), { hmac: `${signature}00` }),
    ).resolves.toEqual({ valid: false, events: [] });
  });

  it('authenticates and calls the Paymob refund endpoint in piasters', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json({ token: 'auth-token' }))
      .mockResolvedValueOnce(json({ success: true }));
    const provider = createPaymobPaymentProvider({
      ...config,
      fetchImpl: fetchImpl as typeof fetch,
    });

    await expect(provider.refund('987654', 12_500_000)).resolves.toEqual({ refunded: true });
    expect(fetchImpl.mock.calls[1]?.[0]).toBe(
      'https://accept.paymob.test/api/acceptance/void_refund/refund',
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body))).toEqual({
      auth_token: 'auth-token',
      transaction_id: 987654,
      amount_cents: 1250,
    });
  });
});
