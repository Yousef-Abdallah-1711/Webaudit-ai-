/**
 * T182 — FR-078: "System MUST NOT offer credit purchase on the free
 * allocation, so that the free tier remains an evaluation of the product
 * rather than a route around subscribing."
 *
 * `POST /billing/credits/purchase` is `403 PLAN_UPGRADE_REQUIRED` for a free
 * user and grants nothing; a subscribed user gets a non-expiring `PURCHASED`
 * lot.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });
const CREDS = { email: 't182@example.com', password: 'correct-horse-battery-staple' };

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

describe('FR-078 — credit purchase is a paid-plan feature', () => {
  it('refuses a free user with 403 PLAN_UPGRADE_REQUIRED and grants nothing', async () => {
    const { token, userId } = await signIn();

    const res = await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 500 })
      .expect(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect((res.body as { error: { details: { requiredTier: string } } }).error.details.requiredTier).toBe(
      'starter',
    );

    const purchased = await testDb.creditLot.count({ where: { userId, kind: 'PURCHASED' } });
    expect(purchased).toBe(0);
  });

  it('lets a subscribed user buy credits into a non-expiring lot', async () => {
    const { token, userId } = await signIn();
    await request(app).post('/billing/subscribe').set(auth(token)).send({ planId: 'starter' }).expect(201);

    await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 500 })
      .expect(201);

    const lots = await testDb.creditLot.findMany({ where: { userId, kind: 'PURCHASED' } });
    expect(lots).toHaveLength(1);
    expect(lots[0]?.amountRemaining).toBe(500);
    expect(lots[0]?.expiresAt).toBeNull();
  });

  it('rejects a non-positive amount', async () => {
    const { token } = await signIn();
    await request(app).post('/billing/subscribe').set(auth(token)).send({ planId: 'pro' }).expect(201);
    await request(app)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 0 })
      .expect(400);
  });
});
