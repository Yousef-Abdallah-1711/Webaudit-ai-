/**
 * SPEC 008 `contracts/safety-checkpoint-contract.md` — the one call every engine
 * makes at dispatch and at every safety-sensitive action (FR-018/019).
 *
 * Order (FR-018): pending-stop check, a *fresh* `isAuthorized` for the
 * destination, then budget. With no lease it runs full admission. With a held
 * lease it first re-runs authorization (so a grant that expired, a destination
 * that left scope, or an environment reclassification is rediscovered at every
 * checkpoint — FR-016a/FR-016) and then renews: the renewal refuses while any
 * covering stop is pending, fences a superseded holder, and refuses a revoked or
 * expired grant. Every refusal aborts the caller's composed controller.
 *
 * FR-021: anything that prevents the checkpoint from knowing the state — a
 * failed read, an `isAuthorized` that throws — is `STATE_UNCERTAIN`: it aborts
 * and stops exactly as a pending stop would, with a reason that cannot be
 * mistaken for a genuine `KILL_SWITCH_PENDING`.
 */

import type { ExecutionClass } from '@webaudit/types';
import type { SafetyScope } from '@webaudit/config';
import { isAuthorized } from '../authorization/check.js';
import type { RepositoryDestination, WebDestination } from '../authorization/scope-match.js';
import {
  renewLease,
  requestAdmission,
  type AdmissionRefusalReason,
  type AdmissionRequest,
} from './admission.js';
import { databaseNowFor, type SafetyDb } from './db.js';
import { triggerStop } from './kill-switch.js';
import { findPendingStop, type PendingStop } from './kill-switch-state.js';

export type CheckpointStopReason =
  Exclude<AdmissionRefusalReason, 'INTERNAL_ERROR'> | 'LEASE_FENCED' | 'STATE_UNCERTAIN';

export type CheckpointResult =
  | { outcome: 'PROCEED'; grantId: string; leaseId?: string; holderToken?: string }
  | { outcome: 'STOP'; reason: CheckpointStopReason; scope?: SafetyScope; scopeId?: string };

export interface CheckpointRequest {
  executionId: string;
  targetId: string;
  executionClass: ExecutionClass;
  destination: WebDestination | RepositoryDestination;
  scanId?: string;
  idempotencyKey: string;
  consumes: { request: boolean; concurrency: boolean };
  abortController: AbortController;
  /** A lease this unit already holds: re-authorize and renew it instead of re-admitting. */
  lease?: { grantId: string; leaseId: string; holderToken: string };
}

async function recheckAuthorization(
  db: SafetyDb,
  request: CheckpointRequest,
): Promise<{ ok: true } | { ok: false; reason: CheckpointStopReason }> {
  try {
    const target = await db.target.findUnique({
      where: { id: request.targetId },
      select: { userId: true },
    });
    if (target === null) return { ok: false, reason: 'NO_MATCHING_GRANT' };
    const authz = await isAuthorized(db, {
      targetId: request.targetId,
      userId: target.userId,
      executionClass: request.executionClass,
      destination: request.destination,
      now: await databaseNowFor(db),
    });
    if (authz.outcome === 'AUTHORIZED') return { ok: true };
    // Budget is decided by the locked check inside admission, not by this advisory read.
    if (authz.reason === 'BUDGET_EXHAUSTED') return { ok: true };
    if (authz.reason === 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED') {
      // FR-016: an environment refusal is a stop trigger, and once REQUESTED it is never
      // cancelled by a later reclassification back. Idempotent against an existing stop.
      await triggerStop(db, {
        scope: 'EXECUTION',
        scopeId: request.executionId,
        triggeredBy: 'SYSTEM',
        reason: 'ENVIRONMENT_RECLASSIFIED',
      });
    }
    return { ok: false, reason: authz.reason };
  } catch {
    return { ok: false, reason: 'STATE_UNCERTAIN' };
  }
}

async function pendingStopFor(
  db: SafetyDb,
  request: CheckpointRequest,
): Promise<PendingStop | 'UNCERTAIN' | null> {
  try {
    const target = await db.target.findUnique({
      where: { id: request.targetId },
      select: { userId: true },
    });
    if (target === null) return null; // authorization re-check reports NO_MATCHING_GRANT
    return await findPendingStop(db, {
      executionId: request.executionId,
      scanId: request.scanId ?? null,
      grantId: request.lease?.grantId ?? null,
      targetId: request.targetId,
      userId: target.userId,
    });
  } catch {
    return 'UNCERTAIN';
  }
}

export async function safetyCheckpoint(
  db: SafetyDb,
  request: CheckpointRequest,
): Promise<CheckpointResult> {
  const stop = (result: Extract<CheckpointResult, { outcome: 'STOP' }>): CheckpointResult => {
    request.abortController.abort();
    return result;
  };

  if (request.lease !== undefined) {
    // FR-018 order: the pending-stop check comes first, then the fresh authorization re-check.
    const pending = await pendingStopFor(db, request);
    if (pending === 'UNCERTAIN') return stop({ outcome: 'STOP', reason: 'STATE_UNCERTAIN' });
    if (pending !== null) {
      return stop({
        outcome: 'STOP',
        reason: 'KILL_SWITCH_PENDING',
        scope: pending.scope,
        scopeId: pending.scopeId,
      });
    }
    const authorization = await recheckAuthorization(db, request);
    if (!authorization.ok) return stop({ outcome: 'STOP', reason: authorization.reason });

    const renewed = await renewLease(db, request.lease);
    switch (renewed.status) {
      case 'RENEWED':
        return {
          outcome: 'PROCEED',
          grantId: request.lease.grantId,
          leaseId: request.lease.leaseId,
          holderToken: request.lease.holderToken,
        };
      case 'STOP_PENDING':
        return stop({
          outcome: 'STOP',
          reason: 'KILL_SWITCH_PENDING',
          scope: renewed.scope,
          scopeId: renewed.scopeId,
        });
      case 'GRANT_INVALID':
        return stop({ outcome: 'STOP', reason: renewed.reason });
      case 'UNCERTAIN':
        return stop({ outcome: 'STOP', reason: 'STATE_UNCERTAIN' });
      case 'FENCED':
        return stop({ outcome: 'STOP', reason: 'LEASE_FENCED' });
    }
  }

  const admissionRequest: AdmissionRequest = {
    targetId: request.targetId,
    executionClass: request.executionClass,
    destination: request.destination,
    executionId: request.executionId,
    idempotencyKey: request.idempotencyKey,
    consumes: request.consumes,
    ...(request.scanId === undefined ? {} : { scanId: request.scanId }),
  };
  const result = await requestAdmission(db, admissionRequest);
  if (result.outcome === 'GRANTED') {
    return {
      outcome: 'PROCEED',
      grantId: result.grantId,
      ...(result.leaseId === undefined ? {} : { leaseId: result.leaseId }),
      ...(result.holderToken === undefined ? {} : { holderToken: result.holderToken }),
    };
  }
  return stop({
    outcome: 'STOP',
    reason: result.reason === 'INTERNAL_ERROR' ? 'STATE_UNCERTAIN' : result.reason,
    ...(result.scope === undefined ? {} : { scope: result.scope }),
    ...(result.scopeId === undefined ? {} : { scopeId: result.scopeId }),
  });
}
