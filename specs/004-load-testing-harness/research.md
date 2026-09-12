# Phase 0 Research: Load-Testing Harness and Concurrency Verification

## Decision 1 — k6 via Docker, targeting the host through `host.docker.internal`

**Decision**: Every invocation is `docker run --rm -v <abs-path-to>/load-testing/scripts:/scripts -e BASE_URL=http://host.docker.internal:3001 grafana/k6 run /scripts/golden-path.js` (plus per-stage env vars, Decision 3).

**Rationale**: `grafana/k6` is already pulled and confirmed reachable in this environment (no local k6
binary, no new package). Docker Desktop for Windows (confirmed the platform this session runs on)
resolves `host.docker.internal` to the host automatically — unlike Linux Docker, no `--add-host` flag
or `--network host` (Linux-only) is needed.

**Alternatives considered**: Installing a local k6 binary — rejected, adds a machine-specific
dependency this repeatable runbook shouldn't require; Docker is already a hard prerequisite for this
whole repo (docker-compose for Postgres/Redis) so it adds nothing new.

## Decision 2 — Multiple seeded, already-verified test users on the highest plan tier (not one shared user)

**This corrects an earlier assumption in this same plan, found by reading the real entitlement code
before implementing, not after.** `POST /auth/register` requires email confirmation before `POST
/auth/login` succeeds (`EmailNotVerifiedError` → 403) — a load test has no real inbox, so every test
user must be seeded already-verified directly via Prisma (mirroring this repo's own adverse test
convention: `emailVerifiedAt: new Date()` set directly, never a real email round trip).

**One shared user is not sufficient, and this is a real, confirmed product limit, not a harness
bug.** `assertConcurrencyHeadroom` (`apps/api/src/services/billing/entitlements.ts:189-200`) counts a
user's own non-terminal scans and refuses (`EntitlementError` → 403) once that count reaches
`plan.concurrentScanLimit` — and the *highest* plan tier (`business`, `packages/config/src/
plans.ts`) caps at **6** concurrent scans per user. A single seeded user would hit this real,
by-design entitlement wall at the 10-VU stage already, long before 60 — not a load-testing artifact,
but confirmation that this platform's "~60 concurrent audits" claim is necessarily a multi-tenant
figure (many customers' accounts, not one account running 60 at once), exactly as a real SaaS platform's
capacity claim should be read.

**Decision, revised after a real end-to-end smoke test (not just reading code) found a second,
compounding constraint**: `seed-test-user.ts` seeds **65 distinct users** (margin above the 60-VU top
stage), each on the `business` plan tier with a large, non-expiring credit grant. `golden-path.js` maps
each VU to its **own dedicated user** (`TEST_USERS[__VU - 1]`, k6 VU ids are 1-indexed) — a clean 1:1
mapping at every stage size up to 60, never a shared user across concurrently-running VUs.

**Why 1:1, not the originally-planned 12-users-shared-round-robin**: a manual `curl` smoke test of the
real `POST /targets` endpoint, done before writing the k6 script rather than assumed from reading the
route alone, found that target canonicalization discards the entire path/query string down to the bare
origin (`https://example.com/?vu=1` → stored `canonicalValue: "https://example.com"`, confirmed by the
actual response body) — so the originally-planned "one distinct target per VU via a query-string
suffix" (the original Decision 4) does not produce distinct targets at all; every VU's target
canonicalizes to the identical row **for a given user**. Combined with `assertConcurrencyHeadroom`'s
real per-user `concurrentScanLimit` (confirmed separately, below), several VUs sharing one seeded user
would not only compete for that user's scan-count ceiling but also collide on `Scan_one_active_per_target`
(scoped to **userId+targetId**) the moment two of that user's VUs are both mid-scan against the same
undifferentiated target at once.

**The fix that actually works, confirmed by the same constraint's own scoping**: `Scan_one_active_per_target`'s
uniqueness is a compound key on `(userId, inputType, canonicalValue)` — so *different* users each get
their own independent `Target` row for the identical URL string, with no collision between them at
all. A clean one-VU-per-user mapping sidesteps both constraints simultaneously: no two concurrently
-running VUs ever share a user, so neither the per-user concurrency ceiling nor the per-user-per-target
uniqueness constraint is ever exercised across VUs — each VU is, correctly, indistinguishable from one
real, independent customer's account creating one real target and running one real scan, which is what
a genuine "N concurrent audits" platform-capacity test should model in the first place. Every VU can
now safely target the identical fixed URL (`https://example.com/`) — no per-VU differentiation needed
at the target layer at all, since the user is already the differentiating dimension.

**`assertConcurrencyHeadroom`'s real per-user ceiling** (`apps/api/src/services/billing/
entitlements.ts:189-200`) still confirms the platform-capacity framing is the right one to begin with:
the highest plan tier (`business`) caps a single account at 6 concurrent scans — a real, by-design
limit, not a harness artifact — but is now moot for this harness's own correctness once every VU has
its own dedicated account (1 concurrent scan per account, always ≤ 6).

**Alternatives considered**: 12 shared users with round-robin assignment (the original plan) — found to
be broken by the canonicalization behavior above, not merely suboptimal; raising `concurrentScanLimit`
in the seeded users' plan row instead of adding more users — rejected, mutating plan-tier data to force
a passing number is exactly the "patch around a real limit instead of reporting it" this plan's own
Constitution Check forbids.

## Decision 3 — One k6 script, six scenarios, run one stage per invocation

**Decision**: `golden-path.js` defines the workflow function once; `load-testing/RUNBOOK.md` invokes it
per stage via `k6 run -e STAGE_VUS=<n> golden-path.js`, using k6's `per-vu-iterations` executor
(`vus: <n>, iterations: 1` — each virtual user runs the golden path exactly once, all starting at
approximately the same time, which is what "N concurrent audits" means per spec.md). One invocation per
stage, not all six chained in one script run.

**Rationale**: Running stages as separate invocations (rather than one script with six `scenarios` and
`startTime` offsets) is what makes spec.md FR-009's contention check meaningful — there has to be a
real gap between stages to check `pg_stat_activity` and decide whether to proceed, and a real place to
stop the sequence honestly if the two heaviest stages shouldn't run right now. It also means a stage
that fails or is interrupted doesn't corrupt an in-progress combined run — each stage's
`results/stage-<n>/summary.json` is independently complete once that invocation exits.

**Alternatives considered**: A single script with six `scenarios` — rejected for the reason above (no
natural checkpoint to run the contention check or stop early), and because k6's per-scenario summary
metrics are less immediately attributable to one concurrency level than six wholly separate run outputs.

## Decision 4 — Every VU creates its own target at the same fixed, always-public test URL (no query suffix)

**Decision, revised after the same smoke test that drove Decision 2's revision**: every VU's target
`value` is simply `https://example.com/` — a real, always-public, already-classified-safe address (used
elsewhere in this repo's own tests, e.g. `orchestrator-control-gate.test.ts`). No per-VU query-string
suffix: a real `POST /targets` response, captured during the smoke test, showed `canonicalValue` is the
bare origin regardless of any path/query supplied (`https://example.com/?vu=1` canonicalized to
`https://example.com`) — so a query suffix was never actually producing distinct `Target` rows, only
distinct *inputs*. Distinctness instead comes from Decision 2's one-user-per-VU mapping:
`Scan_one_active_per_target` is scoped to `(userId, inputType, canonicalValue)`, so identical URLs
under different users are already independent rows with no collision.

**Rationale**: Confirmed the address is safe (a real, external, non-loopback site this repo's own tests
already treat as a legitimate live SECURITY-module target) — never a private/loopback address, so the
real SSRF guard is exercised exactly as a genuine user's request would be, per spec.md's own framing
("hits the real safeFetch guard exactly like a real user's target would").

**A real target at default `controlLevel: NONE` runs every real vendored capability** — confirmed by
reading every `packages/capabilities-vendored/*/capability.manifest.json`: all declare
`"requiredControlLevel": "NONE"`. No verification/attestation dance is needed before creating a scan
that will actually execute real code-layer capabilities, unlike the higher control levels some of this
repo's own *test-only* synthetic capabilities require.

## Decision 5 — Capability registry population is automatic; no seed step needed for it

**Decision**: No load-testing-specific step populates the `Capability` table. `apps/api/src/index.ts`
imports and calls `reconcileCapabilitiesAtBoot` (confirmed by reading `apps/api/src/services/
registry/boot.ts`'s own module note: "a scan can be charged for and executed against a capability the
database has never heard of without it [reconciliation]") — starting the real `apps/api` process via
its existing `start` script is sufficient; `packages/capabilities-vendored/`'s manifests are discovered
and reconciled into the database automatically at that point.

## Decision 6 — Custom k6 metrics matching spec.md FR-003 exactly

**Decision**: `golden-path.js` records four custom k6 `Trend` metrics per iteration: `quote_latency`,
`scan_create_latency`, `time_to_first_progress` (first poll response whose `scan.state` is no longer
`QUEUED`), and `time_to_terminal` (first poll response whose `scan.state` is one of
`COMPLETED`/`FAILED`/`CANCELLED`/`TIMED_OUT`) — plus a `Rate` metric for errored/never-terminal
iterations. k6's own built-in `http_req_duration` already gives per-request p50/p95/p99 for every HTTP
call the script makes (login, quote, create, each poll) without extra code, satisfying the "response
time for each step... median and two higher percentiles" half of FR-003 for free.

**Rationale**: These four map directly onto spec.md's named measurements (quote latency, scan-create
latency, "time-to-first-progress-event equivalent", total time-to-terminal) — nothing invented beyond
what the spec explicitly asked to be captured.

## Decision 7 — Contention check before the two heaviest stages, codifying what this session already did by hand

**Decision**: `RUNBOOK.md` includes a literal, copy-pasteable command run before stages 40 and 60:
```bash
docker exec webaudit-postgres psql -U webaudit -d webaudit -c \
  "select pid, state, now()-query_start as dur from pg_stat_activity where datname='webaudit' and pid <> pg_backend_pid();"
```
and a short decision rule: proceed only if this returns no long-idle or actively-busy connections
beyond the load test's own; otherwise wait or stop, and mark the remaining stage(s) UNVERIFIED with
that reason in REPORT.md, per spec.md FR-009/FR-006. This is the exact check this session already
performed by hand (twice) earlier before running its own test suites when a peer session was
contending for the same database — written down here so it's a repeatable procedure, not tribal
knowledge.

## Decision 9 — Stages 20/40/60 are UNVERIFIABLE BY DESIGN from a single source IP, not merely contention-gated

**This is a real finding from actually running stages 1/5/10, not a design assumption.** Stage 10
returned 6 of 10 login failures (`429 RATE_LIMITED`) — investigated rather than dismissed as noise.
Root cause, confirmed by reading `apps/api/src/middleware/ratelimit.middleware.ts:45-56` and by direct
curl evidence: `/auth/login` sits behind a `strict` limiter — **10 attempts per 15-minute window per
client IP** (`STRICT_LIMIT = 10`, `STRICT_WINDOW_MS = 15 * 60 * 1000`), keyed by `clientKey(req)` (the
caller's IP, IPv6 collapsed to a /64). A direct curl recheck of `loadtest-9`/`loadtest-10` reproduced the
exact error: `{"error":{"code":"RATE_LIMITED","message":"Too many requests. Try again shortly.",
"retryAfterSeconds":326}}`, HTTP 429. The arithmetic is exact, not approximate: stage 1 (1 login) +
stage 5 (5 logins) = 6 already consumed in-window before stage 10 requested 10 more — leaving exactly 4
of the 10-per-window budget, matching stage 10's own reported "✓ 4 / ✗ 6" for the `login: 200` check to
the digit.

**Why this is a hard ceiling, not a scheduling problem**: every k6 VU in a single `docker run` invocation
(and every `curl` call from this host) shares one source IP as the API sees it — Docker's outbound NAT
for `host.docker.internal` traffic, or the host's own loopback address. A stage of 20+ VUs performing a
fresh login within one run **structurally cannot** stay under a 10-per-15-minute cap — at least 10 of
any 20+ simultaneous fresh logins will always be refused, regardless of how the run is scheduled or how
quiet the shared machine is. Pre-authenticating tokens ahead of time and reusing them does not route
around this either: the issued JWT's own `exp` claim is exactly `iat + 900` (confirmed from a real
token's payload — 15 minutes), which is *less* time than it takes to legitimately acquire more than 10
tokens at the rate limiter's own allowed pace. There is no scheduling of this harness, from one source
IP, that produces more than 10 users holding simultaneously-valid, freshly-issued tokens.

**Decision**: Stages 20, 40, and 60 are marked **UNVERIFIABLE BY DESIGN** in REPORT.md — a stronger,
more specific finding than the originally-planned "contention, check `pg_stat_activity` and defer"
(research.md Decision 7 still applies and still matters for stages that *can* run, but is not the
limiting factor here). This is reported as a real product/security characteristic worth naming
prominently, exactly as CLAUDE.md requires ("report a real limit, don't patch around it") — not fixed by
disabling or loosening the limiter (a real, well-justified, already-documented anti-brute-force/
CPU-exhaustion control — see the module's own header comment), not fixed by adding a test-only IP
allowlist to product code (forbidden by spec.md FR-005's "no product code changes"), and not
worked around by spreading logins across multiple source IPs (not available in this single dev
machine's environment). Stage 10 itself is re-run in isolation, after the rate-limit window it
originally hit has cleared, to get one clean, uncontended reading at the true boundary of what a
single source IP can validly drive.

**Alternatives considered**: Authenticate once per user in a k6 `setup()` phase spread out to respect
the rate limit, then reuse tokens across the timed stage — rejected once the token TTL vs. rate-limit-
window arithmetic above showed it cannot work at 20+ scale (any pre-authentication pass slow enough to
respect the limiter takes longer than 15 minutes for more than 10 users, so the earliest tokens expire
before the batch completes); running 20/40/60 anyway and reporting the resulting mass-429 rate as if it
were an API/worker capacity finding — rejected as actively misleading, since the failures would reflect
the login rate limiter working as designed, not the platform's real scan-handling capacity under load
(the actual subject of this report).

## Decision 8 — No new runtime dependency; nothing added to `apps/*`'s own `package.json`

k6 runs entirely inside its own Docker container against the already-running host processes over plain
HTTP — no package is added to any workspace. `load-testing/seed-test-user.ts` is run with `tsx`
(already a root dev dependency, same as `scripts/seed.ts`), no new package either.
