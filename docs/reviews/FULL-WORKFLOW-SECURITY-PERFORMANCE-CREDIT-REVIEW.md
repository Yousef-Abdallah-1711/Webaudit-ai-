# WebAudit AI — Full Workflow, Security, Performance & Credit/Cost Review

**Status:** COMPLETE for the scope actually covered — see Section 7.4 for the final verdict
(**PRODUCTION READY WITH ACCEPTED RISKS** — all P0/P2 findings fixed, load-testing now measured at
1/5/10 concurrent audits, unverified above 10 for a real, evidence-backed reason — see Section 7.2
item 5 and `load-testing/REPORT.md`).

**Review started and completed:** 2026-09-10 · **Reviewer:** Claude (agent), working directly in this
repository, with nine dedicated research passes and real test-suite execution (not a read-only
paper review).

---

## 1. Scope

Full production-grade audit of the WebAudit AI application's complete workflow, per the 42-section
review brief: end-to-end scan workflow, credit quote→debit→execution→reconciliation, scan/job/worker
lifecycle, security boundaries (SSRF, sandbox, auth, injection), AI invocation/fallback, realtime
correctness, issue/fix/re-verification, readiness/regression, failure/retry/cancellation, data
integrity, observability, and test coverage.

This review builds on **250/250 tasks complete, 11/11 adversarial gates green** (per PROGRESS.md,
last full pass 2026-09-09/T253). It does not re-litigate settled history; it re-verifies current code
against every stated guarantee, with fresh evidence, and treats prior "resolved" notes as claims to
check, not facts to inherit.

**Environment used for verification:** local `docker compose` Postgres (port 5442) + Redis (port
6389), already running. `AI_MODE=fixtures` (no live provider spend — per repo convention, providers
are never called with real spend in tests). No k6 or load-testing harness existed anywhere in this
repo at the time this paragraph was written (confirmed by search) — Section 7 (Performance/Load) was
marked `UNVERIFIED`/`BLOCKED` for the live-traffic portions rather than fabricated. **Superseded,
2026-09-11**: a real harness now exists (`load-testing/`, `specs/004-load-testing-harness/`) — see
Section 7.2 item 5 and `load-testing/REPORT.md` for the real measurements that replaced this gap.

---

## 2. Architecture Map (verified against real code)

Five deployable units under `apps/`: `web` (Next.js App Router), `api` (Express), `worker`
(BullMQ consumer + orchestrator), `probe-pool` (browser automation library — **not yet a deployable
unit**, no entrypoint/start script, per PROGRESS.md's own honest accounting), `sandbox-runner`
(child-process isolation for untrusted capability code).

Shared packages: `types`, `config`, `capability-sdk`, `ai-executor`, `redaction`, `safe-net`,
`safe-archive`, `scoring`, `capabilities-vendored`.

```
Browser → apps/web → apps/api (routes) → auth/authz → control-gate/target validation
  → quote → credit preflight → debit → Scan row created → BullMQ enqueue (apps/api producer)
  → apps/worker consumes job → orchestrator → phase execution → capability registry
  → code layer (0 tokens) → optional AI layer (packages/ai-executor, redacted via packages/redaction)
  → persistence (Postgres) → progress published (Redis, after persistence) → apps/web realtime
  → report synthesis → Issue rows → targeted re-verification → readiness pass → verdict
```

Verified so far:
- Local dev infra is docker-compose Postgres/Redis only; no k6 present (`find . -iname "*k6*"` empty).
- `apps/api` and `apps/worker` are separate processes; `apps/api` cannot import `apps/worker` (per
  PROGRESS.md, confirmed by the questionnaire-route duplication it describes — to be independently
  re-checked, not yet done in this pass).

*(Architecture map will be filled in further as each subsystem is traced below.)*

---

## 3. Pre-existing in-flight work found at review start

Before any new investigation, `git status` showed uncommitted work already in progress on exactly the
Auth/SQL-injection sections of this review brief:

- `apps/api/src/app.ts` — a body-parser error handler (`bodyParserErrorHandler`) that intercepts
  `express.json()`'s synchronous `next(err)` for malformed/oversized bodies and answers 400/413
  instead of falling through to the generic 500 catch-all.
- `apps/api/src/services/auth/oauth.service.ts` — a fix for **account pre-hijacking** (the
  "classic-federation merge" attack): an attacker registers a victim's email with a password of their
  choosing before the victim ever signs in; when the victim later joins via verified OAuth (FR-004),
  the fix now clears the attacker's password and revokes existing sessions on that row if it was never
  verified, rather than silently leaving the attacker's password valid once the row later gets
  verified.
- Four new adverse test files: `auth-input-validation.test.ts`, `auth-rate-limiting.test.ts`,
  `auth-sql-injection.test.ts`, `oauth-account-prehijack.test.ts`.

This work is being verified (not re-done) as part of this review — see Finding P1-AUTH-1 below.

---

## 4. Environmental factors found during verification (INFO — not application defects)

Four distinct environmental issues surfaced while running real test suites against a shared local dev
Postgres/Redis, on a machine that also runs a live dev instance of the application. None are code
defects; all are recorded because the brief requires reproducing before diagnosing, and raw test output
during any of these windows could otherwise be mistaken for a real security or correctness bug.

### 4.1 Stale idle-in-transaction Postgres connection (found before the first adverse run)

**A stale Postgres connection (backend pid 20980) had been idle-in-transaction for ~4h46m**, holding a
row lock on `Capability` from a prior interrupted test run, before this review's first
`pnpm test:adverse` run. This caused cascading, misleading failures unrelated to application code:
Postgres deadlocks inside `auth-sql-injection.test.ts`'s raw-query attack simulations, a
`findUniqueOrThrow` "record not found" in `oauth-account-prehijack.test.ts` right after a successful
`201` registration, and foreign-key violations in `billing-production-gate.test.ts`. Terminated via
`pg_terminate_backend(20980)`; suite re-run cleanly afterward (see Section 5). **Verdict: INFO, not a
defect.**

### 4.2 Cross-session DB contention (a peer Claude session, twice)

A second Claude session (`motakamel-cd`) was independently running its own auth-security adverse/unit
suite against the same shared local `webaudit`/`webaudit_test` Postgres instance during this review,
causing real but misleading failures on both sides (FK-constraint violations, "record not found" right
after a successful create) whenever the two sessions' test runs overlapped. Coordinated directly twice:
paused this review's test runs each time (~15 minutes, then ~90 seconds) while the peer session
finished (confirmed clean on their end both times: adverse 808/809 then 809/809, unit 1027/1027), then
resumed. **Verdict: INFO, not a defect.**

### 4.3 A forcibly-stopped test run left a stale, lock-holding Postgres connection

While pausing for 4.2's second request, this review force-stopped its own running `pnpm test` process
mid-run. The next full unit run afterward produced 73 failures spread across completely unrelated
suites (admin, auth, capability-enable, reverify, cancel-refund) — too broad and too diverse to
plausibly be a real regression from this pass's two-file credit fix. `pg_stat_activity` showed why: a
connection (pid 50045) was `idle` holding a 9-minute-old, never-committed `UPDATE "Capability"` — the
same signature as 4.1, almost certainly caused by force-stopping the vitest process tree without
letting it close its Postgres connections cleanly. Terminated the stale backend and re-ran (73 failures
→ 7; see 4.4 for the remaining 7). **Recorded as a process/tooling lesson**: pausing a test run for DB
coordination should prefer letting the current test file finish (or killing at a process boundary
vitest itself controls) over an external force-stop; a real dev-environment
`idle_in_transaction_session_timeout` would make this class of leak self-healing rather than requiring
manual detection. **Verdict: INFO, not an application defect.**

### 4.4 A live dev environment on the same machine contends for the same Redis queue

The remaining 7 unit-test failures (Section 5) persisted after 4.3's fix, all with the signature `Job
...:RUNNING_PHASE_1:1 could not be removed because it is locked by another worker`. Root-caused via
process inspection: this machine runs the user's own live `apps/api`/`apps/worker` dev servers plus a
manual QA script, all connected to the same Redis instance the real-queue integration tests
(`admin.queue.test.ts`, `gated-check-partial.test.ts`, `progress-streaming.test.ts`,
`scan-phase-producer.test.ts`) use for unmocked BullMQ assertions — a live worker races the tests for
the same jobs. Confirmed directly with the user: this is their intentional, active dev environment, not
an orphaned process — left running, untouched. **Verdict: INFO, not a defect** — see Section 5 for why
this doesn't implicate the P0-CREDIT-1 fix (neither of the two files it touches appear in any of the 7
failing tests, in any of the runs).

---

## 5. Test baseline

**`pnpm test:adverse` (clean run, contention resolved, 2026-09-10):**
```
Test Files  49 passed (49)
     Tests  810 passed | 1 skipped (811)
  Duration  301.73s
```
The 1 skip is the pre-existing, previously-documented skip (PROGRESS.md: "645 passed / 1 pre-existing
skip"), not new. This run includes:
- All four in-flight auth adverse test files, now confirmed green (contention was the only thing
  wrong earlier): `auth-input-validation.test.ts` (48 tests), `auth-rate-limiting.test.ts` (11 tests),
  `auth-sql-injection.test.ts` (74 tests), `oauth-account-prehijack.test.ts` (2 tests). **Section 6f's
  "PENDING VERIFICATION" is now resolved to PASS.**
- The new `enqueue-failure-refund.test.ts` (2 tests, P0-CREDIT-1's regression test) — **both green**,
  confirming the fix in Section 6e.
- `packages/safe-net` (136 tests) and `apps/sandbox-runner` (18 tests) adverse suites re-confirmed
  green, matching Section 6b's independently-re-run claim.

**`pnpm run typecheck` (root):** `tsc --noEmit -p tsconfig.json` itself is clean (no errors — confirms
the P0-CREDIT-1 fix and its regression test introduce no type errors at the root level, matching the
earlier clean `apps/api`-scoped check). `turbo run typecheck` then fails on the pre-existing
`@webaudit/api` ↔ `@webaudit/worker` cyclic-dependency warning already tracked as **Open Decision #16**
in PROGRESS.md ("root `pnpm run typecheck`/`pnpm run build` both still fail on a pre-existing turbo
cyclic-dependency warning unrelated to any change in this or prior sessions") — re-confirmed
still-present and still-unrelated to this review's changes, not a new regression.

**`pnpm lint`:** fails (44 pre-existing errors, 0 in any file this review touched). All 44 are either
parsing errors from `showcase-trimora`/`.claude/skills/client-audit-showcase` files not covered by the
lint project's `tsconfig` inclusion (client-deliverable/tooling scripts, not platform runtime code —
consistent with the SSRF pass's earlier finding that `showcase-*` directories are separate from the
product), or pre-existing `@typescript-eslint/no-unnecessary-type-assertion`/`require-await` issues in
`apps/sandbox-runner/tests/unit/dispatch.test.ts`, `apps/worker/tests/unit/resolve.test.ts`, and
`packages/capability-sdk/tests/unit/conformance-report-fields.test.ts` — none of which this review
edited. **Zero new lint errors from any change in this pass** — confirmed by cross-checking every
touched file (`create-scan.ts`, `readiness/create.ts`, `app.ts`, `oauth.service.ts`, the four auth
adverse test files, `enqueue-failure-refund.test.ts`) against the full error list. This 44-error
baseline is a pre-existing repo-hygiene gap, not a regression from this review, but is recorded here for
completeness since the review brief asks for exact command output rather than a summary judgment.

**`pnpm test` (unit), final result:**
```
Test Files  4 failed | 126 passed (130)
     Tests  7 failed | 1020 passed (1027)
  Duration  465-517s across three runs
```
Same 7 tests failed identically across three separate runs (`admin.queue.test.ts` ×3,
`gated-check-partial.test.ts` ×1, `progress-streaming.test.ts` ×1, `scan-phase-producer.test.ts` ×2),
all with the same signature: `Error: Job ...:RUNNING_PHASE_1:1 could not be removed because it is
locked by another worker`. Root-caused, not assumed: this machine has the user's own live
`apps/api`/`apps/worker` dev servers running (confirmed via process command-line inspection,
`node --import tsx src/index.ts` ×2) plus a `manual-qa-auth-temp.ts` script, all connected to the same
Redis instance these tests use for real (unmocked) BullMQ queue assertions. Those four test files
enqueue a job and expect exclusive control to inspect/remove it by id — a live worker process
consuming the same queue in real time races them for that job, which the tests were never designed to
tolerate on a machine also running the app live. **Confirmed with the user directly**: this is their
own active dev environment, not a stray/orphaned process — left running, untouched, per their explicit
choice. The earlier hypothesis (a single leftover `src/serve.ts` process) was incomplete: it was
stopped once during investigation and auto-restarted, revealing the fuller picture. No code change was
made or needed here — **all 7 failures are environmental (shared live Redis with the user's own running
app), not a regression from this review's changes**, cross-checked against: none of the 7 failing test
files were touched by this review's edits, and the two files this review *did* change
(`create-scan.ts`, `readiness/create.ts`) have zero failures across all three runs, in either the unit
or adverse suites.

---

## 6. Findings

Findings are listed most-severe first once verified. Format: ID / Severity / Area / Location /
Evidence / Reproduction / Root cause / Impact / Fix / Regression test / Status.

### P0-CREDIT-1 — a debit that commits but whose job never gets enqueued is charged forever, unrecoverably

- **Severity:** P0 (violates Principle VI, "never charge for our failures" — matches Section 4/32's
  "Queue failure does not silently convert into a successful paid scan" and "Platform failure does not
  financially penalize the user" requirements exactly).
- **Area:** Credit ledger / scan creation / timeout sweep.
- **Location:** `apps/api/src/services/intake/create-scan.ts:280-306` (and the identical pattern in
  `apps/api/src/services/readiness/create.ts:196-212`); the missing backstop is
  `apps/worker/src/orchestrator/timeout.ts:127-128` and `apps/worker/src/orchestrator/
  state-machine.ts:238`.
- **Evidence:**
  - `create-scan.ts`: `db.scan.create()` → `debit()` (wrapped in try/catch; on failure, the scan row
    is deleted to compensate) → `deps.producer.enqueueFirstPhase(...)`, called with **no try/catch and
    no compensating action**.
  - `debit()` commits before `enqueueFirstPhase` runs. If the BullMQ `queue.add()` call throws
    (transient Redis unavailability, connection reset, timeout), the already-charged `Scan` row is left
    in `QUEUED` with no job ever created for a worker to pick up.
  - The intended backstop — `apps/worker/src/orchestrator/timeout-scheduler.ts`'s own header comment
    names exactly this scenario as its reason for existing — does not actually catch it:
    `sweepTimedOutScans`'s query filters on `startedAt: { lt: cutoff }`, and `startedAt` is written only
    by `state-machine.ts:238` on the `QUEUED → RUNNING_PHASE_1` transition, which never happens for a
    scan whose phase-1 job was never created. `NULL < cutoff` is never true in SQL, so the row is
    permanently excluded from the sweep.
  - `terminal-refund.ts`'s `installTerminalRefund` backstop is equally blind to this case — it only
    fires from the worker's own `transition()`, which likewise never runs for a job that was never
    enqueued.
- **Reproduction:** Create a scan; have `queue.add()` throw once (e.g. stub/kill Redis for one call)
  immediately after `debit()` commits. Confirm: (1) `CreditTransaction`/`CreditLot` show the debit
  as committed, (2) `Scan.state` stays `QUEUED` forever, `startedAt` stays `NULL`, (3) the timeout
  sweep never selects this row, (4) no refund is ever issued.
- **Root cause:** Debit and enqueue are not atomic and not symmetrically guarded — the debit-fails path
  has compensation (delete the scan row), the enqueue-fails path has none. The recovery mechanism
  (timeout sweep) is keyed off `startedAt`, a field that specifically requires a worker to have already
  picked up a job — the exact case that's missing here.
- **Impact:** A user is billed for a scan that will never run, with no automatic or even eventually-
  consistent recovery. Under real-world transient infra hiccups (the kind the failure matrix in
  Section 32 explicitly calls out), this is reachable in production, not just theoretically.
- **Fix (recommended, not yet applied — pending full picture from remaining subsystems before editing
  shared code):** Either (a) wrap `enqueueFirstPhase` in a try/catch that deletes the scan row and
  issues a compensating refund, mirroring the existing debit-failure branch exactly, or (b) broaden the
  timeout sweep's candidate query to also catch `state = 'QUEUED' AND startedAt IS NULL AND createdAt <
  cutoff`. (a) is preferred: it fails fast and doesn't leave the user waiting out a sweep interval for a
  scan that was never going to run. Apply the same fix to `readiness/create.ts`.
- **Regression test:** none exists today — `apps/worker/tests/integration/timeout-sweep.test.ts` only
  constructs scans already in `RUNNING_PHASE_1` with `startedAt` pre-set; no test exercises a `QUEUED`
  scan with `startedAt: null`, nor an `enqueueFirstPhase` throw. A new adverse test is needed.
- **Status:** CONFIRMED via code inspection by a dedicated research pass; not yet fixed. Fix will be
  applied and verified with a new regression test once the DB is free for test runs again (currently
  paused — see cross-session coordination note in Section 4.2).

### P2-SSRF-1 — `probe-pool`'s browser navigation bypasses the SSRF guard entirely (latent, not yet reachable)

- **Severity:** P2 (real code-level gap; currently inert because nothing wires a `pageProvider` into
  `ctx.withPage` yet — `apps/worker/src/orchestrator/orchestrator.ts:110-121` — but becomes exploitable
  the moment probe-pool is connected, which the constitution's own roadmap requires for FR-033/screenshot
  capabilities).
- **Area:** SSRF / probe-pool.
- **Location:** `apps/probe-pool/src/browser/pool.ts:68-69`.
- **Evidence:** `page.goto(url, ...)` calls Playwright directly with **no** call into
  `packages/safe-net`'s `validateUrl`/`assertPublicTarget`/connect-time guard anywhere in the file —
  unlike every other target-controlled egress path in the repo (`ctx.fetch`, repo zipball download,
  GitHub API calls), which all route through `safeFetch`. `packages/capability-sdk/src/context.ts:12-16`
  claims "the four SSRF layers run on every call," but that claim is scoped to `fetch` and doesn't
  caveat that `withPage`'s eventual `.goto()` has no equivalent check.
- **Impact if wired without a fix:** a capability's `targetUrl` (attacker-influenced at scan submission)
  would drive real browser navigation to arbitrary internal addresses with none of the four SSRF layers
  applied — a full guard bypass for the browser-based capabilities (`cwv-analyzer`,
  `screenshot-capture`, `lighthouse-analyzer`).
- **Fix — applied** (spec-driven, `specs/003-fix-browser-pool-ssrf/`, 2026-09-11): a real browser
  manages its own network stack, so `safeFetch`'s undici-specific connector doesn't transplant directly.
  Instead, a new minimal local forward proxy
  (`packages/safe-net/src/browser-proxy.ts`/`browser-proxy-handlers.ts`) reuses this package's existing
  `assertResolvedAddressesAllowed`/`classifyAddressString` unchanged; Chromium is launched with
  `proxy: { server: 'http://127.0.0.1:<port>' }` (a real, documented Playwright option;
  `apps/probe-pool/src/browser/pool.ts`), so every request it makes — initial navigation, every
  redirect, every sub-resource — becomes an independent request through this proxy's `CONNECT`/
  plain-HTTP handling, each resolved and validated at the moment a real connection is about to open,
  connecting to the validated IP directly (never re-resolving the hostname) with a post-connect
  belt-and-suspenders re-check mirroring `connect-guard.ts`'s own "destroy first, call back second"
  discipline. One mechanism achieves all four SSRF layers by construction — no separate redirect logic
  needed, since a redirect is just another independent request through the same proxy.
  `createSafeBrowserProxy`'s public signature (added to `packages/safe-net/src/index.ts`) deliberately
  exposes only `resolver` for test injection, never `policy`/`allowLoopback` — preserving this package's
  existing never-weaken-the-policy-externally discipline rather than carving an exception into it.
  A real bug was found and fixed during testing, not merely by inspection: the initial refusal
  implementation answered a disallowed plain-HTTP request with a normal HTTP 502 response, which
  Playwright's `page.goto()` treats as a **successful** navigation to an error page rather than a
  failed one (a browser only rejects on connection-level failures, not HTTP error status codes) — fixed
  by destroying the underlying connection outright on refusal instead, confirmed red-then-green.
- **Regression tests — added and verified red→green**: `packages/safe-net/tests/adverse/
  browser-proxy.test.ts` (6 tests — proxy-level: disallowed private/metadata/loopback addresses refused
  before any byte relayed, a resolver answering with a disallowed address refused, a legitimate real
  local server's content delivered end-to-end through the tunnel, and a second independent request to a
  disallowed target refused regardless of an immediately-preceding allowed one — the redirect-equivalent
  requirement) and `apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts` (3 tests — real Chromium:
  a genuine public URL still loads with the proxy active, navigation to a well-known disallowed literal
  metadata address fails visibly, and the `chromium.launch()` wiring is confirmed to actually receive
  the `proxy` option). Added latency for legitimate navigation measured (not assumed) at effectively
  zero — within ordinary network variance, not a real slowdown (a fair, steady-state, fresh-context-per
  -run comparison against a real external site).
- **Status:** FIXED and regression-tested, 2026-09-11. `packages/safe-net`'s full pre-existing adverse
  suite (136 tests) re-confirmed green with zero regression — `safe-fetch.ts`/`connect-guard.ts`/
  `resolve-guard.ts`/`address-rules.ts`/`policy.ts` were not modified at all.

### 6b. Everything else the SSRF/sandbox pass checked (SAFE, evidence-backed, empirically re-run)

This pass didn't just read code — it re-ran the real adverse suites for these two packages (136
`safe-net` tests, 18 `sandbox-runner` tests, all passing against current code) rather than trusting
PROGRESS.md's account of what was fixed:

- **SSRF connect-time re-validation** (anti-DNS-rebinding) — `packages/safe-net/src/connect-guard.ts`
  re-validates the actually-connected socket's remote address, not just the DNS answer.
- **Manual redirect handling** — every hop re-validated, fresh dispatcher per hop, sensitive headers
  stripped cross-origin, monotonically.
- **Comprehensive address-form coverage** — loopback, private, link-local, metadata, IPv4-mapped/
  translated/NAT64/6to4/Teredo IPv6, and decimal/octal/hex-encoded IPv4 (delegated to the WHATWG URL
  parser, then re-checked) — all confirmed blocked by passing tests, not just present-looking code.
- **Sandbox isolation** — real child-process + `--permission` + `node:vm` double boundary, confirmed
  not `vm2` (the `WebAuditAI_ARCHITECTURE.md` mention is stale documentation, not live code).
- **No egress/secrets in the sandbox** — `env: {}` on fork (no inheritance), `ctx.fetch` inside the
  sandbox unconditionally rejects (not just guarded — genuinely absent).
- **Guaranteed child cleanup on every exit path** — unconditional `finish()` calls `child.kill('SIGKILL')`
  from every terminal branch (success, timeout, error, exit); a dedicated no-leak regression test (5
  concurrent mixed benign/hostile requests) passed.
- **No unsandboxed fallback** — confirmed no fallback branch exists anywhere in the upload/dispatch
  code; unavailability maps to 503 only.
- **Timeout/memory enforcement is real (process-killing), not advisory** — `SIGKILL` on timeout,
  `--max-old-space-size` + OOM-exit detection for memory, both empirically confirmed to actually kill
  the process within bounds.

### 6c. Everything else the credit-ledger pass checked (SAFE, evidence-backed)
(numbered 6c to keep this section stable as more subsystem passes land below)

Verified with file:line citations and, in most cases, an already-passing adverse/concurrency test:

- **Quote integrity** — server never trusts a client-supplied price; `acceptedQuote` is an
  acknowledgment gate only (mismatch → free refusal, never a discount).
  `apps/api/src/services/intake/quote.ts`, `create-scan.ts:219-231`.
- **Lot allocation ordering** — expiring lots spent first, PLAN-before-PURCHASED tiebreak, `FOR UPDATE`
  row locking. `apps/api/src/services/credits/debit.ts:82-92`.
- **Refund-to-originating-lot correctness** — proportional per-allocation refund, headroom floored at
  zero (can't mint credit), replacement lot preserves PLAN-vs-PURCHASED expiry semantics if the
  original lot expired. `apps/api/src/services/credits/refund.ts:72-303`.
- **Concurrency** — `FOR UPDATE` + consistent lock ordering across debit/refund/expiry, bounded retry on
  serialization failures. `apps/api/src/db/retry.ts`, `credits.concurrency.test.ts`,
  `credits.expiry-race.test.ts`, `credits-debit-refund-race.test.ts` all passing per the research pass.
- **Idempotency** — no explicit idempotency-key header, but a partial unique index
  (`Scan_one_active_per_target`) structurally prevents double-charging a duplicate concurrent
  scan-creation request for the same target (loser hits `23505` **before** `debit()` is called).
  Credit *grants* (billing webhook) do have an explicit idempotency key (`billingEventId`, unique).
- **Cost reconciliation** — every provider attempt (including failed fallbacks) recorded once as its
  own `AiInvocation`; `CapabilityExecution.costMicros` rolled up exactly once; code-layer executions
  hardcode `costMicros: 0`. No double-recording either direction.
- **Prior documented credit defects (C1, the 17ms refund/expiry race, negative-headroom minting,
  missing grant idempotency key, the FR-018 TOCTOU)** — all re-verified as genuinely fixed in current
  code, not just claimed fixed in changelog prose.

---

### 6d. AI executor, redaction, issue lifecycle, targeted re-verification, readiness pass — all SAFE

No findings. Verified with file:line evidence (not summarized further here to keep this document
scannable — full citations available in the research pass transcript if needed):

- `packages/ai-executor` is the only place any provider SDK is imported, enforced by both a repo-wide
  grep (clean) and an ESLint `no-restricted-imports` rule scoped to exempt only that package.
- `RedactedPrompt` is unforgeable outside `packages/redaction` — a private `unique symbol` brand plus a
  module-private `WeakSet` registry, and the package's own `package.json` `exports` field makes the
  constructor's file unreachable by Node's module resolution from outside the package, not just by
  convention.
- Provider fallback (timeout / malformed / rate-limited) correctly advances the chain; full exhaustion
  degrades the module (never throws, keeps existing `MEASURED` findings, never nulls score per FR-053).
- Cost is recorded per attempt including failures, in integer micros throughout — a dedicated
  "digit-shuffling" pricing conversion specifically avoids `parseFloat`-based float money.
- Attribution (`MEASURED` vs `AI_JUDGMENT`) uses the identical brand+WeakSet pattern, assigned only by
  the runner; `CapabilityFinding`'s own type has no attribution field for a capability to set even
  maliciously. A side channel (an INSTALLED capability's own prompt text being misread as a
  target-supplied secret finding) is explicitly filtered out.
- `Issue.RESOLVED` has exactly one inbound write path (`recordVerificationAttempt`), gated by a runtime
  assertion that only a `PASSED` outcome may target `RESOLVED`, and the only user-facing action reaches
  `ASSERTED_FIXED` at most — never `RESOLVED` directly.
- Targeted re-verification runs exactly one check for one fingerprint, ownership-checked at the only
  route that can enqueue it, with no separate endpoint that skips that check.
- The readiness pass's baseline must belong to the caller, and the "fresh audit" is a genuinely new
  `Scan` row run through the same phase pipeline as any other scan — comparison reads the baseline
  only after the fresh run completes; it never seeds/copies rows into the new scan.

### P0-CANCEL-1 — cancellation only flips a DB flag; in-flight work keeps running, and the platform can pay AI cost for a module already refunded to the user

- **Severity:** P0 (financial correctness + data integrity — matches Section 31's explicit ask to
  "reproduce and document it as a concrete workflow defect rather than merely calling it 'covered'").
- **Area:** Cancellation / orchestrator / credits.
- **Location:** `apps/api/src/routes/scans.routes.ts:278-297` (cancel route), `apps/worker/src/
  orchestrator/orchestrator.ts:560-568,598-613` (phase execution), `apps/api/src/services/admin/
  queue.service.ts:21-32` (the team's own prior admission of this exact limitation, for the operator
  path).
- **Evidence:** `POST /scans/:id/cancel` is a single guarded `updateMany` writing `state: CANCELLED`
  and nothing else — no signal reaches the worker process (no pub/sub message, no `AbortController`, no
  BullMQ `job.remove()`). The orchestrator only discovers a cancellation the next time it attempts a
  phase-boundary transition, which simply loses the guarded-`updateMany` race and returns quietly — but
  whatever is inside the current phase's `Promise.all` (in-flight capability execution, in-flight AI
  calls) runs to completion regardless. The admin queue service already documents this exact physics for
  the operator "cancel job" action ("BullMQ removing an active job's queue record does not stop whatever
  process is mid-execution on it") but the same limitation was never extended to the user-facing route.
- **Reproduction:** Scan is in `RUNNING_PHASE_2` running a ~55s AI-heavy capability (module timeout
  default 60s). At t=5s the user cancels — `CANCELLED` is written immediately, and `scans.routes.ts`
  refunds credits for that module as "undelivered" (it isn't in `moduleResults` yet). The worker's
  `Promise.all` keeps running; at t=55s the module completes, `persistModuleResult` commits a real
  `ModuleResult`/`Issue` row and a real `CapabilityExecution`/`AiInvocation` row carrying the AI
  provider's actual incurred cost — for a module the user has already been refunded for. The phase's own
  attempt to advance state then loses the guard against the already-`CANCELLED` row and no-ops.
- **Impact:** the platform pays real, non-refundable AI provider cost for work it already told the user
  (via refund) was never delivered — a direct revenue leak, and a data-integrity smell (a real
  `ModuleResult`/`Issue` exists on a scan whose terminal state says nothing ran). A second, narrower race
  noted in passing: workspace teardown (correctly triggered out-of-band on cancel) can delete on-disk
  workspace files while a still-running capability's `ctx.readFile`/`ctx.glob` tries to read them —
  lower severity since the scan is already cancelled either way.
- **Fix — applied** (spec-driven, `specs/002-fix-cancel-timeout-refunds/`): checkpoint-based
  cooperative cancellation, not full mid-execution interruption (a deliberate, documented scope
  boundary — see that spec's FR-007). `apps/api`'s cancel route publishes a Zod-validated, best-effort
  notification on a per-scan Redis channel (`packages/config/src/cancellation.ts`,
  `apps/api/src/services/queue/cancel-publisher.ts`) immediately after its guarded `updateMany`
  commits. `apps/worker`'s `handlePhase` subscribes for exactly the lifetime of one phase-job
  invocation (`apps/worker/src/orchestrator/cancellation.ts`'s `CancellationSource`, wired into
  `OrchestratorOptions`) and `runAndPersistModule` checks it at two checkpoints: before starting a
  module's `runModule()` call, and again immediately before the transaction that would persist its
  result (`apps/worker/src/orchestrator/orchestrator.ts`). Once cancellation is discovered at either
  checkpoint, no `ModuleResult`/`Issue`/`CapabilityExecution`/`AiInvocation` row is ever written for
  that module. Real vendor cost already incurred *before* a checkpoint fires is not and cannot be
  undone by this fix (an explicit, accepted scope limit) — what closes is the ledger/data-integrity
  defect: a "cancelled" scan can no longer end up with a phantom persisted, charged result.
- **Regression test — added and verified red→green**:
  `apps/worker/tests/adverse/cancel-mid-flight-no-charge.test.ts`. Deterministically (via promise
  synchronization, not timing guesses) lands the DB cancellation write and the pub/sub signal while a
  capability is genuinely still executing, then confirms no result/execution/AI-invocation row is ever
  written. Confirmed to fail against the pre-fix code (temporarily disabling the persist-checkpoint
  guard reproduces the original bug exactly) before confirming it passes with the fix in place.
- **Status:** FIXED and regression-tested, 2026-09-10. Full design rationale, including two real
  implementation decisions found only by reading the actual code (subscription lifetime must be scoped
  to one phase-job, not a scan's whole multi-job lifetime; checkpoint granularity is module-level, not
  per-individual-capability), is in `specs/002-fix-cancel-timeout-refunds/research.md`.

### P0-TIMEOUT-1 — the timeout sweep computes refunds from a stale, unlocked snapshot; a module that completes during batch processing is refunded as "undelivered" anyway

- **Severity:** P0 (financial correctness — matches Section 26/31's refund-correctness requirements).
- **Area:** Timeout sweep / credits.
- **Location:** `apps/worker/src/orchestrator/timeout.ts:121-214`.
- **Evidence:** the sweep's `findMany` (lines 127-137) snapshots up to 50 candidate scans' `state` and
  `moduleResults` in one batch read; `terminate()` (lines 146-168) then computes `refundForUndelivered`
  from that snapshot for each scan in turn, and only afterward attempts the guarded state
  `transition()` (lines 172-182) — which guards `state` only, never re-verifies `moduleResults`
  completeness. Processing 50 scans sequentially, each doing several DB round trips, can easily take
  seconds; a module can complete and commit its `ModuleResult` (independent of scan `state` — nothing
  blocks it) in that window.
- **This is not newly-introduced risk — it is a previously documented-as-"currently inert" gap that has
  since gone live.** PROGRESS.md's own note (its numbered item "0d") explicitly said this bug "stops
  being inert the moment T113 wires real charging" — T113 (real orchestrator + non-zero
  `chargedCredits` at scan creation) has since landed, and the note was never revisited. This review
  re-verified the current code directly rather than trusting that prior "inert for now" framing, and
  confirmed the precondition the note itself named has occurred.
- **Reproduction:** a 5-module scan exceeds `SCAN_TIMEOUT_MS` (15 min default) while genuinely still
  making progress (each module can legitimately take up to 60s, run sequentially across phases). The
  sweep's batch read snapshots it at 4-of-5 delivered; while the rest of the batch is being processed,
  the 5th module completes and commits. `terminate()` still refunds "1 of 5 undelivered" from the stale
  snapshot, then wins the (unaffected) state guard and marks the scan `TIMED_OUT`. The user is refunded
  for a module that was, in fact, delivered.
- **Fix — applied** (spec-driven, `specs/002-fix-cancel-timeout-refunds/`): `terminate()`
  (`apps/worker/src/orchestrator/timeout.ts`) now re-reads that scan's `moduleResults` fresh via
  `tx.scan.findUniqueOrThrow`, computes `refundForUndelivered` from that fresh read, and performs the
  guarded `transition(tx, ...)` — all inside one `db.$transaction(...)` per scan, opened immediately
  before that scan's own turn in the sweep. The batch `findMany` is now a coarse candidate-selection
  query only, never the source of truth for the refund amount. **One real deviation from the initial
  literal proposal, found by reading the actual code rather than assumed**: `refund()`
  (`apps/api/src/services/credits/refund.ts`) could **not** be nested inside this same transaction —
  Prisma does not support a nested interactive transaction, and `refund()` opens its own to lock
  `CreditLot` rows. `refund()` itself is therefore deliberately left untouched, called exactly as
  before, immediately after the new transaction commits — narrowing the staleness window from "the
  rest of a 50-scan batch" down to "one scan's own transaction boundary," which is what this defect's
  acceptance criteria actually require, without touching a second money-critical file. Full reasoning:
  `specs/002-fix-cancel-timeout-refunds/research.md`, Decision 5.
- **Regression test — added and verified red→green**:
  `apps/worker/tests/adverse/timeout-refund-staleness.test.ts`. Uses a new test-only hook
  (`SweepOptions.onBeforeScan`, never set in production) to deterministically land a `ModuleResult`
  write for a candidate scan between the batch read and that scan's own refund transaction, then
  confirms the refund reflects the module as delivered. Confirmed to fail against the pre-fix logic
  (temporarily forcing the stale-snapshot computation path reproduces the original over-refund exactly:
  the full charge gets refunded instead of half) before confirming it passes with the fix in place.
- **Status:** FIXED and regression-tested, 2026-09-10. Existing `timeout-sweep.test.ts` and
  `workspace.test.ts` suites (31 tests total, including this restructuring's effect on
  `installTerminalTeardown`'s interaction with the sweep) re-verified green with no regression.

### P0-CREDIT-1 (corroboration) — independently re-confirmed by the orchestrator/queue research pass

The orchestrator/queue pass reached the exact same bug as the credit-ledger pass (Section 6, "a debit
that commits but whose job never gets enqueued is charged forever, unrecoverably"), from the opposite
direction — tracing BullMQ/worker crash-recovery paths rather than the credit ledger itself — and adds
one piece of corroborating detail: the `enqueueFirstPhase` throw in `create-scan.ts:280-306` is
currently **completely unguarded** (propagates straight to the route's generic `throw error`, no typed
catch branch), and `readiness/create.ts:196-212` has the identical shape. Two independent research
passes reaching the same file:line and the same root cause raises confidence this is real and worth
fixing first. **This is the fix applied in this pass — see Section 6e.**

### ~~RISK — `master-report.ts:81` writes `overallScore`/`summary` with no state guard~~ — FIXED, 2026-09-11

`apps/worker/src/orchestrator/master-report.ts`'s `runMasterSynthesis` wrote `overallScore`/`summary`
unconditionally once its AI call returned, with no check for a cancellation discovered while that call
was in flight — unlike `runAndPersistModule`'s own two checkpoints (P0-CANCEL-1). Fixed by threading the
same `isCancelled` checkpoint predicate through as an optional fourth parameter (default `() => false`,
so every existing caller is unaffected) and checking it immediately before the `db.scan.update` write,
skipping the write if cancellation was discovered — mirroring the existing checkpoint discipline rather
than inventing a new guard shape. Regression test, red-then-green:
`apps/worker/tests/adverse/master-synthesis-cancel-mid-flight.test.ts` (a fake executor whose `run()`
blocks on a controllable promise, so cancellation can be deterministically discovered while the AI call
is still pending — the same synchronization style `cancel-mid-flight-no-charge.test.ts` already uses for
the module-level checkpoint).

### 6e. Fixes applied in this pass

**P0-CREDIT-1 fix — applied:**

- `apps/api/src/services/intake/create-scan.ts` — `enqueueFirstPhase` is now wrapped in its own
  try/catch. On failure: if a debit was made (`chargeCredits > 0`), it is refunded in full via
  `refund(db, debited.id, 'scan:enqueue-failed')`; the scan row is then transitioned
  `QUEUED → FAILED` via a guarded `updateMany` (`where: { id, state: 'QUEUED' }`) with a
  `failureReason`, rather than deleted — deletion was rejected as the fix shape because the debit
  already committed real `CreditTransaction`/`CreditAllocation` rows referencing this `scanId`, and
  removing the scan row would orphan that ledger history for anyone looking at the user's credit
  movement log later. `FAILED` is a legal `QUEUED` target in `apps/worker`'s own `ALLOWED` transition
  table, so this mirrors the existing terminal-failure shape used elsewhere rather than inventing a new
  one; `apps/api` cannot import `apps/worker`'s state machine (only the reverse dependency is allowed),
  so the guarded `updateMany` is hand-written here, matching the existing precedent
  (`scans.routes.ts`'s cancel route does the same for the same reason).
- `apps/api/src/services/readiness/create.ts` — identical fix, same shape, for the readiness-pass
  creation path.
- Both files now import `refund` from `../credits/refund.js` and capture `debit()`'s return value
  (`DebitResult`) so the specific transaction can be targeted for refund.
- `npx tsc --noEmit` on `apps/api` is clean after the change (no new type errors).

**Regression test — added:** `apps/api/tests/adverse/enqueue-failure-refund.test.ts` (new) — stubs
`producer.enqueueFirstPhase` to throw, then asserts: (1) the scan ends in `FAILED` with a
`failureReason`, never stuck in `QUEUED`; (2) the debited credits are fully refunded (ledger balance
restored); (3) the same for the readiness-pass creation path. See Section 5 for pass/fail status once
the suite runs.

### 6f. Auth / SQL-injection / rate-limiting — review of pre-existing in-flight work (Section 3)

Code-reviewed all four new adverse test files plus the two production diffs already on the branch at
review start (Section 3). Findings:

- **`oauth.service.ts`'s account-pre-hijacking fix is sound.** The "classic-federation merge" attack it
  closes is real and was genuinely exploitable before this diff (an attacker registers a victim's email
  first, unverified; the victim later joins via OAuth per FR-004; the attacker's original password
  would otherwise still work once the row is later verified through any path). The fix — clearing
  `passwordHash` and revoking existing sessions only when `existing.emailVerifiedAt` was null at join
  time — correctly leaves the ordinary case (an already-verified account adding a second sign-in method)
  untouched, and does so inside one `$transaction` so the password-clear, identity-creation, and
  session-revocation land atomically. `oauth-account-prehijack.test.ts` proves both halves end-to-end
  against the real routes, not just the service function in isolation.
- **`app.ts`'s `bodyParserErrorHandler` is sound and correctly scoped.** It matches on `err.type`
  against an explicit allowlist of `body-parser`/`raw-body` error types rather than any object carrying
  a `status` field, so it cannot accidentally swallow an unrelated route handler's own thrown
  `HttpError`. It is registered immediately after `express.json()`, ahead of the generic 500 catch-all,
  exactly where Express requires a 4-argument error handler to intercept a synchronous `next(err)` from
  the body parser.
- **The four new adverse test files are well-constructed and match this review's own methodology** —
  real payloads against real routes, not mocked-away boundaries: `auth-sql-injection.test.ts` fires 8
  classic/blind SQLi payloads (reshaped to pass Zod's email format check where relevant) at every field
  on the login/register/reset/verify/refresh/bearer-token paths, plus a stacked-statement test that
  confirms no injected `INSERT` ever lands; `auth-input-validation.test.ts` covers type-confusion
  (`null`, arrays, a NoSQL-shaped `{ $ne: null }` object, a `toString`-override object), boundary sizes
  (10,000-char email, 100,000-char password rejected fast, before bcrypt runs), unicode/normalization
  pinning (NFC vs NFD treated as different passwords — no silent normalization), the malformed-JSON/
  oversized-body behavior the `bodyParserErrorHandler` fix directly targets, and OAuth-start query
  type-confusion/open-redirect-neutralization; `auth-rate-limiting.test.ts` is notable for identifying
  and closing a real, previously-real gap on its own initiative — the strict/general rate limiters had
  **never been exercised by any test in this repo** (`createApp` disables them entirely under
  `NODE_ENV=test`, so every other suite runs with the control off), and this file boots them for real
  (in-memory store) and proves budget-sharing across credential paths, IP-keying, retry-after headers
  with no information leak about remaining budget, and that CORS preflight `OPTIONS` never spends
  budget.
- **No additional findings from code review alone.** All four files appear correct on inspection; this
  review has not yet been able to run them to a green result — see Section 5/6a: the shared local
  Postgres instance has had real, repeated cross-session contention during this review (both from a
  stale connection this review found and cleared, and from a concurrent peer Claude session also
  running tests against the same DB). **Status: PENDING VERIFICATION**, not PASS — re-run and confirm
  green once the DB is confirmed clear, before treating this section as closed.

### 6g. Cross-route IDOR/authorization audit — all SAFE

Covers every route file not already checked by the issue-lifecycle pass (Section 6d): `targets`,
`scans`, `reports`, `billing`, `webhooks` (billing), `readiness` (certificate route), `intake`, `auth`,
`oauth`, and all 8 `admin/*` route files.

- Every resource-loading handler derives the acting user id from `req.auth` (session-verified) and
  filters the lookup by `{ id, userId }` or an equivalent relational ownership filter (e.g.
  `scan: { userId }`) — never a bare `findFirst({ id })` followed by trusting the caller.
- No client-supplied `userId`/`role`/`isOperator` field is ever used for an authorization decision
  anywhere in the API.
- All 8 admin route files are gated by exactly one `requireOperator` middleware, applied via
  `router.use()` in `admin/index.ts` and mounted once in `app.ts` — no selective or missing gate.
- The billing webhook verifies its HMAC signature (constant-time compare) strictly before any DB
  write, fails closed if unconfigured, and is idempotent under retry.
- The readiness certificate route requires auth+ownership — it is not a guessable/public bearer link.
- ~~One soft spot worth a follow-up ticket, not a vulnerability: `scans.routes.ts:321,427,454`
  re-fetches a scan by bare id after an already-ownership-checked operation earlier in the same
  request.~~ — **FIXED, 2026-09-11.** The cancel route's post-write re-fetch is now
  `fetchCancelledScanForUser(db, scanId, userId)` (exported, mirroring
  `ratelimit.middleware.ts`'s own `clientKey`), scoped to `{ id, userId }` via `findFirstOrThrow` instead
  of a bare-id `findUniqueOrThrow` — evidence carried in the query itself rather than relying on
  ordering alone. Regression test proves the scoping directly, independent of whether today's route can
  reach it with a mismatched user (it structurally cannot, which is exactly why a route-level test alone
  would never have caught a regression here):
  `apps/api/tests/integration/scans.cancel-refetch-scoping.test.ts` constructs two users and confirms the
  function refuses a different user's lookup even though the scan id alone would resolve it.

### 6h. Realtime / WebSocket — SAFE, with two minor RISK notes

Hand-rolled `ws` server + Redis pub/sub fan-out (not socket.io), backed by a dedicated adversarial
suite (`apps/api/tests/adverse/realtime-authorisation.test.ts`) and a unit suite (`fanout.test.ts`).

- **Authorization model is per-subscription, not per-connection, deliberately** — the raw socket
  upgrade itself is unauthenticated, but every `subscribe` message carries the short-lived access
  token, re-verified and re-checked against `db.scan.findFirst({ id, userId })` on every subscribe. An
  expired token on an already-open socket is refused for *new* subscriptions without killing the
  socket. Room names are always server-derived (`scanRoom(scanId)`) — a client-supplied room field is
  simply ignored, confirmed by a dedicated test.
- **No event replay on reconnect — by explicit design, not a gap.** The client resyncs via
  `GET /scans/:id` (FR-047's REST fallback, confirmed to return live, unbuffered, ownership-scoped DB
  state) after every successful (re)subscribe, not just on mount. One small, explicitly-disclosed
  residual gap: a state change caused by another action in a different browser tab (not a worker-side
  transition) is push-only to sockets already watching; a second tab only picks it up on its own next
  resync. Recorded as accepted, not hidden.
- **Duplicate-subscription and cleanup handling is correct by construction** — `Set`-based room/socket
  membership makes double-subscription a no-op, and both clean and unclean disconnects (`close`/`error`
  events) run the same cleanup path, confirmed by a passing test for the dead-socket case.
- ~~**Two minor RISK notes**~~ — **both FIXED, 2026-09-11**:
  1. The raw WebSocket upgrade now takes a `verifyClient` callback: an optional `allowedOrigins` set
     checked against the handshake's `Origin` header (mirroring `app.ts`'s own `corsAllowlist` — a
     missing `Origin` header, e.g. a non-browser caller, is always allowed, exactly like the existing
     CORS rule) and an optional `maxConnectionsPerIp` cap, keyed by a normalized source address
     (mirroring `ratelimit.middleware.ts`'s own `clientKey`: `::ffff:` stripped, IPv6 collapsed to /64).
     Both options are opt-in (default: unbounded/unchecked, the prior behaviour) but wired with real
     values (`corsAllowlist()`, cap of 50) at the real production call site in `apps/api/src/index.ts`.
     Regression tests, real HTTP server + real `ws` clients (the only way to actually exercise
     `verifyClient`): `apps/api/tests/adverse/realtime-upgrade-limits.test.ts` — refuses past the cap,
     frees a slot on disconnect, refuses a disallowed origin, accepts an allowed one and a missing one,
     and confirms both defaults are unchanged when unconfigured.
  2. The worker's publisher Redis client now attaches its own `.on('error', ...)` handler
     (`apps/worker/src/index.ts`'s new, exported `createPublisherRedisClient`, mirroring
     `ratelimit.middleware.ts`'s own `createClient` and its exact rationale comment) instead of relying
     on the generic process-wide backstop to log an unattributed incident. Regression test:
     `apps/worker/tests/adverse/publisher-redis-error-handling.test.ts` confirms a listener is attached
     and that emitting a synthetic error does not throw (the exact mechanism that turns an unhandled
     ioredis reconnect failure into an uncaught exception).
- **FR-047 confirmed end-to-end**: the worker persists before publishing (already verified in Section
  6b's orchestrator pass), a publish failure never throws, and `GET /scans/:id` — including
  `moduleResults`, added after a real gap found in manual testing — returns live DB state scoped to the
  authenticated owner with no cache in front of it.

## 7. Executive summary, remaining risks, and final verdict

### 7.1 Executive summary

| Severity | Count | Status |
|---|---|---|
| P0 | 3 | **All 3 fixed and regression-tested**: P0-CREDIT-1, P0-CANCEL-1, P0-TIMEOUT-1 (the latter two via `specs/002-fix-cancel-timeout-refunds/`, 2026-09-10) |
| P1 | 0 | — |
| P2 | 1 | **Fixed and regression-tested**: P2-SSRF-1 (via `specs/003-fix-browser-pool-ssrf/`, 2026-09-11) |
| P3 | 4 | **All 4 fixed and regression-tested, 2026-09-11** — master-report.ts unguarded write (checkpoint added); realtime connection-count/origin limit (verifyClient added); worker Redis publisher missing error listener (handler added); scans.routes.ts bare-id post-check refetch pattern (scoped to userId) |
| INFO | 4 | Environmental/methodology notes (stale-connection defects found and cleared twice, cross-session DB contention, a live dev-environment queue collision) — none are application defects |

**What's genuinely strong:** credit-ledger internals (lot ordering, refund-to-origin, concurrency
locking, idempotency-via-constraint), AI-executor/redaction (provider isolation, unforgeable
`RedactedPrompt`, honest degradation, integer-micros cost accounting), the issue lifecycle
(`RESOLVED`'s single gated write path), targeted re-verification and readiness-pass ownership/freshness,
SSRF (comprehensive address-form coverage, connect-time re-validation, manual per-hop redirect
re-checking — empirically re-run, not just read), sandbox isolation (real child-process + `--permission`
+ `node:vm` double boundary, guaranteed cleanup, no unsandboxed fallback), cross-route
authorization/IDOR (every route checked derives ownership from the session, never the client), realtime
authorization (per-subscription re-check, server-derived rooms, FR-047's REST fallback genuinely
returns live state), and the in-flight auth/SQL-injection/rate-limiting work (all four new adverse test
files green, the account-pre-hijacking fix and body-parser error handler both sound).

**Update, 2026-09-10:** both P0-CANCEL-1 and P0-TIMEOUT-1 have since been fixed, via a full spec-kit
cycle (`specs/002-fix-cancel-timeout-refunds/spec.md` →`plan.md`→`research.md`→`tasks.md`), each with a
genuine red→green regression test (confirmed to fail against the pre-fix code before confirming it
passes with the fix), with zero regressions in the existing suites. All three P0 findings from this
review are now closed.

**Update, 2026-09-11:** P2-SSRF-1 has since been fixed too (`specs/003-fix-browser-pool-ssrf/`) — a
local SSRF-safe forward proxy gives the browser pool the same connect-time guarantee `safeFetch`
already had, with two new regression test files (9 tests), zero regressions in `packages/safe-net`'s
136 pre-existing tests, and a real bug (a disallowed navigation resolving instead of rejecting) found
and fixed during testing rather than merely by inspection.

**Update, 2026-09-11 (later):** the load-testing gap has since been closed too
(`specs/004-load-testing-harness/`, `load-testing/REPORT.md`) — see Section 7.2 item 5 below for the
real measurements and the two findings it surfaced.

**Update, 2026-09-11 (later still):** all four recorded P3 items are now fixed and regression-tested —
master-report.ts's checkpoint (Section 6e), the realtime upgrade's origin/connection-count limits and
the worker publisher's error handler (Section 6h), and the cancel route's scoped re-fetch (Section 6g).
**Every P0, P2, and P3 finding from this review is now closed** — the only genuinely open item is the
honest boundary load-testing found (unverified above 10 concurrent audits, for a real, evidence-backed
reason — Section 7.2 item 5). See Sections 6 (updated status blocks) and 7.4 (updated verdict) below.

### 7.2 Remaining risks (genuine, not yet closed)

1. ~~**P0-CANCEL-1**~~ — **FIXED, 2026-09-10** (`specs/002-fix-cancel-timeout-refunds/`). Checkpoint-based
   cooperative cancellation via a per-scan Redis pub/sub signal; see Section 6 for the full account and
   regression test.
2. ~~**P0-TIMEOUT-1**~~ — **FIXED, 2026-09-10** (same spec). The refund decision now re-reads
   `moduleResults` fresh inside the same transaction as the guarded terminal state write; see Section 6.
3. ~~**P2-SSRF-1**~~ — **FIXED, 2026-09-11** (`specs/003-fix-browser-pool-ssrf/`). A local SSRF-safe
   forward proxy now gives `probe-pool`'s browser navigation the same connect-time protection
   `safeFetch` already has; see Section 6 for the full account and regression tests.
4. ~~Four P3 items recorded in Sections 6b/6d/6h/6g~~ — **all FIXED and regression-tested, 2026-09-11**:
   `master-report.ts`'s unguarded write (Section 6e — an `isCancelled` checkpoint, mirroring
   P0-CANCEL-1's own discipline), the WebSocket upgrade's missing connection-count/origin limit and the
   worker's Redis publisher missing an error listener (both Section 6h), and `scans.routes.ts`'s bare-id
   post-check refetch (Section 6g). None were exploitable before the fix; all four are hardening, not
   incident response.
5. ~~**Performance/load testing (Sections 27-29 of the original brief): BLOCKED, not guessed.**~~ —
   **CLOSED, 2026-09-11** (`specs/004-load-testing-harness/`, results in `load-testing/REPORT.md`). A
   real k6-based harness now drives the golden-path workflow (target → quote → scan → poll) against the
   real, running `apps/api`/`apps/worker`. Stages 1, 5, and 10 concurrent audits all show **100% success
   and zero errors**, with `time_to_terminal` flat at ~2.0-2.1s regardless of concurrency — no sign of
   degradation at any level actually tested. Two real findings were surfaced and are reported, not
   patched around: (a) the `concurrentScanLimit: 6`-per-user entitlement ceiling (a real, by-design
   multi-tenant limit); (b) `/auth/login`'s real strict rate limiter (10 attempts/15min per source IP)
   combined with the 15-minute JWT lifetime makes stages of 20+ concurrent fresh logins from a single
   source machine **mathematically impossible to verify**, not merely risky to attempt — so stages 20,
   40, and 60 are reported UNVERIFIABLE BY DESIGN in `load-testing/REPORT.md`, with the exact evidence
   (a 429 response body, the middleware's own limit constants, a real JWT's `exp` claim). This
   genuinely closes the item this review's punch list left open, with the honest limit on how high a
   single-machine harness can verify stated plainly rather than glossed over.
6. Observability (Section 33) and the full failure matrix (Section 32) were not independently
   research-passed in this review beyond what surfaced incidentally (e.g., the worker Redis publisher's
   missing error listener). Not claimed as verified.

### 7.3 What this review actually did, versus what it's reporting

Per Section 42's instruction to not treat this as theoretical: every SAFE verdict above was backed by
either a re-run adverse/unit test suite (`pnpm test:adverse`: 810/811, 1 pre-existing skip; `pnpm test`:
1020/1027, the remaining 7 explained and confirmed as this machine's own live dev environment
contending for the same Redis queue, not a code defect) or direct code citation with file:line evidence
from dedicated research passes across nine subsystems. One real financial-integrity bug
(P0-CREDIT-1) was found, fixed with the smallest change that preserves the existing architecture (refund
+ terminal transition, mirroring an existing pattern, rather than a new mechanism), given a regression
test, and confirmed GREEN. Two more P0-severity bugs were found, reproduced precisely, and deliberately
left unfixed rather than rushed, per this repository's own stated working style ("do not weaken a
guarantee to make a feature ship... the answer is usually to defer the feature, not the guarantee").

### 7.4 Final verdict

```
PRODUCTION READY WITH ACCEPTED RISKS
```

Updated 2026-09-11 after every P0, P2, and P3 finding closed, and the load-testing gap closed with real
measurements. **All three confirmed P0 financial-correctness defects (P0-CREDIT-1, P0-CANCEL-1,
P0-TIMEOUT-1), the one confirmed P2 security gap (P2-SSRF-1), and all four recorded P3 hardening items
are now fixed and regression-tested** — none remain open. Security posture, authorization, SSRF/sandbox
isolation, AI-provider handling, and the credit ledger's own internal correctness are all genuinely
strong, confirmed by re-run test suites and direct code citation across nine dedicated research passes
plus four independent fix efforts, not asserted from reading alone.

**Performance/load-testing is now measured, not blocked** (`load-testing/REPORT.md`): real, staged runs
at 1/5/10 concurrent audits show 100% delivery and flat ~2.0s completion latency, with no sign of
degradation. The platform's own ~60-concurrent claim remains **unverified above 10**, honestly — not
because of a harness limitation that could be fixed with more effort, but because a real, deliberate
security control (`/auth/login`'s per-IP rate limiter) makes generating that traffic pattern from a
single machine mathematically impossible without either a multi-IP test rig (out of scope here) or
weakening a real security guarantee (refused, per this project's own "do not weaken a guarantee to make
a feature ship" rule). This is reported as an honest boundary on what was verified, not glossed over as
a pass.

Every finding this review's own severity model would treat as a production blocker — all P0s, the one
P1-tier item, and the one P2 — is now closed, and the one previously-open performance item now carries
real evidence in both directions (strong at every level actually tested; honestly unverified above it)
rather than no evidence at all — matching this project's own stated convention (PROGRESS.md's "100% done
does not mean nothing left to decide").

**Remaining punch list:**
1. ~~Stand up a real load-testing harness...~~ — **DONE, 2026-09-11.** See `load-testing/REPORT.md` and
   Section 7.2 item 5 above.
2. A genuine ~60-concurrent-audit verification would require a multi-source-IP load-testing rig (e.g. a
   distributed/cloud-based k6 run) — real, separate follow-up work, not something achievable from one
   dev machine without weakening the real login rate limiter this review already confirmed is
   well-justified.
