import {
  PaymentProviderNotConfiguredError,
  type PaymentEvent,
  type PaymentProvider,
  type PaymentProviderCheckout,
  type PaymentProviderCheckoutInput,
  type PaymentRefundResult,
  type PaymentWebhookVerification,
} from './payment-provider.js';
import { verifyPaymobTransactionHmac } from './paymob-hmac.js';

const MICROS_PER_PIASTER = 10_000;
const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_BASE_URL = 'https://accept.paymob.com';

export type PaymobProviderErrorCode =
  'AUTH_FAILED' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'TIMEOUT' | 'BAD_RESPONSE';

export class PaymobProviderError extends Error {
  override readonly name = 'PaymobProviderError';

  constructor(
    readonly code: PaymobProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export interface PaymobPaymentProviderOptions {
  readonly apiKey: string;
  readonly hmacSecret: string;
  readonly integrationId: string;
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly timeoutMs?: number;
}

interface CheckoutContext {
  readonly userId: string;
  readonly kind: 'subscription' | 'credits';
  readonly metadata: Readonly<Record<string, string>>;
}

type JsonRecord = Record<string, unknown>;

function requireValue(value: string, name: string): string {
  if (value.trim() === '') throw new PaymentProviderNotConfiguredError(name);
  return value;
}

function jsonRecord(value: unknown): JsonRecord | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function piastersFromMicros(amountMicros: number): number {
  if (
    !Number.isSafeInteger(amountMicros) ||
    amountMicros <= 0 ||
    amountMicros % MICROS_PER_PIASTER !== 0
  ) {
    throw new PaymobProviderError(
      'BAD_RESPONSE',
      'Checkout amount must be a positive whole number of piasters.',
    );
  }
  return amountMicros / MICROS_PER_PIASTER;
}

function microsFromPiasters(amountCents: unknown): number | undefined {
  if (typeof amountCents !== 'number' || !Number.isSafeInteger(amountCents) || amountCents < 0)
    return undefined;
  const micros = amountCents * MICROS_PER_PIASTER;
  return Number.isSafeInteger(micros) ? micros : undefined;
}

function encodeCheckoutContext(input: PaymentProviderCheckoutInput): string {
  const context: CheckoutContext = {
    userId: input.userId,
    kind: input.kind,
    metadata: input.metadata,
  };
  return `webaudit:${Buffer.from(JSON.stringify(context), 'utf8').toString('base64url')}`;
}

function decodeCheckoutContext(value: unknown): CheckoutContext | undefined {
  if (typeof value !== 'string' || !value.startsWith('webaudit:')) return undefined;
  try {
    const parsed = jsonRecord(
      JSON.parse(Buffer.from(value.slice('webaudit:'.length), 'base64url').toString('utf8')),
    );
    if (parsed === undefined || typeof parsed['userId'] !== 'string') return undefined;
    if (parsed['kind'] !== 'subscription' && parsed['kind'] !== 'credits') return undefined;
    const metadata = jsonRecord(parsed['metadata']);
    if (
      metadata === undefined ||
      Object.values(metadata).some((entry) => typeof entry !== 'string')
    )
      return undefined;
    return {
      userId: parsed['userId'],
      kind: parsed['kind'],
      metadata: metadata as Record<string, string>,
    };
  } catch {
    return undefined;
  }
}

function signatureFrom(headers: Readonly<Record<string, string | undefined>>): string | undefined {
  return headers['hmac'] ?? headers['x-paymob-hmac'] ?? headers['x-webhook-signature'];
}

function mapHttpFailure(status: number): PaymobProviderError {
  if (status === 401 || status === 403)
    return new PaymobProviderError('AUTH_FAILED', 'Paymob rejected the configured credentials.');
  if (status === 429)
    return new PaymobProviderError('RATE_LIMITED', 'Paymob rate limited this request.');
  if (status >= 500)
    return new PaymobProviderError('SERVER_ERROR', 'Paymob is temporarily unavailable.');
  return new PaymobProviderError('BAD_RESPONSE', `Paymob returned unexpected HTTP ${status}.`);
}

/** Real Paymob legacy Accept adapter. It never receives or logs card data. */
export function createPaymobPaymentProvider(
  options: PaymobPaymentProviderOptions,
): PaymentProvider {
  const apiKey = requireValue(options.apiKey, 'PAYMOB_API_KEY');
  const hmacSecret = requireValue(options.hmacSecret, 'PAYMOB_HMAC_SECRET');
  const integrationId = requireValue(options.integrationId, 'PAYMOB_INTEGRATION_ID');
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;

  async function post(path: string, body: JsonRecord): Promise<JsonRecord> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response.ok) throw mapHttpFailure(response.status);
      const parsed = jsonRecord(await response.json());
      if (parsed === undefined)
        throw new PaymobProviderError('BAD_RESPONSE', 'Paymob returned a non-object response.');
      return parsed;
    } catch (error) {
      if (error instanceof PaymobProviderError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new PaymobProviderError('TIMEOUT', `Paymob did not respond within ${timeoutMs}ms.`);
      }
      throw new PaymobProviderError(
        'SERVER_ERROR',
        'Paymob request failed before a response was received.',
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async function authToken(): Promise<string> {
    const response = await post('/api/auth/tokens', { api_key: apiKey });
    if (typeof response['token'] !== 'string' || response['token'] === '') {
      throw new PaymobProviderError(
        'BAD_RESPONSE',
        'Paymob auth response did not contain a token.',
      );
    }
    return response['token'];
  }

  return {
    async initCheckout(input): Promise<PaymentProviderCheckout> {
      const amountCents = piastersFromMicros(input.amountMicros);
      const token = await authToken();
      const order = await post('/api/ecommerce/orders', {
        auth_token: token,
        delivery_needed: false,
        amount_cents: amountCents,
        currency: 'EGP',
        merchant_order_id: encodeCheckoutContext(input),
        items: [],
      });
      const orderId = order['id'];
      if ((typeof orderId !== 'number' && typeof orderId !== 'string') || String(orderId) === '') {
        throw new PaymobProviderError(
          'BAD_RESPONSE',
          'Paymob order response did not contain an id.',
        );
      }
      const paymentKey = await post('/api/acceptance/payment_keys', {
        auth_token: token,
        amount_cents: amountCents,
        expiration: 3600,
        order_id: orderId,
        billing_data: {
          apartment: 'NA',
          building: 'NA',
          city: 'NA',
          country: 'EG',
          email: 'NA',
          floor: 'NA',
          first_name: 'NA',
          last_name: 'NA',
          phone_number: 'NA',
          postal_code: 'NA',
          state: 'NA',
          street: 'NA',
        },
        currency: 'EGP',
        integration_id: Number(integrationId),
      });
      if (typeof paymentKey['token'] !== 'string' || paymentKey['token'] === '') {
        throw new PaymobProviderError(
          'BAD_RESPONSE',
          'Paymob payment-key response did not contain a token.',
        );
      }
      return {
        providerReference: String(orderId),
        checkoutUrl: `${baseUrl}/api/acceptance/iframes/${encodeURIComponent(integrationId)}?payment_token=${encodeURIComponent(paymentKey['token'])}`,
      };
    },

    verifyWebhook(rawBody, headers): Promise<PaymentWebhookVerification> {
      const invalid: PaymentWebhookVerification = { valid: false, events: [] };
      let payload: unknown;
      try {
        payload = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return Promise.resolve(invalid);
      }
      if (!verifyPaymobTransactionHmac(payload, signatureFrom(headers), hmacSecret)) {
        return Promise.resolve(invalid);
      }

      const envelope = jsonRecord(payload);
      const transaction =
        envelope === undefined ? undefined : (jsonRecord(envelope['obj']) ?? envelope);
      const order = transaction === undefined ? undefined : jsonRecord(transaction['order']);
      const context =
        order === undefined ? undefined : decodeCheckoutContext(order['merchant_order_id']);
      const amountMicros =
        transaction === undefined ? undefined : microsFromPiasters(transaction['amount_cents']);
      if (
        transaction === undefined ||
        order === undefined ||
        context === undefined ||
        amountMicros === undefined ||
        (typeof transaction['id'] !== 'string' && typeof transaction['id'] !== 'number') ||
        (typeof order['id'] !== 'string' && typeof order['id'] !== 'number') ||
        String(transaction['integration_id']) !== integrationId ||
        typeof transaction['success'] !== 'boolean'
      ) {
        return Promise.resolve(invalid);
      }
      const event: PaymentEvent = {
        id: String(transaction['id']),
        type:
          transaction['is_refunded'] === true
            ? 'refund.succeeded'
            : transaction['success']
              ? 'payment.succeeded'
              : 'payment.failed',
        providerReference: String(order['id']),
        userId: context.userId,
        amountMicros,
        metadata: { kind: context.kind, ...context.metadata },
      };
      return Promise.resolve({ valid: true, events: [event] });
    },

    async refund(providerReference, amountMicros): Promise<PaymentRefundResult> {
      const transactionId = Number(providerReference);
      if (!Number.isSafeInteger(transactionId) || transactionId <= 0) {
        throw new PaymobProviderError(
          'BAD_RESPONSE',
          'Paymob refund requires a numeric transaction reference.',
        );
      }
      const token = await authToken();
      const result = await post('/api/acceptance/void_refund/refund', {
        auth_token: token,
        transaction_id: transactionId,
        amount_cents: piastersFromMicros(amountMicros),
      });
      return { refunded: result['success'] === true || result['is_refunded'] === true };
    },
  };
}
