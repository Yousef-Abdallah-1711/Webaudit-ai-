/**
 * SPEC 008 (Foundation Spec 07) — the scope-keyed kill-switch notification
 * channels and message shape, shared between `apps/api` (publisher, once its
 * `KillSwitchState` write has committed) and `apps/worker` (subscriber, for the
 * lifetime of one execution unit).
 *
 * Generalises `cancellation.ts`'s single per-scan channel to the six scopes
 * `research.md` R4 defines. Same rule: this channel is a best-effort
 * accelerant, never the authority — the Postgres `KillSwitchState` row is. A
 * message that fails validation, or never arrives, must not be treated as a
 * stop and must not crash the receiver; the checkpoint's own poll (<= 5 s,
 * FR-013) still observes the stop.
 */

import { z } from 'zod';

import {
  KILL_SWITCH_REASONS,
  SAFETY_SCOPES,
  type KillSwitchReason,
  type SafetyScope,
} from '@webaudit/types';

export { KILL_SWITCH_REASONS, SAFETY_SCOPES };
export type { KillSwitchReason, SafetyScope };

/** An id becomes part of a Redis channel name, so it must never be pattern-injectable. */
const UNSAFE_ID = /[\s:*?[\]\\]/;

function assertSafeId(scope: SafetyScope, scopeId: string | undefined): string {
  if (scopeId === undefined || scopeId.length === 0 || UNSAFE_ID.test(scopeId)) {
    throw new RangeError(`Invalid ${scope} id for a safety channel.`);
  }
  return scopeId;
}

/** One channel per `(scope, id)` — never client-suppliable, always derived server-side. */
export function safetyStopChannel(scope: SafetyScope, scopeId?: string): string {
  if (scope === 'PLATFORM') return 'safety:stop:platform';
  return `safety:stop:${scope.toLowerCase()}:${assertSafeId(scope, scopeId)}`;
}

export interface SafetyChannelIdentity {
  executionId: string;
  scanId: string;
  grantId: string;
  targetId: string;
  userId: string;
}

/** Every channel an execution unit must listen on, in `SAFETY_SCOPES` order (platform last). */
export function safetyStopChannelsFor(identity: SafetyChannelIdentity): string[] {
  return [
    safetyStopChannel('EXECUTION', identity.executionId),
    safetyStopChannel('SCAN', identity.scanId),
    safetyStopChannel('GRANT', identity.grantId),
    safetyStopChannel('TARGET', identity.targetId),
    safetyStopChannel('TENANT', identity.userId),
    safetyStopChannel('PLATFORM'),
  ];
}

export const safetyStopSignalSchema = z.object({
  scope: z.enum(SAFETY_SCOPES),
  /** The literal `platform` for the PLATFORM scope. */
  scopeId: z.string().min(1),
  reason: z.enum(KILL_SWITCH_REASONS),
  /** Diagnostics only — never used to decide whether a stop "took". */
  at: z.string().datetime(),
});

export type SafetyStopSignal = z.infer<typeof safetyStopSignalSchema>;
