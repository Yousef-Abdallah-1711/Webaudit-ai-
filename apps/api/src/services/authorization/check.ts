/**
 * T014 — SPEC 007 `contracts/authorization-check-contract.md` (FR-013/FR-014/FR-024).
 *
 * `isAuthorized` is the one function every engine calls to ask "is this
 * execution class, against this destination, authorized right now". It is a
 * decision, not a reservation: it only reads, and consumes nothing.
 *
 * Rules held here:
 *   - One grant must satisfy every condition on its own. Grants are never
 *     combined (a scope from A with an environment from B is a refusal).
 *   - Nothing is cached. The grant rows and the `TargetEnvironment` are read on
 *     every call, so a revocation or reclassification bites on the next call.
 *   - Fail closed. A grant row that is malformed is unusable, never permission;
 *     a database failure propagates as a thrown error that cannot be mistaken
 *     for `AUTHORIZED`.
 *   - Tenant isolation. Grants are looked up by `(targetId, userId)` and the
 *     environment is joined through the owning Target's `userId`; the rows
 *     returned are re-checked in code rather than trusting the query alone.
 *
 * Lifecycle state (revoked, expired, budget exhausted) comes from
 * `derive-state.ts` on every call (T022/T023). Revoked and expired grants are
 * refused at once; `BUDGET_EXHAUSTED` is applied only after scope and
 * environment pass (FR-013 order, matching `REFUSAL_DEPTH`). Consumption data is
 * an optional caller-supplied snapshot: with none, nothing is reported
 * exhausted. Authoritative metering and enforcement belong to SPEC 008 (F07).
 */

import type { ExecutionClass, TargetEnvironmentClassification } from '@webaudit/types';
import { deriveState, type BudgetConsumption } from './derive-state.js';
import {
  isInScope,
  type RepositoryDestination,
  type ScopeDefinitionData,
  type WebDestination,
} from './scope-match.js';

/** The grant fields `isAuthorized` reads, with its scope joined in. */
export interface AuthorizationGrantRow {
  id: string;
  targetId: string;
  userId: string;
  executionClasses: readonly ExecutionClass[];
  environmentRestriction: readonly TargetEnvironmentClassification[];
  requestBudget: number;
  concurrencyBudget: number;
  grantedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  scope: ScopeDefinitionData;
}

/**
 * Read-only by construction: the check has no write path to reach (FR-024).
 * A `PrismaClient` satisfies this once the client carries the SPEC 007 models.
 */
export interface AuthorizationCheckDb {
  targetAuthorization: {
    findMany(args: {
      where: { targetId: string; userId: string; executionClasses: { has: ExecutionClass } };
      include: { scope: true };
      orderBy: Array<{ grantedAt: 'desc' } | { id: 'asc' }>;
    }): Promise<AuthorizationGrantRow[]>;
  };
  targetEnvironment: {
    findFirst(args: {
      where: { targetId: string; target: { userId: string } };
      select: { classification: true };
    }): Promise<{ classification: TargetEnvironmentClassification } | null>;
  };
}

export type AuthzResult =
  | { outcome: 'AUTHORIZED'; grantId: string }
  | { outcome: 'REFUSED'; reason: 'NO_MATCHING_GRANT' }
  | {
      outcome: 'REFUSED';
      reason:
        | 'REVOKED'
        | 'EXPIRED'
        | 'BUDGET_EXHAUSTED'
        | 'OUT_OF_SCOPE'
        | 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED';
      grantId: string;
    };

export interface AuthorizationCheckInput {
  targetId: string;
  userId: string;
  executionClass: ExecutionClass;
  destination: WebDestination | RepositoryDestination;
  now: Date;
  /**
   * Pre-set consumption per grant id (SPEC 007 stub seam, T019). Absent means
   * "no data": nothing is reported exhausted. Read-only; never modified.
   */
  consumption?: ReadonlyMap<string, BudgetConsumption>;
}

type GrantRefusal = Extract<AuthzResult, { grantId: string; outcome: 'REFUSED' }>;

/** How far through (state, scope, environment) a refusal got: higher is more informative. */
const REFUSAL_DEPTH: Record<GrantRefusal['reason'], number> = {
  REVOKED: 1,
  EXPIRED: 1,
  OUT_OF_SCOPE: 2,
  ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED: 3,
  BUDGET_EXHAUSTED: 4,
};

function isUsable(grant: AuthorizationGrantRow): boolean {
  return (
    typeof grant.id === 'string' &&
    Array.isArray(grant.executionClasses) &&
    Array.isArray(grant.environmentRestriction) &&
    grant.expiresAt instanceof Date &&
    !Number.isNaN(grant.expiresAt.getTime()) &&
    (grant.revokedAt === null || grant.revokedAt instanceof Date) &&
    typeof grant.scope === 'object' &&
    grant.scope !== null
  );
}

/** The Target's current classification, read live; `null` means unclassified. */
type EnvironmentReader = () => Promise<TargetEnvironmentClassification | null>;

async function evaluateGrant(
  grant: AuthorizationGrantRow,
  input: AuthorizationCheckInput,
  readEnvironment: EnvironmentReader,
): Promise<AuthzResult> {
  const grantId = grant.id;
  const state = deriveState(grant, input.now, input.consumption?.get(grantId));
  if (state === 'REVOKED') return { outcome: 'REFUSED', reason: 'REVOKED', grantId };
  if (state === 'EXPIRED') return { outcome: 'REFUSED', reason: 'EXPIRED', grantId };
  if (!isInScope(grant.scope, input.destination)) {
    return { outcome: 'REFUSED', reason: 'OUT_OF_SCOPE', grantId };
  }
  const classification = await readEnvironment();
  if (classification === null || !grant.environmentRestriction.includes(classification)) {
    return {
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
      grantId,
    };
  }
  if (state === 'BUDGET_EXHAUSTED') {
    return { outcome: 'REFUSED', reason: 'BUDGET_EXHAUSTED', grantId };
  }
  return { outcome: 'AUTHORIZED', grantId };
}

export async function isAuthorized(
  db: AuthorizationCheckDb,
  input: AuthorizationCheckInput,
): Promise<AuthzResult> {
  const rows = await db.targetAuthorization.findMany({
    where: {
      targetId: input.targetId,
      userId: input.userId,
      executionClasses: { has: input.executionClass },
    },
    include: { scope: true },
    orderBy: [{ grantedAt: 'desc' }, { id: 'asc' }],
  });

  // Read the environment at most once per call, and only if a grant gets that far.
  let environment: Promise<TargetEnvironmentClassification | null> | undefined;
  const readEnvironment: EnvironmentReader = () => {
    environment ??= db.targetEnvironment
      .findFirst({
        where: { targetId: input.targetId, target: { userId: input.userId } },
        select: { classification: true },
      })
      .then((row) => row?.classification ?? null);
    return environment;
  };

  let furthest: GrantRefusal | null = null;
  for (const grant of rows) {
    // The query already filters; re-check so a wrong row can never authorize.
    if (!isUsable(grant)) continue;
    if (grant.targetId !== input.targetId || grant.userId !== input.userId) continue;
    if (!grant.executionClasses.includes(input.executionClass)) continue;

    const result = await evaluateGrant(grant, input, readEnvironment);
    if (result.outcome === 'AUTHORIZED') return result;
    const refusal = result as GrantRefusal;
    if (furthest === null || REFUSAL_DEPTH[refusal.reason] > REFUSAL_DEPTH[furthest.reason]) {
      furthest = refusal;
    }
  }

  return furthest ?? { outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' };
}
