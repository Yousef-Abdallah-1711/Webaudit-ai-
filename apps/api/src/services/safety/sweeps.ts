/**
 * SPEC 008 DEC-063 / DEC-048 / DEC-049 — the two maintenance operations the
 * worker's repeatable `safety-sweep` job runs, in this order:
 *
 *  1. `reclaimExpiredLeases`: lease rows past their database-clock expiry that
 *     were never released are marked reclaimed and the counter cache recomputed.
 *     A live (unexpired) lease is never touched; a contended grant is skipped
 *     and retried on the next pass. Idempotent.
 *  2. `reconcileStrandedStops`: stop rows with no live in-scope lease advance
 *     `REQUESTED -> ACKNOWLEDGED` (after the ack grace) and
 *     `ACKNOWLEDGED -> STOPPED`, never in one pass and never on a bare timeout.
 *
 * Both are single database calls: the lock order, the skip-locked behaviour and
 * the audit rows live in the `f07_*` functions, so concurrent sweep instances
 * (several workers) are safe by construction.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from './db.js';

export interface ReclaimResult {
  reclaimed: number;
  skippedLocked: number;
  driftCorrected: number;
}

export interface ReconcileResult {
  acknowledged: number;
  stopped: number;
  skippedLocked: number;
}

export const DEFAULT_ACK_GRACE_SECONDS = 30;

export async function reclaimExpiredLeases(db: SafetyDb, limit = 100): Promise<ReclaimResult> {
  const rows = await db.$queryRaw<Array<{ r: ReclaimResult }>>(Prisma.sql`
    SELECT public.f07_reclaim_expired_leases(${limit}::int) AS r`);
  return rows[0]?.r ?? { reclaimed: 0, skippedLocked: 0, driftCorrected: 0 };
}

export async function reconcileStrandedStops(
  db: SafetyDb,
  options: { limit?: number; ackGraceSeconds?: number } = {},
): Promise<ReconcileResult> {
  const rows = await db.$queryRaw<Array<{ r: ReconcileResult }>>(Prisma.sql`
    SELECT public.f07_reconcile_stranded_stops(${options.limit ?? 50}::int,
      ${options.ackGraceSeconds ?? DEFAULT_ACK_GRACE_SECONDS}::int) AS r`);
  return rows[0]?.r ?? { acknowledged: 0, stopped: 0, skippedLocked: 0 };
}
