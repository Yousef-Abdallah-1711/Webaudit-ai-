/**
 * T024 — SPEC 007 `contracts/grant-lifecycle-contract.md`, `revokeAuthorization`
 * (FR-014, FR-016, FR-017, FR-018, FR-019).
 *
 * Authority:
 *   - the grant's owner may revoke it (tenant predicate: `(id, userId)`);
 *   - a platform operator may revoke any grant, as a safety action. This is the
 *     only cross-user path and it is strictly reductive: revocation never creates
 *     or widens anything (FR-017).
 *
 * The caller's `actingUserIsOperator` is a *claim*, never proof: operator status
 * is re-read from `User.isOperator` inside the transaction, and a claim the
 * database does not back is treated as "not an operator". A non-owner who is not
 * a verified operator, and a grant id that does not exist, fail identically with
 * `AuthorizationNotFoundError` (FR-019): the two are not distinguishable.
 *
 * Interpretation (contract silent): an operator revoking their own grant is
 * ordinary self-revocation and is audited as `authorization.revoked`; only a
 * revocation of someone else's grant by a verified operator is
 * `authorization.revoked_by_operator`.
 *
 * Idempotent: a grant that is already revoked or expired is returned unchanged,
 * with no write and no audit row. An expired grant keeps `revokedAt = null`.
 *
 * Revocation is exactly one conditional write (`revokedAt IS NULL`), so two
 * concurrent revocations produce one winner and one audit row; the audit row is
 * written in the same transaction as the state change. Nothing is cached:
 * `isAuthorized` re-derives state on its next call (FR-014).
 */

import type { PrismaClient, TargetAuthorization } from '../../../prisma/generated/client/index.js';
import { AuthorizationNotFoundError } from './errors.js';

export type RevokeAuthorizationDb = Pick<PrismaClient, '$transaction'>;

export interface RevokeAuthorizationInput {
  authorizationId: string;
  actingUserId: string;
  /** A claim only: re-verified against `User.isOperator` before it grants any authority. */
  actingUserIsOperator: boolean;
}

export async function revokeAuthorization(
  db: RevokeAuthorizationDb,
  input: RevokeAuthorizationInput,
  now: Date = new Date(),
): Promise<TargetAuthorization> {
  const { authorizationId, actingUserId } = input;

  return db.$transaction(async (tx) => {
    let isVerifiedOperator = false;
    if (input.actingUserIsOperator) {
      const operator = await tx.user.findFirst({
        where: { id: actingUserId, isOperator: true },
        select: { id: true },
      });
      isVerifiedOperator = operator !== null;
    }

    // Owner path is tenant-scoped by (id, userId); only a verified operator
    // looks a grant up by id alone.
    const grant = await tx.targetAuthorization.findFirst({
      where: isVerifiedOperator
        ? { id: authorizationId }
        : { id: authorizationId, userId: actingUserId },
    });
    if (grant === null) throw new AuthorizationNotFoundError(authorizationId);

    // Already terminal: nothing to do, and nothing to audit.
    if (grant.revokedAt !== null || now.getTime() >= grant.expiresAt.getTime()) return grant;

    const { count } = await tx.targetAuthorization.updateMany({
      where: { id: grant.id, revokedAt: null },
      data: { revokedAt: now, revokedBy: actingUserId },
    });

    if (count === 0) {
      // Lost a race to a concurrent revocation: that winner wrote the audit row.
      const settled = await tx.targetAuthorization.findFirst({ where: { id: grant.id } });
      if (settled === null) throw new AuthorizationNotFoundError(authorizationId);
      return settled;
    }

    const byOperator = isVerifiedOperator && grant.userId !== actingUserId;
    await tx.auditLogEntry.create({
      data: {
        actorId: actingUserId,
        action: byOperator ? 'authorization.revoked_by_operator' : 'authorization.revoked',
        subjectType: 'TargetAuthorization',
        subjectId: grant.id,
        before: { revokedAt: null },
        after: { revokedAt: now.toISOString(), revokedBy: actingUserId },
      },
    });

    const revoked = await tx.targetAuthorization.findFirst({ where: { id: grant.id } });
    if (revoked === null) throw new AuthorizationNotFoundError(authorizationId);
    return revoked;
  });
}
