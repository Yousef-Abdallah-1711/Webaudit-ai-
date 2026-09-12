import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';
import { assertEntitled } from './entitlements.js';
import { InvalidPurchaseAmountError } from './purchase.service.js';
import { PlanNotSubscribableError } from './subscription.service.js';
import type { BillingPriceCatalog } from './checkout-pricing.js';
import type { PaymentProvider } from './payment-provider.js';
import { withCheckoutLock, type CheckoutLock } from './checkout-lock.js';

export interface CheckoutResult {
  readonly checkoutUrl: string;
  readonly providerReference: string;
}

async function createPendingPayment(
  db: PrismaClient,
  input: {
    readonly userId: string;
    readonly kind: 'subscription' | 'credits';
    readonly providerReference: string;
    readonly amountMicros: number;
    readonly metadata: Readonly<Record<string, string>>;
  },
): Promise<void> {
  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "PendingPayment" ("id", "userId", "kind", "providerReference", "amountMicros", "metadata", "updatedAt")
      VALUES (gen_random_uuid()::text, ${input.userId}, ${input.kind}, ${input.providerReference}, ${input.amountMicros}, ${JSON.stringify(input.metadata)}::jsonb, now())
    `,
  );
}

export async function initiateSubscriptionCheckout(
  db: PrismaClient,
  input: { readonly userId: string; readonly planId: string },
  paymentProvider: PaymentProvider,
  prices: BillingPriceCatalog,
  lock: CheckoutLock,
): Promise<CheckoutResult> {
  if (input.planId === 'free') throw new PlanNotSubscribableError('free');
  const plan = await db.plan.findUnique({
    where: { id: input.planId },
    select: { id: true, isActive: true },
  });
  if (plan === null || !plan.isActive) throw new PlanNotSubscribableError(input.planId);

  const amountMicros = prices.subscriptionAmountMicros(input.planId);
  const metadata = { kind: 'subscription', planId: input.planId };
  return withCheckoutLock(lock, input.userId, async () => {
    const checkout = await paymentProvider.initCheckout({
      userId: input.userId,
      amountMicros,
      kind: 'subscription',
      metadata,
    });
    await createPendingPayment(db, {
      userId: input.userId,
      kind: 'subscription',
      providerReference: checkout.providerReference,
      amountMicros,
      metadata,
    });
    return checkout;
  });
}

export async function initiateCreditPurchaseCheckout(
  db: PrismaClient,
  input: { readonly userId: string; readonly credits: number },
  paymentProvider: PaymentProvider,
  prices: BillingPriceCatalog,
  lock: CheckoutLock,
): Promise<CheckoutResult> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new InvalidPurchaseAmountError();
  }
  await assertEntitled(db, input.userId, 'CREDIT_PURCHASE');

  const amountMicros = prices.creditPurchaseAmountMicros(input.credits);
  const metadata = { kind: 'credits', credits: String(input.credits) };
  return withCheckoutLock(lock, input.userId, async () => {
    const checkout = await paymentProvider.initCheckout({
      userId: input.userId,
      amountMicros,
      kind: 'credits',
      metadata,
    });
    await createPendingPayment(db, {
      userId: input.userId,
      kind: 'credits',
      providerReference: checkout.providerReference,
      amountMicros,
      metadata,
    });
    return checkout;
  });
}
