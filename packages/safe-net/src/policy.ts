/**
 * What the guard will and will not dial, and the bounds every request runs under.
 *
 * `allowLoopback` exists for one reason: the adverse suites have to serve
 * redirect hops and a rebinding victim from a real socket, and a real socket on
 * this machine is loopback. It is a field rather than a constant so those suites
 * can drive `guardedFetch` honestly instead of stubbing the transport out.
 *
 * It is not an escape hatch. `src/index.ts` — the package's only export path,
 * and the only thing any other package can import — takes no policy argument
 * and constructs `DEFAULT_POLICY` itself. There is no way to reach this flag
 * from outside `packages/safe-net`.
 */

export interface AddressPolicy {
  /**
   * Permit 127.0.0.0/8 and ::1. False everywhere except this package's own
   * tests. Every other disallowed class stays refused regardless.
   */
  readonly allowLoopback: boolean;
}

export const DEFAULT_POLICY: AddressPolicy = { allowLoopback: false };

/** Redirect hops followed before the chain is refused (FR-014, layer 4). */
export const DEFAULT_MAX_REDIRECTS = 5;

/** Wall-clock budget for a whole chain, including every DNS lookup. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Bytes buffered before the body is refused. A guarded fetch reads the response
 * into memory so the socket can be closed and the connection pool destroyed —
 * a pooled socket outliving its validation is a rebinding window.
 */
export const DEFAULT_MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
