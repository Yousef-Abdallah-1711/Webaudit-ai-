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
    outcomes.push(await terminate(options, scan));
  }
  return outcomes;
}

async function terminate(options: SweepOptions, scan: TimedOutScan): Promise<TimeoutOutcome> {
  const delivered = scan.moduleResults.filter((result) => isDelivered(result.state));
  const deliveredModules = delivered.map((result) => result.module);
  const undeliveredModules = scan.requestedModules.filter(
    (module) => !deliveredModules.includes(module),
  );

  const empty: TimeoutOutcome = {
    scanId: scan.id,
    timedOut: false,
    deliveredModules,
    undeliveredModules,
    creditsRefunded: 0,
  };

  // Belt and braces. The guard below would refuse anyway.
  if (isTerminal(scan.state)) return empty;

  const creditsRefunded = refundForUndelivered({
    chargedCredits: scan.chargedCredits,
    requestedCount: scan.requestedModules.length,
    deliveredCount: deliveredModules.length,
  });

  // Guarded on the state the sweep observed. A scan that completed in the
  // meantime loses nothing and is refunded nothing.
  const moved = await transition(options.db, {
    scanId: scan.id,
    from: scan.state,
    to: 'TIMED_OUT',
    extra: {
      failureReason:
        `The audit exceeded its maximum permitted duration. ` +
        `${String(deliveredModules.length)} of ${String(scan.requestedModules.length)} areas were ` +
        `delivered and charged for; the rest were refunded.`,
    },
  });

  if (!moved.moved) return empty;

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
