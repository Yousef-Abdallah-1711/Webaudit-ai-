/**
 * T148 — the issue state machine, with exactly one inbound edge to RESOLVED.
 *
 * SC-007, stated adversarially: "Zero issues turn green without a check
 * passing, verified by adversarial testing in which issues are falsely
 * asserted as fixed." `@webaudit/types`' `ISSUE_STATE_TRANSITIONS` already
 * encodes the shape — `RESOLVED` appears on exactly one right-hand side,
 * `ASSERTED_FIXED`'s, and no user action is anywhere in that table. This file
 * is the runtime enforcement of it: the two things the rest of the fix loop is
 * allowed to do to an issue's state, and nothing else.
 *
 * **`outcomeToState` is the single place a verification outcome becomes a
 * state**, and it is a total function over `VerificationOutcome` with `PASSED`
 * the only branch that yields `RESOLVED`. `recordVerificationAttempt`
 * (`attempts.ts`) calls it inside the same transaction that writes the
 * `VerificationAttempt` row, and re-asserts the invariant at runtime before
 * the write — a brand on a type stops honest code, and a second check stops a
 * cast, the same two locks `attribute.ts` and `RedactedPrompt` use.
 *
 * No function here writes anything. They compute the next state and validate
 * the edge; persistence is `attempts.ts`'s job, under an optimistic guard.
 */

import {
  canTransition as canIssueTransition,
  type IssueState,
  type VerificationOutcome,
} from '@webaudit/types';

/**
 * The states a user may assert a fix from. `OPEN` is the ordinary case;
 * `UNVERIFIABLE` and `REOPENED` are both "the issue is outstanding again" and
 * the user is entitled to try once more. `ASSERTED_FIXED` is deliberately
 * absent — a second assertion while one is in flight is a no-op, not a new
 * charge (enforced by the guard in `attempts.ts` and the route in
 * `issues.routes.ts`), and `RESOLVED` is absent because a resolved issue is
 * not asserted-fixed again, it recurs (`recurrence.ts`) and comes back as
 * `REOPENED`.
 */
export const ASSERTABLE_FROM: readonly IssueState[] = ['OPEN', 'UNVERIFIABLE', 'REOPENED'];

export class IssueNotAssertableError extends Error {
  override readonly name = 'IssueNotAssertableError';
  constructor(readonly current: IssueState) {
    super(
      `An issue in ${current} cannot be asserted fixed. ` +
        `Assert-fixed is valid only from ${ASSERTABLE_FROM.join(', ')}.`,
    );
  }
}

export function canAssertFixed(from: IssueState): boolean {
  return ASSERTABLE_FROM.includes(from);
}

/**
 * The transition a user's assertion produces: into `ASSERTED_FIXED`, and no
 * further. It does not resolve anything — that waits on a check.
 */
export function assertFixedTransition(from: IssueState): 'ASSERTED_FIXED' {
  if (!canAssertFixed(from)) throw new IssueNotAssertableError(from);
  // Belt and braces: the shared table must agree that this edge exists.
  if (!canIssueTransition(from, 'ASSERTED_FIXED')) throw new IssueNotAssertableError(from);
  return 'ASSERTED_FIXED';
}

/**
 * A re-verification outcome, mapped to the state it produces from
 * `ASSERTED_FIXED`. Total over `VerificationOutcome`.
 *
 *   PASSED       → RESOLVED       the one and only path to green
 *   FAILED       → OPEN           the fix did not hold; the user sees the evidence
 *   UNVERIFIABLE → UNVERIFIABLE   FR-063: the check can no longer be performed
 *   ERRORED      → OPEN           our fault, not the fix's — refunded, and retryable
 */
export function outcomeToState(outcome: VerificationOutcome): IssueState {
  switch (outcome) {
    case 'PASSED':
      return 'RESOLVED';
    case 'FAILED':
      return 'OPEN';
    case 'UNVERIFIABLE':
      return 'UNVERIFIABLE';
    case 'ERRORED':
      return 'OPEN';
  }
}

/**
 * SC-007 as an assertion. The only legal way to reach `RESOLVED` is a
 * `PASSED` outcome; every caller that writes state goes through here first.
 */
export function assertResolvedOnlyOnPass(outcome: VerificationOutcome, next: IssueState): void {
  if (next === 'RESOLVED' && outcome !== 'PASSED') {
    throw new Error(
      `Refusing to resolve an issue on a ${outcome} outcome. RESOLVED has exactly one ` +
        'inbound edge and its only trigger is a passing check (SC-007).',
    );
  }
}

/**
 * Whether an outcome means the platform did not deliver a verdict the user
 * can act on, and the re-check charge should be returned (FR-075). A `FAILED`
 * re-check *is* a delivered verdict — the user learns their fix did not hold —
 * so it stays charged; `ERRORED` (we could not run the check) is refunded, and
 * so is `UNVERIFIABLE` (we have no way to check this issue at all — that is a
 * gap in our coverage, not a service the user should pay for).
 */
export function outcomeIsRefundable(outcome: VerificationOutcome): boolean {
  return outcome === 'ERRORED' || outcome === 'UNVERIFIABLE';
}

/** The timestamp column an outcome's resulting state fills, if any. */
export function timestampFieldFor(next: IssueState): 'resolvedAt' | 'reopenedAt' | null {
  if (next === 'RESOLVED') return 'resolvedAt';
  if (next === 'REOPENED') return 'reopenedAt';
  return null;
}
