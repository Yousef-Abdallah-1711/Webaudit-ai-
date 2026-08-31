/**
 * The fix-loop issue services, re-exported for `apps/worker` through the
 * `@webaudit/api/issues` package subpath — the same shape `@webaudit/api/credits`
 * and `@webaudit/api/control-gate` use. `apps/worker`'s re-verification runner
 * (T150) resolves an outcome and hands it to `recordVerificationAttempt` here;
 * the orchestrator calls `markRecurrences` when a scan's areas are all written.
 */

export {
  ASSERTABLE_FROM,
  IssueNotAssertableError,
  assertFixedTransition,
  assertResolvedOnlyOnPass,
  canAssertFixed,
  outcomeIsRefundable,
  outcomeToState,
  timestampFieldFor,
} from './state-machine.js';

export {
  VerificationEvidenceMissingError,
  listVerificationAttempts,
  recordVerificationAttempt,
  type RecordAttemptInput,
  type RecordAttemptResult,
} from './attempts.js';

export { markRecurrences, type MarkRecurrencesResult } from './recurrence.js';
