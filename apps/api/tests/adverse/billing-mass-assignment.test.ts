/**
 * SEC-002/SEC-003 (PLAN.md §7, threat-table rows 4-5) — regression tests
 * proving the billing routes cannot have their financial parameters
 * smuggled by a client. These are proven-already-safe assertions, not fixes
 * for a bug: added because "every discovered attack path must receive a
 * regression test," including ones proven to already fail, so a future
 * change cannot silently reopen them without a test going red.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer, billing: { isProduction: false } });

async function signIn(email: string): Promise<{ token: string; userId: string }> {
  await request(app)
    .post('/auth/register')
    .send({ email, password: 'correct-horse-battery-staple' })
    .expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password: 'correct-horse-battery-staple' })
    .expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('SEC-002: userId cannot be smuggled via request body', () => {
  it('POST /billing/credits/purchase always credits the authenticated caller, never a supplied userId', async () => {
    const attacker = await signIn('sec002-attacker@example.com');
    const { userId: victimId } = await signIn('sec002-victim@example.com');

    // Free tier refuses purchase — subscribe the attacker first so the call
    // reaches the code path this test actually cares about.
    await request(app)
      .post('/billing/subscribe')
      .set(auth(attacker.token))
      .send({ planId: 'starter' })
      .expect(201);

    await request(app)
      .post('/billing/credits/purchase')
      .set(auth(attacker.token))
      .send({ credits: 50, userId: victimId })
      .expect(201);

    const victimLots = await testDb.creditLot.findMany({
      where: { userId: victimId, source: 'PURCHASE' },
    });
    expect(victimLots).toHaveLength(0);
    const attackerLots = await testDb.creditLot.findMany({
      where: { userId: attacker.userId, source: 'PURCHASE' },
    });
    expect(attackerLots).toHaveLength(1);
    expect(attackerLots[0]?.amountGranted).toBe(50);
  });

  it('POST /billing/subscribe always subscribes the authenticated caller, never a supplied userId', async () => {
    const attacker = await signIn('sec002b-attacker@example.com');
    const { userId: victimId } = await signIn('sec002b-victim@example.com');

    await request(app)
      .post('/billing/subscribe')
      .set(auth(attacker.token))
      .send({ planId: 'pro', userId: victimId })
      .expect(201);

    const victimSub = await testDb.subscription.findUnique({ where: { userId: victimId } });
    expect(victimSub).toBeNull();
    const attackerSub = await testDb.subscription.findUniqueOrThrow({
      where: { userId: attacker.userId },
    });
    expect(attackerSub.planId).toBe('pro');
  });
});

describe('SEC-003: kind/source/expiresAt/billingEventId cannot be supplied by a client', () => {
  it('a purchased lot always has kind PURCHASED, source PURCHASE, expiresAt null, regardless of body overrides', async () => {
    const { token, userId } = await signIn('sec003-purchase@example.com');
    await request(app)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'starter' })
      .expect(201);

    await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({
        credits: 30,
        kind: 'PLAN',
        source: 'ADMIN_GRANT',
        expiresAt: new Date().toISOString(),
        billingEventId: 'forged-event-id',
      })
      .expect(201);

    const lot = await testDb.creditLot.findFirstOrThrow({ where: { userId, source: 'PURCHASE' } });
    expect(lot.kind).toBe('PURCHASED');
    expect(lot.source).toBe('PURCHASE');
    expect(lot.expiresAt).toBeNull();

    const tx = await testDb.creditTransaction.findFirstOrThrow({
      where: { userId, reason: { contains: 'purchase' } },
    });
    expect(tx.billingEventId).toBeNull();
  });

  it('a subscription grant always has kind PLAN, source PLAN_RENEWAL, expiresAt at periodEnd, regardless of body overrides', async () => {
    const { token, userId } = await signIn('sec003-subscribe@example.com');

    await request(app)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({
        planId: 'pro',
        kind: 'PURCHASED',
        source: 'ADMIN_GRANT',
        expiresAt: null,
        billingEventId: 'forged-event-id',
      })
      .expect(201);

    const lot = await testDb.creditLot.findFirstOrThrow({
      where: { userId, source: 'PLAN_RENEWAL' },
    });
    expect(lot.kind).toBe('PLAN');
    expect(lot.source).toBe('PLAN_RENEWAL');
    expect(lot.expiresAt).not.toBeNull();

    const tx = await testDb.creditTransaction.findFirstOrThrow({
      where: { userId, reason: { contains: 'plan_renewal' } },
    });
    expect(tx.billingEventId).toBeNull();
  });
});
