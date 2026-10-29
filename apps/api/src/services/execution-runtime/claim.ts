/**
 * Host claim and guarded status CAS (U-1b v6 §3–§4, DEC-056/057).
 *
 * One host owns a unit attempt: `claimUnitHost` inserts the immutable claim (unique per
 * (unit, attempt)); every later host-initiated edge is ONE conditional UPDATE that also requires the
 * caller's claim, so a transition that loses a race changes nothing. Class L units additionally require a
 * live lease, locked `FOR SHARE` in the same transaction (unit row -> lease row, the v6 lock order).
 * The raw token exists only in host memory; the database stores and compares its SHA-256.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Prisma } from '../../../prisma/generated/client/index.js';
import { inTransaction, type SafetyDb } from '../safety/db.js';
import { classifyPreRunCause, type CauseOptions, type PreRunCause } from './cause.js';

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** 256-bit CSPRNG token (v6 §3: >= 128 bits required). Never log, queue, emit or pass to the child. */
export function generateClaimToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('hex');
  return { token, tokenHash: hashClaimToken(token) };
}

export interface HostIdentity {
  executionUnitId: string;
  /** Tenant filter (FR-026): a unit of another tenant is indistinguishable from a missing one. */
  userId: string;
  hostInstanceId: string;
}

interface LockedUnit {
  id: string;
  userId: string;
  status: string;
  attempt: number;
  targetId: string;
  targetAuthorizationId: string | null;
  scanPlanId: string;
  timeoutPolicyMs: number;
  requiresSafetyCheckpoint: boolean;
}

async function lockUnit(
  tx: SafetyDb,
  id: string,
  userId: string,
  mode: 'UPDATE' | 'SHARE',
): Promise<LockedUnit | null> {
  const lock = mode === 'UPDATE' ? Prisma.sql`FOR UPDATE` : Prisma.sql`FOR SHARE`;
  const rows = await tx.$queryRaw<LockedUnit[]>(Prisma.sql`
    SELECT id, "userId", status::text AS status, attempt, "targetId", "targetAuthorizationId",
           "scanPlanId", "timeoutPolicyMs", "requiresSafetyCheckpoint"
      FROM "ExecutionUnit" WHERE id = ${id} AND "userId" = ${userId} ${lock}`);
  return rows[0] ?? null;
}

export { lockUnit };

export type ClaimResult =
  | { result: 'CLAIMED'; attempt: number; claimSeq: bigint }
  | { result: 'ALREADY_CLAIMED' }
  | { result: 'REFUSE'; reason: Extract<PreRunCause['cause'], `SCAN_${string}`> }
  | { result: 'NOT_CLAIMABLE'; reason: string };

/**
 * One transaction: lock the unit, require `PLANNED` in a `RESOLVED` plan with a live scan, apply the §6 precedence
 * on the statement clock, insert the claim. A pending stop does NOT refuse here (v6 §3): the unit proceeds to F07
 * admission, which refuses with the stop reason; a deadline reason is never written over a pending stop.
 */
export async function claimUnitHost(
  db: SafetyDb,
  host: HostIdentity,
  tokenHash: string,
  options: Omit<CauseOptions, 'phase'> = {},
): Promise<ClaimResult> {
  if (!/^[0-9a-f]{64}$/.test(tokenHash) || host.hostInstanceId === '') {
    return { result: 'NOT_CLAIMABLE', reason: 'INVALID_CLAIM' };
  }
  return inTransaction(db, async (tx) => {
    const unit = await lockUnit(tx, host.executionUnitId, host.userId, 'UPDATE');
    if (unit === null) return { result: 'NOT_CLAIMABLE', reason: 'NOT_FOUND' } as const;
    if (unit.status !== 'PLANNED')
      return { result: 'NOT_CLAIMABLE', reason: `STATUS_${unit.status}` } as const;
    const plan = await tx.scanPlan.findUnique({
      where: { id: unit.scanPlanId },
      select: { state: true },
    });
    if (plan?.state !== 'RESOLVED')
      return { result: 'NOT_CLAIMABLE', reason: 'PLAN_NOT_RESOLVED' } as const;

    const cause = await classifyPreRunCause(tx, unit, { phase: 'PRE_RUN', ...options });
    if (cause.cause === 'SCAN_NOT_STARTED')
      return { result: 'NOT_CLAIMABLE', reason: 'SCAN_NOT_STARTED' } as const;
    if (
      cause.cause === 'SCAN_CANCELLED' ||
      cause.cause === 'SCAN_FAILED' ||
      cause.cause === 'SCAN_DEADLINE_EXPIRED' ||
      cause.cause === 'SCAN_DEADLINE_INSUFFICIENT'
    ) {
      return { result: 'REFUSE', reason: cause.cause } as const;
    }

    const inserted = await tx.$queryRaw<Array<{ claimSeq: bigint }>>(Prisma.sql`
      INSERT INTO "ExecutionUnitHostClaim" (id, "executionUnitId", attempt, "scanPlanId", "userId", "hostInstanceId", "claimTokenHash")
      VALUES (gen_random_uuid()::text, ${unit.id}, ${unit.attempt}, ${unit.scanPlanId}, ${unit.userId}, ${host.hostInstanceId}, ${tokenHash})
      ON CONFLICT ("executionUnitId", attempt) DO NOTHING
      RETURNING "claimSeq"`);
    if (inserted.length === 0) return { result: 'ALREADY_CLAIMED' } as const;
    return { result: 'CLAIMED', attempt: unit.attempt, claimSeq: inserted[0]!.claimSeq } as const;
  });
}

export type HostEdge = 'PLANNED>ADMITTED' | 'ADMITTED>DISPATCHED' | 'DISPATCHED>RUNNING';
export type CasResult = 'OK' | 'LOST' | 'LEASE_LOST';

class LeaseLost extends Error {}

export interface CasInput extends HostIdentity {
  attempt: number;
  claimToken: string;
  edge: HostEdge;
  /** Class L = the class's policy consumes a concurrency lease; the lease must still be live. Class N: no lease. */
  leaseClass: 'L' | 'N';
}

/**
 * Exactly one conditional UPDATE. 0 rows = the transition was lost (another writer finalized, the claim
 * does not match, or the status moved) and nothing changed. For class L a second statement, in the same
 * transaction, locks the live lease `FOR SHARE`; a missing lease rolls the whole transaction back.
 */
export async function casHostTransition(db: SafetyDb, input: CasInput): Promise<CasResult> {
  const [from, to] = input.edge.split('>') as [string, string];
  const tokenHash = hashClaimToken(input.claimToken);
  try {
    return await inTransaction(db, async (tx) => {
      const stamp =
        to === 'DISPATCHED'
          ? Prisma.sql`, "dispatchedAt" = clock_timestamp()`
          : to === 'RUNNING'
            ? Prisma.sql`, "startedAt" = clock_timestamp()`
            : Prisma.empty;
      const updated = await tx.$executeRaw(Prisma.sql`
        UPDATE "ExecutionUnit" u SET status = ${to}::"ExecutionUnitStatus"${stamp}
         WHERE u.id = ${input.executionUnitId} AND u."userId" = ${input.userId}
           AND u.status = ${from}::"ExecutionUnitStatus" AND u.attempt = ${input.attempt}
           AND EXISTS (SELECT 1 FROM "ExecutionUnitHostClaim" c
                        WHERE c."executionUnitId" = u.id AND c.attempt = ${input.attempt}
                          AND c."claimTokenHash" = ${tokenHash} AND c."hostInstanceId" = ${input.hostInstanceId})`);
      if (updated !== 1) return 'LOST' as const;
      if (input.leaseClass === 'L') {
        const lease = await tx.$queryRaw<Array<{ one: number }>>(Prisma.sql`
          SELECT 1 AS one FROM "AdmissionLease"
           WHERE "executionId" = ${input.executionUnitId} AND "releasedAt" IS NULL AND "reclaimedAt" IS NULL
           FOR SHARE`);
        if (lease.length === 0) throw new LeaseLost();
      }
      return 'OK' as const;
    });
  } catch (error) {
    if (error instanceof LeaseLost) return 'LEASE_LOST';
    // A trigger refusal (an edge outside the transition table) is a lost transition, never a silent success.
    if ((error as { code?: string; meta?: { code?: string } }).meta?.code === '23514')
      return 'LOST';
    throw error;
  }
}
