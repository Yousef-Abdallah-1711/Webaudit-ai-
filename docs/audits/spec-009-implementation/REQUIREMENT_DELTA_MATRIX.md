# SPEC 009 — Requirement Delta Matrix (baseline + this session)

Source: `specs/009-core-scan-execution-platform/spec.md` FR-001…FR-047, SC-001…SC-008 (read directly), the data model and contracts named per row.
**Baseline verified in code (2026-10-29, HEAD `a1034fa`)**: none of the eight models (`ScanProfile`, `ScanProfileVersion`, `ScanPlan`, `ExecutionUnit`, `ExecutionDependency`, `Evidence`, `IssueEvidenceLink`, `Artifact`) and none of the six enums exist in `schema.prisma`; no resolver, runtime, evidence or artifact code exists. What does exist and is reused: `Issue.fingerprint` + `@@unique([scanId, fingerprint])`, the four BullMQ queues, `apps/worker/src/orchestrator/*` (legacy phase chain, `timeout.ts`/`timeout-scheduler.ts`), the R2 storage services, and SPEC 007/008.
**Delivered this session** (pure code, no database): `apps/api/src/services/planning/{graph,plan-deadline}.ts` + 62 unit tests, 4/4 mutants killed.
Statuses: VERIFIED COMPLETE · IMPLEMENTED BUT UNVERIFIED · PARTIAL · MISSING · BLOCKED · NOT APPLICABLE. "CORE-01" = the schema migration, blocked in the register on DEC-051 and the U-1b/G-02 text (DEC-066).

| FR | Requirement (short) | Exists today | Status | Next step / blocker |
|---|---|---|---|---|
| 001 | ScanConfiguration shape (`scan-configuration-contract.md`) | — | MISSING | independent: schema-validated type (no DB) |
| 002 | ScanProfile, named & versioned | — | BLOCKED | CORE-01 |
| 003 | profile read through an explicit version; plan snapshots it | — | BLOCKED | CORE-01 |
| 004 | three layers: domain → execution class → unit | `ModuleType` only | MISSING | resolver (needs profile data) |
| 005 | Plan Resolver pure & deterministic | **graph validation + deadline arithmetic only** | **PARTIAL** | profile→classes mapping, authorization port, graph templates (engine-declared) |
| 006 | ScanPlan immutable snapshot | — | BLOCKED | CORE-01 |
| 007 | `isAuthorized` per non-passive class before `RESOLVED` | F01 service exists | MISSING | resolver (after schema) |
| 008 | ExecutionGraph = inspectable DAG (parallel, serial, fan-in/out, conditional, discovered) | **DAG validation, deterministic topological order, eligibility** | **PARTIAL** | persistence; discovered-child units (FR-015) |
| 009 | every unit explains why it exists/ran/was blocked | — | BLOCKED | CORE-01 |
| 010 | fan-in failure ⇒ `BLOCKED` naming the predecessor; no dispatch without a satisfied path | **one-level propagation rule + transitive closure (tested)** | **PARTIAL** | the transactional write in `finalizeExecutionUnit` (DEC-047) |
| 011 | plan resolved exactly once per scan | — | BLOCKED | CORE-01 (unique constraint) |
| 012 | ExecutionUnit record (all fields) | — | BLOCKED | CORE-01 |
| 013 | ExecutionDependency edge, intra-plan only | **intra-plan/dangling/self/duplicate/cycle checks** | **PARTIAL** | persistence |
| 014 | exactly 11 statuses | **status set + terminal classification** (`graph.ts`) | **PARTIAL** | the guarded transition table (edges tied to DEC-057/064) |
| 015 | plan immutability scope | — | BLOCKED | CORE-01 |
| 016 | REUSE/EXTEND/NEW classification | `plan.md` Reuse/Extend/New matrix | NOT APPLICABLE (documentation requirement, satisfied by the plan) | — |
| 017 | new queue per class needing one | 4 legacy queues | MISSING | engine specs 010/011 (DEC-052/042) |
| 018 | dispatch from durable Postgres state, never queue-only | — | BLOCKED | CORE-01, CORE-03/04 (DEC-056/057) |
| 019 | process isolation / force termination | `apps/sandbox-runner` (installed capabilities only, ADR-003) | MISSING | engines + hosting-failure backstop (DEC-046) |
| 020 | no credential/session secret in fields, payloads, events, logs | — | MISSING | design rule for every new writer; opaque `credentialBindingRef` only |
| 021 | preserve F07's three-way stop distinction | 008 verified | MISSING | CORE-04 (DEC-058) |
| 022 / 022a | checkpoint for every `requiresSafetyCheckpoint` unit; plan-time vs dispatch-time authorization | 008 `safetyCheckpoint` verified | MISSING | runtime wiring (CORE-04/05); **008 interim identity (executionId) must map to `ExecutionUnit.id`** |
| 023 | failure classification & retry semantics | — | MISSING | independent: pure classifier (research R9) — next candidate |
| 024 | idempotence proven for retries > 1 | — | MISSING | per-engine proof obligation |
| 025 | idempotency key per side-effecting operation | 008 keys verified | MISSING | CORE-04 |
| 026 | every unit lookup tenant-scoped | — | MISSING | with the first unit read path |
| 027 / 027a | hierarchical progress; no progress after terminal | legacy realtime exists (`emit.ts`) | MISSING | progress contract (after schema) |
| 028 | Evidence ↔ Issue many-to-many | — | BLOCKED | CORE-01 |
| 029 | reverify compatibility (own minimal plan) | legacy reverify exists | MISSING | resolver |
| 030 | evidence redaction for F07-class evidence | `@webaudit/redaction` reused by 008 | MISSING | evidence writer |
| 031 | oversized evidence → artifact | — | MISSING | evidence/artifact writers |
| 032 | Artifact = reference to R2 object | R2 services exist | BLOCKED | CORE-01 |
| 033 | per-object artifact size budget | — | MISSING | artifact writer |
| 034 | staged-upload retention gap closed | `retention.ts` exists | MISSING | artifact retention (after schema) |
| 035 | orphan R2 object reclamation | — | MISSING | artifact reaper |
| 036 | keep fingerprint-based Finding identity | **`Issue.fingerprint` + unique index (unchanged)** | **PARTIAL** (foundation intact; evidence links absent) | materialization |
| 037 | new-class findings retain evidence link | — | BLOCKED | CORE-01 |
| 038 | partial completion keeps committed evidence | — | MISSING | runtime finalization |
| 039 | report states coverage ("did not contribute" + reason) | — | MISSING | finalization/read path |
| 040 | zero behaviour change for passive scans | **held: no legacy file changed by SPEC 009 work** | VERIFIED COMPLETE *as an invariant so far* (re-verify at every phase and at delivery) | — |
| 041 | every new entity tenant-scoped at creation and read | — | MISSING | with each entity |
| 042 | R2 key structure | — | MISSING | artifact writer |
| 043 | per-engine observability | — | MISSING | runtime |
| 044 | metering boundary (no pricing design) | — | NOT APPLICABLE | boundary requirement |
| 045 | credentials boundary (no credential storage design) | — | NOT APPLICABLE | boundary requirement |
| 046 | no AI in planning, execution or evidence | **new code has no AI/provider imports** (static) | VERIFIED COMPLETE for code that exists | — |
| 047 | scan deadline policy (U-1) | **`computePlanDeadline`, `unitBudgetMs`, `dispatchThresholdMs`, `criticalPathMs`, `effectiveDeadlineAt`, `dispatchDeadlineDecision`** — the contract's worked example reproduced exactly (2 390 000 / 2 330 000 / 10 760 000), the Lemma held as a property over 200 random chains | **PARTIAL** | persistence (T-U1-1), resolver integration (T-U1-3), step-0 wiring (T-U1-4), host loop (T-U1-5), sweep (T-U1-6), `expirePlanUnits` (T-U1-7), gate (T-U1-8), fencing (T-U1-9), AC-1…AC-20 (T-U1-10) |

## Success criteria
| SC | Status | Note |
|---|---|---|
| 001 every touched subsystem classified REUSE/EXTEND/NEW | NOT APPLICABLE | planning-document criterion, satisfied by `plan.md` |
| 002 every new entity tenant-scoped | MISSING | entities do not exist |
| 003 F07's named process-topology dependency resolved | MISSING | FR-019 |
| 004 40+ adversarial scenarios each resolved | MISSING | needs the runtime |
| 005 quickstart validation | MISSING | needs the runtime |
| 006 "zero changes outside the spec directory" | NOT APPLICABLE | planning-pass bar (as for 007/008) |
| 007 an engine author can answer the five questions | NOT APPLICABLE | documentation criterion |
| 008 (U-1) a long non-passive plan is not killed by a universal 15-minute timeout | PARTIAL | the deadline is computed correctly (SPEC-defined arithmetic); the sweep that must *consume* it is not built |

## Totals (49 FR items + 8 SC)
FR (49 items = 47 numbered + FR-022a + FR-027a; counted by script from the table): VERIFIED COMPLETE 2 (FR-040 invariant, FR-046 for existing code) · PARTIAL 7 (005, 008, 010, 013, 014, 036, 047) · BLOCKED 11 · MISSING 26 · NOT APPLICABLE 3 (016, 044, 045). SC: PARTIAL 1 · MISSING 4 · NOT APPLICABLE 3.
**IMPLEMENTED BUT UNVERIFIED: none** — everything that exists was tested.

---

## Status update — 2026-10-29, end of implementation session (supersedes the Status column above; the table above is the session-start baseline)

Status vocabulary used here: **IMPLEMENTED-TESTED** = built and covered by tests on real PostgreSQL (service layer), but not yet exercised through a running API/worker or a browser, so **not** VERIFIED COMPLETE. VERIFIED COMPLETE is reserved for items proven end to end.

| FR | Status now | Evidence / what is missing |
|---|---|---|
| 001 | IMPLEMENTED-TESTED | `scan-configuration.ts`; `resolver.test.ts` |
| 002, 003 | IMPLEMENTED-TESTED | `profiles.ts`; version snapshot test |
| 004 | IMPLEMENTED-TESTED | profile mapping + engine registry; non-passive classes have no engines yet (SPEC 010-012), so they refuse `NO_ENGINE_REGISTERED` |
| 005 | IMPLEMENTED-TESTED | determinism test; the resolver reads F01/DB (deterministic, not "pure") |
| 006 | IMPLEMENTED-TESTED | immutable-row trigger |
| 007 | IMPLEMENTED-TESTED | fresh F01 per class, spy-verified |
| 008, 010, 011, 012, 013, 014, 025 | IMPLEMENTED-TESTED | `graph.ts`, CORE-01 triggers, `core01-schema.test.ts` (110-pair transition table) |
| 009 | PARTIAL | terminal reasons and coverage facts exist; no per-unit "why it exists" narrative field |
| 015 | PARTIAL | plan immutable; runtime child-unit creation for frontier classes not built |
| 016, 044, 045 | NOT APPLICABLE | unchanged |
| 017 | PARTIAL | queue names and class routing defined in `packages/config` (tested); no BullMQ queues/consumers created for them |
| 018 | PARTIAL | `dispatchExecutionUnit` is driven by durable state (payload only identifies the row); no enqueue code or worker consumer yet |
| 019 | MISSING | child process / force termination is host + engine work |
| 020 | PARTIAL | config secret-key guard, evidence redaction; engine writers do not exist |
| 021, 022, 022a | PARTIAL | stop precedence, expiry mapping, dispatch-time F07 admission and the host-loop decision are tested; no running host process uses them |
| 023 | IMPLEMENTED-TESTED | `failure-class.ts` |
| 024 | IMPLEMENTED-TESTED | registry refuses `maxAttempts > 1` without a recorded proof |
| 026, 041 | IMPLEMENTED-TESTED | tenant filter on every new service entry point |
| 027, 027a | MISSING | progress events not built |
| 028, 030, 031, 033, 036, 037, 038, 042 | IMPLEMENTED-TESTED | `evidence.test.ts` (23, 5/5 mutants killed) |
| 029 | PARTIAL | REVERIFY plan resolves from the finding (tested); reverify runner not switched to plans |
| 032, 035 | PARTIAL | memory store + command-level R2 stub only; real R2 untested; reaper not scheduled |
| 034 | IMPLEMENTED-TESTED | `enforceRetention` now removes Artifact rows in the same (interactive) transaction as the report data and deletes objects after commit; tested incl. a failing store. Production wiring must pass `artifactStore` (needs R2 credentials; the reaper is still unscheduled) |
| 039 | PARTIAL | `scanCoverageSummary` exists; the report read path does not call it |
| 040 | VERIFIED COMPLETE as an invariant so far | legacy sweep/orchestrator tests green with the new optional hooks; re-verified after the full unit run |
| 043 | MISSING | per-engine observability |
| 046 | VERIFIED COMPLETE for code that exists | no AI/provider imports in any new module |
| 047 | PARTIAL | T-U1-1/2/3/6/7/8 done; T-U1-4 decision function only; T-U1-5 not built; T-U1-9 `authorizeEffect` done, engine wrappers n/a; T-U1-10 AC-1..AC-20 partially covered |

**Totals (49 FR items):** IMPLEMENTED-TESTED 27 · VERIFIED COMPLETE 2 · PARTIAL 13 · MISSING 4 · NOT APPLICABLE 3. **Zero requirement is claimed as end-to-end verified beyond the two invariants.**

---

## Cross-device independent delta — 2026-10-29

The totals above are historical and are **not a current 49-FR recount**. Independent inspection confirms that multiple status notes in this file are stale: per-class BullMQ producers/consumers, the execution host, host loop, progress publishing, planned sweep/gate, and artifact-reaper scheduling now exist. The current worker entrypoint still does not compose the execution consumers; repository search found no production caller of `resolvePlan`; no production engine adapter is registered. Therefore file presence and the direct 16-test PG/Redis/BullMQ integration do not establish the end-to-end API→plan→worker path.

Freshly verified in this continuation:

| Requirement area | Evidence | Current disposition |
|---|---|---|
| FR-017/018 queue and durable execution path | `execution-runtime.test.ts` 16/16 on disposable PG, Redis and BullMQ; duplicate delivery and strict payload covered | IMPLEMENTED, DIRECT INTEGRATION VERIFIED; production worker composition remains missing |
| FR-021/022 safety and kill handling | same suite covers cancellation, operator kill, revoked grant and lease loss | IMPLEMENTED, DIRECT INTEGRATION VERIFIED; actual API/worker role composition remains open |
| FR-027 progress | Redis messages observed on the execution-unit channel in the same suite | PARTIAL; authenticated client consumption/reconnect recovery unverified |
| FR-047 U-1 | dispatch, hard-stop, deadline, planned expiry and ready-gate paths present; runtime integration suite passed | PARTIAL; AC-1…20 matrix, race/fairness and production worker wiring remain |
| CORE-01 finalizer privileges | before-fix real-login test failed for API and generic worker; after additive correction role suite passed 7/7 on fresh migrated DB | PARTIAL; only finalizer/status subset covered, and existing dev DB not updated |
| FR-031…035 artifact lifecycle | reaper handler and repeatable schedule are wired by static inspection | PARTIAL; R2 and end-to-end retention/reaper lifecycle not run |

This session did not rebuild every FR row from source and tests; no replacement 49-FR count is asserted. Use `FINAL_VERIFICATION_REPORT_2026-10-29.md` for the complete A–Z evidence inventory and `DEFINITION_OF_DONE.md` for the 28-gate reassessment.
