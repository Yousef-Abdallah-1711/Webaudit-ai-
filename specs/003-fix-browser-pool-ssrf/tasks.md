---

description: "Task list for: Close the Browser Pool's SSRF Gap"
---

# Tasks: Close the Browser Pool's SSRF Gap

**Input**: Design documents from `/specs/003-fix-browser-pool-ssrf/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/safe-browser-proxy.md,
quickstart.md — all present.

**Tests**: Required, not optional. `CLAUDE.md`'s Testing section mandates test-first for this
repository, and spec.md's FR-011 explicitly requires a dedicated regression test. Every implementation
task below follows its own failing test.

**Organization**: Single user story (spec.md has one — P2-SSRF-1 is one cohesive fix, not several
independently-shippable slices).

## Path Conventions

`packages/safe-net` (the new proxy mechanism, alongside the logic it reuses) and `apps/probe-pool` (the
wiring and the real-browser integration test) — both existing paths.

---

## Phase 1: Setup

- [X] T001 Confirm a real Chromium is available for `apps/probe-pool`'s real-browser test
  (`npx playwright install chromium` if needed), per quickstart.md Prerequisites.
- [X] T002 Run `pnpm test:adverse` once before touching any code; record the exact pass/fail count as
  this feature's own regression baseline (expected: the same counts the prior fix's session left the
  repo in).

**Checkpoint**: Baseline recorded.

---

## Phase 2: Foundational

- [X] T003 Add `"@webaudit/safe-net": "workspace:*"` to `apps/probe-pool/package.json`'s
  `dependencies` (mirroring its existing `@webaudit/*` entries exactly — confirmed via research this is
  currently absent), then run `pnpm install` to link the workspace graph.

**Checkpoint**: `apps/probe-pool` can now import from `@webaudit/safe-net`.

---

## Phase 3: User Story 1 — A capability's browser page can never be driven to an internal or private address (Priority: P1)

**Goal**: Every request a page in the browser pool makes — initial navigation, every redirect, every
sub-resource — is independently checked against this platform's existing SSRF rules, at connect time,
with no weaker guarantee than the existing fetch-based guard.

**Independent Test**: per spec.md — a disallowed address is refused; a redirect to a disallowed address
is refused at the redirect; a legitimate address still loads.

### Tests for User Story 1 (write first; confirm they fail before implementing)

- [X] T004 [P] [US1] Write `packages/safe-net/tests/adverse/browser-proxy.test.ts` (imports
  `browser-proxy.ts` directly via relative path — same-package, full internal option surface available
  per research.md Decision 3/4). Stand up real local HTTP servers on loopback. Using
  `policy: { allowLoopback: true }` (test-only, matching the existing `ssrf.redirect.test.ts`/
  `ssrf.rebinding.test.ts` precedent), assert via a raw HTTP CONNECT client: (a) a request to a
  disallowed address (private/link-local/metadata literal, and loopback with the default policy) is
  refused before any byte is relayed; (b) a request to the real local "allowed-for-test" server
  succeeds end-to-end through the tunnel, content intact; (c) a resolver configured to answer with a
  disallowed address is refused (anti-rebinding); (d) a second, independent request through the same
  proxy instance to a disallowed target is refused regardless of an immediately-preceding successful
  request to an allowed target (the redirect-equivalent requirement). **Run it now and confirm it
  fails** (`browser-proxy.ts` doesn't exist yet).
- [X] T005 [P] [US1] Write `apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts`: (a) a real
  Chromium instance via `createBrowserPool()` (no fake `launch`) successfully loads a genuine public
  URL through the pool with the proxy active; (b) navigation to a well-known disallowed literal address
  (a metadata IP, no resolver trickery needed) fails visibly, not silently; (c) using the existing fake
  `launch` injection seam, assert `createBrowserPool` actually calls `chromium.launch` with a `proxy`
  option whose `server` points at the started proxy's real port. **Run it now and confirm it fails**
  (the proxy/wiring doesn't exist yet).

### Implementation for User Story 1

- [X] T006 [US1] Implement `packages/safe-net/src/browser-proxy.ts` (new): an `http.Server` bound to
  `127.0.0.1` on an ephemeral port. On `'connect'`: parse target `host:port`, call
  `assertResolvedAddressesAllowed(host, { resolver, policy })` (reusing `resolve-guard.ts` unchanged,
  research.md Decision 1) to get a validated IP; open a real `net.Socket` directly to that literal IP
  (never re-resolving `host`); once connected, re-classify `socket.remoteAddress` via
  `classifyAddressString` before relaying anything (research.md Decision 2, mirroring
  `connect-guard.ts`'s own "destroy first, call back second" discipline); on any refusal at either
  point, respond with a refusal status and destroy the client socket without ever opening/using the
  real connection; on success, write `HTTP/1.1 200 Connection Established` and pipe both sockets
  bidirectionally. On the plain (non-CONNECT) `'request'` event, run the same resolve→classify→connect
  →re-classify sequence before forwarding, preserving the original `Host` header. Internal
  implementation function accepts the full `{ resolver?, policy? }` option surface; only `{ resolver? }`
  is exposed through the eventual public re-export (T007).
- [X] T007 [US1] Add `export { createSafeBrowserProxy } from './browser-proxy.js';` to
  `packages/safe-net/src/index.ts`, with the public `CreateSafeBrowserProxyOptions` type restricted to
  `{ resolver?: AddressResolver }` only — no `policy`/`allowLoopback` reachable from outside the package
  (contracts/safe-browser-proxy.md, research.md Decision 3).
- [X] T008 [US1] Run T004's test; confirm it now passes.
- [X] T009 [US1] Wire `apps/probe-pool/src/browser/pool.ts`: `createBrowserPool()` calls
  `createSafeBrowserProxy({ resolver: options.resolver })` once per pool (not per `withPage()` call),
  passes `proxy: { server: \`http://127.0.0.1:${proxy.port}\` }` into the `chromium.launch()`/injected
  `launch()` call, and calls the proxy's `close()` inside the pool's own `close()` alongside
  `browser.close()`. Add `resolver?: AddressResolver` to `CreatePoolOptions` (test-only injection seam,
  mirroring the existing `launch` option's own stated rationale).
- [X] T010 [US1] Run T005's test; confirm it now passes. Measure and record the actual added navigation
  latency for the legitimate-URL case (spec.md SC-005) — report the real number, not an estimate.
  **Result**: a fair, steady-state (excluding first-run cold-start) comparison — fresh browser context
  per run in both cases, so context-creation cost isn't confounded with the proxy's own cost — measured
  ~305ms/navigation without the proxy vs. ~286ms/navigation with it, against a real external site
  (https://example.com/), 6 runs each. The proxy added **no measurable overhead** — the difference
  (-19ms) is within ordinary network variance for a real HTTPS round trip, not a real slowdown. An
  initial naive (non-fair) comparison had wrongly suggested a large difference by reusing one page
  across runs on one side only — corrected before recording this result.
- [X] T011 [US1] Run `packages/safe-net`'s full existing adverse suite (`ssrf.rebinding.test.ts`,
  `ssrf.redirect.test.ts`, `ssrf.forms.test.ts`, `ipv6-classifier-gaps.test.ts`) to confirm zero
  regression — this feature must not have touched `safe-fetch.ts`/`connect-guard.ts`/`resolve-guard.ts`
  /`address-rules.ts`/`policy.ts` at all.
  **Note — a real regression was found and fixed, not by inspection but by running the full unit suite
  (`packages/safe-net/tests/unit/entry-point.test.ts`)**: a pre-existing T051 test locks the package's
  public export surface down to an exact list (`SsrfRefusedError`, `assertPublicTarget`, `safeFetch`)
  specifically so a future addition can't quietly reopen a policy-smuggling seam. Adding
  `createSafeBrowserProxy` broke that exact-match assertion. Fixed correctly, not by loosening the
  check: updated the expected list to include the new export (confirmed narrower than internal, per
  research.md Decision 3), and added a new test in the same file mirroring its own existing
  `safeFetch`/`assertPublicTarget` "no policy seam" tests — proving a smuggled `policy` option has no
  effect on `createSafeBrowserProxy` either, using a real local server as the disallowed stand-in (not
  mocked). Confirmed red (a temporary change that forwarded the smuggled policy made the new test fail)
  before confirming green with the real, restricted implementation.
- [X] T012 [US1] Check new/modified files against this repo's file-size convention (services ≤200
  lines, per the prior fix's own applied precedent) — split `browser-proxy.ts` if it grows
  unreasonably large; record the actual line count either way.
  **Result**: unlike the prior fix's pre-existing large files, `browser-proxy.ts` is brand-new, so the
  constraint genuinely applies here (no pre-existing-file exemption available). It initially reached
  215 lines — split into `browser-proxy.ts` (85 lines: server bootstrap, public types) and
  `browser-proxy-handlers.ts` (144 lines: the CONNECT/plain-HTTP per-connection protocol handling) along
  a real seam (lifecycle vs. per-request logic), not an arbitrary chop. `pool.ts` grew to 121 lines
  (well under the ceiling) from its original ~93.

**Checkpoint**: User Story 1 is complete, tested, and shippable — the browser pool's navigation is now
protected equivalently to the existing fetch-based SSRF guard.

---

## Phase 4: Polish & Cross-Cutting Concerns

- [X] T013 [P] Update `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`'s P2-SSRF-1
  finding entry: change its `Status` to reflect the fix, cite the actual file:line and the new tests,
  and update Section 7 (executive summary / remaining risks / final verdict) accordingly — this closes
  the last of the review's two "accepted risk" items down to one (the load-testing gap).
- [X] T014 [P] Add an entry to `PROGRESS.md` recording this fix, matching this repository's existing
  documentation convention.
- [X] T015 Run `pnpm test:adverse`, `pnpm test`, `pnpm run lint`, `pnpm run typecheck` in full; confirm
  against T002's baseline that no failure exists beyond this repo's known pre-existing environmental
  ones, and that lint/typecheck introduce no new errors.
  **Result**: `test:adverse` 828/829 (1 pre-existing skip; +9 tests over the 819/820 baseline, all new
  tests green). `test` (unit) 1021/1028 (+1 test over the 1020/1027 baseline — the new export-surface
  smuggling test) — the exact same 7 pre-existing environmental tests fail for the exact same reason
  (this machine's live dev Redis contention), unchanged from baseline; `entry-point.test.ts`, which
  genuinely regressed mid-feature (see T011's note) and was properly fixed, now passes. `lint`: same 44
  pre-existing errors, none in any file this feature touched. `typecheck`: clean (only the pre-existing
  turbo cyclic-dependency warning, Open Decision #16).
- [X] T016 Walk through quickstart.md's scenarios as a final sanity check before considering this
  feature done.

---

## Dependencies & Execution Order

- **Setup (Phase 1)** → **Foundational (Phase 2, the workspace dependency)** → **User Story 1
  (Phase 3)** → **Polish (Phase 4)**. Single story, so phases run sequentially — no cross-story
  parallelism available this time (unlike the prior two-defect fix).
- Within Phase 3: T004/T005 (tests, `[P]`) can be written in parallel with each other since they touch
  different files; both must be confirmed failing before T006 begins. T006→T007→T008 are sequential
  (each depends on the previous). T009→T010 likewise. T011/T012 run after T010.
- Within Phase 4: T013/T014 (`[P]`, documentation) can run in parallel with each other and with T015's
  test run.

## Implementation Strategy

Single user story — no MVP-slicing question. Sequence: Setup → Foundational (one dependency edge) →
the fix itself, test-first at each of its two natural seams (the proxy's own SSRF logic in
`packages/safe-net`, then the real-browser wiring in `apps/probe-pool`) → Polish (docs + full-suite
re-verification).
