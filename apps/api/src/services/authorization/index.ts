/**
 * SPEC 007 (F01) authorization service — public surface.
 *
 * Phase 3 (User Story 1):
 *   - createAuthorization   grant a scoped permission (owner-only, bounded to the Target)
 *   - classifyEnvironment   set a Target's single current environment (owner-only)
 *   - isAuthorized          decision: is this class allowed against this destination now
 *   - isInScope             pure: does a ScopeDefinition admit this one destination
 *
 * Phase 4 (User Story 2):
 *   - revokeAuthorization   end a grant now (owner, or a verified operator as a safety action)
 *
 * Phase 5 (User Story 3):
 *   - narrowAuthorization   replace a live grant with a narrower one (owner-only; atomic; never an in-place edit)
 *
 * Lifecycle state is derived live by `derive-state.ts` (used by `isAuthorized`;
 * deliberately not exported — callers ask `isAuthorized`, never re-derive state).
 *
 * There is deliberately no operation that edits a `ScopeDefinition` (FR-009):
 * a scope is created new or left alone.
 */

export { createAuthorization, AUTHORIZATION_LIMITS } from './create.js';
export type { CreateAuthorizationDb } from './create.js';
export { classifyEnvironment } from './classify-environment.js';
export type { ClassifyEnvironmentDb, ClassifyEnvironmentInput } from './classify-environment.js';
export { narrowAuthorization } from './narrow.js';
export type { NarrowAuthorizationDb, NarrowAuthorizationInput } from './narrow.js';
export { revokeAuthorization } from './revoke.js';
export type { RevokeAuthorizationDb, RevokeAuthorizationInput } from './revoke.js';
export { isAuthorized } from './check.js';
export type {
  AuthorizationCheckDb,
  AuthorizationCheckInput,
  AuthorizationGrantRow,
  AuthzResult,
} from './check.js';
export type { AuthorizationState, BudgetConsumption } from './derive-state.js';
export { isInScope, normalizeHost, normalizePath } from './scope-match.js';
export type { RepositoryDestination, ScopeDefinitionData, WebDestination } from './scope-match.js';
export { AuthorizationNotFoundError, AuthorizationValidationError } from './errors.js';
export type { AuthorizationValidationCode } from './errors.js';
export type {
  AuthorizationBudgets,
  CreateAuthorizationInput,
  ScopeDefinitionInput,
} from './types.js';
