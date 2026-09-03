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
import type { PrismaClient } from '../../prisma/generated/client/index.js';

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

/**
 * Wraps `testDb` so its very first `billingEvent.update` call rejects, then
 * delegates to the real implementation for every call after that — simulating
 * exactly the residual gap PROGRESS.md's Open Decision #15 named: the effect
 * (subscribe/renewSubscription/purchaseCredits) commits successfully, but the
 * following `appliedAt` write fails before the response goes out, so the
 * provider sees no 200 and retries the same event id. Every other model/method
 * passes straight through untouched.
 */
function withFlakyAppliedAtWrite(): { db: PrismaClient; callCount: () => number } {
  let calls = 0;
  const db = new Proxy(testDb, {
    get(target, prop, receiver) {
      if (prop !== 'billingEvent') return Reflect.get(target, prop, receiver) as unknown;
      const realModel = Reflect.get(target, prop, receiver);
      return new Proxy(realModel, {
        get(modelTarget, modelProp, modelReceiver) {
          if (modelProp !== 'update') {
            return Reflect.get(modelTarget, modelProp, modelReceiver) as unknown;
          }
          return (...args: Parameters<typeof testDb.billingEvent.update>) => {
            calls += 1;
            if (calls === 1) {
              return Promise.reject(new Error('simulated transient db failure'));
            }
            const real = Reflect.get(modelTarget, modelProp, modelReceiver) as unknown as (
              ...a: Parameters<typeof testDb.billingEvent.update>
            ) => ReturnType<typeof testDb.billingEvent.update>;
            return real.apply(modelTarget, args);
          };
        },
      });
    },
  }) as PrismaClient;
  return { db, callCount: () => calls };
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
    const { raw } = sign({
      id: 'evt_1',
      type: 'credits.purchased',
      data: { userId, credits: 1000 },
    });

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

  it('retries the effect on a re-delivery when the first attempt never applied it', async () => {
    const userId = await makeUser('wh4@example.com');
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    // Simulate a prior attempt that inserted the event row but crashed before
    // the effect ran: appliedAt is null, no credits were granted.
    await testDb.billingEvent.create({ data: { id: 'evt_retry_1', type: 'credits.purchased' } });

    const { raw, sig } = sign({
      id: 'evt_retry_1',
      type: 'credits.purchased',
      data: { userId, credits: 500 },
    });
    const res = await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect((res.body as { applied: boolean }).applied).toBe(true);
    expect((await balanceOf(testDb, userId)).purchased).toBe(500);
  });

  it('responds 500 (not 200) when the effect throws, so the provider retries', async () => {
    // No such user id -> subscribe() throws.
    const { raw, sig } = sign({
      id: 'evt_fail_1',
      type: 'subscription.activated',
      data: { userId: 'does-not-exist', planId: 'pro' },
    });
    await request(app)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(500);

    const event = await testDb.billingEvent.findUniqueOrThrow({ where: { id: 'evt_fail_1' } });
    expect(event.appliedAt).toBeNull();
  });

  it('does not double-grant credits when a retry follows a committed effect whose appliedAt write failed (PROGRESS.md Open Decision #15)', async () => {
    const userId = await makeUser('wh5@example.com');
    // Subscribed already so the purchase is allowed (matches the "is
    // idempotent" test's own fixture above).
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });
    const { db: flakyDb, callCount } = withFlakyAppliedAtWrite();
    const flakyApp = createApp({ db: flakyDb, mailer, webhooks: { secret: SECRET } });

    const { raw, sig } = sign({
      id: 'evt_double_grant_1',
      type: 'credits.purchased',
      data: { userId, credits: 400 },
    });

    // First delivery: purchaseCredits() commits and grants the lot for real
    // (against the real testDb, through the proxy), but the appliedAt write
    // that follows it is the one call rigged to fail -- so the row is left
    // "received but not applied," exactly the state a provider retry sees.
    await request(flakyApp)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(500);
    expect(callCount()).toBe(1);
    expect((await balanceOf(testDb, userId)).purchased).toBe(400);
    const afterFirst = await testDb.billingEvent.findUniqueOrThrow({
      where: { id: 'evt_double_grant_1' },
    });
    expect(afterFirst.appliedAt).toBeNull();

    // Second delivery: same event id, same app (still wired to the flaky db,
    // but calls beyond the first pass through to the real implementation) --
    // the route sees appliedAt still null and retries the effect. Before this
    // session's fix, purchaseCredits -> grantLot had no idempotency key, so
    // this second call would grant another 400 credits (800 total). After
    // the fix, grantLot detects the same billingEventId was already used and
    // no-ops instead.
    await request(flakyApp)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(200);
    expect(callCount()).toBe(2);

    expect((await balanceOf(testDb, userId)).purchased).toBe(400); // not 800
    expect(
      await testDb.creditTransaction.count({
        where: { userId, type: 'GRANT', reason: 'grant:purchase' },
      }),
    ).toBe(1);
    const afterSecond = await testDb.billingEvent.findUniqueOrThrow({
      where: { id: 'evt_double_grant_1' },
    });
    expect(afterSecond.appliedAt).not.toBeNull();
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

  it('fails closed with 503 when no webhook secret is configured', async () => {
    const unconfigured = createApp({ db: testDb, mailer, webhooks: { secret: '' } });
    const { raw, sig } = sign({ id: 'evt_unconfigured', type: 'credits.purchased', data: {} });

    const res = await request(unconfigured)
      .post('/webhooks/billing')
      .set('content-type', 'application/json')
      .set('x-webhook-signature', sig)
      .send(raw)
      .expect(503);
    expect((res.body as { error: { code: string } }).error.code).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(await testDb.billingEvent.count({ where: { id: 'evt_unconfigured' } })).toBe(0);
  });
});
