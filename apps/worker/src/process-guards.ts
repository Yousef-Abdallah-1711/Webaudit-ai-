/**
 * The backstop for a capability's detached throw.
 *
 * `containCapabilityCall` (`@webaudit/capability-sdk`) contains everything a
 * capability's returned promise can do. It cannot contain a callback the
 * capability scheduled and then detached from that promise — `setTimeout`, a
 * fire-and-forget async IIFE, an event listener left running. That callback
 * throws after the containment wrapper has already returned its result, so
 * there is nothing left to catch it; it becomes a bare Node `uncaughtException`
 * or `unhandledRejection`, and Node's default action for either is to terminate
 * the process.
 *
 * That default is the actual failure here. FR-022 and SC-011 promise that one
 * capability's defect degrades the affected area, never the audit — and a
 * process crash breaks that promise for every scan and phase job running
 * concurrently in this worker, not only the one whose capability misbehaved.
 * `apps/worker/src/index.ts`'s own note already makes this concrete: a phase
 * job is `attempts: 1` and has "charged credits and written rows" before it
 * runs, so a crash here is plausibly a customer charged for a scan that never
 * completes.
 *
 * **The trade this makes, stated rather than hidden.** Node's documentation is
 * explicit that resuming after `uncaughtException` leaves the process in an
 * unknown state, and the conservative response is to let it crash and have an
 * orchestrator restart it. That advice is for arbitrary application bugs. What
 * reaches this handler is narrower and better understood: there is no sandbox
 * boundary yet (R1, Phase 10 — `sandbox-runner` does not exist), so a
 * capability's code runs in this same process, and the two events this
 * installs for are specifically the shape a capability's own loose end
 * produces. Staying up serves the scans this process is not touching; going
 * down guarantees it fails them. Once `sandbox-runner` exists this backstop
 * stops mattering for capability code, because the code that could trip it no
 * longer shares a process with the orchestrator.
 *
 * This is deliberately not a `try/catch` inside `runCodeLayer` — there is no
 * `try` that can wrap a callback the language has already let escape to the
 * event loop. The only place left to intercept it is the process itself.
 */

import { currentCapabilityId } from '@webaudit/capability-sdk';

export interface CapabilityIncident {
  readonly kind: 'uncaughtException' | 'unhandledRejection';
  readonly capabilityId: string | undefined;
  readonly error: unknown;
}

export interface ProcessGuardOptions {
  /** Defaults to logging via `console.error`. Injected so tests can observe it. */
  readonly onIncident?: (incident: CapabilityIncident) => void;
}

function describe(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function defaultReport(incident: CapabilityIncident): void {
  const who = incident.capabilityId ?? 'an unattributed capability';
  console.error(
    `[worker] ${incident.kind} escaped containment, attributed to ${who}. ` +
      `The process is staying up; this capability should be disabled. ` +
      describe(incident.error),
  );
}

/**
 * Installs the two handlers. Idempotent per call — returns a function that
 * removes exactly the listeners this call added, so a test (or a hot reload)
 * can install and uninstall without leaking listeners across runs.
 *
 * Registering a listener for either event is also what suppresses Node's
 * default crash-on-fire behaviour; an unguarded process has none installed
 * (confirmed: no other file in this repository installs one), so today every
 * detached capability throw is fatal.
 */
export function installProcessGuards(options: ProcessGuardOptions = {}): () => void {
  const report = options.onIncident ?? defaultReport;

  const onUncaughtException = (error: unknown): void => {
    report({ kind: 'uncaughtException', capabilityId: currentCapabilityId(), error });
  };
  const onUnhandledRejection = (reason: unknown): void => {
    report({ kind: 'unhandledRejection', capabilityId: currentCapabilityId(), error: reason });
  };

  process.on('uncaughtException', onUncaughtException);
  process.on('unhandledRejection', onUnhandledRejection);

  return () => {
    process.off('uncaughtException', onUncaughtException);
    process.off('unhandledRejection', onUnhandledRejection);
  };
}
