/**
 * Engine-owned evidence fence (SPEC 009 U-1 T-U1-9).
 *
 * The generic `recordEvidence` path stays permissive for registry results emitted after unit completion.
 * Engine evidence instead keeps the unit and scan rows locked while it verifies deadline/state, host claim,
 * and (for lease-consuming classes) the live F07 lease, then writes through the same generic envelope path.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import {
  recordEvidence,
  type RecordEvidenceInput,
  type RecordedEvidence,
} from '../evidence/evidence.js';
import type { ArtifactStore } from '../evidence/store.js';
import { inTransaction, type SafetyDb } from '../safety/db.js';
import { classifyPreRunCause } from './cause.js';
import { hashClaimToken, lockUnit } from './claim.js';

export interface RecordExecutionEvidenceInput extends RecordEvidenceInput {
  readonly attempt: number;
  readonly claimToken: string;
  readonly hostInstanceId: string;
  readonly leaseClass: 'L' | 'N';
}

export class ExecutionEvidenceRefusedError extends Error {
  constructor(readonly reason: string) {
    super(`Execution evidence was refused: ${reason}`);
    this.name = 'ExecutionEvidenceRefusedError';
  }
}

export async function recordExecutionEvidence(
  db: SafetyDb,
  store: ArtifactStore,
  input: RecordExecutionEvidenceInput,
): Promise<RecordedEvidence> {
  const { attempt, claimToken, hostInstanceId, leaseClass, ...evidence } = input;
  if (!Number.isInteger(attempt) || attempt < 1 || hostInstanceId === '' || claimToken === '') {
    throw new ExecutionEvidenceRefusedError('INVALID_CLAIM');
  }
  const tokenHash = hashClaimToken(claimToken);

  return inTransaction(db, async (tx) => {
    // Fence 1: unit state/tenant ownership. The row lock serializes this write with finalization.
    const unit = await lockUnit(tx, evidence.executionUnitId, evidence.userId, 'SHARE');
    if (unit === null) throw new ExecutionEvidenceRefusedError('UNIT_NOT_FOUND');
    if (unit.status !== 'RUNNING') {
      throw new ExecutionEvidenceRefusedError(
        unit.status === 'COMPLETED' ||
          unit.status === 'FAILED' ||
          unit.status === 'CANCELLED' ||
          unit.status === 'KILLED' ||
          unit.status === 'REFUSED' ||
          unit.status === 'SKIPPED' ||
          unit.status === 'BLOCKED'
          ? 'UNIT_TERMINAL'
          : `UNIT_STATUS_${unit.status}`,
      );
    }
    if (unit.attempt !== attempt) throw new ExecutionEvidenceRefusedError('STALE_ATTEMPT');

    const plan = await tx.scanPlan.findUnique({
      where: { id: unit.scanPlanId },
      select: { kind: true, state: true, deadlineMs: true, resolvedAt: true, scanId: true },
    });
    if (plan === null || plan.state !== 'RESOLVED' || plan.deadlineMs === null) {
      throw new ExecutionEvidenceRefusedError('PLAN_NOT_RESOLVED');
    }

    // The definer locks both unit and INITIAL scan, which execution roles may read but cannot row-lock
    // (PostgreSQL requires UPDATE privilege for a direct SELECT ... FOR SHARE). It checks the DB-clock
    // deadline and the immutable claim in that order without widening their Scan privileges.
    const fence = await tx.$queryRaw<Array<{ result: string }>>(Prisma.sql`
      SELECT public.fahes_lock_execution_evidence(
        ${unit.id}, ${unit.userId}, ${attempt}::integer, ${hostInstanceId}, ${tokenHash}
      ) AS result`);
    const fenceResult = fence[0]?.result;
    if (fenceResult !== 'OK') {
      throw new ExecutionEvidenceRefusedError(fenceResult ?? 'FENCE_UNAVAILABLE');
    }

    // F07 stop state remains authoritative and is read through the shared cause classifier.
    const cause = await classifyPreRunCause(tx, unit, { phase: 'RUNNING' });
    if (cause.cause !== 'NONE') throw new ExecutionEvidenceRefusedError(cause.cause);

    if (leaseClass === 'L') {
      const leases = await tx.$queryRaw<Array<{ live: boolean }>>(
        Prisma.sql`SELECT public.fahes_lock_live_lease(${unit.id}) AS live`,
      );
      if (leases[0]?.live !== true) throw new ExecutionEvidenceRefusedError('LEASE_LOST');
    }

    // Fence 3: the generic path is intentionally allowed to write post-terminal registry evidence.
    // This call stays in the same transaction as the locks/claim/lease checks for engine-produced evidence.
    return recordEvidence(tx, store, evidence);
  });
}
