/**
 * T053 — FR-017 Level 1: "The user explicitly affirms they are authorised to
 * audit the target. System MUST record who attested, for which target, and
 * when."
 *
 * Attestation is a statement, not a proof. That is the whole reason Level 2
 * exists, and the reason the platform rate-bounds Level 1 probing anyway
 * (`rate-bound.ts`): a false attestation must not be able to cause harm on its
 * own.
 *
 * What this module is careful about is the *record*. If someone later asks who
 * authorised auditing a host they own, the answer has to be a row with a name
 * and a timestamp on it — so the attestation is written to the target and to the
 * audit log, and the audit-log entry is never conditional.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { ControlLevel } from '@webaudit/types';

/**
 * Raised when the caller does not own the target.
 *
 * Deliberately the same error whether the target belongs to someone else or does
 * not exist. Distinguishing them turns this endpoint into an oracle for which
 * target ids are real.
 */
export class AttestationNotPermittedError extends Error {
  override readonly name = 'AttestationNotPermittedError';
  constructor(readonly targetId: string) {
    super(`Target ${targetId} is not available to this account.`);
  }
}

export interface AttestInput {
  readonly targetId: string;
  /** The account affirming authorisation. Recorded as `attestedBy`. */
  readonly userId: string;
}

export interface AttestResult {
  readonly targetId: string;
  readonly controlLevel: ControlLevel;
  readonly attestedAt: Date;
  readonly attestedBy: string;
}

type AttestDb = Pick<PrismaClient, 'target' | 'auditLogEntry' | '$transaction'>;

export async function attestControl(db: AttestDb, input: AttestInput): Promise<AttestResult> {
  const target = await db.target.findFirst({
    where: { id: input.targetId, userId: input.userId },
    select: { id: true, controlLevel: true, attestedAt: true, attestedBy: true },
  });
  if (target === null) throw new AttestationNotPermittedError(input.targetId);

  const attestedAt = new Date();

  // ATTESTED is a floor, never a ceiling. Re-affirming a VERIFIED target
  // refreshes the record without throwing away the verification that outranks
  // it — a user clicking the attest button twice must not cost them Level 2.
  const nextLevel: ControlLevel = target.controlLevel === 'VERIFIED' ? 'VERIFIED' : 'ATTESTED';

  const updated = await db.target.update({
    where: { id: target.id },
    data: { controlLevel: nextLevel, attestedAt, attestedBy: input.userId },
    select: { id: true, controlLevel: true, attestedAt: true, attestedBy: true },
  });

  await db.auditLogEntry.create({
    data: {
      actorId: input.userId,
      action: 'control.attested',
      subjectType: 'Target',
      subjectId: target.id,
      before: {
        controlLevel: target.controlLevel,
        attestedAt: target.attestedAt?.toISOString() ?? null,
      },
      after: { controlLevel: updated.controlLevel, attestedAt: attestedAt.toISOString() },
    },
  });

  return {
    targetId: updated.id,
    controlLevel: updated.controlLevel,
    attestedAt,
    attestedBy: input.userId,
  };
}
