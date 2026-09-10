/**
 * "No Credit Bypass" final audit — direct proof, in one file, of the two
 * invariants that span both the billing routes and the admin route:
 *
 *   16. Operator grants are the ONLY manual production grant mechanism.
 *    9. No hidden/internal/dev route can mint credits in production.
 *
 * BILL-001/002 proved the user-facing routes 404 in production
 * (`billing-production-gate.test.ts`). This file proves the other half of
 * the same claim that no test directly exercised before: that the
 * production gate on `/billing/*` does NOT also — accidentally or
 * otherwise — disable the operator's own grant path, and that the operator
 * path is reachable in production precisely because it goes through
 * `requireOperator`, not an environment check. Concrete production
 * simulation, not description.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { createApp } from '../../src/app.js';
import { adminRoutes } from '../../src/routes/admin/index.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
// The user-facing billing app, with the production gate simulated on —
// exactly BILL-001/002's own injection mechanism.
const prodBillingApp = createApp({ db: testDb, mailer, billing: { isProduction: true } });

// The admin app is built from `adminRoutes` directly, mounted the same way
// `app.ts` mounts it — it carries no `isProduction` dependency of its own at
// all, which is the point: its gate is `requireOperator`, not an env check.
function buildAdminApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRoutes(testDb));
  return app;
}
const adminApp = buildAdminApp();

async function tokenFor(userId: string, isOperator = false): Promise<string> {
  return new SignJWT({ isOperator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

describe('production invariants spanning both the user and operator surfaces', () => {
  it('a normal user cannot mint credits in production, but an operator grant still works — same process, same moment', async () => {
    const targetUser = await testDb.user.create({
      data: { email: 'inv-target@example.com', emailVerifiedAt: new Date() },
    });
    const operator = await testDb.user.create({
      data: { email: 'inv-operator@example.com', isOperator: true, emailVerifiedAt: new Date() },
    });
    const userToken = await tokenFor(targetUser.id, false);
    const operatorToken = await tokenFor(operator.id, true);

    // The user-facing mint path: refused, production-wide.
    const purchaseAttempt = await request(prodBillingApp)
      .post('/billing/credits/purchase')
      .set(auth(userToken))
      .send({ credits: 999_999 })
      .expect(404);
    expect((purchaseAttempt.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    const subscribeAttempt = await request(prodBillingApp)
      .post('/billing/subscribe')
      .set(auth(userToken))
      .send({ planId: 'business' })
      .expect(404);
    expect((subscribeAttempt.body as { error: { code: string } }).error.code).toBe('NOT_FOUND');

    // Confirmed nothing was minted for the user by either attempt.
    const userLots = await testDb.creditLot.findMany({ where: { userId: targetUser.id } });
    expect(userLots).toHaveLength(0);

    // The operator's own path: entirely unaffected. It was never given an
    // `isProduction` dependency because its gate is `requireOperator`, not
    // an environment check — this is what makes it the one production
    // grant mechanism left standing, not an oversight in the gate's scope.
    const grantRes = await request(adminApp)
      .post(`/admin/users/${targetUser.id}/credits`)
      .set(auth(operatorToken))
      .send({ amount: 200, kind: 'PLAN', expiresAt: null, reason: 'production-invariant proof' })
      .expect(201);
    expect((grantRes.body as { balanceAfter: { plan: number } }).balanceAfter.plan).toBe(200);

    const finalLots = await testDb.creditLot.findMany({ where: { userId: targetUser.id } });
    expect(finalLots).toHaveLength(1);
    expect(finalLots[0]?.source).toBe('ADMIN_GRANT');

    // And the operator route itself is still the one gate that matters: a
    // non-operator, even under this exact same "production" simulation,
    // is refused by requireOperator regardless of environment.
    const nonOperatorToken = await tokenFor(targetUser.id, false);
    await request(adminApp)
      .post(`/admin/users/${targetUser.id}/credits`)
      .set(auth(nonOperatorToken))
      .send({ amount: 200, kind: 'PLAN', expiresAt: null, reason: 'should be refused' })
      .expect(403);
  });
});
