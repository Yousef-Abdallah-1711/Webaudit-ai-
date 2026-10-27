/**
 * Errors for the SPEC 007 grant-lifecycle operations
 * (`contracts/grant-lifecycle-contract.md`).
 */

/**
 * The target or grant does not exist **or** is not the caller's. The two are
 * deliberately indistinguishable (FR-019): distinguishing them would turn the
 * endpoint into an oracle for which ids are real.
 */
export class AuthorizationNotFoundError extends Error {
  override readonly name = 'AuthorizationNotFoundError';
  readonly code = 'NOT_FOUND';
  constructor(readonly subjectId: string) {
    super(`${subjectId} is not available to this account.`);
  }
}

export type AuthorizationValidationCode =
  | 'EXECUTION_CLASSES_INVALID'
  | 'ENVIRONMENT_RESTRICTION_INVALID'
  | 'PRODUCTION_NOT_PERMITTED'
  | 'BUDGET_OUT_OF_RANGE'
  | 'SCOPE_KIND_MISMATCH'
  | 'SCOPE_MALFORMED'
  | 'SCOPE_NOT_BOUNDED_TO_TARGET'
  | 'GRANT_NOT_ACTIVE';

export class AuthorizationValidationError extends Error {
  override readonly name = 'AuthorizationValidationError';
  constructor(
    readonly code: AuthorizationValidationCode,
    message: string,
  ) {
    super(message);
  }
}
