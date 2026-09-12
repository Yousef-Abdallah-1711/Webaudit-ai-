/**
 * T101 — FR-038: "terminate an audit that exceeds its maximum permitted
 * duration, report it as timed out, and charge only for delivered areas."
 *
 * Three clauses, and the third is the one that costs money if it is wrong.
 * Principle VI: "Never charge for our failures." A scan that ran out of time
 * delivered some areas and not others, and the user must pay for the first group
 * and not the second — so the refund is computed from what actually landed, not
 * from a fraction of the quote or a flat "we timed out" gesture.
 *
 * **Delivered means scorable.** An area is delivered when it reached COMPLETE or
 * DEGRADED, which is exactly `MODULE_STATES_SCORED`: both measured something the
 * user can act on. FAILED, NOT_APPLICABLE, PENDING and RUNNING delivered nothing
 * and are refunded. Using "has a ModuleResult row" instead would charge for a row
 * written at PENDING, and using "has findings" would refund a clean area that
 * genuinely completed.
 *
 * **The sweep is idempotent, and it has to be.** It runs on a schedule, so two
 * runs can overlap, and a scan can finish between the query and the write. Every
 * termination goes through the optimistic guard in `state-machine.ts` from the
 * exact state the sweep observed — so a scan that completed in that window is a
 * `moved: false` and no refund is issued. A sweep that refunded twice would be
 * worse than one that never ran.
 *
 * **It never terminates a terminal scan.** `isTerminal` is checked before the
 * transition is attempted, and the guard would refuse anyway. Belt and braces,
 * because "the timeout sweep failed a completed audit and refunded it" is a
 * support ticket that costs more than the check.
 */

import {
  MODULE_STATES_SCORED,
  type ModuleState,
  type ModuleType,
  type ScanState,
} from '@webaudit/types';
import { refundForUndelivered } from '@webaudit/config';
import { isTerminal, transition, type ScanStateStore } from './state-machine.js';
import type { ScanEmitter } from './emit.js';

/** An area counts as delivered when it produced something scorable. */
export function isDelivered(state: ModuleState): boolean {
  return (MODULE_STATES_SCORED as readonly ModuleState[]).includes(state);
}

export interface TimedOutScan {
  readonly id: string;
  readonly state: ScanState;
  readonly quotedCredits: number;
  readonly chargedCredits: number;
  readonly requestedModules: readonly ModuleType[];
  readonly moduleResults: readonly { readonly module: ModuleType; readonly state: ModuleState }[];
}

/** A fresh, per-scan re-read — deliberately narrower than `TimedOutScan`:
 *  P0-TIMEOUT-1's fix reads only what the refund decision actually needs,
 *  immediately before making it, never from the batch snapshot. */
export interface FreshScanForRefund {
  readonly chargedCredits: number;
  readonly requestedModules: readonly ModuleType[];
  readonly moduleResults: readonly { readonly module: ModuleType; readonly state: ModuleState }[];
}

/**
 * What `terminate()` needs from inside its per-scan transaction: the guarded
 * write (`ScanStateStore`, for `transition()`) plus the fresh re-read
 * (P0-TIMEOUT-1). Deliberately **not** the full `TimeoutStore` — a real
 * Prisma transaction client cannot itself open a nested `$transaction`
 * (research.md Decision 5), so requiring one recursively here would be both
 * inaccurate and untestable.
 */
export interface TimeoutTransactionStore extends ScanStateStore {
  scan: ScanStateStore['scan'] & {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: {
        chargedCredits: true;
        requestedModules: true;
        moduleResults: { select: { module: true; state: true } };
      };
    }): Promise<FreshScanForRefund>;
  };
}

/** Only the reads and writes this module needs. */
export interface TimeoutStore extends ScanStateStore {
  scan: ScanStateStore['scan'] & {
    findMany(args: {
      where: { state: { in: readonly ScanState[] }; startedAt: { lt: Date } };
      select: {
        id: true;
        state: true;
        quotedCredits: true;
        chargedCredits: true;
        requestedModules: true;
        moduleResults: { select: { module: true; state: true } };
      };
    }): Promise<readonly TimedOutScan[]>;
  };
  /**
   * P0-TIMEOUT-1: the fresh re-read, the refund-amount computation, and the
   * guarded terminal transition all happen inside one transaction per scan —
   * see research.md Decision 5 for why `refund()` itself is deliberately
   * *not* nested in here (Prisma cannot nest an interactive transaction, and
   * `refund()` opens its own).
   */
  $transaction<T>(fn: (tx: TimeoutTransactionStore) => Promise<T>): Promise<T>;
}

/** Refunds go through the credit ledger, which walks allocations back to lots. */
export type Refunder = (input: {
  readonly scanId: string;
  readonly credits: number;
  readonly reason: string;
}) => Promise<void>;

export interface SweepOptions {
  readonly db: TimeoutStore;
  /** One per scan, bound to it. */
  readonly emitterFor: (scanId: string) => ScanEmitter;
  readonly refund: Refunder;
  /** FR-038's "maximum permitted duration". */
  readonly maxDurationMs: number;
  readonly now?: () => Date;
  /** A cap so one sweep cannot run for ever on a large backlog. */
  readonly batchSize?: number;
  /**
   * Test-only hook, called for each candidate immediately before its fresh
   * re-read/refund transaction opens — lets a test deterministically land a
   * `ModuleResult` write in the exact window P0-TIMEOUT-1's regression test
   * needs to prove (a module completing "during batch processing", i.e.
   * after the batch `findMany` but before this specific scan's own turn).
   * Never used in production.
   */
  readonly onBeforeScan?: (scanId: string) => Promise<void>;
}

/** States a scan can be timed out from — every non-terminal one. */
const SWEEPABLE: readonly ScanState[] = [
  'QUEUED',
  'RUNNING_PHASE_1',
  // Included on purpose. A user who never answered still occupies a scan, and
  // FR-041's deadline resumes it — but if the resume itself never happened, the
  // scan must not sit here for ever.
  'AWAITING_QUESTIONNAIRE',
  'RUNNING_PHASE_2',
  'RUNNING_PHASE_3',
  'RUNNING_MASTER',
  'RUNNING_DOCS',
];

export interface TimeoutOutcome {
  readonly scanId: string;
  readonly timedOut: boolean;
  readonly deliveredModules: readonly ModuleType[];
  readonly undeliveredModules: readonly ModuleType[];
  readonly creditsRefunded: number;
}

export { refundForUndelivered } from '@webaudit/config';

/**
 * Terminate every scan past its deadline.
 *
 * @returns one outcome per scan considered. `timedOut: false` means it finished
 *   or was cancelled between the query and the write — normal, and not an error.
 */
export async function sweepTimedOutScans(
  options: SweepOptions,
): Promise<readonly TimeoutOutcome[]> {
  const now = options.now?.() ?? new Date();
  const cutoff = new Date(now.getTime() - options.maxDurationMs);

  const candidates = await options.db.scan.findMany({
    where: { state: { in: SWEEPABLE }, startedAt: { lt: cutoff } },
    select: {
      id: true,
      state: true,
      quotedCredits: true,
      chargedCredits: true,
      requestedModules: true,
      moduleResults: { select: { module: true, state: true } },
    },
  });

  const outcomes: TimeoutOutcome[] = [];
  for (const scan of candidates.slice(0, options.batchSize ?? 50)) {
    await options.onBeforeScan?.(scan.id);
    outcomes.push(await terminate(options, scan));
  }
  return outcomes;
}

async function terminate(options: SweepOptions, scan: TimedOutScan): Promise<TimeoutOutcome> {
  // Belt and braces. The guard inside the transaction below would refuse
  // anyway, but there is no reason to open one for a scan the batch read
  // already knew was terminal.
  if (isTerminal(scan.state)) {
    const delivered = scan.moduleResults.filter((result) => isDelivered(result.state));
    const deliveredModules = delivered.map((result) => result.module);
    const undeliveredModules = scan.requestedModules.filter(
      (module) => !deliveredModules.includes(module),
    );
    return {
      scanId: scan.id,
      timedOut: false,
      deliveredModules,
      undeliveredModules,
      creditsRefunded: 0,
    };
  }

  // P0-TIMEOUT-1: everything the refund decision needs is re-read fresh here,
  // inside one transaction with the guarded terminal write — never from the
  // batch snapshot `scan` carries. A module that completed after the batch
  // `findMany` but before this scan's own turn (research.md Decision 5,
  // `apps/worker/tests/adverse/timeout-refund-staleness.test.ts`'s
  // `onBeforeScan` hook reproduces exactly this) is now correctly seen as
  // delivered, not refunded.
  let deliveredModules: readonly ModuleType[] = [];
  let undeliveredModules: readonly ModuleType[] = [];
  let creditsRefunded = 0;
  let moved = false;
  let failureReason = '';

  await options.db.$transaction(async (tx) => {
    const fresh = await tx.scan.findUniqueOrThrow({
      where: { id: scan.id },
      select: {
        chargedCredits: true,
        requestedModules: true,
        moduleResults: { select: { module: true, state: true } },
      },
    });
    const delivered = fresh.moduleResults.filter((result) => isDelivered(result.state));
    deliveredModules = delivered.map((result) => result.module);
    undeliveredModules = fresh.requestedModules.filter(
      (module) => !deliveredModules.includes(module),
    );
    creditsRefunded = refundForUndelivered({
      chargedCredits: fresh.chargedCredits,
      requestedCount: fresh.requestedModules.length,
      deliveredCount: deliveredModules.length,
    });
    failureReason =
      `The audit exceeded its maximum permitted duration. ` +
      `${String(deliveredModules.length)} of ${String(fresh.requestedModules.length)} areas were ` +
      `delivered and charged for; the rest were refunded.`;

    // Guarded on the state the sweep observed. A scan that completed in the
    // meantime loses nothing and is refunded nothing.
    const outcome = await transition(tx, {
      scanId: scan.id,
      from: scan.state,
      to: 'TIMED_OUT',
      extra: { failureReason },
    });
    moved = outcome.moved;
  });

  const empty: TimeoutOutcome = {
    scanId: scan.id,
    timedOut: false,
    deliveredModules,
    undeliveredModules,
    creditsRefunded: 0,
  };
  if (!moved) return empty;

  // Refunded only after the state moved, so a refund cannot be issued twice: the
  // second sweep's guard fails and never reaches this line.
  if (creditsRefunded > 0) {
    await options.refund({
      scanId: scan.id,
      credits: creditsRefunded,
      reason: `timeout:${String(undeliveredModules.length)}-areas-undelivered`,
    });
  }

  await options.emitterFor(scan.id).emit(
    {
      type: 'scan:failed',
      scanId: scan.id,
      reason: 'The audit exceeded its maximum permitted duration and was stopped.',
      creditsRefunded,
    },
    // The transition above already persisted it.
    () => Promise.resolve(),
  );

  return {
    scanId: scan.id,
    timedOut: true,
    deliveredModules,
    undeliveredModules,
    creditsRefunded,
  };
}
