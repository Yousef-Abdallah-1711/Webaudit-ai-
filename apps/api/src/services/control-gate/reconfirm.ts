/**
 * T055 — FR-017: "System MUST re-confirm verification has not lapsed before each
 * Level 2 check, and MUST treat a removed token as loss of verification."
 *
 * This is the gate every load-generating check goes through, and R11 names it as
 * the reason SC-021's second and third bypasses fail: "Re-confirming at
 * execution time rather than trusting a stored flag is what makes SC-021's third
 * bypass attempt — a target verified once and since changed hands — actually
 * fail."
 *
 * Two rules hold this together.
 *
 * **`Target.controlLevel` is a cache, not the answer.** The answer is a live
 * `TargetVerification` row, confirmed, unrevoked, whose token is published on
 * the target *right now*. A column can be set by a bug, a bad migration, or a
 * future endpoint written by someone who has not read this file. A published
 * token cannot. So the column is never sufficient on its own — the same shape as
 * SC-007's rule that `Issue.RESOLVED` has one inbound edge.
 *
 * **A lapse demotes, in the same call that refuses.** Discovering the token is
 * gone and leaving VERIFIED in the database means the next reader, on a code
 * path that forgot to re-confirm, sees a target that looks verified. Refusal and
 * demotion are one operation.
 *
 * Demotion goes to ATTESTED rather than NONE when an attestation exists. Losing
 * verification is not evidence the user never affirmed authorisation, and
 * silently erasing that affirmation would destroy the FR-017 record.
 */

import type { ControlLevel, VerificationMethod } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { isTokenPublished, fileUrlFor, recordNameFor, type ControlProbe } from './verify.js';
import { level1RateBound } from './rate-bound.js';

/**
 * The exact same key `verify.ts`'s `createSafeNetProbe()` derives for this
 * method/target pair — FILE keys on the served file's hostname (matching
 * `fetchFile`'s own `new URL(url).hostname`), DNS keys on the record name
 * itself (matching `resolveTxt`'s own `name` argument). Must stay byte-for-
 * byte identical to those, or the check below is meaningless: it exists to
 * ask "is *this* target's bucket the one that just refused a probe", not
 * some unrelated bucket that happens to share a name.
 */
function probeKeyFor(method: VerificationMethod, canonicalValue: string): string {
  return method === 'FILE'
    ? new URL(fileUrlFor(canonicalValue)).hostname
    : recordNameFor(canonicalValue);
}

/** Every method a user may use to reach VERIFIED. Named in the refusal (FR-017). */
export const ACCEPTED_METHODS: readonly VerificationMethod[] = ['FILE', 'DNS'];

/**
 * The refusal FR-017 requires: "MUST refuse a Level 2 check on an unverified
 * target, naming which verification methods are accepted, before charging."
 *
 * Shaped to fill the `403 CONTROL_LEVEL_REQUIRED` body in contracts/http-api.md
 * without the route having to reconstruct it.
 */
export class ControlLevelRequiredError extends Error {
  override readonly name = 'ControlLevelRequiredError';
  readonly code = 'CONTROL_LEVEL_REQUIRED';
  constructor(
    readonly targetId: string,
    readonly required: ControlLevel,
    readonly current: ControlLevel,
    readonly methods: readonly VerificationMethod[] = ACCEPTED_METHODS,
  ) {
    super('Load generation requires verified control of this target.');
  }
}

export interface ReconfirmResult {
  /** The level established *now*, after re-reading the target. */
  readonly level: ControlLevel;
  /** True when a previously verified target has just been demoted. */
  readonly demoted: boolean;
  readonly method?: VerificationMethod;
}

type ReconfirmDb = Pick<PrismaClient, 'target' | 'targetVerification' | 'auditLogEntry'>;

/**
 * Establish, from scratch, what level of control exists over a target.
 *
 * Never reads `controlLevel` as evidence. It reads it only to know what to write
 * back and what to record in the audit log.
 */
export async function reconfirmControl(
  db: ReconfirmDb,
  input: { targetId: string; userId: string },
  probe: ControlProbe,
): Promise<ReconfirmResult> {
  const target = await db.target.findFirst({
    where: { id: input.targetId, userId: input.userId },
    select: { id: true, canonicalValue: true, controlLevel: true, attestedAt: true },
  });
  // Not the caller's target, or not a target at all. Either way there is no
  // control to speak of, and the two are not distinguished on purpose.
  if (target === null) return { level: 'NONE', demoted: false };

  const attestedFloor: ControlLevel = target.attestedAt === null ? 'NONE' : 'ATTESTED';

  const confirmed = await db.targetVerification.findFirst({
    where: { targetId: target.id, confirmedAt: { not: null }, revokedAt: null },
    orderBy: { confirmedAt: 'desc' },
    select: { id: true, method: true, token: true },
  });

  if (confirmed === null) {
    // Nothing was ever confirmed, or everything confirmed has been revoked.
    // Whatever the column says, this target is not verified.
    await settle(db, target, attestedFloor, input.userId, 'no live verification');
    return { level: attestedFloor, demoted: target.controlLevel === 'VERIFIED' };
  }

  const checkedAt = new Date();
  const stillPublished = await isTokenPublished(
    probe,
    confirmed.method,
    target.canonicalValue,
    confirmed.token,
  );

  if (!stillPublished) {
    const key = probeKeyFor(confirmed.method, target.canonicalValue);
    if (level1RateBound.retryAfterMs(key) > 0) {
      // The check was inconclusive — our own rate limiter refused the probe
      // (even after verify.ts's `acquireOrWait` retry), not evidence the
      // token is gone. Two wrong answers are available and both are
      // rejected: granting VERIFIED on unproven data would let anyone who
      // once verified a target, then lost control of it, hold VERIFIED
      // indefinitely just by keeping this bucket exhausted — the same
      // "trust the stored artifact instead of a live probe" bypass R11
      // names at the top of this file. Revoking on unproven data destroys a
      // verification that may well still be genuine. So: deny elevation for
      // *this* call only — same floor as a target with no live verification
      // at all — while writing nothing to `TargetVerification` or `Target`.
      // The stored row survives untouched, and an unthrottled re-check can
      // still confirm it for real.
      return { level: attestedFloor, demoted: false };
    }

    // FR-017: "MUST treat a removed token as loss of verification."
    await db.targetVerification.update({
      where: { id: confirmed.id },
      data: { revokedAt: checkedAt, lastCheckedAt: checkedAt },
    });
    await settle(db, target, attestedFloor, input.userId, 'published token no longer present');
    return { level: attestedFloor, demoted: true };
  }

  await db.targetVerification.update({
    where: { id: confirmed.id },
    data: { lastCheckedAt: checkedAt },
  });
  // Repair the cache if it had drifted low; it can only ever be raised to a
  // level a live confirmation already justifies.
  if (target.controlLevel !== 'VERIFIED') {
    await db.target.update({ where: { id: target.id }, data: { controlLevel: 'VERIFIED' } });
  }
  return { level: 'VERIFIED', demoted: false, method: confirmed.method };
}

/** Write the demoted level back, and record it if it actually changed. */
async function settle(
  db: ReconfirmDb,
  target: { id: string; controlLevel: ControlLevel },
  level: ControlLevel,
  actorId: string,
  reason: string,
): Promise<void> {
  if (target.controlLevel === level) return;
  await db.target.update({ where: { id: target.id }, data: { controlLevel: level } });
  await db.auditLogEntry.create({
    data: {
      actorId,
      action: 'control.demoted',
      subjectType: 'Target',
      subjectId: target.id,
      before: { controlLevel: target.controlLevel },
      after: { controlLevel: level, reason },
    },
  });
}

/**
 * The call site for every load-generating check. Refuses, or returns the level
 * it just established.
 *
 * @throws ControlLevelRequiredError before any work is queued or charged.
 */
export async function assertLoadGenerationAllowed(
  db: ReconfirmDb,
  input: { targetId: string; userId: string },
  probe: ControlProbe,
): Promise<ReconfirmResult> {
  const result = await reconfirmControl(db, input, probe);
  if (result.level !== 'VERIFIED') {
    throw new ControlLevelRequiredError(input.targetId, 'VERIFIED', result.level);
  }
  return result;
}

/**
 * The same gate for a check that only needs Level 1.
 *
 * Cheap on purpose: attestation is a stored affirmation and there is nothing
 * external to re-read. The protection against a false attestation is the rate
 * bound in `rate-bound.ts`, not a stricter check here.
 */
export async function assertAttested(
  db: Pick<PrismaClient, 'target'>,
  input: { targetId: string; userId: string },
): Promise<ControlLevel> {
  const target = await db.target.findFirst({
    where: { id: input.targetId, userId: input.userId },
    select: { controlLevel: true, attestedAt: true },
  });
  if (target === null || target.attestedAt === null) {
    throw new ControlLevelRequiredError(input.targetId, 'ATTESTED', target?.controlLevel ?? 'NONE');
  }
  return target.controlLevel;
}
