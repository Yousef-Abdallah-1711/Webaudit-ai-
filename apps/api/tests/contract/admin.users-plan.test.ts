/**
 * Phase 3 (master plan) — `POST /admin/users/:id/plan`, the new admin
 * plan/tier-assignment endpoint, mounted through the real `adminRoutes`
 * aggregator so `requireOperator` is exercised for real (same convention
 * `admin.users-credits.test.ts` already established for the sibling
 * credits endpoint).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminRoutes } from '../../src/routes/admin/index.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin', adminRoutes(testDb));
  return app;
}
const app = buildApp();

async function tokenFor(userId: string): Promise<string> {
  return new SignJWT({ isOperator: false })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function makeOperator(): Promise<{ token: string; id: string }> {
  const u = await testDb.user.create({
    data: { email: 'operator@example.com', isOperator: true, emailVerifiedAt: new Date() },
  });
  return { token: await tokenFor(u.id), id: u.id };
}
async function makeNonOperator(): Promise<{ token: string; id: string }> {
  const u = await testDb.user.create({
    data: { email: 'member@example.com', isOperator: false, emailVerifiedAt: new Date() },
  });
  return { token: await tokenFor(u.id), id: u.id };
}
async function makeTarget(email = 'target@example.com'): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('POST /admin/users/:id/plan', () => {
  it('assigns a real plan tier with no payment, changes the effective plan immediately, and audits it', async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget();

    const res = await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: 'temporary product decision: credit-only users need ARCHIVE scans' })
      .expect(200);

    const body = res.body as { user: { planId: string; subscriptionStatus: string | null } };
    expect(body.user.planId).toBe('pro');
    expect(body.user.subscriptionStatus).toBe('ACTIVE');

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId: targetUserId } });
    expect(sub.status).toBe('ACTIVE');
    expect(sub.planId).toBe('pro');
    // The load-bearing safety flag: an admin assignment must never look like
    // a real, provider-backed subscription to the automatic renewal sweep.
    expect(sub.adminAssigned).toBe(true);
    expect(sub.externalCustomerId).toBeNull();
    expect(sub.externalSubscriptionId).toBeNull();
    // No credit lot — plan assignment and credit granting are deliberately
    // separate admin actions (frozen decision, master plan).
    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(0);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: targetUserId, action: 'plan.assign' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(operatorId);
  });

  it('actually changes entitlements, not just the label: a free user cannot submit ARCHIVE, a pro-assigned one can', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();

    // Before assignment: free tier, ARCHIVE input is refused (proven through
    // the entitlement check directly — the full upload pipeline is out of
    // scope for this endpoint's own test).
    const { assertEntitled, EntitlementError } = await import(
      '../../src/services/billing/entitlements.js'
    );
    await expect(assertEntitled(testDb, targetUserId, 'ARCHIVE_INPUT')).rejects.toBeInstanceOf(
      EntitlementError,
    );

    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: 'entitlement test' })
      .expect(200);

    // After assignment: the same entitlement check now passes for real.
    await expect(assertEntitled(testDb, targetUserId, 'ARCHIVE_INPUT')).resolves.toMatchObject({
      id: 'pro',
    });
  });

  it('reverts a user to free with planId: "free", falling back to free immediately', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();

    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: 'grant' })
      .expect(200);

    const res = await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'free', reason: 'revert' })
      .expect(200);

    const body = res.body as { user: { planId: string; subscriptionStatus: string | null } };
    // `AdminUserDetail.planId` reads the Subscription row's own `planId`
    // verbatim, unconditional on status — a pre-existing, cosmetic staleness
    // this test does not fix (out of scope here; tracked as PLAN-FOLLOWUP-1
    // in the master plan, for Phase 4's "designed user detail view" task).
    // What genuinely governs the user's access is
    // `subscriptionStatus`/`resolveEffectivePlan` below.
    expect(body.user.subscriptionStatus).toBe('EXPIRED');

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId: targetUserId } });
    expect(sub.status).toBe('EXPIRED');

    const { resolveEffectivePlan } = await import('../../src/services/billing/entitlements.js');
    const effective = await resolveEffectivePlan(testDb, targetUserId);
    expect(effective.id, 'the real, governing entitlement must be free after an EXPIRED status').toBe(
      'free',
    );
  });

  it('accepts an optional periodEnd for a time-boxed assignment', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    const periodEnd = new Date(Date.now() + 7 * 86_400_000).toISOString();

    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'starter', periodEnd, reason: 'trial' })
      .expect(200);

    const sub = await testDb.subscription.findUniqueOrThrow({ where: { userId: targetUserId } });
    expect(sub.periodEnd.toISOString()).toBe(periodEnd);
  });

  it('403s a non-operator — proven through the real gate', async () => {
    const { token } = await makeNonOperator();
    const targetUserId = await makeTarget();
    const res = await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: 'x' })
      .expect(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');
  });

  it('401s with no token', async () => {
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .send({ planId: 'pro', reason: 'x' })
      .expect(401);
  });

  it('400s a missing reason', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: '' })
      .expect(400);
  });

  it('400s a past periodEnd', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', periodEnd: new Date(Date.now() - 1000).toISOString(), reason: 'x' })
      .expect(400);
  });

  it('400s a nonexistent/inactive plan id', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'does-not-exist', reason: 'x' })
      .expect(400);
  });

  it('400s an unrecognized body field (mass-assignment guard)', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/plan`)
      .set(auth(token))
      .send({ planId: 'pro', reason: 'x', status: 'ACTIVE' })
      .expect(400);
  });

  it('404s a nonexistent target user', async () => {
    const { token } = await makeOperator();
    await request(app)
      .post('/admin/users/does-not-exist/plan')
      .set(auth(token))
      .send({ planId: 'pro', reason: 'x' })
      .expect(404);
  });
});
