/**
 * T028 — SPEC 007 `contracts/grant-lifecycle-contract.md`, `narrowAuthorization`
 * (FR-009, FR-016, FR-018).
 *
 * Narrowing is replacement, never an in-place edit: the original grant is
 * revoked, a NEW `ScopeDefinition` and a NEW `TargetAuthorization` are created,
 * and the original's `ScopeDefinition` row is never touched (FR-009), so a
 * revoked grant's historical scope stays accurate.
 *
 * Authority is the owner's alone. There is no operator variant: an operator may
 * revoke (FR-017) but narrowing is structurally a create, and operator authority
 * is strictly reductive. A non-owner and a nonexistent grant fail identically.
 *
 * Everything the replacement carries passes the same preconditions as a fresh
 * `createAuthorization` (control level, production restriction, budget ceilings,
 * scope-bounded-to-Target), and the revoke, the new grant and both audit rows
 * (`authorization.granted` on the new grant, `authorization.replaced` on the
 * original) commit in ONE transaction: a refused replacement leaves the original
 * live and writes nothing.
 *
 * Interpretations (the contract is silent; all fail closed and are recorded in
 * the Phase 5 handoff):
 *   - Only a live grant can be narrowed. A grant that is already revoked or
 *     expired, or that a concurrent call just ended, is refused with
 *     `GRANT_NOT_ACTIVE` (never silently re-created).
 *   - Budgets can only go down. Omitted budgets default to the original's
 *     request/concurrency, and to the original's REMAINING lifetime (never a
 *     restarted clock); an explicit value above the original's is
 *     `BUDGET_OUT_OF_RANGE`.
 *   - That the narrowed scope is a SUBSET of the original is NOT verified: the
 *     contract defines no subsumption rule. It is still bounded to the Target,
 *     so the owner gains nothing they could not obtain with `createAuthorization`.
 */

import type { PrismaClient, TargetAuthorization } from '../../../prisma/generated/client/index.js';
import type { ControlProbe } from '../control-gate/verify.js';
import { insertGrant, validateGrantRequest } from './create.js';
import { AuthorizationNotFoundError, AuthorizationValidationError } from './errors.js';
import type { AuthorizationBudgets, ScopeDefinitionInput } from './types.js';

export type NarrowAuthorizationDb = Pick<
  PrismaClient,
  'target' | 'targetVerification' | 'targetAuthorization' | 'auditLogEntry' | '$transaction'
>;

export interface NarrowAuthorizationInput {
  originalAuthorizationId: string;
  actingUserId: string;
  narrowedScope: ScopeDefinitionInput;
  narrowedBudgets?: Partial<AuthorizationBudgets>;
}

function notActive(): never {
  throw new AuthorizationValidationError(
    'GRANT_NOT_ACTIVE',
    'Only a live grant can be narrowed; this one is revoked, expired or was just replaced.',
  );
}

function narrowedBudgets(
  original: TargetAuthorization,
  requested: Partial<AuthorizationBudgets> | undefined,
  now: Date,
): AuthorizationBudgets {
  const remainingSeconds = Math.max(
    1,
    Math.min(
      original.durationBudget,
      Math.floor((original.expiresAt.getTime() - now.getTime()) / 1000),
    ),
  );
  const ceilings: AuthorizationBudgets = {
    requestBudget: original.requestBudget,
    concurrencyBudget: original.concurrencyBudget,
    durationBudget: remainingSeconds,
  };
  const result = { ...ceilings };
  for (const key of Object.keys(ceilings) as Array<keyof AuthorizationBudgets>) {
    const value = requested?.[key];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 1 || value > ceilings[key]) {
      throw new AuthorizationValidationError(
        'BUDGET_OUT_OF_RANGE',
        `${key} may only be narrowed: an integer between 1 and the original's ${ceilings[key]}.`,
      );
    }
    result[key] = value;
  }
  return result;
}

export async function narrowAuthorization(
  db: NarrowAuthorizationDb,
  input: NarrowAuthorizationInput,
  probe: ControlProbe,
  now: Date = new Date(),
): Promise<TargetAuthorization> {
  const { originalAuthorizationId, actingUserId } = input;

  // Owner-only, tenant-scoped by (id, userId); no operator path (FR-017).
  const original = await db.targetAuthorization.findFirst({
    where: { id: originalAuthorizationId, userId: actingUserId },
  });
  if (original === null) throw new AuthorizationNotFoundError(originalAuthorizationId);
  if (original.revokedAt !== null || now.getTime() >= original.expiresAt.getTime()) notActive();

  const request = {
    targetId: original.targetId,
    requestingUserId: actingUserId,
    executionClasses: original.executionClasses,
    scope: input.narrowedScope,
    environmentRestriction: original.environmentRestriction,
    budgets: narrowedBudgets(original, input.narrowedBudgets, now),
  };
  // Same preconditions as a fresh grant; refuses before anything is written.
  const target = await validateGrantRequest(db, request, probe);

  return db.$transaction(async (tx) => {
    // The single conditional write that makes the replacement one-winner: if a
    // concurrent revoke or narrow got here first, nothing below runs.
    const { count } = await tx.targetAuthorization.updateMany({
      where: { id: original.id, userId: actingUserId, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokedBy: actingUserId },
    });
    if (count === 0) notActive();

    const replacement = await insertGrant(tx, request, target, now);

    await tx.auditLogEntry.create({
      data: {
        actorId: actingUserId,
        action: 'authorization.replaced',
        subjectType: 'TargetAuthorization',
        subjectId: original.id,
        after: { replacedByGrantId: replacement.id },
      },
    });
    return replacement;
  });
}
