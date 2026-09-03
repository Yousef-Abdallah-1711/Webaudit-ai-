/**
 * T206 — GET /admin/margin, from contracts/http-api.md's Administration
 * section: "FR-085. Per scan, area, capability."
 *
 * Same not-yet-mounted, not-yet-`requireOperator`-gated setup as
 * admin.plans.test.ts — see that file's header for why this builds a
 * minimal app and mints its own token. The adversarial attribution proof
 * itself (SC-009) lives in tests/integration/margin-attribution.test.ts,
 * against the service directly; this file only proves the route wires the
 * service correctly and returns the expected shape over real seeded data.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { env } from '../../src/config/env.js';
import { adminMarginRoutes } from '../../src/routes/admin/margin.routes.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(adminMarginRoutes(testDb));
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

async function makeOperatorToken(): Promise<{ token: string }> {
  const actor = await testDb.user.create({
    data: { email: 'margin-operator@example.com', emailVerifiedAt: new Date() },
  });
  return { token: await tokenFor(actor.id) };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('GET /margin', () => {
  it('returns revenue/cost aggregated per scan, per area, and per capability', async () => {
    const { token } = await makeOperatorToken();

    const owner = await testDb.user.create({
      data: { email: 'margin-route-owner@example.com', emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: owner.id,
        inputType: 'URL',
        canonicalValue: 'https://margin-route.example.com',
        displayName: 'margin route target',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: owner.id,
        targetId: target.id,
        requestedModules: ['SEO'],
        capabilitySnapshot: {},
        quotedCredits: 40,
        chargedCredits: 40,
        state: 'COMPLETED',
      },
    });
    const capability = await testDb.capability.create({
      data: {
        id: 'meta-tags-checker',
        name: 'Meta Tags Checker',
        version: '1.0.0',
        module: 'SEO',
        layer: 'CODE',
        trust: 'VENDORED',
      },
    });
    await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: capability.id,
        module: 'SEO',
        succeeded: true,
        durationMs: 30,
        costMicros: 250_000,
      },
    });

    const res = await request(app).get('/margin').set(auth(token)).expect(200);
    const body = res.body as {
      report: {
        window: { from: string; to: string };
        perScan: { scanId: string; chargedCredits: number; costMicros: number }[];
        perArea: { module: string; chargedCredits: number; costMicros: number }[];
        perCapability: {
          capabilityId: string;
          capabilityName: string;
          costMicros: number;
          executionCount: number;
        }[];
        note: string;
      };
    };

    const scanRow = body.report.perScan.find((r) => r.scanId === scan.id);
    expect(scanRow?.chargedCredits).toBe(40);
    expect(scanRow?.costMicros).toBe(250_000);

    const areaRow = body.report.perArea.find((r) => r.module === 'SEO');
    expect(areaRow?.costMicros).toBe(250_000);

    const capRow = body.report.perCapability.find((r) => r.capabilityId === 'meta-tags-checker');
    expect(capRow?.capabilityName).toBe('Meta Tags Checker');
    expect(capRow?.costMicros).toBe(250_000);
    expect(capRow?.executionCount).toBe(1);

    expect(typeof body.report.note).toBe('string');
    expect(body.report.note.length).toBeGreaterThan(0);
  });

  it('rejects an invalid date range with 400', async () => {
    const { token } = await makeOperatorToken();
    await request(app).get('/margin').query({ from: 'not-a-date' }).set(auth(token)).expect(400);
  });
});
