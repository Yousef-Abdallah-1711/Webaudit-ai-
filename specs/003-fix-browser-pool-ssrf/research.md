# Phase 0 Research: Close the Browser Pool's SSRF Gap

Grounded in a direct read of `packages/safe-net`'s actual internals (`address-rules.ts`,
`resolve-guard.ts`, `connect-guard.ts`, `policy.ts`, `errors.ts`, `index.ts`) and
`apps/probe-pool`'s current state, not assumed from the plan's prose alone.

## Decision 1 — Reuse `classifyAddressString` and `assertResolvedAddressesAllowed` directly; no forked classification logic

**Decision**: The proxy's CONNECT handler calls `assertResolvedAddressesAllowed(hostname, { resolver,
policy })` (from `resolve-guard.ts`) to get back an already-validated `ResolvedAddress[]` list, then
connects directly to one of those literal addresses — never re-resolving the hostname a second time.

**Rationale**: `assertResolvedAddressesAllowed` already does exactly the work needed (resolve, classify
every answer via the single shared `classifyAddressString`, throw `SsrfRefusedError` on the first
disallowed one, return the validated list otherwise) — reusing it directly satisfies spec.md FR-005
("reuse existing rules, don't duplicate") by construction, not by discipline alone.

**Alternatives considered**: Re-implementing address classification inline in the proxy — rejected
outright; this is precisely the duplication FR-005 forbids.

## Decision 2 — Belt-and-suspenders: re-validate the actual socket peer after connecting, not just the pre-connect resolution

**Decision**: After opening a real `net.Socket` to the validated IP from Decision 1, the proxy reads
`socket.remoteAddress` once connected and re-runs it through `classifyAddressString` before relaying any
bytes — destroying the socket first on a mismatch, exactly as `connect-guard.ts`'s own connector does
for the fetch path (its own comment: "Destroy first, call back second: the request must not be written
to a socket we have already decided against").

**Rationale**: `connect-guard.ts` does not trust "we resolved a name and it looked fine" alone — it
re-checks what the socket actually reached. Mirroring that same defense-in-depth for the browser proxy,
rather than only doing the pre-connect check, keeps this feature's guarantee equivalent to the existing
fetch guard's, not merely similarly-named. In practice, since this proxy connects directly to the
already-validated literal IP (not a hostname the OS could re-resolve differently), this second check
should never actually fire in normal operation — it exists as the same kind of belt-and-suspenders
`connect-guard.ts` itself is, not because a distinct attack is expected here.

**Alternatives considered**: Skipping the post-connect re-check since we "already validated the IP
before connecting" — rejected; it would make this proxy's guarantee weaker than the existing fetch
guard's for no real savings, and the existing codebase's own stated principle ("a URL check that knows
about `::ffff:169.254.169.254` and a connect check that does not is not a guard, it is a race") argues
for keeping both checks even when one seems individually sufficient.

## Decision 3 — Public API surface: expose `resolver` for test injection, never `policy`/`allowLoopback`

**This is a real design tension found only by reading the actual export discipline, not assumed.**
`packages/safe-net`'s `package.json` restricts external consumers to a single `"."` export
(`index.ts`) — there is no subpath-import escape hatch. `connect-guard.ts` and `resolve-guard.ts` are
therefore *not* part of the public surface today; only `safeFetch`/`assertPublicTarget` are. Both
`policy.ts` and `index.ts` are explicit that `allowLoopback` exists **only** for this package's own
adverse tests and must never be reachable from outside the package.

`createSafeBrowserProxy` is different from `connect-guard.ts`/`resolve-guard.ts` in one important way:
it **must** be reachable from `apps/probe-pool` (a different package) to be usable at all, since
`pool.ts` is what actually wires it into `chromium.launch()`. That forces it into the public `"."`
export — unlike the internal-only connect/resolve guards.

**Decision**: `createSafeBrowserProxy`'s public signature accepts `{ resolver?: AddressResolver }`
only. It does **not** accept `policy`/`allowLoopback` at all in its public type — internally it always
runs with `DEFAULT_POLICY` (`allowLoopback: false`). Exposing `resolver` is safe to expose publicly:
supplying a resolver only changes what a *hostname* answers to for DNS purposes; the classifier still
enforces policy on whatever address comes back, so a caller cannot use it to make a disallowed address
allowed — it can only choose which hostname maps to which (still-checked) address. This is meaningfully
different from exposing `policy`, which would let a caller directly declare an address class allowed.

**Consequence for testing** (see Decision 4): since the public export cannot accept `allowLoopback`,
any test that needs a real loopback test server to stand in for an "allowed" target — which the
"legitimate load succeeds" and "redirect between two real servers" scenarios both need — cannot be
written against the public export from a different package. `packages/safe-net`'s own test suite can
still exercise the full internal option surface (including `policy: { allowLoopback: true }`) by
importing `browser-proxy.ts` directly via a relative path from within the same package, exactly the way
`ssrf.redirect.test.ts`/`ssrf.rebinding.test.ts` already do for `connect-guard.ts`/`resolve-guard.ts`
today.

**Alternatives considered**:
- *Expose `policy` publicly too*: rejected — directly contradicts this package's own stated, existing
  discipline ("index.ts never exposes a way to set it from outside packages/safe-net") for the sake of
  one feature's test convenience.
- *Add a subpath export just for tests*: rejected — changing `package.json`'s `exports` map to add an
  escape hatch is a bigger, more permanent architectural change than this fix calls for, and would
  itself need the same scrutiny as exposing `policy` directly.

## Decision 4 — Test strategy: full SSRF-logic coverage inside `packages/safe-net` (real loopback servers, no browser needed); a real-Chromium integration test in `apps/probe-pool` scoped to what doesn't need loopback

**Decision**: Split the required coverage (spec.md FR-011) across two files, each testing what it can
honestly test given Decision 3's boundary:

1. **`packages/safe-net/tests/adverse/browser-proxy.test.ts`** (new) — imports `browser-proxy.ts`
   directly (same-package relative import, full internal option surface available). Uses real local
   HTTP servers on loopback (`policy: { allowLoopback: true }`, matching the existing
   `ssrf.redirect.test.ts`/`ssrf.rebinding.test.ts` precedent exactly) and a raw HTTP CONNECT client
   (simulating what Chromium's own network stack does when given a proxy — no browser needed to prove
   the proxy's own logic) to prove: a disallowed address (private/link-local/metadata, and loopback
   without the test-only allowance) is refused before any byte is relayed; a legitimate loopback test
   server's response is actually delivered end-to-end through the tunnel; a resolver returning a
   disallowed address is refused (anti-rebinding); and — the "redirect" requirement — that a second,
   independent request through the same proxy instance to a disallowed target is refused regardless of
   whether an earlier request to an allowed target just succeeded (the proxy has no per-connection
   "trust" state to leak across requests; this is what "redirect re-validated, not just the first hop"
   actually reduces to at the proxy layer, since every redirect a browser follows is a brand-new,
   independent request through the same proxy — there is no shared trust to exploit even in principle).
2. **`apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts`** (new) — a real Chromium instance via
   `createBrowserPool` (no fake `launch`), proving the actual wiring works end-to-end: a genuine public
   URL still loads successfully with the proxy active (spec.md FR-007/SC-003 — no regression in the one
   real consumer pattern), and navigation to a disallowed literal address (a well-known metadata IP,
   which needs no DNS/resolver trickery since literal IPs are classified directly) fails visibly rather
   than silently. A third, narrower test uses the existing fake-`launch` injection seam
   (`CreatePoolOptions.launch`) purely to assert that `createBrowserPool` actually passes a `proxy`
   option pointing at the started proxy's real port into `chromium.launch()` — the wiring itself,
   independent of real network behavior.

**Rationale**: This is not a compromise on rigor — it places each test where it can be both genuine
(real sockets, real servers, real Chromium where relevant) and honest about what it's proving, rather
than forcing every scenario into one file at the cost of either fabricating network conditions or
quietly weakening the package's own public-API discipline to make a test convenient.

**Alternatives considered**: One combined real-Chromium test file covering everything, requiring
`policy` to be exposed publicly (rejected in Decision 3) or requiring `apps/probe-pool` to depend on a
new safe-net subpath export (rejected above) just to reach `allowLoopback` for its own local test
servers.

## Decision 5 — Measure actual proxy-added latency (spec.md SC-005), don't assume it's negligible

**Decision**: The real-Chromium test in `apps/probe-pool` records wall-clock navigation time for the
legitimate-URL scenario and reports it in the test output/tasks.md, rather than omitting a number.
Expectation, stated as a hypothesis to be confirmed rather than assumed: one additional loopback hop
(client → local proxy → real destination) plus a DNS lookup the connection needed regardless, so on the
order of low tens of milliseconds — but the actual measured number is what goes in tasks.md's result,
not this estimate.

## Decision 6 — No new runtime dependency

`node:http`'s `connect` server event and `node:net`'s `Socket` are sufficient for CONNECT tunneling;
`node:http`'s normal `request` event covers the rare plain-HTTP (non-TLS) target case. Playwright's
`proxy: { server: string }` launch option is already present in the installed `playwright-core@1.62.1`
types. `apps/probe-pool` gains exactly one new workspace dependency edge
(`"@webaudit/safe-net": "workspace:*"`, mirroring its existing `@webaudit/*` dependency style) — no new
external package for either app.
