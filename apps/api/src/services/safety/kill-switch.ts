/**
 * SPEC 008 `contracts/kill-switch-contract.md` as amended by A1 (DEC-048/049).
 *
 * Authority is decided inside `f07_trigger_stop` from database facts (operator
 * flag, scan/lease ownership), never from the caller's claim; a refusal is one
 * uniform `SafetyForbiddenError` whether the target exists or not. The Postgres
 * row is authoritative; the Redis publish is a best-effort accelerant that is
 * sent only after the caller's own commit.
 */

import {
  KILL_SWITCH_REASONS,
  safetyStopChannel,
  safetyStopSignalSchema,
  type KillSwitchReason,
  type SafetyScope,
} from '@webaudit/config';
import { Prisma } from '../../../prisma/generated/client/index.js';
import { isForbiddenFailure, SafetyForbiddenError, type SafetyDb } from './db.js';
import type { StopLifecycleState } from './stop-lifecycle.js';

export interface TriggerStopResult {
  /** False when an already-pending stop existed (idempotent no-op, no second audit event). */
  created: boolean;
  state: StopLifecycleState;
  scope: SafetyScope;
  scopeId: string;
}

export async function triggerStop(
  db: SafetyDb,
  input: { scope: SafetyScope; scopeId: string; triggeredBy: string; reason: KillSwitchReason },
): Promise<TriggerStopResult> {
  if (!KILL_SWITCH_REASONS.includes(input.reason)) throw new RangeError('unknown stop reason');
  try {
    const rows = await db.$queryRaw<Array<{ r: TriggerStopResult }>>(Prisma.sql`
      SELECT public.f07_trigger_stop(${input.scope}::"SafetyScope", ${input.scopeId},
        ${input.triggeredBy}, ${input.reason}::"KillSwitchReason") AS r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('f07_trigger_stop returned nothing');
    return r;
  } catch (error) {
    if (isForbiddenFailure(error)) throw new SafetyForbiddenError();
    throw error;
  }
}

/** Finalizer acknowledgement (DEC-048 a): call inside the terminalization transaction. */
export async function acknowledgeStopByAuthority(
  db: SafetyDb,
  executionId: string,
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
    SELECT public.f07_ack_stop_by_authority(${executionId}) AS ok`);
  return rows[0]?.ok === true;
}

export async function acknowledgeStop(
  db: SafetyDb,
  input: { executionId: string; scope: SafetyScope; scopeId: string },
): Promise<{ changed: boolean; state: StopLifecycleState | null }> {
  const rows = await db.$queryRaw<
    Array<{ r: { changed: boolean; state: StopLifecycleState | null } }>
  >(Prisma.sql`SELECT public.f07_ack_stop(${input.executionId}, ${input.scope}::"SafetyScope",
      ${input.scopeId}) AS r`);
  return rows[0]?.r ?? { changed: false, state: null };
}

/** STOPPED only from ACKNOWLEDGED and only when no live in-scope lease remains (DEC-049). */
export async function recordStopped(
  db: SafetyDb,
  input: { executionId: string; scope: SafetyScope; scopeId: string },
): Promise<{ changed: boolean; reason?: 'NOT_FOUND' | 'NOT_ACKNOWLEDGED' | 'LIVE_LEASE' }> {
  const rows = await db.$queryRaw<
    Array<{ r: { changed: boolean; reason?: 'NOT_FOUND' | 'NOT_ACKNOWLEDGED' | 'LIVE_LEASE' } }>
  >(Prisma.sql`SELECT public.f07_record_stopped(${input.executionId}, ${input.scope}::"SafetyScope",
      ${input.scopeId}) AS r`);
  return rows[0]?.r ?? { changed: false, reason: 'NOT_FOUND' };
}

export async function markEscalated(
  db: SafetyDb,
  input: { executionId: string; scope: SafetyScope; scopeId: string },
): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ ok: boolean }>>(Prisma.sql`
    SELECT public.f07_mark_escalated(${input.executionId}, ${input.scope}::"SafetyScope",
      ${input.scopeId}) AS ok`);
  return rows[0]?.ok === true;
}

export interface StopPublisher {
  publish(channel: string, message: string): Promise<unknown>;
}

/** Best-effort accelerant: a failure here never fails the (already committed) stop. */
export async function publishStopSignal(
  publisher: StopPublisher,
  stop: Pick<TriggerStopResult, 'scope' | 'scopeId'>,
  reason: KillSwitchReason,
): Promise<void> {
  try {
    const signal = safetyStopSignalSchema.parse({
      scope: stop.scope,
      scopeId: stop.scopeId,
      reason,
      at: new Date().toISOString(),
    });
    await publisher.publish(safetyStopChannel(stop.scope, stop.scopeId), JSON.stringify(signal));
  } catch (error) {
    console.error('[kill-switch] best-effort stop publish failed:', error);
  }
}
