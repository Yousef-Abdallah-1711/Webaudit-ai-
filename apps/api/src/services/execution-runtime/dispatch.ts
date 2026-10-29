/**
 * `dispatchExecutionUnit` — the dispatch sequence of U-1b v6 §2 for one non-passive unit, from the queue pickup to
 * `RUNNING` under the start gate, with every refusal finalized through the single finalizer.
 *
 *   pickup re-read -> step 0 + claim -> pre-F07 re-read -> F07 admission -> PLANNED>ADMITTED -> engine proofs ->
 *   re-evaluate precedence -> ADMITTED>DISPATCHED -> fork inert child -> DISPATCHED>RUNNING
 *
 * Engine behaviour is injected (`DispatchHooks`): what F07 should be asked, the engine's own proofs, and how to fork
 * the child. The platform part — ordering, claim, CAS, refusal reasons, lease release on every exit — is here and is the
 * same for every engine. A unit that is not `PLANNED` is ignored (pickup-ignore), so a redelivery changes nothing.
 */

import type { AdmissionRequest, AdmissionResult } from '../safety/admission.js';
import type { SafetyDb } from '../safety/db.js';
import { isPassiveClass, type ExecutionUnitClass } from '../planning/graph.js';
import { classifyPreRunCause } from './cause.js';
import {
  casHostTransition,
  claimUnitHost,
  generateClaimToken,
  type HostIdentity,
} from './claim.js';
import { finalizeExecutionUnit } from './finalize.js';
import { Prisma } from '../../../prisma/generated/client/index.js';

export interface DispatchUnit {
  id: string;
  userId: string;
  targetId: string;
  executionUnitClass: ExecutionUnitClass;
  engineId: string;
  idempotencyKey: string;
  attempt: number;
  timeoutPolicyMs: number;
  requiresSafetyCheckpoint: boolean;
  targetAuthorizationId: string | null;
  scanPlanId: string;
}

export interface ForkedChild {
  /** Terminates the inert child (used when the DISPATCHED>RUNNING edge is lost). */
  terminate(): Promise<void>;
}

export interface DispatchHooks {
  /** What to ask F07 for this unit: destination and the class's consumption policy (engine-declared). */
  admissionRequestFor(unit: DispatchUnit): AdmissionRequest;
  /** Whether the class's policy consumes a concurrency lease (class L) or not (class N). */
  leaseClass(unit: DispatchUnit): 'L' | 'N';
  /** Engine-local capacity check BEFORE any F07 call; `false` means requeue, with no admission (v6 §2 step 3). */
  hasCapacity?(unit: DispatchUnit): Promise<boolean>;
  /** Engine guards (v6 §2 step 5), after the claim and before F07: a string refuses the unit from PLANNED. */
  guards?(unit: DispatchUnit): Promise<string | null>;
  /** Engine proofs run in ADMITTED; a string is the refusal reason. */
  proofs?(unit: DispatchUnit): Promise<string | null>;
  /** Fork the child under the start gate: no credential, work order or external resource yet. */
  forkInertChild(unit: DispatchUnit): Promise<ForkedChild>;
  hardStopMarginMs?(unit: DispatchUnit): number;
  /** The F07 admission call; injected so a test can observe it. Defaults to the real one in `dispatch.ts` callers. */
  requestAdmission(request: AdmissionRequest): Promise<AdmissionResult>;
  /** Releases a lease created for a unit whose ADMITTED edge was lost (v6 §2 step 7). */
  releaseLeases(executionId: string): Promise<unknown>;
}

export type DispatchOutcome =
  | {
      outcome: 'RUNNING';
      attempt: number;
      claimToken: string;
      hostInstanceId: string;
      child: ForkedChild;
    }
  | { outcome: 'REFUSED'; reason: string }
  | { outcome: 'DEFERRED'; reason: string }
  | { outcome: 'IGNORED'; reason: string };

async function loadUnit(
  db: SafetyDb,
  executionUnitId: string,
  userId: string,
): Promise<(DispatchUnit & { status: string }) | null> {
  const rows = await db.$queryRaw<Array<DispatchUnit & { status: string }>>(Prisma.sql`
    SELECT id, "userId", "targetId", "executionUnitClass"::text AS "executionUnitClass", "engineId", "idempotencyKey",
           attempt, "timeoutPolicyMs", "requiresSafetyCheckpoint", "targetAuthorizationId", "scanPlanId", status::text AS status
      FROM "ExecutionUnit" WHERE id = ${executionUnitId} AND "userId" = ${userId}`);
  return rows[0] ?? null;
}

export async function dispatchExecutionUnit(
  db: SafetyDb,
  hooks: DispatchHooks,
  host: HostIdentity,
): Promise<DispatchOutcome> {
  // 2. Pickup: re-read from PostgreSQL; the job payload is never authoritative.
  const unit = await loadUnit(db, host.executionUnitId, host.userId);
  if (unit === null) return { outcome: 'IGNORED', reason: 'NOT_FOUND' };
  if (unit.status !== 'PLANNED') return { outcome: 'IGNORED', reason: `STATUS_${unit.status}` };
  if (isPassiveClass(unit.executionUnitClass))
    return { outcome: 'IGNORED', reason: 'PASSIVE_LEGACY_QUEUE' };
  const margin = hooks.hardStopMarginMs?.(unit) ?? 60_000;
  const refuse = async (reason: string): Promise<DispatchOutcome> => {
    const r = await finalizeExecutionUnit(db, unit.id, unit.idempotencyKey, {
      kind: 'REFUSED',
      reason,
    });
    return r.replayed
      ? { outcome: 'IGNORED', reason: `STATUS_${r.status}` }
      : { outcome: 'REFUSED', reason };
  };

  // 3. Engine-local capacity: delay, no F07 call, no claim.
  if (hooks.hasCapacity !== undefined && !(await hooks.hasCapacity(unit))) {
    return { outcome: 'DEFERRED', reason: 'ENGINE_CAPACITY' };
  }

  // Step 0 (deadline precedence) runs inside the claim, before any F07 call: no budget, no lease on refusal.
  const { token, tokenHash } = generateClaimToken();
  const claim = await claimUnitHost(db, host, tokenHash, { hardStopMarginMs: margin });
  if (claim.result === 'REFUSE') return refuse(claim.reason);
  if (claim.result === 'NOT_CLAIMABLE') {
    return claim.reason === 'SCAN_NOT_STARTED'
      ? { outcome: 'DEFERRED', reason: claim.reason }
      : { outcome: 'IGNORED', reason: claim.reason };
  }
  if (claim.result === 'ALREADY_CLAIMED') return { outcome: 'IGNORED', reason: 'ALREADY_CLAIMED' };
  const attempt = claim.attempt;
  const lease = hooks.leaseClass(unit);
  const cas = (edge: 'PLANNED>ADMITTED' | 'ADMITTED>DISPATCHED' | 'DISPATCHED>RUNNING') =>
    casHostTransition(db, { ...host, attempt, claimToken: token, edge, leaseClass: lease });

  const guardRefusal = hooks.guards === undefined ? null : await hooks.guards(unit);
  if (guardRefusal !== null) return refuse(guardRefusal);

  // Pre-F07 re-read: a sweep may have finalized the unit since the claim (v6 §5.2 residual is handled below).
  const pre = await classifyPreRunCause(
    db,
    { ...unit, status: 'PLANNED' },
    { phase: 'PRE_RUN', hardStopMarginMs: margin },
  );
  if (pre.cause === 'TERMINAL') return { outcome: 'IGNORED', reason: `STATUS_${pre.status}` };
  if (pre.cause === 'SCAN_NOT_STARTED') return { outcome: 'DEFERRED', reason: pre.cause };
  if (pre.cause !== 'NONE' && pre.cause !== 'KILL_SWITCH_PENDING') return refuse(pre.cause);

  // F07 admission by the claim owner. A stop pending is refused BY F07 with its own reason (v6 §6).
  const admission = await hooks.requestAdmission(hooks.admissionRequestFor(unit));
  if (admission.outcome === 'REFUSED') return refuse(admission.reason);

  // PLANNED > ADMITTED. Losing it means the unit moved under us: free the lease we just created and stop.
  const admitted = await cas('PLANNED>ADMITTED');
  if (admitted !== 'OK') {
    await hooks.releaseLeases(unit.id);
    return {
      outcome: 'IGNORED',
      reason: admitted === 'LEASE_LOST' ? 'LEASE_LOST' : 'LOST_PLANNED_ADMITTED',
    };
  }

  // Engine proofs run in ADMITTED; refusal finalizes REFUSED (the finalizer releases the lease).
  const proofRefusal = hooks.proofs === undefined ? null : await hooks.proofs(unit);
  if (proofRefusal !== null) return refuse(proofRefusal);
  const again = await classifyPreRunCause(
    db,
    { ...unit, status: 'ADMITTED' },
    { phase: 'PRE_RUN', hardStopMarginMs: margin },
  );
  if (again.cause === 'TERMINAL') return { outcome: 'IGNORED', reason: `STATUS_${again.status}` };
  if (again.cause !== 'NONE') return refuse(again.cause);

  if ((await cas('ADMITTED>DISPATCHED')) !== 'OK')
    return { outcome: 'IGNORED', reason: 'LOST_ADMITTED_DISPATCHED' };

  // 10-11. Fork the child under the start gate, then win DISPATCHED>RUNNING; on loss the child is terminated and nothing is written.
  const child = await hooks.forkInertChild(unit);
  const running = await cas('DISPATCHED>RUNNING');
  if (running !== 'OK') {
    await child.terminate().catch(() => undefined);
    return {
      outcome: 'IGNORED',
      reason: running === 'LEASE_LOST' ? 'LEASE_LOST' : 'LOST_DISPATCHED_RUNNING',
    };
  }
  return {
    outcome: 'RUNNING',
    attempt,
    claimToken: token,
    hostInstanceId: host.hostInstanceId,
    child,
  };
}

/** What one ≤ 5 s host-loop iteration decides (v6 §7). The host performs the action; the sweep finalizes after a lease loss. */
export type HostLoopAction =
  | { action: 'CONTINUE' }
  /** Unit already terminal: stop work, kill the child, write nothing. */
  | { action: 'STOP_TERMINAL' }
  /** Lease lost: abort, kill the child, do NOT finalize; at most acknowledge a pending stop. */
  | { action: 'ABORT_LEASE_LOST'; acknowledgeStop: boolean }
  /** Stop pending, lease held: acknowledge, abort, kill, then finalize (REFUSED pre-run, KILLED/CANCELLED when running). */
  | {
      action: 'STOP_AND_FINALIZE';
      cause: 'KILL_SWITCH_PENDING' | 'GRANT_REVOKED' | 'GRANT_EXPIRED' | 'F07_STATE_UNCERTAIN';
    }
  /** Scan ended or deadline passed with the lease held: the owner finalizes. */
  | {
      action: 'EXPIRE_AND_FINALIZE';
      cause:
        'SCAN_CANCELLED' | 'SCAN_FAILED' | 'SCAN_DEADLINE_EXPIRED' | 'SCAN_DEADLINE_INSUFFICIENT';
    };

/** The outcome of F07's token-fenced lease renewal (`renewLease`), as the loop needs to interpret it. */
export type LeaseRenewal =
  | 'RENEWED'
  | 'STOP_PENDING'
  | 'FENCED'
  | 'GRANT_INVALID_REVOKED'
  | 'GRANT_INVALID_EXPIRED'
  | 'UNCERTAIN';

/**
 * One iteration of the host loop's decision, in v6 §7's order: terminal? -> lease (class L: renew) -> cause precedence.
 * Renewal is read fail-closed: `FENCED` is a lost lease (no finalization); a refused renewal because the grant is no
 * longer valid, or because F07 state could not be read, stops the unit (FR-016a, FR-021) and the live holder finalizes it.
 */
export async function hostLoopDecision(
  db: SafetyDb,
  unit: { id: string; userId: string; leaseClass: 'L' | 'N' },
  renewLease: () => Promise<LeaseRenewal>,
): Promise<HostLoopAction> {
  const row = await db.$queryRaw<
    Array<{
      id: string;
      userId: string;
      status: string;
      targetId: string;
      targetAuthorizationId: string | null;
      scanPlanId: string;
      timeoutPolicyMs: number;
    }>
  >(Prisma.sql`
    SELECT id, "userId", status::text AS status, "targetId", "targetAuthorizationId", "scanPlanId", "timeoutPolicyMs"
      FROM "ExecutionUnit" WHERE id = ${unit.id} AND "userId" = ${unit.userId}`);
  const u = row[0];
  if (u === undefined) return { action: 'STOP_TERMINAL' };
  // The loop only enforces the hard end (scan ended / deadline passed); "enough time left" is a dispatch-time rule.
  const cause = await classifyPreRunCause(db, u, { phase: 'RUNNING' });
  if (cause.cause === 'TERMINAL') return { action: 'STOP_TERMINAL' };

  // Class L: whether the lease is still ours is read from the lease row itself. F07's renewal reports a pending stop
  // before it reports a fenced holder, so the renewal result alone cannot prove the lease is lost.
  let renewal: LeaseRenewal = 'RENEWED';
  if (unit.leaseClass === 'L') {
    const live = await db.$queryRaw<Array<{ live: boolean }>>(
      Prisma.sql`SELECT public.fahes_lock_live_lease(${unit.id}) AS live`,
    );
    renewal = live[0]?.live === true ? await renewLease() : 'FENCED';
  }
  if (renewal === 'FENCED')
    return { action: 'ABORT_LEASE_LOST', acknowledgeStop: cause.cause === 'KILL_SWITCH_PENDING' };
  if (cause.cause === 'KILL_SWITCH_PENDING' || renewal === 'STOP_PENDING') {
    return { action: 'STOP_AND_FINALIZE', cause: 'KILL_SWITCH_PENDING' };
  }
  if (renewal === 'GRANT_INVALID_REVOKED')
    return { action: 'STOP_AND_FINALIZE', cause: 'GRANT_REVOKED' };
  if (renewal === 'GRANT_INVALID_EXPIRED')
    return { action: 'STOP_AND_FINALIZE', cause: 'GRANT_EXPIRED' };
  if (renewal === 'UNCERTAIN') return { action: 'STOP_AND_FINALIZE', cause: 'F07_STATE_UNCERTAIN' };
  if (
    cause.cause === 'SCAN_CANCELLED' ||
    cause.cause === 'SCAN_FAILED' ||
    cause.cause === 'SCAN_DEADLINE_EXPIRED' ||
    cause.cause === 'SCAN_DEADLINE_INSUFFICIENT'
  ) {
    return { action: 'EXPIRE_AND_FINALIZE', cause: cause.cause };
  }
  return { action: 'CONTINUE' };
}
