/**
 * SPEC 008 `contracts/kill-switch-contract.md` — the execution host's half of the
 * kill switch (T021): observe a pending stop within the 5 s bound (FR-013),
 * abort the unit's composed `AbortSignal`, let the unit acknowledge, and
 * escalate (FR-014) if it does not within 5 s of the stop being requested.
 *
 * New, additive wiring next to `cancellation.ts`; scan cancellation behaviour is
 * untouched (FR-026). The Postgres `KillSwitchState` row is authoritative: the
 * poll alone is sufficient, and an optional Redis subscription (`subscribe`)
 * only makes it faster. A lost or malformed message degrades to the next poll.
 *
 * Escalation proceeds even when its own bookkeeping fails (audit rule 2a): the
 * abort and `onEscalate` (for example the sandbox runner's SIGKILL) happen
 * first; the `escalatedAt` write is then retried a bounded number of times.
 */

import {
  acknowledgeStop,
  findPendingStop,
  markEscalated,
  recordStopped,
  type PendingStop,
  type SafetyDb,
  type SafetyIdentity,
} from '@webaudit/api/safety';
import { safetyStopChannel } from '@webaudit/config';

/** FR-013 / FR-014: the stop must be observed and acknowledged within this bound. */
export const STOP_BOUND_MS = 5_000;

export interface StopWatcherOptions {
  db: SafetyDb;
  identity: SafetyIdentity & { grantId: string };
  /** The unit's own composed controller (research R6); aborted on the first observed stop. */
  abortController: AbortController;
  /** Poll cadence; clamped to [50 ms, 5 s] so the FR-013 bound can never be exceeded by configuration. */
  pollIntervalMs?: number;
  /** Time after the stop was requested at which an unacknowledged stop escalates. Clamped to <= 5 s. */
  escalationMs?: number;
  /** Optional accelerant: call `onMessage` for any message on the given channels; return an unsubscribe. */
  subscribe?: (channels: string[], onMessage: () => void) => () => void;
  /** The forced-termination hook (for a sandboxed child: its SIGKILL path). Must not throw. */
  onEscalate?: () => void | Promise<void>;
  onError?: (error: unknown) => void;
}

export interface StopWatcher {
  /** Resolves with the stop that was observed (or null once stopped without one). */
  readonly observed: Promise<PendingStop | null>;
  /** The unit has ceased safety-sensitive action: record `ACKNOWLEDGED`. Idempotent. */
  acknowledge(): Promise<void>;
  /** The unit has fully exited and released its lease: try to record `STOPPED`. */
  complete(): Promise<boolean>;
  readonly escalated: boolean;
  stop(): void;
}

function clamp(value: number | undefined, fallback: number, min: number, max: number): number {
  const v = value ?? fallback;
  return Math.min(Math.max(v, min), max);
}

export function startStopWatcher(options: StopWatcherOptions): StopWatcher {
  const pollMs = clamp(options.pollIntervalMs, 1_000, 50, STOP_BOUND_MS);
  const escalationMs = clamp(options.escalationMs, STOP_BOUND_MS, 0, STOP_BOUND_MS);
  const onError = options.onError ?? ((error: unknown) => console.error('[kill-switch]', error));

  let escalationTimer: NodeJS.Timeout | undefined;
  let halted = false;
  let seen: PendingStop | null = null;
  let acknowledged = false;
  let escalated = false;
  let resolveObserved: (value: PendingStop | null) => void = () => undefined;
  const observed = new Promise<PendingStop | null>((resolve) => (resolveObserved = resolve));

  const channels = [
    safetyStopChannel('EXECUTION', options.identity.executionId),
    ...(options.identity.scanId ? [safetyStopChannel('SCAN', options.identity.scanId)] : []),
    safetyStopChannel('GRANT', options.identity.grantId),
    safetyStopChannel('TARGET', options.identity.targetId),
    safetyStopChannel('TENANT', options.identity.userId),
    safetyStopChannel('PLATFORM'),
  ];
  const unsubscribe = options.subscribe?.(channels, () => void poll());

  async function escalate(stop: PendingStop): Promise<void> {
    if (escalated || acknowledged) return;
    escalated = true;
    options.abortController.abort();
    try {
      await options.onEscalate?.();
    } catch (error) {
      onError(error);
    }
    // The kill itself never waits on bookkeeping; the audit write is retried a few times.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await markEscalated(options.db, {
          executionId: options.identity.executionId,
          scope: stop.scope,
          scopeId: stop.scopeId,
        });
        return;
      } catch (error) {
        onError(error);
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
      }
    }
  }

  async function poll(): Promise<void> {
    if (halted || seen !== null) return;
    let stop: PendingStop | null;
    try {
      stop = await findPendingStop(options.db, options.identity);
    } catch (error) {
      // Cannot read the kill switch: fail closed for this unit.
      onError(error);
      options.abortController.abort();
      return;
    }
    if (stop === null || halted || seen !== null) return;
    seen = stop;
    options.abortController.abort();
    resolveObserved(stop);
    const requestedMs = Date.parse(stop.requestedAt);
    const elapsed = Number.isFinite(requestedMs) ? Date.now() - requestedMs : 0;
    const remaining = Math.min(Math.max(escalationMs - elapsed, 0), escalationMs);
    escalationTimer = setTimeout(() => void escalate(stop), remaining);
  }

  const timer = setInterval(() => void poll(), pollMs);
  void poll();

  return {
    observed,
    async acknowledge(): Promise<void> {
      if (seen === null || acknowledged) return;
      acknowledged = true;
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
      await acknowledgeStop(options.db, {
        executionId: options.identity.executionId,
        scope: seen.scope,
        scopeId: seen.scopeId,
      });
    },
    async complete(): Promise<boolean> {
      if (seen === null) return false;
      const result = await recordStopped(options.db, {
        executionId: options.identity.executionId,
        scope: seen.scope,
        scopeId: seen.scopeId,
      });
      return result.changed;
    },
    get escalated() {
      return escalated;
    },
    stop(): void {
      halted = true;
      clearInterval(timer);
      if (escalationTimer !== undefined) clearTimeout(escalationTimer);
      unsubscribe?.();
      resolveObserved(seen);
    },
  };
}
