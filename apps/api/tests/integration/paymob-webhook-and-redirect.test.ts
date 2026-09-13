/**
 * Real-provider adversarial and concurrency coverage this initiative's
 * review found missing (T010's security matrix, T011's race/redirect-only
 * proof). Every test here drives the actual `createPaymobPaymentProvider` +
 * `paymob-hmac.ts` verification path -- never a hand-rolled stand-in for
 * either -- through the real HTTP routes, matching the discipline this
 * initiative's own standards require (ENGINEERING-STANDARDS.md §3).
 */
import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { createPaymobPaymentProvider } from '../../src/services/billing/paymob-payment-provider.js';
import { paymobTransactionHmacString } from '../../src/services/billing/paymob-hmac.js';
import type { BillingPriceCatalog } from '../../src/services/billing/checkout-pricing.js';

const HMAC_SECRET = 'test-only-hmac-secret';
const INTEGRATION_ID = '555555';
let nextPaymobOrderId = 100;

/**
 * Real Paymob order ids are opaque -- what actually binds an order back to a
 * local checkout is `merchant_order_id`, which this system generates at
 * order-creation time (`encodeCheckoutContext`) and Paymob echoes back
 * verbatim on every subsequent webhook/redirect for that order. This map
 * captures exactly that echo, so `signedTransaction` below can construct a
 * webhook payload that is byte-for-byte what Paymob would really send back
 * (including the real, provider-generated `merchant_order_id`) rather than a
 * hand-guessed stand-in.
 */
const merchantOrderIdByPaymobOrderId = new Map<number, string>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Every checkout in these tests gets a fresh, distinct Paymob order id. */
const fetchImpl = (async (_url: string, init?: { body?: string }) => {
  const parsed: unknown = init?.body === undefined ? {} : JSON.parse(init.body);
  const body: Record<string, unknown> =
    typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  if ('api_key' in body) {
    return json({ token: 'auth-token' });
  }
  if ('order_id' in body) {
    return json({ token: 'payment-key' });
  }
  const orderId = nextPaymobOrderId++;
  if (typeof body['merchant_order_id'] === 'string') {
    merchantOrderIdByPaymobOrderId.set(orderId, body['merchant_order_id']);
  }
  return json({ id: orderId });
}) as typeof fetch;

const paymentProvider = createPaymobPaymentProvider({
  apiKey: 'test-api-key',
  hmacSecret: HMAC_SECRET,
  integrationId: INTEGRATION_ID,
  fetchImpl,
});

const priceCatalog: BillingPriceCatalog = {
  subscriptionAmountMicros: () => 0,
  creditPurchaseAmountMicros: (credits) => credits * 100_000, // 100_000 micros/credit
};

const mailer = createCapturingMailer();
const app = createApp({
  db: testDb,
  mailer,
  webhooks: { paymentProvider },
  billing: { isProduction: true, paymentProvider, priceCatalog },
});

const CREDS = { email: 'paymob-integration@example.com', password: 'correct-horse-battery-staple' };

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

/** Starts a real credit-purchase checkout and returns its Paymob order id. */
async function startCreditCheckout(
  token: string,
  userId: string,
  credits: number,
): Promise<string> {
  // Credit purchase is refused on the free plan (FR-078) -- give the test
  // user an active paid subscription first, matching checkout-flow.test.ts's
  // own established setup for this exact precondition.
  await testDb.subscription.upsert({
    where: { userId },
    create: {
      userId,
      planId: 'pro',
      status: 'ACTIVE',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
    update: {},
  });
  const res = await request(app)
    .post('/billing/credits/purchase')
    .set(auth(token))
    .send({ credits })
    .expect(201);
  return (res.body as { checkout: { providerReference: string } }).checkout.providerReference;
}

interface TransactionOverrides {
  readonly amountCents?: number;
  readonly currency?: string;
  readonly merchantOrderId?: string;
  readonly transactionId?: number;
  readonly success?: boolean;
}

/** A real Paymob transaction-callback payload, signed with the real HMAC scheme. */
function signedTransaction(orderId: string, overrides: TransactionOverrides = {}) {
  const merchantOrderId = merchantOrderIdByPaymobOrderId.get(Number(orderId));
  if (merchantOrderId === undefined) {
    throw new Error(`No merchant_order_id was captured for Paymob order ${orderId}.`);
  }
  const obj = {
    amount_cents: overrides.amountCents ?? 100,
    created_at: new Date().toISOString(),
    currency: overrides.currency ?? 'EGP',
    error_occured: false,
    has_parent_transaction: false,
    id: overrides.transactionId ?? Number(orderId) + 900_000,
    integration_id: Number(INTEGRATION_ID),
    is_3d_secure: true,
    is_auth: false,
    is_capture: false,
    is_refunded: false,
    is_standalone_payment: true,
    is_voided: false,
    order: {
      id: Number(orderId),
      merchant_order_id: overrides.merchantOrderId ?? merchantOrderId,
    },
    owner: 1,
    pending: false,
    source_data: { pan: '2346', sub_type: 'MasterCard', type: 'card' },
    success: overrides.success ?? true,
  };
  const payload = { obj };
  const message = paymobTransactionHmacString(payload)!;
  const hmac = createHmac('sha512', HMAC_SECRET).update(message, 'utf8').digest('hex');
  return { payload, hmac };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('real Paymob provider: webhook/redirect security and concurrency', () => {
  it('completes a payment through the redirect route alone and still writes a real BillingEvent', async () => {
    // Regression test for the bug this review found: the redirect route used
    // to call the effect-applying function directly, skipping the
    // BillingEvent gate entirely, so a payment completed only through the
    // redirect fallback (no POST webhook ever simulated) left no audit row.
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10); // 10 credits = 1_000_000 micros = 1_000 piasters
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });

    const query = {
      amount_cents: String(payload.obj.amount_cents),
      created_at: payload.obj.created_at,
      currency: payload.obj.currency,
      error_occured: String(payload.obj.error_occured),
      has_parent_transaction: String(payload.obj.has_parent_transaction),
      id: String(payload.obj.id),
      integration_id: String(payload.obj.integration_id),
      is_3d_secure: String(payload.obj.is_3d_secure),
      is_auth: String(payload.obj.is_auth),
      is_capture: String(payload.obj.is_capture),
      is_refunded: String(payload.obj.is_refunded),
      is_standalone_payment: String(payload.obj.is_standalone_payment),
      is_voided: String(payload.obj.is_voided),
      order: orderId,
      owner: String(payload.obj.owner),
      pending: String(payload.obj.pending),
      'source_data.pan': payload.obj.source_data.pan,
      'source_data.sub_type': payload.obj.source_data.sub_type,
      'source_data.type': payload.obj.source_data.type,
      success: String(payload.obj.success),
      hmac,
    };

    await request(app).get('/billing/payment-return').query(query).expect(303);

    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    const billingEvent = await testDb.billingEvent.findUnique({
      where: { id: String(payload.obj.id) },
    });
    expect(billingEvent).not.toBeNull();
    expect(billingEvent?.appliedAt).not.toBeNull();
  });

  it('applies a payment exactly once when the webhook and the redirect race for the same transaction', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });

    const webhookCall = request(app).post('/webhooks/billing').set('hmac', hmac).send(payload);
    const redirectCall = request(app)
      .get('/billing/payment-return')
      .query({
        order: orderId,
        id: String(payload.obj.id),
        amount_cents: String(payload.obj.amount_cents),
        created_at: payload.obj.created_at,
        currency: payload.obj.currency,
        error_occured: 'false',
        has_parent_transaction: 'false',
        integration_id: String(payload.obj.integration_id),
        is_3d_secure: 'true',
        is_auth: 'false',
        is_capture: 'false',
        is_refunded: 'false',
        is_standalone_payment: 'true',
        is_voided: 'false',
        owner: '1',
        pending: 'false',
        'source_data.pan': '2346',
        'source_data.sub_type': 'MasterCard',
        'source_data.type': 'card',
        success: 'true',
        hmac,
      });

    await Promise.all([webhookCall, redirectCall]);

    // Whichever path won, the effect must have applied exactly once.
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    expect(
      await testDb.creditTransaction.count({
        where: { userId, type: 'GRANT', reason: 'grant:purchase' },
      }),
    ).toBe(1);
  });

  it('rejects a webhook whose signed amount does not match what was actually charged', async () => {
    const { userId, token } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10); // real charge: 1_000 piasters
    // Signed for a *different* amount than the PendingPayment record -- the
    // signature is real and valid for this (tampered) payload, but it must
    // still be rejected because it does not match what this system quoted.
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 1 });

    const res = await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload);

    expect(res.status).toBe(500); // eventMatchesPending throws; nothing is granted
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('rejects a validly signed callback whose currency is not EGP', async () => {
    const { userId, token } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { currency: 'USD' });

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(401);

    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('rejects a validly signed callback for a different user', async () => {
    const { userId, token } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const merchantOrderId = `webaudit:${Buffer.from(
      JSON.stringify({ userId: 'different-user', kind: 'credits', metadata: { credits: '10' } }),
      'utf8',
    ).toString('base64url')}`;
    const { payload, hmac } = signedTransaction(orderId, { merchantOrderId });

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(500);
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('rejects a validly signed callback for a different purchased product', async () => {
    const { userId, token } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const merchantOrderId = `webaudit:${Buffer.from(
      JSON.stringify({ userId, kind: 'credits', metadata: { credits: '20' } }),
      'utf8',
    ).toString('base64url')}`;
    const { payload, hmac } = signedTransaction(orderId, { merchantOrderId });

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(500);
    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(0);
  });

  it('rejects a webhook with a tampered signature outright, before any DB write', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });

    const res = await request(app)
      .post('/webhooks/billing')
      .set('hmac', `${hmac.slice(0, -2)}00`) // flip the last byte -- still valid hex, wrong signature
      .send(payload);

    expect(res.status).toBe(401);
    expect(
      await testDb.billingEvent.findUnique({ where: { id: String(payload.obj.id) } }),
    ).toBeNull();
  });

  it('applies a duplicate delivery of the same real, validly-signed webhook exactly once', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);

    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
  });

  it('sends one payment confirmation only after a successful payment is applied', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);
    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);

    expect(mailer.paymentConfirmations()).toEqual([{ email: CREDS.email }]);
  });

  it('preserves the payment result when its confirmation email cannot be sent', async () => {
    const { token, userId } = await signIn();
    const orderId = await startCreditCheckout(token, userId, 10);
    const { payload, hmac } = signedTransaction(orderId, { amountCents: 100 });
    mailer.failPaymentConfirmation(new Error('SMTP unavailable'));

    await request(app).post('/webhooks/billing').set('hmac', hmac).send(payload).expect(200);

    expect(await testDb.creditLot.count({ where: { userId, source: 'PURCHASE' } })).toBe(1);
    expect(
      await testDb.billingEvent.findUnique({ where: { id: String(payload.obj.id) } }),
    ).toMatchObject({ appliedAt: expect.any(Date) });
  });
});
