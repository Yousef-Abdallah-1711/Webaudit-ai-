/**
 * T208 — GET/PATCH /admin/providers (FR-087: "Operators MUST be able to
 * configure AI providers and their fallback order").
 *
 * Same not-yet-mounted, not-yet-`requireOperator`-gated setup as every other
 * file in this directory — see admin.capabilities.test.ts's header.
 *
 * See providers.service.ts's module note for the real, honest scope of what
 * a PATCH here achieves: it persists the operator's declared chain, validated
 * with the REAL `buildChain` guard from `@webaudit/ai-executor` (the same
 * function `createExecutorFromEnv` uses at boot), so a genuinely broken
 * configuration is refused here with the same reasoning it would get at
 * deploy time. It does NOT make a running worker use this chain — no such
 * live-reconfiguration mechanism exists yet.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminProvidersRoutes } from '../../src/routes/admin/providers.routes.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminProvidersRoutes(testDb));
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

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('GET /providers', () => {
  it('returns an empty chain when nothing has been configured yet', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app).get('/providers').set(auth(token)).expect(200);
    const body = res.body as { chain: unknown[] };
    expect(body.chain).toEqual([]);
  });

  it('returns the configured chain in position order', async () => {
    const { token } = await makeOperatorToken();
    await testDb.providerChainEntry.createMany({
      data: [
        { vendor: 'openai', model: 'gpt-4o', position: 1, isEnabled: true },
        { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0, isEnabled: true },
      ],
    });

    const res = await request(app).get('/providers').set(auth(token)).expect(200);
    const body = res.body as { chain: { vendor: string; model: string; position: number }[] };
    expect(body.chain.map((e) => e.vendor)).toEqual(['anthropic', 'openai']);
    expect(body.chain.map((e) => e.position)).toEqual([0, 1]);
  });
});

describe('PATCH /providers', () => {
  it('replaces the chain with a valid two-vendor configuration, in order', async () => {
    const { token, actorId } = await makeOperatorToken();

    const res = await request(app)
      .patch('/providers')
      .set(auth(token))
      .send({
        chain: [
          { vendor: 'anthropic', model: 'claude-3-5-sonnet' },
          { vendor: 'openai', model: 'gpt-4o' },
        ],
      })
      .expect(200);
    const body = res.body as { chain: { vendor: string; model: string; position: number }[] };
    expect(body.chain).toEqual([
      { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0, isEnabled: true },
      { vendor: 'openai', model: 'gpt-4o', position: 1, isEnabled: true },
    ]);

    const rows = await testDb.providerChainEntry.findMany({ orderBy: { position: 'asc' } });
    expect(rows.map((r) => ({ vendor: r.vendor, model: r.model, position: r.position }))).toEqual([
      { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0 },
      { vendor: 'openai', model: 'gpt-4o', position: 1 },
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'ProviderChain', action: 'providers.chain_replace' },
    });
    expect(entries.length).toBe(1);
    expect(entries[0]?.actorId).toBe(actorId);
  });

  it('rejects a single-vendor chain, surfacing the real buildChain two-vendor reasoning, and persists nothing', async () => {
    const { token } = await makeOperatorToken();

    const res = await request(app)
      .patch('/providers')
      .set(auth(token))
      .send({
        chain: [
          { vendor: 'anthropic', model: 'claude-3-5-sonnet' },
          { vendor: 'anthropic', model: 'claude-3-opus' },
        ],
      })
      .expect(400);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_PROVIDER_CHAIN');
    expect(body.error.message).toMatch(/at least 2/);
    expect(body.error.message).toMatch(/Principle IV/);

    const rows = await testDb.providerChainEntry.findMany();
    expect(rows.length).toBe(0);
  });

  it('leaves a pre-existing valid chain completely untouched when a replacement is rejected', async () => {
    const { token } = await makeOperatorToken();
    await testDb.providerChainEntry.createMany({
      data: [
        { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0 },
        { vendor: 'openai', model: 'gpt-4o', position: 1 },
      ],
    });

    await request(app)
      .patch('/providers')
      .set(auth(token))
      .send({
        chain: [
          { vendor: 'google', model: 'gemini-1.5-pro' },
          { vendor: 'google', model: '   ' },
        ],
      })
      .expect(400);

    // The rejected attempt must not touch the previously-configured chain at
    // all -- not delete it, not partially overwrite it, not reorder it.
    const rows = await testDb.providerChainEntry.findMany({ orderBy: { position: 'asc' } });
    expect(rows.map((r) => ({ vendor: r.vendor, model: r.model, position: r.position }))).toEqual([
      { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0 },
      { vendor: 'openai', model: 'gpt-4o', position: 1 },
    ]);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'ProviderChain' },
    });
    expect(entries.length).toBe(0);
  });

  it('rejects a chain with a blank model, surfacing buildChain\'s own message, and persists nothing', async () => {
    const { token } = await makeOperatorToken();

    const res = await request(app)
      .patch('/providers')
      .set(auth(token))
      .send({
        chain: [
          { vendor: 'anthropic', model: 'claude-3-5-sonnet' },
          { vendor: 'openai', model: '   ' },
        ],
      })
      .expect(400);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('INVALID_PROVIDER_CHAIN');
    expect(body.error.message).toMatch(/declares no model/);

    const rows = await testDb.providerChainEntry.findMany();
    expect(rows.length).toBe(0);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'ProviderChain' },
    });
    expect(entries.length).toBe(0);
  });

  it('replaces a previously-valid chain entirely (replace-the-set semantics)', async () => {
    const { token } = await makeOperatorToken();
    await testDb.providerChainEntry.createMany({
      data: [
        { vendor: 'anthropic', model: 'claude-3-5-sonnet', position: 0 },
        { vendor: 'openai', model: 'gpt-4o', position: 1 },
      ],
    });

    await request(app)
      .patch('/providers')
      .set(auth(token))
      .send({
        chain: [
          { vendor: 'google', model: 'gemini-1.5-pro' },
          { vendor: 'openai', model: 'gpt-4o-mini', isEnabled: false },
        ],
      })
      .expect(200);

    const rows = await testDb.providerChainEntry.findMany({ orderBy: { position: 'asc' } });
    expect(rows.map((r) => ({ vendor: r.vendor, model: r.model, isEnabled: r.isEnabled }))).toEqual([
      { vendor: 'google', model: 'gemini-1.5-pro', isEnabled: true },
      { vendor: 'openai', model: 'gpt-4o-mini', isEnabled: false },
    ]);
  });

  it('rejects a malformed body with 400', async () => {
    const { token } = await makeOperatorToken();
    await request(app).patch('/providers').set(auth(token)).send({ chain: 'nope' }).expect(400);
  });
});
