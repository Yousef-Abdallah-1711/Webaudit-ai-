import { describe, expect, it, vi } from 'vitest';
import { createPaymentProviderFromEnv } from '../../src/services/billing/from-env.js';

describe('payment provider environment wiring', () => {
  it('keeps the stub provider when Paymob is wholly unconfigured in dev/test', async () => {
    const provider = createPaymentProviderFromEnv({ NODE_ENV: 'test' })!;
    await expect(
      provider.initCheckout({
        userId: 'user_1',
        amountMicros: 10_000,
        kind: 'credits',
        metadata: {},
      }),
    ).resolves.toMatchObject({ providerReference: expect.stringMatching(/^stub_/) });
  });

  it('fails closed on partial Paymob configuration', () => {
    expect(() =>
      createPaymentProviderFromEnv({ NODE_ENV: 'development', PAYMOB_API_KEY: 'only-one-value' }),
    ).toThrow(/PAYMOB_API_KEY, PAYMOB_HMAC_SECRET, and PAYMOB_INTEGRATION_ID/);
  });

  it('builds the real provider only when every required Paymob value is configured', () => {
    const fetchImpl = vi.fn(() => new Promise<Response>(() => undefined));
    const provider = createPaymentProviderFromEnv(
      {
        NODE_ENV: 'development',
        PAYMOB_API_KEY: 'api',
        PAYMOB_HMAC_SECRET: 'hmac',
        PAYMOB_INTEGRATION_ID: '123',
        PAYMOB_BASE_URL: 'https://accept.paymob.test',
      },
      { fetchImpl: fetchImpl as typeof fetch },
    )!;
    void provider.initCheckout({
      userId: 'user_1',
      amountMicros: 10_000,
      kind: 'credits',
      metadata: {},
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://accept.paymob.test/api/auth/tokens',
      expect.any(Object),
    );
  });
});
