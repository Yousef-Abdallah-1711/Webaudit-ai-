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
  billing: { isProduction: true, paymentProvider, priceCatalog },
});

async function signIn(email: string): Promise<{ token: string; userId: string }> {
  const creds = { email, password: 'correct-horse-battery-staple' };
  await request(app).post('/auth/register').send(creds).expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(creds).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  webhookResult = { valid: false, events: [] };
  mailer.clear();
});
afterAll(closeDb);

describe('billing receipts', () => {
  it('creates a viewable owner-scoped receipt after a confirmed subscription payment', async () => {
    const owner = await signIn('receipt-owner@example.com');
    const stranger = await signIn('receipt-stranger@example.com');
    const providerReference = 'stub_' + owner.userId + '_subscription_99000000';

    await request(app)
      .post('/billing/subscribe')
      .set(auth(owner.token))
      .send({ planId: 'pro' })
      .expect(201);
    webhookResult = {
      valid: true,
      events: [
        {
          id: 'evt_receipt_sub_1',
          type: 'payment.succeeded',
          providerReference,
          userId: owner.userId,
          amountMicros: 99_000_000,
          metadata: { kind: 'subscription', planId: 'pro' },
        },
      ],
    };
    await request(app).post('/webhooks/billing').send({ ignored: true }).expect(200);

    const list = await request(app).get('/billing/receipts').set(auth(owner.token)).expect(200);
    const receipts = (list.body as { receipts: { id: string; amountMicros: number }[] }).receipts;
    expect(receipts).toHaveLength(1);
    expect(receipts[0]?.amountMicros).toBe(99_000_000);

    const html = await request(app)
      .get(`/billing/receipts/${receipts[0]!.id}`)
      .set(auth(owner.token))
      .expect(200);
    expect(html.header['content-type']).toContain('text/html');
    expect(html.text).toContain('Payment receipt');
    expect(html.text).toContain('subscription');
    expect(html.text).toContain('evt_receipt_sub_1');

    await request(app)
      .get(`/billing/receipts/${receipts[0]!.id}`)
      .set(auth(stranger.token))
      .expect(404);
  });
});
