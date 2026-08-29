/**
 * T095 — the resumable scan state machine.
 *
 * R4's decision in one sentence: "Split the audit into resumable jobs; never
 * block on human input." That only works if the state is the record of where the
 * audit is, rather than a variable inside a running job. So every transition goes
 * through here, and the table below is the whole contract.
 *
 * **Transitions are guarded optimistically, and that guard is the R4 race.**
 * When the design phase waits for intent, two things can arrive: the user's
 * answers, or the delayed timeout job at the deadline. Both try to move the scan
 * out of `AWAITING_QUESTIONNAIRE`. Exactly one must win, and the loser must be a
 * no-op rather than an error — the user answering two seconds before the deadline
 * is not a fault, and neither is a timeout firing while an answer is in flight.
 *
 * `transition` therefore takes the state it *expects* and updates conditionally
 * on it. The database decides, in one statement; whoever's `UPDATE` matches zero
 * rows lost and returns `{ moved: false }`. No locks, no read-then-write window —
 * this is the same shape as the credit debit's guard (finding C2 taught this
 * repository that `findUnique` then write is not a guard).
 *
 * **Terminal states are terminal.** `COMPLETED`, `FAILED`, `CANCELLED` and
 * `TIMED_OUT` have no outgoing edges. A late phase job finishing after a
 * cancellation must not resurrect the scan, and a timeout sweep must not fail a
 * scan that completed a moment earlier.
 *
 * **Terminal observers (T104).** `COMPLETED`, `FAILED`, and `TIMED_OUT` are
 * written here and nowhere else, so this is the one place that can guarantee
 * something happens on every exit path *this process actually takes*. FR-090
 * needs the scan workspace destroyed on completion, failure, timeout and
 * cancellation too — but `CANCELLED` is the one state this function never
 * writes: `apps/api`'s `/scans/:id/cancel` route sets it directly, in a
 * different process, without calling `transition`. An observer registered
 * here therefore covers three of the four exit paths by construction, not
 * all four; cancellation's workspace teardown is a known, separate gap (see
 * `workspace/teardown.ts`'s module note). Observers run only after a
 * transition actually moved the row, so a lost race does not fire them, and
 * an observer that throws is reported and swallowed: the state is already
 * committed, and failing a finished audit because its scratch directory
 * would not delete is the wrong trade.
 */

import { SCAN_STATES_TERMINAL, type ScanState } from '@webaudit/types';

/**
 * Legal transitions. Anything absent is refused.
 *
 * `AWAITING_QUESTIONNAIRE` is reachable only from phase 1 and leads only into
 * phase 2 — it is a pause in the middle of the audit, not a state an audit can
 * start or finish in.
 */
const ALLOWED: Readonly<Record<ScanState, readonly ScanState[]>> = {
  QUEUED: ['RUNNING_PHASE_1', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  RUNNING_PHASE_1: [
    'AWAITING_QUESTIONNAIRE',
    // Skipped straight past when no area needs design intent (FR-043), or when
    // the user skipped the questionnaire outright (FR-042).
    'RUNNING_PHASE_2',
    'CANCELLED',
    'FAILED',
    'TIMED_OUT',
  ],
  AWAITING_QUESTIONNAIRE: ['RUNNING_PHASE_2', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  RUNNING_PHASE_2: ['RUNNING_PHASE_3', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  RUNNING_PHASE_3: ['RUNNING_MASTER', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  RUNNING_MASTER: ['RUNNING_DOCS', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  RUNNING_DOCS: ['COMPLETED', 'CANCELLED', 'FAILED', 'TIMED_OUT'],
  // Terminal. No outgoing edges, deliberately — see the module note.
  COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
  TIMED_OUT: [],
};

/** The phase order, for progress and for deciding what comes next. */
export const PHASE_ORDER: readonly ScanState[] = [
  'RUNNING_PHASE_1',
  'RUNNING_PHASE_2',
  'RUNNING_PHASE_3',
  'RUNNING_MASTER',
  'RUNNING_DOCS',
];

export function isTerminal(state: ScanState): boolean {
  return (SCAN_STATES_TERMINAL as readonly ScanState[]).includes(state);
}

export function canTransition(from: ScanState, to: ScanState): boolean {
  return (ALLOWED[from] ?? []).includes(to);
}

/**
 * Progress, derived from the phase reached.
 *
 * Derived from position rather than from elapsed time on purpose: a time-based
 * bar that reaches 90% and stops is worse than no bar, and FR-044 asks for
 * progress, not for an estimate. `AWAITING_QUESTIONNAIRE` holds phase 1's number
 * because nothing has advanced — the audit is waiting, and a bar that creeps
 * while nothing happens is a lie.
 */
export function progressPercentFor(state: ScanState): number {
  switch (state) {
    case 'QUEUED':
      return 0;
    case 'RUNNING_PHASE_1':
      return 15;
    case 'AWAITING_QUESTIONNAIRE':
      return 15;
    case 'RUNNING_PHASE_2':
      return 40;
    case 'RUNNING_PHASE_3':
      return 60;
    case 'RUNNING_MASTER':
      return 80;
    case 'RUNNING_DOCS':
      return 92;
    case 'COMPLETED':
      return 100;
    // Also 100, and deliberately so despite the name of this function: an
    // early-ended scan did not reach 100 through phase progress, but nothing
    // further is coming, and freezing the bar mid-way reads as "stuck", not
    // "stopped". `moveAndAnnounce` puts `state` in the same event this number
    // travels with, so a client is never told to *infer* success from the
    // number alone — the bar is full and `state` says why.
    case 'FAILED':
    case 'CANCELLED':
    case 'TIMED_OUT':
      return 100;
  }
}

export type TransitionOutcome =
  | { readonly moved: true; readonly from: ScanState; readonly to: ScanState }
  /** Lost the race, or the edge is illegal. Never an error — see the module note. */
  | {
      readonly moved: false;
      readonly reason: 'ILLEGAL' | 'LOST_RACE';
      readonly current: ScanState | null;
    };

/** Only the model and methods this module touches. */
export interface ScanStateStore {
  scan: {
    updateMany(args: {
      where: { id: string; state: ScanState };
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
    findUnique(args: {
      where: { id: string };
      select: { state: true };
    }): Promise<{ state: ScanState } | null>;
  };
}

/** What an observer is told about a scan that just ended. */
export interface TerminalTransition {
  readonly scanId: string;
  readonly from: ScanState;
  readonly to: ScanState;
}

export type TerminalObserver = (info: TerminalTransition) => void | Promise<void>;

/**
 * Observers of terminal transitions, in registration order.
 *
 * Module-level on purpose. The alternative — threading a hook through every
 * caller of `transition` — makes the guarantee opt-in at four call sites, which
 * is precisely the failure mode FR-090 keeps producing in other systems. Wired
 * once at worker boot; the returned function unregisters, which tests need so one
 * suite's observer does not fire during the next.
 */
const terminalObservers = new Set<TerminalObserver>();

export function onTerminalTransition(observer: TerminalObserver): () => void {
  terminalObservers.add(observer);
  return () => {
    terminalObservers.delete(observer);
  };
}

/**
 * Run the observers for a scan that has just ended.
 *
 * Awaited, so a caller that has seen `moved: true` for a terminal state knows the
 * teardown has been attempted — that is what makes SC-015 assertable rather than
 * eventually true. Each observer is isolated: one throwing must not stop the
 * next, and none of them can fail the transition, which has already committed.
 */
async function notifyTerminal(info: TerminalTransition): Promise<void> {
  for (const observer of [...terminalObservers]) {
    try {
      await observer(info);
    } catch (error) {
      console.warn(
        `[orchestrator] a terminal observer for scan ${info.scanId} (${info.to}) failed; ` +
          'the transition stands',
        error,
      );
    }
  }
}

export interface TransitionInput {
  readonly scanId: string;
  /** The state the caller believes the scan is in. The guard. */
  readonly from: ScanState;
  readonly to: ScanState;
  /** Written alongside the state, in the same statement. */
  readonly extra?: Record<string, unknown>;
}

/**
 * Move a scan, conditionally on it still being where the caller thinks.
 *
 * @returns `moved: false` when the edge is illegal or the race was lost. Callers
 *   treat that as "someone else already handled this" and stop, which is what
 *   makes both sides of the questionnaire race safe to run.
 */
export async function transition(
  db: ScanStateStore,
  input: TransitionInput,
): Promise<TransitionOutcome> {
  if (!canTransition(input.from, input.to)) {
    // Checked before touching the database: an illegal edge is a programming
    // error, and reporting it as a lost race would hide it.
    return { moved: false, reason: 'ILLEGAL', current: input.from };
  }

  const now = new Date();
  const data: Record<string, unknown> = { state: input.to, ...input.extra };

  // Timestamps belong to the transition that caused them, not to a later write
  // that might never happen.
  if (input.to === 'RUNNING_PHASE_1' && input.from === 'QUEUED') data['startedAt'] = now;
  if (isTerminal(input.to)) data['completedAt'] = now;

  // The guard. One statement; the database picks the winner.
  const result = await db.scan.updateMany({
    where: { id: input.scanId, state: input.from },
    data,
  });

  if (result.count === 1) {
    // Only on a win, and only for a terminal state. A lost race must not run
    // teardown: the scan the caller thought it was ending is still running, and
    // its source is what the audit is reading.
    if (isTerminal(input.to)) {
      await notifyTerminal({ scanId: input.scanId, from: input.from, to: input.to });
    }
    return { moved: true, from: input.from, to: input.to };
  }

  const current = await db.scan.findUnique({
    where: { id: input.scanId },
    select: { state: true },
  });
  return { moved: false, reason: 'LOST_RACE', current: current?.state ?? null };
}

/**
 * Which phase follows this one. Null at the end, and null for a terminal state.
 *
 * Used by `phases.ts` to enqueue the next job rather than by anything deciding
 * whether to continue — a cancelled scan has no next phase, and asking is how a
 * cancellation gets ignored.
 */
export function nextPhase(state: ScanState): ScanState | null {
  if (isTerminal(state)) return null;
  const index = PHASE_ORDER.indexOf(state);
  if (index === -1) return null;
  return PHASE_ORDER[index + 1] ?? 'COMPLETED';
}
