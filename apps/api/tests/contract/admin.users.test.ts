/**
 * T205 (users half) — GET/PATCH /admin/users, /admin/users/:id.
 *
 * Not mounted under `/admin` and not behind `requireOperator` yet (T211's
 * job — see the routers' own module notes). This suite therefore builds a
 * minimal Express app wrapping `adminUsersRoutes` directly rather than going
 * through `createApp`, and mints an access token itself rather than going
 * through the registration/login routes (neither of which this app mounts).
 * The `requireOperator` authorization boundary itself is T202's suite, later.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminUsersRoutes } from '../../src/routes/admin/users.routes.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminUsersRoutes(testDb));
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

async function makeUser(email: string, opts: { isOperator?: boolean } = {}) {
  return testDb.user.create({
    data: { email, isOperator: opts.isOperator ?? false, emailVerifiedAt: new Date() },
  });
}

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /users', () => {
  it('lists users with plan, balance, and createdAt', async () => {
    const actor = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com');
    const token = await tokenFor(actor.id);

    const res = await request(app).get('/users').set(auth(token)).expect(200);
    const body = res.body as {
      users: { id: string; email: string; isOperator: boolean; planId: string; balance: { plan: number; purchased: number } }[];
      total: number;
      limit: number;
      offset: number;
    };

    expect(body.total).toBe(2);
    const found = body.users.find((u) => u.id === target.id);
    expect(found).toBeDefined();
    expect(found?.email).toBe('member@example.com');
    expect(found?.isOperator).toBe(false);
    expect(found?.planId).toBe('free');
    expect(found?.balance).toEqual({ plan: 0, purchased: 0 });
  });

  it('paginates with limit/offset', async () => {
    const actor = await makeUser('operator@example.com');
    for (let i = 0; i < 5; i++) await makeUser(`user${i}@example.com`);
    const token = await tokenFor(actor.id);

    const res = await request(app).get('/users').query({ limit: 2, offset: 1 }).set(auth(token)).expect(200);
    const body = res.body as { users: unknown[]; total: number; limit: number; offset: number };
    expect(body.users.length).toBe(2);
    expect(body.total).toBe(6);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
  });
});

describe('GET /users/:id', () => {
  it('returns detail for a real user', async () => {
    const actor = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com');
    const token = await tokenFor(actor.id);

    const res = await request(app).get(`/users/${target.id}`).set(auth(token)).expect(200);
    const body = res.body as { user: { id: string; email: string; subscription: unknown } };
    expect(body.user.id).toBe(target.id);
    expect(body.user.email).toBe('member@example.com');
    expect(body.user.subscription).toBeNull();
  });

  it('404s for a nonexistent user', async () => {
    const actor = await makeUser('operator@example.com');
    const token = await tokenFor(actor.id);
    await request(app).get('/users/does-not-exist').set(auth(token)).expect(404);
  });
});

describe('PATCH /users/:id', () => {
  it('promotes a user to operator and writes an AuditLogEntry', async () => {
    const actor = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com');
    const token = await tokenFor(actor.id);

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set(auth(token))
      .send({ isOperator: true })
      .expect(200);
    const body = res.body as { user: { isOperator: boolean } };
    expect(body.user.isOperator).toBe(true);

    const persisted = await testDb.user.findUnique({ where: { id: target.id } });
    expect(persisted?.isOperator).toBe(true);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: target.id },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actor.id);
    expect(entries[0]?.action).toBe('user.update');
    expect(entries[0]?.before).toEqual({ isOperator: false });
    expect(entries[0]?.after).toEqual({ isOperator: true });
  });

  it('rejects an invalid body with 400 and writes no AuditLogEntry', async () => {
    const actor = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com');
    const token = await tokenFor(actor.id);

    await request(app)
      .patch(`/users/${target.id}`)
      .set(auth(token))
      .send({ isOperator: 'yes' })
      .expect(400);

    const entries = await testDb.auditLogEntry.count();
    expect(entries).toBe(0);
  });

  it('404s for a nonexistent user', async () => {
    const actor = await makeUser('operator@example.com');
    const token = await tokenFor(actor.id);
    await request(app).patch('/users/does-not-exist').set(auth(token)).send({ isOperator: true }).expect(404);
  });
});
