/**
 * T254/T255 — full-stack lifecycle e2e.
 *
 * Every other test covering this phase proves one slice in isolation:
 * `admin.capabilities.test.ts` drives the HTTP request/response shapes
 * through a bare `adminCapabilitiesRoutes` app that never mounts
 * `requireAuth`/`requireOperator` (its own header comment says so
 * explicitly); `installed-capability-dispatch.test.ts` proves a real worker
 * phase dispatches a real installed capability, but from a bundle the test
 * writes to disk by hand, never through the real upload endpoint.
 *
 * Nothing before this test proves the two compose end to end: that a
 * capability an operator genuinely uploads through the real, fully-guarded
 * HTTP API (`startApi`, with `requireAuth` and `requireOperator` both live)
 * is the exact thing a real worker phase later dispatches through a real
 * `sandbox-runner`, that disabling it over that same real HTTP surface
 * genuinely stops that dispatch, and that deleting it over HTTP leaves
 * nothing for a later reconciliation to resurrect (T254) — driven from real
 * requests against a real bound port, not direct calls into the service
 * layer.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Queue } from 'bullmq';
import { SignJWT } from 'jose';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { startApi, reconcileCapabilitiesAtBoot, type ApiService } from '@webaudit/api';
import { createSandboxHost, type SandboxHost } from '@webaudit/sandbox-runner';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const FAKE_JOB: JobRef = { id: 'j', name: 'phase', queueName: 'scan-phase', data: {} };
const fakeQueue = () => ({ add: () => Promise.resolve({ id: 's' }) }) as unknown as Queue;

function options(): OrchestratorOptions {
  return {
    db,
    queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
    publisher: { publish: () => Promise.resolve(1) },
    executor: createExecutorFromEnv(),
    moduleTimeoutMs: 20_000,
  };
}

/**
 * Same shape `apps/api/tests/integration/progress-streaming.test.ts` already
 * uses to authenticate against a real `startApi()` server from outside
 * `apps/api` — `jose` is not a runtime dependency of `apps/worker` (added as
 * a devDependency for this file specifically), so the token is minted by
 * hand rather than reaching into `apps/api`'s internal `env` module, which
 * is not part of its public package exports.
 */
async function operatorToken(): Promise<string> {
  const secret = new TextEncoder().encode(process.env['JWT_ACCESS_SECRET']);
  const operator = await db.user.create({
    data: {
      email: `e2e-operator-${String(Date.now())}@x.com`,
      isOperator: true,
      emailVerifiedAt: new Date(),
    },
  });
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ isOperator: true })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(operator.id)
    .setIssuedAt(now)
    .setExpirationTime(now + 900)
    .sign(secret);
}

async function scanFor(modules: readonly ('SECURITY' | 'SEO')[]): Promise<string> {
  const user = await db.user.create({
    data: {
      email: `e2e-lifecycle-${String(Date.now())}@x.com`,
      passwordHash: 'x',
      emailVerifiedAt: new Date(),
    },
  });
  const target = await db.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://example.com',
      displayName: 'x',
      controlLevel: 'NONE',
    },
  });
  const scan = await db.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      requestedModules: [...modules],
      capabilitySnapshot: {},
      quotedCredits: 30,
      chargedCredits: 30,
      state: 'QUEUED',
      startedAt: new Date(),
    },
  });
  return scan.id;
}

const DISPATCH_ID = 't254-e2e-dispatch';
const DELETE_ID = 't254-e2e-delete';
const FINDING_TITLE = 'real e2e lifecycle capability ran';

/**
 * The same expression-only bundle shape every other conformance/dispatch
 * test in this phase already uses: a JS source file whose completion value
 * is the AuditCapability-shaped object literal. Parameterised by id so the
 * dispatch half and the delete half of this test use two distinct
 * capabilities — deliberately: a capability this test dispatches against
 * genuinely earns real `CapabilityExecution` history, and this file's own
 * `removeCapability` correctly, permanently refuses to delete a row with any
 * history (Principle VI) — so the delete/reconcile half must use a
 * capability that was uploaded but never run, or it would be asserting
 * against a 409 that is *correct* refusal, not a bug.
 */
function passingBundle(id: string): string {
  return `({
    id: '${id}',
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: async () => ([{
      checkId: '${id}',
      fingerprintParts: ['${id}'],
      severity: 'LOW',
      title: '${FINDING_TITLE}',
      description: 'uploaded and dispatched through the real stack, not a hand-written fixture',
      evidence: {},
      fixable: false,
    }]),
  })`;
}

describe('an operator-uploaded capability, driven end to end through the real HTTP admin API and a real worker dispatch (T254/T255)', () => {
  let sandboxHost: SandboxHost;
  let api: ApiService;
  let installedRoot: string;

  beforeAll(async () => {
    sandboxHost = await createSandboxHost({ port: 0 });
    process.env['SANDBOX_RUNNER_URL'] = `http://127.0.0.1:${String(sandboxHost.port)}`;
  });

  afterAll(async () => {
    delete process.env['SANDBOX_RUNNER_URL'];
    await sandboxHost.close();
    await closeDb();
  });

  beforeEach(async () => {
    await resetDb();
    await seedPlans();
    installedRoot = mkdtempSync(path.join(tmpdir(), 'e2e-lifecycle-'));
    process.env['INSTALLED_CAPABILITIES_ROOT'] = installedRoot;
    // Real HTTP server, real requireAuth/requireOperator gate, real
    // boot-time reconciliation against the real vendored root plus this
    // test's own throwaway installed root.
    api = await startApi({ db, port: 0, installSignalHandlers: false });
  });

  afterEach(async () => {
    await api.shutdown('test cleanup');
    delete process.env['INSTALLED_CAPABILITIES_ROOT'];
    rmSync(installedRoot, { recursive: true, force: true });
  });

  async function uploadOverHttp(
    authHeader: Record<string, string>,
    base: string,
    id: string,
  ): Promise<void> {
    const res = await fetch(
      `${base}/admin/capabilities/upload?${new URLSearchParams({ name: id, version: '1.0.0' }).toString()}`,
      {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'text/plain' },
        body: passingBundle(id),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { capabilityId: string; passed: boolean };
    expect(body.passed).toBe(true);
    expect(body.capabilityId).toBe(id);

    const installed = await db.capability.findUnique({ where: { id } });
    expect(installed?.trust).toBe('INSTALLED');
    expect(installed?.isEnabled).toBe(true);
    expect(existsSync(path.join(installedRoot, id, 'bundle.js'))).toBe(true);
  }

  it('upload over HTTP -> real sandboxed dispatch -> HTTP disable stops it', async () => {
    const token = await operatorToken();
    const authHeader = { Authorization: `Bearer ${token}` };
    const base = `http://127.0.0.1:${String(api.port)}`;

    // 1. Upload through the real, operator-gated HTTP surface.
    await uploadOverHttp(authHeader, base, DISPATCH_ID);

    // 2. A real worker phase dispatches the exact capability that was
    // just uploaded over HTTP — this test never writes bundle.js itself.
    const scanId1 = await scanFor(['SECURITY']);
    await createPhaseHandler(options())(
      { scanId: scanId1, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );
    const exec1 = await db.capabilityExecution.findFirst({
      where: { scanId: scanId1, capabilityId: DISPATCH_ID },
    });
    expect(exec1?.succeeded).toBe(true);
    const moduleResult1 = await db.moduleResult.findUniqueOrThrow({
      where: { scanId_module: { scanId: scanId1, module: 'SECURITY' } },
    });
    const issue1 = await db.issue.findFirst({
      where: { moduleResultId: moduleResult1.id, title: FINDING_TITLE },
    });
    expect(issue1).toBeDefined();
    // FR-032/SC-006 — assigned by the runner, never by the capability.
    expect(issue1?.attribution).toBe('MEASURED');

    // 3. Disable it over the same real HTTP surface.
    const patchRes = await fetch(`${base}/admin/capabilities/${DISPATCH_ID}`, {
      method: 'PATCH',
      headers: { ...authHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEnabled: false }),
    });
    expect(patchRes.status).toBe(200);
    expect((await db.capability.findUnique({ where: { id: DISPATCH_ID } }))?.isEnabled).toBe(false);

    // 4. A second real phase must not dispatch it anymore.
    const scanId2 = await scanFor(['SECURITY']);
    await createPhaseHandler(options())(
      { scanId: scanId2, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );
    const exec2 = await db.capabilityExecution.findFirst({
      where: { scanId: scanId2, capabilityId: DISPATCH_ID },
    });
    expect(
      exec2,
      'disabling over the real HTTP admin surface must stop the real sandbox dispatch',
    ).toBeNull();

    // This capability now genuinely has execution history (step 2) — per
    // this file's own Principle VI guarantee, it must never become
    // deletable. Asserted here so the guarantee is proven on the exact
    // capability that earned it, not assumed.
    const deleteRes = await fetch(`${base}/admin/capabilities/${DISPATCH_ID}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    expect(deleteRes.status).toBe(409);
    expect(await db.capability.findUnique({ where: { id: DISPATCH_ID } })).not.toBeNull();
  }, 30_000);

  it('upload over HTTP with no dispatch -> HTTP delete removes disk -> reconciliation does not resurrect it', async () => {
    const token = await operatorToken();
    const authHeader = { Authorization: `Bearer ${token}` };
    const base = `http://127.0.0.1:${String(api.port)}`;

    // 1. Upload through the real, operator-gated HTTP surface. Never
    // dispatched — zero execution history, so it is genuinely eligible
    // for deletion.
    await uploadOverHttp(authHeader, base, DELETE_ID);
    const dir = path.join(installedRoot, DELETE_ID);

    // 2. Delete it over HTTP.
    const deleteRes = await fetch(`${base}/admin/capabilities/${DELETE_ID}`, {
      method: 'DELETE',
      headers: authHeader,
    });
    expect(deleteRes.status).toBe(200);
    expect(await db.capability.findUnique({ where: { id: DELETE_ID } })).toBeNull();
    expect(existsSync(dir), 'the on-disk bundle must be gone after the real HTTP delete').toBe(
      false,
    );

    // 3. A later reconciliation — a routine boot, or the on-demand
    // reconcileNow another upload triggers — must not bring it back. The
    // exact scenario T254 closes, now proven from a delete that went
    // through the real HTTP surface rather than a direct service call.
    const emptyVendoredRoot = mkdtempSync(path.join(tmpdir(), 'e2e-empty-vendored-'));
    try {
      await reconcileCapabilitiesAtBoot(db, {
        vendoredRoot: emptyVendoredRoot,
        installedRoot,
        assertLocal: false,
      });
    } finally {
      rmSync(emptyVendoredRoot, { recursive: true, force: true });
    }
    expect(await db.capability.findUnique({ where: { id: DELETE_ID } })).toBeNull();
  }, 30_000);
});
