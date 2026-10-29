# SPEC 009 — Definition of Done

Derived from the spec's FRs/SCs and the contracts. **The spec defines no latency, throughput or capacity threshold**; where none exists a gate requires a *measured baseline* with the exact workload, not a pass/fail number. Numbers the spec does fix and that gates use: the deadline arithmetic and constants (`scan-deadline-contract.md`: 900 000 / 60 000 / 300 000 / 21 600 000 ms, `hardStopMarginMs` default 60 000), the 5 s F07 checkpoint cadence (008, FR-013), FR-023's retry classification, AC-1…AC-20 (U-1).
A gate is PASS only with the evidence named. Verdict values: PASS · PARTIAL · FAIL · BLOCKED · NOT STARTED.

| # | Gate | Expected behaviour (source) | Required evidence & method | Pass criteria | Fail criteria | Status |
|---|---|---|---|---|---|---|
| 1 | Scan configuration | validated `ScanConfiguration`, tenant-owned (FR-001, `scan-configuration-contract`) | contract + adverse tests; zod schema | valid accepted; invalid/foreign-tenant/over-sized refused; no partial effect | any accepted invalid input | PASS - `resolver.test.ts` (ScanConfiguration: 12 refusals, secret keys, hostile depth) |
| 2 | Scan profiles | named, versioned templates (FR-002) | schema + contract tests | profile resolves only through a version; wrong-tenant profile refused | unversioned read | PASS - profile tests (versioned, invalid mapping refused) |
| 3 | Profile versioning | historical plans keep the version they used (FR-003) | test: edit profile → old plan unchanged | immutable snapshot | retroactive change | PASS - plan keeps its profile version after a later publish |
| 4 | Plan resolution | pure, deterministic, fail-closed (FR-005/007, `execution-plan-contract` 1–6) | property tests (same config → same structure), authorization refusals before any debit | resolver never throws for a refusal; internal error ⇒ `REFUSED` | default-`RESOLVED` on error | PASS - determinism, F01 fresh per call, fail-closed (`resolver.test.ts`, 40) |
| 5 | Execution DAG | acyclic, intra-plan, deterministic order (FR-008/010/013) | pure tests + DB constraint tests | all graph defects refused; order identical across replicas | cycle/cross-plan edge persisted | PASS - pure graph tests + DB triggers (`graph.test.ts`, `core01-schema.test.ts`) |
| 6 | Unit lifecycle | exactly 11 statuses; guarded atomic idempotent transitions (FR-014, execution-unit-contract) | transition-table test + real-PostgreSQL race tests | only documented edges; no transition leaves a terminal status | illegal edge, double finalization | PASS - all 110 ordered status pairs vs the table; terminal freeze; finalizer races |
| 7 | Queue dispatch | durable-state-driven, deduplicated (FR-017/018) | real Redis + worker tests; duplicate/delayed delivery | one dispatch per unit; redelivery refused | queue-only state, double dispatch | PARTIAL - per-class queue names/routing and the full dispatch sequence (`dispatchExecutionUnit`, 19 tests on real PostgreSQL + F07) exist; no BullMQ consumers/producers use them yet |
| 8 | Worker execution | per-class wrapper; no bypass of admission | real worker process tests | every unit passes step 0 → F07 checkpoint | a unit runs unadmitted | NOT STARTED - worker execution wrapper not built (needs engines, SPEC 010-012) |
| 9 | Authorization integration | fresh `isAuthorized` at plan *and* dispatch (FR-007, 022a) | adverse: revoke/expire/narrow during planning and execution | refusals at both points; no cached verdict | stale authorization used | PARTIAL - plan-time fresh F01 check done; dispatch-time check awaits the dispatch wiring |
| 10 | Safety admission | `ExecutionUnit.id` is the 008 `executionId`; 008 is consumed, never bypassed (FR-022) | integration with 008 functions as non-superuser | no unit without a lease where required | identity ambiguity old/new path | PARTIAL - `executionId = ExecutionUnit.id` used by claim/finalize tests with real F07 leases; dispatch path not wired |
| 11 | Budget enforcement | via 008 only (FR-025) | concurrent admission through the unit path | no oversubscription | any other budget write path | PARTIAL - no new budget write path exists; concurrent admission through the unit path not yet exercised |
| 12 | Kill switch | three-way stop distinction preserved (FR-021) | stop during every unit status | CANCELLED ≠ KILLED; stop beats deadline | merged outcomes | PARTIAL - stop precedence and expiry mapping tested; live host stop not wired |
| 13 | Cancellation | user cancel via existing path, unit-level effects | real-Chrome + DB | RUNNING→CANCELLED, others REFUSED(SCAN_CANCELLED), refund per existing rules | refund drift | PARTIAL - cancelled-scan expiry mapping tested; user-cancel end to end not exercised |
| 14 | Deadline enforcement | U-1 whole contract (FR-047, AC-1…20) | adverse AC-1…AC-20 incl. DB clock, kill-vs-deadline, sweep-vs-gate race, refund fairness, legacy regression | all ACs green | any AC failing; legacy timeout behaviour changed | PARTIAL - T-U1-1..9 checked; active test-adapter hook dispatch through the live sweep scheduler and engine-specific margin are covered; AC-1 legacy boundary and AC-12/13 scheduler/gate races pass in `planned-timeout-sweep.test.ts` (17/17) and `execution-runtime.test.ts` (22/22), including the state-machine CAS and queued `alreadyTransitioned` flag; AC-7 fresh-read refund staleness (2/2), AC-15 pending-stop plus unconfirmed-termination, AC-16 real pre-child DISPATCHED expiry/refusal with lease release/dependent BLOCKED/test-handle termination (`dispatch.test.ts`, 22/22), and AC-20 passive-unit bypass (`dispatch.test.ts`, 22/22) are tested. Production-engine termination/backstop, AC-19 production engine, and AC-17 deployed clock-skew evidence keep T-U1-10 open |
| 15 | Failure recovery | crash/restart/redelivery safe (FR-018/024) | failure injection on dedicated containers | recovery without double effect | stuck or duplicated unit | PARTIAL - active execution-worker crash/replacement, child cleanup, stalled-job handling, and deadline finalization tested; database/Redis outage recovery remains unverified |
| 16 | Evidence persistence | envelope, provenance, tenant scope, redaction (FR-030, evidence-envelope-contract) | contract + adverse tests | no fabricated/cross-tenant evidence; missing measurement never "success" | evidence without provenance | PASS - `evidence.test.ts` (redaction, inline/artifact, tenant, committed-before-crash) |
| 17 | Artifact persistence | R2 object reference, size budget, retention, orphan reclaim (FR-031–035, 042) | contract tests with a fake store, then the real configured store where available | staged-upload retention proven; orphans reclaimed | private artifact exposed; leaked object | PARTIAL - budgets, ordering, key validation, reaper and retention function tested with a memory store; real R2 untested (no credentials); not wired to the retention sweep or a scheduler |
| 18 | Finding materialization | deterministic identity, evidence link, idempotent (FR-028/036/037) | materialization tests incl. retry/partial | one Issue per fingerprint per scan; links intact | duplicate/lost finding | PASS - materialization tests (fingerprint, many-to-many, concurrency, FR-038) |
| 19 | Runtime finalization | single authority, idempotent, no early scan finalization (FR-038, runtime-finalization-contract) | race tests | exactly-once finalize; lease released at the approved boundary | double/premature finalize | PASS - `fahes_finalize_unit` race/atomicity/idempotence tests (DEC-047 A approved) |
| 20 | Audit integrity | unit/finalization events match committed state | rollback tests | no event for a rolled-back operation | false success record | NOT STARTED - no unit/finalization audit event design implemented |
| 21 | Tenant isolation | every entity/lookup tenant-scoped (FR-026/041) | IDOR/adverse tests | cross-tenant read/write refused uniformly | any leak | PARTIAL - tenant filters tested per service; no HTTP surface to attack yet |
| 22 | Security | SSRF/redirect/private-net stay enforced; no secrets in payloads/logs (FR-020) | adverse suite + secret-scan tests | none exploitable | any finding unremediated | PARTIAL - secret-key guard, redaction, key-shape validation tested; no new network surface |
| 23 | Performance | measured baselines (plan resolution, DAG scheduling, queue latency, unit throughput, evidence/artifact write, finalization, sweep) | load harness on dedicated containers; k6 where an HTTP surface exists | baselines recorded, no inconsistency | inconsistency under load | NOT STARTED |
| 24 | Real full-stack | API+PG+Redis+worker as non-superusers | real scan end-to-end, DB/Redis/log inspection | unit states, evidence, links, audit consistent | mocked-only proof | NOT STARTED - no running plan/unit stack exercise |
| 25 | Chrome manual acceptance | the 24-step journey in the charter | real Chrome, throwaway profile; MCP only if actually used | every applicable step has evidence; backend-only features verified by HTTP+DB | unexecuted step reported as pass | NOT STARTED - nothing user-visible exists to drive; backend features verified by DB tests only |
| 26 | Automated regression | unit, adverse, contract, DB, worker, Playwright, typecheck, ESLint, Prettier, Prisma validate | full suites after the final change | no new failure; pre-existing ones root-caused | new failure | PARTIAL - focused suites green (planning/runtime/evidence 218, worker sweep + orchestrator subsets, enum drift); full serial unit run in progress, adverse and Playwright not re-run |
| 27 | Documentation | delta matrix, DoD, backlog, contracts amended through the approved procedure | review | frozen contracts untouched except by approved amendments | silent rewrite | PARTIAL - amendments, decision record, matrix, DoD, backlog, progress current |
| 28 | Git delivery | logical commits, normal push, remote verified | `git ls-remote` | local = remote | unpushed work | PARTIAL - commits local; push after the full-suite result |

**Verdict rule**: SPEC 009 is VERIFIED COMPLETE only if gates 1-28 are PASS (or an approved exclusion is recorded). Historical opening snapshot (superseded by the latest reassessment below): **9 PASS · 13 PARTIAL · 0 BLOCKED · 6 NOT STARTED** of 28 gates. **Verdict: NOT COMPLETE.**

## Independent reassessment — 2026-10-29

The table above is a historical snapshot and several descriptions are stale (notably queue/worker integration and artifact-reaper scheduling). This reassessment applies the stricter current evidence standard: prior test claims were not re-run unless explicitly named below, and direct test-process integration does not establish API/production-worker readiness.

| # | Current status | Current evidence / remaining work |
|---|---|---|
| 1 | PARTIAL | Schema and historical resolver tests inspected; full current contract/adverse suite not rerun. |
| 2 | PARTIAL | Versioned profile implementation inspected; full current profile suite not rerun. |
| 3 | PARTIAL | Snapshot behavior documented in prior evidence; not rerun in this session. |
| 4 | PARTIAL | Resolver/deadline code present; no production caller found for `resolvePlan`; full serial unit/contract/integration workspace passed, but the API producer path is still absent. |
| 5 | PARTIAL | Graph implementation present; full graph/DB constraint suite not rerun. |
| 6 | PARTIAL | Guarded transitions/finalizer present; new runtime integration passes, but full transition/race matrix not rerun. |
| 7 | PARTIAL | Real isolated PG/Redis/BullMQ suite passes 20/20; engine modules now run in a distinct per-unit child with parent-mediated effects, safety checkpoints, and no DB/Redis URL in the child environment. Production engine registration and API plan production remain open. |
| 8 | PARTIAL | `startWorker` now composes per-class consumers/host, continuation, dependent enqueue, and shutdown for locally supplied adapters; no production adapter is registered. |
| 9 | PARTIAL | Plan authorization code present; grant-revocation runtime case passes; complete plan/dispatch scope mutation matrix not run. |
| 10 | PARTIAL | Runtime admits through F07 in the integration test; actual API/worker roles are not used for that path. |
| 11 | PARTIAL | Budget behavior exists in F07; concurrency/oversubscription load test not run. |
| 12 | PARTIAL | Cancellation, kill switch, and grant revocation passed in direct real-infrastructure runtime tests; standard worker lifecycle unverified. |
| 13 | PARTIAL | In-flight scan cancellation passed; API cancellation/refund behavior not exercised end to end. |
| 14 | PARTIAL | A real engine child is killed at its parent hard stop; cancellation, kill switch, lease-loss, and deadline integration paths pass. The full AC-1…20 matrix, production process restart/outage, and race/fairness checks remain. |
| 15 | PARTIAL | Duplicate delivery, stale lease, handling of a seeded RUNNING row, actual execution-worker crash/replacement, child exit on parent IPC disconnect, one confirmed effect, and deadline finalization are covered; database/Redis outage recovery is not run. |
| 16 | PARTIAL | Runtime produced two real evidence rows; full redaction/tenant/crash-contract suite not rerun in this session. |
| 17 | PARTIAL | Reaper handler and scheduler are wired by static inspection; R2 and retention/reaper lifecycle remain unverified. |
| 18 | PARTIAL | Materialization service/tests documented historically; current full concurrency/partial-result suite not rerun. |
| 19 | PARTIAL | Idempotent finalizer exercised by integration; exact privilege fix is fresh-install tested but not applied to shared dev database. |
| 20 | NOT STARTED | No unit/finalization audit-event rollback proof found. |
| 21 | PARTIAL | Tenant-scoped service code inspected; no full IDOR/adverse matrix or real API attack path run. |
| 22 | PARTIAL | Full adverse suite passed, including 116 safety role-isolation tests and 7 CORE-01 role-isolation tests; complete lease-secret, tenant, effect, admission, definer-function, and real service-role matrix remains. |
| 23 | PARTIAL | Passive plan resolution, DAG, BullMQ latency and two 500-job no-op bursts, inline evidence, artifact metadata/memory-store write, planned-unit REFUSED finalization, and failed-scan sweep baselines are recorded in `PERFORMANCE_BASELINE_2026-10-29.md`; sustained load, resource utilization, production engine completion, real R2, outage behavior, and HTTP/k6 remain unverified. |
| 24 | PARTIAL | Direct PG/Redis/BullMQ test is real integration; no API+worker process or HTTP scan lifecycle. Existing healthy containers were observed only. |
| 25 | NOT STARTED | No real Chrome manual acceptance or browser evidence. |
| 26 | PARTIAL | Latest full serial unit/contract/integration passed 243 files / 1,854 tests; latest adverse run passed 72 files / 1,134 tests (1 skipped); visual, Playwright, coverage, and full 49-FR re-review remain. |
| 27 | PARTIAL | This dated report and reassessment were added; full 49-FR re-review and all stale historical documents remain. |
| 28 | PARTIAL | Reviewed changes were committed and pushed; local `HEAD`, `origin/main`, and remote `main` agree. SPEC 009 remains incomplete due to the open gates above. |

**Historical reassessment (superseded by the latest evidence table below): 25 PARTIAL · 3 NOT STARTED · 0 PASS. Verdict: NOT COMPLETE.** At that point this session had not performed complete gate-specific verification for any gate.

### Runtime process isolation update — 2026-10-29

- The preceding hard-stop regression exposed and fixed the dropped child handle and false-finalization risk.
- The worker now forks one clean OS process per non-passive unit, imports only a locally registered workspace module there, and brokers effect authorization, confirmations, evidence, and progress over validated IPC. The child environment excludes database and Redis URLs. The parent arms its timeout before loading the unit and confirms child exit before finalization.
- Real isolated integration passes **20/20**, including a grant revocation during child work delivered through the F07 safety-checkpoint IPC; targeted role-isolation and kill-switch adverse suites pass **127/127**. Worker typecheck, scoped ESLint, scoped Prettier, and `git diff --check` pass. The separately tagged worker image was rebuilt after the checkpoint addition; in-image smoke returned `ENGINE_RESULT`, `PROCEED`, and verified DB/Redis URLs are absent in child evidence.
- DoD gates 7 and 14 remain PARTIAL because no production adapter is registered, the API still has no production plan-to-queue producer path, and the complete adverse/deadline/race matrix is not verified.

### Verification update — 2026-10-29

- The latest serial unit/contract/integration workspace passed against fresh disposable PostgreSQL and isolated Redis: **243/243 files, 1,854/1,854 tests**.
- The serial adverse workspace passed against the same disposable services: **72/72 files, 1,134 passed, 1 skipped**. This includes expanded safety role-isolation and real Chromium SSRF checks for probe-pool boundaries.
- The full-suite failures found earlier were fixed: blank `EMAIL_TRANSPORT` now behaves as omitted and selects the documented production SMTP default; the sandbox-unconfigured contract removes the repository `.env` URL before checking that path.
- The 28-gate count remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**. Production API plan dispatch, production adapter registration, complete least-privilege matrix, visual/Playwright, manual browser journey, load, coverage, and real R2 evidence remain incomplete.

## Final verification update — 2026-10-29

This is the current gate assessment and supersedes the earlier count above. Evidence was collected only on disposable PostgreSQL at `127.0.0.1:5545` and isolated Redis at `127.0.0.1:6391`, except for the explicitly disclosed E2E harness misrouting recorded in the verification report. A scoped local performance baseline is recorded; the production API-to-plan path, production engine registry, real R2, sustained capacity/resource measurements, instrumented coverage, and manual Chrome journey remain open.

| # | Current status | Current evidence / remaining work |
|---|---|---|
| 1 | PASS | Full unit/contract workspace passes configuration schema and hostile input/refusal tests. |
| 2 | PASS | Versioned profile resolution and invalid mapping tests pass. |
| 3 | PASS | Snapshot immutability after profile publication is covered in the full suite. |
| 4 | PASS | Resolver determinism and fail-closed behavior pass; there is still no production caller. |
| 5 | PASS | DAG ordering, cycles, eligibility and database constraints pass. |
| 6 | PASS | 110 transition pairs, terminal freeze and finalization races pass on PostgreSQL. |
| 7 | PARTIAL | Real isolated Redis/BullMQ queue dispatch and standard worker composition pass; API production producer and production adapters are absent. |
| 8 | PARTIAL | Per-class child host and F07 runtime path pass with a test adapter; no production engine is registered. |
| 9 | PARTIAL | Plan/dispatch authorization and revocation are tested; full expire/narrow/revoke matrix is open. |
| 10 | PARTIAL | Runtime uses F07 and `ExecutionUnit.id`; API plan resolution/F01 queries and execution-host runtime are separately exercised under real login roles, but the composed production API/worker path is not exercised. |
| 11 | PARTIAL | F07 budget enforcement is covered; unit-path oversubscription/performance evidence is absent. |
| 12 | PARTIAL | Kill/cancel/revoke/lease-loss distinctions pass integration; all status/race combinations are not proven. |
| 13 | PARTIAL | Runtime cancellation passes; HTTP cancel plus existing refund lifecycle is not verified end to end. |
| 14 | PARTIAL | Deadline, hard stop, checkpoint, sweep, expiry, and engine evidence fencing pass targeted tests; AC-1 has the legacy 15-minute boundary regression, AC-7 fresh-read refund staleness tests (2/2), AC-12 now exercises a running active test adapter through the live repeat sweep within the 10-second sweep/host-loop bound, AC-13 includes a module-finalizer/sweep interleaving that prevents stale master enqueue, AC-16 a real pre-child DISPATCHED expiry with lease release/dependent BLOCKED/test-handle termination (dispatch suite 22/22), and AC-20 the passive dispatch bypass. The full AC-1…20 race/fairness matrix, production-engine backstop, and deployed clock-skew bound remain open. |
| 15 | PARTIAL | Duplicate delivery, handling of a seeded RUNNING row, actual worker process crash/replacement, and isolated child cleanup are covered; PostgreSQL/Redis outage recovery is not. |
| 16 | PASS | Evidence envelope, provenance, tenant scoping and redaction tests pass in the full suite. |
| 17 | PARTIAL | Fake-store budget/retention/reaper tests and wiring exist; real R2 lifecycle is unverified. |
| 18 | PASS | Fingerprint materialization, evidence links, retry/partial and concurrency tests pass. |
| 19 | PASS | Finalizer atomicity/idempotence and lease boundary races pass on isolated PostgreSQL. |
| 20 | PASS | A forced failure after F07 lease release proves the release audit event, lease mutation, and terminal unit write roll back together; a successful retry commits exactly one `BUDGET_RELEASED` event. The SPEC 009 finalizer intentionally writes no duplicate F07 event. |
| 21 | PARTIAL | Service-level tenant isolation passes; full production HTTP IDOR path is not exposed. |
| 22 | PARTIAL | CORE-01 real-LOGIN privilege suite passes 24/24, including exact table/function grant matrices, cross-tenant resolver refusal through `fahes_api`, and direct claim/effect ledger and host-only lease-helper access attempts. A throwaway production-compose project migrated 35 migrations, provisioned separate API/worker logins, and brought both services healthy; each used its own non-superuser group role and received no admin/provisioning secret. The existing local production-compose stack still runs API and worker as `webaudit_local` superuser with full sensitive-table DML; it was left untouched. Actual deployment credential verification and broader runtime abuse remain open. |
| 23 | PARTIAL | `PERFORMANCE_BASELINE_2026-10-29.md` records DAG, passive resolver, BullMQ latency and no-op burst, evidence/artifact metadata, planned-unit finalization, and failed-scan sweep measurements on isolated PostgreSQL/Redis. The worker also emits tested per-unit child CPU/RSS telemetry; sustained load, production-engine/resource utilization, real R2, outages, and HTTP/k6 remain unmeasured. |
| 24 | PARTIAL | Full Chromium E2E passes 93/93 and exercises the existing HTTP scan flow to completion, but source inspection confirms `/scans` does not call `resolvePlan` and production worker configuration registers no SPEC 009 execution adapters. This proves the legacy scan path, not the production API→plan→durable-queue→worker path. |
| 25 | PARTIAL | Playwright MCP inspected isolated-stack home/login at 1440px and login at 390px; screenshots are in `browser-evidence/`. The mobile login fits the viewport. The separate 24-step manual acceptance is incomplete; visual project has 17 TODO parity comparisons, and OAuth/real-email flows were not exercised. |
| 26 | PARTIAL | Full isolated unit/contract/integration passed 244/244 files and 1,874/1,874 tests; adverse passed 73/73 files, 1,153 passed and 1 skipped; Playwright E2E passed 93/93; `execution-runtime.test.ts` passed 24/24; CORE-01 real-login matrix 24/24. Visual project passed 8 checks with 17 TODO comparisons. Targeted SPEC 009 V8 coverage across 25 files is 87.06% lines, 88.28% functions, and 80.89% branches (not workspace-wide). Workspace typecheck passed 30/30 packages and Prisma validation passed. Lint passes when excluding generated `.next-final-cta-verify`; full format check still flags 322 files, so repository-wide gates remain partial. |
| 27 | PASS | Requirement matrix includes all 49 FR entries; DoD, backlog, progress, report were reconciled, and no frozen contract was rewritten. |
| 28 | PARTIAL | The previous scoped delivery is on `origin/main` at `e03577d6`; this continuation's crash/replacement implementation and evidence updates are local and uncommitted. Remote `main` still matches the base commit; this continuation has not been pushed. |

**Current count: 11 PASS · 17 PARTIAL · 0 FAIL · 0 BLOCKED · 0 NOT STARTED. Verdict: NOT COMPLETE.** E2E and browser evidence advances gates 24/25 to PARTIAL; it does not close missing production wiring, visual parity, R2, observability, complete performance coverage, or manual acceptance gates.

### Browser, E2E, coverage and quality continuation — 2026-10-29

- Full Playwright CLI E2E passed **93/93** in 22.6 minutes using isolated PostgreSQL `127.0.0.1:5545`, Redis `127.0.0.1:6391`, and real Chromium. Journeys covered public/auth pages, scan submission and legacy completion, results, cancellation, admin, billing, English/Arabic, and responsive layouts. No production SPEC 009 plan execution was exercised.
- Playwright MCP inspected home desktop (1440x1000), login desktop (1440x1000), and login mobile (390x844). Screenshots are under `browser-evidence/`. The mobile login fits the viewport. Anonymous auth 401s were expected; the homepage also requested a missing `/favicon.ico` (low-severity UI defect). No production user data was used.
- Visual project: **8 passed, 17 TODO**. Targeted V8 coverage over 25 SPEC 009 planning/runtime/worker files: **87.06% lines, 88.28% functions, 80.89% branches**. Child-process entry coverage is limited because the child is not instrumented; this is not full-workspace coverage.
- Workspace typecheck passed **30/30 packages**; Prisma schema validation passed. ESLint passes with generated untracked `apps/web/.next-final-cta-verify/**` excluded; root lint otherwise reports parser errors from that generated output. Oxlint design adherence passed. Root format check still reports 322 files; no unrelated files were mass-formatted. `git diff --check` passes with the pre-existing migration CRLF warning.
- Remaining acceptance includes the production API-to-plan/queue path, registered production engine adapters and termination backstop, outage/R2 evidence, deployed clock bound, sustained production-relevant load, full visual reference comparisons, and all applicable steps in the 24-step manual journey. Verdict remains **NOT COMPLETE**.

### Evidence-fence continuation — 2026-10-29

- A fresh isolated PostgreSQL database received all **35 migrations**. The new additive `20261030210000_core01_execution_evidence_fence` helper is owned by `fahes_owner`; it acquires the unit/scan locks, verifies the database-clock deadline and immutable claim, and is executable only by `fahes_exec_host`. `fahes_owner` receives only column-level `UPDATE("startedAt")` on `Scan` to permit the lock; the helper itself never updates the row and the host role still cannot update `Scan`.
- API evidence tests passed **25/25**, including terminal unit, terminal scan, expired deadline, and permissive post-terminal registry evidence. The real PostgreSQL/Redis/BullMQ worker integration passed **21/21**, including evidence writes through a non-superuser host login and an assertion that direct host-role `Scan.startedAt` updates are denied.
- The serialized resolver, dispatch/host-loop, expiry, planned-sweep, and plan-gate checks passed **125/125** across four files; CORE-01 schema/immutability passed **17/17**; refund-staleness adverse checks passed **2/2**. The timeout-vs-finalization race passed with one `TIMED_OUT` scan, no master enqueue, and one refund. T-U1-1 through T-U1-9 are checked in `tasks.md`; T-U1-10 remains open because several ACs still need explicit bounded timing and restart/progress evidence. DoD gate 14 remains PARTIAL; overall verdict remains **NOT COMPLETE**.
- These scoped implementation and documentation changes are local and uncommitted at this update. User-owned website/auth changes and unrelated working files were left untouched.

| AC | Current evidence | Status |
|---|---|---|
| 1–4 | Legacy no-plan sweep; passive-only deadline; long-plan expiry; ceiling/grant refusals (`planned-timeout-sweep.test.ts`, `resolver.test.ts`) | COVERED |
| 5 | Mutable progress and duplicate delivery preserve the immutable deadline; a real execution-worker crash/replacement leaves one host claim and one confirmed effect, cleans up the child, and finalizes the unit at the unchanged plan deadline | COVERED |
| 6 | Concurrent deadline sweep and matching unit finalization; terminal scan and one refund | COVERED |
| 7 | Fresh-read refund regressions for legacy and planned passes (`timeout-refund-staleness.test.ts`) | COVERED |
| 8–10 | Stop precedence, stale evidence/finalization fencing, and refusal before F07/budget (`runtime.test.ts`, evidence tests, `dispatch.test.ts`) | COVERED |
| 11 | Later dependent unit refused when its shared deadline leaves insufficient time (`dispatch.test.ts`) | COVERED |
| 12 | Live repeat scheduler self-heals a PLANNED unit and terminates a RUNNING BROWSER test-adapter unit through its registered expiry hook within the sweep/host-loop bound; production-engine timing/backstop remains absent | PARTIAL |
| 13 | Timeout sweep wins during a module-result finalizer and concurrent gates compete; the DB-clock CAS elects one `RUNNING_MASTER` continuation and the winning phase job carries `alreadyTransitioned` (`planned-timeout-sweep.test.ts`, `execution-runtime.test.ts`) | COVERED |
| 14–16 | No F01/F07 contract/type edits; stop precedence and pre-run expiry/topological refusal tests pass | COVERED |
| 17 | New comparisons use database time and legacy regression passes; isolated PostgreSQL tests skew the worker clock 10 hours in both directions and still follow database time. Deployed NTP/skew bound is unverified | PARTIAL |
| 18 | Gate refuses continuation after deadline; sweep transitions the scan to `TIMED_OUT` | COVERED |
| 19 | Isolated child termination and deferred expiry are tested; production engine backstop is not registered in SPEC 009 | PARTIAL |
| 20 | Passive classes remain on legacy queue and are ignored by non-passive dispatch | COVERED |

This is an evidence index, not closure of T-U1-10. The partial rows keep the complete AC matrix open.

### Progress/redelivery deadline check — 2026-10-29

- The isolated worker integration case passed **1/1** on disposable PostgreSQL and Redis. It writes a mutable `ExecutionUnit.progressSnapshot`, delivers duplicate queue jobs, confirms exactly one durable host claim, and verifies the owning `ScanPlan.deadlineMs` is unchanged. The schema suite separately rejects direct updates to the immutable plan deadline.
- The earlier progress/redelivery snapshot left AC-5 PARTIAL because it did not simulate a process restart; the later worker crash/replacement evidence below now covers AC-5. AC-12, AC-17, and AC-19 remain open for active-engine termination, deployed clock-skew evidence, and a production engine backstop. T-U1-10 and SPEC 009 remain open.
- The production API still has no `resolvePlan` caller, and the production worker registers no SPEC 010–012 engine adapter. The parallel-run contract keeps current passive scans on the existing scan-phase path; wiring every passive scan into plan execution would need an explicit contract/cutover decision before changing production behavior.

### CORE-01 privilege matrix follow-up — 2026-10-29

- The expanded real-LOGIN-role suite passes **22/22** against the 35-migration disposable PostgreSQL database. It now compares effective table-level privileges for every CORE-01 table across API, generic worker, execution host, orchestrator, operator, and an ungrouped role, and checks the exact execute matrix plus absence of `PUBLIC EXECUTE` for every CORE-01 SECURITY DEFINER function.
- The catalog check confirms no runtime role has table-level `TRUNCATE`, `REFERENCES`, or `TRIGGER`; expected API insert/read access, host append/lifecycle access, orchestrator artifact cleanup, and operator read-only access match the declared matrix. Existing real-login tests continue to cover selected column grants, denial of direct terminal writes, raw F07 table denial, and cross-plan dependency rejection.
- Gate 22 remains PARTIAL: tenant/effect abuse cases and the full deployed API/worker service-role flow have not been demonstrated. This test validates grants on the isolated database only; the production/dev service credentials are not least-privilege verified.

### AC-5 worker process crash/restart follow-up — 2026-10-29

- The isolated PostgreSQL/Redis/BullMQ runtime suite now passes **22/22**. A dedicated case runs a real worker process with a non-superuser execution-host login, confirms one F07-authorized effect, kills the host process, starts a replacement, and waits for BullMQ to fail the stalled job without re-claiming the `RUNNING` unit.
- The test confirms the execution child exits after host IPC disconnect, the host-claim count and confirmed-effect count remain one, and `ScanPlan.deadlineMs` is unchanged. After moving the scan start time beyond that fixed deadline, `expirePlanUnits` finalizes the unit as `FAILED`.
- AC-5 is COVERED by the combined progress, duplicate-delivery, consumer-recreation, and process crash/replacement evidence. AC-12 remains PARTIAL for active-engine termination, AC-17 for deployed clock skew, and AC-19 for a production-engine backstop; gate 15 remains PARTIAL for PostgreSQL/Redis outage recovery.

### AC-12 live sweep cadence follow-up — 2026-10-29

- The complete `planned-timeout-sweep.test.ts` file passed **12/12** on isolated PostgreSQL and Redis. A new test schedules the production `timeout-sweep` repeat job at the supported 5-second minimum, waits for an empty sweep to complete, then creates a terminal scan with a `PLANNED` unit and measures until the next scheduled sweep terminalizes it.
- The measured assertion is bounded by the configured 5-second sweep interval plus the contract's 5-second host-loop allowance. This verifies the PLANNED/no-child case through the real BullMQ scheduler and production sweep handler. AC-12 remains PARTIAL for active-engine termination/confirmation under registered production adapters, which SPEC 010–012 have not supplied.

### AC-12 engine expiry-hook wiring follow-up — 2026-10-29

- `createTimeoutSweepHandler` now receives the same execution adapter registrations as the worker host. For RUNNING units it calls the matching adapter's `onUnitExpired`; missing hooks remain `PENDING`, passive units retain immediate termination semantics, and each adapter's `hardStopMarginMs` controls the unconfirmed-termination backstop. `createAdapterRegistry` rejects a non-passive engine with no expiry hook.
- The integration suite verifies both confirmed termination and PENDING behavior inside the engine-specific margin. `planned-timeout-sweep.test.ts` and the new registry test pass **15/15** on isolated PostgreSQL and Redis; worker typecheck passes.
- This closes the SPEC 009 worker composition gap, not the production-engine gap: no SPEC 010–012 adapter/backstop is registered, so AC-12/19 remain PARTIAL. SPEC 009 remains NOT COMPLETE.

### Full regression refresh — 2026-10-29

- Full serial unit/contract/integration workspace passed **244/244 files, 1,864/1,864 tests**. Full adverse workspace passed **73/73 files, 1,151 passed, 1 skipped**. Both used the disposable PostgreSQL database and isolated Redis `127.0.0.1:6391`.
- `vitest.workspace.ts` now honors `TEST_REDIS_URL`; the production-mode cookie integration child also reads that variable rather than hardcoding the local Redis URL. The cookie suite passed **2/2** against the isolated endpoint.
- API and worker typechecks, scoped ESLint, Prettier, and `git diff --check` pass. Previous full Playwright E2E evidence is **93/93**; it was not rerun in this refresh. Visual comparison remains **8 passed, 17 todo** in the latest recorded visual run, so parity is not established. Gate 26 remains PARTIAL.

### Prior full-suite failure follow-up — 2026-10-29

- Re-ran the production email boot guard with `EMAIL_TRANSPORT` explicitly empty against disposable PostgreSQL and Redis: **3/3 passed**. This covers the earlier blank-variable regression and both configured SMTP startup paths.
- Re-ran the sandbox-unconfigured capability contract with test-only JWT configuration and isolated PostgreSQL/Redis: **1/1 passed**. The test clears `SANDBOX_RUNNER_URL` itself before asserting the unconfigured response.
- Updated the email boot-guard child-process test to use `TEST_REDIS_URL` or the dedicated `EXEC_TEST_REDIS` endpoint, so it no longer hardcodes the shared development Redis DB 15. The full serial workspace was not rerun after these test-only changes; the last full pass remains the dated evidence in `FINAL_VERIFICATION_REPORT_2026-10-29.md`. Gate 26 remains PARTIAL for the still-open visual, manual, coverage, and SPEC 009 acceptance scope.

### AC-1 legacy boundary follow-up — 2026-10-29

- `planned-timeout-sweep.test.ts` passes **15/15** on a fresh isolated PostgreSQL database and isolated Redis. The added no-plan case verifies a scan at 14m50s remains `RUNNING_PHASE_1` without a refund; after moving it beyond 15 minutes, the sweep sets `TIMED_OUT` and records exactly one refund.
- Gate 14 remains PARTIAL. This adds the explicit legacy regression assertion, while the full AC-1…AC-20 matrix, production-engine termination backstop, and deployed NTP/skew bound remain unverified. T-U1-10 and overall SPEC 009 remain open.

### AC-20 passive dispatch follow-up — 2026-10-29

- `dispatch.test.ts` passes **21/21** on isolated PostgreSQL. Its expired-plan passive-unit case exits to `PASSIVE_LEGACY_QUEUE` before deadline step 0; the unit remains `PLANNED` without a host claim, F07 admission, lease, or budget counter.
- This verifies the passive compatibility boundary. Gate 14 remains PARTIAL because the remaining AC matrix, production-engine termination backstop, and deployed clock-skew bound are open.

### AC-7 fresh refund-read recheck — 2026-10-29

- `apps/worker/tests/adverse/timeout-refund-staleness.test.ts` passes **2/2** against isolated PostgreSQL/Redis. Legacy and planned timeout cases persist a module result after the batch candidate snapshot but before that scan's refund decision; the fresh transaction sees the delivered module and refunds only the remaining module.
- This verifies stale-snapshot refund handling, not the entire unit-finalization/refund race matrix. Gate 14 and T-U1-10 remain PARTIAL/open.

### AC-16 dispatched-unit expiry follow-up — 2026-10-29

- Added a real dispatch-to-expiry race: dispatch obtains F07 admission and reaches `DISPATCHED`, then waits at the inert-child fork boundary. The plan expires before the child can run; expiry marks the unit `REFUSED`, blocks its dependent, and releases its lease. Resumed dispatch loses the state race and calls `terminate()` on the inert-child test handle; no second admission or effect authorization occurs.
- `dispatch.test.ts` passes **22/22** against isolated PostgreSQL. This covers the dispatched pre-child state only; full U-1 race/fairness coverage and production-engine evidence remain open.

### AC-13 atomic continuation claim follow-up — 2026-10-29

- The gate now calls the worker state-machine's one database-clock CAS for `RUNNING_PHASE_3 -> RUNNING_MASTER` after registered module-result finalizers. Exactly one concurrent caller can enqueue master synthesis; a timeout sweep or another caller that wins first closes the continuation path.
- The winning path publishes the state event and marks the queued master job `alreadyTransitioned`, so the worker does not repeat the state move.
- `planned-timeout-sweep.test.ts` passes **17/17** and `execution-runtime.test.ts` passes **22/22** on isolated PostgreSQL and Redis. The worker composition suite verifies the persisted `RUNNING_MASTER` state and queued `alreadyTransitioned=true` payload. API/worker typechecks, targeted ESLint, source Prettier, and `git diff --check` pass. This closes the tested gate race, not T-U1-10: production-engine termination and deployed clock-skew evidence remain open. DoD gate 14 remains PARTIAL and SPEC 009 remains **NOT COMPLETE**.

### Full regression refresh after AC-13 continuation — 2026-10-29

- The full serial `pnpm test` workspace passed **244/244 files, 1,872/1,872 tests** against disposable PostgreSQL `m009_closure_unit_test` and isolated Redis `127.0.0.1:6391`.
- The full serial `pnpm test:adverse` workspace passed **73/73 files, 1,153 passed, 1 skipped** against the same disposable services. The skip is in `packages/capability-sdk/tests/adverse/context-confinement.test.ts`.
- The focused AC-13 integration files also pass: `planned-timeout-sweep.test.ts` **17/17** and `execution-runtime.test.ts` **22/22**. API/worker typechecks, scoped ESLint, source Prettier, and `git diff --check` passed in this continuation.
- This refresh updates gate 26's automated suite evidence only. It does not close the production API-to-queue path, registered SPEC 010–012 engine termination/backstop, deployed clock-skew bound, full visual/manual acceptance, or outage/R2 gates. SPEC 009 remains **NOT COMPLETE**.

### U-1 acceptance-criteria evidence audit — 2026-10-29

This table is a source-and-test audit of the 20 U-1 acceptance criteria. “Covered” means the named local implementation and regression evidence exist; it does not imply that a missing production adapter or deployment condition has been proven.

| AC | Current evidence | Audit result |
|---|---|---|
| 1 | `planned-timeout-sweep.test.ts`: no-plan legacy boundary immediately below/above 15 minutes; one timeout/refund. | Covered. |
| 2 | `plan-deadline.test.ts` passive-only rule and `resolver.test.ts` passive-only plan. | Covered. |
| 3 | `planned-timeout-sweep.test.ts`: planned scan survives the legacy 15-minute threshold and expires at its plan deadline. | Covered. |
| 4 | `plan-deadline.test.ts` ceiling/grant-bound cases; `resolver.test.ts` persisted refusal before debit; `core01-schema.test.ts` bounded deadline invariant. | Covered. |
| 5 | `execution-runtime.test.ts`: progress, duplicate delivery, consumer recreation, immutable deadline; real worker crash/replacement does not replay a confirmed effect. | Covered in isolated worker runtime. |
| 6 | `planned-timeout-sweep.test.ts`: completion-versus-expiry race, guarded terminal transition and refund behavior. | Covered in isolated PostgreSQL. |
| 7 | `timeout-refund-staleness.test.ts`: fresh module-result read for both legacy and planned refunds. | Covered in isolated PostgreSQL. |
| 8 | `runtime.test.ts` stop precedence across unit states; `dispatch.test.ts` pending-stop versus expired deadline. | Covered at the API/runtime boundary. |
| 9 | `evidence.test.ts`: engine evidence requires current RUNNING claim and an unexpired database-clock deadline; registry evidence remains permitted after unit completion. `execution-runtime.test.ts` rejects stale host finalization. | Covered in isolated PostgreSQL/worker runtime. |
| 10 | `dispatch.test.ts`: expired/insufficient deadline refusal occurs before F07 admission, lease and budget effects. | Covered. |
| 11 | `dispatch.test.ts`: later chained unit is refused when remaining time is below its threshold. | Covered. |
| 12 | `planned-timeout-sweep.test.ts`: live repeat scheduler, registered test-adapter expiry hook, per-adapter hard-stop margin, pending and confirmed termination. | Component and test-adapter path covered; production SPEC 010–012 adapter termination remains unavailable/unverified. |
| 13 | `planned-timeout-sweep.test.ts`: concurrent continuation CAS and sweep/finalizer race; `execution-runtime.test.ts`: persisted state and queued `alreadyTransitioned` composition. | Covered in isolated PostgreSQL/Redis/BullMQ. |
| 14 | Current SPEC 009 diff review found no edits to F01/F07 contracts, shared enums, or audit event types. | Preserved by source-scope review; no independent immutable-baseline check exists. |
| 15 | `runtime.test.ts`: an F07 stop remains pending with its lease held, then resolves as bounded `TERMINATION_UNCONFIRMED`, never deadline `TIMEOUT`. | Covered at runtime component boundary. |
| 16 | `dispatch.test.ts`: expiry after DISPATCHED and before child start refuses the unit, blocks its dependent, releases its lease, and terminates the inert child handle. | Covered in isolated PostgreSQL. |
| 17 | `runtime.test.ts`: database time wins with worker clocks 10 hours ahead and behind; sweep tests preserve the legacy no-plan timeout. | Database-clock behavior covered; deployed NTP/skew-bound evidence remains open. |
| 18 | `planned-timeout-sweep.test.ts`: post-deadline gate refusal and finalizer/sweep race; the database-clock CAS prevents late master enqueue. | Covered in isolated PostgreSQL/Redis. |
| 19 | `runtime.test.ts` and `planned-timeout-sweep.test.ts`: F07 lease remains held during pending termination and releases on confirmation or bounded unconfirmed outcome. | Contract-level behavior covered; production engine host quarantine/backstop remains unverified. |
| 20 | `dispatch.test.ts`: expired-plan passive unit bypasses step 0 without claim, F07, lease or budget effects. | Covered. |

U-1 has regression evidence for the stated criteria, but AC-12/19 are not production-engine verified and AC-17 lacks deployed clock evidence. Therefore T-U1-10 and DoD gate 14 remain PARTIAL/open; no criterion is being called production-complete on the strength of test adapters. This does not close the separate API-to-queue, real R2/outage, visual, or manual acceptance gates.

### Cross-device progress recovery continuation — 2026-10-29

- `GET /scans/:id` returns tenant-scoped, safe plan/unit progress snapshots for reconnect recovery. Scan-owned worker ticks reach the existing authorized scan-room fanout as typed `execution:progress` events while retaining `unit-progress:<id>` publishing for current consumers. Labels are redacted before persistence/publication; realtime validation and the UI preserve indeterminate progress honestly.
- Focused regression run: 5 files, **66/66 passed** across scan GET contract, progress redaction and publication, realtime fanout, worker lifecycle, and UI recovery rendering. Workspace typecheck passed 30/30 packages; focused ESLint and Prettier passed. Visual mechanism run passed **8**, with **17 TODO** comparisons; it establishes no screenshot parity.
- After this continuation, the full serial unit/contract/integration suite passed **244 files / 1,882 tests**, and the full adverse suite passed **73 files / 1,153 tests / 1 skipped** on isolated PostgreSQL/Redis. Chromium E2E **93/93** is prior evidence and was not rerun in this closure pass. Gate 26 remains PARTIAL. The 28-gate count remains **11 PASS · 17 PARTIAL · 0 FAIL · 0 BLOCKED · 0 NOT STARTED**; SPEC 009 remains **NOT COMPLETE**.

### FR-043 per-engine telemetry continuation — 2026-10-29

- The execution host emits a structured `execution.unit.telemetry` event after successful terminal finalization. Fields are derived from the persisted unit row and include engine/class, attempt, status, failure class, database-stamped queue wait and execution duration, cost micros, host-local active count, termination event, child process CPU times/RSS and platform, and a derived engine-health signal.
- Child resource values cross the existing local child IPC channel through a strict numeric/platform validator. Telemetry contains no execution configuration, target URL, credentials, evidence payload, or user-supplied strings; production uses the existing redacting structured logger.
- Real isolated PostgreSQL/Redis/BullMQ integration tests verify successful telemetry with secret/config omission, infrastructure failure classification/degraded health, and F07 operator-kill reason/STOPPED health. The full execution-runtime file passed **24/24**; worker TypeScript check passed.
- FR-043 is now **PARTIAL**, not complete: no production SPEC 010–012 engine exists, no deployed log aggregation/health dashboard is wired, and no load-level resource or cross-host concurrency baseline has been measured. DoD gate 23 remains PARTIAL.

### Latest regression refresh after telemetry changes — 2026-10-29

- Full serial unit/contract/integration workspace passed **244/244 files and 1,874/1,874 tests** on isolated PostgreSQL and Redis. Full adverse workspace passed **73/73 files, 1,153 passed, 1 skipped**; the skipped capability-sdk context-confinement case is unchanged.
- The full execution-runtime lifecycle integration file passed **24/24**, including success/failure/kill telemetry and actual worker crash/replacement. Worker TypeScript, scoped ESLint, and Prettier checks passed.
- SPEC 009 remains **NOT COMPLETE**. Open production engine, API-to-queue, termination/backstop, deployed clock, R2/outage, visual/manual acceptance, and sustained-load gates remain as listed above.
