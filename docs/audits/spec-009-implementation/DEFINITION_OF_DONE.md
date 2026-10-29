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
| 14 | Deadline enforcement | U-1 whole contract (FR-047, AC-1…20) | adverse AC-1…AC-20 incl. DB clock, kill-vs-deadline, sweep-vs-gate race, refund fairness, legacy regression | all ACs green | any AC failing; legacy timeout behaviour changed | PARTIAL - T-U1-1..9 checked; AC-5/12/17/19 still have restart/progress, timing-bound, or production-engine evidence gaps; T-U1-10 remains open |
| 15 | Failure recovery | crash/restart/redelivery safe (FR-018/024) | failure injection on dedicated containers | recovery without double effect | stuck or duplicated unit | NOT STARTED - no failure injection on a running stack yet |
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

**Verdict rule**: SPEC 009 is VERIFIED COMPLETE only if gates 1-28 are PASS (or an approved exclusion is recorded). Current state (counted from the table, 2026-10-29 end of session): **9 PASS · 13 PARTIAL · 0 BLOCKED · 6 NOT STARTED** of 28 gates. **Verdict: NOT COMPLETE.**

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
| 15 | PARTIAL | Duplicate delivery, stale lease, and persisted RUNNING recovery covered; actual process restart/outage recovery not run. |
| 16 | PARTIAL | Runtime produced two real evidence rows; full redaction/tenant/crash-contract suite not rerun in this session. |
| 17 | PARTIAL | Reaper handler and scheduler are wired by static inspection; R2 and retention/reaper lifecycle remain unverified. |
| 18 | PARTIAL | Materialization service/tests documented historically; current full concurrency/partial-result suite not rerun. |
| 19 | PARTIAL | Idempotent finalizer exercised by integration; exact privilege fix is fresh-install tested but not applied to shared dev database. |
| 20 | NOT STARTED | No unit/finalization audit-event rollback proof found. |
| 21 | PARTIAL | Tenant-scoped service code inspected; no full IDOR/adverse matrix or real API attack path run. |
| 22 | PARTIAL | Full adverse suite passed, including 116 safety role-isolation tests and 7 CORE-01 role-isolation tests; complete lease-secret, tenant, effect, admission, definer-function, and real service-role matrix remains. |
| 23 | NOT STARTED | No measured SPEC 009 performance baseline or k6 run. |
| 24 | PARTIAL | Direct PG/Redis/BullMQ test is real integration; no API+worker process or HTTP scan lifecycle. Existing healthy containers were observed only. |
| 25 | NOT STARTED | No real Chrome manual acceptance or browser evidence. |
| 26 | PARTIAL | Latest full serial unit/contract/integration passed 243 files / 1,854 tests; latest adverse run passed 72 files / 1,134 tests (1 skipped); visual, Playwright, coverage, and full 49-FR re-review remain. |
| 27 | PARTIAL | This dated report and reassessment were added; full 49-FR re-review and all stale historical documents remain. |
| 28 | PARTIAL | Reviewed changes were committed and pushed; local `HEAD`, `origin/main`, and remote `main` agree. SPEC 009 remains incomplete due to the open gates above. |

**Current reassessment: 25 PARTIAL · 3 NOT STARTED · 0 PASS. Verdict: NOT COMPLETE.** The zero PASS count is deliberate: the current DoD requires end-to-end evidence for each gate and this session did not perform the complete gate-specific verification for any one gate.

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

This is the current gate assessment and supersedes the earlier count above. Evidence was collected only on disposable PostgreSQL at `127.0.0.1:5545` and isolated Redis at `127.0.0.1:6391`, except for the explicitly disclosed E2E harness misrouting recorded in the verification report. The API-to-plan production path, production engine registry, real R2, performance baseline, instrumented coverage, and manual Chrome journey remain absent.

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
| 14 | PARTIAL | Deadline, hard stop, checkpoint, sweep, expiry, and engine evidence fencing pass targeted tests; T-U1-9 is complete. The full AC-1…20 race/fairness matrix remains open. |
| 15 | PARTIAL | Duplicate delivery and persisted RUNNING recovery are covered; actual worker restart/outage recovery is not. |
| 16 | PASS | Evidence envelope, provenance, tenant scoping and redaction tests pass in the full suite. |
| 17 | PARTIAL | Fake-store budget/retention/reaper tests and wiring exist; real R2 lifecycle is unverified. |
| 18 | PASS | Fingerprint materialization, evidence links, retry/partial and concurrency tests pass. |
| 19 | PASS | Finalizer atomicity/idempotence and lease boundary races pass on isolated PostgreSQL. |
| 20 | NOT STARTED | No unit/finalization audit-event rollback proof. |
| 21 | PARTIAL | Service-level tenant isolation passes; full production HTTP IDOR path is not exposed. |
| 22 | PARTIAL | Secret-key guard, redaction, key-shape validation, and SSRF/redirect/private-network adverse tests pass; the new plan-role work adds no network surface. |
| 23 | NOT STARTED | No SPEC 009 measured performance baseline or k6 run. |
| 24 | NOT STARTED | The API planning and F01 services now pass through real `fahes_api` login credentials, and the worker runtime passes separately through a real execution-host login. A production HTTP API→plan→durable-queue→worker scan remains absent. |
| 25 | NOT STARTED | No manual Chrome journey was performed. |
| 26 | PARTIAL | Full unit/contract/integration, adverse, Playwright, targeted typechecks and Prisma checks pass. `pnpm test:visual` is 8 passed / 17 todo; design-reference comparisons are still todo, and the required <=0.5% 1440/390 visual proof is absent. |
| 27 | PASS | Requirement matrix includes all 49 FR entries; DoD, backlog, progress, report were reconciled, and no frozen contract was rewritten. |
| 28 | PASS | Scoped changes are pushed normally; delivery hash will be recorded after remote verification. |

**Current count: 11 PASS · 13 PARTIAL · 0 FAIL · 0 BLOCKED · 4 NOT STARTED. Verdict: NOT COMPLETE.** Full browser/unit/security test suites do not close missing production wiring, visual parity, R2, observability, performance, audit, or manual acceptance gates.

### Evidence-fence continuation — 2026-10-29

- A fresh isolated PostgreSQL database received all **35 migrations**. The new additive `20261030210000_core01_execution_evidence_fence` helper is owned by `fahes_owner`; it acquires the unit/scan locks, verifies the database-clock deadline and immutable claim, and is executable only by `fahes_exec_host`. `fahes_owner` receives only column-level `UPDATE("startedAt")` on `Scan` to permit the lock; the helper itself never updates the row and the host role still cannot update `Scan`.
- API evidence tests passed **25/25**, including terminal unit, terminal scan, expired deadline, and permissive post-terminal registry evidence. The real PostgreSQL/Redis/BullMQ worker integration passed **21/21**, including evidence writes through a non-superuser host login and an assertion that direct host-role `Scan.startedAt` updates are denied.
- The serialized resolver, dispatch/host-loop, expiry, planned-sweep, and plan-gate checks passed **125/125** across four files; CORE-01 schema/immutability passed **17/17**; refund-staleness adverse checks passed **2/2**. The timeout-vs-finalization race passed with one `TIMED_OUT` scan, no master enqueue, and one refund. T-U1-1 through T-U1-9 are checked in `tasks.md`; T-U1-10 remains open because several ACs still need explicit bounded timing and restart/progress evidence. DoD gate 14 remains PARTIAL; overall verdict remains **NOT COMPLETE**.
- These scoped implementation and documentation changes are local and uncommitted at this update. User-owned website/auth changes and unrelated working files were left untouched.

| AC | Current evidence | Status |
|---|---|---|
| 1–4 | Legacy no-plan sweep; passive-only deadline; long-plan expiry; ceiling/grant refusals (`planned-timeout-sweep.test.ts`, `resolver.test.ts`) | COVERED |
| 5 | Immutable `ScanPlan` deadline, mutable progress update and duplicate-delivery coverage; worker restart/recovery evidence remains | PARTIAL |
| 6 | Concurrent deadline sweep and matching unit finalization; terminal scan and one refund | COVERED |
| 7 | Fresh-read refund regressions for legacy and planned passes (`timeout-refund-staleness.test.ts`) | COVERED |
| 8–10 | Stop precedence, stale evidence/finalization fencing, and refusal before F07/budget (`runtime.test.ts`, evidence tests, `dispatch.test.ts`) | COVERED |
| 11 | Later dependent unit refused when its shared deadline leaves insufficient time (`dispatch.test.ts`) | COVERED |
| 12 | Terminal-scan and expired-REVERIFY self-healing cases pass; exact maximum interval bound is not measured | PARTIAL |
| 13 | Timeout sweep races the completion gate; scan remains terminal and master is not enqueued | COVERED |
| 14–16 | No F01/F07 contract/type edits; stop precedence and pre-run expiry/topological refusal tests pass | COVERED |
| 17 | New comparisons use database time and legacy regression passes; deployed NTP/skew bound is unverified | PARTIAL |
| 18 | Gate refuses continuation after deadline; sweep transitions the scan to `TIMED_OUT` | COVERED |
| 19 | Isolated child termination and deferred expiry are tested; production engine backstop is not registered in SPEC 009 | PARTIAL |
| 20 | Passive classes remain on legacy queue and are ignored by non-passive dispatch | COVERED |

This is an evidence index, not closure of T-U1-10. The partial rows keep the complete AC matrix open.

### Progress/redelivery deadline check — 2026-10-29

- The isolated worker integration case passed **1/1** on disposable PostgreSQL and Redis. It writes a mutable `ExecutionUnit.progressSnapshot`, delivers duplicate queue jobs, confirms exactly one durable host claim, and verifies the owning `ScanPlan.deadlineMs` is unchanged. The schema suite separately rejects direct updates to the immutable plan deadline.
- AC-5 remains PARTIAL because this does not simulate a worker process restart/recovery. AC-12, AC-17, and AC-19 remain open for bounded sweep timing, deployed clock-skew evidence, and a production engine backstop. T-U1-10 and SPEC 009 remain open.
- The production API still has no `resolvePlan` caller, and the production worker registers no SPEC 010–012 engine adapter. The parallel-run contract keeps current passive scans on the existing scan-phase path; wiring every passive scan into plan execution would need an explicit contract/cutover decision before changing production behavior.

### CORE-01 privilege matrix follow-up — 2026-10-29

- The expanded real-LOGIN-role suite passes **22/22** against the 35-migration disposable PostgreSQL database. It now compares effective table-level privileges for every CORE-01 table across API, generic worker, execution host, orchestrator, operator, and an ungrouped role, and checks the exact execute matrix plus absence of `PUBLIC EXECUTE` for every CORE-01 SECURITY DEFINER function.
- The catalog check confirms no runtime role has table-level `TRUNCATE`, `REFERENCES`, or `TRIGGER`; expected API insert/read access, host append/lifecycle access, orchestrator artifact cleanup, and operator read-only access match the declared matrix. Existing real-login tests continue to cover selected column grants, denial of direct terminal writes, raw F07 table denial, and cross-plan dependency rejection.
- Gate 22 remains PARTIAL: tenant/effect abuse cases and the full deployed API/worker service-role flow have not been demonstrated. This test validates grants on the isolated database only; the production/dev service credentials are not least-privilege verified.

### Prior full-suite failure follow-up — 2026-10-29

- Re-ran the production email boot guard with `EMAIL_TRANSPORT` explicitly empty against disposable PostgreSQL and Redis: **3/3 passed**. This covers the earlier blank-variable regression and both configured SMTP startup paths.
- Re-ran the sandbox-unconfigured capability contract with test-only JWT configuration and isolated PostgreSQL/Redis: **1/1 passed**. The test clears `SANDBOX_RUNNER_URL` itself before asserting the unconfigured response.
- Updated the email boot-guard child-process test to use `TEST_REDIS_URL` or the dedicated `EXEC_TEST_REDIS` endpoint, so it no longer hardcodes the shared development Redis DB 15. The full serial workspace was not rerun after these test-only changes; the last full pass remains the dated evidence in `FINAL_VERIFICATION_REPORT_2026-10-29.md`. Gate 26 remains PARTIAL for the still-open visual, manual, coverage, and SPEC 009 acceptance scope.
