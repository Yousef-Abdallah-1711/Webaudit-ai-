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
 *  - The scan state itself is moved by the orchestrator's guarded phase-entry transition when the enqueued
 *    master-synthesis job starts (it is not pre-moved here), so the deadline predicate guards the ENQUEUE decision on
 *    the database clock. A race past the deadline is bounded by the plan's finalization margin and the sweep.
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
  /** Called by the winner only; the master phase job's entry transition is the guarded state move. */
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
  const clock = await db.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
    SELECT clock_timestamp() < s."startedAt" + (${plan.deadlineMs}::int * interval '1 millisecond') AS ok
      FROM "Scan" s WHERE s.id = ${scanId}`);
  if (clock[0]?.ok !== true) return 'deadline-passed';

  for (const finalizer of deps.finalizers ?? []) await finalizer.finalizeModuleResults(plan.id);
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
