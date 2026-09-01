/**
 * T113 — the five-phase orchestrator run loop.
 *
 * The `phase` job handler `queue/workers.ts`'s `dispatch()` has needed since
 * T104b: read the scan, transition into the phase the job names (guarded —
 * a lost race is a no-op, per `state-machine.ts`'s own contract), run that
 * phase's work, and enqueue whatever comes next. `modulesForPhase`
 * (`@webaudit/config`) decides which requested modules belong to
 * `RUNNING_PHASE_1`/`RUNNING_PHASE_2`/`RUNNING_PHASE_3`; `RUNNING_MASTER` and
 * `RUNNING_DOCS` are not module-running phases and run `master-report.ts`
 * (T114) and `fix-prompt.ts` (T115) instead.
 *
 * **Every module in a phase runs concurrently, and each is emitted as soon
 * as it finishes** (FR-033) — `Promise.all` over `runAndPersistModule`,
 * which itself does not resolve until its own `persistModuleResult` and
 * `module:complete` emit are both done, but the modules run alongside each
 * other, not queued behind one another.
 *
 * **Real capabilities now run** (T119-124): `capability-loader.ts` dynamically
 * imports each vendored capability's own workspace package, and `makeContext`
 * below builds a real `CodeLayerContext` via `createCodeLayerContext` — no
 * probe pool and no attached-source workspace are wired into it yet (this
 * vertical slice is URL-only), so `ctx.withPage`/`ctx.readFile`/`ctx.glob`
 * stay unavailable exactly as `createCodeLayerContext`'s own contract says
 * they should when neither is configured.
 *
 * **What this file honestly still does not do, each recorded rather than
 * silently skipped:**
 *
 * - The design-intent questionnaire is never triggered. See
 *   `phase-modules.ts`'s module note — full FR-040/041/042/043 wiring is
 *   US6 (T194-201). `RUNNING_PHASE_1` always proceeds straight to
 *   `RUNNING_PHASE_2` rather than pausing.
 * - A phase job that throws transitions the scan to `FAILED` via `failScan`,
 *   which refunds the undelivered share through `installTerminalRefund`
 *   (`terminal-refund.ts`, a terminal observer that runs inside the awaited
 *   `transition()` call and so has already committed by the time `failScan`
 *   reads the ledger back) and reports the real amount on `scan:failed`'s
 *   `creditsRefunded`, not a hardcoded zero.
 * - That coverage has one boundary worth naming: a throw that happens
 *   *before* the scan reaches the phase this job names — during
 *   `planQueuePriorityFor` above (called before the `try` block even
 *   starts) or during the entry `moveAndAnnounce` if it fails before the
 *   transition into `data.phase` lands — never reaches a state `failScan`
 *   can legally move out of. Its `transition(..., from: data.phase, ...)`
 *   call loses the race or is illegal, `outcome.moved` is `false`, and
 *   `failScan` returns without emitting or refunding. The scan is left
 *   stuck in a non-terminal state with its charge unrefunded, and — since
 *   no timeout sweep is scheduled in production either (see
 *   `terminal-refund.ts`'s own module note) — nothing else catches it.
 *   Pre-existing, not fixed here; recorded rather than silently implied
 *   covered.
 */

import { modulesForPhase } from '@webaudit/config';
import type { ModuleType, ScanState, Severity } from '@webaudit/types';
import { controlLevelRank, SEVERITY_ORDER, type ControlLevel } from '@webaudit/types';
import type { AiExecutor } from '@webaudit/ai-executor';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { reconfirmControl, createSafeNetProbe } from '@webaudit/api/control-gate';
import { ensurePlatformCapabilities } from '@webaudit/api';
import { markRecurrences } from '@webaudit/api/issues';
import { createCodeLayerContext } from '@webaudit/capability-sdk';
import type { CapabilityInput, CodeLayerContext, ModuleSummary } from '@webaudit/capability-sdk';
import { runModule, persistModuleResult } from '../module-runner/index.js';
import {
  materialiseSource,
  type MaterialiseDeps,
  type MaterialisedSource,
} from '../intake/materialise.js';
import type { ModuleResultWriter } from '../module-runner/persist.js';
import { loadCapabilities } from './capability-loader.js';
import { runMasterSynthesis } from './master-report.js';
import { enrichFixPrompts } from './fix-prompt.js';
import { finalizeReadiness } from '../readiness/run.js';
import { transition, nextPhase } from './state-machine.js';
import { moveAndAnnounce, enqueuePhase, type EnqueueContext, type PhaseJobData } from './phases.js';
import { createScanEmitter, type EventPublisher } from './emit.js';
import type { JobRef } from '../queue/workers.js';
import type { QueueSet } from '../queue/queues.js';

const MODULE_RUNNING_PHASES: readonly ScanState[] = [
  'RUNNING_PHASE_1',
  'RUNNING_PHASE_2',
  'RUNNING_PHASE_3',
];

/**
 * The context factory for one module run.
 *
 * `workspaceRoot` is present exactly when source was materialised for this scan
 * (T174) and absent otherwise — which is the whole confinement story:
 * `createCodeLayerContext` refuses `readFile` and `glob` outright when it is
 * absent, so a URL-only audit cannot read a file even if a capability tries,
 * and a source audit can only read inside the one directory that will be
 * destroyed with the scan. No probe pool yet; `withPage` still rejects.
 */
function contextFactory(
  workspaceRoot: string | undefined,
): (signal: AbortSignal, capabilityId: string) => CodeLayerContext {
  return (signal, capabilityId) =>
    createCodeLayerContext({
      signal,
      capabilityId,
      ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
    });
}

/**
 * Per-capability required levels for one module, read from the `Capability`
 * table — the reconciled registry's own source, never a capability's
 * self-declared manifest at runtime.
 *
 * Deliberately NOT filtered on `isEnabled: true` (unlike
 * `resolve-required-control-level.ts`'s query, which answers a different
 * question — the minimum level among what can actually run — and is correct
 * to filter). This query answers "what does the DB row for this capability
 * require", full stop. `capability-loader.ts` is a separate, static import
 * table that can drift from the registry's `isEnabled` flag (a known,
 * already-documented risk); if a capability is disabled in the registry but
 * still loaded there, filtering here would silently drop its requirement and
 * default it to ungated (`NONE`) rather than gated at whatever level its row
 * actually declares. Fail-safe means over-including a requirement — it can
 * only make more things gated, never fewer.
 */
async function requiredControlLevelsFor(
  db: PrismaClient,
  module: ModuleType,
): Promise<Readonly<Record<string, ControlLevel>>> {
  const rows = await db.capability.findMany({
    where: { module },
    select: { id: true, requiredControlLevel: true },
  });
  return Object.fromEntries(rows.map((row) => [row.id, row.requiredControlLevel]));
}

/**
 * The `isEnabled: true` capability ids for the modules in this phase (open
 * decision #13). Passed into `loadCapabilities` so an operator-disabled
 * capability does not run. A module id absent from the registry entirely
 * (nothing reconciled) yields an empty set → the module loads nothing →
 * NOT_APPLICABLE, which is the correct answer for "no enabled checks here".
 */
async function enabledCapabilityIdsFor(
  db: PrismaClient,
  modules: readonly ModuleType[],
): Promise<ReadonlyMap<ModuleType, ReadonlySet<string>>> {
  const rows = await db.capability.findMany({
    where: { module: { in: [...modules] }, isEnabled: true },
    select: { id: true, module: true },
  });
  const map = new Map<ModuleType, Set<string>>(modules.map((m) => [m, new Set<string>()]));
  for (const row of rows) map.get(row.module)?.add(row.id);
  return map;
}

/**
 * Live-reconfirmed control level for a whole phase, computed at most once.
 * A phase whose capabilities all require NONE never touches the network —
 * NONE can never be gated regardless of the target's real level, so it's
 * always safe to skip the live check in that case.
 */
async function resolvePhaseControlLevel(
  db: PrismaClient,
  scan: { userId: string; targetId: string },
  requiredControlLevelsByModule: ReadonlyMap<ModuleType, Readonly<Record<string, ControlLevel>>>,
): Promise<ControlLevel> {
  const maxRequiredRank = Math.max(
    0,
    ...[...requiredControlLevelsByModule.values()].flatMap((levels) =>
      Object.values(levels).map(controlLevelRank),
    ),
  );
  if (maxRequiredRank === 0) return 'NONE';
  const result = await reconfirmControl(
    db,
    { targetId: scan.targetId, userId: scan.userId },
    createSafeNetProbe(),
  );
  return result.level;
}

export interface OrchestratorOptions {
  readonly db: PrismaClient;
  readonly queues: Pick<QueueSet, 'scanPhase' | 'maintenance'>;
  readonly publisher: EventPublisher;
  readonly executor: AiExecutor;
  readonly moduleTimeoutMs?: number;
  /**
   * How an ARCHIVE or REPOSITORY target becomes a workspace (T174).
   *
   * Optional, and its absence is a hard failure rather than a quiet skip when
   * a source scan arrives: a worker deployed without a workspace directory or
   * an R2 credential can still audit URLs perfectly well, but reporting a
   * source audit as "no source attached" would be a lie of exactly the kind
   * this product exists to catch.
   */
  readonly source?: MaterialiseDeps;
}

async function planQueuePriorityFor(db: PrismaClient, userId: string): Promise<number> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { subscription: { select: { plan: { select: { queuePriority: true } } } } },
  });
  if (user?.subscription?.plan) return user.subscription.plan.queuePriority;
  const free = await db.plan.findUnique({ where: { id: 'free' }, select: { queuePriority: true } });
  return free?.queuePriority ?? 40;
}

/**
 * Summaries of every area whose result is already persisted for this scan —
 * i.e. areas that completed in an earlier phase (review finding M7). Threaded
 * into a later phase's `CapabilityInput.priorModuleResults` so a capability can
 * correlate across areas.
 */
async function buildPriorModuleResults(
  db: PrismaClient,
  scanId: string,
): Promise<CapabilityInput['priorModuleResults']> {
  const results = await db.moduleResult.findMany({
    where: { scanId },
    select: {
      module: true,
      state: true,
      score: true,
      issues: { select: { severity: true } },
    },
  });

  const out: Partial<Record<ModuleType, ModuleSummary>> = {};
  for (const r of results) {
    let worst: Severity | null = null;
    for (const { severity } of r.issues) {
      if (worst === null || SEVERITY_ORDER[severity] < SEVERITY_ORDER[worst]) worst = severity;
    }
    out[r.module] = {
      state: r.state,
      score: r.score,
      findingCount: r.issues.length,
      worstSeverity: worst,
    };
  }
  return out;
}

/**
 * The scan's attached source, or null when the target is a URL.
 *
 * Split out of the handler so the "configured for source but asked to audit
 * source" failure has one place to live and one message. It throws rather than
 * degrading, and the phase handler's own catch turns that into a FAILED scan —
 * which refunds (Principle VI: never charge for our failures, and a worker
 * missing its workspace configuration is unambiguously our failure).
 */
async function materialiseSourceFor(
  options: OrchestratorOptions,
  scan: { userId: string; target: { inputType: string; canonicalValue: string } },
  scanId: string,
): Promise<MaterialisedSource | null> {
  if (scan.target.inputType === 'URL') return null;
  if (options.source === undefined) {
    throw new Error(
      `This worker is not configured to audit source (${scan.target.inputType}). ` +
        'WORKSPACE_BASE_DIR and the upload storage credentials must be set.',
    );
  }
  return materialiseSource(
    options.db,
    { id: scanId, userId: scan.userId, target: scan.target },
    options.source,
  );
}

async function runAndPersistModule(
  options: OrchestratorOptions,
  scan: {
    id: string;
    targetId: string;
    target: { canonicalValue: string; inputType: string };
  },
  module: ModuleType,
  emitter: ReturnType<typeof createScanEmitter>,
  requiredControlLevels: Readonly<Record<string, ControlLevel>>,
  effectiveControlLevel: ControlLevel,
  priorModuleResults: CapabilityInput['priorModuleResults'],
  enabledCapabilityIds: ReadonlySet<string>,
  source: MaterialisedSource | null,
): Promise<void> {
  await emitter.emit({ type: 'module:started', scanId: scan.id, module }, () => Promise.resolve());

  const input: CapabilityInput = {
    ...(scan.target.inputType === 'URL' ? { targetUrl: scan.target.canonicalValue } : {}),
    // Present only when source was attached (T174). Its absence is what makes
    // the three source capabilities answer `canRun` false on a URL-only audit
    // rather than failing — FR-021, proved by T170.
    ...(source === null ? {} : { code: source.code }),
    // Summaries of every area that completed in an EARLIER phase (review
    // finding M7). Modules within a phase run concurrently, so this is empty
    // for phase 1 and carries phase-1's results into phase 2. `contradiction
    // -detector` (TESTING, phase 1) still sees nothing today — it needs a
    // dedicated post-audit QA phase to be fully useful — but the threading
    // mechanism it depends on is now real rather than hard-coded `{}`.
    priorModuleResults,
    controlLevel: effectiveControlLevel,
  };

  const startedAt = new Date();
  // Only the capabilities an operator has left enabled in the registry
  // (open decision #13 / SC-011 — the static loader ignored `isEnabled`).
  const capabilities = await loadCapabilities(module, enabledCapabilityIds);
  const result = await runModule({
    module,
    capabilities,
    input,
    executor: options.executor,
    makeContext: contextFactory(source?.workspace.path),
    timeoutMs: options.moduleTimeoutMs ?? 60_000,
    scanId: scan.id,
    targetId: scan.targetId,
    requiredControlLevels,
    ...(source === null ? {} : { workspaceRoot: source.workspace.path }),
  });

  // One transaction for the whole module result (review finding H2). Without
  // it a failure partway through — a constraint, a pool timeout, a malformed
  // evidence value — leaves a `ModuleResult` + `Issue` rows with no execution
  // rows, and the scan then FAILs carrying a half-written area with its
  // credits already debited. `timeout` is generous because persist does ~10
  // sequential statements; it is still all local INSERTs and fast in practice.
  //
  // Prisma's generated `issue.createMany` types `evidence` more narrowly
  // (`InputJsonValue`) than `ModuleResultWriter`'s structural `unknown` —
  // both accept the same runtime shape, so the cast is a type-level bridge.
  await options.db.$transaction(
    (tx) =>
      persistModuleResult(tx as unknown as ModuleResultWriter, {
        scanId: scan.id,
        module,
        state: result.state,
        score: result.score,
        summary: result.summary,
        skippedReason: result.skippedReason,
        degradedReason: result.degradedReason,
        findings: result.findings,
        executions: result.executions,
        aiInvocations: result.aiInvocations,
        aiCostMicros: result.aiCostMicros,
        startedAt,
        completedAt: new Date(),
      }),
    { timeout: 30_000 },
  );

  await emitter.emit(
    {
      type: 'module:complete',
      scanId: scan.id,
      module,
      state: result.state,
      score: result.score,
      issueCount: result.findings.length,
    },
    () => Promise.resolve(),
  );
}

async function failScan(
  db: PrismaClient,
  emitter: ReturnType<typeof createScanEmitter>,
  scanId: string,
  from: ScanState,
  error: unknown,
): Promise<void> {
  const outcome = await transition(db, {
    scanId,
    from,
    to: 'FAILED',
    extra: { failureReason: error instanceof Error ? error.message : String(error) },
  });
  if (!outcome.moved) return;

  // `installTerminalRefund` (terminal-refund.ts) has already run, inside the
  // transition() call above, and committed any refund — read it back rather
  // than assuming zero.
  const refunds = await db.creditTransaction.aggregate({
    where: { scanId, type: 'REFUND' },
    _sum: { amount: true },
  });

  await emitter.emit(
    {
      type: 'scan:failed',
      scanId,
      reason: error instanceof Error ? error.message : 'The audit failed unexpectedly.',
      creditsRefunded: refunds._sum.amount ?? 0,
    },
    () => Promise.resolve(),
  );
}

export function createPhaseHandler(
  options: OrchestratorOptions,
): (data: PhaseJobData, job: JobRef) => Promise<void> {
  // The module-ai:<module> sentinel Capability rows are the FK target for
  // every module's AI-execution row (finding C1). `startApi` ensures them at
  // boot; this covers a worker that processes a job before any API instance
  // has booted (a fresh deploy, or a test that starts only the worker). Once
  // per process, memoised — the first job waits on it, the rest do not.
  let platformCapabilitiesReady: Promise<void> | undefined;
  const ensureReady = (): Promise<void> => {
    platformCapabilitiesReady ??= ensurePlatformCapabilities(options.db).catch((error: unknown) => {
      console.error(
        `[orchestrator] could not ensure module-ai platform capabilities: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    });
    return platformCapabilitiesReady;
  };

  return async function handlePhase(data: PhaseJobData): Promise<void> {
    await ensureReady();

    const scan = await options.db.scan.findUnique({
      where: { id: data.scanId },
      include: {
        target: { select: { canonicalValue: true, inputType: true } },
      },
    });
    if (scan === null) return; // Nothing to run against. Not an error: the scan is gone.

    const emitter = createScanEmitter(data.scanId, { publisher: options.publisher });
    const context: EnqueueContext = {
      scanPhaseQueue: options.queues.scanPhase,
      maintenanceQueue: options.queues.maintenance,
      db: options.db,
      emitter,
      planQueuePriority: await planQueuePriorityFor(options.db, scan.userId),
    };

    try {
      const outcome = await moveAndAnnounce(context, {
        scanId: data.scanId,
        from: scan.state,
        to: data.phase,
      });
      // Lost the race, or someone else already handled this phase (e.g. a
      // cancellation). Either way, this job's work is done.
      if (!outcome.moved) return;

      if (MODULE_RUNNING_PHASES.includes(data.phase)) {
        const requiredControlLevelsByModule = new Map(
          await Promise.all(
            data.modules.map(
              async (module) =>
                [module, await requiredControlLevelsFor(options.db, module)] as const,
            ),
          ),
        );
        const effectiveControlLevel = await resolvePhaseControlLevel(
          options.db,
          scan,
          requiredControlLevelsByModule,
        );

        const priorModuleResults = await buildPriorModuleResults(options.db, data.scanId);
        const enabledByModule = await enabledCapabilityIdsFor(options.db, data.modules);

        // Once per phase job, before any module runs, and shared by all of
        // them: every module in a phase audits the same tree, and extracting
        // per-module would multiply the work by the module count and give
        // concurrent extractors the same destination directory.
        const source = await materialiseSourceFor(options, scan, data.scanId);

        await Promise.all(
          data.modules.map((module) =>
            runAndPersistModule(
              options,
              scan,
              module,
              emitter,
              requiredControlLevelsByModule.get(module) ?? {},
              effectiveControlLevel,
              priorModuleResults,
              enabledByModule.get(module) ?? new Set<string>(),
              source,
            ),
          ),
        );

        // Walk forward through any subsequent module-running phase that has
        // nothing to run — RUNNING_PHASE_2/3 have no modules at all unless
        // UI was requested (phase-modules.ts) — transitioning through each
        // in this same invocation rather than enqueueing a job for it.
        // `phaseJobSchema` requires `modules.min(1)` (a phase with no areas
        // would cost a worker slot to do nothing), so a job carrying an
        // empty module list is refused at the queue boundary, not run: the
        // fix is not to enqueue one, not to weaken that guard.
        let current = data.phase;
        let next = nextPhase(current);
        while (
          next !== null &&
          MODULE_RUNNING_PHASES.includes(next) &&
          modulesForPhase(next, scan.requestedModules).length === 0
        ) {
          const advanced = await moveAndAnnounce(context, {
            scanId: data.scanId,
            from: current,
            to: next,
          });
          if (!advanced.moved) return; // Lost the race somewhere in the walk.
          current = next;
          next = nextPhase(current);
        }
        if (next === null) return; // Should not happen mid-run; nothing further to do.

        if (MODULE_RUNNING_PHASES.includes(next)) {
          await enqueuePhase(context, {
            scanId: data.scanId,
            phase: next,
            modules: modulesForPhase(next, scan.requestedModules),
            attempt: 1,
          });
          return;
        }

        // next is RUNNING_MASTER. Not a module-running phase — the queue
        // payload still needs a non-empty `modules` array (the schema's own
        // rule), so it carries the scan's full selection, which is always
        // non-empty (create-scan.ts's own boundary check).
        await enqueuePhase(context, {
          scanId: data.scanId,
          phase: next,
          modules: scan.requestedModules,
          attempt: 1,
        });
        return;
      }

      if (data.phase === 'RUNNING_MASTER') {
        await runMasterSynthesis(options.db, options.executor, data.scanId);
        await enqueuePhase(context, {
          scanId: data.scanId,
          phase: 'RUNNING_DOCS',
          modules: scan.requestedModules,
          attempt: 1,
        });
        return;
      }

      if (data.phase === 'RUNNING_DOCS') {
        await enrichFixPrompts();
        // FR-064 (T152): an issue whose fingerprint was verified fixed in an
        // earlier scan of this target and has come back is re-labelled REOPENED
        // with previouslyResolved set, so the fixes board and the readiness
        // diff (FR-069) can both see it as a regression rather than a new find.
        await markRecurrences(options.db, { scanId: data.scanId });
        // FR-068/069/070/071 (T162): for a READINESS scan, compute the diff
        // against the baseline and the go/no-go verdict now that every area has
        // been audited fresh. The certificate + email (FR-072) are generated
        // lazily by `GET /scans/:id/readiness`, since R2 and the mailer are
        // apps/api's. A no-op for an INITIAL scan.
        if (scan.kind === 'READINESS' && scan.baselineScanId !== null) {
          await finalizeReadiness(options.db, data.scanId);
        }
        await moveAndAnnounce(context, {
          scanId: data.scanId,
          from: 'RUNNING_DOCS',
          to: 'COMPLETED',
        });
        return;
      }
    } catch (error) {
      await failScan(options.db, emitter, data.scanId, data.phase, error);
    }
  };
}
