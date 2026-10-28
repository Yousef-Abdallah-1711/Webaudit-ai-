/**
 * SPEC 008 `data-model.md` — `KillSwitchState.state` may only move
 * `REQUESTED -> ACKNOWLEDGED -> STOPPED`. One table, same shape as
 * `apps/worker/src/orchestrator/state-machine.ts`, so no call site grows its own
 * ad hoc conditionals. `REQUESTED -> STOPPED` is deliberately absent: a stop is
 * never recorded without an acknowledgement (DEC-049, the reconciler included).
 *
 * The database functions (`f07_*`) enforce the same edges; this table is the
 * TypeScript-side mirror, checked against the database by the contract tests.
 */

import { STOP_LIFECYCLE_STATES, type StopLifecycleState } from '@webaudit/types';

export { STOP_LIFECYCLE_STATES };
export type { StopLifecycleState };

export const STOP_ALLOWED: Record<StopLifecycleState, readonly StopLifecycleState[]> = {
  REQUESTED: ['ACKNOWLEDGED'],
  ACKNOWLEDGED: ['STOPPED'],
  STOPPED: [],
};

export function isAllowedStopTransition(from: StopLifecycleState, to: StopLifecycleState): boolean {
  return STOP_ALLOWED[from].includes(to);
}

/** A stop that has been requested but not completed still blocks admission (fail closed). */
export function isStopPending(state: StopLifecycleState): boolean {
  return state === 'REQUESTED' || state === 'ACKNOWLEDGED';
}
