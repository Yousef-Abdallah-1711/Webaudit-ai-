# SPEC 009 — current status audit and next execution plan

Audit date: 2026-10-29. Method: read-only. No source, schema or migration was changed by this audit and nothing was committed or pushed by it. Evidence tags: **[DEV]** = re-run on this device during this recovery; **[DOC]** = taken from the other agent's dated reports in this directory, not re-run here; **[SRC]** = verified by reading the current source.

## A. Executive summary

SPEC 009 is **NOT COMPLETE**. The service layer is built and the baseline is healthy: on this device the full serial unit/contract/integration run passed (**241 files, 1,873 tests, exit 0**) and the full adverse run passed (**73 files, 1,153 passed, 1 skipped, exit 0**). What is missing is production integration, not component code: **`resolvePlan` has no production caller** [SRC: only defined in `apps/api/src/services/planning/resolver.ts:123`], **the production worker registers no execution adapters** [SRC: `apps/worker/src/index.ts:407` gates every execution queue/worker on `adapters.length > 0`, and `startWorker()` at the entrypoint passes none], so non-passive units can only run through the deterministic test adapter. The legacy scan path is unchanged (FR-040 holds).

Recalculated totals (this audit): **49 FR items: 2 verified invariants · 28 implemented-and-tested · 16 partial · 0 not implemented · 3 N/A. 8 SC: 2 · 5 partial · 1 N/A. 28 DoD gates: 11 PASS · 17 PARTIAL · 0 FAIL/BLOCKED. Tasks: 49 ids, 48 checked, 1 open (T-U1-10).** The other agent's tally line (27 tested / 17 partial) disagrees with its own per-row table (28 / 16); the per-row table is correct.

Recovery is **not fully closed** (see §C): no recovery handoff document exists and the standalone real-Chromium smoke test was not done. The full Playwright E2E finished green (93/93, §K).

## B. Current Git state [DEV]

| Item | Value |
|---|---|
| Repository | `Yousef-Abdallah-1711/Webaudit-ai-` (`origin` URL verified) |
| Branch | `main` |
| Local HEAD | `8aa5fc2b1a18fc97ffd7837237d9a6c16f66495e` |
| Remote HEAD (`git ls-remote`) | `8aa5fc2b1a18…` (equal), ahead/behind 0/0 |
| History | local `main` was fast-forwarded 20 commits from `96df6fe`; no divergence, no conflicts |
| Tracked, modified, uncommitted | `apps/api/src/services/evidence/materialize.ts`, `apps/api/tests/helpers/runtime-fixtures.ts`, `apps/web/tests/e2e/onboarding/first-audit.spec.ts` — Prettier-only reformatting made during recovery (the 3 files that failed formatting AND were touched by SPEC 009 work); 238 affected tests re-ran green. `pnpm-lock.yaml` modified is the owner's. |
| Untracked (owner's, untouched) | `apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-*` |

## C. Recovery completion status

| Recovery item | Status | Evidence |
|---|---|---|
| Repository identity / sync | DONE [DEV] | §B |
| Dependencies | DONE [DEV] | `pnpm install --frozen-lockfile` OK; prisma schema valid |
| Fresh migration chain | DONE [DEV] | 35 applied, 0 failed, six `fahes_*` roles on a disposable DB |
| Typecheck | DONE [DEV] | 30/30 packages |
| ESLint | DONE with scope note [DEV] | tracked source exit 0; the only 2 errors are the owner's untracked scratch scripts (not in a tsconfig project), excluded by CLI flags only |
| Design-adherence lint | DONE [DEV] | 0 warnings / 0 errors |
| Prettier | PARTIAL [DEV] | 87 tracked files fail on committed content (not line endings): 84 older debt, 3 introduced during SPEC 009 work (now fixed, uncommitted). Repo-wide check is **red** from the 84. |
| Full unit/contract/integration | DONE [DEV] | 241 files / 1,873 tests / exit 0 / 861 s, isolated PostgreSQL+Redis, with `EXEC_TEST_REDIS` set |
| Full adverse | DONE [DEV] | 73 files / 1,153 passed / 1 skipped / exit 0 / 425 s; includes CORE-01 real-login role suite 24/24 and SPEC 008 role isolation 116/116 |
| Full Playwright E2E | DONE [DEV] | 93 passed, exit 0, 28.1 min, isolated PG+Redis |
| Real-Chromium smoke test | **NOT DONE** | Phase G journeys not executed on this device |
| Standalone API+worker+web stack, graceful restart | **NOT DONE** | E2E boots its own services in-process only |
| Visual project, coverage | **NOT RUN** | |
| Recovery handoff document | **MISSING** | `docs/handoffs/` does not exist |
| Environment incident | NOTED | Docker Desktop's engine stopped at ~19:41 and killed the first test run's database; restarted, re-ran clean. A first relaunch also lacked `EXEC_TEST_REDIS` (a test deliberately refuses to run without a disposable Redis) — environment, not a defect. `localhost` resolves unreliably to Docker's IPv6 proxy for Prisma; `127.0.0.1` is stable. |

Before implementation resumes: write the recovery handoff, run the Chromium smoke test and a stack start/stop check, and decide whether to commit the 3 formatting edits.

## D. Specification and amendment baseline [SRC]

`specs/009-core-scan-execution-platform/`: `spec.md` (FR-001…047 plus FR-022a and FR-027a = **49 FR items**; SC-001…008), `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, 11 contracts, `checklists/`, `amendments/AMENDMENT-U1B-v6.md`, `amendments/ROLLBACK-M009.sql`. Owner approvals recorded 2026-10-29: DEC-047 A, DEC-051 A, DEC-066 A (in principle; v6 drafted and consistency-checked); history v1–v5 preserved under `docs/audits/fahes-master-audit/remediation/`. Statuses (headers): 006 Draft; 007/008/009/010 "planning complete — frozen"; 011 frozen; 012 planning complete, not frozen. Implementation: 007 and 008 implemented; 009 partially; 010–012 not started.

## E. Architecture and runtime wiring

Intended flow vs actual production wiring:

| Stage | Exists | Wired to production | Test-adapter only | Notes |
|---|---|---|---|---|
| Authentication, target authorization (F01) | yes | **yes** (legacy path) | — | unchanged |
| Scan request (`create-scan.ts` / `/scans`) | yes | **yes — legacy only** | — | does not call the resolver or create plans [SRC] |
| ScanConfiguration / profiles | `planning/scan-configuration.ts:91`, `profiles.ts:95` | **no caller** | tests | no profile seeding found |
| Plan resolution | `planning/resolver.ts:123` | **no production caller** | tests | FR-005, FR-029 |
| ExecutionUnits/graph/schema | CORE-01 + 10 follow-up migrations | schema applied; no production writer | tests | |
| Queue topology / producers | `worker/src/execution-runtime/queues.ts:131`, `config` `EXEC_QUEUE_NAMES` | **only when `adapters.length > 0`** (`index.ts:407`) | yes | API never enqueues |
| Worker consumption + host | `execution-runtime/host.ts:90`, `process-child.ts`, `child-entry.ts` | gated as above | yes | per-unit child process, parent-mediated IPC [DOC] |
| Engine adapters | seam `adapter.ts` | **none registered** | `tests/helpers/test-adapter.ts` | SPEC 010–012 |
| Safety (F07) admission/kill switch | SPEC 008 | yes in runtime path | yes | |
| Progress events | `execution-runtime/progress.ts:155` (publish + snapshot), `GET /scans/:id` plan snapshot (`scans.routes.ts:318`), `web/.../ScanProgress.tsx` | read path wired; publisher only fires from the host | yes | reconnect/ordering/auth unverified |
| Finalizer | `fahes_finalize_unit` + `execution-runtime/finalize.ts:33` | yes (used by host and sweep) | yes | privilege fixes in migrations |
| Plan-unit gate | `plan-gate.ts:40` + `planGate` in worker `index.ts:333` | **wired** (answers `no-plan` for legacy) | | |
| Planned sweep / self-heal | `worker/src/orchestrator/planned-sweep.ts:41` | **wired** into the timeout sweep | | no plans exist in production |
| Evidence / artifacts / materialization | `evidence/evidence.ts:55`, `artifacts.ts:65`, `materialize.ts:59` | no production writer (no engines) | yes | |
| Retention + reaper | `storage/retention.ts` (transaction), `artifact-reaper.ts:40` | **wired**; `artifactStore` is `null` without R2 credentials | memory store | |
| Coverage summary (FR-039) | `materialize.ts:149` | **not consumed** by report read/UI | | |
| Reverify via plans (FR-029) | resolver supports REVERIFY | **runner still legacy** | | |

## F. Complete requirement matrix (49 FR + 8 SC)

Paths: `PLAN`=`apps/api/src/services/planning/`, `RT`=`apps/api/src/services/execution-runtime/`, `EV`=`apps/api/src/services/evidence/`, `WK`=`apps/worker/src/`, `TESTS`=`apps/api/tests/unit/planning/` unless stated. IAT = IMPLEMENTED AND TESTED; VC = VERIFIED COMPLETE; "gap" names what production wiring is missing. Evidence for every IAT row: the 241-file unit run and 73-file adverse run on this device [DEV] plus the named suite.

| ID | Requirement | Implementation | Runtime wiring | Tests | Status | Remaining work |
|---|---|---|---|---|---|---|
| 001 | ScanConfiguration shape | `PLAN/scan-configuration.ts` | none (no caller) | `resolver.test.ts` | IAT | production caller |
| 002 | Named, versioned ScanProfile | `PLAN/profiles.ts` | none | `resolver.test.ts` | IAT | seeding of system profiles |
| 003 | Profile version snapshot | `profiles.ts`, resolver | none | `resolver.test.ts` | IAT | — |
| 004 | domain→class→unit three layers | resolver + `engine-registry.ts` | passive only | `resolver.test.ts` | PARTIAL | no non-passive engines (SPEC 010–012) |
| 005 | Pure deterministic fail-closed resolver | `PLAN/resolver.ts:123` | **no production caller** | `resolver.test.ts` (40) | PARTIAL | call from scan creation |
| 006 | Immutable plan | CORE-01 trigger | DB-level | `core01-schema.test.ts` | IAT | — |
| 007 | Fresh F01 per non-passive class | resolver | none | `resolver.test.ts` | IAT | caller |
| 008 | Inspectable DAG | `PLAN/graph.ts:208` | none | `graph.test.ts` (28) | IAT | — |
| 009 | Every unit explains why | `terminalReason`, coverage | not exposed | `evidence.test.ts` | PARTIAL | per-unit explanation read model |
| 010 | Fan-in BLOCKED | `fahes_finalize_unit` | host/sweep | `core01-schema.test.ts` | IAT | — |
| 011 | One plan per scan | unique index | DB | `core01-schema.test.ts` | IAT | — |
| 012 | ExecutionUnit record | schema | DB | `core01-schema.test.ts` | IAT | — |
| 013 | Intra-plan edges | trigger + `graph.ts` | DB | `graph.test.ts`, `core01-schema.test.ts` | IAT | — |
| 014 | 11 statuses, guarded | trigger `fahes_unit_guard` | DB | 110-pair test | IAT | — |
| 015 | Plan immutability / discovered children | immutability trigger | no frontier creation | — | PARTIAL | runtime child-unit creation |
| 016 | REUSE/EXTEND/NEW classification | `plan.md` | — | — | N/A | planning artifact |
| 017 | Per-class queues | `config/src/queues.ts`, `WK/execution-runtime/queues.ts:131` | **only if adapters>0** | `execution-runtime.test.ts` (24) | IAT | production producer |
| 018 | Durable-state dispatch | `RT/dispatch.ts:89`, `WK/.../host.ts:90` | gated | `dispatch.test.ts` (22), runtime (24) | IAT | API→queue producer |
| 019 | Process isolation / force termination | `process-child.ts`, `child-entry.ts` | gated | runtime test, image smoke [DOC] | IAT | production engines |
| 020 | No secrets in payloads/logs | config guard, redaction, child env | partial | `resolver.test.ts`, `evidence.test.ts` | PARTIAL | engine writers do not exist |
| 021 | Three-way stop distinction | `RT/expire.ts:64`, host mapping | gated | `runtime.test.ts`, runtime test | IAT | — |
| 022 | F07 checkpoint for gated classes | `RT/dispatch.ts`, host IPC checkpoint | gated | `dispatch.test.ts` | IAT | production roles composition |
| 022a | Plan-time vs dispatch-time authorization | resolver + dispatch | partial | `dispatch.test.ts` | PARTIAL | expire/narrow/revoke matrix |
| 023 | Failure classification | `RT/failure-class.ts:34` | host | `runtime.test.ts` | IAT | — |
| 024 | Proven idempotence for retries>1 | `engine-registry.ts` guard | registry | `resolver.test.ts` | PARTIAL | no retry-after-side-effect proof |
| 025 | Idempotency key per effect | `RT/effects.ts:28` | host | `runtime.test.ts` | IAT | — |
| 026 | Tenant-scoped unit lookups | all services | n/a | adverse + `runtime.test.ts` | IAT | no HTTP read path |
| 027 | Hierarchical progress | `RT/progress.ts:155`, `ScanProgress.tsx` | host publishes | `progress.test.ts` (15), `scan-progress.test.ts` | PARTIAL | authenticated reconnect/ordering unverified |
| 027a | No progress after terminal | `progress.ts` + trigger | host | `progress.test.ts` | PARTIAL | client no-missed-event contract |
| 028 | Evidence↔Issue many-to-many | `EV/materialize.ts:59` | none | `evidence.test.ts` | IAT | — |
| 029 | Reverify compatibility | resolver REVERIFY | **runner legacy** | `resolver.test.ts` | PARTIAL | switch runner |
| 030 | Evidence redaction | `EV/evidence.ts:55` | none | `evidence.test.ts` | IAT | — |
| 031 | Oversize → artifact | `evidence.ts` | none | `evidence.test.ts` | IAT | — |
| 032 | Artifact = R2 object reference | `EV/artifacts.ts:65`, `store.ts` | store null without R2 | fake store + stub | PARTIAL | real R2 / S3-compatible lifecycle |
| 033 | Per-object/scan budgets | `artifacts.ts` | none | `evidence.test.ts` | IAT | — |
| 034 | Retention gap closed | `storage/retention.ts` | wired, store null | `retention.test.ts` | PARTIAL | real object deletion |
| 035 | Orphan reaper | `WK/orchestrator/artifact-reaper.ts:40` | scheduled | `artifact-reaper.test.ts` | PARTIAL | real deletion lifecycle |
| 036 | Fingerprint finding identity | `materialize.ts` | none | `evidence.test.ts` | IAT | — |
| 037 | Evidence link provenance | `materialize.ts` | none | `evidence.test.ts` | IAT | — |
| 038 | Partial completion keeps evidence | finalize/materialize | none | `evidence.test.ts` | IAT | — |
| 039 | Coverage metadata in report | `materialize.ts:149` | **not consumed** | `evidence.test.ts` | PARTIAL | report read path/UI |
| 040 | Zero behaviour change, passive | no wiring into legacy | legacy path | full unit+adverse+E2E | VC | re-verify each change |
| 041 | New entities tenant-scoped | schema+services | n/a | adverse | IAT | — |
| 042 | R2 key structure | `EV/store.ts` | none | `evidence.test.ts` | IAT | — |
| 043 | Per-engine observability | host telemetry event | gated | runtime test [DOC] | PARTIAL | production aggregation/health |
| 044 | Metering boundary | — | — | — | N/A | out of scope |
| 045 | Credentials boundary | — | — | — | N/A | out of scope |
| 046 | No AI in planning/execution | static review | — | — | VC | re-verify each change |
| 047 | Scan deadline policy (U-1) | `plan-deadline.ts:164`, `plan-gate.ts:40`, `planned-sweep.ts:41`, `expire.ts:64` | sweep/gate wired | `planned-timeout-sweep.test.ts` (17), `dispatch.test.ts` | PARTIAL | AC-12/19 production engines; AC-17 deployed clock |

| SC | Statement | Status | Gap |
|---|---|---|---|
| 001 | Every subsystem classified REUSE/EXTEND/NEW | IAT | — |
| 002 | Every entity tenant-scoped | IAT | no production API path |
| 003 | F07 process-topology dependency resolved | PARTIAL | production engine registration |
| 004 | 40+ adversarial scenarios resolved | PARTIAL | full SPEC-009-specific matrix not enumerated |
| 005 | Quickstart validation | PARTIAL | no production API→worker lifecycle |
| 006 | Planning-pass bar | N/A | superseded |
| 007 | Engine author can answer five questions | PARTIAL | no production engine to validate |
| 008 | Long plans not killed by 15-min timeout | PARTIAL | production-engine termination, deployed clock |

## G. Complete 28-gate Definition-of-Done matrix

Source: `DEFINITION_OF_DONE.md` "Final verification update" table, re-judged against this device's evidence.

| Gate | Acceptance requirement | Current evidence | Status | Gap | Required action |
|---|---|---|---|---|---|
| 1 | Scan configuration validated | unit run [DEV] | PASS | — | — |
| 2 | Scan profiles | unit run [DEV] | PASS | — | — |
| 3 | Profile versioning | unit run [DEV] | PASS | — | — |
| 4 | Plan resolution pure/fail-closed | `resolver.test.ts` [DEV] | PASS | no production caller (tracked in 24) | — |
| 5 | Execution DAG | `graph.test.ts`, schema tests [DEV] | PASS | — | — |
| 6 | Unit lifecycle | 110-pair test [DEV] | PASS | — | — |
| 7 | Queue dispatch | real Redis/BullMQ test | PARTIAL | API producer, production adapters | N01, N02 |
| 8 | Worker execution | child-process host, test adapter | PARTIAL | no production engine | blocked on SPEC 010–012 |
| 9 | Authorization integration | revocation tested | PARTIAL | expire/narrow/revoke matrix | V03 |
| 10 | Safety admission | F07 via host | PARTIAL | composed production roles | V02 |
| 11 | Budget enforcement | F07 only | PARTIAL | unit-path oversubscription test | V04 |
| 12 | Kill switch | integration | PARTIAL | all status/race combos | V03 |
| 13 | Cancellation | runtime | PARTIAL | HTTP cancel + refund end to end | V02 |
| 14 | Deadline enforcement | AC-1…20 mapped | PARTIAL | AC-12/19 production, AC-17 deployed | blocked/V06 |
| 15 | Failure recovery | crash/replacement tested | PARTIAL | DB/Redis outage recovery | V05 |
| 16 | Evidence persistence | evidence suite [DEV] | PASS | — | — |
| 17 | Artifact persistence | fake store | PARTIAL | real R2/S3 lifecycle | D01 |
| 18 | Finding materialization | suite [DEV] | PASS | — | — |
| 19 | Runtime finalization | race suite [DEV] | PASS | — | — |
| 20 | Audit integrity | forced-failure rollback test [DEV] | PASS | — | — |
| 21 | Tenant isolation | service level | PARTIAL | production HTTP IDOR path absent | N01 then V02 |
| 22 | Security | real-login suites 24/24 + 116/116 [DEV] | PARTIAL | dev stack still superuser; prod compose not re-verified here | V01 |
| 23 | Performance | local baseline [DOC] | PARTIAL | sustained load, k6, resource use | V07 |
| 24 | Real full-stack | in-process only | PARTIAL | API+worker processes, HTTP lifecycle | V02 |
| 25 | Chrome manual acceptance | 2 screenshots [DOC] | PARTIAL | 24-step journey, 3 viewports | V08 |
| 26 | Regression | unit/adverse green [DEV]; Playwright §K; visual 17 TODO; coverage not run | PARTIAL | visual parity, coverage | V09 |
| 27 | Documentation | matrix, DoD, backlog current but with drift (§N) | PASS | drift to correct | doc fixes |
| 28 | Git delivery | HEAD = remote [DEV]; 3 recovery edits uncommitted | PARTIAL | commit handoff + edits | closure |

Count: **11 PASS (1,2,3,4,5,6,16,18,19,20,27) · 17 PARTIAL · 0 FAIL · 0 BLOCKED · 0 N/A**.

## H. Task reconciliation

`tasks.md` has 49 task ids: T001–T039 (planning/closure, all `[X]`) and T-U1-1…10.

| Task | Checkbox | Actual | Evidence | Corrected status |
|---|---|---|---|---|
| T001–T036 | [X] | planning artifacts exist (spec, plan, research, data-model, 11 contracts, checklists) | files present [SRC] | VERIFIED (planning) |
| T037–T039 | [X] | U-1 planning amendment in spec/plan/contract | present [SRC] | VERIFIED (planning) |
| T-U1-1 | [X] | `ScanPlan.deadlineMs` + CHECK in migration | fresh 35-migration chain [DEV] | VERIFIED |
| T-U1-2 | [X] | `plan-deadline.ts:164` | `plan-deadline.test.ts` 34 [DEV] | VERIFIED |
| T-U1-3 | [X] | resolver refusals | `resolver.test.ts` 40 [DEV] | VERIFIED (no production caller) |
| T-U1-4 | [X] | dispatch step 0 | `dispatch.test.ts` 22 [DEV] (task text says 20: stale) | VERIFIED |
| T-U1-5 | [X] | host-loop decision | `dispatch.test.ts`, runtime test | VERIFIED (test adapter) |
| T-U1-6 | [X] | planned sweep pass | `planned-timeout-sweep.test.ts` 17 [DEV] | VERIFIED |
| T-U1-7 | [X] | `expirePlanUnits` + self-heal | same + `runtime.test.ts` | VERIFIED |
| T-U1-8 | [X] | gate + orchestrator `planGate` | `index.ts:333`, tests | VERIFIED |
| T-U1-9 | [X] | evidence/finalization fence | `evidence.test.ts`, runtime test | VERIFIED |
| T-U1-10 | [ ] | AC-1…20 mapped in DoD | AC-12/19 production, AC-17 deployed missing | PARTIAL — correctly unchecked |

Findings: (A) checked without sufficient evidence: none found; the checked implementation tasks have on-device test evidence. (B) unchecked but implemented: none. (C) partial: T-U1-10. (D) **missing tasks: tasks.md contains no task for the production integration at all** (API scan creation → resolver → plan persistence → enqueue; production adapter registry; report read path for FR-039; reverify switch; real-stack acceptance). Implementation tracking lives in `PROCESS_FOR_THE_APP.md` CORE-01…10, and those rows are stale: CORE-04 still says "queue dispatch and host loop not wired" (wired for adapters), CORE-10 says BLOCKED though AC-1 legacy-boundary tests exist. (E) blocked: engines (SPEC 010–012), AC-12/19/17 deployed evidence. (F) owner decisions: §L.

Proposed task inventory for the next session (ids new, to be added to `tasks.md` by the owner-approved prompt): N01–N05 integration, V01–V09 verification, D01 documentation/object-storage, listed in §O.

## I. Security findings

| Finding | Severity | Evidence | Status |
|---|---|---|---|
| Dev API/worker use the database superuser (`.env` `webaudit`), so none of the role isolation is in force there | High (operational) | [SRC] `.env`; reports | Open, by design of the dev stack; production compose separates roles [DOC], not re-verified here |
| Finalizer was callable by API/generic-worker roles | High | fixed additively (migration `…130000_core01_restrict_finalizer_grants`), real-login test [DOC]; suite green [DEV] | Closed |
| Definer functions executable by PUBLIC | High | migration `…180000_core01_revoke_public_definer_execute` [SRC]; suite green [DEV] | Closed |
| Cross-tenant plan resolution | High | refused (`SCAN_NOT_FOUND`) in role suite [DEV 24/24] | Closed |
| Lease tokens in clear in `AdmissionLease` | Medium | SPEC 008 AR-13; host takes token from its own admission result | Documented limitation |
| Workers share one role in the dev stack | Medium | as above | Open (environment) |
| Real R2 credentials/ACL model unverified | Medium | no credentials | External |

No new security defect was found by this audit.

## J. Runtime integration findings

1. No production path creates a plan (`resolvePlan` unreferenced outside tests). 2. No production adapter; execution workers do not start. 3. Progress publisher fires only from the host; client consumption relies on `GET /scans/:id` snapshots + scan-room events — reconnect ordering unverified. 4. FR-039 coverage not consumed. 5. Reverify runner legacy. 6. Retention/reaper wired but inert without R2 credentials. 7. The legacy sweep, orchestrator gate and timeout paths are wired and behave as before (`no-plan` fall-through) — verified by the green regression suites [DEV].

## K. Verification evidence

| Suite | Command | Result | Where |
|---|---|---|---|
| Typecheck | `pnpm typecheck` | 30/30, exit 0 [DEV] | |
| ESLint (tracked source) | `npx eslint . --ignore-pattern …` | exit 0 [DEV] | `/tmp/eslint_scoped.txt` (session) |
| Adherence lint | `pnpm run lint:adherence` | 0/0 [DEV] | |
| Prettier | `npx prettier --check .` | exit 1: 87 tracked (84 old + 3 fixed), 8 untracked [DEV] | |
| Prisma | `prisma validate`, fresh `migrate deploy` | valid; 35/35 [DEV] | |
| Unit/contract/integration | `vitest run --project unit --no-file-parallelism` | **241 files, 1,873 passed, 0 failed, exit 0, 861 s** [DEV] | disposable PG :5461 + Redis :6399 |
| Adverse | `vitest run --project adverse --no-file-parallelism` | **73 files, 1,153 passed, 1 skipped, exit 0, 425 s** [DEV] | same |
| Playwright E2E | `npx playwright test` (apps/web) | **93 passed, 0 failed, exit 0, 28.1 min** [DEV] (real Chromium via Playwright 1.62.1, isolated PostgreSQL :5461 / Redis :6399 DB 13; the specs boot the stack in-process; this is the legacy scan path, not a SPEC 009 production cutover test) | |
| Visual project | — | not run on this device; 8 passed / 17 TODO [DOC] | |
| Real Chrome | — | not run on this device; 2 screenshots from the other device [DOC] | `browser-evidence/` |
| Performance | — | `PERFORMANCE_BASELINE_2026-10-29.md` [DOC] | |
| Coverage | — | never run | |

The 244/1,874 figure in older reports counted 3 files absent from the tracked tree; the tracked unit project has exactly 241 test files (all ran).

## L. External dependencies and owner decisions

External (TYPE D): real R2 credentials (or an explicitly accepted S3-compatible substitute); a deployed environment with NTP evidence for AC-17; production compose secrets; k6.
Owner decisions (TYPE F), only where the approved documents require one: (1) **cutover policy** — when/if scans created through `/scans` produce plans and non-passive units (the recovery directive forbade changing the production cutover); (2) acceptability of an S3-compatible emulator instead of R2 for gate 17; (3) billing of non-passive outcomes (DEC-032/DEC-062 remain open) — needed before non-passive units can be billed/refunded; (4) approval to fix the 84-file Prettier debt in one noisy commit (optional).

## M. Future-spec dependencies (TYPE E)

SPEC 010 (BROWSER engine; D-1 browser pool; DEC-052/042), SPEC 011 (source engines; DEC-053/054), SPEC 012 (security engines; DEC-033/037/040/055/061). They own production adapters, bounded termination (AC-12/19) and engine telemetry content. SPEC 009 must not implement them.

## N. Defect register

| Id | Type | Description | State |
|---|---|---|---|
| R-1 | Environment | Docker Desktop engine crashed mid-run (19:41) | recovered; re-ran clean |
| R-2 | Environment | `EXEC_TEST_REDIS` must be set; `localhost` flaky for Prisma on Docker | documented; use 127.0.0.1 |
| R-3 | Environment | Prisma `generate` EPERM when a dev process holds the engine DLL | known; types still update |
| F-1 | Formatting debt | 84 old tracked files fail Prettier | pre-existing, not a blocker |
| F-2 | Formatting | 3 SPEC-009-era files | fixed locally, uncommitted |
| L-1 | Lint | 2 errors in owner's untracked scratch scripts | not repo defects |
| X-1 | Doc drift | `PROCESS_FOR_THE_APP.md` CORE-04/CORE-10 rows stale | open |
| X-2 | Doc drift | matrix tally says 27/17, rows say 28/16 | open (§A uses 28/16) |
| X-3 | Doc drift | `DEFINITION_OF_DONE.md` keeps several superseded historical tables; T-U1-4/5 text cites old test counts | open |
| X-4 | Missing doc | no standalone defect register, no recovery handoff | open |
| P-1 | Known gap | D-1 browser pool | SPEC 010 |
| P-2 | Known gap | dev stack superuser | environment |
| T-1 | Test reliability | 6 earlier full-suite failures (queue/Redis-heavy files) did not recur on isolated PostgreSQL+Redis | not reproduced; two clean runs [DEV] |

## O. Prioritized remaining backlog

| Priority | Ids | Required work | Dependencies | Acceptance tests | Outcome |
|---|---|---|---|---|---|
| P0 | **N01** | In `create-scan.ts` call `resolvePlan` behind a default-OFF flag; persist plan; for non-passive units call `enqueueEligibleUnits`; passive units untouched | owner cutover decision (default-off needs none) | flag-off = byte-identical legacy (existing E2E/unit suites); flag-on integration test with test adapter through HTTP | production API→plan→queue path (gates 4,7,21,24) |
| P0 | **N02** | Production worker adapter registry loaded from configuration, empty by default; startup log of registered engines | N01 | boot test with 0 and 1 adapters | gates 7,8 wiring |
| P1 | V01–V02 | Start API + worker as separate processes under non-superuser roles (production compose pattern); HTTP create→plan→dispatch→finalize→results→cancel→refund | N01, N02 | scripted HTTP lifecycle + DB evidence | gates 10,13,22,24 |
| P1 | N03 | Report read path consumes `scanCoverageSummary`; per-unit "why" read model (FR-009/039) | — | API contract + unit tests | FR-009, FR-039 |
| P1 | N04 | Authenticated progress recovery: reconnect ordering, no-missed-terminal, authorization on both channels | — | realtime integration + adverse tests | FR-027/027a |
| P1 | N05 | Switch REVERIFY runner to plans behind flag | N01 | reverify suite both modes | FR-029 |
| P2 | V03–V05 | Full authorization expire/narrow/revoke matrix; status×cause race matrix; DB/Redis outage recovery | — | adverse suites + failure injection | gates 9,12,15 |
| P2 | D01 | R2/S3 lifecycle (create, retention delete, reaper) against real R2 or an approved S3-compatible emulator | credentials / owner choice | lifecycle test | gates 17, FR-032/034/035 |
| P3 | V06–V09 | Deployed clock-skew evidence, k6/sustained load + resource use, 24-step Chrome acceptance at 3 viewports, visual parity (17 TODO), instrumented coverage, full regression | deployment | evidence files | gates 14,23,25,26 |
| — | blocked | production engines, AC-12/19 production termination, D-1 | SPEC 010–012 | — | not in SPEC 009 |
| — | docs | fix X-1…X-4, add `tasks.md` ids N01–V09, defect register, recovery handoff | — | review | gates 27,28 |

Groupable: N01+N02 (one session); N03+N04 (one); V01–V05 (one verification session); D01 separate (credential-dependent); V06–V09 separate (deployment-dependent).

## P. Next implementation session scope

Start from `8aa5fc2` on `main` after the recovery closure commit. Scope: N01, N02, N03, N04, N05 and the verification V01–V05; defer D01/V06–V09 unless credentials/deployment exist. DoD gates in play: 4, 7, 9, 10, 12, 13, 15, 21, 22, 24. No SPEC 010–012 code.

## Q. NEXT MASTER PROMPT — REQUIRED CONTENT

1. **Starting commit**: the recovery-closure commit on `main` (currently `8aa5fc2` + this recovery's docs); verify with `git ls-remote` before starting.
2. **Branch**: `main`. 3. **Spec**: SPEC 009 with amendment v6; approvals DEC-047/051/066 already recorded.
4. **Do not repeat**: schema/migrations (35), planning, runtime core, finalizer, sweep/gate, evidence/artifacts, per-unit child host, progress publisher, retention wiring, the 241/73-file green baselines.
5. **Remaining task ids**: T-U1-10 plus the new N01–N05, V01–V09, D01 (add to `tasks.md`).
6. **Remaining gates**: 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 21, 22, 23, 24, 25, 26, 28.
7. **Implementation gaps**: FR-009, 039 (read model), FR-015 (frontier children), FR-043 production aggregation.
8. **Integration gaps**: `resolvePlan` caller; plan persistence + enqueue from `/scans`; worker adapter registry; reverify; coverage in report.
9. **Security fixes required**: none open from this audit; must re-run the real-login role suites after any API/worker change; never run API/worker as superuser in V01/V02.
10. **DB changes**: none expected; if N01 needs an index or grant, add an additive migration with a tested rollback and re-run the role suites.
11. **Worker changes**: adapter registry loading; no engine code.
12. **API changes**: flagged plan creation in `create-scan.ts`; coverage/"why" read endpoint; progress recovery auth.
13. **Frontend**: only if N03/N04 need display of coverage/unit explanations; reuse `ScanProgress`.
14. **Tests**: flag-off identity (full legacy suites), flag-on HTTP lifecycle with the deterministic test adapter, realtime auth/reconnect, authorization matrix, status×cause races.
15. **Failure injection**: Redis stop/start mid-run, PostgreSQL restart, worker kill, lease expiry, kill switch, deadline.
16. **Performance**: k6 on the HTTP lifecycle; sustained BullMQ load with resource sampling; record, do not tune to pass.
17. **External dependencies**: R2 credentials or approved emulator; deployment for clock-skew evidence.
18. **Owner decisions needed**: cutover policy (flag default), non-passive billing (DEC-032/062), emulator acceptance.
19. **Git rules**: explicit staging, never owner files (`pnpm-lock.yaml`, `showcase-*`, `docs/audits/frontend-design/`, `apps/web/*.mjs`), logical commits, normal push, verify remote; no force operations.
20. **Closure criteria**: every in-scope gate PASS with named evidence, or BLOCKED with exact external cause; full unit + adverse + Playwright green on isolated infrastructure; DoD/matrix/tasks reconciled with recounted totals; D-1 and the dev superuser limitation stated; SPEC 009 declared complete only if all mandatory gates pass.

## R. Final readiness verdict

**READY WITH DOCUMENTED BLOCKERS for SPEC 009 implementation, but RECOVERY INCOMPLETE** until the recovery handoff, the Chromium smoke test and a stack start/stop check are done. The code baseline is healthy and reproducible on this device; the remaining SPEC 009 work is integration and verification, with production engines blocked on SPEC 010–012.
