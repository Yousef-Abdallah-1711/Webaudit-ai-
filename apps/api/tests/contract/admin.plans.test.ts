/**
 * T205 (plans half) — GET/POST/PATCH /admin/plans, /admin/plans/:id.
 *
 * Same not-yet-mounted, not-yet-`requireOperator`-gated setup as
 * admin.users.test.ts — see that file's header for why this builds a minimal
 * app and mints its own token.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminPlansRoutes } from '../../src/routes/admin/plans.routes.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { PlanNotSubscribableError, subscribe } from '../../src/services/billing/subscription.service.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminPlansRoutes(testDb));
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

async function makeOperatorToken(): Promise<{ token: string; actorId: string }> {
  const actor = await testDb.user.create({
    data: { email: 'operator@example.com', emailVerifiedAt: new Date() },
  });
  return { token: await tokenFor(actor.id), actorId: actor.id };
}

const newPlanBody = {
  id: 'enterprise',
  name: 'Enterprise',
  monthlyCredits: 10_000,
  creditsRecur: true,
  allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'],
  allowLoadGeneration: true,
  allowReadinessPass: true,
  allowCreditPurchase: true,
  allowCustomCapability: true,
  concurrentScanLimit: 12,
  queuePriority: 5,
  retentionDays: 1825,
};

beforeEach(async () => {
  await resetDb();
  // `resetDb` deliberately leaves `Plan` untouched (it is shared reference
  // data most suites seed once via `seedPlans()` and never mutate — see
  // db.ts's own comment). This suite creates and deletes its own custom
  // 'enterprise' tier, so it clears the table itself, matching
  // entitlements.test.ts's precedent for the same reason.
  await testDb.plan.deleteMany();
});
afterAll(async () => {
  // This file wipes and reseeds `Plan` itself (see the `beforeEach` note
  // above) and deliberately deactivates `starter` in one test — leaving it
  // that way after the suite finishes would corrupt shared reference data
  // for whichever test file runs next, since `seedPlans()`'s `update` path
  // has no `isActive` field to reset it with (only a fresh `create` applies
  // the schema default). Restore a clean, fully-active table before closing.
  await testDb.plan.deleteMany();
  await seedPlans();
  await closeDb();
});

describe('GET /plans', () => {
  it('lists active plans by default', async () => {
    await seedPlans();
    const { token } = await makeOperatorToken();
    const res = await request(app).get('/plans').set(auth(token)).expect(200);
    const body = res.body as { plans: { id: string; isActive: boolean }[] };
    expect(body.plans.length).toBe(4);
    expect(body.plans.every((p) => p.isActive)).toBe(true);
  });

  it('includes inactive plans when asked', async () => {
    await seedPlans();
    await testDb.plan.update({ where: { id: 'starter' }, data: { isActive: false } });
    const { token } = await makeOperatorToken();

    const activeOnly = await request(app).get('/plans').set(auth(token)).expect(200);
    expect((activeOnly.body as { plans: unknown[] }).plans.length).toBe(3);

    const all = await request(app).get('/plans').query({ includeInactive: 'true' }).set(auth(token)).expect(200);
    expect((all.body as { plans: unknown[] }).plans.length).toBe(4);
  });
});

describe('POST /plans', () => {
  it('creates a new tier and writes an AuditLogEntry', async () => {
    const { token, actorId } = await makeOperatorToken();

    const res = await request(app).post('/plans').set(auth(token)).send(newPlanBody).expect(201);
    const body = res.body as { plan: { id: string; name: string; isActive: boolean } };
    expect(body.plan.id).toBe('enterprise');
    expect(body.plan.name).toBe('Enterprise');
    expect(body.plan.isActive).toBe(true);

    const persisted = await testDb.plan.findUnique({ where: { id: 'enterprise' } });
    expect(persisted).not.toBeNull();

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Plan', subjectId: 'enterprise' },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
    expect(entries[0]?.action).toBe('plan.create');
  });

  it('rejects an invalid body with 400', async () => {
    const { token } = await makeOperatorToken();
    const incomplete: Record<string, unknown> = { ...newPlanBody };
    delete incomplete['monthlyCredits'];
    await request(app).post('/plans').set(auth(token)).send(incomplete).expect(400);
  });

  it('rejects a duplicate id with 409', async () => {
    const { token } = await makeOperatorToken();
    await request(app).post('/plans').set(auth(token)).send(newPlanBody).expect(201);
    await request(app).post('/plans').set(auth(token)).send(newPlanBody).expect(409);
  });
});

describe('PATCH /plans/:id', () => {
  it('changes an existing tier and writes an AuditLogEntry', async () => {
    await seedPlans();
    const { token, actorId } = await makeOperatorToken();

    const res = await request(app)
      .patch('/plans/starter')
      .set(auth(token))
      .send({ monthlyCredits: 999 })
      .expect(200);
    const body = res.body as { plan: { monthlyCredits: number } };
    expect(body.plan.monthlyCredits).toBe(999);

    const persisted = await testDb.plan.findUnique({ where: { id: 'starter' } });
    expect(persisted?.monthlyCredits).toBe(999);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Plan', subjectId: 'starter' },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
    expect(entries[0]?.action).toBe('plan.update');
  });

  it('rejects an empty patch with 400', async () => {
    await seedPlans();
    const { token } = await makeOperatorToken();
    await request(app).patch('/plans/starter').set(auth(token)).send({}).expect(400);
  });

  it('404s for a nonexistent plan', async () => {
    const { token } = await makeOperatorToken();
    await request(app).patch('/plans/does-not-exist').set(auth(token)).send({ monthlyCredits: 5 }).expect(404);
  });

  it('deactivating a plan here still refuses new subscriptions to it (loadSubscribablePlan)', async () => {
    await seedPlans();
    const { token } = await makeOperatorToken();
    const subscriber = await testDb.user.create({
      data: { email: 'subscriber@example.com', emailVerifiedAt: new Date() },
    });

    await request(app).patch('/plans/starter').set(auth(token)).send({ isActive: false }).expect(200);

    await expect(subscribe(testDb, { userId: subscriber.id, planId: 'starter' })).rejects.toBeInstanceOf(
      PlanNotSubscribableError,
    );
  });
});
