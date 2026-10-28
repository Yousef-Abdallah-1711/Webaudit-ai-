/**
 * SPEC 008 `contracts/safety-checkpoint-contract.md` — the one call every engine
 * makes at dispatch and at every safety-sensitive action (FR-018/019).
 *
 * With no lease it runs full admission. With a held lease it renews it: the
 * renewal refuses while any covering stop is pending and fences a superseded
 * holder, and both outcomes are treated as an immediate stop (FR-006a). A STOP
 * aborts the caller's composed controller so in-flight outbound calls end.
 */

import type { ExecutionClass } from '@webaudit/types';
import type { SafetyScope } from '@webaudit/config';
import type { RepositoryDestination, WebDestination } from '../authorization/scope-match.js';
import {
  renewLease,
  requestAdmission,
  type AdmissionRefusalReason,
  type AdmissionRequest,
} from './admission.js';
import type { SafetyDb } from './db.js';

export type CheckpointStopReason = AdmissionRefusalReason | 'LEASE_FENCED';

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
  /** A lease this unit already holds: renew it instead of re-admitting. */
  lease?: { grantId: string; leaseId: string; holderToken: string };
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
    const renewed = await renewLease(db, request.lease);
    if (renewed.status === 'RENEWED') {
      return {
        outcome: 'PROCEED',
        grantId: request.lease.grantId,
        leaseId: request.lease.leaseId,
        holderToken: request.lease.holderToken,
      };
    }
    if (renewed.status === 'STOP_PENDING') {
      return stop({
        outcome: 'STOP',
        reason: 'KILL_SWITCH_PENDING',
        scope: renewed.scope,
        scopeId: renewed.scopeId,
      });
    }
    return stop({ outcome: 'STOP', reason: 'LEASE_FENCED' });
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
    reason: result.reason,
    ...(result.scope === undefined ? {} : { scope: result.scope }),
    ...(result.scopeId === undefined ? {} : { scopeId: result.scopeId }),
  });
}
