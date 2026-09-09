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
import { PrismaClient } from '../../prisma/generated/client/index.js';
import { adminUsersRoutes } from '../../src/routes/admin/users.routes.js';
import { updateUser } from '../../src/services/admin/users.service.js';
import { closeDb, resetDb, testDb, TEST_DB_URL } from '../helpers/db.js';

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

  it('looks up balances in one batched query, not one per user', async () => {
    const actor = await makeUser('operator@example.com');
    const members = await Promise.all([
      makeUser('member0@example.com'),
      makeUser('member1@example.com'),
      makeUser('member2@example.com'),
    ]);
    for (const [i, member] of members.entries()) {
      await testDb.creditLot.create({
        data: {
          userId: member.id,
          kind: 'PURCHASED',
          source: 'PURCHASE',
          amountGranted: 100 * (i + 1),
          amountRemaining: 100 * (i + 1),
          expiresAt: null,
        },
      });
    }
    const token = await tokenFor(actor.id);

    // A separate PrismaClient with query-event logging, rather than spying on
    // the shared `testDb`'s prototype methods — Prisma's model delegates are
    // not plain own-properties, so `vi.spyOn(...).mockRestore()` on one can
    // leave `findMany` broken for every later test sharing `testDb`.
    const queryingDb = new PrismaClient({
      datasources: { db: { url: TEST_DB_URL } },
      log: [{ emit: 'event', level: 'query' }],
    });
    let creditLotQueries = 0;
    queryingDb.$on('query' as never, (e: { query: string }) => {
      if (e.query.includes('"CreditLot"')) creditLotQueries++;
    });
    const queryingApp = express();
    queryingApp.use(express.json());
    queryingApp.use(adminUsersRoutes(queryingDb));

    const res = await request(queryingApp).get('/users').set(auth(token)).expect(200);
    await queryingDb.$disconnect();
    expect(creditLotQueries).toBe(1);

    const body = res.body as {
      users: { id: string; balance: { plan: number; purchased: number } }[];
    };
    for (const [i, member] of members.entries()) {
      const found = body.users.find((u) => u.id === member.id);
      expect(found?.balance).toEqual({ plan: 0, purchased: 100 * (i + 1) });
    }
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

  it('records the true immediately-preceding state under concurrent updates, not a stale one', async () => {
    const actor = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com', { isOperator: false });

    // Direct service calls, not two HTTP round trips: each `request(app)` call
    // spins up its own ephemeral supertest server, and that latency is enough
    // to accidentally serialize the two requests instead of racing them.
    await Promise.allSettled([
      updateUser(testDb, { operatorId: actor.id, userId: target.id, isOperator: true }),
      updateUser(testDb, { operatorId: actor.id, userId: target.id, isOperator: false }),
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'User', subjectId: target.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.length).toBe(2);
    const [first, second] = entries as unknown as [
      { before: { isOperator: boolean }; after: { isOperator: boolean } },
      { before: { isOperator: boolean }; after: { isOperator: boolean } },
    ];
    // Whatever the second write's `before` claims, it must be what the first
    // write actually left behind — not both reading the row's original value.
    expect(second.before.isOperator).toBe(first.after.isOperator);
  });
});
