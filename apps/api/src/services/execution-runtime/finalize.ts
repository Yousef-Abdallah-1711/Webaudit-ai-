/**
 * `finalizeExecutionUnit` (runtime-finalization-contract.md, DEC-047 A): the TypeScript face of the ONE
 * database finalization body, `fahes_finalize_unit`. Joinable into a caller's transaction (SafetyDb).
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { FailureClass } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';

export type FinalizeOutcome =
  | { kind: 'COMPLETED' }
  | {
      kind: 'FAILED';
      failureClass: Exclude<FailureClass, 'DETERMINISTIC_FINDING'>;
      detail?: string;
    }
  | { kind: 'CANCELLED' }
  | { kind: 'KILLED'; f07Reason: string }
  | { kind: 'REFUSED'; reason: string };

export interface FinalizeResult {
  status: string;
  /** True when the unit was already terminal: the prior outcome is returned unchanged. */
  replayed: boolean;
  /** False when a replay carried a different outcome than the one stored (never re-finalized). */
  outcomeMatches: boolean;
  /** Dependents moved to BLOCKED by this call (transitive, same transaction). */
  blocked: string[];
}

const MAX_REASON = 200;

export async function finalizeExecutionUnit(
  db: SafetyDb,
  executionUnitId: string,
  idempotencyKey: string,
  outcome: FinalizeOutcome,
  progress?: Record<string, unknown>,
): Promise<FinalizeResult> {
  const reason =
    outcome.kind === 'KILLED'
      ? outcome.f07Reason
      : outcome.kind === 'REFUSED'
        ? outcome.reason
        : outcome.kind === 'FAILED'
          ? (outcome.detail ?? null)
          : null;
  const failureClass = outcome.kind === 'FAILED' ? outcome.failureClass : null;
  const rows = await db.$queryRaw<Array<{ r: FinalizeResult }>>(Prisma.sql`
    SELECT public.fahes_finalize_unit(
      ${executionUnitId}, ${idempotencyKey}, ${outcome.kind},
      ${failureClass}::"FailureClass", ${reason === null ? null : reason.slice(0, MAX_REASON)},
      ${progress === undefined ? null : JSON.stringify(progress)}::jsonb) AS r`);
  const r = rows[0]?.r;
  if (r === undefined) throw new Error('fahes_finalize_unit returned nothing');
  return r;
}
