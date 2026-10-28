/**
 * T012d — SPEC 007 `contracts/grant-lifecycle-contract.md`, `classifyEnvironment`
 * (FR-001, FR-017a, FR-018a).
 *
 * Owner-only, with no operator variant: classifying a Target's environment is
 * metadata about that user's own Target, not a safety override. An operator who
 * thinks a Target is misclassified acts by revoking the specific grant, never by
 * reclassifying someone else's Target. A classification alone never authorizes
 * anything (Principle X) — it is one input `isAuthorized` reads live.
 *
 * The single `TargetEnvironment` row is updated in place (no history table);
 * the audit log carries the before/after trail instead.
 */

import {
  TARGET_ENVIRONMENT_CLASSIFICATIONS,
  type TargetEnvironmentClassification,
} from '@webaudit/types';
import type { PrismaClient, TargetEnvironment } from '../../../prisma/generated/client/index.js';
import { triggerStop } from '../safety/kill-switch.js';
import { AuthorizationNotFoundError, AuthorizationValidationError } from './errors.js';

export type ClassifyEnvironmentDb = Pick<PrismaClient, '$transaction'>;

export interface ClassifyEnvironmentInput {
  targetId: string;
  actingUserId: string;
  classification: TargetEnvironmentClassification;
}

export async function classifyEnvironment(
  db: ClassifyEnvironmentDb,
  input: ClassifyEnvironmentInput,
): Promise<TargetEnvironment> {
  if (!TARGET_ENVIRONMENT_CLASSIFICATIONS.includes(input.classification)) {
    throw new AuthorizationValidationError(
      'ENVIRONMENT_RESTRICTION_INVALID',
      'Unrecognized environment classification.',
    );
  }

  return db.$transaction(async (tx) => {
    // Same owner predicate as createAuthorization: a Target that is someone
    // else's is indistinguishable from one that does not exist (FR-019).
    const target = await tx.target.findFirst({
      where: { id: input.targetId, userId: input.actingUserId },
      select: { id: true },
    });
    if (target === null) throw new AuthorizationNotFoundError(input.targetId);

    const existing = await tx.targetEnvironment.findUnique({
      where: { targetId: target.id },
      select: { classification: true },
    });

    const row = await tx.targetEnvironment.upsert({
      where: { targetId: target.id },
      create: {
        targetId: target.id,
        classification: input.classification,
        classifiedBy: input.actingUserId,
      },
      update: {
        classification: input.classification,
        classifiedAt: new Date(),
        classifiedBy: input.actingUserId,
      },
    });

    await tx.auditLogEntry.create({
      data: {
        actorId: input.actingUserId,
        action: existing === null ? 'environment.classified' : 'environment.reclassified',
        subjectType: 'TargetEnvironment',
        subjectId: row.id,
        ...(existing === null ? {} : { before: { classification: existing.classification } }),
        after: { classification: row.classification },
      },
    });

    // SPEC 008 FR-016: a reclassification that a live grant's environment
    // restriction no longer permits stops that grant's running work. A later
    // reclassification back does not cancel a stop already requested.
    if (existing !== null && existing.classification !== row.classification) {
      const now = new Date();
      const affected = await tx.targetAuthorization.findMany({
        where: {
          targetId: target.id,
          userId: input.actingUserId,
          revokedAt: null,
          expiresAt: { gt: now },
          NOT: { environmentRestriction: { has: row.classification } },
        },
        select: { id: true },
      });
      for (const grant of affected) {
        await triggerStop(tx, {
          scope: 'GRANT',
          scopeId: grant.id,
          triggeredBy: 'SYSTEM',
          reason: 'ENVIRONMENT_RECLASSIFIED',
        });
      }
    }

    return row;
  });
}
