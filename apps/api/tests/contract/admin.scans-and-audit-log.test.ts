/**
 * GET /admin/scans, GET /admin/audit-log — operator visibility into real
 * scans and the append-only audit log. Both pages this backs
 * (admin/scans/page.tsx, admin/log/page.tsx) shipped as Server Components
 * rendering hardcoded placeholder rows; this closes that gap.
 *
 * Not mounted under `/admin` and not behind `requireOperator` yet in this
 * suite (T211's job — see the routers' own module notes), matching every
 * sibling admin contract test's own convention.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminScansRoutes } from '../../src/routes/admin/scans.routes.js';
import { adminAuditLogRoutes } from '../../src/routes/admin/audit-log.routes.js';
import { recordAuditLog } from '../../src/services/admin/audit-log.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminScansRoutes(testDb));
  app.use(adminAuditLogRoutes(testDb));
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

async function makeUser(email: string) {
  return testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
}

async function makeTarget(userId: string, displayName: string) {
  return testDb.target.create({
    data: { userId, inputType: 'URL', canonicalValue: displayName, displayName },
  });
}

beforeEach(resetDb);
afterAll(closeDb);

describe('GET /admin/scans', () => {
  it('lists real scans with the user email and target name', async () => {
    const operator = await makeUser('operator@example.com');
    const customer = await makeUser('customer@example.com');
    const target = await makeTarget(customer.id, 'example.com');
    const scan = await testDb.scan.create({
      data: {
        userId: customer.id,
        targetId: target.id,
        state: 'COMPLETED',
        requestedModules: ['SECURITY'],
        capabilitySnapshot: [],
        quotedCredits: 20,
        chargedCredits: 20,
        overallScore: 88,
      },
    });
    const token = await tokenFor(operator.id);

    const res = await request(app).get('/scans').set(auth(token)).expect(200);
    const body = res.body as {
      scans: {
        id: string;
        userEmail: string;
        targetDisplayName: string;
        state: string;
        overallScore: number | null;
      }[];
      total: number;
    };

    expect(body.total).toBe(1);
    const found = body.scans.find((s) => s.id === scan.id);
    expect(found?.userEmail).toBe('customer@example.com');
    expect(found?.targetDisplayName).toBe('example.com');
    expect(found?.state).toBe('COMPLETED');
    expect(found?.overallScore).toBe(88);
  });

  it('paginates with limit/offset', async () => {
    const operator = await makeUser('operator@example.com');
    const customer = await makeUser('customer@example.com');
    for (let i = 0; i < 3; i++) {
      const target = await makeTarget(customer.id, `site${String(i)}.example`);
      await testDb.scan.create({
        data: {
          userId: customer.id,
          targetId: target.id,
          state: 'QUEUED',
          requestedModules: ['SECURITY'],
          capabilitySnapshot: [],
          quotedCredits: 20,
        },
      });
    }
    const token = await tokenFor(operator.id);

    const res = await request(app).get('/scans').query({ limit: 2, offset: 1 }).set(auth(token)).expect(200);
    const body = res.body as { scans: unknown[]; total: number; limit: number; offset: number };
    expect(body.scans.length).toBe(2);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(2);
    expect(body.offset).toBe(1);
  });
});

describe('GET /admin/audit-log', () => {
  it('lists real audit entries with the actor email resolved', async () => {
    const operator = await makeUser('operator@example.com');
    const target = await makeUser('member@example.com');
    await recordAuditLog(testDb, {
      actorId: operator.id,
      action: 'user.update',
      subjectType: 'User',
      subjectId: target.id,
      before: { isOperator: false },
      after: { isOperator: true },
    });
    const token = await tokenFor(operator.id);

    const res = await request(app).get('/audit-log').set(auth(token)).expect(200);
    const body = res.body as {
      entries: {
        actorEmail: string | null;
        action: string;
        subjectType: string;
        subjectId: string | null;
      }[];
      total: number;
    };

    expect(body.total).toBe(1);
    expect(body.entries[0]?.actorEmail).toBe('operator@example.com');
    expect(body.entries[0]?.action).toBe('user.update');
    expect(body.entries[0]?.subjectType).toBe('User');
    expect(body.entries[0]?.subjectId).toBe(target.id);
  });

  it('resolves a since-deleted actor to a null email rather than failing', async () => {
    const operator = await makeUser('operator@example.com');
    await recordAuditLog(testDb, {
      actorId: 'no-longer-exists',
      action: 'plan.update',
      subjectType: 'Plan',
      subjectId: 'free',
    });
    const token = await tokenFor(operator.id);

    const res = await request(app).get('/audit-log').set(auth(token)).expect(200);
    const body = res.body as { entries: { actorEmail: string | null; action: string }[] };
    const found = body.entries.find((e) => e.action === 'plan.update');
    expect(found?.actorEmail).toBeNull();
  });

  it('paginates with limit/offset, newest first', async () => {
    const operator = await makeUser('operator@example.com');
    for (let i = 0; i < 3; i++) {
      await recordAuditLog(testDb, {
        actorId: operator.id,
        action: `test.action.${String(i)}`,
        subjectType: 'Test',
      });
    }
    const token = await tokenFor(operator.id);

    const res = await request(app).get('/audit-log').query({ limit: 1, offset: 0 }).set(auth(token)).expect(200);
    const body = res.body as { entries: { action: string }[]; total: number };
    expect(body.total).toBe(3);
    expect(body.entries.length).toBe(1);
    expect(body.entries[0]?.action).toBe('test.action.2');
  });
});
