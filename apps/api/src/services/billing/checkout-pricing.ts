export class CheckoutPriceNotConfiguredError extends Error {
  override readonly name = 'CheckoutPriceNotConfiguredError';

  constructor(what: string) {
    super(`${what} checkout price is not configured.`);
  }
}

export interface BillingPriceCatalog {
  subscriptionAmountMicros(planId: string): number;
  creditPurchaseAmountMicros(credits: number): number;
}

function positiveMicros(name: string, raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CheckoutPriceNotConfiguredError(name);
  }
  return parsed;
}

export function createEnvBillingPriceCatalog(
  env: Record<string, string | undefined>,
): BillingPriceCatalog {
  return {
    subscriptionAmountMicros(planId) {
      return positiveMicros(
        `${planId} subscription`,
        env[`BILLING_${planId.toUpperCase()}_PRICE_MICROS`],
      );
    },
    creditPurchaseAmountMicros(credits) {
      const perCredit = positiveMicros('credit purchase', env['BILLING_CREDIT_PRICE_MICROS']);
      return credits * perCredit;
    },
  };
}
