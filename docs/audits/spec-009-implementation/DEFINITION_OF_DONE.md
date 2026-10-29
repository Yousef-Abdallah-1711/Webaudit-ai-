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
| 14 | Deadline enforcement | U-1 whole contract (FR-047, AC-1…20) | adverse AC-1…AC-20 incl. DB clock, kill-vs-deadline, sweep-vs-gate race, refund fairness, legacy regression | all ACs green | any AC failing; legacy timeout behaviour changed | PARTIAL - T-U1-1,2,3,6,7,8 done; T-U1-4 decision function only; T-U1-5 not built; T-U1-9/10 partial |
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
| 7 | PARTIAL | Real isolated PG/Redis/BullMQ suite passes 17/17; `startWorker` composes registered adapters in test, but the executable entrypoint supplies none. |
| 8 | PARTIAL | `startWorker` now composes per-class consumers/host, continuation, dependent enqueue, and shutdown for locally supplied adapters; no production adapter is registered. |
| 9 | PARTIAL | Plan authorization code present; grant-revocation runtime case passes; complete plan/dispatch scope mutation matrix not run. |
| 10 | PARTIAL | Runtime admits through F07 in the integration test; actual API/worker roles are not used for that path. |
| 11 | PARTIAL | Budget behavior exists in F07; concurrency/oversubscription load test not run. |
| 12 | PARTIAL | Cancellation, kill switch, and grant revocation passed in direct real-infrastructure runtime tests; standard worker lifecycle unverified. |
| 13 | PARTIAL | In-flight scan cancellation passed; API cancellation/refund behavior not exercised end to end. |
| 14 | PARTIAL | Deadline, hard-stop, and planned expiry paths pass in runtime tests; AC-1…20 matrix and race/fairness checks not run. |
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
| 26 | PARTIAL | Full serial unit/contract/integration passed 243 files / 1,851 tests; adverse passed 72 files / 1,134 executed tests (1 skipped); visual, Playwright, and full 49-FR re-review remain. |
| 27 | PARTIAL | This dated report and reassessment were added; full 49-FR re-review and all stale historical documents remain. |
| 28 | PARTIAL | Reviewed changes were committed and pushed; local `HEAD`, `origin/main`, and remote `main` agree. SPEC 009 remains incomplete due to the open gates above. |

**Current reassessment: 25 PARTIAL · 3 NOT STARTED · 0 PASS. Verdict: NOT COMPLETE.** The zero PASS count is deliberate: the current DoD requires end-to-end evidence for each gate and this session did not perform the complete gate-specific verification for any one gate.

### Verification update — 2026-10-29

- The serial unit/contract/integration workspace passed against disposable PostgreSQL and isolated Redis: **243/243 files, 1,851/1,851 tests**.
- The serial adverse workspace passed against the same disposable services: **72/72 files, 1,134 passed, 1 skipped**. This includes expanded safety role-isolation and real Chromium SSRF checks for probe-pool boundaries.
- The full-suite failures found earlier were fixed: blank `EMAIL_TRANSPORT` now behaves as omitted and selects the documented production SMTP default; the sandbox-unconfigured contract removes the repository `.env` URL before checking that path.
- The 28-gate count remains **25 PARTIAL / 3 NOT STARTED / 0 PASS**. Production API plan dispatch, production adapter registration, complete least-privilege matrix, visual/Playwright, manual browser journey, load, coverage, and real R2 evidence remain incomplete.
