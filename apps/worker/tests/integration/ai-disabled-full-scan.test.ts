/**
 * P1-T4 (master plan, Phase 1) — a real, full, 5-module scan driven end to
 * end through the actual orchestrator with `AI_MODE=disabled`, no fixtures,
 * and zero AI provider credentials of any kind.
 *
 * Unlike every other orchestrator test in this suite, which exercises one
 * phase job in isolation, this test self-drives the scan the way a real
 * worker would: each phase's queue `add()` call is captured and immediately
 * re-run through the same real `createPhaseHandler`, walking
 * RUNNING_PHASE_1 (SECURITY/SEO/PERFORMANCE/TESTING) -> AWAITING_QUESTIONNAIRE
 * -> (resume) -> RUNNING_PHASE_2 (UI) -> RUNNING_MASTER -> RUNNING_DOCS ->
 * COMPLETED, following the exact split `packages/config/src/phase-modules.ts`
 * documents and the exact resume path
 * `questionnaire.resume-runs-phase-two.test.ts` already proves correct.
 *
 * What this proves that a unit-level `from-env`/`ai-layer` test cannot:
 * that the disabled executor survives contact with the real capability
 * registry, the real module runner, the real state-resolution logic
 * (`aiDegraded` now recognising `DISABLED`), and the real master-report path
 * — for every module type, not just UI — without any module going FAILED and
 * without a single AI-provider network call being made.
 */

import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { testDb as db, resetDb, seedPlans, closeDb } from '@webaudit/api/test-db';
import { reconcileCapabilitiesAtBoot } from '@webaudit/api';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import {
  createPhaseHandler,
  type OrchestratorOptions,
} from '../../src/orchestrator/orchestrator.js';
import {
  resumeAfterQuestionnaire,
  type EnqueueContext,
  type PhaseJobData,
} from '../../src/orchestrator/phases.js';
import { createScanEmitter } from '../../src/orchestrator/emit.js';
import { phaseJobSchema, type JobRef } from '../../src/queue/workers.js';

const FAKE_JOB: JobRef = { id: 'j', name: 'phase', queueName: 'scan-phase', data: {} };

interface AddedJob {
  readonly queue: 'scanPhase' | 'maintenance';
  readonly name: string;
  readonly data: unknown;
}

function fakeQueues(): { queues: OrchestratorOptions['queues']; added: AddedJob[] } {
  const added: AddedJob[] = [];
  const make = (queue: 'scanPhase' | 'maintenance'): Queue =>
    ({
      add: (name: string, data: unknown) => {
        added.push({ queue, name, data });
        return Promise.resolve({ id: 'stub-job' });
      },
    }) as unknown as Queue;
  return { queues: { scanPhase: make('scanPhase'), maintenance: make('maintenance') }, added };
}

function makeOptions(queues: OrchestratorOptions['queues']): OrchestratorOptions {
  return {
    db,
    queues,
    publisher: { publish: () => Promise.resolve(1) },
    // The disabled-mode executor under test — no keys, no chain, production-shaped.
    executor: createExecutorFromEnv({ NODE_ENV: 'production', AI_MODE: 'disabled' }),
    moduleTimeoutMs: 20_000,
  };
}

function dequeueScanPhaseJob(added: readonly AddedJob[]): PhaseJobData {
  const jobs = added.filter((j) => j.queue === 'scanPhase' && j.name === 'phase');
  expect(jobs, 'exactly one phase job must have been enqueued').toHaveLength(1);
  return phaseJobSchema.parse(jobs[0]?.data);
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});

afterAll(closeDb);

describe('P1-T4 — a full 5-module scan completes deterministically with AI_MODE=disabled', () => {
  it(
    'reaches COMPLETED, scores every module, never fails UI, generates fixPrompt, ' +
      'and makes zero AI-provider network calls',
    async () => {
      await reconcileCapabilitiesAtBoot(db);

      const fetchSpy = vi.spyOn(globalThis, 'fetch');

      const user = await db.user.create({
        data: {
          email: 'p1-t4-full-scan@example.com',
          passwordHash: 'x',
          emailVerifiedAt: new Date(),
        },
      });
      const target = await db.target.create({
        data: {
          userId: user.id,
          inputType: 'URL',
          canonicalValue: 'https://example.com',
          displayName: 'https://example.com',
          controlLevel: 'NONE',
        },
      });
      const ALL_MODULES = ['SECURITY', 'SEO', 'PERFORMANCE', 'TESTING', 'UI'] as const;
      const scan = await db.scan.create({
        data: {
          userId: user.id,
          targetId: target.id,
          requestedModules: [...ALL_MODULES],
          capabilitySnapshot: {},
          quotedCredits: 100,
          chargedCredits: 100,
          // Entry transition into RUNNING_PHASE_1 must be a real edge
          // (QUEUED -> RUNNING_PHASE_1); starting the row already at
          // RUNNING_PHASE_1 would make the handler's own entry transition a
          // self-edge, which the state machine refuses for every state.
          state: 'QUEUED',
        },
      });

      // 1. RUNNING_PHASE_1 — every non-UI module, concurrently, one phase job.
      const phase1 = fakeQueues();
      await createPhaseHandler(makeOptions(phase1.queues))(
        {
          scanId: scan.id,
          phase: 'RUNNING_PHASE_1',
          modules: ['SECURITY', 'SEO', 'PERFORMANCE', 'TESTING'],
          attempt: 1,
        },
        FAKE_JOB,
      );

      const afterPhase1 = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
      expect(
        afterPhase1.state,
        'a scan requesting UI must pause for the design-intent questionnaire, exactly as ' +
          'phase-modules.ts documents — unaffected by AI_MODE',
      ).toBe('AWAITING_QUESTIONNAIRE');

      // 2. Resume with a supplied design intent (mirrors
      //    questionnaire.resume-runs-phase-two.test.ts's real-capability case),
      //    so the UI module's real capabilities — including the AI-layer
      //    contributor `impeccable` — actually run under test.
      await db.designIntent.create({
        data: {
          scanId: scan.id,
          source: 'SUPPLIED',
          answeredAt: new Date(),
          audience: 'Small business owners',
          stylePreference: 'Minimal',
          brandColors: ['#123456'],
        },
      });
      const resumeQueues = fakeQueues();
      const resumeContext: EnqueueContext = {
        scanPhaseQueue: resumeQueues.queues.scanPhase,
        maintenanceQueue: resumeQueues.queues.maintenance,
        db,
        emitter: createScanEmitter(scan.id, { publisher: { publish: () => Promise.resolve(1) } }),
        planQueuePriority: 40,
      };
      const resumeOutcome = await resumeAfterQuestionnaire(resumeContext, {
        scanId: scan.id,
        reason: 'ANSWERED',
        modules: ['UI'],
      });
      expect(resumeOutcome.resumed).toBe(true);

      // 3. RUNNING_PHASE_2 — UI alone, including the AI-layer contributor.
      const phase2 = fakeQueues();
      await createPhaseHandler(makeOptions(phase2.queues))(
        dequeueScanPhaseJob(resumeQueues.added),
        FAKE_JOB,
      );

      const afterPhase2 = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
      expect(afterPhase2.state, 'must not fail merely because AI is disabled').not.toBe('FAILED');
      // RUNNING_PHASE_3 always resolves zero modules (phase-modules.ts), so the
      // orchestrator's walk-forward loop advances the *persisted state* through
      // it in this same call (exactly as
      // questionnaire.resume-runs-phase-two.test.ts's own first case proves) —
      // the RUNNING_MASTER job it enqueues next only runs, and only then moves
      // the state again, on the next handlePhase call below.
      expect(afterPhase2.state).toBe('RUNNING_PHASE_3');

      // 4. RUNNING_MASTER — master-report synthesis, using the same disabled
      //    executor (masterReportExecutor defaults to `executor` when unset).
      const masterJob = dequeueScanPhaseJob(phase2.added);
      expect(masterJob).toMatchObject({ scanId: scan.id, phase: 'RUNNING_MASTER' });
      const master = fakeQueues();
      await createPhaseHandler(makeOptions(master.queues))(masterJob, FAKE_JOB);

      // 5. RUNNING_DOCS — enrichment, then the terminal transition.
      const docsJob = dequeueScanPhaseJob(master.added);
      expect(docsJob).toMatchObject({ scanId: scan.id, phase: 'RUNNING_DOCS' });
      const docs = fakeQueues();
      await createPhaseHandler(makeOptions(docs.queues))(docsJob, FAKE_JOB);

      // --- Assertions: the actual acceptance criteria ---

      const finalScan = await db.scan.findUniqueOrThrow({ where: { id: scan.id } });
      expect(finalScan.state).toBe('COMPLETED');
      expect(finalScan.overallScore, 'the aggregate score must be numeric, not null').toEqual(
        expect.any(Number),
      );
      // P6-T1 (master plan): the scan-level executive summary must never
      // read like a broken/pending state — it should say the AI layer is
      // intentionally disabled, not merely "unavailable" (which also
      // describes a real outage) and never "No summary yet" once the scan
      // has actually completed.
      expect(finalScan.summary).toMatch(/intentionally disabled/i);
      expect(finalScan.summary).not.toMatch(/no summary yet/i);

      const moduleResults = await db.moduleResult.findMany({ where: { scanId: scan.id } });
      const byModule = new Map(moduleResults.map((m) => [m.module, m]));

      for (const module of ['SECURITY', 'SEO', 'PERFORMANCE', 'TESTING'] as const) {
        const result = byModule.get(module);
        expect(result, `${module} ModuleResult must exist`).toBeDefined();
        expect(result?.state, `${module} has no AI-layer capability — must be COMPLETE`).toBe(
          'COMPLETE',
        );
        expect(result?.score, `${module} score must be numeric`).toEqual(expect.any(Number));
      }

      const ui = byModule.get('UI');
      expect(ui, 'UI ModuleResult must exist').toBeDefined();
      expect(ui?.state, 'UI must not be FAILED merely because AI is disabled').not.toBe('FAILED');
      expect(ui?.state, 'UI has a real AI-layer capability (impeccable) that could not run').toBe(
        'DEGRADED',
      );
      expect(ui?.score, 'UI score must still be computed from its measured findings').toEqual(
        expect.any(Number),
      );
      expect(ui?.degradedReason).toMatch(/intentionally disabled/i);
      expect(ui?.summary, 'no AI ran, so no AI-authored summary should exist').toBeNull();

      // fixPrompt is a required, non-nullable column — assert it is populated
      // with real, non-empty text for every persisted issue, not merely
      // present because the column cannot be null.
      const issues = await db.issue.findMany({ where: { scanId: scan.id } });
      expect(issues.length, 'a real scan of a real page should find at least one issue').toBeGreaterThan(0);
      for (const issue of issues) {
        expect(issue.fixPrompt.trim().length).toBeGreaterThan(0);
      }

      // Zero AI-provider network calls. Deterministic capabilities legitimately
      // call `fetch` against the scanned target (https://example.com) — this
      // asserts no call went to a real AI provider host, not that fetch was
      // never called at all.
      //
      // `fetch`'s first argument is a string, a `URL`, or a `Request` — and a
      // plain `String(call[0])` silently stringifies the last two to
      // `"[object Request]"`/`"[object URL]"` (`Request` defines no custom
      // `toString`), which trivially never matches `aiProviderHostPattern`
      // regardless of the real destination. No capability constructs a
      // `Request` today, so this was not yet a live gap — but it made the
      // assertion silently untrustworthy against exactly the kind of call it
      // exists to catch, so every real shape is unwrapped to an actual URL
      // string explicitly instead of trusting the default stringification.
      const aiProviderHostPattern = /anthropic\.com|openai\.com|generativelanguage\.googleapis\.com/i;
      for (const call of fetchSpy.mock.calls) {
        const [input] = call;
        const url =
          typeof input === 'string'
            ? input
            : input instanceof Request
              ? input.url
              : input instanceof URL
                ? input.href
                : String(input);
        expect(url).not.toMatch(aiProviderHostPattern);
      }

      const aiInvocations = await db.aiInvocation.findMany({ where: { scanId: scan.id } });
      expect(
        aiInvocations,
        'the disabled executor never attempts a provider call, so no AiInvocation row should exist',
      ).toHaveLength(0);

      fetchSpy.mockRestore();
    },
    30_000,
  );
});
