import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { createPaymobPaymentProvider } from '../../src/services/billing/paymob-payment-provider.js';
import { paymobTransactionHmacString } from '../../src/services/billing/paymob-hmac.js';
import { sweepExpiredPendingPayments } from '../../src/services/billing/payment-expiry-sweep.js';
import type { BillingPriceCatalog } from '../../src/services/billing/checkout-pricing.js';

const HMAC_SECRET = 't012-hmac-secret';
const INTEGRATION_ID = '555555';
const mailer = createCapturingMailer();
const prices: BillingPriceCatalog = {
  subscriptionAmountMicros: (planId) => ({ starter: 29_000_000, pro: 99_000_000 })[planId] ?? 0,
  creditPurchaseAmountMicros: (credits) => credits * 100_000,
};
let nextOrder = 1200;
let orderContext = new Map<number, string>();
let orderBodies: Record<string, unknown>[] = [];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fetchImpl = (async (url: string, init?: { body?: string }) => {
  const body = (init?.body ? JSON.parse(init.body) : {}) as Record<string, unknown>;
  if (url.endsWith('/api/auth/tokens')) return json({ token: 'auth-token' });
  if (url.endsWith('/api/ecommerce/orders')) {
    orderBodies.push(body);
    const id = nextOrder++;
    if (typeof body.merchant_order_id === 'string') orderContext.set(id, body.merchant_order_id);
    return json({ id });
  }
  if (url.endsWith('/api/acceptance/payment_keys')) return json({ token: 'payment-key' });
  return json({}, 404);
}) as typeof fetch;

const provider = createPaymobPaymentProvider({
  apiKey: 'test-api-key',
  hmacSecret: HMAC_SECRET,
  integrationId: INTEGRATION_ID,
  fetchImpl,
});
const app = createApp({
  db: testDb,
  mailer,
  webhooks: { paymentProvider: provider },
  billing: { isProduction: true, paymentProvider: provider, priceCatalog: prices },
});

const PASSWORD = 'correct-horse-battery-staple';
let userSequence = 0;
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signIn() {
  const creds = { email: `t012-${++userSequence}@example.com`, password: PASSWORD };
  await request(app).post('/auth/register').send(creds).expect(201);
  const user = await testDb.user.update({
    where: { email: creds.email },
    data: { emailVerifiedAt: new Date() },
  });
  const login = await request(app).post('/auth/login').send(creds).expect(200);
  return {
    userId: user.id,
    token: (login.body as { accessToken: string }).accessToken,
    email: creds.email,
  };
}

async function startCredits(token: string, userId: string, credits = 10) {
  await testDb.subscription.create({
    data: {
      userId,
      planId: 'pro',
      status: 'ACTIVE',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 86_400_000),
    },
  });
  const result = await request(app)
    .post('/billing/credits/purchase')
    .set(auth(token))
    .send({ credits })
    .expect(201);
  return (result.body as { checkout: { providerReference: string } }).checkout.providerReference;
}

function signed(orderId: string, overrides: { success?: boolean; amountCents?: number } = {}) {
  const merchantOrderId = orderContext.get(Number(orderId));
  if (!merchantOrderId) throw new Error(`missing order context ${orderId}`);
  const payload = {
    obj: {
      amount_cents: overrides.amountCents ?? 100,
      created_at: new Date().toISOString(),
      currency: 'EGP',
      error_occured: false,
      has_parent_transaction: false,
      id: Number(orderId) + 7_000_000,
      integration_id: Number(INTEGRATION_ID),
      is_3d_secure: true,
      is_auth: false,
      is_capture: false,
      is_refunded: false,
      is_standalone_payment: true,
      is_voided: false,
      order: { id: Number(orderId), merchant_order_id: merchantOrderId },
      owner: 1,
      pending: false,
      source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
      success: overrides.success ?? true,
    },
  };
  const message = paymobTransactionHmacString(payload)!;
  return { payload, hmac: createHmac('sha512', HMAC_SECRET).update(message).digest('hex') };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  orderContext = new Map();
  orderBodies = [];
});
afterAll(closeDb);

describe('Paymob checkout fulfillment matrix (T012)', () => {
  it('rows 1-4: sends server-priced checkout, then grants credits, receipt, and confirmation once', async () => {
    const { token, userId, email } = await signIn();
    const orderId = await startCredits(token, userId, 10);
    expect(orderBodies[0]).toMatchObject({ amount_cents: 100, currency: 'EGP' });
    const pending = await testDb.pendingPayment.findUniqueOrThrow({
      where: { providerReference: orderId },
    });
    expect(pending.metadata).toMatchObject({ kind: 'credits', credits: '10' });
    const { payload, hmac } = signed(orderId);
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    expect(await testDb.receipt.count({ where: { userId } })).toBe(1);
    expect(mailer.paymentConfirmations()).toEqual([{ email }]);
  });

  it('row 2: an active subscription is unchanged while purchased credits are granted', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId, 10);
    const { payload, hmac } = signed(orderId);
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    expect(await testDb.subscription.findUniqueOrThrow({ where: { userId } })).toMatchObject({
      planId: 'pro',
      status: 'ACTIVE',
    });
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
  });

  it('rows 5-6: duplicate delivery is idempotent and sends one confirmation', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    const { payload, hmac } = signed(orderId);
    await Promise.all([
      request(app).post('/webhooks/billing').set('hmac', hmac).send(payload),
      request(app).post('/webhooks/billing').set('hmac', hmac).send(payload),
    ]);
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    expect(await testDb.billingEvent.count({ where: { id: String(payload.obj.id) } })).toBe(1);
    expect(mailer.paymentConfirmations()).toHaveLength(1);
  });

  it('row 7: a declined payment closes as FAILED without credits or email', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    const { payload, hmac } = signed(orderId, { success: false });
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    expect(
      (await testDb.pendingPayment.findUniqueOrThrow({ where: { providerReference: orderId } }))
        .status,
    ).toBe('FAILED');
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
    expect(mailer.paymentConfirmations()).toHaveLength(0);
  });

  it('row 8: a cancellation transition is terminal and grants nothing', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    const pending = await testDb.pendingPayment.findUniqueOrThrow({
      where: { providerReference: orderId },
    });
    const { applyVerifiedPaymentEvent } =
      await import('../../src/services/billing/apply-payment-event.js');
    await applyVerifiedPaymentEvent(testDb, {
      id: 'cancel-t012',
      type: 'subscription.cancelled',
      providerReference: orderId,
      userId,
      amountMicros: pending.amountMicros,
      metadata: { kind: 'credits', credits: '10' },
    });
    expect(
      (await testDb.pendingPayment.findUniqueOrThrow({ where: { id: pending.id } })).status,
    ).toBe('CANCELLED');
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('row 9: abandoned checkout is expired by the sweep without credits', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    await testDb.pendingPayment.update({
      where: { providerReference: orderId },
      data: { createdAt: new Date(Date.now() - 61 * 60_000) },
    });
    expect(await sweepExpiredPendingPayments(testDb, { abandonmentWindowMs: 60 * 60_000 })).toBe(1);
    expect(
      (await testDb.pendingPayment.findUniqueOrThrow({ where: { providerReference: orderId } }))
        .status,
    ).toBe('EXPIRED');
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('row 10: provider unavailability leaves no pending payment and returns retryable failure', async () => {
    const unavailable = createPaymobPaymentProvider({
      apiKey: 'key',
      hmacSecret: HMAC_SECRET,
      integrationId: INTEGRATION_ID,
      fetchImpl: (async () => json({}, 503)) as typeof fetch,
    });
    const unavailableApp = createApp({
      db: testDb,
      mailer,
      webhooks: { paymentProvider: unavailable },
      billing: { isProduction: true, paymentProvider: unavailable, priceCatalog: prices },
    });
    const { token, userId } = await signIn();
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 86_400_000),
      },
    });
    await request(unavailableApp)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 10 })
      .expect(500);
    expect(await testDb.pendingPayment.count({ where: { userId } })).toBe(0);
  });

  it('row 11: malformed webhook is rejected before any BillingEvent write', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    const malformed = '{"obj":';
    await request(app)
      .post('/webhooks/billing')
      .set('hmac', 'not-a-valid-hmac')
      .set('content-type', 'application/json')
      .send(malformed)
      .expect(401);
    expect(await testDb.billingEvent.count()).toBe(0);
    expect(
      (await testDb.pendingPayment.findUniqueOrThrow({ where: { providerReference: orderId } }))
        .status,
    ).toBe('PENDING');
  });

  it('row 21: concurrent duplicate webhook delivery produces one effect', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCredits(token, userId);
    const { payload, hmac } = signed(orderId);
    await Promise.all([
      request(app).post('/webhooks/billing').set('hmac', hmac).send(payload),
      request(app).post('/webhooks/billing').set('hmac', hmac).send(payload),
    ]);
    expect(
      await testDb.creditTransaction.count({
        where: { userId, type: 'GRANT', reason: 'grant:purchase' },
      }),
    ).toBe(1);
  });
});
