/**
 * Failure classification (FR-023, research R9/R9a): a pure, deterministic mapping from what actually
 * happened to one `FailureClass`. The owning worker's finalization code calls this; an engine never
 * self-reports its own class. A measured result is `COMPLETED`, never a failure (R9a), and
 * `DETERMINISTIC_FINDING` is never returned as a stored class.
 */

import type { FailureClass } from '../../../prisma/generated/client/index.js';

export type UnitObservation =
  /** The engine measured something and reported it — even a negative-looking one (HTTP 500, probe succeeded). */
  | { source: 'ENGINE_RESULT' }
  /** An uncaught exception inside the engine's own code in the child process. */
  | { source: 'ENGINE_EXCEPTION' }
  /** The parent-armed hard stop fired with no prior result. */
  | { source: 'HARD_STOP_DEADLINE' }
  /** F07 `STOP` at a checkpoint (authorization, scope, budget, kill switch). */
  | { source: 'F07_STOP' }
  /** A network/database/queue error with no engine-code frame involved. */
  | { source: 'INFRASTRUCTURE_ERROR' }
  /** The target itself could not be reached. */
  | { source: 'TARGET_UNREACHABLE' }
  /** The unit's own configuration was malformed at dispatch time. */
  | { source: 'INVALID_CONFIGURATION' }
  /** `SOURCE_EXECUTION`: the customer's own build/test/lint exited with `exitCode`. */
  | { source: 'CUSTOMER_CODE_EXIT'; exitCode: number }
  /** A third-party provider Fahes depends on failed. */
  | { source: 'EXTERNAL_DEPENDENCY_ERROR' };

export type Classification =
  | { outcome: 'COMPLETED' }
  | { outcome: 'FAILED'; failureClass: Exclude<FailureClass, 'DETERMINISTIC_FINDING'> };

export function classifyFailure(observation: UnitObservation): Classification {
  switch (observation.source) {
    case 'ENGINE_RESULT':
      return { outcome: 'COMPLETED' };
    case 'CUSTOMER_CODE_EXIT':
      // A nonzero exit is the customer's result, reported as such; zero is success.
      return Number.isInteger(observation.exitCode) && observation.exitCode === 0
        ? { outcome: 'COMPLETED' }
        : { outcome: 'FAILED', failureClass: 'CUSTOMER_CODE_FAILURE' };
    case 'ENGINE_EXCEPTION':
      return { outcome: 'FAILED', failureClass: 'ENGINE_DEFECT' };
    case 'HARD_STOP_DEADLINE':
      return { outcome: 'FAILED', failureClass: 'TIMEOUT' };
    case 'F07_STOP':
      return { outcome: 'FAILED', failureClass: 'SAFETY_REFUSED' };
    case 'INFRASTRUCTURE_ERROR':
      return { outcome: 'FAILED', failureClass: 'TRANSIENT_INFRASTRUCTURE' };
    case 'TARGET_UNREACHABLE':
      return { outcome: 'FAILED', failureClass: 'TARGET_UNAVAILABLE' };
    case 'INVALID_CONFIGURATION':
      return { outcome: 'FAILED', failureClass: 'INVALID_CONFIGURATION' };
    case 'EXTERNAL_DEPENDENCY_ERROR':
      return { outcome: 'FAILED', failureClass: 'EXTERNAL_DEPENDENCY_FAILURE' };
    default: {
      // An unknown observation must never be read as success: fail closed as an engine defect.
      return { outcome: 'FAILED', failureClass: 'ENGINE_DEFECT' };
    }
  }
}

/** Classes FR-023 forbids retrying automatically, whatever a policy lists. */
export const NEVER_AUTO_RETRIED: ReadonlySet<FailureClass> = new Set<FailureClass>([
  'SAFETY_REFUSED',
  'ENGINE_DEFECT',
  'INVALID_CONFIGURATION',
  'CUSTOMER_CODE_FAILURE',
  'DETERMINISTIC_FINDING',
]);

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly eligibleFailureClasses: readonly FailureClass[];
}

/** A retry needs: a retryable class, the policy listing it, and an attempt left (FR-023/FR-024). */
export function isRetryEligible(
  failureClass: FailureClass,
  policy: RetryPolicy,
  attempt: number,
): boolean {
  if (!Number.isInteger(attempt) || attempt < 1) return false;
  if (!Number.isInteger(policy.maxAttempts) || policy.maxAttempts < 1) return false;
  if (NEVER_AUTO_RETRIED.has(failureClass)) return false;
  return policy.eligibleFailureClasses.includes(failureClass) && attempt < policy.maxAttempts;
}
