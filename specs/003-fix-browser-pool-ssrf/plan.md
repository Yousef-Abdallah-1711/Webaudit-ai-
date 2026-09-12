# Implementation Plan: Close the Browser Pool's SSRF Gap

**Branch**: `003-fix-browser-pool-ssrf` | **Date**: 2026-09-11 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-fix-browser-pool-ssrf/spec.md`

## Summary

`apps/probe-pool`'s browser pool (`pool.ts`) navigates a real Chromium page to a target-controlled URL
with zero SSRF protection — the one confirmed gap the full-workflow review found (P2-SSRF-1), currently
inert only because nothing wires a live page provider into the orchestrator yet. Every other outbound
path in this codebase (`packages/safe-net`'s `safeFetch`) enforces four layers: URL-form validation,
DNS-resolution-based address checking, connect-time re-validation (anti-DNS-rebinding), and per-hop
redirect re-validation — achieved via a custom `undici` dispatcher/connector that intercepts the actual
socket connect. Chromium manages its own network stack, so that exact mechanism doesn't transplant
directly.

The fix: a minimal local SSRF-safe forward proxy (`packages/safe-net/src/browser-proxy.ts`, new),
reusing this package's existing address-classification (`address-rules.ts`) and DNS-resolution
(`resolve-guard.ts`) logic unchanged. Chromium is launched with `proxy: { server: 'http://127.0.0.1:
<port>' }` (a real, documented Playwright option), so every request it makes — the initial navigation,
every redirect, every sub-resource fetch — becomes a discrete request through this proxy's `CONNECT`/
plain-HTTP handling, each independently resolved and validated at the moment a real socket is about to
open, connecting to the validated IP directly rather than re-resolving the hostname (closing the same
DNS-rebinding TOCTOU window `connect-guard.ts` already closes for `fetch`). One mechanism achieves all
four layers by construction — no separate redirect-following logic is needed, unlike the fetch guard,
because the browser itself issues each hop as an independent request through the same proxy.

## Technical Context

**Language/Version**: TypeScript 5.6 on Node.js 22 (existing monorepo toolchain — Node's built-in
`http`/`net`/`dns` modules are sufficient; no new runtime dependency).

**Primary Dependencies**: `@playwright/test` (already a dependency of `apps/probe-pool`, confirmed
`chromium.launch()` accepts a `proxy: { server: string }` option in the installed
`playwright-core@1.62.1` type definitions). `@webaudit/safe-net` (workspace package — confirmed to be
added as a new dependency of `apps/probe-pool`, which does not currently depend on it; see research.md
for the exact current dependency graph). No new third-party package for the proxy itself — a plain
`node:http` server handling the `connect` event is sufficient for CONNECT tunneling.

**Storage**: None. This feature is entirely in-memory, per-process (one proxy per browser pool
instance, matching the existing "one browser, short-lived contexts" design already in `pool.ts`).

**Testing**: Vitest, `--project adverse` for the new SSRF-focused regression test (this is exactly the
class of hostile-input test this repo's `adverse` project is for). Requires a real Chromium instance
(same as any existing Playwright-based test in this monorepo) plus two real local Node HTTP servers
acting as "allowed" and "disallowed"/redirect targets — not mocked at the Playwright level, per spec.md
FR-011's explicit requirement that the legitimate-load and redirect scenarios be genuine.

**Target Platform**: `apps/probe-pool` (its own deployable unit per the five-unit architecture) — this
feature changes only that app plus a new file in the already-shared `packages/safe-net`.

**Performance Goals**: Not a performance feature, but spec.md SC-005 requires the added latency be
measured, not assumed. Expect it to be small (one extra loopback hop plus a DNS lookup the connection
needed regardless), verified in Phase 1/tasks with an actual before/after timing comparison against a
local test server.

**Constraints**: The proxy MUST bind to `127.0.0.1` only (never externally reachable). MUST reuse
`address-rules.ts`/`resolve-guard.ts` unchanged — no forked or duplicated classification logic (spec.md
FR-005, this plan's own Constitution Check below). MUST NOT modify `safe-fetch.ts`/`connect-guard.ts`
(spec.md Assumptions). MUST fail closed: any error in the proxy's own address-checking path refuses the
connection rather than allowing it through (spec.md FR-008).

**Scale/Scope**: One new file (`packages/safe-net/src/browser-proxy.ts`), a small wiring change to
`apps/probe-pool/src/browser/pool.ts`, one new workspace dependency edge
(`apps/probe-pool` → `@webaudit/safe-net`), and one new adverse test file. No schema change, no new
public API beyond `ctx.withPage()`'s existing contract (unchanged, per spec.md Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Constraint | Applies? | Assessment |
|---|---|---|
| I–IV, VII (skills/vendoring/deterministic-before-AI/AI-failure/verify-narrowly) | No | Unrelated — this is a network-egress boundary fix, not a capability/AI-layer change. |
| V. Untrusted Code Runs Isolated | No (adjacent, not the same boundary) | This is about *outbound network* isolation for a real browser, not the code-execution sandbox (`sandbox-runner`). Not the same boundary, no overlap. |
| VI. Every Operation Carries a Metered, Reconciled Cost | No | No credit/cost dimension to a browser-pool navigation. |
| **"Security requirements": "Scan input is hostile input. User-supplied URLs MUST be validated against SSRF: private, loopback, link-local, and cloud metadata addresses MUST be refused, on the initial request and on every redirect."** | **Yes — this is the exact constitutional requirement this feature closes for the browser-navigation path.** | This is not currently met for browser navigation (the finding this feature fixes). The proxy mechanism satisfies "on the initial request and on every redirect" by construction — every redirect is an independent request through the same proxy. Gate: the fix must not weaken this same guarantee for the *existing* fetch path — enforced by not touching `safe-fetch.ts`/`connect-guard.ts` at all. |
| CLAUDE.md non-negotiable: "SSRF validation happens at connect time, not resolve time... Redirects are followed manually so every hop is re-validated." | **Yes** | The "connect time, not resolve time" half is satisfied by resolving once and connecting to that literal validated IP inside the proxy's own `CONNECT` handler (never a second, separate resolution at actual connect time — see research.md for why a single resolution used immediately, not re-resolved, is the correct anti-rebinding shape here, distinct from but equivalent to `connect-guard.ts`'s approach). The "redirects re-validated" half doesn't need manual following at all for the browser case — Chromium re-requests through the same proxy on every redirect, so this is satisfied structurally rather than by replicated logic. |

**Result: PASS.** No violation requires a Complexity Tracking justification. The one new piece of
infrastructure (a local forward proxy) is the smallest mechanism that achieves genuine connect-time
protection for a full browser — the alternative (checking only the literal URL string before
`page.goto()`) was rejected in spec.md's own problem statement as insufficient against redirects and
DNS rebinding, not merely simpler-but-adequate.

## Project Structure

### Documentation (this feature)

```text
specs/003-fix-browser-pool-ssrf/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/            # Phase 1 output
│   └── safe-browser-proxy.md
└── tasks.md              # Phase 2 output (/speckit-tasks command — not created here)
```

### Source Code (repository root)

```text
packages/safe-net/
├── src/
│   ├── address-rules.ts       # UNCHANGED — reused, not duplicated
│   ├── resolve-guard.ts       # UNCHANGED — reused, not duplicated
│   ├── connect-guard.ts       # UNCHANGED — this feature does not touch the fetch guard
│   ├── browser-proxy.ts       # NEW — the local SSRF-safe forward proxy
│   └── index.ts               # MODIFIED — exports `createSafeBrowserProxy`
└── tests/
    └── adverse/
        └── (existing ssrf.*.test.ts files unchanged; new coverage lives in probe-pool, since that's
           where the browser-specific behavior — redirects, sub-resources, real navigation — actually
           lives)

apps/probe-pool/
├── package.json                # MODIFIED — new dependency on @webaudit/safe-net
├── src/
│   └── browser/
│       └── pool.ts             # MODIFIED — starts/stops the proxy, passes `proxy` to chromium.launch()
└── tests/
    └── adverse/
        └── browser-pool-ssrf.test.ts   # NEW — the dedicated regression test (spec.md FR-011)
```

**Structure Decision**: The proxy mechanism lives in `packages/safe-net` (alongside the classification/
resolution logic it reuses — the same package, not a new one), while the wiring and the
browser-specific regression test live in `apps/probe-pool` (the app that actually owns Chromium
lifecycle). This mirrors the existing split: `safe-net` owns "what counts as an allowed address,"
`probe-pool` owns "how a real browser is driven."

## Post-Design Constitution Re-Check

*Re-evaluated after Phase 0 (research.md) and Phase 1 (data-model.md, contracts/, quickstart.md).*

Phase 0 surfaced one real design tension worth re-checking against the gate above: `createSafeBrowserProxy`
must be reachable from a different package (`apps/probe-pool`) to be usable at all, which forces it into
`packages/safe-net`'s single public `"."` export — unlike `connect-guard.ts`/`resolve-guard.ts`, which
stay internal today. Research.md Decision 3 resolves this by exposing only `resolver` (safe — it cannot
make a disallowed address allowed, only change which hostname maps to which still-checked address)
and never `policy`/`allowLoopback` from the public surface, preserving `policy.ts`'s and `index.ts`'s
existing stated discipline exactly rather than carving a new exception into it for this feature's
convenience.

- **Re-check against "Scan input is hostile input... SSRF... on the initial request and on every
  redirect"**: still holds, and is now genuinely satisfied for the browser path for the first time —
  every redirect is an independent request through the same proxy, each independently
  resolved/classified/connect-checked.
- **Re-check against "connect time, not resolve time" / "redirects re-validated"**: holds by
  construction — the proxy connects to the address it itself resolved and validated (never re-resolving
  a hostname a second time, closing the same TOCTOU window `connect-guard.ts` closes for `fetch`), plus
  a post-connect re-check of the actual socket peer (Decision 2), matching the existing fetch guard's
  own belt-and-suspenders shape rather than a weaker approximation of it.
- **Re-check against "no forked classification logic"**: holds — `classifyAddressString`,
  `assertResolvedAddressesAllowed`, and `AddressPolicy`/`DEFAULT_POLICY` are imported and reused
  unchanged; nothing in `address-rules.ts`/`resolve-guard.ts`/`policy.ts` is modified by this feature.

**Result: PASS, unchanged.** The public-API scoping decision (resolver yes, policy no) is a
*narrower*, more conservative surface than the plan originally left open-ended, not a scope or
guarantee change — it keeps this feature from being the first place this package's own
never-weaken-the-policy-externally discipline gets an exception.

## Complexity Tracking

*No entries — Constitution Check passed with no violations requiring justification, both before and
after design.*
