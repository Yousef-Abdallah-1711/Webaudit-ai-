/**
 * Payment gateway seam.
 *
 * Real payment movement belongs behind this interface, so billing routes and
 * webhook handling can be tested against a local stub and later swapped to a
 * real gateway implementation without changing checkout or ledger code.
 *
 * Money is always integer micros, matching the rest of the ledger. A provider
 * that cannot be configured must fail loudly at construction time; direct
 * credit/subscription grants without this seam are the production gap Phase 2
 * is removing.
 */

export type PaymentKind = 'subscription' | 'credits';

export interface PaymentProviderCheckoutInput {
  readonly userId: string;
  readonly amountMicros: number;
  readonly kind: PaymentKind;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface PaymentProviderCheckout {
  readonly checkoutUrl: string;
  readonly providerReference: string;
}

export type PaymentEventType =
  'payment.succeeded' | 'payment.failed' | 'subscription.cancelled' | 'refund.succeeded';

export interface PaymentEvent {
  readonly id: string;
  readonly type: PaymentEventType;
  readonly providerReference: string;
  readonly userId: string;
  readonly amountMicros: number;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface PaymentWebhookVerification {
  readonly valid: boolean;
  readonly events: readonly PaymentEvent[];
}

export interface PaymentRefundResult {
  readonly refunded: boolean;
}

export interface PaymentProvider {
  initCheckout(input: PaymentProviderCheckoutInput): Promise<PaymentProviderCheckout>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | undefined>>,
  ): Promise<PaymentWebhookVerification>;
  refund(providerReference: string, amountMicros: number): Promise<PaymentRefundResult>;
}

export class PaymentProviderNotConfiguredError extends Error {
  override readonly name = 'PaymentProviderNotConfiguredError';

  constructor(variableName: string) {
    super(
      `No payment provider is configured. Set ${variableName} before enabling real checkout flows.`,
    );
  }
}
