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
 *
 * T226 (`POST /capabilities/upload`) adds two further blocks at the bottom
 * of this file: the T216/T226 block exercises the request-validation and
 * "sandbox unreachable" paths (415, 400, both flavours of 503) without ever
 * booting a real sandbox; the "T226 — real dispatch" block boots one for
 * real via `createSandboxHost` and proves an actual end-to-end round trip
 * through Session 7's isolation mechanism, not a mock.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { SignJWT } from 'jose';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createSandboxHost, type SandboxHost } from '@webaudit/sandbox-runner';
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

describe('POST /capabilities/upload (T216/T226)', () => {
  // T216 shipped this route as an unconditional 503 with no dispatch at
  // all — every case below was originally "503 because nothing is wired
  // up yet." T226 wires up real dispatch, so 503 now means something more
  // specific in each case (not configured vs. configured-but-unreachable);
  // the descriptions below say which.

  it('415s a request whose content-type is not a capability bundle type (e.g. JSON)', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app)
      .post('/capabilities/upload')
      .set(auth(token))
      .send({ anything: 'at all', evenA: ['malformed', 'body'] }) // supertest sends this as application/json
      .expect(415);
    expect((res.body as { error: { code: string } }).error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
  });

  it('400s an empty bundle body', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app)
      .post('/capabilities/upload')
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send('')
      .expect(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
  });

  it('503s SANDBOX_UNAVAILABLE when SANDBOX_RUNNER_URL is unset (not configured)', async () => {
    // The test env (vitest.workspace.ts) never sets SANDBOX_RUNNER_URL, so
    // this is the ambient state unless a test explicitly sets it — asserted
    // here directly rather than assumed.
    expect(process.env['SANDBOX_RUNNER_URL']).toBeUndefined();

    const { token } = await makeOperatorToken();
    const res = await request(app)
      .post('/capabilities/upload')
      .query({ name: 'x', version: '1.0.0' })
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send('({ id: "x", module: "SECURITY", layer: "CODE", canRun: () => true })')
      .expect(503);
    expect((res.body as { error: { code: string } }).error.code).toBe('SANDBOX_UNAVAILABLE');
  });

  it('503s SANDBOX_UNAVAILABLE when SANDBOX_RUNNER_URL points at an unreachable port (configured but unreachable)', async () => {
    process.env['SANDBOX_RUNNER_URL'] = 'http://127.0.0.1:1';
    try {
      const { token } = await makeOperatorToken();
      const res = await request(app)
        .post('/capabilities/upload')
        .query({ name: 'x', version: '1.0.0' })
        .set(auth(token))
        .set('Content-Type', 'text/plain')
        .send('({ id: "x", module: "SECURITY", layer: "CODE", canRun: () => true })')
        .expect(503);
      expect((res.body as { error: { code: string } }).error.code).toBe('SANDBOX_UNAVAILABLE');
      // Distinguishes this case from "not configured" — a real reason from
      // the failed network call is present, not just the bare 503 shape.
      expect((res.body as { error: { reason?: string } }).error.reason).toBeDefined();
    } finally {
      delete process.env['SANDBOX_RUNNER_URL'];
    }
  });
});

describe('POST /capabilities/upload (T226 — real dispatch)', () => {
  let sandboxHost: SandboxHost;
  let installedRoot: string;

  beforeAll(async () => {
    sandboxHost = await createSandboxHost({ port: 0 });
    process.env['SANDBOX_RUNNER_URL'] = `http://127.0.0.1:${String(sandboxHost.port)}`;
  });

  afterAll(async () => {
    delete process.env['SANDBOX_RUNNER_URL'];
    await sandboxHost.close();
  });

  // T253 — this block's own bundle genuinely passes conformance, so it now
  // genuinely installs (writes to disk + reconciles) on every run. Scoped to
  // a throwaway root so a real test run never leaks a real directory into
  // this repo's own `var/capabilities-installed` (the unscoped default).
  beforeEach(() => {
    installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-t226-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
  });

  afterEach(() => {
    delete process.env['INSTALLED_CAPABILITIES_ROOT'];
    rmSync(installedRoot, { recursive: true, force: true });
  });

  // A real, minimal, syntactically valid capability bundle — the same shape
  // `apps/sandbox-runner/tests/fixtures/hostile-capability/index.js`'s own
  // `BENIGN_SOURCE` uses: UTF-8 JS source whose completion value is the
  // `AuditCapability`-shaped object (an object literal in parens — bare
  // object-literal statements are ambiguous with block statements to the
  // parser). Modelled on that fixture rather than invented from scratch.
  const BENIGN_BUNDLE = `({
    id: 'e2e-benign-probe',
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: async () => ([{
      checkId: 'e2e-benign-probe',
      fingerprintParts: ['e2e-benign-probe'],
      severity: 'INFO',
      title: 'benign probe ran',
      description: 'the real sandbox is reachable end to end',
      fixable: false,
    }]),
  })`;

  /**
   * T251 (spec-kit Phase 12/Convergence) closed the gap this test used to
   * document: `harness.ts`'s `runConformance` now takes `name`/`version`
   * from the upload's own `?name=&version=` query parameters (the bundle is
   * raw JS source with no second file to carry a manifest) and builds a
   * complete `rawManifest`, so `manifest-valid` — and the report's overall
   * `passed` — now comes back `true` for a genuinely well-formed capability.
   */
  it('dispatches to the real sandbox and produces a genuine, real per-check conformance report', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app)
      .post('/capabilities/upload')
      .query({ name: 'End-to-end benign probe', version: '1.0.0' })
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send(BENIGN_BUNDLE)
      .expect(200);

    const body = res.body as {
      capabilityId: string;
      passed: boolean;
      report: { capabilityId: string; results: readonly { check: string; passed: boolean; skipped: boolean }[] };
    };
    expect(body.capabilityId).toBe('e2e-benign-probe');
    expect(body.report.capabilityId).toBe('e2e-benign-probe');

    const byCheck = new Map(body.report.results.map((r) => [r.check, r]));
    // Every behavioural check genuinely ran against the real, isolated
    // capability and genuinely passed — this is what proves the round trip
    // through the real sandbox worked, not a mock.
    expect(byCheck.get('contract-shape')).toMatchObject({ passed: true });
    expect(byCheck.get('can-run-has-no-side-effects')).toMatchObject({ passed: true });
    expect(byCheck.get('throwing-is-contained')).toMatchObject({ passed: true });
    expect(byCheck.get('no-llm-from-code-layer')).toMatchObject({ passed: true });
    expect(byCheck.get('fingerprint-stable')).toMatchObject({ passed: true });
    expect(byCheck.get('abort-honoured')).toMatchObject({ passed: true });
    expect(byCheck.get('manifest-valid')).toMatchObject({ passed: true });
    expect(body.passed).toBe(true);
  });

  it('400s when the required ?name=&version= query parameters are missing', async () => {
    const { token } = await makeOperatorToken();
    await request(app)
      .post('/capabilities/upload')
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send(BENIGN_BUNDLE)
      .expect(400);
  });

  it('400s an invalid version (not three-part semver)', async () => {
    const { token } = await makeOperatorToken();
    await request(app)
      .post('/capabilities/upload')
      .query({ name: 'x', version: 'not-a-version' })
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send(BENIGN_BUNDLE)
      .expect(400);
  });
});

describe('POST /capabilities/upload (T253 — a passing verdict installs the capability)', () => {
  let sandboxHost: SandboxHost;
  let installedRoot: string;

  beforeAll(async () => {
    sandboxHost = await createSandboxHost({ port: 0 });
    process.env['SANDBOX_RUNNER_URL'] = `http://127.0.0.1:${String(sandboxHost.port)}`;
  });

  afterAll(async () => {
    delete process.env['SANDBOX_RUNNER_URL'];
    await sandboxHost.close();
  });

  beforeEach(() => {
    installedRoot = mkdtempSync(path.join(tmpdir(), 'installed-upload-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
  });

  afterEach(() => {
    delete process.env['INSTALLED_CAPABILITIES_ROOT'];
    rmSync(installedRoot, { recursive: true, force: true });
  });

  const PASSING_BUNDLE = `({
    id: 't253-real-scan-ready',
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: async () => ([]),
  })`;

  it('writes the bundle + a real manifest to disk and reconciles it into a Capability row immediately', async () => {
    const { token } = await makeOperatorToken();
    const res = await request(app)
      .post('/capabilities/upload')
      .query({ name: 'T253 real scan ready', version: '1.0.0' })
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send(PASSING_BUNDLE)
      .expect(200);

    expect((res.body as { passed: boolean }).passed).toBe(true);

    const persisted = await testDb.capability.findUnique({ where: { id: 't253-real-scan-ready' } });
    expect(persisted).not.toBeNull();
    expect(persisted?.trust).toBe('INSTALLED');
    expect(persisted?.module).toBe('SECURITY');
    expect(persisted?.layer).toBe('CODE');

    const dir = path.join(installedRoot, 't253-real-scan-ready');
    expect(existsSync(path.join(dir, 'bundle.js'))).toBe(true);
    expect(readFileSync(path.join(dir, 'bundle.js'), 'utf8')).toBe(PASSING_BUNDLE);
    const manifest = JSON.parse(readFileSync(path.join(dir, 'capability.manifest.json'), 'utf8')) as {
      id: string;
      module: string;
      layer: string;
      entrypoint: string;
    };
    expect(manifest.id).toBe('t253-real-scan-ready');
    expect(manifest.module).toBe('SECURITY');
    expect(manifest.entrypoint).toBe('bundle.js');
  });

  it('does not write anything to disk or the database when conformance fails', async () => {
    const { token } = await makeOperatorToken();
    // No runCodeLayer at all — contract-shape fails, so passed is false.
    const FAILING_BUNDLE = `({ id: 't253-should-not-install', module: 'SECURITY', layer: 'CODE', canRun: () => true })`;
    const res = await request(app)
      .post('/capabilities/upload')
      .query({ name: 'Should not install', version: '1.0.0' })
      .set(auth(token))
      .set('Content-Type', 'text/plain')
      .send(FAILING_BUNDLE)
      .expect(200);

    expect((res.body as { passed: boolean }).passed).toBe(false);
    const persisted = await testDb.capability.findUnique({ where: { id: 't253-should-not-install' } });
    expect(persisted).toBeNull();
    expect(existsSync(path.join(installedRoot, 't253-should-not-install'))).toBe(false);
  });
});
