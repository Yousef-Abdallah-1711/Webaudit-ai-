/**
 * SPEC 008 `data-model.md` "Fast-read checkpoint query" (FR-018): one indexed
 * database call checks the six scope keys for an execution unit. This is the
 * lighter-weight "is a stop pending" sub-check the checkpoint contract allows
 * between full admissions (cadence rule, FR-013).
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyScope } from '@webaudit/config';
import type { StopLifecycleState } from './stop-lifecycle.js';
import type { SafetyDb } from './db.js';

export interface SafetyIdentity {
  executionId: string;
  scanId?: string | null;
  /** Empty when the grant is not yet known (pre-authorization checks). */
  grantId?: string | null;
  targetId: string;
  userId: string;
}

export interface PendingStop {
  scope: SafetyScope;
  scopeId: string;
  state: StopLifecycleState;
  /** ISO timestamp from the database clock; the 5 s escalation bound counts from here. */
  requestedAt: string;
}

/** The first covering stop that is pending, or a STOPPED row for this exact execution (FR-015). */
export async function findPendingStop(
  db: SafetyDb,
  identity: SafetyIdentity,
): Promise<PendingStop | null> {
  const rows = await db.$queryRaw<Array<{ r: PendingStop | null }>>(Prisma.sql`
    SELECT public.f07_stop_pending(${identity.executionId}, ${identity.scanId ?? null},
      ${identity.grantId ?? ''}, ${identity.targetId}, ${identity.userId}) AS r`);
  return rows[0]?.r ?? null;
}
