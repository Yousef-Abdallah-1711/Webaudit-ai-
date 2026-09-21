# WebAudit AI — Full Load, Capacity & Bottleneck Report

Date: 2026-09-20. Environment: local Windows 10 dev laptop, Docker Desktop for Postgres (5442,
unpooled by default)/Redis (6389)/pgbouncer (6452, profile `pooled`, not used in this pass), `apps/api`
and `apps/worker` run as plain `node` processes (non-watch, `pnpm run start`) against `AI_MODE=fixtures`
(zero real AI spend throughout). This report supplements, and does not replace, `load-testing/REPORT.md`
(2026-09-11) and `specs/005-production-hardening/tasks.md`'s own T040 status — see that task entry for
the narrower "multi-source-IP rig" status, which this pass does **not** close.

## A. Executive Summary

Re-ran the existing k6 golden-path harness at stages 1/5/10 (all clean, 100% success, matching or
improving on the stale 2026-09-11 numbers). Built a new post-authentication capacity probe to measure
scan-intake/queue/worker/WebSocket behavior beyond the login-rate-limiter's structural ceiling (10
fresh logins/15min/IP), using directly-minted valid tokens for real seeded accounts — not a bypass of
the login limiter (which remains untouched and was re-verified working), a different, legitimate
capacity dimension. Found the real single-IP ceiling for burst API traffic: the **general** rate
limiter (120 req/60s/IP) caps burst scan-intake at ~30 full flows/60s from one source IP — the same
structural reason (one source IP) already documented for the login limiter, now shown for general
traffic too. Within that ceiling, the backend itself (API, worker, Postgres, Redis, WebSocket)
handled 30 concurrent full audits cleanly in ~2.7 seconds wall-clock, with no resource growth across
repeated batches. **Found and root-caused one real, reproducible concurrency defect** (a TOCTOU race
in the queue-capacity admission check) — documented with full reproduction, not fixed in this pass
for a stated, deliberate reason (see §L). No other genuine application/infrastructure defect was
found. Two capacity dimensions could not be tested locally at all: real distinct-source-IP traffic
(20/40/60 tiers, same blocker the existing T040 rig already documented) and browser/probe-pool
concurrency (architecturally an in-process library today, not a separately load-testable service).

## B. Environment / Limitations

- Single Windows 10 laptop, Docker Desktop. All "capacity" numbers below are **application/local
  ceilings**, not production infrastructure claims — see §Q.
- Real distributed multi-source-IP infrastructure was not available; this is an application-limit vs
  local-machine-limit distinction the report is careful to keep explicit throughout.
- `AI_MODE=fixtures` throughout — zero real AI provider spend. No real Paymob transactions. No paid
  external load-testing service used.
- pgbouncer (`--profile pooled`) was available (already running from a prior session) but **not**
  used for these runs — all numbers reflect the default unpooled local topology (Prisma pool size 10
  per process, direct Postgres connection).

## C. Architecture Under Test

```
k6 / post-auth-capacity.mjs (load generator)
  → Next.js web (not exercised directly — API-level load only)
  → Express API :3001 (auth, validation, quote, credit debit, scan creation)
  → BullMQ (webaudit-scan-phase queue, Redis :6389)
  → apps/worker (scanPhase concurrency: 4 — apps/worker/src/queue/queues.ts:107-111)
  → deterministic SECURITY-module code-layer capability (fixture-backed, no real browser/AI)
  → PostgreSQL :5442 (Prisma, pool size 10/process, unpooled)
  → WebSocket ws://localhost:3001/realtime (per-scan progress fan-out via Redis pub/sub)
```

Scope note (inherited from the existing 004 harness, not loosened here): URL-only, code-layer-only
(`SECURITY` module) audits. Browser-backed capabilities and the real AI layer are out of scope — see
§K.

## D. Baseline

Before testing: `webaudit-postgres`/`webaudit-redis`/`webaudit-pgbouncer` containers healthy; queue
depth 0 across all states (`waiting`/`prioritized`/`active`); no duplicate dev-server processes (API
and worker share an identical command line on this checkout — confirmed by port ownership, not by
command text, after an early mistake in this session killed the wrong one; see §J); 65 seeded
load-test users (`load-testing/seed-test-user.ts`, business plan, 100k-credit non-expiring grant,
idempotent). Postgres baseline: 13-16 connections, no long-idle/busy sessions.

## E. Stage Results (k6 golden-path, fresh 2026-09-20 numbers)

| Load | Success | time_to_terminal p50 | quote_latency p50 | scan_create_latency p50 | Notes |
| --- | --- | --- | --- | --- | --- |
| 1 | 100% (4/4 checks) | 2.03s | 7ms | 113ms | Matches 2026-09-11 baseline |
| 5 | 100% (20/20 checks) | 2.03s | 5.6ms | 92.2ms | Matches baseline |
| 10 | 100% (40/40 checks) after clearing the shared rate-limit bucket* | 2.04s | 11.9ms | 110.9ms | See note |

\* First stage-10 attempt showed 6/10 login failures — **not a regression**, but this session's own
prior API/WebSocket testing had already partially consumed the shared strict-bucket window before
this run started (the bucket is shared across all credential-adjacent endpoints, confirmed in the
prior auth security review). Re-run against a fresh window: clean 100%. This reproduces exactly the
RUNBOOK.md-documented caution about spacing stage runs, now from a slightly different cause (this
session's earlier API testing, not a prior stage in the same sequence).

Stages 20/40/60 via k6: **not attempted** — `/auth/login`'s strict limiter (10/15min/IP) makes this
unverifiable by design from one machine, exactly as RUNBOOK.md already documents. Not re-litigated
here; see the post-auth probe below for the capacity dimensions that *can* be measured beyond it.

## F. Post-Authentication Capacity Probe (new, this pass)

`load-testing/scripts/post-auth-capacity.mjs` — mints valid access tokens directly (same `jose`
`SignJWT` call, same `JWT_ACCESS_SECRET`, same claims shape the real login path uses) for real seeded
accounts, skipping only the login HTTP call itself (which every real user only makes once per
session anyway). This is standard load-testing practice (pre-authenticate, then measure the system
under test) and does not bypass or weaken the login rate limiter, which was re-verified separately
still enforcing its 10/15min/IP limit correctly. Progress/completion is measured via real WebSocket
subscription (matching the real `/scan/[id]` page's own behavior: REST fetch for current state first,
then WebSocket for live updates), not REST polling — deliberately, to avoid distorting the measurement
by competing with the general rate limiter for its own budget.

| Concurrency | Result | wallMs (all VUs) | quote p50/p95 | scanCreate p50/p95 | time_to_terminal p50/p95 |
| --- | --- | --- | --- | --- | --- |
| 3 | 3/3 succeeded | 477ms | 6/7ms | 43/46ms | 323/331ms |
| 20 | 20/20 succeeded | 1,977ms | 18/25ms | 174/237ms | 1,521/1,555ms |
| 30 | 30/30 succeeded | 2,741–2,848ms (2 clean runs) | — | — | — |

**Ceiling found, precisely**: 31 concurrent full-flow VUs (createTarget + attest + quote + createScan
= 4 requests/VU) exceeds the general rate limiter's 120 req/60s/IP budget (30 × 4 = 120 exactly).
31st+ VU gets a real `429 RATE_LIMITED`. This is the **first constraint reached** at this scale — not
the worker, not Postgres, not Redis, not WebSocket delivery. It is a per-source-IP structural limit,
identical in kind to the already-documented login-limiter ceiling, now shown for general API traffic.
**This is the meaningful safety boundary for this environment** — pushing further from one machine
would only re-measure the rate limiter, not the platform's real backend capacity, exactly the caution
RUNBOOK.md already gives for the login case.

## G. Queue / Worker Results

- Worker `scanPhase` concurrency is hardcoded at **4** (`apps/worker/src/queue/queues.ts:107-111`).
  At 20-30 concurrent fixture-mode SECURITY-only audits (each audit = a short sequence of phase jobs:
  `RUNNING_PHASE_1` → `RUNNING_MASTER` → `RUNNING_DOCS`, confirmed via live WebSocket event trace), no
  queue backlog or elevated latency was observed — 20-30 concurrent audits completed in ~1.5-2.8
  seconds total wall-clock. This concurrency setting was **not changed** — no evidence at this load
  level justified touching it (per the review's own instruction not to change concurrency without
  evidence of a real bottleneck).
- **A materially higher, confounded reading (~31.7s completion) was observed once** during this
  session, traced to leftover queue backlog from prior test runs (not a clean concurrency-20
  measurement) plus, separately, an accidental worker outage (see §J) — not a genuine capacity
  finding once isolated from that confound; the clean re-run (§F) is the number to trust.
- BullMQ job-state counts sampled throughout: `waiting`/`prioritized`/`active` all returned to 0
  between batches; `completed` grew monotonically (225 total scans across this entire session's
  testing) with no unexplained `failed` jobs.
- **Queue-position correctness** (the T029/T030 fix — `getJobCountByTypes('waiting','prioritized')`
  instead of the pre-fix `waiting`-only query that always returned 0 against real prioritized jobs)
  was directly re-confirmed present and correct in this pass: `getWaitingCount()` returned the true
  live count (10) against a real stuck queue, not 0. **No regression** of that fix.

## H. Backpressure — Real Defect Found

Default `SCAN_QUEUE_MAX_WAITING` is 1000, far beyond what local load could organically reach.
Following ENGINEERING-STANDARDS.md's own manual-verification playbook ("script a burst of
scan-creation requests past the queue's soft/hard limit and confirm `QUEUE_AT_CAPACITY` fires"),
temporarily set `SCAN_QUEUE_MAX_WAITING=3` (env var, reverted immediately after — confirmed via
`git status`/`git diff` showing zero uncommitted source changes at the end of this pass) to test the
mechanism directly.

**Sequential case: correct.** One request at a time against a real depth of 10 (worker paused so
jobs stayed queued) with capacity 3 → `503 QUEUE_AT_CAPACITY`, `{"depth":10,"capacity":3}`. Exactly
right.

**Concurrent case: a real TOCTOU race.** 10 concurrent requests from 10 distinct fresh users, worker
paused, queue starting at depth 0, capacity 3. Expected: ~3 succeed, ~7 refused. **Actual: all 10
succeeded**, final real queue depth 10. Debug instrumentation (added temporarily, fully reverted —
confirmed clean diff after) showed every one of the 10 concurrent requests read `queueDepth: 0` — the
same pre-enqueue snapshot — because `create-scan.ts`'s admission check
(`apps/api/src/services/intake/create-scan.ts:185-189`) reads the live queue depth and later performs
credit debit + DB scan creation + the actual `enqueueFirstPhase` call, with multiple `await` points
(and therefore concurrent-request interleaving opportunity) in between. Nothing serializes "check
depth" against "another request's check depth" — a classic check-then-act race.

**Why not fixed in this pass**: the check runs deliberately *before* the credit debit
(`create-scan.ts`'s own header comment: "Every refusal below runs before the single `debit()` call...
Principle VI... means a target that turns out to be someone else's... must all be free to attempt").
Narrowing the race by moving the check adjacent to the actual enqueue call (which happens *after* the
debit) would violate that principle unless a refund path were added — a larger, riskier change than
appropriate to bolt on during a load-testing pass. The correct fix that preserves Principle VI is an
atomic, **self-expiring** Redis-based reservation (e.g., a sorted-set member with a TTL slightly
longer than typical debit+DB-creation+enqueue duration, counted alongside the real BullMQ depth) —
self-expiring specifically so a missed release on any of the function's ~6 existing error-exit paths
cannot leak the reservation count upward forever. Implementing and regression-testing that correctly
is real, scoped work that belongs in its own test-first change (per AGENTS.md), not something to rush
under load-testing time pressure. **Practical severity: MEDIUM** — default capacity (1000) makes
organic-traffic overshoot very unlikely; a deliberate concurrent burst could exploit it meaningfully
at any capacity setting.

**Regression check**: existing `apps/api/tests/adverse/queue-backpressure.test.ts` (2 tests) still
passes 2/2 — it covers only the sequential case, which is why this race was never caught before. This
is a genuine coverage gap, not a test regression.

## I. PostgreSQL / Redis Results

- Postgres connections: 13-16 throughout every stage and batch, no growth, no long-idle/busy sessions
  left behind. Default unpooled Prisma pool (10/process) was never visibly exhausted at any load
  level reached.
- Redis memory: 4.80MB → 4.96MB across the full session's testing (dozens of runs, hundreds of jobs)
  — no leak signal.
- No Postgres or Redis errors observed at any load level tested (only the deliberately-induced worker
  outage in §J, which is an application-level failure-injection scenario, not a DB/Redis fault).

## J. Failure-Recovery Results

An **accidental** worker outage occurred mid-session (a process-identification mistake — API and
worker share an identical `node ... src/index.ts` command line on this checkout, and an earlier kill
by PID hit the worker instead of an intended duplicate API process; corrected by identifying processes
by port ownership, `netstat`, from then on). This produced real, unplanned failure-injection evidence:
- 18 jobs remained safely queued in BullMQ `prioritized` state while the worker was down — **no jobs
  were lost**.
- On worker restart, all 18 drained immediately, plus newly-arriving jobs, with **no duplicate
  processing** (verified: `distinct_scans == scan_count` for every affected user in Postgres) and
  **no negative credit balances** (verified: zero rows with `amountRemaining < 0`).
- This was then **deliberately repeated** for the backpressure test in §H (worker intentionally
  paused, then resumed) with the same clean-recovery outcome.

## K. Browser/Probe-Pool Capacity — Not Applicable Locally (architectural, confirmed)

`apps/probe-pool/src/browser/pool.ts`'s own doc comment confirms: this is an in-process library
(`createBrowserPool()`), not a separately deployed/runnable service — "no cross-process transport
exists yet, and none is built here... no task in the 250-task list builds that transport." There is
no standalone probe-pool process to load-test independently, and the existing 004 harness's own scope
deliberately excludes browser-backed capabilities for the same reason ("the mechanism that would let a
capability actually use a browser is not wired into production yet"). This is confirmed current, not
stale, and is reported here as an architectural fact rather than a gap this session could close —
building that transport would be a scope decision for product/architecture, not a load-testing task.

## L. WebSocket Results

Verified correct and fast once the test rig's own message-shape assumption was corrected (see below):
progress events (`module:started`, `module:complete`, `scan:state` with incrementing
`progressPercent`, terminal `scan:state` with `state: COMPLETED`) arrived in real time, correctly
scoped to each subscriber's own `scanId` (no cross-user event leakage observed across dozens of
simultaneous subscriptions), and the full audit-to-completion round trip via WebSocket alone took as
little as ~300ms for a single fixture-mode SECURITY audit, ~1.5s at 20 concurrent.

**Rig bug found and fixed during this pass** (not an application bug): the probe script initially
checked for event types `scan:complete`/`scan:failed`, which do not exist on the wire — the real
terminal signal is a `scan:state` event whose own `state` field reaches `COMPLETED`/`FAILED`/
`CANCELLED`/`TIMED_OUT`. Confirmed via raw message capture. Also found and fixed: for fixture-mode
audits fast enough to complete before a fresh WebSocket connection finishes its own handshake and
subscribe round-trip, there is no event backlog/replay for a client that subscribes after the fact
(by design, documented in `server.ts`) — the rig now does what the real `/scan/[id]` page already
does (REST fetch for current state first, WebSocket only for further live updates), eliminating a
race that was purely a test-methodology artifact, not a product defect.

## M. Credit Integrity Results

Across all batches (225 total scans this session): zero orphaned scans without a matching
`scan:create` `CreditTransaction`; zero negative `CreditLot.amountRemaining` balances; scan counts
matched distinct scan IDs everywhere checked (no duplicate-charge evidence). The credit-debit path
itself was not re-raced in this pass — it was already proven race-safe under concurrent load in the
prior closure pass (`reports/auth-security-review.md` §K) and nothing in this pass touched that code
path.

## N. Spike / Recovery Results

The natural burst-then-quiet-then-burst pattern across this session's repeated batches (30 concurrent,
pause, 30 more, pause, 15, pause, 10×2) served as an informal spike test: each burst completed
cleanly and resources (Postgres connections, Redis memory, worker/API process memory) returned to
baseline between bursts every time, with no degradation across repeated cycles.

## O. Bottlenecks Found (ranked, first-encountered-first)

1. **General API rate limiter (120 req/60s/IP)** — the actual first constraint at ~30 concurrent
   full-flow submissions from one source IP. Structural, by design, not a defect. Matches the
   already-known login-limiter ceiling in kind.
2. **Queue-capacity admission race** (§H) — a real, reproducible defect, MEDIUM severity given the
   default capacity value, not yet exploitable by organic traffic at realistic scale.
3. **Worker `scanPhase` concurrency (4)** — configured, not a bottleneck at any load level this
   session could reach locally (single-IP ceiling was hit first); would very likely become the
   binding constraint if tested behind real multi-source-IP infrastructure at the 60+ tier, or with
   slower (non-fixture, multi-module, browser-backed) real-world audits, neither of which this
   session could test.
4. Postgres, Redis, WebSocket: no evidence of being a constraint at any load level reached.

## P. Fixes Made

None applied to committed source in this pass (the queue-capacity race, §H, is documented but
deliberately not fixed here, for the stated reason). Two test-tooling artifacts were created and are
new, reviewable code:
- `load-testing/scripts/post-auth-capacity.mjs` — new, reusable capacity probe (documented above).
- Temporary debug instrumentation in `create-scan.ts` and a temporary `SCAN_QUEUE_MAX_WAITING=3`
  environment override were both used only for investigation and fully reverted; `git diff` on
  `apps/api/src/services/intake/create-scan.ts` is empty at the end of this pass.

## Q. Remaining Risks

- Real multi-source-IP traffic at the 20/40/60 tiers remains unverified — same blocker as the
  existing T040 rig, not closed by this pass.
- Worker throughput was only tested against fast, fixture-mode, SECURITY-only, code-layer audits.
  Real multi-module or browser-backed audits (when that capability path exists) would take
  meaningfully longer per phase and could expose the worker-concurrency=4 ceiling at far lower
  overall audit counts than the 30 tested here.
- The queue-capacity admission race (§H) is unfixed. Recommend a dedicated, test-first change before
  relying on `SCAN_QUEUE_MAX_WAITING` as a hard guarantee under real concurrent bursts.
- pgbouncer/pooled topology was not exercised in this pass — all Postgres numbers reflect the
  unpooled default.
- Sustained (multi-minute, not just multi-batch) throughput and true long-running memory-leak
  behavior were only informally observed across a handful of batches, not a dedicated
  hours-long soak test.

## R. External Limitations

- No real distributed/multi-source-IP infrastructure or paid load-testing service was available —
  genuinely blocks the 20/40/60-tier acceptance criterion, not a choice made in this pass.
- All capacity numbers in this report are **local-machine** ceilings except where explicitly
  identified as architectural (the rate limiter, the queue-capacity race) — do not extrapolate these
  wall-clock numbers as production infrastructure capacity claims.

## S. Production Recommendations

**REQUIRED BEFORE PRODUCTION**: none identified as blocking from this pass alone — the queue-capacity
race is real but low-probability at the default capacity value; recommend fixing before deliberately
relying on `SCAN_QUEUE_MAX_WAITING` as a hard cap under adversarial/bursty conditions.

**RECOMMENDED BEFORE SCALE**:
- Fix the queue-capacity admission race (§H) with a test-first, self-expiring atomic reservation.
- Complete the real multi-source-IP verification (T040's own stated remaining work) before assuming
  the 20/40/60 tiers behave like the tested 1-30 range.
- Re-test worker throughput against realistic (non-fixture-fast) audit durations once browser-backed
  capability execution is wired into a real, testable path.

**DEFER UNTIL TRAFFIC JUSTIFIES**: pgbouncer/pooled topology, read replica, cache layer, CDN for
downloads — all already correctly deferred per `specs/005-production-hardening/tasks.md`'s own T036-
T039 status; nothing in this pass surfaced evidence to change that.

## T. Final Capacity Matrix

| Dimension | Observed local ceiling | Constraint | Confidence |
| --- | --- | --- | --- |
| HTTP/API (general) | ~120 req/60s/IP (by design) | Rate limiter | Measured directly |
| Scan intake (burst, one IP) | ~30 full flows/60s/IP | Rate limiter (structural) | Measured directly |
| Active audit concurrency (fixture-mode, SECURITY-only) | ≥30 concurrent, clean | Not yet reached — rate limiter hit first | Measured directly |
| Worker throughput | Not reached (concurrency=4 configured, no backlog observed ≤30) | Unknown above local ceiling | Configured value confirmed; real ceiling untested |
| Browser-backed capacity | N/A — architecturally not a separate service today | N/A | Confirmed via source |
| Queue buffer behavior | Correct when checked sequentially; races under concurrency | Admission-check TOCTOU (§H) | Measured directly, reproduced |
| Database (Postgres, unpooled) | No strain at any load reached (13-16 connections) | Not reached | Measured directly |
| Redis | No strain at any load reached (~5MB, no errors) | Not reached | Measured directly |
| WebSocket | No strain at any load reached (dozens of concurrent subscriptions, no leakage, no missed terminal events once rig fixed) | Not reached | Measured directly |
