/**
 * T015 — SPEC 007 `contracts/grant-lifecycle-contract.md`, `createAuthorization`
 * (FR-001/FR-004/FR-006/FR-007/FR-011/FR-015a/FR-018/FR-019).
 *
 * Preconditions run in the contract's stated order and refuse before anything
 * is written, so a refused grant leaves no `ScopeDefinition`, no
 * `TargetAuthorization` and no audit row:
 *
 *   1. the Target is the requester's          (else not-found, FR-019)
 *   2. live control level is ATTESTED or more (existing `reconfirmControl`)
 *   3. executionClasses valid, non-empty, unique
 *   4. environmentRestriction valid, non-empty
 *  4a. no PRODUCTION alongside ACTIVE_SECURITY / AUTHENTICATED_WORKFLOW /
 *      LOAD_CAPACITY (SOURCE_EXECUTION deliberately exempt, FR-015a)
 *   5. budgets within FR-011's platform maximums
 *   6. scope.targetKind matches the Target's inputType
 *   7. every host / the repository is bounded to the Target itself
 *
 * Precondition 7 is the one that keeps ownership from collapsing into
 * authorization (Principle X): verifying `mysite.com` must not let the user
 * write `google.com` or `*.com` into the Scope. "Subdomain of B" is a
 * dot-boundary check only (`H === B || H.endsWith('.' + B)`) after both sides
 * go through the matcher's own normalization, so case, trailing-dot and
 * punycode variants cannot evade it in either direction.
 *
 * `userId`/`grantedBy` are the verified owner, never caller-supplied beyond the
 * ownership lookup. This is the only place `reconfirmControl` is consulted
 * (FR-004); `isAuthorized` never reads it.
 */

import {
  controlLevelRank,
  EXECUTION_CLASSES,
  TARGET_ENVIRONMENT_CLASSIFICATIONS,
  type ExecutionClass,
} from '@webaudit/types';
import type {
  Prisma,
  PrismaClient,
  TargetAuthorization,
} from '../../../prisma/generated/client/index.js';
import { ControlLevelRequiredError, reconfirmControl } from '../control-gate/reconfirm.js';
import type { ControlProbe } from '../control-gate/verify.js';
import { AuthorizationNotFoundError, AuthorizationValidationError } from './errors.js';
import { normalizeHost } from './scope-match.js';
import type {
  AuthorizationBudgets,
  CreateAuthorizationInput,
  ScopeDefinitionInput,
} from './types.js';

export type CreateAuthorizationDb = Pick<
  PrismaClient,
  'target' | 'targetVerification' | 'auditLogEntry' | '$transaction'
>;

/** FR-011: platform-wide maximums. F07 may tighten per class, never loosen. */
export const AUTHORIZATION_LIMITS = {
  requestBudget: { min: 1, max: 1_000_000 },
  concurrencyBudget: { min: 1, max: 1_000 },
  durationBudget: { min: 1, max: 2_592_000 },
} as const;

/** FR-015a: classes that may never be granted against a PRODUCTION environment. */
const PRODUCTION_FORBIDDEN_CLASSES: readonly ExecutionClass[] = [
  'ACTIVE_SECURITY',
  'AUTHENTICATED_WORKFLOW',
  'LOAD_CAPACITY',
];

export interface TargetRow {
  id: string;
  inputType: 'URL' | 'REPOSITORY' | 'ARCHIVE';
  canonicalValue: string;
}

function validateClassesAndEnvironment(input: CreateAuthorizationInput): void {
  const { executionClasses, environmentRestriction } = input;
  if (
    executionClasses.length === 0 ||
    new Set(executionClasses).size !== executionClasses.length ||
    !executionClasses.every((c) => EXECUTION_CLASSES.includes(c))
  ) {
    throw new AuthorizationValidationError(
      'EXECUTION_CLASSES_INVALID',
      'executionClasses must be non-empty, unique and recognized.',
    );
  }
  if (
    environmentRestriction.length === 0 ||
    !environmentRestriction.every((e) => TARGET_ENVIRONMENT_CLASSIFICATIONS.includes(e))
  ) {
    throw new AuthorizationValidationError(
      'ENVIRONMENT_RESTRICTION_INVALID',
      'environmentRestriction must be non-empty and recognized.',
    );
  }
  if (
    environmentRestriction.includes('PRODUCTION') &&
    executionClasses.some((c) => PRODUCTION_FORBIDDEN_CLASSES.includes(c))
  ) {
    throw new AuthorizationValidationError(
      'PRODUCTION_NOT_PERMITTED',
      'PRODUCTION cannot be authorized for active, authenticated or load execution classes.',
    );
  }
}

function validateBudgets(budgets: AuthorizationBudgets): void {
  for (const key of Object.keys(AUTHORIZATION_LIMITS) as Array<keyof AuthorizationBudgets>) {
    const value = budgets[key];
    const { min, max } = AUTHORIZATION_LIMITS[key];
    if (!Number.isInteger(value) || value < min || value > max) {
      throw new AuthorizationValidationError(
        'BUDGET_OUT_OF_RANGE',
        `${key} must be an integer between ${min} and ${max}.`,
      );
    }
  }
}

function expectedKind(inputType: TargetRow['inputType']): ScopeDefinitionInput['targetKind'] {
  // An archive's content is source regardless of transport (data-model.md).
  return inputType === 'URL' ? 'WEB' : 'REPOSITORY';
}

function isStringList(value: readonly unknown[] | undefined): boolean {
  return value === undefined || (Array.isArray(value) && value.every((v) => typeof v === 'string'));
}

function validateScopeShape(scope: ScopeDefinitionInput): void {
  const lists = [
    scope.includedHosts,
    scope.excludedHosts,
    scope.includedPathPrefixes,
    scope.excludedPathPrefixes,
    scope.schemes,
    scope.includedRefs,
    scope.excludedRefs,
    scope.includedAccountRefs,
    scope.includedRoles,
    scope.includedActionCategories,
  ];
  const portsOk =
    scope.ports === undefined ||
    (Array.isArray(scope.ports) &&
      scope.ports.every((p) => Number.isInteger(p) && p >= 1 && p <= 65535));
  const schemesOk = (scope.schemes ?? []).every((s) => s === 'http' || s === 'https');
  const nonEmpty = (list: readonly unknown[] | undefined) => (list?.length ?? 0) > 0;

  let kindFieldsOk: boolean;
  if (scope.targetKind === 'WEB') {
    kindFieldsOk =
      (scope.repositoryFullName ?? null) === null &&
      !nonEmpty(scope.includedRefs) &&
      !nonEmpty(scope.excludedRefs);
  } else {
    kindFieldsOk =
      typeof scope.repositoryFullName === 'string' &&
      scope.repositoryFullName !== '' &&
      !nonEmpty(scope.includedHosts) &&
      !nonEmpty(scope.excludedHosts) &&
      !nonEmpty(scope.schemes) &&
      !nonEmpty(scope.ports);
  }

  if (!lists.every(isStringList) || !portsOk || !schemesOk || !kindFieldsOk) {
    throw new AuthorizationValidationError(
      'SCOPE_MALFORMED',
      'Scope fields are malformed or belong to the other target kind.',
    );
  }
}

/** The comparable host of a URL Target: its origin's hostname, or a bare host as stored. */
function targetHost(canonicalValue: string): string | null {
  try {
    const hostname = new URL(canonicalValue).hostname;
    if (hostname !== '') return normalizeHost(hostname);
  } catch {
    // Not an absolute URL: fall through to treating it as a bare host.
  }
  return normalizeHost(canonicalValue);
}

function isBoundedHost(entry: string, base: string): boolean {
  const host = normalizeHost(entry.startsWith('*.') ? entry.slice(2) : entry);
  return host !== null && (host === base || host.endsWith(`.${base}`));
}

function refuseUnbounded(): never {
  throw new AuthorizationValidationError(
    'SCOPE_NOT_BOUNDED_TO_TARGET',
    'Scope names a host or repository outside the Target it is granted on.',
  );
}

function validateBounded(scope: ScopeDefinitionInput, target: TargetRow): void {
  if (scope.targetKind === 'REPOSITORY') {
    // Exact string equality: no suffix or subdomain concept for repositories.
    if (scope.repositoryFullName !== target.canonicalValue) refuseUnbounded();
    return;
  }

  const base = targetHost(target.canonicalValue);
  if (base === null) return refuseUnbounded();
  const entries = [...(scope.includedHosts ?? []), ...(scope.excludedHosts ?? [])];
  if (!entries.every((entry) => isBoundedHost(entry, base))) refuseUnbounded();
}

/**
 * Preconditions 1–7, in the contract's order. Refuses before anything is written.
 * Shared by `createAuthorization` and `narrowAuthorization` so a replacement
 * grant passes exactly the checks a fresh one does.
 */
export async function validateGrantRequest(
  db: CreateAuthorizationDb,
  input: CreateAuthorizationInput,
  probe: ControlProbe,
): Promise<TargetRow> {
  // 1. Ownership (FR-019): by (id, userId), never id alone.
  const target = await db.target.findFirst({
    where: { id: input.targetId, userId: input.requestingUserId },
    select: { id: true, inputType: true, canonicalValue: true },
  });
  if (target === null) throw new AuthorizationNotFoundError(input.targetId);

  // 2. Live control level, via the existing gate rather than the stored column.
  const control = await reconfirmControl(
    db,
    { targetId: target.id, userId: input.requestingUserId },
    probe,
  );
  if (controlLevelRank(control.level) < controlLevelRank('ATTESTED')) {
    throw new ControlLevelRequiredError(target.id, 'ATTESTED', control.level);
  }

  // 3, 4, 4a, 5
  validateClassesAndEnvironment(input);
  validateBudgets(input.budgets);

  // 6, 7
  if (input.scope.targetKind !== expectedKind(target.inputType)) {
    throw new AuthorizationValidationError(
      'SCOPE_KIND_MISMATCH',
      'Scope kind does not match the Target input type.',
    );
  }
  validateScopeShape(input.scope);
  validateBounded(input.scope, target);
  return target;
}

/** Writes the scope, grant and `authorization.granted` audit row inside the caller's transaction. */
export async function insertGrant(
  tx: Prisma.TransactionClient,
  input: CreateAuthorizationInput,
  target: TargetRow,
  now: Date,
): Promise<TargetAuthorization> {
  const { scope, budgets } = input;
  const scopeRow = await tx.scopeDefinition.create({
    data: {
      targetKind: scope.targetKind,
      includedHosts: [...(scope.includedHosts ?? [])],
      excludedHosts: [...(scope.excludedHosts ?? [])],
      includedPathPrefixes: [...(scope.includedPathPrefixes ?? [])],
      excludedPathPrefixes: [...(scope.excludedPathPrefixes ?? [])],
      schemes: [...(scope.schemes ?? [])],
      ports: [...(scope.ports ?? [])],
      repositoryFullName: scope.repositoryFullName ?? null,
      includedRefs: [...(scope.includedRefs ?? [])],
      excludedRefs: [...(scope.excludedRefs ?? [])],
      includedAccountRefs: [...(scope.includedAccountRefs ?? [])],
      includedRoles: [...(scope.includedRoles ?? [])],
      includedActionCategories: [...(scope.includedActionCategories ?? [])],
    },
  });

  const grant = await tx.targetAuthorization.create({
    data: {
      targetId: target.id,
      userId: input.requestingUserId,
      executionClasses: [...input.executionClasses],
      scopeId: scopeRow.id,
      environmentRestriction: [...input.environmentRestriction],
      requestBudget: budgets.requestBudget,
      concurrencyBudget: budgets.concurrencyBudget,
      durationBudget: budgets.durationBudget,
      grantedBy: input.requestingUserId,
      grantedAt: now,
      expiresAt: new Date(now.getTime() + budgets.durationBudget * 1000),
    },
  });

  await tx.auditLogEntry.create({
    data: {
      actorId: input.requestingUserId,
      action: 'authorization.granted',
      subjectType: 'TargetAuthorization',
      subjectId: grant.id,
      after: {
        executionClasses: [...input.executionClasses],
        scopeId: scopeRow.id,
        environmentRestriction: [...input.environmentRestriction],
        budgets: {
          requestBudget: budgets.requestBudget,
          concurrencyBudget: budgets.concurrencyBudget,
          durationBudget: budgets.durationBudget,
        },
      },
    },
  });

  return grant;
}

export async function createAuthorization(
  db: CreateAuthorizationDb,
  input: CreateAuthorizationInput,
  probe: ControlProbe,
  now: Date = new Date(),
): Promise<TargetAuthorization> {
  const target = await validateGrantRequest(db, input, probe);
  return db.$transaction((tx) => insertGrant(tx, input, target, now));
}
