/**
 * Task 4 (2026-08-27 control-gate-enforcement plan) — the orchestrator's
 * live re-confirmation and per-capability gating, exercised end to end
 * through `createPhaseHandler` against a real database.
 *
 * Closes the gap the independent review flagged: `runAndPersistModule` used
 * to build `CapabilityInput.controlLevel` from the cached `Target.controlLevel`
 * column and never passed `requiredControlLevels` into `runModule` at all, so
 * a capability's `requiredControlLevel` was never actually enforced at
 * execution time — only at scan-creation time, and only at whole-module
 * granularity. These three tests prove: (1) a capability whose required
 * level exceeds the target's real level is skipped rather than run; (2) the
 * network-touching re-confirmation is never invoked when nothing in the
 * phase needs more than NONE — true of every scan shape that exists in
 * production today; (3) a capability that is genuinely met — verified live,
 * not from a stale column — actually executes, and the live check fires at
 * most once per phase job even when the phase runs more than one module.
 *
 * **Why `node:dns/promises` is mocked rather than `@webaudit/safe-net`.**
 * `createSafeNetProbe()`'s DNS method (`verify.ts`'s `isTokenPublished`)
 * calls `resolveTxt` from the `node:dns/promises` builtin directly. A
 * builtin has one canonical module id regardless of which package imports
 * it, so `vi.mock('node:dns/promises', ...)` reliably intercepts it here
 * even though this suite lives in `apps/worker` and the call happens inside
 * `@webaudit/api`'s control-gate service — confirmed empirically before
 * writing these tests. Mocking `@webaudit/safe-net` itself was tried first
 * and does **not** reliably cross a workspace-package boundary in this
 * repo's pnpm + Vitest setup (each package's own symlinked
 * `node_modules/@webaudit/safe-net` resolves to a module id `vi.mock` does
 * not consistently intercept from a different package's test file) — so
 * real capabilities in this suite make real requests to `https://example.com`
 * instead, the same accepted pattern `apps/api/tests/integration/
 * gated-check-partial.test.ts` already uses for the same reason.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DnsPromises from 'node:dns/promises';

/** Every DNS name `resolveTxt` was asked to look up — the spy this suite
 * uses to prove whether `createSafeNetProbe()`'s DNS check ever ran. */
const dnsCalls: string[] = [];

/** Set per-test: the TXT value(s) returned for any name, so a test can make
 * `isTokenPublished` see the token as still published. */
let dnsTxtValue: string | null = null;

vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof DnsPromises>();
  return {
    ...actual,
    resolveTxt: (name: string) => {
      dnsCalls.push(name);
      return Promise.resolve(dnsTxtValue === null ? [] : [[dnsTxtValue]]);
    },
  };
});

import type { Queue } from 'bullmq';
import type { ModuleType } from '@webaudit/types';
import { createExecutor, type Provider } from '@webaudit/ai-executor';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { recordNameFor } from '@webaudit/api/control-gate';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import type { JobRef } from '../../src/queue/workers.js';

const TARGET_URL = 'https://example.com';

/** Never actually invoked in this suite — every capability under test is
 * CODE-only, so `runAiLayer` short-circuits on `NO_AI_CAPABILITIES` before
 * ever reaching the executor. Throwing here turns a violation of that
 * assumption into a loud test failure instead of a silent pass. */
function stubProvider(vendor: string): Provider {
  return {
    vendor,
    model: `${vendor}-stub`,
    pricing: { inputMicrosPerMillion: 1, outputMicrosPerMillion: 1 },
    generate: () => Promise.reject(new Error(`${vendor} must not be invoked by this suite`)),
  };
}

const executor = createExecutor({
  chain: [stubProvider('a'), stubProvider('b')],
  timeoutMs: 5_000,
});

function fakeQueue(): Queue {
  // Only `.add` is ever called on either queue in the paths these tests
  // exercise (the walk-forward's final `enqueuePhase`). Cast rather than
  // standing up a real BullMQ connection this suite has no use for.
  return { add: () => Promise.resolve({ id: 'stub-job' }) } as unknown as Queue;
}

function makeOptions(): OrchestratorOptions {
  return {
    db,
    queues: { scanPhase: fakeQueue(), maintenance: fakeQueue() },
    publisher: { publish: () => Promise.resolve(1) },
    executor,
    moduleTimeoutMs: 15_000,
  };
}

const FAKE_JOB: JobRef = { id: 'job-1', name: 'phase', queueName: 'scan-phase', data: {} };

async function makeUser(email: string): Promise<string> {
  const user = await db.user.create({
    data: { email, passwordHash: 'x', emailVerifiedAt: new Date() },
  });
  return user.id;
}

async function makeTarget(
  userId: string,
  inputType: 'URL' | 'REPOSITORY' = 'URL',
): Promise<string> {
  const target = await db.target.create({
    data: {
      userId,
      inputType,
      canonicalValue: inputType === 'URL' ? TARGET_URL : 'owner/repo',
      displayName: inputType === 'URL' ? TARGET_URL : 'owner/repo',
      controlLevel: 'NONE',
    },
  });
  return target.id;
}

async function seedCapabilities(
  ids: readonly string[],
  module: ModuleType,
  requiredControlLevel: 'NONE' | 'ATTESTED' | 'VERIFIED',
): Promise<void> {
  for (const id of ids) {
    await db.capability.create({
      data: {
        id,
        name: id,
        version: '1.0.0',
        module,
        layer: 'CODE',
        trust: 'VENDORED',
        requiredControlLevel,
        isEnabled: true,
      },
    });
  }
}

async function makeScan(
  userId: string,
  targetId: string,
  modules: readonly ModuleType[],
): Promise<string> {
  const scan = await db.scan.create({
    data: {
      userId,
      targetId,
      requestedModules: [...modules],
      capabilitySnapshot: {},
      quotedCredits: 10,
      chargedCredits: 10,
      state: 'QUEUED',
    },
  });
  return scan.id;
}

/** The four real SECURITY capability ids `capability-loader.ts` loads. */
const SECURITY_CAPABILITY_IDS = [
  'headers-checker',
  'ssl-analyzer',
  'data-leak-scanner',
  'owasp-checker',
] as const;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  dnsCalls.length = 0;
  dnsTxtValue = null;
});

afterAll(closeDb);

describe('orchestrator control-level gating', () => {
  it("skips a capability whose requiredControlLevel exceeds the target's current level", async () => {
    const userId = await makeUser('gate-skip@example.com');
    const targetId = await makeTarget(userId, 'URL');
    // Every real SECURITY capability requires VERIFIED; the target is NONE
    // and has never been attested or verified — no TargetVerification row
    // exists at all.
    await seedCapabilities(SECURITY_CAPABILITY_IDS, 'SECURITY', 'VERIFIED');
    const scanId = await makeScan(userId, targetId, ['SECURITY']);

    const handlePhase = createPhaseHandler(makeOptions());
    await handlePhase(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    const moduleResult = await db.moduleResult.findUnique({
      where: { scanId_module: { scanId, module: 'SECURITY' } },
    });
    // Not COMPLETE, not a pass — nothing was applicable because every
    // capability was gated out (FR-017/FR-021's NOT_APPLICABLE, resolve.ts's
    // own contract: applicableCount === 0 -> NOT_APPLICABLE).
    expect(moduleResult?.state).toBe('NOT_APPLICABLE');
    expect(moduleResult?.score).toBeNull();
    expect(moduleResult?.skippedReason).toContain('needs VERIFIED control');

    const executions = await db.capabilityExecution.findMany({ where: { scanId } });
    expect(executions).toHaveLength(SECURITY_CAPABILITY_IDS.length);
    for (const execution of executions) {
      expect(execution.succeeded, execution.capabilityId).toBe(false);
      expect(execution.skippedReason, execution.capabilityId).toContain('VERIFIED');
    }

    // reconfirmControl was called (maxRequiredRank > 0), but its own
    // short-circuit — no TargetVerification row exists, so `confirmed ===
    // null` — means it never reaches the probe. Proven, not assumed: the
    // DNS spy saw nothing.
    expect(dnsCalls).toEqual([]);

    const target = await db.target.findUniqueOrThrow({ where: { id: targetId } });
    expect(target.controlLevel).toBe('NONE');
  });

  it('does not call the live re-confirmation probe when every capability in the phase requires NONE', async () => {
    const userId = await makeUser('gate-none@example.com');
    const targetId = await makeTarget(userId, 'REPOSITORY');
    await seedCapabilities(SECURITY_CAPABILITY_IDS, 'SECURITY', 'NONE');
    // A live, confirmed DNS verification exists — if `resolvePhaseControlLevel`
    // called `reconfirmControl` at all, it would reach `isTokenPublished` and
    // this suite's `resolveTxt` mock would see the call. It must not: the
    // cheap, DB-only max-required-rank check alone must decide nothing here
    // needs re-confirming, before ever constructing a probe.
    const token = 'unused-token-would-prove-a-bug';
    await db.targetVerification.create({
      data: { targetId, method: 'DNS', token, confirmedAt: new Date(), revokedAt: null },
    });
    dnsTxtValue = token;
    const scanId = await makeScan(userId, targetId, ['SECURITY']);

    const handlePhase = createPhaseHandler(makeOptions());
    await handlePhase(
      { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
      FAKE_JOB,
    );

    expect(dnsCalls).toEqual([]);

    const target = await db.target.findUniqueOrThrow({ where: { id: targetId } });
    // Untouched: reconfirmControl was never called, so the cached column is
    // exactly what it started as, not repaired to VERIFIED even though a
    // live, confirmed, still-published verification exists.
    expect(target.controlLevel).toBe('NONE');
  });

  it(
    'lets a capability run when the target genuinely has the required level, ' +
      're-confirming at most once per phase even with two modules',
    async () => {
      const userId = await makeUser('gate-verified@example.com');
      const targetId = await makeTarget(userId, 'URL');

      const token = 'genuine-live-token-123456789012345';
      await db.targetVerification.create({
        data: { targetId, method: 'DNS', token, confirmedAt: new Date(), revokedAt: null },
      });
      dnsTxtValue = token;

      // Both modules in the same phase, each with one gated and one ungated
      // capability, so the phase-wide re-confirmation is exercised by more
      // than a single module — the case that would silently break if
      // `reconfirmControl` were (wrongly) called once per module instead of
      // once per phase.
      await seedCapabilities(['headers-checker'], 'SECURITY', 'VERIFIED');
      await seedCapabilities(
        ['ssl-analyzer', 'data-leak-scanner', 'owasp-checker'],
        'SECURITY',
        'NONE',
      );
      await seedCapabilities(['meta-checker'], 'SEO', 'VERIFIED');
      await seedCapabilities(['content-checker'], 'SEO', 'NONE');
      const scanId = await makeScan(userId, targetId, ['SECURITY', 'SEO']);

      const handlePhase = createPhaseHandler(makeOptions());
      await handlePhase(
        { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY', 'SEO'], attempt: 1 },
        FAKE_JOB,
      );

      const securityResult = await db.moduleResult.findUnique({
        where: { scanId_module: { scanId, module: 'SECURITY' } },
      });
      const seoResult = await db.moduleResult.findUnique({
        where: { scanId_module: { scanId, module: 'SEO' } },
      });
      // Not COMPLETE specifically — real network calls to example.com for
      // every capability succeeding is a source of flakiness unrelated to
      // what this test proves. The point is that the capability was allowed
      // to attempt to run at all (not gated out to NOT_APPLICABLE), not that
      // every one of its findings came back clean.
      expect(securityResult?.state).not.toBe('NOT_APPLICABLE');
      expect(seoResult?.state).not.toBe('NOT_APPLICABLE');

      const headersExecution = await db.capabilityExecution.findFirst({
        where: { scanId, capabilityId: 'headers-checker' },
      });
      const metaExecution = await db.capabilityExecution.findFirst({
        where: { scanId, capabilityId: 'meta-checker' },
      });
      // Not skipped for CONTROL_LEVEL (or at all) — actually executed.
      expect(headersExecution?.skippedReason).toBeNull();
      expect(headersExecution?.succeeded).toBe(true);
      expect(metaExecution?.skippedReason).toBeNull();
      expect(metaExecution?.succeeded).toBe(true);

      // Re-confirmed live, not read from the stale cached column: the
      // target row started at NONE and is now VERIFIED because
      // reconfirmControl actually ran and wrote it back.
      const target = await db.target.findUniqueOrThrow({ where: { id: targetId } });
      expect(target.controlLevel).toBe('VERIFIED');

      // The core assertion for this test: exactly one DNS lookup for the
      // whole phase job, despite two modules each containing a
      // VERIFIED-requiring capability. A per-module re-confirmation would
      // have produced two.
      expect(dnsCalls).toHaveLength(1);
      expect(dnsCalls[0]).toBe(recordNameFor(TARGET_URL));
    },
    20_000,
  );

  it(
    'gates a capability even when the cached Target.controlLevel column alone says VERIFIED, ' +
      'with no live confirmation behind it (Fix 2, SC-021 bypass-3 at the orchestrator level)',
    async () => {
      const userId = await makeUser('gate-stale-column@example.com');
      const targetId = await makeTarget(userId, 'URL');

      // The exact shape a bug, a bad migration, or a stale write would
      // produce: the cached column says VERIFIED, but there is nothing
      // behind it — no confirmed TargetVerification row at all. This is the
      // same forged-state case `apps/api/tests/adverse/control-gate.test.ts`
      // already covers at the service level ("the enum is a cache, the
      // verification row is the truth"); this test proves the orchestrator's
      // live re-confirmation — not just the service function in isolation —
      // genuinely overrides the stale column rather than trusting it.
      await db.target.update({ where: { id: targetId }, data: { controlLevel: 'VERIFIED' } });

      await seedCapabilities(SECURITY_CAPABILITY_IDS, 'SECURITY', 'VERIFIED');
      const scanId = await makeScan(userId, targetId, ['SECURITY']);

      const handlePhase = createPhaseHandler(makeOptions());
      await handlePhase(
        { scanId, phase: 'RUNNING_PHASE_1', modules: ['SECURITY'], attempt: 1 },
        FAKE_JOB,
      );

      const moduleResult = await db.moduleResult.findUnique({
        where: { scanId_module: { scanId, module: 'SECURITY' } },
      });
      // The stale column alone did not unlock anything — every capability
      // was gated out, exactly as if the target had never claimed VERIFIED.
      expect(moduleResult?.state).toBe('NOT_APPLICABLE');
      expect(moduleResult?.score).toBeNull();
      expect(moduleResult?.skippedReason).toContain('needs VERIFIED control');

      const executions = await db.capabilityExecution.findMany({ where: { scanId } });
      expect(executions).toHaveLength(SECURITY_CAPABILITY_IDS.length);
      for (const execution of executions) {
        expect(execution.succeeded, execution.capabilityId).toBe(false);
        expect(execution.skippedReason, execution.capabilityId).toContain('VERIFIED');
      }

      // The live re-confirmation ran (maxRequiredRank > 0) and, finding no
      // confirmed TargetVerification row, corrected the cache back down —
      // the same repair `reconfirmControl` performs for any other caller.
      const target = await db.target.findUniqueOrThrow({ where: { id: targetId } });
      expect(target.controlLevel).toBe('NONE');
    },
  );
});
