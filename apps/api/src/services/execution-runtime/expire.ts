/**
 * `expirePlanUnits` (scan-deadline-contract.md "expirePlanUnits and the status-by-cause matrix", T-U1-7).
 *
 * Idempotent and safe to run concurrently. Units are processed in topological order, predecessors first, one
 * transaction per unit, each finalized through `finalizeExecutionUnit` (so a dependent of an expired predecessor
 * ends BLOCKED, never REFUSED). It never writes F07 tables directly and never calls `triggerStop`. A unit is only
 * touched when its own scan is terminal or its plan deadline has passed: a live plan is never expired.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';
import { findPendingStop } from '../safety/kill-switch-state.js';
import { DEFAULT_PLAN_DEADLINE_CONSTANTS, effectiveDeadlineAt } from '../planning/plan-deadline.js';
import {
  isPassiveClass,
  isTerminalUnitStatus,
  topologicalOrder,
  type ExecutionUnitClass,
  type ExecutionUnitStatus,
} from '../planning/graph.js';
import { dbNow } from './cause.js';
import { hasUnconfirmedEffects } from './effects.js';
import { finalizeExecutionUnit, type FinalizeOutcome } from './finalize.js';

export type ExpiryConfirmation = 'TERMINATED' | 'PENDING';

export interface ExpiredUnit {
  id: string;
  executionUnitClass: ExecutionUnitClass;
  engineId: string;
  attempt: number;
}

export interface ExpireOptions {
  /** Engine termination hook (idempotent). Absent for a non-passive class means "not confirmed gone". */
  onUnitExpired?: (unit: ExpiredUnit) => Promise<ExpiryConfirmation>;
  hardStopMarginMs?: number;
  legacyMaxDurationMs?: number;
}

export interface ExpireSummary {
  finalized: string[];
  pending: string[];
  untouched: string[];
}

const PRE_RUNNING: ReadonlySet<string> = new Set(['PLANNED', 'ADMITTED', 'DISPATCHED']);

interface Row {
  id: string;
  userId: string;
  status: string;
  idempotencyKey: string;
  executionUnitClass: ExecutionUnitClass;
  engineId: string;
  attempt: number;
  targetId: string;
  targetAuthorizationId: string | null;
}

export async function expirePlanUnits(
  db: SafetyDb,
  scanPlanId: string,
  options: ExpireOptions = {},
): Promise<ExpireSummary> {
  const summary: ExpireSummary = { finalized: [], pending: [], untouched: [] };
  const plan = await db.scanPlan.findUnique({
    where: { id: scanPlanId },
    select: { kind: true, state: true, deadlineMs: true, resolvedAt: true, scanId: true },
  });
  if (plan === null) return summary;

  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT id, "userId", status::text AS status, "idempotencyKey", "executionUnitClass"::text AS "executionUnitClass",
           "engineId", attempt, "targetId", "targetAuthorizationId"
      FROM "ExecutionUnit" WHERE "scanPlanId" = ${scanPlanId}`);
  const edges = await db.executionDependency.findMany({
    where: { executionUnit: { scanPlanId } },
    select: { executionUnitId: true, dependsOnExecutionUnitId: true },
  });
  const order = topologicalOrder(
    rows.map((r) => ({ id: r.id, executionUnitClass: r.executionUnitClass })),
    edges.map((e) => ({ unitId: e.executionUnitId, dependsOnUnitId: e.dependsOnExecutionUnitId })),
  );
  const byId = new Map(rows.map((r) => [r.id, r]));
  const legacy = options.legacyMaxDurationMs ?? DEFAULT_PLAN_DEADLINE_CONSTANTS.legacyMaxDurationMs;
  const margin = options.hardStopMarginMs ?? 60_000;

  for (const id of order) {
    const seen = byId.get(id);
    if (seen === undefined) continue;
    // Re-read: a host, an earlier iteration (BLOCKED propagation) or another sweeper may have finalized it.
    const cur = (
      await db.$queryRaw<
        Array<{ status: string; idempotencyKey: string; attempt: number }>
      >(Prisma.sql`
        SELECT status::text AS status, "idempotencyKey", attempt FROM "ExecutionUnit" WHERE id = ${id}`)
    )[0];
    if (cur === undefined || isTerminalUnitStatus(cur.status as ExecutionUnitStatus)) continue;

    const scan =
      plan.scanId === null
        ? null
        : await db.scan.findUnique({
            where: { id: plan.scanId },
            select: { state: true, startedAt: true },
          });
    const now = await dbNow(db);
    const deadline = effectiveDeadlineAt({ startedAt: scan?.startedAt ?? null }, plan, legacy);
    const scanEnded =
      scan?.state === 'CANCELLED' || scan?.state === 'FAILED' || scan?.state === 'TIMED_OUT';
    const deadlinePassed = deadline !== null && now.getTime() >= deadline.getTime();
    if (!scanEnded && !deadlinePassed) {
      summary.untouched.push(id);
      continue;
    }

    // "An F07 stop recorded for the unit beats the deadline outcome in every column."
    const stop = await findPendingStop(db, {
      executionId: id,
      scanId: plan.scanId,
      grantId: seen.targetAuthorizationId ?? '',
      targetId: seen.targetId,
      userId: seen.userId,
    });
    let stopReason: string | null = null;
    if (stop !== null) {
      const ks = await db.killSwitchState.findUnique({
        where: { scope_scopeId: { scope: stop.scope, scopeId: stop.scopeId } },
        select: { reason: true },
      });
      stopReason = ks?.reason ?? 'SYSTEM_SAFETY_POLICY';
    }
    const scanCause =
      scan?.state === 'CANCELLED'
        ? 'SCAN_CANCELLED'
        : scan?.state === 'FAILED'
          ? 'SCAN_FAILED'
          : 'SCAN_DEADLINE_EXPIRED';

    let outcome: FinalizeOutcome;
    if (PRE_RUNNING.has(cur.status)) {
      outcome = { kind: 'REFUSED', reason: stop !== null ? 'KILL_SWITCH_PENDING' : scanCause };
    } else {
      // RUNNING: confirm the execution is gone first (v6 §5: and no authorized effect lacks a confirmation).
      const unit: ExpiredUnit = {
        id,
        executionUnitClass: seen.executionUnitClass,
        engineId: seen.engineId,
        attempt: cur.attempt,
      };
      let confirmation: ExpiryConfirmation =
        options.onUnitExpired !== undefined
          ? await options.onUnitExpired(unit)
          : isPassiveClass(seen.executionUnitClass)
            ? 'TERMINATED'
            : 'PENDING';
      if (confirmation === 'TERMINATED' && (await hasUnconfirmedEffects(db, id)))
        confirmation = 'PENDING';
      const unconfirmedTooLong = deadline !== null && now.getTime() >= deadline.getTime() + margin;
      if (confirmation === 'PENDING' && !unconfirmedTooLong) {
        summary.pending.push(id);
        continue;
      }
      if (confirmation === 'PENDING') {
        outcome = {
          kind: 'FAILED',
          failureClass: 'TRANSIENT_INFRASTRUCTURE',
          detail: 'TERMINATION_UNCONFIRMED',
        };
      } else if (stop !== null) {
        outcome =
          stopReason === 'USER_CANCELLATION'
            ? { kind: 'CANCELLED' }
            : { kind: 'KILLED', f07Reason: stopReason ?? 'SYSTEM_SAFETY_POLICY' };
      } else if (scan?.state === 'CANCELLED') {
        outcome = { kind: 'CANCELLED' };
      } else if (scan?.state === 'FAILED') {
        outcome = { kind: 'FAILED', failureClass: 'TRANSIENT_INFRASTRUCTURE' };
      } else {
        outcome = { kind: 'FAILED', failureClass: 'TIMEOUT', detail: 'SCAN_DEADLINE' };
      }
    }

    const result = await finalizeExecutionUnit(db, id, cur.idempotencyKey, outcome);
    if (!result.replayed) summary.finalized.push(id, ...result.blocked);
  }
  return summary;
}
