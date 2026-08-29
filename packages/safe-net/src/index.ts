/**
 * T051 — the only way into this package.
 *
 * `package.json` declares `exports` as this file alone, so no other package can
 * reach `safe-fetch.ts`, `connect-guard.ts`, or `policy.ts`. That matters: the
 * internal `guardedFetch` accepts an address policy and a DNS resolver so this
 * package's own adverse suites can serve hops from a real socket and script a
 * rebinding resolver. Neither is reachable from here.
 *
 * `safeFetch` therefore has no argument that can weaken it. There is no
 * `allowPrivate`, no `skipValidation`, no injectable dispatcher. Per plan.md,
 * "only `safe-net` exposes fetch to a capability" — a capability that wants to
 * reach an internal address has to change this package and answer for it in
 * review.
 */

import {
  guardedFetch,
  guardedTargetCheck,
  type SafeFetchInit,
  type SafeResponse,
} from './safe-fetch.js';

export type { SafeFetchInit, SafeResponse } from './safe-fetch.js';
export { SsrfRefusedError, type SsrfRefusalReason } from './errors.js';

/**
 * Fetch a URL with all four R6 layers applied: form, resolution, connect-time
 * peer address, and per-hop redirect re-validation.
 *
 * @throws SsrfRefusedError for any target that must not be reached. The
 *   `reason` says which layer refused; callers use it to decline the charge
 *   (Principle VI) and to tell the user something true.
 */
export function safeFetch(url: string, init: SafeFetchInit = {}): Promise<SafeResponse> {
  const policy = allowlistedPolicyFor(url);
  // Copied field by field rather than forwarded. TypeScript rejects an excess
  // `policy` on an object literal but not on a variable, and a capability is
  // free to be JavaScript — so `guardedFetch(url, init)` would let the internal
  // seam through at runtime. Anything not named here cannot reach the guard.
  return guardedFetch(url, {
    ...(init.method === undefined ? {} : { method: init.method }),
    ...(init.headers === undefined ? {} : { headers: init.headers }),
    ...(init.body === undefined ? {} : { body: init.body }),
    ...(init.signal === undefined ? {} : { signal: init.signal }),
    ...(init.maxRedirects === undefined ? {} : { maxRedirects: init.maxRedirects }),
    ...(init.timeoutMs === undefined ? {} : { timeoutMs: init.timeoutMs }),
    ...(init.maxResponseBytes === undefined ? {} : { maxResponseBytes: init.maxResponseBytes }),
    ...(policy === undefined ? {} : { policy }),
  });
}

/**
 * `{ allowLoopback: true }` when `url`'s origin is in `SAFE_NET_ALLOW_TARGETS`,
 * `undefined` (meaning "use `DEFAULT_POLICY`") otherwise.
 *
 * **This closes a real gap in the allowlist below.** `SAFE_NET_ALLOW_TARGETS`
 * shipped only checked by `assertPublicTarget` — target *submission* — and
 * `safeFetch` (what a capability's `ctx.fetch` actually calls at execution
 * time) went straight to `guardedFetch` with no allowlist check at all. That
 * was invisible until a real capability first called `ctx.fetch` against a
 * loopback fixture server (T119-124's own conformance suite): every call was
 * refused with `LITERAL_ADDRESS_DISALLOWED`, regardless of the env var.
 * `assertPublicTarget`'s docstring already claimed "`safeFetch` re-runs all
 * four layers when the target is actually visited" — true of the guard
 * layers, but the allowlist itself never travelled with it.
 *
 * `allowLoopback: true` widens to the whole loopback *class* for every hop
 * of this fetch, not only the originally-requested origin — coarser than an
 * exact-origin check, and accepted for the same reason `assertPublicTarget`
 * accepts an origin-level match: this only ever activates under an
 * affirmatively-set, production-refused env var, for a test fixture server
 * that does not redirect anywhere hostile.
 */
function allowlistedPolicyFor(url: string): { readonly allowLoopback: true } | undefined {
  const allowed = allowedTestOrigins();
  if (allowed.size === 0) return undefined;
  let origin: string;
  try {
    origin = new URL(url).origin;
  } catch {
    return undefined; // A malformed URL is guardedFetch's own refusal to make.
  }
  return allowed.has(origin) ? { allowLoopback: true } : undefined;
}

/**
 * `SAFE_NET_ALLOW_TARGETS` — T109's one, narrow escape hatch.
 *
 * Not the `allowLoopback` policy field above, and does not touch it: that
 * field stays exactly what `policy.ts` says it is, unreachable from outside
 * this package. This is a second, separate mechanism — an *exact origin*
 * allowlist, checked before the guard runs at all, for the one case
 * `policy.ts` was never meant to cover: a real end-to-end test (T109) that
 * drives the actual booted API process against a real fixture server, where
 * there is no in-process seam to inject a fake `validateTarget` through
 * (that DI seam is `apps/api/src/routes/targets.routes.ts`'s own
 * `TargetRoutesDeps`, and `startApi()` never wires it — see that test's own
 * header for why).
 *
 * Exact-origin match only, comma-separated, mirroring
 * `ALLOW_INSECURE_DEV_SECRETS`'s shape in `apps/api/src/config/env.ts`: an
 * affirmatively-named opt-in, not an ambient inference from `NODE_ENV`, and
 * a hard refusal — not a silent no-op — if it is ever set alongside
 * `NODE_ENV=production`. A path or query string does not have to match; an
 * origin is a coarse enough boundary that a fixture server's exact
 * behaviour is still whatever it wants to serve, without also encoding a
 * page path into a security-relevant environment variable.
 */
function allowedTestOrigins(): ReadonlySet<string> {
  const raw = process.env['SAFE_NET_ALLOW_TARGETS'];
  if (raw === undefined || raw.trim() === '') return new Set();
  if (process.env['NODE_ENV'] === 'production') {
    throw new Error(
      'SAFE_NET_ALLOW_TARGETS is set with NODE_ENV=production. This variable exists only for ' +
        'local and CI end-to-end tests that must audit a loopback fixture server; refusing to ' +
        'start rather than silently opening an SSRF hole in a deployed environment.',
    );
  }
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== ''),
  );
}

/**
 * Canonicalise a submitted target and refuse it if it is not publicly
 * addressable. Form and resolution only — nothing is contacted.
 *
 * For intake (`POST /targets`), where a 422 is owed on refusal and no request
 * should be made to a URL a caller merely named. The result is not a licence to
 * skip `safeFetch` later: DNS can change, and only a connect-time check catches
 * that.
 *
 * @throws SsrfRefusedError with the layer and class that refused.
 */
export async function assertPublicTarget(
  url: string,
): Promise<{ origin: string; href: string; hostname: string }> {
  // `async` rather than a plain function delegating a promise: it is what
  // keeps every throw here — the production guard above, a malformed URL
  // reaching `new URL()` — a rejection rather than a synchronous throw, the
  // same contract the rest of this function already had before this
  // allowlist existed.
  const allowed = allowedTestOrigins();
  if (allowed.size > 0) {
    const parsed = new URL(url);
    if (allowed.has(parsed.origin)) {
      return { origin: parsed.origin, href: parsed.href, hostname: parsed.hostname };
    }
  }
  return guardedTargetCheck(url);
}
