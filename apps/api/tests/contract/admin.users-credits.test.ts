/**
 * ADMIN-002 (PLAN.md, Finding HIGH-2) — `POST /admin/users/:id/credits`.
 *
 * Mounted through the real `adminRoutes` aggregator (`admin/index.ts`), not a
 * bare `adminUsersRoutes` app — this repo's own strict-review lesson
 * (Phase 14 / T255) is that a test bypassing the real `requireOperator` gate
 * proves nothing about authorization. Every test here goes through the real
 * gate for real.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminRoutes } from '../../src/routes/admin/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

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

beforeEach(resetDb);
afterAll(closeDb);

describe('POST /admin/users/:id/credits', () => {
  it('grants credits as a real operator, through the real requireOperator gate, and audits it', async () => {
    const { token, id: operatorId } = await makeOperator();
    const targetUserId = await makeTarget();

    const res = await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: 500, kind: 'PLAN', expiresAt: null, reason: 'goodwill: outage last week' })
      .expect(201);

    const body = res.body as {
      transactionId: string;
      lotId: string;
      balanceBefore: { plan: number };
      balanceAfter: { plan: number };
    };
    expect(body.balanceBefore.plan).toBe(0);
    expect(body.balanceAfter.plan).toBe(500);

    const lot = await testDb.creditLot.findUniqueOrThrow({ where: { id: body.lotId } });
    expect(lot.source).toBe('ADMIN_GRANT');
    expect(lot.userId).toBe(targetUserId);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: targetUserId, action: 'credits.adjust' },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]?.actorId).toBe(operatorId);
  });

  it('403s a non-operator — proven through the real gate, not a bare router', async () => {
    const { token } = await makeNonOperator();
    const targetUserId = await makeTarget();

    const res = await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: 100, kind: 'PLAN', expiresAt: null, reason: 'x' })
      .expect(403);
    expect((res.body as { error: { code: string } }).error.code).toBe('FORBIDDEN');

    const lots = await testDb.creditLot.findMany({ where: { userId: targetUserId } });
    expect(lots).toHaveLength(0);
  });

  it('401s with no token', async () => {
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .send({ amount: 100, kind: 'PLAN', expiresAt: null, reason: 'x' })
      .expect(401);
  });

  it('400s a negative amount', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: -5, kind: 'PLAN', expiresAt: null, reason: 'x' })
      .expect(400);
  });

  it('400s a missing reason', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: 100, kind: 'PLAN', expiresAt: null, reason: '' })
      .expect(400);
  });

  it('400s an invalid kind', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: 100, kind: 'BOGUS', expiresAt: null, reason: 'x' })
      .expect(400);
  });

  it('400s PURCHASED with a non-null expiresAt', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({
        amount: 100,
        kind: 'PURCHASED',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        reason: 'x',
      })
      .expect(400);
  });

  it('400s an amount over the 100,000 operator ceiling', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({ amount: 100_001, kind: 'PLAN', expiresAt: null, reason: 'x' })
      .expect(400);
  });

  it('400s an unrecognized body field (mass-assignment guard)', async () => {
    const { token } = await makeOperator();
    const targetUserId = await makeTarget();
    await request(app)
      .post(`/admin/users/${targetUserId}/credits`)
      .set(auth(token))
      .send({
        amount: 100,
        kind: 'PLAN',
        expiresAt: null,
        reason: 'x',
        source: 'PURCHASE',
      })
      .expect(400);
  });

  it('404s a nonexistent target user', async () => {
    const { token } = await makeOperator();
    await request(app)
      .post('/admin/users/does-not-exist/credits')
      .set(auth(token))
      .send({ amount: 100, kind: 'PLAN', expiresAt: null, reason: 'x' })
      .expect(404);
  });
});
