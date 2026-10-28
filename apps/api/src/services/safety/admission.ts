/**
 * SPEC 008 `contracts/safety-admission-contract.md` as amended by A1 (DEC-045 A).
 *
 * Two layers (F-02 §6): this TypeScript layer derives identity from the
 * database (`Target.userId`; the clock is the database's), runs F01's
 * `isAuthorized` (scope/environment matching lives only here), then calls
 * `f07_admit`, which re-verifies ownership, revocation, expiry, kill switch and
 * budget under the F-02 lock order and is the only writer of lease, consumption
 * and counter rows.
 *
 * Joinable: pass a `PrismaClient` (one transaction is opened) or a caller's
 * transaction client (joined; a savepoint keeps the caller's transaction usable
 * after a fail-closed refusal). Any internal error is `REFUSED/INTERNAL_ERROR`,
 * never a partial effect and never `GRANTED`.
 */

import type { ExecutionClass } from '@webaudit/types';
import type { SafetyScope } from '@webaudit/config';
import { Prisma } from '../../../prisma/generated/client/index.js';
import { isAuthorized } from '../authorization/check.js';
import type { RepositoryDestination, WebDestination } from '../authorization/scope-match.js';
import { recordExecutionAuditEvent } from './audit.js';
import { loadBudgetConsumption } from './budget-counter.js';
import { databaseNow, failClosed, type SafetyDb, type SafetyTx } from './db.js';
import { findPendingStop } from './kill-switch-state.js';

export type AdmissionRefusalReason =
  | 'NO_MATCHING_GRANT'
  | 'REVOKED'
  | 'EXPIRED'
  | 'OUT_OF_SCOPE'
  | 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED'
  | 'BUDGET_EXHAUSTED_REQUEST'
  | 'BUDGET_EXHAUSTED_CONCURRENCY'
  | 'KILL_SWITCH_PENDING'
  /** FR-015: another live lease already holds this execution unit. */
  | 'EXECUTION_ALREADY_LEASED'
  | 'INTERNAL_ERROR';

export type AdmissionResult =
  | {
      outcome: 'GRANTED';
      grantId: string;
      /** Present iff `consumes.concurrency` (FR-006a). */
      leaseId?: string;
      holderToken?: string;
      /** True when this is the stored outcome of an earlier call with the same key. */
      replay: boolean;
    }
  | {
      outcome: 'REFUSED';
      reason: AdmissionRefusalReason;
      scope?: SafetyScope;
      scopeId?: string;
    };

export interface AdmissionRequest {
  targetId: string;
  executionClass: ExecutionClass;
  destination: WebDestination | RepositoryDestination;
  executionId: string;
  scanId?: string;
  idempotencyKey: string;
  consumes: { request: boolean; concurrency: boolean };
}

const INTERNAL_ERROR: AdmissionResult = { outcome: 'REFUSED', reason: 'INTERNAL_ERROR' };

interface AdmitRow {
  outcome: 'GRANTED' | 'REFUSED';
  grantId?: string;
  leaseId?: string | null;
  holderToken?: string | null;
  replay?: boolean;
  reason?: AdmissionRefusalReason;
  scope?: SafetyScope;
  scopeId?: string;
}

async function refuse(
  tx: SafetyTx,
  request: AdmissionRequest,
  userId: string,
  reason: AdmissionRefusalReason,
  grantId?: string,
  extra?: { scope?: SafetyScope; scopeId?: string },
): Promise<AdmissionResult> {
  await recordExecutionAuditEvent(tx, {
    eventType: 'ADMISSION_REFUSED',
    actorId: userId,
    context: {
      targetId: request.targetId,
      ...(grantId === undefined ? {} : { targetAuthorizationId: grantId }),
      ...(request.scanId === undefined ? {} : { scanId: request.scanId }),
      executionId: request.executionId,
      executionClass: request.executionClass,
    },
    outcome: reason,
  });
  return { outcome: 'REFUSED', reason, ...extra };
}

async function admit(tx: SafetyTx, request: AdmissionRequest): Promise<AdmissionResult> {
  const target = await tx.target.findUnique({
    where: { id: request.targetId },
    select: { userId: true },
  });
  if (target === null) return { outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' };
  const userId = target.userId;

  // A pending stop is the most urgent refusal; checked before authorization.
  const early = await findPendingStop(tx, {
    executionId: request.executionId,
    scanId: request.scanId ?? null,
    targetId: request.targetId,
    userId,
  });
  if (early !== null) {
    return refuse(tx, request, userId, 'KILL_SWITCH_PENDING', undefined, {
      scope: early.scope,
      scopeId: early.scopeId,
    });
  }

  const now = await databaseNow(tx);
  const consumption = await loadBudgetConsumption(tx, { targetId: request.targetId, userId });
  const authz = await isAuthorized(tx, {
    targetId: request.targetId,
    userId,
    executionClass: request.executionClass,
    destination: request.destination,
    now,
    consumption,
  });

  // F01's BUDGET_EXHAUSTED came from an advisory read that may be stale in either
  // direction: it is equivalent to AUTHORIZED here; the locked check decides.
  let grantId: string;
  if (authz.outcome === 'AUTHORIZED') grantId = authz.grantId;
  else if (authz.reason === 'BUDGET_EXHAUSTED') grantId = authz.grantId;
  else {
    const grant = 'grantId' in authz ? authz.grantId : undefined;
    return refuse(tx, request, userId, authz.reason, grant);
  }

  const rows = await tx.$queryRaw<Array<{ r: AdmitRow }>>(Prisma.sql`
    SELECT public.f07_admit(${request.targetId}, ${grantId}, ${request.executionId},
      ${request.scanId ?? null}, ${request.idempotencyKey},
      ${request.consumes.request}, ${request.consumes.concurrency}, ${request.executionClass}) AS r`);
  const r = rows[0]?.r;
  if (r === undefined) throw new Error('f07_admit returned nothing');

  if (r.outcome === 'GRANTED') {
    return {
      outcome: 'GRANTED',
      grantId: r.grantId ?? grantId,
      ...(r.leaseId ? { leaseId: r.leaseId } : {}),
      ...(r.holderToken ? { holderToken: r.holderToken } : {}),
      replay: r.replay === true,
    };
  }
  return {
    outcome: 'REFUSED',
    reason: r.reason ?? 'INTERNAL_ERROR',
    ...(r.scope === undefined ? {} : { scope: r.scope }),
    ...(r.scopeId === undefined ? {} : { scopeId: r.scopeId }),
  };
}

export async function requestAdmission(
  db: SafetyDb,
  request: AdmissionRequest,
): Promise<AdmissionResult> {
  if (
    request.targetId === '' ||
    request.executionId === '' ||
    request.idempotencyKey === '' ||
    (!request.consumes.request && !request.consumes.concurrency)
  ) {
    return INTERNAL_ERROR;
  }
  return failClosed(
    db,
    (tx) => admit(tx, request),
    () => INTERNAL_ERROR,
  );
}

export type RenewResult =
  | { status: 'RENEWED'; expiresAt: Date }
  | { status: 'STOP_PENDING'; scope: SafetyScope; scopeId: string }
  /** FR-016a: the grant was revoked or has expired; a lease may not outlive it. */
  | { status: 'GRANT_INVALID'; reason: 'REVOKED' | 'EXPIRED' }
  | { status: 'FENCED' }
  /** FR-021: the state could not be read; treated as "a stop might be pending". */
  | { status: 'UNCERTAIN' };

/**
 * Token-fenced renewal. A superseded or reclaimed holder gets `FENCED`, which
 * the caller MUST treat as an immediate stop (FR-006a); a revoked or expired
 * grant refuses renewal (FR-016a); a failure to read state is `UNCERTAIN`,
 * never "no stop pending" (FR-021).
 */
export async function renewLease(
  db: SafetyDb,
  input: { leaseId: string; holderToken: string },
): Promise<RenewResult> {
  return failClosed(
    db,
    async (tx): Promise<RenewResult> => {
      const rows = await tx.$queryRaw<Array<{ r: Record<string, string> }>>(Prisma.sql`
        SELECT public.f07_renew_lease(${input.leaseId}, ${input.holderToken}) AS r`);
      const r = rows[0]?.r;
      if (r?.['status'] === 'RENEWED') {
        return { status: 'RENEWED', expiresAt: new Date(r['expiresAt'] ?? Date.now()) };
      }
      if (r?.['status'] === 'STOP_PENDING') {
        return {
          status: 'STOP_PENDING',
          scope: r['scope'] as SafetyScope,
          scopeId: r['scopeId'] ?? '',
        };
      }
      if (r?.['status'] === 'GRANT_INVALID') {
        return {
          status: 'GRANT_INVALID',
          reason: r['reason'] === 'EXPIRED' ? 'EXPIRED' : 'REVOKED',
        };
      }
      return { status: 'FENCED' };
    },
    (): RenewResult => ({ status: 'UNCERTAIN' }),
  );
}

/** Holder release; idempotent, and a wrong token changes nothing. */
export async function releaseLeaseByToken(
  db: SafetyDb,
  input: { leaseId: string; holderToken: string; completed?: boolean },
): Promise<{ released: boolean }> {
  const rows = await db.$queryRaw<Array<{ r: { released: boolean } }>>(Prisma.sql`
    SELECT public.f07_release_lease_by_token(${input.leaseId}, ${input.holderToken},
      ${input.completed === true}) AS r`);
  return { released: rows[0]?.r.released === true };
}

/**
 * Release by authority (finalizer / sweep): token-free, unit-keyed, idempotent
 * and counter-correcting. Call it with the finalizer's transaction client so the
 * unit's terminal write and the release commit together (DEC-045 A).
 */
export async function releaseLeasesByExecution(db: SafetyDb, executionId: string): Promise<number> {
  const rows = await db.$queryRaw<Array<{ n: number }>>(Prisma.sql`
    SELECT public.f07_release_leases_by_execution(${executionId}) AS n`);
  return Number(rows[0]?.n ?? 0);
}
