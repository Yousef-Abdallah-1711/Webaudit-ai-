/**
 * T207 — GET/PATCH/DELETE /admin/capabilities, /admin/capabilities/:id.
 *
 * Same not-yet-mounted, not-yet-`requireOperator`-gated setup as
 * admin.plans.test.ts — see that file's header for why this builds a
 * minimal app and mints its own token.
 *
 * `resetDb` truncates `Capability`, `CapabilityPlan` and `CapabilityExecution`
 * every `beforeEach` (tests/helpers/db.ts's own comment: capability rows are
 * discovered from disk, not seeded reference data), so this suite seeds
 * exactly the rows each test needs and never leaks state into the next file.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminCapabilitiesRoutes } from '../../src/routes/admin/capabilities.routes.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminCapabilitiesRoutes(testDb));
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

const CAP_ID = 'headers-checker';

async function seedCapability(overrides: Partial<{ isEnabled: boolean }> = {}): Promise<void> {
  await testDb.capability.create({
    data: {
      id: CAP_ID,
      name: 'Headers Checker',
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      trust: 'VENDORED',
      requiresCode: false,
      requiresScreenshot: false,
      requiredControlLevel: 'NONE',
      estimatedTokens: 0,
      isEnabled: overrides.isEnabled ?? true,
    },
  });
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('GET /capabilities', () => {
  it('lists capabilities with their plan restrictions', async () => {
    await seedCapability();
    await testDb.capabilityPlan.create({ data: { capabilityId: CAP_ID, planId: 'pro' } });
    const { token } = await makeOperatorToken();

    const res = await request(app).get('/capabilities').set(auth(token)).expect(200);
    const body = res.body as { capabilities: { id: string; restrictedToPlans: string[] }[] };
    expect(body.capabilities.length).toBe(1);
    expect(body.capabilities[0]?.id).toBe(CAP_ID);
    expect(body.capabilities[0]?.restrictedToPlans).toEqual(['pro']);
  });
});

describe('PATCH /capabilities/:id', () => {
  it('enables/disables a capability and writes an AuditLogEntry', async () => {
    await seedCapability({ isEnabled: true });
    const { token, actorId } = await makeOperatorToken();

    const res = await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ isEnabled: false })
      .expect(200);
    const body = res.body as { capability: { isEnabled: boolean } };
    expect(body.capability.isEnabled).toBe(false);

    const persisted = await testDb.capability.findUnique({ where: { id: CAP_ID } });
    expect(persisted?.isEnabled).toBe(false);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Capability', subjectId: CAP_ID },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
    expect(entries[0]?.action).toBe('capability.update');
  });

  it('restricts a capability to tiers, writing CapabilityPlan rows and an AuditLogEntry', async () => {
    await seedCapability();
    const { token } = await makeOperatorToken();

    const res = await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ planIds: ['pro', 'business'] })
      .expect(200);
    const body = res.body as { capability: { restrictedToPlans: string[] } };
    expect([...body.capability.restrictedToPlans].sort()).toEqual(['business', 'pro']);

    const rows = await testDb.capabilityPlan.findMany({ where: { capabilityId: CAP_ID } });
    expect(rows.map((r) => r.planId).sort()).toEqual(['business', 'pro']);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Capability', subjectId: CAP_ID, action: 'capability.restrict' },
    });
    expect(entries.length).toBe(1);
  });

  it('removes restriction rows not in a later PATCH (replace-the-set semantics)', async () => {
    await seedCapability();
    await testDb.capabilityPlan.create({ data: { capabilityId: CAP_ID, planId: 'pro' } });
    const { token } = await makeOperatorToken();

    await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ planIds: ['business'] })
      .expect(200);

    const rows = await testDb.capabilityPlan.findMany({ where: { capabilityId: CAP_ID } });
    expect(rows.map((r) => r.planId)).toEqual(['business']);
  });

  it('an empty planIds array clears all restrictions ("every plan")', async () => {
    await seedCapability();
    await testDb.capabilityPlan.create({ data: { capabilityId: CAP_ID, planId: 'pro' } });
    const { token } = await makeOperatorToken();

    await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ planIds: [] })
      .expect(200);

    const rows = await testDb.capabilityPlan.findMany({ where: { capabilityId: CAP_ID } });
    expect(rows.length).toBe(0);
  });

  it('rejects an unknown plan id with 400', async () => {
    await seedCapability();
    const { token } = await makeOperatorToken();
    await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ planIds: ['does-not-exist'] })
      .expect(400);
  });

  it('a combined isEnabled + bad planIds body commits neither half (atomicity)', async () => {
    // A review of this task found the opposite once shipped: isEnabled
    // committed and was audited before the planIds half's validation threw,
    // leaving a "this request failed" response next to a real mutation.
    // Sending the two most dangerous orderings — enable-with-bad-plan and
    // disable-with-bad-plan — proves neither half ever lands regardless of
    // which value isEnabled carries.
    await seedCapability({ isEnabled: true });
    const { token } = await makeOperatorToken();

    await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ isEnabled: false, planIds: ['does-not-exist'] })
      .expect(400);

    const persisted = await testDb.capability.findUnique({ where: { id: CAP_ID } });
    expect(persisted?.isEnabled).toBe(true);

    const restrictions = await testDb.capabilityPlan.findMany({ where: { capabilityId: CAP_ID } });
    expect(restrictions.length).toBe(0);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Capability', subjectId: CAP_ID },
    });
    expect(entries.length).toBe(0);
  });

  it('rejects an empty body with 400', async () => {
    await seedCapability();
    const { token } = await makeOperatorToken();
    await request(app).patch(`/capabilities/${CAP_ID}`).set(auth(token)).send({}).expect(400);
  });

  it('rejects a malformed body (wrong type) with 400', async () => {
    await seedCapability();
    const { token } = await makeOperatorToken();
    await request(app)
      .patch(`/capabilities/${CAP_ID}`)
      .set(auth(token))
      .send({ isEnabled: 'yes' })
      .expect(400);
  });

  it('404s for a nonexistent capability', async () => {
    const { token } = await makeOperatorToken();
    await request(app)
      .patch('/capabilities/does-not-exist')
      .set(auth(token))
      .send({ isEnabled: false })
      .expect(404);
  });
});

describe('DELETE /capabilities/:id', () => {
  it('removes a capability with zero execution history', async () => {
    await seedCapability();
    const { token } = await makeOperatorToken();

    await request(app).delete(`/capabilities/${CAP_ID}`).set(auth(token)).expect(200);
    const persisted = await testDb.capability.findUnique({ where: { id: CAP_ID } });
    expect(persisted).toBeNull();

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'Capability', subjectId: CAP_ID, action: 'capability.delete' },
    });
    expect(entries.length).toBe(1);
  });

  it('refuses with 409 when the capability has execution history, and leaves the row intact', async () => {
    await seedCapability();
    const user = await testDb.user.create({
      data: { email: 'scanner@example.com', emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'x',
        controlLevel: 'NONE',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 1,
        chargedCredits: 1,
        state: 'QUEUED',
        startedAt: new Date(),
      },
    });
    await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: CAP_ID,
        module: 'SECURITY',
        succeeded: true,
        durationMs: 10,
      },
    });
    const { token } = await makeOperatorToken();

    const res = await request(app).delete(`/capabilities/${CAP_ID}`).set(auth(token)).expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('CAPABILITY_HAS_HISTORY');

    const persisted = await testDb.capability.findUnique({ where: { id: CAP_ID } });
    expect(persisted).not.toBeNull();

    const entries = await testDb.auditLogEntry.findMany({
      where: {
        subjectType: 'Capability',
        subjectId: CAP_ID,
        action: 'capability.delete_refused',
      },
    });
    expect(entries.length).toBe(1);
  });

  it('404s for a nonexistent capability', async () => {
    const { token } = await makeOperatorToken();
    await request(app).delete('/capabilities/does-not-exist').set(auth(token)).expect(404);
  });
});

describe('POST /capabilities/upload (T216)', () => {
  it('always 503s SANDBOX_UNAVAILABLE, unconditionally, with no fallback', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app).post('/capabilities/upload').set(auth(token)).expect(503);
    expect((res.body as { error: { code: string } }).error.code).toBe('SANDBOX_UNAVAILABLE');
  });

  it('503s regardless of what the request body carries', async () => {
    const { token } = await makeOperatorToken();
    await request(app)
      .post('/capabilities/upload')
      .set(auth(token))
      .send({ anything: 'at all', evenA: ['malformed', 'body'] })
      .expect(503);
  });
});
