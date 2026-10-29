# SPEC 009 — implementation backlog

The historical planning ledger (`specs/009-…/tasks.md` T001–T039) is **not** implementation evidence and is left untouched; this backlog is the implementation plan.
"Independent" = does not depend on an unapproved decision or on the unmigrated schema, so it can proceed now. IDs are `P9-<context>NN` (A = Scan Planning, B = Execution Runtime, C = Result & Evidence, X = cross-cutting).
Landing directories (from `plan.md`): `apps/api/src/services/planning/`, `apps/worker/src/execution-runtime/`, `apps/worker/src/evidence/`; three additive migrations for the eight tables.

## Phase 0 — gates (owner)
| ID | Item | Status |
|---|---|---|
| G-DEC-047 | single finalization authority | PENDING OWNER (`DECISION_PACKET.md`) |
| G-DEC-051 | effect-authorization ledger | PENDING OWNER |
| G-DEC-066 | U-1b text (v6 draft needed first) | PENDING OWNER (assistant drafts v6 on request) |
| G-TECH | DEC-056/057/058/064 technical clarifications | not approved for 009 (008 delegation did not extend) |

## Phase 1 — decision-free work (done / doable now)
| ID | FR | Task | Source files | Tests | Status |
|---|---|---|---|---|---|
| P9-A01 | 008, 010, 013 | graph validation, deterministic topological order, eligibility, one-level `BLOCKED` propagation | `planning/graph.ts` | `graph.test.ts` (35: cycles incl. 20 000-deep, random DAG properties, shuffled-input determinism) | **DONE, verified** |
| P9-A02 | 047 (T-U1-2) | `computePlanDeadline`, `unitBudgetMs`, `dispatchThresholdMs`, `criticalPathMs` | `planning/plan-deadline.ts` | contract worked example exact; brute-force critical path (80 seeds); Lemma property (200 seeds); ceiling/grant boundaries | **DONE, verified** (4/4 mutants killed) |
| P9-A03 | 047 | `effectiveDeadlineAt` (INITIAL / REVERIFY / legacy anchors) | same | 7 cases | **DONE, verified** |
| P9-A04 | 047 (arithmetic half of T-U1-4) | `dispatchDeadlineDecision` (step 0) | same | boundary tests (`<` strict) | **DONE, verified** — wiring is P9-B05 |
| P9-A05 | 001 | `ScanConfiguration` validated type (zod) | `planning/scan-configuration.ts` | contract tests | independent — next |
| P9-C01 | 023 | pure failure classifier → `FailureClass`/retry eligibility (research R9) | `execution-runtime/failure-class.ts` | table + property tests | independent — next |
| P9-X01 | 020 | secret-in-payload guard reused from `@webaudit/redaction` for unit/evidence writers | — | adversarial strings | independent |
| P9-X02 | — | deterministic concurrency harness (barrier helper over `pg_advisory_xact_lock`, as used in 008 tests) extracted for reuse | `apps/api/tests/helpers/` | self-test | independent |
| P9-X03 | D-M | non-superuser runtime provisioning script + doc | `infrastructure/` | applied on a disposable DB | independent (see `SESSION_PROGRESS.md`) |

## Phase 2 — after the owner closes DEC-047 / DEC-051 and the v6 text (DEC-066)
| ID | FR | Task | Depends | Notes |
|---|---|---|---|---|
| P9-A10 | 002–003, 006, 011–013, 015, 028, 032 | **CORE-01** migration: 8 models, 6 enums (zero `@relation` into frozen models), unique `(scanPlanId, idempotencyKey)`, `ScanPlan.deadlineMs/deadlineBreakdown` (T-U1-1), supporting index for the self-healing pass (T-U1-7) | DEC-051, G-02 | three additive migrations + tested rollback; verify fresh/upgrade/rollback as in 008 |
| P9-A11 | 002–004 | profile + version services | P9-A10 | tenant-scoped |
| P9-A12 | 005, 007, 029 | `resolvePlan` steps 1–6 with F01 `isAuthorized` per class, graph generation from engine templates, deadline (T-U1-3: `PLAN_DEADLINE_EXCEEDS_CEILING`, `GRANT_EXPIRES_BEFORE_DEADLINE`), one transaction | P9-A10, A02 | fail-closed to `REFUSED` |
| P9-B01 | 012, 014, 018 | `ExecutionUnit` service + guarded transition table (single-statement CAS) | P9-A10, DEC-057/064 | |
| P9-B02 | 010, 019, 038 | `finalizeExecutionUnit` (single authority) incl. lease release via 008 `f07_release_leases_by_execution` in the same transaction, one-level `BLOCKED` via P9-A01 | DEC-047, P9-B01 | |
| P9-B03 | 017, 018 | per-class queue topology + dispatch from durable state; **008 interim identity** `executionId` := `ExecutionUnit.id` | P9-B01, 008 | no ambiguity old/new path |
| P9-B04 | 021, 022, 022a | checkpoint wiring + three-way stop distinction | DEC-058, 008 | |
| P9-B05 | 047 (T-U1-4) | dispatch step 0 before F07 (uses P9-A04) | P9-B03 | |
| P9-B06 | 047 (T-U1-5) | engine host-loop expiry helper | engines | |
| P9-B07 | 047 (T-U1-6/7) | `sweepTimedOutScans` planned pass; `expirePlanUnits` + status-by-cause matrix; self-healing pass | DEC-058/064, P9-B02 | legacy sweep tests unchanged and green |
| P9-B08 | 047 (T-U1-8) | `continueScanIfPlanTerminal` gate + module-result finalizer extension point | DEC-047 | atomic deadline predicate |
| P9-B09 | 047 (T-U1-9) | execution-wrapper fencing (fence first, claim second, write third) | DEC-051 | generic `recordEvidence` stays permissive |
| P9-B10 | 047 (T-U1-10) | adverse tests AC-1…AC-20 | all above | |
| P9-B11 | 027, 027a | progress events | P9-B01 | |
| P9-C10 | 030–035, 037, 042 | evidence envelope + artifact writers (redaction-wrapped; R2 key layout; size budget; staged-upload retention; orphan reaper) | P9-A10 | storage via existing R2 services |
| P9-C11 | 028, 036, 037, 039 | finding materialization + coverage metadata | P9-C10 | |

## Phase 3 — cross-cutting delivery
Real full-stack run (non-superuser roles), Chrome journey, failure injection, load baselines, regression, final delta review. D-1 is **not** closable by SPEC 009 alone: it needs the `BROWSER` engine (SPEC 010, E-01: DEC-052/042); SPEC 009 provides only the routing/runtime that engine plugs into.

## U-1 task map (`tasks.md` T-U1-1…10)
T-U1-1 → P9-A10 (blocked) · **T-U1-2 → P9-A02 DONE** · T-U1-3 → P9-A12 · T-U1-4 → P9-A04 (done) + P9-B05 · T-U1-5 → P9-B06 · T-U1-6/7 → P9-B07 · T-U1-8 → P9-B08 · T-U1-9 → P9-B09 · T-U1-10 → P9-B10.

---

## Status update — 2026-10-29 end of session
Phase 1 items P9-A01..A05 and P9-C01 are DONE (tested). Phase 2 was unblocked by the owner's approvals (see `SESSION_PROGRESS.md`) and delivered at the service layer: P9-A10 (migration), A11, A12, B01 (transition table + CAS), B02 (finalizer), B07 (sweep/expiry), B08 (gate), B09 (`authorizeEffect`; engine wrappers pending), C10/C11 (evidence, artifacts, materialization). Remaining: P9-B03 (queue topology + dispatch), B04 (checkpoint wiring), B05 (step-0 wiring), B06 (host-loop helper), B10 (AC-1..AC-20 matrix), B11 (progress events), retention/reaper wiring, P9-X01 (secret guard reuse for engine writers), P9-X03 (non-superuser provisioning, still not done), then Phase 3. T-U1 map: T-U1-1 ✓, 2 ✓, 3 ✓, 4 partial, 5 ✗, 6 ✓, 7 ✓, 8 ✓, 9 partial, 10 partial.

## Cross-device status correction — 2026-10-29

The historical status paragraph above predates later implementation commits and is superseded by source inspection and the dated verification report. Current evidence changes:

- P9-B03/B04/B05/B06/B11 have implementation code; queues, host, admission, deadline handling, effects, and progress were exercised in `apps/worker/tests/integration/execution-runtime.test.ts` (17/17) with disposable real PostgreSQL, Redis, and BullMQ. `startWorker` now composes locally supplied adapters into consumers and shutdown; its executable entrypoint has no registered production adapter, and this is not full API-stack verification.
- P9-C10 includes the artifact reaper handler and repeatable scheduler in the worker entrypoint by static inspection; R2 and retention/reaper lifecycle remain unverified. Remove the stale statement that the reaper is unscheduled only after fresh verification of retention lifecycle.
- P9-X03 is partly met for the narrow DB privilege proof: actual non-superuser login roles tested finalizer/status boundaries (7/7). Full table/function/tenant/effect/lease matrix and real API/worker role connections remain outstanding.
- Corrective migration `20261030130000_core01_restrict_finalizer_grants` is fresh-install tested only and not applied to the shared development DB.
- A real gap remains: no production `resolvePlan` caller or API-to-queue path was found; engine adapter integration remains future SPEC 010–012.
- Historical full-suite, adverse, contract, browser, performance, R2, and coverage results are not current evidence. See `FINAL_VERIFICATION_REPORT_2026-10-29.md` and the current DoD reassessment.
- Five previously named failing files passed together sequentially on isolated Redis and the disposable test database (27/27). This proves they pass without the shared Redis configuration but does not identify the exact cause of the earlier full-suite failures; full suite remains outstanding.

### Privilege review follow-up — 2026-10-29

- **Closed in this continuation:** revoke PUBLIC EXECUTE from the CORE-01 SECURITY DEFINER dependency trigger helper. Regression evidence is in `apps/api/tests/adverse/core01-role-isolation.test.ts`; its negative assertion was observed failing before migration `20261030180000_core01_revoke_public_definer_execute` and passing after.
- **Reverified:** fresh 32-migration deployment and status; CORE-01 LOGIN-role suite 17/17; execution-runtime integration 21/21. The deliberate API-finalizer grant mutation was detected by the production-role test and revoked from the disposable DB.
- **Still open:** full cross-tenant/effect/lease-secret/function privilege matrix and actual API/worker production credentials. These are verification gaps; the new migration does not make the broader privilege gate PASS.

## Verification update — 2026-10-29

The latest full serial unit/contract/integration Vitest workspace is complete: **243/243 files and 1,854/1,854 tests passed** on fresh disposable PostgreSQL and Redis. The run closed the earlier full-suite failures: blank `EMAIL_TRANSPORT` is normalized to the documented SMTP default, and the sandbox-unconfigured contract clears the `.env` URL before its assertion. See the dated final verification report and session progress for scope and remaining gates. Adverse/visual suites, API plan producer/production adapter, browser, load, coverage, full privilege matrix, and real R2 remain open.

Runtime continuation (2026-10-29): FR-019 now has a per-unit local-module OS child runner with parent-mediated effect/evidence/progress and safety-checkpoint IPC and a sanitized environment. Targeted runtime integration is 20/20; the affected role-isolation and kill-switch adverse tests are 127/127; the tagged Docker worker image rebuilt after the checkpoint change and the in-image child smoke passes. This does not close the API plan producer or remaining engine/DoD gates.

## Final revalidation — 2026-10-29

The phase tables and verification paragraphs above are historical planning records and are superseded by this current state:

- Implemented and exercised on isolated PostgreSQL/Redis/BullMQ: plan/profile resolution components, execution-unit persistence/transitions, per-class queue/worker composition, child-process isolation and parent IPC, F07 checkpointing, deadline/expiry/finalization, evidence/materialization, artifact fake-store behavior, and artifact reaper wiring.
- Complete serial unit/contract/integration: **243 files, 1,855 tests passed**. Complete adverse: **72 files, 1,142 passed, 1 skipped**. SPEC 009 worker runtime: **21/21**. Full Playwright E2E: **93/93** using isolated services after correcting a test-harness Redis split.
- Visual harness: **8 passed, 17 todo**; it proves the capture/comparison machinery runs but leaves the page-reference comparisons unresolved. It does not satisfy the UI 0.5% parity bar. Instrumented coverage and a SPEC 009 performance baseline also remain unmeasured.
- Still required for end-to-end completion: production API `resolvePlan`→durable queue producer; registered production SPEC 010–012 engine adapter; real API and worker service-role scan flow; complete privilege and U-1 AC-1…20 race/fairness matrices; authenticated progress reconnect/recovery; audit-event rollback proof; process restart/outage injection; real R2 retention/reaper test; per-engine observability; measured performance; instrumented coverage; manual Chrome acceptance.
- `DEFINITION_OF_DONE.md` and `REQUIREMENT_DELTA_MATRIX.md` hold the current gate and 49-FR status. SPEC 009 remains **NOT COMPLETE** until the open production and acceptance gates close.
