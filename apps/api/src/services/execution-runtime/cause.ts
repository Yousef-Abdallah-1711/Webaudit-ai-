/**
 * `classifyPreRunCause` — the one cause-precedence procedure every writer uses (U-1b v6 §6, DEC-058):
 * terminal -> stop pending -> scan ended -> deadline passed -> too little time left. The first match wins,
 * evaluated on the database clock. Reads only; it never writes.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';
import { findPendingStop } from '../safety/kill-switch-state.js';
import {
  DEFAULT_PLAN_DEADLINE_CONSTANTS,
  dispatchDeadlineDecision,
  effectiveDeadlineAt,
} from '../planning/plan-deadline.js';
import { isTerminalUnitStatus, type ExecutionUnitStatus } from '../planning/graph.js';

export type PreRunCause =
  | { cause: 'NONE' }
  | { cause: 'TERMINAL'; status: ExecutionUnitStatus }
  | { cause: 'KILL_SWITCH_PENDING'; scope: string; scopeId: string }
  | {
      cause:
        'SCAN_CANCELLED' | 'SCAN_FAILED' | 'SCAN_DEADLINE_EXPIRED' | 'SCAN_DEADLINE_INSUFFICIENT';
    }
  /** Not a refusal: the contract forbids dispatching before `Scan.startedAt` exists, so the caller waits. */
  | { cause: 'SCAN_NOT_STARTED' };

export interface CauseUnit {
  id: string;
  userId: string;
  status: string;
  targetId: string;
  targetAuthorizationId: string | null;
  scanPlanId: string;
  timeoutPolicyMs: number;
}

export interface CauseOptions {
  /** `PRE_RUN` also applies the "enough time left" rule; once `RUNNING` only the hard end matters. */
  phase: 'PRE_RUN' | 'RUNNING';
  /** Engine-declared per class; the contract default is 60 000. */
  hardStopMarginMs?: number;
  legacyMaxDurationMs?: number;
}

/** The database clock, so a skewed worker clock can never move a deadline. */
export async function dbNow(db: SafetyDb): Promise<Date> {
  const rows = await db.$queryRaw<Array<{ now: Date }>>(
    Prisma.sql`SELECT clock_timestamp() AS now`,
  );
  const now = rows[0]?.now;
  if (now === undefined) throw new Error('database clock unavailable');
  return now;
}

export async function classifyPreRunCause(
  db: SafetyDb,
  unit: CauseUnit,
  options: CauseOptions,
): Promise<PreRunCause & { now: Date }> {
  const now = await dbNow(db);
  if (isTerminalUnitStatus(unit.status as ExecutionUnitStatus)) {
    return { cause: 'TERMINAL', status: unit.status as ExecutionUnitStatus, now };
  }
  const plan = await db.scanPlan.findUnique({
    where: { id: unit.scanPlanId },
    select: { kind: true, state: true, deadlineMs: true, resolvedAt: true, scanId: true },
  });
  const scan =
    plan?.scanId === null || plan?.scanId === undefined
      ? null
      : await db.scan.findUnique({
          where: { id: plan.scanId },
          select: { state: true, startedAt: true },
        });

  const stop = await findPendingStop(db, {
    executionId: unit.id,
    scanId: plan?.scanId ?? null,
    grantId: unit.targetAuthorizationId ?? '',
    targetId: unit.targetId,
    userId: unit.userId,
  });
  if (stop !== null) {
    return { cause: 'KILL_SWITCH_PENDING', scope: stop.scope, scopeId: stop.scopeId, now };
  }

  const legacy = options.legacyMaxDurationMs ?? DEFAULT_PLAN_DEADLINE_CONSTANTS.legacyMaxDurationMs;
  const scanTerminalState =
    scan?.state === 'CANCELLED' || scan?.state === 'FAILED' || scan?.state === 'TIMED_OUT'
      ? scan.state
      : null;
  const deadline =
    plan === null
      ? null
      : effectiveDeadlineAt({ startedAt: scan?.startedAt ?? null }, plan, legacy);
  const decision = dispatchDeadlineDecision({
    now,
    effectiveDeadlineAt: deadline,
    scanTerminalState,
    // RUNNING: only the hard end applies, so the "enough time left" threshold is zero.
    unit:
      options.phase === 'PRE_RUN'
        ? {
            timeoutPolicyMs: unit.timeoutPolicyMs,
            hardStopMarginMs: options.hardStopMarginMs ?? 60_000,
          }
        : { timeoutPolicyMs: 0, hardStopMarginMs: 0 },
  });
  if (decision.action === 'REFUSE') return { cause: decision.reason, now };
  if (decision.action === 'DEFER') {
    // A RUNNING unit already passed the start gate; a missing anchor cannot refuse it.
    return options.phase === 'PRE_RUN'
      ? { cause: 'SCAN_NOT_STARTED', now }
      : { cause: 'NONE', now };
  }
  return { cause: 'NONE', now };
}
