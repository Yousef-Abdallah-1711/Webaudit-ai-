/**
 * SPEC 009 U-1 — Scan Deadline Policy, the pure parts (`contracts/scan-deadline-contract.md`,
 * spec FR-047, task T-U1-2 and the arithmetic half of T-U1-4).
 *
 * Everything here is a pure, deterministic function (FR-046): no database, no clock read — the
 * caller passes `now`, and for any *enforcement* comparison that `now` MUST be the database clock
 * (contract "Clock, transitions and termination hooks" rule 1). Nothing here stores or mutates a
 * deadline: `computePlanDeadline` returns the value `resolvePlan` persists once, and
 * `effectiveDeadlineAt` derives the absolute instant at read time (contract "Anchor": "never stored
 * as an absolute timestamp — no second source of truth").
 *
 * Deliberately NOT here: the status-by-cause matrix and `expirePlanUnits` (T-U1-7), the plan-unit
 * barrier (T-U1-8) and execution-wrapper fencing (T-U1-9). They are tied to open owner decisions
 * (DEC-047/051/058/064/066) and to the unmigrated schema.
 */

import {
  isPassiveClass,
  predecessorsOf,
  topologicalOrder,
  type ExecutionUnitClass,
  type GraphEdge,
} from './graph.js';

/** Platform constants with the contract's defaults. None is overridable per scan or per request. */
export interface PlanDeadlineConstants {
  /** `legacyMaxDurationMs` (`SCAN_TIMEOUT_MS`, default 900 000). */
  readonly legacyMaxDurationMs: number;
  /** `queueWaitAllowanceMs`, default 60 000 per non-passive unit. */
  readonly queueWaitAllowanceMs: number;
  /** `planFinalizationMarginMs`, default 300 000. */
  readonly planFinalizationMarginMs: number;
  /** `SCAN_PLAN_MAX_DEADLINE_MS`, default 21 600 000 (6 h). Raising it is an amendment, not configuration. */
  readonly planMaxDeadlineMs: number;
}

export const DEFAULT_PLAN_DEADLINE_CONSTANTS: PlanDeadlineConstants = {
  legacyMaxDurationMs: 900_000,
  queueWaitAllowanceMs: 60_000,
  planFinalizationMarginMs: 300_000,
  planMaxDeadlineMs: 21_600_000,
};

/** The engine-declared fields `unitBudgetMs` needs, per unit. */
export interface DeadlineUnit {
  readonly id: string;
  readonly executionUnitClass: ExecutionUnitClass;
  readonly timeoutPolicyMs: number;
  /** Engine-declared per class; default 60 000 (contract "Definitions"). */
  readonly hardStopMarginMs: number;
  /** `retryPolicy.maxAttempts` — the FR-024 proven-idempotent bound; 1 for classes without proof. */
  readonly maxAttempts: number;
}

export interface GrantRef {
  readonly id: string;
  /** The F01 `TargetAuthorization.expiresAt` scalar, read by id (no F01 contract change). */
  readonly expiresAt: Date;
}

export interface DeadlineBreakdown {
  readonly passiveWindowMs: number;
  readonly criticalPathMs: number;
  readonly finalizationMarginMs: number;
  readonly ceilingMs: number;
  /** Smallest remaining grant lifetime at resolution time, when the plan references grants (audit only). */
  readonly grantCapMs?: number;
}

export type PlanDeadlineResult =
  | { readonly deadlineMs: number; readonly breakdown: DeadlineBreakdown }
  | { readonly refused: 'PLAN_DEADLINE_EXCEEDS_CEILING' | 'GRANT_EXPIRES_BEFORE_DEADLINE' };

/** An input the contract cannot give a deadline for. `resolvePlan` fails closed to `REFUSED` (never a default). */
export class PlanDeadlineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PlanDeadlineError';
  }
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new PlanDeadlineError(`${label} must be a positive safe integer, got ${String(value)}`);
  }
}

function assertConstants(c: PlanDeadlineConstants): void {
  assertPositiveInteger(c.legacyMaxDurationMs, 'legacyMaxDurationMs');
  assertPositiveInteger(c.queueWaitAllowanceMs, 'queueWaitAllowanceMs');
  assertPositiveInteger(c.planFinalizationMarginMs, 'planFinalizationMarginMs');
  assertPositiveInteger(c.planMaxDeadlineMs, 'planMaxDeadlineMs');
}

/**
 * `unitBudgetMs(u) = maxAttempts x (timeoutPolicyMs + hardStopMarginMs + queueWaitAllowanceMs)` —
 * every attempt can wait in the queue and run to its hard stop, so all three terms repeat per attempt.
 */
export function unitBudgetMs(unit: DeadlineUnit, constants: PlanDeadlineConstants): number {
  assertPositiveInteger(unit.timeoutPolicyMs, `unit ${unit.id} timeoutPolicyMs`);
  assertPositiveInteger(unit.hardStopMarginMs, `unit ${unit.id} hardStopMarginMs`);
  assertPositiveInteger(unit.maxAttempts, `unit ${unit.id} maxAttempts`);
  const budget =
    unit.maxAttempts *
    (unit.timeoutPolicyMs + unit.hardStopMarginMs + constants.queueWaitAllowanceMs);
  if (!Number.isSafeInteger(budget))
    throw new PlanDeadlineError(`unit ${unit.id} budget overflows`);
  return budget;
}

/**
 * `dispatchThresholdMs(u) = timeoutPolicyMs + hardStopMarginMs` — the minimum time that must remain at
 * dispatch step 0. It deliberately excludes `queueWaitAllowanceMs`: that allowance budgets the wait
 * *before* step 0, which has already elapsed when step 0 runs (contract "Worked arithmetic").
 */
export function dispatchThresholdMs(
  unit: Pick<DeadlineUnit, 'timeoutPolicyMs' | 'hardStopMarginMs'>,
): number {
  return unit.timeoutPolicyMs + unit.hardStopMarginMs;
}

/**
 * The critical path `C`: the maximum, over every directed path made only of NON-passive units, of the sum
 * of `unitBudgetMs` along it. Parallel siblings do not add; a chain adds. A passive unit between two
 * non-passive units breaks the path (the passive prefix shares the single legacy window, it is not summed).
 */
export function criticalPathMs(
  units: readonly DeadlineUnit[],
  edges: readonly GraphEdge[],
  constants: PlanDeadlineConstants,
): number {
  const order = topologicalOrder(units, edges);
  const byId = new Map(units.map((u) => [u.id, u]));
  const predecessors = predecessorsOf(edges);
  const longest = new Map<string, number>();
  let best = 0;
  for (const id of order) {
    const unit = byId.get(id) as DeadlineUnit;
    if (isPassiveClass(unit.executionUnitClass)) continue;
    let incoming = 0;
    for (const p of predecessors.get(id) ?? []) {
      const through = longest.get(p); // only non-passive predecessors are recorded
      if (through !== undefined && through > incoming) incoming = through;
    }
    const total = incoming + unitBudgetMs(unit, constants);
    if (!Number.isSafeInteger(total)) throw new PlanDeadlineError('critical path overflows');
    longest.set(id, total);
    if (total > best) best = total;
  }
  return best;
}

/**
 * `computePlanDeadline(graph, grants, now, constants)` — `scan-deadline-contract.md`.
 *
 *  1. passive-only graph: `deadlineMs = legacyMaxDurationMs` (today's behaviour, byte-for-byte);
 *  2. otherwise `deadlineMs = L + C + M`, `L = legacyMaxDurationMs` iff the graph has a passive unit;
 *  3. `deadlineMs > ceiling` => refused `PLAN_DEADLINE_EXCEEDS_CEILING`;
 *  4. any grant with `expiresAt - now < deadlineMs` => refused `GRANT_EXPIRES_BEFORE_DEADLINE`
 *     (never silently clamped — a clamped plan could hold units that can never start).
 *
 * Throws `PlanGraphError` for an invalid graph and `PlanDeadlineError` for unusable numbers.
 */
export function computePlanDeadline(
  units: readonly DeadlineUnit[],
  edges: readonly GraphEdge[],
  grants: readonly GrantRef[],
  now: Date,
  constants: PlanDeadlineConstants = DEFAULT_PLAN_DEADLINE_CONSTANTS,
): PlanDeadlineResult {
  assertConstants(constants);
  if (Number.isNaN(now.getTime())) throw new PlanDeadlineError('now is not a valid date');
  // Validates the graph (throws PlanGraphError) and proves acyclicity before any arithmetic.
  topologicalOrder(units, edges);

  const hasNonPassive = units.some((u) => !isPassiveClass(u.executionUnitClass));
  const hasPassive = units.some((u) => isPassiveClass(u.executionUnitClass));

  let deadlineMs: number;
  let breakdown: Omit<DeadlineBreakdown, 'grantCapMs'>;
  if (!hasNonPassive) {
    deadlineMs = constants.legacyMaxDurationMs;
    breakdown = {
      passiveWindowMs: constants.legacyMaxDurationMs,
      criticalPathMs: 0,
      finalizationMarginMs: 0,
      ceilingMs: constants.planMaxDeadlineMs,
    };
  } else {
    const passiveWindowMs = hasPassive ? constants.legacyMaxDurationMs : 0;
    const critical = criticalPathMs(units, edges, constants);
    deadlineMs = passiveWindowMs + critical + constants.planFinalizationMarginMs;
    if (!Number.isSafeInteger(deadlineMs)) throw new PlanDeadlineError('deadline overflows');
    breakdown = {
      passiveWindowMs,
      criticalPathMs: critical,
      finalizationMarginMs: constants.planFinalizationMarginMs,
      ceilingMs: constants.planMaxDeadlineMs,
    };
  }

  if (deadlineMs > constants.planMaxDeadlineMs) return { refused: 'PLAN_DEADLINE_EXCEEDS_CEILING' };

  let grantCapMs: number | undefined;
  for (const grant of grants) {
    if (Number.isNaN(grant.expiresAt.getTime())) {
      throw new PlanDeadlineError(`grant ${grant.id} has an invalid expiresAt`);
    }
    const remaining = grant.expiresAt.getTime() - now.getTime();
    if (remaining < deadlineMs) return { refused: 'GRANT_EXPIRES_BEFORE_DEADLINE' };
    if (grantCapMs === undefined || remaining < grantCapMs) grantCapMs = remaining;
  }

  return {
    deadlineMs,
    breakdown: grantCapMs === undefined ? breakdown : { ...breakdown, grantCapMs },
  };
}

export interface DeadlineScan {
  /** Written exactly once, by the guarded QUEUED -> RUNNING_PHASE_1 transition; null before. */
  readonly startedAt: Date | null;
}

export interface DeadlinePlan {
  readonly kind: 'INITIAL' | 'REVERIFY';
  readonly state: 'RESOLVED' | 'REFUSED';
  /** Non-null iff `state = RESOLVED` (data-model invariant). */
  readonly deadlineMs: number | null;
  readonly resolvedAt: Date;
}

/**
 * `effectiveDeadlineAt(scan, plan?)` — derived at read time, never stored (contract "Anchor"):
 *   INITIAL plan:  `scan.startedAt + plan.deadlineMs`
 *   REVERIFY plan: `plan.resolvedAt + plan.deadlineMs`
 *   no plan:       `scan.startedAt + legacyMaxDurationMs` (legacy scans, today's behaviour)
 * A `REFUSED` plan is not a plan for this purpose (a scan whose only plan was refused is legacy).
 * Returns `null` while the anchor does not exist yet (`startedAt` null for INITIAL/legacy): a
 * non-passive unit of an INITIAL plan MUST NOT be dispatched while `Scan.startedAt` is null.
 */
export function effectiveDeadlineAt(
  scan: DeadlineScan,
  plan: DeadlinePlan | null | undefined,
  legacyMaxDurationMs: number,
): Date | null {
  assertPositiveInteger(legacyMaxDurationMs, 'legacyMaxDurationMs');
  if (plan === null || plan === undefined || plan.state !== 'RESOLVED') {
    return scan.startedAt === null
      ? null
      : new Date(scan.startedAt.getTime() + legacyMaxDurationMs);
  }
  if (plan.deadlineMs === null) {
    throw new PlanDeadlineError('a RESOLVED plan must carry deadlineMs (data-model invariant)');
  }
  assertPositiveInteger(plan.deadlineMs, 'plan.deadlineMs');
  if (plan.kind === 'REVERIFY') return new Date(plan.resolvedAt.getTime() + plan.deadlineMs);
  return scan.startedAt === null ? null : new Date(scan.startedAt.getTime() + plan.deadlineMs);
}

export type ScanTerminalState = 'TIMED_OUT' | 'CANCELLED' | 'FAILED';

export type DispatchDeadlineDecision =
  | { readonly action: 'PROCEED' }
  /** The anchor does not exist yet: do not dispatch a non-passive unit (the contract forbids it; it does not name a refusal). */
  | { readonly action: 'DEFER'; readonly reason: 'SCAN_NOT_STARTED' }
  | {
      readonly action: 'REFUSE';
      readonly reason:
        'SCAN_DEADLINE_EXPIRED' | 'SCAN_CANCELLED' | 'SCAN_FAILED' | 'SCAN_DEADLINE_INSUFFICIENT';
    };

/**
 * Dispatch step 0 (applies ONLY to non-passive units; runs BEFORE F07 `safetyCheckpoint`, so a refusal here
 * consumes no budget and acquires no lease). `now` MUST be the database clock.
 *   1. scan terminal, or `now >= effectiveDeadlineAt`  -> REFUSE with the scan-side reason;
 *   2. `effectiveDeadlineAt - now < timeoutPolicyMs + hardStopMarginMs` -> REFUSE `SCAN_DEADLINE_INSUFFICIENT`;
 *   3. otherwise PROCEED (to F07, exactly as before).
 * A terminal scan is reported by its own reason; a deadline-expired scan that the sweep already moved to
 * `TIMED_OUT` is `SCAN_DEADLINE_EXPIRED`.
 */
export function dispatchDeadlineDecision(input: {
  readonly now: Date;
  readonly effectiveDeadlineAt: Date | null;
  readonly scanTerminalState: ScanTerminalState | null;
  readonly unit: Pick<DeadlineUnit, 'timeoutPolicyMs' | 'hardStopMarginMs'>;
}): DispatchDeadlineDecision {
  const { now, effectiveDeadlineAt: deadline, scanTerminalState, unit } = input;
  if (scanTerminalState === 'CANCELLED') return { action: 'REFUSE', reason: 'SCAN_CANCELLED' };
  if (scanTerminalState === 'FAILED') return { action: 'REFUSE', reason: 'SCAN_FAILED' };
  if (scanTerminalState === 'TIMED_OUT')
    return { action: 'REFUSE', reason: 'SCAN_DEADLINE_EXPIRED' };
  if (deadline === null) return { action: 'DEFER', reason: 'SCAN_NOT_STARTED' };
  const remainingMs = deadline.getTime() - now.getTime();
  if (remainingMs <= 0) return { action: 'REFUSE', reason: 'SCAN_DEADLINE_EXPIRED' };
  if (remainingMs < dispatchThresholdMs(unit)) {
    return { action: 'REFUSE', reason: 'SCAN_DEADLINE_INSUFFICIENT' };
  }
  return { action: 'PROCEED' };
}
