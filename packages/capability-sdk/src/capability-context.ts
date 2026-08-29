/**
 * Which capability's code is executing right now, if any — process-wide, not
 * per-batch.
 *
 * `containCapabilityCall` catches everything a capability's returned promise
 * can do: a synchronous throw, a rejection, a timeout. It structurally cannot
 * catch an exception thrown from a callback the capability scheduled and then
 * detached from that promise — `setTimeout`, a fire-and-forget async IIFE, an
 * event listener that outlives the call. That callback runs after
 * `containCapabilityCall` has already returned, its throw becomes a Node
 * `uncaughtException` or `unhandledRejection`, and Node's default action for
 * either is to terminate the process — taking every concurrently-running scan
 * with it, not just the one whose capability misbehaved.
 *
 * The backstop for that lives at the process boundary
 * (`apps/worker/src/process-guards.ts`), and it needs to know which capability
 * was running when the loose end fired so the incident is attributable rather
 * than an anonymous crash log an operator cannot act on. This context is the
 * thread between the two: `runCodeLayer` enters it around every capability
 * call, and the process-level handler reads it — potentially long after the
 * batch that call belonged to has finished, since that is exactly the timing
 * this exists to cover.
 *
 * `AsyncLocalStorage` is the right primitive here because it propagates
 * through `setTimeout`, `setInterval`, and promise continuations by
 * construction — the same guarantee `code-layer.ts` already relied on for
 * attributing an egress violation to the right capability. This module is that
 * mechanism, made a singleton so a handler outside the batch that created it
 * can still read it.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const capabilityContext = new AsyncLocalStorage<string>();

/** Runs `fn` (and everything it schedules, however late) attributed to `capabilityId`. */
export function runAsCapability<T>(capabilityId: string, fn: () => T): T {
  return capabilityContext.run(capabilityId, fn);
}

/** The capability whose context is active, or `undefined` outside any of them. */
export function currentCapabilityId(): string | undefined {
  return capabilityContext.getStore();
}
