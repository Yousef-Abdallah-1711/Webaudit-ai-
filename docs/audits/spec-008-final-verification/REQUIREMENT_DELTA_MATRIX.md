# SPEC 008 — Independent Requirement Delta Matrix

Built directly from `specs/008-safety-killswitch-budget-audit/spec.md` (FR, SC, user stories, edge cases),
`data-model.md`, `contracts/*`, `amendments/AMENDMENT-A1.md` and `f02-role-privilege-design.md` §13 — **not** from the
previous task ledger. Each row was checked by tracing the real call path and reading the test assertions.
Statuses are as of the final commit of this verification; "was" marks a status the audit changed.

**Test keys** (all real PostgreSQL unless marked): `RACE` adverse/safety-admission-concurrency-race · `KSR` adverse/safety-killswitch-reconciler ·
`REM` adverse/safety-audit-remediation · `ROLE` adverse/safety-role-isolation (real non-superuser logins) · `CON` contract/safety-admission-contract ·
`QS` integration/safety-quickstart · `HOST` worker/adverse/kill-switch-host (also real Redis) · `SWEEP` worker/integration/safety-sweep ·
`NET` safe-net/adverse/kill-switch-abort · `CH` config/safety-channels (unit) · `LC` api/unit/safety/stop-lifecycle (unit).
**Runtime keys**: `FI` failure-injection run S1–S8 (dedicated containers, real worker as non-superuser) · `LOAD` staged load run · `QA` real-Chrome manual run.
Mocks: none of the above mock the database. `HOST`'s two fault tests wrap the client to inject a failure; everything else is real.

## Functional requirements

| ID | Requirement (short) | Implementation (call path) | Evidence | Status |
|---|---|---|---|---|
| FR-001 | One atomic operation: fresh `isAuthorized` + reservation | `requestAdmission` (TS: identity from `Target`, DB clock, `isAuthorized`) → `f07_admit` (SQL: grant liveness, **environment re-check under the locks**, kill switch, counter lock, writes) in one transaction | RACE, CON, REM(D-I), QS | **VERIFIED COMPLETE** (was PARTIAL: environment, the one mutable authorization input, was only read before the lock — fixed, D-I). Scope is immutable per grant, so scope matching staying in TypeScript has no TOCTOU. |
| FR-002 | Concurrent safety; distinct budget refusal reason | counter `FOR UPDATE` in `f07_admit`; reasons `BUDGET_EXHAUSTED_REQUEST/CONCURRENCY` | RACE (2- and 25-caller/5-slot), LOAD scarce-budget (max live 5/ceiling 5); mutant M1 killed | **VERIFIED COMPLETE** |
| FR-003 | Durable lease / consumption record, never a bare boolean | `AdmissionLease`, `BudgetConsumption` rows | CON | **VERIFIED COMPLETE** |
| FR-004 | 30 s lease, renewed at checkpoints | `f07_admit` (+30 s), `f07_renew_lease`, `safetyCheckpoint` | HOST, REM(D-A), QS | **VERIFIED COMPLETE** |
| FR-005 | Fail closed on any internal error, no partial effect | `failClosed` (rollback / savepoint) → `REFUSED/INTERNAL_ERROR` | CON (held-lock timeout, caller rollback, joined savepoint), FI S4, LOAD (hot-grant lock timeouts are refusals with no partial rows) | **VERIFIED COMPLETE** |
| FR-005a | F01 `BUDGET_EXHAUSTED` is advisory; locked check decides | `loadBudgetConsumption` snapshot → `isAuthorized` unchanged; treated as "proceed" | CON, ROLE (non-superuser e2e) | **VERIFIED COMPLETE** |
| FR-006 | Un-renewed lease reclaimed without the holder | `f07_reclaim_expired_leases` via `safety-sweep` job | KSR (DEC-063 group, 5 tests), FI S1a/S2b/S3, SWEEP; mutant M6 killed | **VERIFIED COMPLETE** |
| FR-006a | Holder-token fencing; failed renewal = stop | `holderToken` in `f07_renew_lease`; `safetyCheckpoint` aborts on `FENCED` | RACE (T014a), REM(D-C), HOST | **VERIFIED COMPLETE** |
| FR-007 | Release/completion idempotent, never over-credits | `f07_release_lease_by_token`, `f07_release_leases_by_execution` | CON, FI S8 (10 concurrent finalizers → released once) | **VERIFIED COMPLETE** |
| FR-008 | Idempotency identity on every budget operation | `@@unique(grant,key)`; replay returns stored outcome | CON (8 concurrent duplicates → 1 unit), FI S4 (retries across an outage → exactly 6 units) | **VERIFIED COMPLETE** |
| FR-009 | Two-store disagreement | Single store (Postgres); no Redis in admission | STATIC | **NOT APPLICABLE** (the spec's own resolution) |
| FR-010 | Kill-switch scopes (6) incl. operator multi-scope | `f07_trigger_stop` | KSR (all six scopes) | **VERIFIED COMPLETE** |
| FR-011 | Actors: owner, revocation, operator, SYSTEM; budget exhaustion is not a trigger | authority decided in `f07_trigger_stop` from DB facts | KSR (operator any scope, user EXECUTION/SCAN only, uniform refusals, SYSTEM restricted, cross-tenant execution id) | **VERIFIED COMPLETE** |
| FR-012 | Revocation → GRANT stop, same operation | `revokeAuthorization` calls `triggerStop` in its transaction | KSR, QS(B2), HOST(T016) | **VERIFIED COMPLETE** |
| FR-013 | REQUESTED→ACKNOWLEDGED→STOPPED; ≤5 s observe/ack | trigger-enforced edges; `startStopWatcher` (poll clamped ≤5 s) | KSR (DB parity with `LC`), HOST (<5 s), LOAD propagation p95 67 ms @100 ms poll | **VERIFIED COMPLETE** (host watcher is a library; no engine calls it yet) |
| FR-014 | Escalation; forcible termination; audited separately | watcher → abort + `onEscalate` hook → `f07_mark_escalated` (ESCALATED event) | HOST (hook, `escalatedAt`, distinct event, kill survives audit failure) | **PARTIAL** — the spec itself names forcible OS-process termination as an F04 dependency; the `onEscalate` hook is not yet connected to a real sandbox child. |
| FR-015 | No resurrection: retry, redelivery, duplicate dispatch, stale worker, new worker | STOPPED `EXECUTION` row refuses; lease fencing; **one live lease per execution unit** | HOST (T017), REM(D-C) | **VERIFIED COMPLETE** (was PARTIAL: a second worker could lease a live execution id — fixed, D-C) |
| FR-016 | Environment reclassification = stop; never un-requested | `classifyEnvironment` trigger + checkpoint persists an EXECUTION stop on environment refusal | KSR, HOST(T019a), REM(D-D) | **VERIFIED COMPLETE** (was PARTIAL: a refusal at a checkpoint was not persisted as a stop — D-D) |
| FR-016a | Expiry is rediscovered at every checkpoint | `f07_renew_lease` refuses revoked/expired grants; checkpoint re-runs `isAuthorized` | REM(D-A) | **VERIFIED COMPLETE** (was **FAILED**: a lease could be renewed past its grant's expiry — D-A) |
| FR-017 | State survives restart | all state in Postgres | HOST (T019c fresh client), FI S2 (worker killed → nothing forgotten, recovered after restart) | **VERIFIED COMPLETE** |
| FR-018 | One checkpoint: stop check → fresh authz → budget; cadence | `safetyCheckpoint` | HOST, QS, REM | **VERIFIED COMPLETE** (was PARTIAL: lease path skipped the fresh authorization check and ran it after the stop check in the wrong order during remediation — corrected to spec order) |
| FR-019 | Engines must call the checkpoint | n/a — spec-acknowledged limitation | — | **NOT APPLICABLE** (no engine exists; compliance is governance) |
| FR-020 | Audit fields: who, target, grant, scope, environment, scan/exec, class, type, time, outcome | `f07_audit` derives scope + environment from the DB; class carried on the lease | REM(D-E) | **VERIFIED COMPLETE** (was PARTIAL: scope, environment and class were NULL on most rows — D-E) |
| FR-021 | Unknown state = "stop might be pending" (own reason) | `renewLease` → `UNCERTAIN`; checkpoint → `STATE_UNCERTAIN`; watcher aborts on read failure | REM(D-B), HOST | **VERIFIED COMPLETE** (was PARTIAL: renewal failure was reported as `LEASE_FENCED` — D-B) |
| FR-022 | Every transition and admission outcome audited, bounded taxonomy | SQL audit in the same transaction; 12 enum values | QS(T028: all 12 emitted), REM(D-F), CON | **PARTIAL** — refusals that roll back (`INTERNAL_ERROR`, DB unavailable) and `target not found` cannot be durably audited by construction (FR-021 takes precedence); every other outcome is audited. |
| FR-023 | Refusal audited without an execution row | `ADMISSION_REFUSED`/`BUDGET_EXHAUSTED` | CON(T025), REM(D-F: previously silent `NO_MATCHING_GRANT` refusals) | **VERIFIED COMPLETE** |
| FR-024 | Redaction before persistence; `outcome` bounded; retention = report data | `redactAuditPayload`, sentinel, ≤200-char outcome, ≤8 KiB payload; `purgeExpiredExecutionAudit` + `f07_purge_*` per plan retention | CON(T026), REM(D-G), SWEEP(D-H) | **VERIFIED COMPLETE** (was **MISSING**: no retention existed — D-G) |
| FR-025 | No AI in safety decisions | STATIC grep: no `ai-executor`/provider import in `services/safety` or the worker safety modules | STATIC | **VERIFIED COMPLETE** |
| FR-026 | Strictly additive; legacy paths untouched | 2 new migrations, 0 changed lines in existing schema; revoke/classify gain a stop call (named integration point) | QA M6.1 (full legacy scan + cancel: SPEC 008 rows delta 0), full unit + adverse suites | **VERIFIED COMPLETE** |
| FR-027 | Future engines implement the full checkpoint | n/a | — | **NOT APPLICABLE** |

## Success criteria

| ID | Status | Evidence |
|---|---|---|
| SC-001 N concurrent callers, zero oversell | VERIFIED COMPLETE | RACE, LOAD (40 workers/5 slots) |
| SC-002 Every scope × actor has a checkable behaviour | VERIFIED COMPLETE | KSR |
| SC-003 Concrete stop bound/escalation | VERIFIED COMPLETE | HOST, LOAD |
| SC-004 20+ adversarial scenarios each resolved | VERIFIED COMPLETE | edge-case table below |
| SC-005 "zero changes outside the spec directory" | NOT APPLICABLE | a planning-pass bar; implementation necessarily changes code. Additivity is verified under FR-026. |
| SC-006 Engine author can answer the five questions | NOT APPLICABLE | documentation criterion |

## User stories

| Scenario | Status | Evidence |
|---|---|---|
| US1.1 two callers, one slot | VERIFIED COMPLETE | RACE, QS(B1) |
| US1.2 third caller gets a distinguishable reason | VERIFIED COMPLETE | RACE |
| US1.3 last request unit | VERIFIED COMPLETE | RACE(T010) |
| US2.1 revoked mid-run → next checkpoint stops | VERIFIED COMPLETE | HOST(T016), QS(B2) |
| US2.2 no cooperative checkpoint → escalation audited | PARTIAL | HOST (see FR-014) |
| US2.3 stale redelivery not resurrected | VERIFIED COMPLETE | HOST(T017) |
| US2.4 operator stop distinguishably audited | VERIFIED COMPLETE | KSR, QS(B3) |
| US3.1 refusal reconstructible | VERIFIED COMPLETE | CON, QS(B3) |
| US3.2 secret redacted | VERIFIED COMPLETE | CON(T026), QS(B3) |
| US3.3 three stop reasons distinguishable | VERIFIED COMPLETE | QS(B3), KSR |

## Edge cases

| Edge case | Resolution | Status |
|---|---|---|
| Worker reserves then crashes | lease expiry + reclaim | VERIFIED (FI S1a/S2) |
| Consumes then crashes before ack | idempotent replay by key | VERIFIED (FI S4: attempts 3–4 per call, exactly 6 units) |
| Job redelivered after completion | ledger idempotent | VERIFIED (CON) |
| Stopped job retried anyway | STOPPED row refuses all vectors | VERIFIED (HOST) |
| Stop triggered twice | one row, one event | VERIFIED (KSR T018) |
| Revoked mid-request | stop in revoke transaction | VERIFIED |
| Environment staging→production mid-run | stop; never cancelled by reverting | VERIFIED (D-D) |
| Kill switch requested while Redis down | Postgres is authoritative; Redis only an accelerant | VERIFIED (`triggerStop` has no Redis dependency; HOST Redis test; FI S3 Redis restart) |
| Two-store disagreement | single store | N/A |
| Operator vs other tenant | allowed, attributed, audited | VERIFIED (KSR) |
| Mid-execution destination needing budget | each goes through `requestAdmission` | VERIFIED by contract (engine call sites do not exist yet) |
| Platform restart with stop REQUESTED / leases held | durable state | VERIFIED (HOST T019c, FI S2) |
| Never-authorized attempt still audited | `ADMISSION_REFUSED` | VERIFIED |

## Amended design (A1 / F-02 §13)

| Item | Status | Evidence |
|---|---|---|
| DEC-044 role boundary | VERIFIED in tests and in an isolated full stack run as non-superuser logins; **NOT in force for the shared dev stack** | ROLE (116), FI, QA |
| DEC-045 transaction-joinable, token-free release, DB clock | VERIFIED | CON, KSR (finalize rollback test) |
| DEC-048 finalizer ack + reconciler | VERIFIED | KSR, FI S1c |
| DEC-049 STOPPED only after no live lease | VERIFIED | KSR (mutants M2/M3/M5 killed), FI S1b |
| DEC-050 lock order | VERIFIED | KSR (both race orders), FI, LOAD: 0 deadlocks over ~15 k contended operations |
| DEC-063 reclaim | VERIFIED | KSR, FI |
| Triggers (kill-switch edges, audit append-only) | VERIFIED | KSR structural tests |

## Defects found by this audit (all fixed unless stated)
D-A FR-016a lease outlived grant · D-B FR-021 uncertainty conflated · D-C FR-015 live execution id re-leasable · D-D FR-016 environment refusal not a stop ·
D-E FR-020 audit context missing · D-F FR-023 silent refusals · D-G FR-024 no retention · D-H retention failure could starve the sweep · D-I FR-001 environment not re-checked under the lock.
Open/accepted: see `DEFECT_REGISTER.md`.
