/**
 * CONC-005 (PLAN.md §7, threat-table row 8) — two identical, validly-signed
 * webhook deliveries for the same event id, fired concurrently rather than
 * sequentially. `billing-webhook.test.ts`'s own "is idempotent" test already
 * proves sequential replay is safe; this proves concurrent replay is too —
 * the actual race a payment provider's retry-under-load could produce.
 */

import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { balanceOf } from '../../src/services/credits/balance.js';

const SECRET = 'test-webhook-secret-concurrent-0123456789';
const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, webhooks: { secret: SECRET } });

function sign(body: unknown): { raw: string; sig: string } {
  const raw = JSON.stringify(body);
  return { raw, sig: createHmac('sha256', SECRET).update(raw).digest('hex') };
}

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

async function post(raw: string, sig: string) {
  return request(app)
    .post('/webhooks/billing')
    .set('content-type', 'application/json')
    .set('x-webhook-signature', sig)
    .send(raw);
}

describe('concurrent duplicate webhook delivery', () => {
  it('two concurrent deliveries of the same credits.purchased event grant credits exactly once', async () => {
    const userId = await makeUser('conc-webhook-1@example.com');
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const { raw, sig } = sign({
      id: 'evt_concurrent_purchase_1',
      type: 'credits.purchased',
      data: { userId, credits: 400 },
    });

    const [first, second] = await Promise.all([post(raw, sig), post(raw, sig)]);
    // Both must resolve to a definite outcome — either applied or duplicate —
    // never a 500 from the race itself.
    expect([200]).toContain(first.status);
    expect([200]).toContain(second.status);

    const transactions = await testDb.creditTransaction.findMany({
      where: { userId, type: 'GRANT', reason: { contains: 'purchase' } },
    });
    expect(transactions).toHaveLength(1);
    expect((await balanceOf(testDb, userId)).purchased).toBe(400);

    const events = await testDb.billingEvent.findMany({
      where: { id: 'evt_concurrent_purchase_1' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.appliedAt).not.toBeNull();
  });

  it('ten concurrent deliveries of the same event grant credits exactly once', async () => {
    const userId = await makeUser('conc-webhook-2@example.com');
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const { raw, sig } = sign({
      id: 'evt_concurrent_purchase_2',
      type: 'credits.purchased',
      data: { userId, credits: 77 },
    });

    const results = await Promise.all(Array.from({ length: 10 }, () => post(raw, sig)));
    for (const res of results) expect(res.status).toBe(200);

    const transactions = await testDb.creditTransaction.findMany({
      where: { userId, type: 'GRANT', reason: { contains: 'purchase' } },
    });
    expect(transactions).toHaveLength(1);
    expect((await balanceOf(testDb, userId)).purchased).toBe(77);
  });
});
