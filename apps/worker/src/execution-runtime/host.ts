/**
 * The execution host (U-1b v6): one job -> dispatch -> run under a ≤5 s loop -> finalize.
 *
 * It owns everything contractual and calls the adapter only for engine-specific work:
 *   1. `dispatchExecutionUnit` (pickup re-read, step 0 + claim, F07 admission with executionId = ExecutionUnit.id, CAS edges, inert child);
 *   2. arms the parent hard stop (timeoutPolicyMs + margin) BEFORE any effect, and starts the host loop;
 *   3. every `loopIntervalMs` runs `hostLoopDecision` (lease liveness/renewal, stop precedence, deadline) and applies the action;
 *   4. when the adapter returns, classifies the observation (the engine never self-reports a failure class), re-checks the
 *      lease and deadline (a stale holder MUST NOT finalize), then finalizes through the single finalizer and runs the plan gate;
 *   5. after a COMPLETED unit, enqueues its newly eligible dependents.
 */

import {
  authorizeEffect,
  classifyFailure,
  confirmEffect,
  dispatchExecutionUnit,
  emitProgress,
  recordExecutionEvidence,
  finalizeUnitAndContinue,
  findPendingStopReason,
  hostLoopDecision,
  snapshotProgress,
  type FinalizeOutcome,
  type GateDeps,
  type HostLoopAction,
  type LeaseRenewal,
  type ProgressPublisher,
  type ProgressTick,
} from '@webaudit/api/execution-runtime';
import type { ArtifactStore } from '@webaudit/api/evidence';
import {
  acknowledgeStop,
  releaseLeasesByExecution,
  renewLease,
  requestAdmission,
  safetyCheckpoint,
} from '@webaudit/api/safety';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import type { AdapterRegistry, AdapterUnit, AdapterContext, ExecutionAdapter } from './adapter.js';
import { forkExecutionChild, type IsolatedExecutionChild } from './process-child.js';

export interface HostDeps {
  readonly db: PrismaClient;
  readonly registry: AdapterRegistry;
  readonly artifactStore: ArtifactStore;
  readonly publisher: ProgressPublisher;
  readonly hostInstanceId: string;
  /** Contract: ≤ 5 s. Injectable so a test can drive it quickly; never above 5 000. */
  readonly loopIntervalMs?: number;
  readonly progressMinIntervalMs?: number;
  /** The plan gate's continuation (enqueue the master synthesis job) for a scan. */
  readonly gateFor?: (scanId: string) => GateDeps;
  /** Called after a COMPLETED unit so newly eligible dependents are enqueued. */
  readonly onUnitCompleted?: (scanPlanId: string) => Promise<unknown>;
  readonly log?: (message: string, extra?: Record<string, unknown>) => void;
}

export type HostResult =
  | { result: 'IGNORED' | 'DEFERRED'; reason: string }
  | { result: 'REFUSED'; reason: string }
  | { result: 'FINALIZED'; status: string; replayed: boolean }
  | {
      result: 'ABANDONED';
      reason: 'LEASE_LOST' | 'TERMINAL_ELSEWHERE' | 'CHILD_TERMINATION_UNCONFIRMED';
    };

const MAX_LOOP_MS = 5000;

interface UnitRow {
  id: string;
  userId: string;
  scanPlanId: string;
  engineId: string;
  executionUnitClass: string;
  status: string;
  idempotencyKey: string;
  attempt: number;
  timeoutPolicyMs: number;
  requiresSafetyCheckpoint: boolean;
  configuration: unknown;
}

export function createExecutionJobHandler(
  deps: HostDeps,
): (data: { executionUnitId: string }) => Promise<HostResult> {
  const log = deps.log ?? (() => undefined);
  const interval = Math.min(deps.loopIntervalMs ?? MAX_LOOP_MS, MAX_LOOP_MS);

  return async function handle({ executionUnitId }): Promise<HostResult> {
    // The payload only names a row; everything else is re-read. The owner is read from the row (internal, trusted queue).
    const row = (await deps.db.executionUnit.findUnique({
      where: { id: executionUnitId },
      select: {
        id: true,
        userId: true,
        scanPlanId: true,
        engineId: true,
        executionUnitClass: true,
        status: true,
        idempotencyKey: true,
        attempt: true,
        timeoutPolicyMs: true,
        requiresSafetyCheckpoint: true,
        configuration: true,
      },
    })) as UnitRow | null;
    if (row === null) return { result: 'IGNORED', reason: 'NOT_FOUND' };
    if (row.status !== 'PLANNED') return { result: 'IGNORED', reason: `STATUS_${row.status}` };

    const adapter = deps.registry.find(row.engineId);
    if (adapter === undefined) {
      // No engine here: fail closed and terminal rather than leave the unit PLANNED for the sweep.
      const r = await finalizeUnitAndContinue(
        deps.db,
        row.id,
        row.idempotencyKey,
        { kind: 'REFUSED', reason: 'ENGINE_NOT_REGISTERED' },
        await gateForUnit(deps, row),
      );
      return r.finalize.replayed
        ? { result: 'IGNORED', reason: `STATUS_${r.finalize.status}` }
        : { result: 'REFUSED', reason: 'ENGINE_NOT_REGISTERED' };
    }
    if (adapter.executionUnitClass !== row.executionUnitClass) {
      const r = await finalizeUnitAndContinue(
        deps.db,
        row.id,
        row.idempotencyKey,
        { kind: 'REFUSED', reason: 'ENGINE_CLASS_MISMATCH' },
        await gateForUnit(deps, row),
      );
      return r.finalize.replayed
        ? { result: 'IGNORED', reason: `STATUS_${r.finalize.status}` }
        : { result: 'REFUSED', reason: 'ENGINE_CLASS_MISMATCH' };
    }

    let lease: { grantId: string; leaseId: string; holderToken: string } | null = null;
    const dispatched = await dispatchExecutionUnit(
      deps.db,
      {
        admissionRequestFor: (u) => adapter.admissionRequestFor(u),
        leaseClass: () => adapter.leaseClass,
        ...(adapter.hasCapacity === undefined
          ? {}
          : { hasCapacity: (u) => adapter.hasCapacity!(u) }),
        ...(adapter.guards === undefined ? {} : { guards: (u) => adapter.guards!(u) }),
        ...(adapter.proofs === undefined ? {} : { proofs: (u) => adapter.proofs!(u) }),
        forkInertChild: () => Promise.resolve(forkExecutionChild()),
        ...(adapter.hardStopMarginMs === undefined
          ? {}
          : { hardStopMarginMs: () => adapter.hardStopMarginMs! }),
        requestAdmission: async (r) => {
          const res = await requestAdmission(deps.db, r);
          // The lease token comes from OUR admission result; workers never read AdmissionLease (it holds tokens in clear).
          if (
            res.outcome === 'GRANTED' &&
            res.grantId !== undefined &&
            res.leaseId !== undefined &&
            res.holderToken !== undefined
          ) {
            lease = {
              grantId: res.grantId,
              leaseId: res.leaseId,
              holderToken: res.holderToken,
            };
          }
          return res;
        },
        releaseLeases: (id) => releaseLeasesByExecution(deps.db, id),
      },
      { executionUnitId: row.id, userId: row.userId, hostInstanceId: deps.hostInstanceId },
    );
    if (dispatched.outcome !== 'RUNNING') {
      return { result: dispatched.outcome, reason: dispatched.reason };
    }
    return runUnit(
      deps,
      adapter,
      row,
      dispatched.claimToken,
      lease,
      dispatched.child as IsolatedExecutionChild,
      interval,
      log,
      gateOf,
    );
  };

  function gateOf(_row: { id: string; scanPlanId: string }): GateDeps {
    return { enqueueMaster: () => Promise.resolve() };
  }
}

async function gateForUnit(
  deps: HostDeps,
  row: { id: string; scanPlanId: string },
): Promise<GateDeps> {
  const plan = await deps.db.scanPlan.findUnique({
    where: { id: row.scanPlanId },
    select: { scanId: true },
  });
  return plan?.scanId !== null && plan?.scanId !== undefined && deps.gateFor !== undefined
    ? deps.gateFor(plan.scanId)
    : { enqueueMaster: () => Promise.resolve() };
}

async function runUnit(
  deps: HostDeps,
  adapter: ExecutionAdapter,
  row: UnitRow,
  claimToken: string,
  lease: { grantId: string; leaseId: string; holderToken: string } | null,
  child: IsolatedExecutionChild,
  interval: number,
  log: (m: string, e?: Record<string, unknown>) => void,
  gateOf: (r: { id: string; scanPlanId: string }) => GateDeps,
): Promise<HostResult> {
  const { db } = deps;
  const controller = new AbortController();
  let hardStopFired = false;
  let terminatePromise: Promise<void> | undefined;
  const terminateChild = (): Promise<void> => {
    terminatePromise ??= child.terminate();
    return terminatePromise;
  };
  const margin = adapter.hardStopMarginMs ?? 60_000;
  const hardStop = setTimeout(() => {
    hardStopFired = true;
    controller.abort();
  }, row.timeoutPolicyMs + margin);
  hardStop.unref();
  controller.signal.addEventListener('abort', () => void terminateChild().catch(() => undefined), {
    once: true,
  });

  const host = { executionUnitId: row.id, userId: row.userId, hostInstanceId: deps.hostInstanceId };
  let unit: AdapterUnit;
  let scanId: string | null;
  try {
    unit = (await loadAdapterUnit(db, row.id)) as AdapterUnit;
    scanId =
      (await db.scanPlan.findUnique({ where: { id: row.scanPlanId }, select: { scanId: true } }))
        ?.scanId ?? null;
  } catch (error) {
    clearTimeout(hardStop);
    await terminateChild().catch(() => undefined);
    throw error;
  }
  const gate = (): GateDeps =>
    scanId !== null && deps.gateFor !== undefined ? deps.gateFor(scanId) : gateOf(row);

  let decided: { action: HostLoopAction } | null = null;
  let lastProgress = 0;
  let checkpointStopped = false;

  const renew = async (): Promise<LeaseRenewal> => {
    if (lease === null) return 'RENEWED';
    const r = await renewLease(db, lease);
    return r.status === 'GRANT_INVALID'
      ? r.reason === 'EXPIRED'
        ? 'GRANT_INVALID_EXPIRED'
        : 'GRANT_INVALID_REVOKED'
      : r.status;
  };
  const decide = (): Promise<HostLoopAction> =>
    hostLoopDecision(db, { id: row.id, userId: row.userId, leaseClass: adapter.leaseClass }, renew);

  let ticking = false;
  const loop = setInterval(() => {
    if (ticking || decided !== null) return;
    ticking = true;
    decide()
      .then((action) => {
        if (action.action !== 'CONTINUE') {
          decided = { action };
          controller.abort();
        }
      })
      .catch((error: unknown) => {
        // A loop that cannot read state fails closed: stop, and let the sweep/finalizer decide from durable state.
        log('host loop failed', { error: error instanceof Error ? error.message : String(error) });
        decided = { action: { action: 'STOP_AND_FINALIZE', cause: 'F07_STATE_UNCERTAIN' } };
        controller.abort();
      })
      .finally(() => {
        ticking = false;
      });
  }, interval);
  loop.unref();

  const progress = (tick: ProgressTick): void => {
    emitProgress(deps.publisher, row.id, tick);
    const now = Date.now();
    if (now - lastProgress < (deps.progressMinIntervalMs ?? 2000)) return;
    lastProgress = now;
    void snapshotProgress(db, row.id, tick, {
      ...(deps.progressMinIntervalMs === undefined
        ? {}
        : { minIntervalMs: deps.progressMinIntervalMs }),
      onAnomaly: (m) => log(m),
    }).catch(() => undefined);
  };

  let observation: Awaited<ReturnType<IsolatedExecutionChild['run']>> | null = null;
  let runFinished = false;
  try {
    const context: AdapterContext = {
      unit,
      signal: controller.signal,
      authorizeEffect: (kind, ordinal) =>
        authorizeEffect(db, {
          ...host,
          attempt: row.attempt,
          claimToken,
          kind,
          ordinal,
          leaseClass: adapter.leaseClass,
        }),
      confirmEffect: (kind, ordinal) =>
        confirmEffect(db, { executionUnitId: row.id, attempt: row.attempt, kind, ordinal }),
      recordEvidence: (kind, payload, contentType) =>
        recordExecutionEvidence(db, deps.artifactStore, {
          executionUnitId: row.id,
          userId: row.userId,
          attempt: row.attempt,
          claimToken,
          hostInstanceId: deps.hostInstanceId,
          leaseClass: adapter.leaseClass,
          kind,
          payload,
          ...(contentType === undefined ? {} : { contentType }),
        }),
      progress,
      safetyCheckpoint: async () => {
        if (!row.requiresSafetyCheckpoint) return { outcome: 'PROCEED' as const };
        log('execution child requested an F07 safety checkpoint', { executionUnitId: row.id });
        const admission = adapter.admissionRequestFor(unit);
        const checkpoint = await safetyCheckpoint(db, {
          executionId: row.id,
          targetId: unit.targetId,
          executionClass: admission.executionClass,
          destination: admission.destination,
          ...(scanId === null ? {} : { scanId }),
          idempotencyKey: row.idempotencyKey,
          consumes: admission.consumes,
          abortController: new AbortController(),
          ...(lease === null ? {} : { lease }),
        });
        if (checkpoint.outcome === 'STOP') {
          checkpointStopped = true;
          log('execution child F07 safety checkpoint stopped work', {
            executionUnitId: row.id,
            reason: checkpoint.reason,
          });
          return { outcome: 'STOP' as const, reason: checkpoint.reason };
        }
        return { outcome: 'PROCEED' as const };
      },
    };
    const runPromise = child.run(
      adapter.childModuleUrl,
      adapter.childExportName,
      unit,
      context,
      () => controller.abort(),
    );
    const outcome = await Promise.race([
      runPromise.then((value) => ({ kind: 'RUN' as const, value })),
      new Promise<{ kind: 'STOP' }>((resolve) => {
        if (controller.signal.aborted) return resolve({ kind: 'STOP' });
        controller.signal.addEventListener('abort', () => resolve({ kind: 'STOP' }), {
          once: true,
        });
      }),
    ]);
    if (outcome.kind === 'RUN') {
      runFinished = true;
      observation = outcome.value;
    }
  } catch {
    // An uncaught exception in the engine's own code: ENGINE_DEFECT, classified by the host.
    observation = checkpointStopped ? { source: 'F07_STOP' } : { source: 'ENGINE_EXCEPTION' };
  } finally {
    clearInterval(loop);
    clearTimeout(hardStop);
  }

  // A stop is not durable until the child is confirmed gone. If termination cannot be confirmed,
  // leave the RUNNING row and lease for the planned sweep rather than falsely finalizing it.
  try {
    await terminateChild();
  } catch (error) {
    log('execution child termination unconfirmed; deferring to planned sweep', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { result: 'ABANDONED', reason: 'CHILD_TERMINATION_UNCONFIRMED' };
  }
  if (!runFinished && !hardStopFired && decided === null) {
    // The adapter rejected after an abort race; the host loop still owns the eventual outcome.
    observation ??= checkpointStopped ? { source: 'F07_STOP' } : { source: 'ENGINE_EXCEPTION' };
  }

  // The loop may have decided while the adapter was winding down; otherwise ask once more right before finalizing
  // (a stale holder must not finalize, and a passed deadline changes the outcome).
  const action: HostLoopAction =
    decided !== null ? (decided as { action: HostLoopAction }).action : await decide();
  return finalizeFor(
    deps,
    row,
    action,
    hardStopFired,
    observation ?? { source: 'ENGINE_EXCEPTION' },
    gate(),
    log,
    scanId,
  );
}

async function loadAdapterUnit(db: PrismaClient, id: string): Promise<unknown> {
  const u = await db.executionUnit.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      userId: true,
      targetId: true,
      executionUnitClass: true,
      engineId: true,
      idempotencyKey: true,
      attempt: true,
      timeoutPolicyMs: true,
      requiresSafetyCheckpoint: true,
      targetAuthorizationId: true,
      scanPlanId: true,
      configuration: true,
    },
  });
  return u;
}

async function finalizeFor(
  deps: HostDeps,
  row: UnitRow,
  action: HostLoopAction,
  hardStopFired: boolean,
  observation: Awaited<ReturnType<IsolatedExecutionChild['run']>>,
  gate: GateDeps,
  log: (m: string, e?: Record<string, unknown>) => void,
  scanId: string | null,
): Promise<HostResult> {
  const { db } = deps;
  if (action.action === 'STOP_TERMINAL')
    return { result: 'ABANDONED', reason: 'TERMINAL_ELSEWHERE' };
  if (action.action === 'ABORT_LEASE_LOST') {
    // v6 §7: no finalization by a stale holder; at most acknowledge a pending stop. The sweep finalizes.
    if (action.acknowledgeStop) {
      await acknowledgeStop(db, { executionId: row.id, scope: 'EXECUTION', scopeId: row.id }).catch(
        () => undefined,
      );
    }
    return { result: 'ABANDONED', reason: 'LEASE_LOST' };
  }

  let outcome: FinalizeOutcome;
  if (action.action === 'STOP_AND_FINALIZE') {
    if (action.cause === 'KILL_SWITCH_PENDING') {
      const reason =
        (await findPendingStopReason(db, {
          id: row.id,
          userId: row.userId,
          scanPlanId: row.scanPlanId,
        })) ?? 'SYSTEM_SAFETY_POLICY';
      outcome =
        reason === 'USER_CANCELLATION'
          ? { kind: 'CANCELLED' }
          : { kind: 'KILLED', f07Reason: reason };
    } else {
      outcome = {
        kind: 'KILLED',
        f07Reason:
          action.cause === 'GRANT_REVOKED' ? 'AUTHORIZATION_REVOKED' : 'SYSTEM_SAFETY_POLICY',
      };
    }
  } else if (action.action === 'EXPIRE_AND_FINALIZE') {
    outcome =
      action.cause === 'SCAN_CANCELLED'
        ? { kind: 'CANCELLED' }
        : action.cause === 'SCAN_FAILED'
          ? { kind: 'FAILED', failureClass: 'TRANSIENT_INFRASTRUCTURE' }
          : { kind: 'FAILED', failureClass: 'TIMEOUT', detail: 'SCAN_DEADLINE' };
  } else if (hardStopFired) {
    outcome = { kind: 'FAILED', failureClass: 'TIMEOUT', detail: 'HARD_STOP' };
  } else {
    const c = classifyFailure(observation);
    outcome =
      c.outcome === 'COMPLETED'
        ? { kind: 'COMPLETED' }
        : { kind: 'FAILED', failureClass: c.failureClass };
  }

  const r = await finalizeUnitAndContinue(db, row.id, row.idempotencyKey, outcome, gate);
  if (!r.finalize.replayed && outcome.kind === 'COMPLETED' && deps.onUnitCompleted !== undefined) {
    await deps.onUnitCompleted(row.scanPlanId).catch((e: unknown) =>
      log('enqueue of eligible units failed', {
        error: e instanceof Error ? e.message : String(e),
      }),
    );
  }
  void scanId;
  return { result: 'FINALIZED', status: r.finalize.status, replayed: r.finalize.replayed };
}
