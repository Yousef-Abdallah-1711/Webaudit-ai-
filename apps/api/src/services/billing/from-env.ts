import type { PaymentProvider } from './payment-provider.js';
import { createPaymobPaymentProvider } from './paymob-payment-provider.js';
import { createStubPaymentProvider } from './stub-payment-provider.js';

export interface PaymentProviderEnvOptions {
  readonly fetchImpl?: typeof fetch;
}

/**
 * Selects the real provider only from a complete Paymob configuration. A
 * partial configuration is an operator error, never permission to quietly
 * route real traffic through the development stub.
 */
export function createPaymentProviderFromEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: PaymentProviderEnvOptions = {},
): PaymentProvider | undefined {
  const apiKey = env['PAYMOB_API_KEY'] ?? '';
  const hmacSecret = env['PAYMOB_HMAC_SECRET'] ?? '';
  const integrationId = env['PAYMOB_INTEGRATION_ID'] ?? '';
  const configured = [apiKey, hmacSecret, integrationId].filter(
    (value) => value.trim() !== '',
  ).length;

  if (configured === 0) {
    if (env['NODE_ENV'] === 'production') return undefined;
    return createStubPaymentProvider();
  }
  if (configured !== 3) {
    throw new Error(
      'PAYMOB_API_KEY, PAYMOB_HMAC_SECRET, and PAYMOB_INTEGRATION_ID must be configured together.',
    );
  }
  return createPaymobPaymentProvider({
    apiKey,
    hmacSecret,
    integrationId,
    ...(env['PAYMOB_BASE_URL'] === undefined ? {} : { baseUrl: env['PAYMOB_BASE_URL'] }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
  });
}
