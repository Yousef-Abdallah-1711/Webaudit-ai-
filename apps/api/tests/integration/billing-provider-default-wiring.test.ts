/**
 * T263's own acceptance criterion says the stub `PaymentProvider` must be
 * "wired-by-default-in-dev/test" — but `startApi()` (the real process entry
 * point every environment other than a suite's own `createApp()` call
 * actually boots) never passed a `paymentProvider` at all, in any
 * environment. That left `/billing/subscribe` and `/billing/credits/purchase`
 * on the pre-checkout, direct-grant `devTestOnly` path outside production,
 * and permanently 404 in production with no way to ever buy anything for
 * real — the entire checkout/webhook/receipt plumbing (T264-T266) was fully
 * built and unit/integration tested, but unreachable by the actual running
 * app. This proves the fix through the real boot path, not `createApp`
 * directly, the same distinction `boot.test.ts` exists to cover.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import request from 'supertest';
import { SignJWT } from 'jose';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { startApi, type ApiService } from '../../src/index.js';
import type { RedisSubscriber } from '../../src/services/realtime/fanout.js';
import type { PaymentEvent } from '../../src/services/billing/payment-provider.js';

function fakeSubscriber(): RedisSubscriber {
  return {
    subscribe: () => Promise.resolve(1),
    on: () => undefined,
    unsubscribe: () => Promise.resolve(1),
    quit: () => Promise.resolve('OK'),
  };
}

let service: ApiService | undefined;

async function tokenFor(userId: string): Promise<string> {
  const secret = new TextEncoder().encode(process.env['JWT_ACCESS_SECRET']);
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ sub: userId, isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(secret);
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  process.env['BILLING_STARTER_PRICE_MICROS'] = '29000000';
  process.env['BILLING_PRO_PRICE_MICROS'] = '99000000';
  process.env['BILLING_BUSINESS_PRICE_MICROS'] = '299000000';
  process.env['BILLING_CREDIT_PRICE_MICROS'] = '100000';
});
afterEach(async () => {
  await service?.shutdown('test-end');
  service = undefined;
});
afterAll(closeDb);

describe('startApi wires a real payment provider by default outside production', () => {
  it('returns a checkout URL from /billing/subscribe instead of an immediate grant', async () => {
    service = await startApi({
      db: testDb,
      port: 0,
      subscriber: fakeSubscriber(),
      installSignalHandlers: false,
    });
    const user = await testDb.user.create({
      data: { email: 'default-wiring@example.com', emailVerifiedAt: new Date() },
    });
    const app = `http://127.0.0.1:${service.port}`;

    const res = await request(app)
      .post('/billing/subscribe')
      .set('Authorization', `Bearer ${await tokenFor(user.id)}`)
      .send({ planId: 'pro' })
      .expect(201);

    expect(res.body).toMatchObject({
      checkout: {
        checkoutUrl: expect.stringContaining('/checkout/'),
        providerReference: expect.any(String),
      },
    });
    expect(await testDb.subscription.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it('accepts a real HMAC-signed webhook call against the same default-wired stub secret', async () => {
    process.env['BILLING_WEBHOOK_SECRET'] = 'default-wiring-secret';
    service = await startApi({
      db: testDb,
      port: 0,
      subscriber: fakeSubscriber(),
      installSignalHandlers: false,
    });
    const user = await testDb.user.create({
      data: { email: 'default-wiring-webhook@example.com', emailVerifiedAt: new Date() },
    });
    const app = `http://127.0.0.1:${service.port}`;

    const subscribeRes = await request(app)
      .post('/billing/subscribe')
      .set('Authorization', `Bearer ${await tokenFor(user.id)}`)
      .send({ planId: 'pro' })
      .expect(201);
    const providerReference = (subscribeRes.body as { checkout: { providerReference: string } })
      .checkout.providerReference;

    const event: PaymentEvent = {
      id: 'evt_default_wiring_1',
      type: 'payment.succeeded',
      providerReference,
      userId: user.id,
      amountMicros: 99_000_000,
      metadata: { kind: 'subscription', planId: 'pro' },
    };
    const raw = JSON.stringify({ events: [event] });
    const signature = createHmac('sha256', 'default-wiring-secret').update(raw).digest('hex');

    await request(app)
      .post('/webhooks/billing')
      .set('x-webhook-signature', signature)
      .send(raw)
      .expect(200);

    expect(
      (await testDb.subscription.findUniqueOrThrow({ where: { userId: user.id } })).planId,
    ).toBe('pro');
  });

  it('still 404s /billing/subscribe when the caller explicitly forces production', async () => {
    service = await startApi({
      db: testDb,
      port: 0,
      subscriber: fakeSubscriber(),
      installSignalHandlers: false,
      billing: { isProduction: true },
    });
    const user = await testDb.user.create({
      data: { email: 'default-wiring-prod@example.com', emailVerifiedAt: new Date() },
    });
    const app = `http://127.0.0.1:${service.port}`;

    await request(app)
      .post('/billing/subscribe')
      .set('Authorization', `Bearer ${await tokenFor(user.id)}`)
      .send({ planId: 'pro' })
      .expect(404);
  });
});
