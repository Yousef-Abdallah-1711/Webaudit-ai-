# SPEC 008 — Full implementation and verification closure (2026-10-28)

**Specification**: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail
(`specs/008-safety-killswitch-budget-audit/`; numbered 008 in the repo, "Spec 07" internally).
**Verdict: VERIFIED COMPLETE WITH APPROVED EXCLUSIONS for the backend foundation** — all 36 tasks implemented and evidenced.
This is **not** a production-readiness claim (see §27–§28). Labels: VERIFIED / PARTIAL / BLOCKED / NOT TESTED.

## 1. Executive summary
Admission, budget enforcement, leases, the kill switch (host watcher, finalizer acknowledgement, reconciler), lease reclaim
and the execution audit trail are implemented as five new tables plus `SECURITY DEFINER` functions, additive and default-off.
Legacy scans do not call F07. No engine consumes it yet (SPEC 009+). Browser pool defect D-1 is unrelated and still open.

## 2. Starting Git state
HEAD `1b7ea09` (= `origin/main`, ahead/behind 0/0 at start of this implementation pass); pre-existing untracked
`apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-*` and a pre-existing
`pnpm-lock.yaml` change were left untouched and are **not** committed (only my own lockfile hunk is).

## 3. Approved decisions
Owner approved DEC-034/044/045/048/049, Option A each (direction only) — `DECISION_AMENDMENT_2026-10-28_SPEC008_LEVEL1.md`.
The owner then delegated the remaining technical decisions. **Owner-delegated technical decisions (not owner answers)**:
DEC-050 lock order, DEC-063 reclaim, F-02 Q1–Q5, DEC-068 for 008 events — `f02-role-privilege-design.md` §13.
Still open and not decided here: DEC-047, 051, 056/057/058/064, 060 (timing constants are uncalibrated defaults), 061, 032, D-1.

## 4. Contract amendments
`amendments/AMENDMENT-A1.md` (final); frozen contracts carry an appended pointer, original text unchanged.
Deviations from the draft are in F-02 §13 (idempotent replay returns stored outcome; finalizer acks only its own row; two-pass reconciler).

## 5. Architecture review
Findings, all in scope and fixed: (a) cross-tenant `scanId`/`executionId` abuse (lease tagged with another tenant's scan could block that tenant's
reconciler; shared execution id could be stopped across tenants) — fixed in `f07_admit`/`f07_trigger_stop`, tests added;
(b) kill-switch edges and audit immutability were only function-enforced — database triggers added; (c) `requestedAt` was taken before the lock wait — moved after.
Informational: the contradiction register items C-05 (broad-scope STOPPED rows do not block admission) and C-17 are unchanged by 008.

## 6. Requirement traceability
`tasks.md` evidence ledger (36/36). Functional requirements map as: FR-001–005a admission (PG race + role suites); FR-004/006/006a leases/fencing;
FR-007/008 idempotency; FR-010–016 kill switch/authority/reclassification; FR-013/014 5 s bound & escalation (host watcher tests); FR-015 no resurrection;
FR-017 restart recovery; FR-018/019 checkpoint; FR-020–024 audit; FR-026 additive (STATIC: 0 changed existing schema lines, 0 existing migrations modified).

## 7–8. Implementation / migration
New: `apps/api/src/services/safety/*` (9 files), `apps/worker/src/orchestrator/{kill-switch,safety-lease-sweep}.ts`, `packages/config/src/safety-channels.ts`,
enums in `packages/types/src/domain.ts`, migration `20261028120000_add_safety_foundation` (+ `ROLLBACK-M008.sql`). Modified: `revoke.ts`, `classify-environment.ts`
(stop wiring, T022/FR-016), `workers.ts`/`index.ts` (job), test helpers, `apps/api/package.json` (+ `@webaudit/redaction`, export paths).
Migration verified on a fresh database, `webaudit_test`, an isolated runtime DB and the dev `webaudit` DB (86 users / 243 scans unchanged afterwards); backup taken first;
rollback script executed and re-applied (twice). No `migrate dev/reset/db push`. Roles are cluster-level (5 NOLOGIN roles now exist in the shared dev cluster).

## 9. Privilege model — VERIFIED with real non-superuser logins
`safety-role-isolation.test.ts`: 101 tests — direct DML/TRUNCATE denied on the 5 tables for every runtime role; audit table readable only by api, append-only;
the full EXECUTE matrix both directions; cannot `SET ROLE fahes_owner`; cannot create in `public`; shadow temp tables / hostile `search_path` do not change definer functions;
TypeScript services work end-to-end as a non-superuser. **Not claimed**: that the running dev API/worker are isolated (they use the shared superuser).

## 10–14. Behaviour (all PG-verified)
Admission: DB-derived tenant and clock; kill switch → grant liveness → counter lock → idempotent replay → ceilings → writes; fail-closed; no oversubscription (25 callers/5 slots).
Budget: no double consume/release, refusal consumes nothing, caller rollback leaves nothing. Kill switch: authority in the database, uniform refusals, REQUESTED→ACKNOWLEDGED→STOPPED
only (trigger-enforced), STOPPED never while a live in-scope lease remains. Reconciler: two passes, grace, never waits, concurrent-safe. Audit: all 12 event types emitted from real call sites;
payload redaction/sentinel; tenant-scoped reconstruction; rolled-back operations leave no event.

## 15. Worker integration
Repeatable `safety-sweep` BullMQ job registered with the maintenance queue; handler wired in `index.ts`; host-side watcher with escalation. No engine integration (none exists).

## 16. Security findings
Fixed: §5 (a)(b)(c). Mutation testing (6 mutants: no counter lock, reconciler ignoring live leases, `recordStopped` ignoring live leases, renewal ignoring a pending stop,
reconciler skipping the ack, reclaim ignoring expiry) — every mutant killed by a named test. Remaining risks: §27.

## 17–20. Automated tests (exact commands: `pnpm test`, `pnpm test:adverse`, `pnpm typecheck`)
| Evidence | Result |
|---|---|
| Unit project (U/C/I + DB-backed, `pnpm test`) | **229 files, 1568 passed, exit 0** (baseline 224/1505) |
| Adverse project (`pnpm test:adverse`) | **70 files, 1092 passed, 1 skipped (known Windows file-symlink skip), exit 0** (baseline 64/930/1) |
| `pnpm typecheck` | 30/30 tasks successful |
| ESLint + Prettier on the 33 changed TS files; `prisma validate` | clean / valid |
| Earlier mid-session full unit run | 5 failures in 2 files, both caused by this work (new enums not in the drift guard; a mock transaction lacking the new stop call) — fixed by mirroring the enums in `packages/types` and updating the fake; re-run green |
Repo-wide `pnpm lint:code`/`format:check` were not re-run; the project's pre-existing Prettier drift was not touched.

## 21–23. Real PostgreSQL / Redis / worker runtime
PG: all suites above use real PostgreSQL with real concurrent connections. REDIS: stop publish → watcher wake < 2 s with the poll set to 5 s; malformed message ignored.
**WORKER (real process, real BullMQ/Redis DB 9, real PG `webaudit_m008_rt_test`)**: a crashed holder's lease was reclaimed within ~1 s; the stop stayed REQUESTED for 12 s (≥2 sweeps)
while a live lease remained; after authority release the worker acknowledged (+3 s) then recorded STOPPED (+5 s); counter 0; SYSTEM audit trail
`STOP_REQUESTED, BUDGET_RELEASED(RECLAIMED_EXPIRED), STOP_ACKNOWLEDGED(RECONCILED), STOPPED(RECONCILED)`. Redis DB 9 was verified empty beforehand and flushed afterwards (own keys only).

## 24. Browser QA
**Playwright CLI (real Chromium 151, not MCP)**: full suite `npx playwright test --workers=1`: **93 tests, 92 passed, 1 failed** (38 min) — the failure is
`admin/plan-and-credit-journey.spec.ts:69` `getByText('Plan credits')` strict-mode violation (two elements, table header and detail term, both present at committed HEAD; no `apps/web`
file changed by this work) — pre-existing, not fixed, not caused by SPEC 008. **Playwright MCP was unavailable** (browser profile locked by another instance; not touched).
Manual check with Chromium via the Playwright library against the restored dev site: `/` and `/login` at 1440 and 390 px: HTTP 200, no horizontal overflow, only expected 401s for the logged-out session check; screenshots in the session scratchpad.
SPEC 008 has no UI and no HTTP route, so no SPEC 008 behaviour is browser-visible; backend-only behaviour is evidenced by §21–§23. The dev web server (port 3010) was stopped for the e2e build and restored with `NEXT_PUBLIC_API_URL=http://localhost:3011` (HTTP 200).

## 25. Performance (microbenchmark, **not k6**, single laptop, Prisma pool)
Admission+release sequential n=100: p50 19 ms, p95 21 ms, p99 25 ms. 8 concurrent workers × 40 on one grant (320 admit+release): all granted, p50 43 ms, p95 74 ms, p99 179 ms,
≈113 admit+release/s; counters consistent (consumed 430 = 10+100+320, 0 live leases). Mixed-operation stress (admit/renew/release/stop/reclaim/reconcile) produced zero errors/deadlocks.
**NOT TESTED**: k6 load stages, PgBouncer transaction-pooling path, Redis/PG outage injection beyond lock-timeout and proxy failures, multi-replica sweeps, capacity claims.

## 26. Cross-spec regression
Full unit + adverse suites include SPEC 001–007 suites (credits/refund, cancellation, SSRF/safe-net, authorization/control-gate, enum drift): all green. Revocation and reclassification (SPEC 007 paths) now also request a stop; their existing audit-row tests pass.
Legacy scans/credits/cancellation paths untouched (STATIC: no edits). E2E 92/93 as §24.

## 27. Open defects and limits
- **D-1 browser pool not wired** — unchanged, HIGH, blocks production readiness; decision packet still owed (transport; not-measured vs DEGRADED; DEC-061/032).
- Pre-existing e2e locator failure (§24).
- Dev API/worker still run as the shared superuser: **no isolation in effect for the dev stack**.
- Until SPEC 009, leases are the only liveness evidence (a leaseless running unit relies on its own acknowledgement + 30 s grace); identity derived from Target/grant, not a claimed unit.
- SQL-level `isAuthorized` port deferred to SPEC 009/012 wrappers (AR-19); admission by non-TypeScript callers is not provided.
- Timing constants (30 s lease, 60 s sweep, 30 s ack grace, 5 s bound) are uncalibrated defaults (DEC-060).
- Roles are cluster-level and created by the migration; production managed-DB capability (EV-07) is UNKNOWN.

## 28. External blockers
Production role/login provisioning and PgBouncer per-role pooling (operations); EV-07.

## 29. Coverage matrix (requirement level; **no instrumented coverage is available** — no coverage provider is installed, so no percentages are claimed)
Every task row in `tasks.md` names its tests. Uncovered by design: real sandbox-runner SIGKILL via `onEscalate` (hook only), real multi-process worker crash (simulated by dropping the watcher and a fresh client), production roles.

## 30. Final verdict
VERIFIED COMPLETE WITH APPROVED EXCLUSIONS (exclusions: SQL `isAuthorized` port, engine integration, production role rollout, k6/PgBouncer/outage performance evidence, Playwright MCP).

## 31–33. Git, push, next
Commits and push verification are recorded in the final handoff message and `git log`. Next specification: SPEC 009 (needs DEC-047/051/066, U-1b approval).
