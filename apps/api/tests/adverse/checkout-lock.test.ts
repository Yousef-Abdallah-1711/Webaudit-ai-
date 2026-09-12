import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import type { CheckoutLock } from '../../src/services/billing/checkout-lock.js';
import type { PaymentProvider } from '../../src/services/billing/payment-provider.js';
import type { BillingPriceCatalog } from '../../src/services/billing/checkout-pricing.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

class MemoryCheckoutLock implements CheckoutLock {
  private readonly held = new Set<string>();

  async acquire(userId: string): Promise<string | null> {
    if (this.held.has(userId)) return null;
    this.held.add(userId);
    return userId;
  }

  async release(userId: string): Promise<void> {
    this.held.delete(userId);
  }
}

const prices: BillingPriceCatalog = {
  subscriptionAmountMicros: () => 29_000_000,
  creditPurchaseAmountMicros: () => 100_000,
};

async function auth(app: ReturnType<typeof createApp>): Promise<string> {
  await request(app)
    .post('/auth/register')
    .send({ email: 'checkout-lock@example.com', password: 'correct-horse-battery-staple' })
    .expect(201);
  await testDb.user.update({
    where: { email: 'checkout-lock@example.com' },
    data: { emailVerifiedAt: new Date() },
  });
  const response = await request(app)
    .post('/auth/login')
    .send({ email: 'checkout-lock@example.com', password: 'correct-horse-battery-staple' })
    .expect(200);
  return (response.body as { accessToken: string }).accessToken;
}

describe('checkout initiation lock', () => {
  beforeEach(async () => {
    await resetDb();
    await seedPlans();
  });
  afterAll(closeDb);

  it('allows exactly one concurrent checkout initiation for a user', async () => {
    let releaseProvider!: () => void;
    let started!: () => void;
    const providerGate = new Promise<void>((resolve) => {
      releaseProvider = resolve;
    });
    const providerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const provider: PaymentProvider = {
      async initCheckout(input) {
        started();
        await providerGate;
        return {
          checkoutUrl: 'https://payments.test/checkout',
          providerReference: `checkout-${input.userId}`,
        };
      },
      async verifyWebhook() {
        return { valid: false, events: [] };
      },
      async refund() {
        return { refunded: true };
      },
    };
    const app = createApp({
      db: testDb,
      billing: {
        isProduction: true,
        paymentProvider: provider,
        priceCatalog: prices,
        checkoutLock: new MemoryCheckoutLock(),
      },
    });
    const token = await auth(app);
    const headers = { Authorization: `Bearer ${token}` };

    const first = request(app)
      .post('/billing/subscribe')
      .set(headers)
      .send({ planId: 'starter' })
      .then((response) => response);
    await providerStarted;
    await request(app)
      .post('/billing/subscribe')
      .set(headers)
      .send({ planId: 'starter' })
      .expect(409)
      .expect({
        error: {
          code: 'CHECKOUT_IN_PROGRESS',
          message: 'A checkout is already being started for this account.',
        },
      });
    releaseProvider();
    expect((await first).status).toBe(201);
  });

  it('releases the lock after checkout initialization fails', async () => {
    let attempts = 0;
    const provider: PaymentProvider = {
      async initCheckout(input) {
        attempts += 1;
        if (attempts === 1) throw new Error('provider timeout');
        return {
          checkoutUrl: 'https://payments.test/checkout',
          providerReference: `retry-${input.userId}`,
        };
      },
      async verifyWebhook() {
        return { valid: false, events: [] };
      },
      async refund() {
        return { refunded: true };
      },
    };
    const app = createApp({
      db: testDb,
      billing: {
        isProduction: true,
        paymentProvider: provider,
        priceCatalog: prices,
        checkoutLock: new MemoryCheckoutLock(),
      },
    });
    const token = await auth(app);
    const headers = { Authorization: `Bearer ${token}` };

    await request(app)
      .post('/billing/subscribe')
      .set(headers)
      .send({ planId: 'starter' })
      .expect(500);
    await request(app)
      .post('/billing/subscribe')
      .set(headers)
      .send({ planId: 'starter' })
      .expect(201);
  });
});
