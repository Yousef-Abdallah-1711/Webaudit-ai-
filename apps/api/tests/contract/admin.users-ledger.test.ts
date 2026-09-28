/**
 * Phase 4 (master plan), P4-T2 — `GET /admin/users/:id` now exposes the
 * target user's own recent credit ledger (`recentLedger`), and its `planId`
 * reflects the real effective plan (`resolveEffectivePlan`'s own rule) rather
 * than the raw, possibly-stale `Subscription.planId` — closing
 * PLAN-FOLLOWUP-1 (Phase 3's own finding).
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminRoutes } from '../../src/routes/admin/index.js';
import { assignPlan } from '../../src/services/admin/plan-assignment.service.js';
import { adjustCredits } from '../../src/services/credits/adjust.js';
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
async function makeTarget(email: string): Promise<string> {
  const u = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return u.id;
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('GET /admin/users/:id — recentLedger and effective planId', () => {
  it("exposes the target user's own recent ledger entries, newest first", async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget('ledger-target@example.com');

    await adjustCredits(testDb, {
      operatorId,
      targetUserId,
      amount: 100,
      kind: 'PURCHASED',
      expiresAt: null,
      reason: 'first grant',
    });
    await adjustCredits(testDb, {
      operatorId,
      targetUserId,
      amount: 50,
      kind: 'PURCHASED',
      expiresAt: null,
      reason: 'second grant',
    });

    const res = await request(app)
      .get(`/admin/users/${targetUserId}`)
      .set(auth(token))
      .expect(200);

    const body = res.body as {
      user: { recentLedger: readonly { amount: number; reason: string }[] };
    };
    expect(body.user.recentLedger.length).toBeGreaterThanOrEqual(2);
    expect(body.user.recentLedger[0]?.reason).toBe('second grant');
    expect(body.user.recentLedger[1]?.reason).toBe('first grant');
  });

  it("never returns another user's ledger entries (IDOR check)", async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget('ledger-target-2@example.com');
    const otherUserId = await makeTarget('ledger-other@example.com');

    await adjustCredits(testDb, {
      operatorId,
      targetUserId: otherUserId,
      amount: 999,
      kind: 'PURCHASED',
      expiresAt: null,
      reason: 'belongs to a different user entirely',
    });

    const res = await request(app)
      .get(`/admin/users/${targetUserId}`)
      .set(auth(token))
      .expect(200);

    const body = res.body as { user: { recentLedger: readonly unknown[] } };
    expect(body.user.recentLedger).toHaveLength(0);
  });

  it('planId reflects the real effective plan, not a stale Subscription.planId, after an admin revert to free', async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget('effective-plan@example.com');

    await assignPlan(testDb, {
      operatorId,
      targetUserId,
      planId: 'pro',
      reason: 'grant',
    });
    await assignPlan(testDb, {
      operatorId,
      targetUserId,
      planId: 'free',
      reason: 'revert',
    });

    const res = await request(app)
      .get(`/admin/users/${targetUserId}`)
      .set(auth(token))
      .expect(200);

    const body = res.body as { user: { planId: string; subscriptionStatus: string | null } };
    expect(body.user.planId, 'must be free, not the stale "pro" the row still names').toBe('free');
    expect(body.user.subscriptionStatus).toBe('EXPIRED');
  });

  it('GET /admin/users list also reflects the effective plan (same fix, list endpoint)', async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget('effective-plan-list@example.com');

    await assignPlan(testDb, { operatorId, targetUserId, planId: 'pro', reason: 'grant' });
    await assignPlan(testDb, { operatorId, targetUserId, planId: 'free', reason: 'revert' });

    const res = await request(app).get('/admin/users').set(auth(token)).expect(200);
    const body = res.body as { users: readonly { id: string; planId: string }[] };
    const found = body.users.find((u) => u.id === targetUserId);
    expect(found?.planId).toBe('free');
  });
});
