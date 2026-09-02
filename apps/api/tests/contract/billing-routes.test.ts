/**
 * T191 — the billing routes: plans, the movement receipt, subscribe/change/
 * cancel, and purchase. Scenario 5 ("they can see what was charged, for what,
 * and when") and scenario 6 ("which balance was drawn against") in particular.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { debit } from '../../src/services/credits/debit.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });
const CREDS = { email: 't191@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('billing routes', () => {
  it('GET /billing/plans lists the active tiers cheapest first', async () => {
    const { token } = await signIn();
    const res = await request(app).get('/billing/plans').set(auth(token)).expect(200);
    const plans = (res.body as { plans: { id: string; monthlyCredits: number }[] }).plans;
    expect(plans.map((p) => p.id)).toEqual(['free', 'starter', 'pro', 'business']);
  });

  it('GET /billing/credits is a receipt: every movement, and which balance a debit drew against', async () => {
    const { token, userId } = await signIn();
    // The free-grant GRANT exists from registration. Subscribe adds a plan lot.
    await request(app).post('/billing/subscribe').set(auth(token)).send({ planId: 'pro' }).expect(201);
    // Spend 90 — plan credits are consumed first (SC-022).
    await debit(testDb, { userId, amount: 90, reason: 'scan:full_audit' });

    const res = await request(app).get('/billing/credits').set(auth(token)).expect(200);
    const body = res.body as {
      balance: { plan: number; purchased: number };
      movements: { type: string; amount: number; reason: string; drewFrom: Record<string, number>; createdAt: string }[];
    };

    expect(body.balance.plan).toBe(1200 + 50 - 90);
    const spend = body.movements.find((m) => m.type === 'DEBIT');
    expect(spend?.amount).toBe(90);
    expect(spend?.reason).toBe('scan:full_audit');
    expect(spend?.drewFrom).toEqual({ PLAN: 90 });
    expect(typeof spend?.createdAt).toBe('string');

    expect(body.movements.some((m) => m.type === 'GRANT')).toBe(true);
  });

  it('subscribe → change-plan → cancel, with the retention consequence on cancel', async () => {
    const { token } = await signIn();

    await request(app).post('/billing/subscribe').set(auth(token)).send({ planId: 'starter' }).expect(201);

    const changed = await request(app)
      .post('/billing/change-plan')
      .set(auth(token))
      .send({ planId: 'pro' })
      .expect(200);
    expect((changed.body as { subscription: { planId: string } }).subscription.planId).toBe('pro');

    const cancelled = await request(app).post('/billing/cancel').set(auth(token)).expect(200);
    expect((cancelled.body as { subscription: { cancelAtPeriodEnd: boolean } }).subscription.cancelAtPeriodEnd).toBe(
      true,
    );
    expect((cancelled.body as { reportsReadableUntil: string }).reportsReadableUntil).toBeDefined();
  });

  it('change-plan before subscribing is a 409', async () => {
    const { token } = await signIn();
    await request(app).post('/billing/change-plan').set(auth(token)).send({ planId: 'pro' }).expect(409);
  });
});
