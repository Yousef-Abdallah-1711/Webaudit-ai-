/**
 * T187 — the billing webhook: signature-verified and idempotent on event id.
 */

import { createHmac } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { balanceOf } from '../../src/services/credits/balance.js';

const SECRET = 'test-webhook-secret-0123456789abcdef';
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

describe('POST /webhooks/billing', () => {
  it('rejects a body whose signature does not verify, applying nothing', async () => {
    const userId = await makeUser('wh1@example.com');
    const { raw } = sign({ id: 'evt_1', type: 'credits.purchased', data: { userId, credits: 1000 } });

    await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', 'deadbeef')
      .send(raw)
      .expect(401);

    expect((await balanceOf(testDb, userId)).purchased).toBe(0);
    expect(await testDb.billingEvent.count()).toBe(0);
  });

  it('applies a verified subscription.activated event', async () => {
    const userId = await makeUser('wh2@example.com');
    const { raw, sig } = sign({
      id: 'evt_sub_1',
      type: 'subscription.activated',
      data: { userId, planId: 'pro' },
    });

    await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId } });
    expect(sub.planId).toBe('pro');
    expect((await balanceOf(testDb, userId)).plan).toBe(1200);
  });

  it('is idempotent — a re-delivered event id does not double-apply', async () => {
    const userId = await makeUser('wh3@example.com');
    // Subscribed already so the purchase is allowed.
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
      id: 'evt_purchase_1',
      type: 'credits.purchased',
      data: { userId, credits: 750 },
    });

    const first = await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect((first.body as { applied: boolean }).applied).toBe(true);

    const second = await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect((second.body as { duplicate: boolean }).duplicate).toBe(true);

    // 750, not 1500.
    expect((await balanceOf(testDb, userId)).purchased).toBe(750);
    expect(await testDb.billingEvent.count({ where: { id: 'evt_purchase_1' } })).toBe(1);
  });

  it('acknowledges an unknown event type without applying anything', async () => {
    const { raw, sig } = sign({ id: 'evt_x', type: 'invoice.finalized', data: {} });
    await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect(await testDb.billingEvent.findUniqueOrThrow({ where: { id: 'evt_x' } })).toBeTruthy();
  });
});
