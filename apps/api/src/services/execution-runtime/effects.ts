/**
 * Per-effect authorization ledger (DEC-051 A, U-1b v6 §5).
 *
 * `authorizeEffect` is the fence every externally visible effect passes first. In ONE transaction it locks the
 * unit row `FOR SHARE` (finalization needs the row exclusively, so it commits strictly before or after this
 * transaction, never between), verifies the unit is `RUNNING` and owned by this claim, re-applies the v6 §6
 * precedence, requires the live lease for class L, and records the authorization.
 * Guarantee, stated honestly: no NEW authorization after terminalization. An effect already authorized and in flight
 * cannot be recalled.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import { inTransaction, type SafetyDb } from '../safety/db.js';
import { classifyPreRunCause } from './cause.js';
import { hashClaimToken, lockUnit, type HostIdentity } from './claim.js';

export type EffectDecision =
  { result: 'AUTHORIZED'; replayed: boolean } | { result: 'REFUSED'; reason: string };

export interface EffectInput extends HostIdentity {
  attempt: number;
  claimToken: string;
  kind: string;
  ordinal: number;
  leaseClass: 'L' | 'N';
}

export async function authorizeEffect(db: SafetyDb, input: EffectInput): Promise<EffectDecision> {
  if (input.kind === '' || !Number.isInteger(input.ordinal) || input.ordinal < 0) {
    return { result: 'REFUSED', reason: 'INVALID_EFFECT' };
  }
  const tokenHash = hashClaimToken(input.claimToken);
  return inTransaction(db, async (tx) => {
    const unit = await lockUnit(tx, input.executionUnitId, input.userId, 'SHARE');
    if (unit === null) return { result: 'REFUSED', reason: 'NOT_FOUND' } as const;
    if (unit.status !== 'RUNNING')
      return { result: 'REFUSED', reason: `STATUS_${unit.status}` } as const;
    if (unit.attempt !== input.attempt)
      return { result: 'REFUSED', reason: 'STALE_ATTEMPT' } as const;

    const claim = await tx.$queryRaw<Array<{ one: number }>>(Prisma.sql`
      SELECT 1 AS one FROM "ExecutionUnitHostClaim"
       WHERE "executionUnitId" = ${unit.id} AND attempt = ${input.attempt}
         AND "claimTokenHash" = ${tokenHash} AND "hostInstanceId" = ${input.hostInstanceId}`);
    if (claim.length === 0) return { result: 'REFUSED', reason: 'CLAIM_MISMATCH' } as const;

    const cause = await classifyPreRunCause(tx, unit, { phase: 'RUNNING' });
    if (cause.cause !== 'NONE') return { result: 'REFUSED', reason: cause.cause } as const;

    if (input.leaseClass === 'L') {
      const lease = await tx.$queryRaw<Array<{ one: number }>>(Prisma.sql`
        SELECT 1 AS one FROM "AdmissionLease"
         WHERE "executionId" = ${unit.id} AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL FOR SHARE`);
      if (lease.length === 0) return { result: 'REFUSED', reason: 'LEASE_LOST' } as const;
    }

    const inserted = await tx.$executeRaw(Prisma.sql`
      INSERT INTO "EffectAuthorization" (id, "executionUnitId", attempt, kind, ordinal, "userId")
      VALUES (gen_random_uuid()::text, ${unit.id}, ${input.attempt}, ${input.kind}, ${input.ordinal}, ${unit.userId})
      ON CONFLICT ("executionUnitId", attempt, kind, ordinal) DO NOTHING`);
    return { result: 'AUTHORIZED', replayed: inserted === 0 } as const;
  });
}

/** AUTHORIZED -> CONFIRMED. False when the row is missing or already ABANDONED/CONFIRMED (the unit was finalized first). */
export async function confirmEffect(
  db: SafetyDb,
  input: { executionUnitId: string; attempt: number; kind: string; ordinal: number },
): Promise<boolean> {
  const n = await db.$executeRaw(Prisma.sql`
    UPDATE "EffectAuthorization" SET state = 'CONFIRMED', "confirmedAt" = clock_timestamp()
     WHERE "executionUnitId" = ${input.executionUnitId} AND attempt = ${input.attempt}
       AND kind = ${input.kind} AND ordinal = ${input.ordinal} AND state = 'AUTHORIZED'`);
  return n === 1;
}

/** `onUnitExpired` helper (v6 §5): TERMINATED only when no authorized effect lacks a confirmation. */
export async function hasUnconfirmedEffects(
  db: SafetyDb,
  executionUnitId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ n: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS n FROM "EffectAuthorization"
     WHERE "executionUnitId" = ${executionUnitId} AND state = 'AUTHORIZED'`);
  return (rows[0]?.n ?? 0n) > 0n;
}
