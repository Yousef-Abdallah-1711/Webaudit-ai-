import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminAuditLogRoutes } from '../../src/routes/admin/audit-log.routes.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

const app = express();
app.use(adminAuditLogRoutes(testDb));
async function token(userId: string): Promise<string> {
  return new SignJWT({ isOperator: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(env.accessSecret);
}

beforeEach(async () => {
  await resetDb();
});
afterAll(closeDb);

describe('GET /audit-log filters', () => {
  it('applies action, actor, search, and date filters to the database query', async () => {
    const actor = await testDb.user.create({ data: { email: 'audit-filter@example.com' } });
    await testDb.auditLogEntry.createMany({
      data: [
        {
          actorId: actor.id,
          action: 'plan.create',
          subjectType: 'Plan',
          subjectId: 'starter',
          createdAt: new Date('2026-01-02T00:00:00Z'),
        },
        {
          actorId: 'other-actor',
          action: 'user.delete',
          subjectType: 'User',
          subjectId: 'gone',
          createdAt: new Date('2026-02-02T00:00:00Z'),
        },
      ],
    });
    const auth = { Authorization: `Bearer ${await token(actor.id)}` };
    const response = await request(app)
      .get('/audit-log')
      .query({
        action: 'plan.create',
        actorId: actor.id,
        search: 'starter',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-31T23:59:59.999Z',
      })
      .set(auth)
      .expect(200);
    expect(response.body.total).toBe(1);
    expect(response.body.entries[0].action).toBe('plan.create');
  });

  it(
    'filters by exact subjectId — P4-T5 (master plan): a user-scoped audit trail, not a ' +
      'substring match that could over-match another subject entirely',
    async () => {
      const actor = await testDb.user.create({ data: { email: 'audit-subject@example.com' } });
      await testDb.auditLogEntry.createMany({
        data: [
          { actorId: actor.id, action: 'plan.assign', subjectType: 'User', subjectId: 'user-1' },
          { actorId: actor.id, action: 'credits.adjust', subjectType: 'User', subjectId: 'user-1' },
          // Same action, different subject — must not appear in a subjectId=user-1 query,
          // and a naive substring `search` for "user-1" would also wrongly match "user-10".
          { actorId: actor.id, action: 'plan.assign', subjectType: 'User', subjectId: 'user-10' },
        ],
      });
      const auth = { Authorization: `Bearer ${await token(actor.id)}` };
      const response = await request(app)
        .get('/audit-log')
        .query({ subjectId: 'user-1' })
        .set(auth)
        .expect(200);
      expect(response.body.total).toBe(2);
      const subjectIds = (response.body.entries as { subjectId: string }[]).map((e) => e.subjectId);
      expect(subjectIds.every((id) => id === 'user-1')).toBe(true);
    },
  );
});
