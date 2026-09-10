/**
 * PLAN.md, Finding CRIT-1 — `POST /billing/subscribe` and
 * `POST /billing/credits/purchase` used to apply their real financial effect
 * for any authenticated user, in any environment including production, with
 * no payment confirmation of any kind. Before this fix, any logged-in user
 * could mint up to 1,000,000 free credits per call, or a free paid
 * subscription, in one HTTP request.
 *
 * This is the regression test for that finding: both routes must 404 (not
 * 403 — a 403 confirms the route exists) once `isProduction` is true, and
 * must be completely unaffected otherwise. `billingRoutes`'s `isProduction`
 * dependency is injected directly rather than mutating
 * `process.env['NODE_ENV']`, because `env.isProduction` (`config/env.ts`) is
 * computed once at module-import time and mutating `process.env` afterward
 * cannot reach it — the same reasoning `app.ts`'s own `rateLimiters`
 * dependency documents for `shouldRateLimit`.
 */

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { startApi, type ApiService } from '../../src/index.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const prodApp = createApp({ db: testDb, mailer, billing: { isProduction: true } });
const devApp = createApp({ db: testDb, mailer, billing: { isProduction: false } });

const CREDS = { email: 'crit1@example.com', password: 'correct-horse-battery-staple' };

async function signIn(app: typeof prodApp): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('CRIT-1 regression: direct-effect billing routes are production-gated', () => {
  it('POST /billing/credits/purchase 404s in production, minting nothing', async () => {
    const token = await signIn(prodApp);
    const before = await request(prodApp).get('/billing/credits').set(auth(token)).expect(200);
    const balanceBefore = (before.body as { balance: { purchased: number } }).balance.purchased;

    const res = await request(prodApp)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 1_000_000 })
      .expect(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    const after = await request(prodApp).get('/billing/credits').set(auth(token)).expect(200);
    expect((after.body as { balance: { purchased: number } }).balance.purchased).toBe(
      balanceBefore,
    );
  });

  it('POST /billing/subscribe 404s in production, granting no subscription', async () => {
    const token = await signIn(prodApp);

    const res = await request(prodApp)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'business' })
      .expect(404);
    expect((res.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    const sub = await testDb.subscription.findFirst({ where: { user: { email: CREDS.email } } });
    expect(sub).toBeNull();
  });

  it('both routes are unaffected outside production', async () => {
    const token = await signIn(devApp);
    // Credit purchase is refused on the free tier regardless of this gate
    // (FR-078, purchase.service.ts's own `assertEntitled`), so subscribe
    // first — this is that same route, exercised precisely because it must
    // still work outside production.
    await request(devApp)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'starter' })
      .expect(201);
    await request(devApp)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: 100 })
      .expect(201);
  });

  it('a malformed body in production still 404s, never leaking a 400 (indistinguishable from a nonexistent route)', async () => {
    const token = await signIn(prodApp);
    await request(prodApp)
      .post('/billing/credits/purchase')
      .set(auth(token))
      .send({ credits: -5 })
      .expect(404);
    await request(prodApp)
      .post('/billing/subscribe')
      .set(auth(token))
      .send({ planId: 'not-a-real-plan' })
      .expect(404);
  });
});

/**
 * Found during manual QA against the real running process: `createApp`'s own
 * `billing` dependency was proven above, but `startApi` — the actual
 * function a real deployment boots from, and the only one manual/e2e-style
 * verification tends to reach for — never forwarded its own `options.billing`
 * into the `createApp({...})` call at all. Passing it silently did nothing:
 * TypeScript's excess-property check would have caught this in code that
 * runs through `tsc`, but a throwaway `tsx` script (no type-checking step)
 * did not, and no existing automated test exercised `startApi` with this
 * option, so the gap went unnoticed. Harmless for a real deployment (which
 * never passes `billing` at all, and correctly falls back to the real
 * `env.isProduction`), but it made the option a lie for anyone who did pass
 * it. This is the regression test for `startApi` specifically, distinct
 * from the `createApp`-direct tests above.
 */
describe('startApi itself forwards the billing.isProduction override, not just createApp', () => {
  let api: ApiService | undefined;

  afterEach(async () => {
    await api?.shutdown('test cleanup');
    api = undefined;
  });

  it('POST /billing/credits/purchase 404s in production when booted through startApi', async () => {
    api = await startApi({
      db: testDb,
      port: 0,
      installSignalHandlers: false,
      billing: { isProduction: true },
      reconcileCapabilities: false,
    });
    const base = `http://127.0.0.1:${String(api.port)}`;

    const reg = await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'startapi-crit1@example.com',
        password: 'correct-horse-battery-staple',
      }),
    });
    expect(reg.status).toBe(201);
    await testDb.user.update({
      where: { email: 'startapi-crit1@example.com' },
      data: { emailVerifiedAt: new Date() },
    });
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'startapi-crit1@example.com',
        password: 'correct-horse-battery-staple',
      }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };

    const purchase = await fetch(`${base}/billing/credits/purchase`, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ credits: 500 }),
    });
    expect(purchase.status).toBe(404);
  });

  /**
   * Same finding, same fix pattern, for the webhook seam: `startApi` never
   * forwarded `options.webhooks` to `createApp` either, so a caller signing
   * a payload with a custom test secret through `startApi` got a 503
   * "not configured" instead of the intended signature check — the real
   * webhook secret env var was never set in this test process at all.
   */
  it('a webhook signed with a custom secret verifies correctly when booted through startApi', async () => {
    const { createHmac } = await import('node:crypto');
    const secret = 'startapi-webhook-secret';
    api = await startApi({
      db: testDb,
      port: 0,
      installSignalHandlers: false,
      webhooks: { secret },
      reconcileCapabilities: false,
    });
    const base = `http://127.0.0.1:${String(api.port)}`;

    const email = 'startapi-webhook@example.com';
    await fetch(`${base}/auth/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: 'correct-horse-battery-staple' }),
    });
    const { id: userId } = await testDb.user.findUniqueOrThrow({ where: { email } });
    await testDb.subscription.create({
      data: {
        userId,
        planId: 'pro',
        status: 'ACTIVE',
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + 30 * 86_400_000),
      },
    });

    const payload = JSON.stringify({
      id: 'evt_startapi_1',
      type: 'credits.purchased',
      data: { userId, credits: 111 },
    });
    const sig = createHmac('sha256', secret).update(payload).digest('hex');
    const res = await fetch(`${base}/webhooks/billing`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-webhook-signature': sig },
      body: payload,
    });
    expect(res.status).toBe(200);
    const lot = await testDb.creditLot.findFirst({ where: { userId, source: 'PURCHASE' } });
    expect(lot?.amountGranted).toBe(111);
  });
});
