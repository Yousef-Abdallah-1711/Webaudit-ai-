import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type {
  PaymentProvider,
  PaymentProviderCheckoutInput,
  PaymentWebhookVerification,
} from './payment-provider.js';

export interface StubPaymentProviderOptions {
  readonly baseUrl?: string;
  /** Bypasses real signature verification entirely — for tests that own the provider instance in-process. */
  readonly webhookResult?: PaymentWebhookVerification;
  /** Defaults to `BILLING_WEBHOOK_SECRET`, then a fixed dev-only fallback. */
  readonly webhookSecret?: string;
}

const DEV_FALLBACK_WEBHOOK_SECRET = 'dev-only-stub-webhook-secret';

function referenceFor(input: PaymentProviderCheckoutInput): string {
  return `stub_${input.userId}_${input.kind}_${String(input.amountMicros)}`;
}

const eventSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'payment.succeeded',
    'payment.failed',
    'subscription.cancelled',
    'refund.succeeded',
  ]),
  providerReference: z.string().min(1),
  userId: z.string().min(1),
  amountMicros: z.number().int().nonnegative(),
  metadata: z.record(z.string()),
});
const bodySchema = z.object({ events: z.array(eventSchema) });

function verifySignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (signature === undefined || signature === '') return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(signature, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Dev/test gateway: creates deterministic checkout references, moves no money.
 *
 * `verifyWebhook` really verifies an HMAC-SHA256 signature (over the raw body,
 * in the same `x-webhook-signature` header the real webhook route already
 * expects) so this stub is drivable end-to-end from a real HTTP call — a
 * manual tester or an e2e spec, not just an in-process test that overrides
 * the closure. `webhookResult` remains as an explicit override for tests that
 * want to force a result without constructing a real signed payload.
 */
export function createStubPaymentProvider(
  options: StubPaymentProviderOptions = {},
): PaymentProvider {
  const baseUrl = options.baseUrl ?? 'http://localhost:3001';
  const webhookSecret =
    options.webhookSecret ?? process.env['BILLING_WEBHOOK_SECRET'] ?? DEV_FALLBACK_WEBHOOK_SECRET;

  return {
    initCheckout(input) {
      const providerReference = referenceFor(input);
      return Promise.resolve({
        providerReference,
        checkoutUrl: `${baseUrl.replace(/\/$/, '')}/checkout/${providerReference}`,
      });
    },
    verifyWebhook(rawBody, headers) {
      if (options.webhookResult !== undefined) return Promise.resolve(options.webhookResult);

      const invalid: PaymentWebhookVerification = { valid: false, events: [] };
      const signature = headers['x-webhook-signature'];
      if (!verifySignature(rawBody, signature, webhookSecret)) return Promise.resolve(invalid);

      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8'));
      } catch {
        return Promise.resolve(invalid);
      }
      const result = bodySchema.safeParse(parsed);
      if (!result.success) return Promise.resolve(invalid);

      return Promise.resolve({ valid: true, events: result.data.events });
    },
    refund() {
      return Promise.resolve({ refunded: true });
    },
  };
}
