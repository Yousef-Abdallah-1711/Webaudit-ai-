import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { createStubPaymentProvider } from '../../src/services/billing/stub-payment-provider.js';
import type { BillingPriceCatalog } from '../../src/services/billing/checkout-pricing.js';
import type {
  PaymentProvider,
  PaymentWebhookVerification,
} from '../../src/services/billing/payment-provider.js';

const mailer = createCapturingMailer();
const priceCatalog: BillingPriceCatalog = {
  subscriptionAmountMicros(planId) {
    return { starter: 29_000_000, pro: 99_000_000, business: 299_000_000 }[planId] ?? 0;
  },
  creditPurchaseAmountMicros(credits) {
    return credits * 100_000;
  },
};
let webhookResult: PaymentWebhookVerification = { valid: false, events: [] };
const checkoutStub = createStubPaymentProvider({ baseUrl: 'https://payments.test' });
const paymentProvider: PaymentProvider = {
  initCheckout: checkoutStub.initCheckout,
  verifyWebhook() {
    return Promise.resolve(webhookResult);
  },
  refund: checkoutStub.refund,
};
const app = createApp({
  db: testDb,
  mailer,
  webhooks: { paymentProvider },
  billing: {
    isProduction: true,
    paymentProvider,
    priceCatalog,
  },
});

const CREDS = { email: 'checkout@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function pendingCount(userId: string): Promise<number> {
  const rows = await testDb.$queryRaw<readonly { count: bigint }[]>`
    SELECT count(*)::bigint AS count FROM "PendingPayment" WHERE "userId" = ${userId}
  `;
  return Number(rows[0]?.count ?? 0n);
}

async function pendingStatus(providerReference: string): Promise<string | null> {
  const rows = await testDb.$queryRaw<readonly { status: string }[]>`
    SELECT status FROM "PendingPayment" WHERE "providerReference" = ${providerReference}
  `;
  return rows[0]?.status ?? null;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  webhookResult = { valid: false, events: [] };
  mailer.clear();
});
afterAll(closeDb);

describe('checkout initiation defers value until payment confirmation', () => {
  it('starts a subscription checkout without creating a subscription or plan credit lot', async () => {
    const { token, userId } = await signIn();

    const res = await request(app)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'pro' })
      .expect(201);

    expect(res.body as { checkout: { checkoutUrl: string; providerReference: string } }).toEqual({
      checkout: {
        checkoutUrl: 'https://payments.test/checkout/stub_' + userId + '_subscription_99000000',
        providerReference: 'stub_' + userId + '_subscription_99000000',
      },
    });
    expect(await testDb.subscription.findUnique({ where: { userId } })).toBeNull();
    expect(await testDb.creditLot.count({ where: { userId, source: 'PLAN_RENEWAL' } })).toBe(0);
    expect(await pendingCount(userId)).toBe(1);
  });

  it('starts a credit-purchase checkout without creating purchased credits', async () => {
    const { token, userId } = await signIn();
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const res = await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 100 })
      .expect(201);

    expect(
      (res.body as { checkout: { providerReference: string } }).checkout.providerReference,
    ).toBe('stub_' + userId + '_credits_10000000');
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
    expect(await pendingCount(userId)).toBe(1);
  });

  it('applies a provider-confirmed subscription checkout once', async () => {
    const { token, userId } = await signIn();
    const providerReference = 'stub_' + userId + '_subscription_99000000';

    await request(app)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'pro' })
      .expect(201);
    expect(await pendingStatus(providerReference)).toBe('PENDING');
    webhookResult = {
      valid: true,
      events: [
        {
          id: 'evt_checkout_sub_1',
          type: 'payment.succeeded',
          providerReference,
          userId,
          amountMicros: 99_000_000,
          metadata: { kind: 'subscription', planId: 'pro' },
        },
      ],
    };

    await request(app).post('/webhooks/billing').send({ ignored: true }).expect(200);
    await request(app).post('/webhooks/billing').send({ ignored: true }).expect(200);

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId } });
    expect(sub.planId).toBe('pro');
    expect(await testDb.creditLot.count({ where: { userId, source: 'PLAN_RENEWAL' } })).toBe(1);
    expect(await pendingStatus(providerReference)).toBe('SUCCEEDED');
  });

  it('applies a provider-confirmed credit purchase once', async () => {
    const { token, userId } = await signIn();
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const providerReference = 'stub_' + userId + '_credits_10000000';

    await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 100 })
      .expect(201);
    webhookResult = {
      valid: true,
      events: [
        {
          id: 'evt_checkout_credits_1',
          type: 'payment.succeeded',
          providerReference,
          userId,
          amountMicros: 10_000_000,
          metadata: { kind: 'credits', credits: '100' },
        },
      ],
    };

    await request(app).post('/webhooks/billing').send({ ignored: true }).expect(200);
    await request(app).post('/webhooks/billing').send({ ignored: true }).expect(200);

    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    expect(await pendingStatus(providerReference)).toBe('SUCCEEDED');
  });
});
