/**
 * `continueScanIfPlanTerminal` — the plan-unit barrier (scan-deadline-contract.md "Plan-unit barrier", T-U1-8).
 *
 * A scan with a RESOLVED INITIAL plan must not reach report synthesis while any unit of that plan is non-terminal.
 * The gate reuses the orchestrator's existing wait-as-a-database-row pattern: if it is not ready it simply
 * returns and the job ends (no worker slot is held). The orchestrator calls it at the end of its last
 * module-running phase, and a unit's finalization calls it again after the unit's terminal commit.
 *
 * Technical decisions (recorded, not owner answers):
 *  - "At the barrier" means `RUNNING_PHASE_3` with every module that no finalizer owns already in a terminal
 *    state; before that the orchestrator's own phase jobs are still running and a unit finalization must not
 *    advance the scan.
 *  - The planned scan's RUNNING_PHASE_3 -> RUNNING_MASTER transition is claimed here with one database-clock CAS
 *    before enqueue. The master job carries alreadyTransitioned so its entry does not repeat the transition.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';
import { isTerminalUnitStatus } from '../planning/graph.js';
import { finalizeExecutionUnit, type FinalizeOutcome, type FinalizeResult } from './finalize.js';

export type GateResult = 'no-plan' | 'not-ready' | 'deadline-passed' | 'continued';

/** A domain/engine-registered, idempotent writer of the ModuleResult rows it owns (extension point only). */
export interface ModuleResultFinalizer {
  readonly ownedModules: readonly string[];
  finalizeModuleResults(scanPlanId: string): Promise<void>;
}

export interface GateDeps {
  finalizers?: readonly ModuleResultFinalizer[];
  /** State-machine-owned atomic transition from RUNNING_PHASE_3 to RUNNING_MASTER. */
  claimContinuation: (scanId: string, deadlineMs: number) => Promise<boolean>;
  /** Called by the CAS winner only; the master job must carry alreadyTransitioned=true. */
  enqueueMaster: () => Promise<void>;
}

const MODULE_TERMINAL = new Set(['COMPLETE', 'DEGRADED', 'FAILED', 'NOT_APPLICABLE']);

export async function continueScanIfPlanTerminal(
  db: SafetyDb,
  scanId: string,
  deps: GateDeps,
): Promise<GateResult> {
  const plan = await db.scanPlan.findFirst({
    where: { scanId, kind: 'INITIAL', state: 'RESOLVED' },
    select: { id: true, deadlineMs: true },
  });
  if (plan === null) return 'no-plan';

  const scan = await db.scan.findUnique({
    where: { id: scanId },
    select: {
      state: true,
      startedAt: true,
      requestedModules: true,
      moduleResults: { select: { module: true, state: true } },
    },
  });
  if (scan === null || scan.state !== 'RUNNING_PHASE_3') return 'not-ready';

  const owned = new Set((deps.finalizers ?? []).flatMap((f) => f.ownedModules));
  const states = new Map(scan.moduleResults.map((m) => [m.module as string, m.state as string]));
  for (const module of scan.requestedModules) {
    if (owned.has(module)) continue;
    const s = states.get(module);
    if (s === undefined || !MODULE_TERMINAL.has(s)) return 'not-ready';
  }

  const units = await db.executionUnit.findMany({
    where: { scanPlanId: plan.id },
    select: { status: true },
  });
  if (units.some((u) => !isTerminalUnitStatus(u.status))) return 'not-ready';

  if (scan.startedAt === null || plan.deadlineMs === null) return 'not-ready';

  for (const finalizer of deps.finalizers ?? []) await finalizer.finalizeModuleResults(plan.id);

  // This single CAS is the continuation claim. It closes the read/queue race:
  // only the caller that moves the scan before its DB-clock deadline may enqueue
  // master synthesis. A sweep or competing finalizer makes the predicate fail.
  const claimed = await deps.claimContinuation(scanId, plan.deadlineMs);
  if (!claimed) {
    const current = await db.$queryRaw<Array<{ state: string; beforeDeadline: boolean }>>(
      Prisma.sql`
        SELECT state::text AS state,
               "startedAt" IS NOT NULL
                 AND clock_timestamp() < "startedAt" + (${plan.deadlineMs}::int * interval '1 millisecond')
                 AS "beforeDeadline"
          FROM "Scan" WHERE id = ${scanId}`,
    );
    return current[0]?.state === 'RUNNING_PHASE_3' && current[0]?.beforeDeadline === false
      ? 'deadline-passed'
      : 'not-ready';
  }

  await deps.enqueueMaster();
  return 'continued';
}

/** Finalize, then (post-commit, never inside the unit transaction) let the gate run for the unit's scan. */
export async function finalizeUnitAndContinue(
  db: SafetyDb,
  executionUnitId: string,
  idempotencyKey: string,
  outcome: FinalizeOutcome,
  gate: GateDeps,
): Promise<{ finalize: FinalizeResult; gate: GateResult }> {
  const result = await finalizeExecutionUnit(db, executionUnitId, idempotencyKey, outcome);
  const unit = await db.executionUnit.findUnique({
    where: { id: executionUnitId },
    select: { scanPlan: { select: { scanId: true, kind: true } } },
  });
  const scanId = unit?.scanPlan.kind === 'INITIAL' ? unit.scanPlan.scanId : null;
  const g =
    scanId === null || scanId === undefined
      ? 'no-plan'
      : await continueScanIfPlanTerminal(db, scanId, gate);
  return { finalize: result, gate: g };
}
