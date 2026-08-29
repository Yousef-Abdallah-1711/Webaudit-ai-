/**
 * The containment wrapper. One implementation, used by both the module runner
 * and the conformance suite.
 *
 * It was private to `conformance/suite.ts` until the runner needed it (T088).
 * Copying it would have been the easy move and the wrong one: the conformance
 * suite's whole claim is that it "runs the capability inside the same containment
 * wrapper the runner will use", and two copies make that claim decay the first
 * time one of them is fixed. Extracting it makes the claim true.
 *
 * FR-022: "complete an audit when an individual capability fails, marking the
 * affected area incomplete rather than failing the audit." SC-011 depends on the
 * same property. What that requires of this function is narrow and absolute:
 *
 *   **It never throws, and it always returns.** A synchronous throw, a rejected
 *   promise, and a promise that never settles are three different bugs in a
 *   capability and one shape of result here. A wrapper that rethrows on timeout
 *   would put the caller back in the business of catching, which is how one
 *   capability's defect becomes an orchestrator crash and a failed audit somebody
 *   paid for.
 *
 * **What it cannot do, stated rather than assumed:** observe an exception from a
 * callback the capability scheduled and then detached from the promise `work()`
 * returns — `setTimeout`, a fire-and-forget async IIFE, an event listener. That
 * callback runs after this function has already returned its result, so there is
 * no promise left to race against. It becomes a bare Node `uncaughtException` or
 * `unhandledRejection`, and closing that gap is `apps/worker/src/process-guards.ts`'s
 * job, not this function's — see `capability-context.ts` for the attribution
 * thread between the two.
 */

/** Every way a capability call can end, as data. */
export type Contained<T> =
  | { readonly kind: 'resolved'; readonly value: T; readonly durationMs: number }
  | { readonly kind: 'rejected'; readonly error: unknown; readonly durationMs: number }
  | { readonly kind: 'timeout'; readonly durationMs: number };

export interface ContainOptions {
  readonly timeoutMs: number;
  /** Injected so a caller can assert duration without a real clock. */
  readonly now?: () => number;
}

export async function containCapabilityCall<T>(
  work: () => Promise<T>,
  options: ContainOptions,
): Promise<Contained<T>> {
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const elapsed = (): number => Math.max(0, now() - startedAt);

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<Contained<T>>((resolve) => {
    timer = setTimeout(
      () => resolve({ kind: 'timeout', durationMs: elapsed() }),
      options.timeoutMs,
    );
    // Never hold the process open for a capability that has already lost.
    timer.unref?.();
  });

  try {
    return await Promise.race([
      (async (): Promise<Contained<T>> => {
        try {
          // `await work()` inside the try, so a capability that throws
          // synchronously instead of rejecting is caught here rather than
          // escaping the race.
          return { kind: 'resolved', value: await work(), durationMs: elapsed() };
        } catch (error) {
          return { kind: 'rejected', error, durationMs: elapsed() };
        }
      })(),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Stringify something a capability threw.
 *
 * `String(value)` on a plain object yields `[object Object]`, which turns a
 * useful failure detail into noise — and this text is what an operator reads to
 * decide whether a capability should stay enabled.
 */
export function describeThrown(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? Object.prototype.toString.call(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}
