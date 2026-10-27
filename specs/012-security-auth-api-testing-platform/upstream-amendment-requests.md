# Upstream Amendment Requests Raised by SPEC 012 Planning

**Created**: 2026-10-10 | **Status**: planning pass; nothing frozen; no upstream document edited.

SPEC 012 treats 006-011 as frozen (Constitution; FR-159). Each gap found while planning is recorded here with a classification:

- **REQUIRED**: SPEC 012 cannot function safely without the upstream change.
- **RECOMMENDED**: 012 is safe with a local mitigation, but the upstream change would harden or simplify it.
- **OPTIONAL**: 012 has a complete local resolution; the change is a convenience or future-proofing.
- **NONE**: gap noted for the record; no amendment wanted.

## Overall statement

**Status (sixth targeted repair, 2026-10-15; extended by the seventh final-findings repair, 2026-10-16: AR-18 now lists six items)**: no amendment of frozen document text is required to complete SPEC 012 planning, but four items must be resolved before activation or before the dependent capability can be enabled: **AR-13 is REQUIRED FOR ACTIVATION** (database privilege boundary; needs the 007/008/009 implementation owners), **AR-22 (hosting-failure backstop, F1) is REQUIRED FOR ACTIVATION of E14 and E15**, and **AR-18 is a REQUIRED CLARIFICATION before activation** (SG1: six items, four ambiguities in 009's status and finalization wording plus the 009 single-authority rule and the 008 transactional lease-release surface, listed in AR-18; 012 adds no status and no edge, and every edge it uses exists in 009's diagram or status-by-cause matrix), **AR-19 (the SPEC 008 transactional admission and release surface, data-model 4.10C) is REQUIRED FOR ACTIVATION**, **AR-20 (per-tenant job routing) is required only if the owner chooses Mode S**, **AR-21 (confining non-012 execution-class writes) is RECOMMENDED**, **AR-17 is needed before `CLASS_LEVEL` billing of any class**, and AR-15 gates purchase of active/authenticated work. AR-10, AR-12 are RECOMMENDED, AR-14 is OPTIONAL, AR-11 and AR-16 are notes, **AR-3 is CLOSED by owner approval of 2026-10-11**. No item blocks planning: every gap has a fail-closed local mitigation inside 012 that is covered by tasks and fixtures. **SPEC 007 FR-015a stays untouched**: 012 requests no production active or authenticated testing (every active capability is `RESTRICTED_TO_NON_PRODUCTION` in plan.md's Production Safety Matrix). No decision the owner has not made is recorded as made.

## Summary table

| ID | Upstream doc / section | Class | Local mitigation | Owner decision needed |
|---|---|---|---|---|
| AR-1 | 007 `isAuthorized` signature / scope fields | RECOMMENDED | `securityScopeGate` (T036/T037) | Hardening later? |
| AR-2 | 010 browser contexts (no session injection) | OPTIONAL | authenticated browser unsupported v1 | Future need? |
| AR-3 | 007 Target kinds; 011 remark on live API targets | **CLOSED — owner-approved 2026-10-11 (P10)**: no distinct API kind, no 007 amendment | WEB-kind destinations under matching F01 scope and grants | None |
| AR-4 | 008 F07 budget dimensions | OPTIONAL | engine-local `LocalBudget` | Add dimensions later? |
| AR-5 | 008 `KillSwitchReason` / `ExecutionAuditEventType` | OPTIONAL | local revoke handling + AuditLogEntry | Add trigger later? |
| AR-6 | 009 `recordEvidence` redaction scope | NONE | 012 value-aware pre-pass | None |
| AR-7 | 009 `FailureClass` | NONE | `TARGET_UNAVAILABLE` | None |
| AR-8 | 009 U-1 text provenance (uncommitted) | provenance risk | none; confirm before freeze | Commit/confirm U-1 |
| AR-9 | 011 provenance (untracked) | provenance risk | none; confirm before freeze | Commit/confirm 011 |
| AR-10 | 009 `resolvePlan` per-unit authorization classes | RECOMMENDED | local dual-class checkpoint (FR-161) | Add per-unit additional classes later? |
| AR-11 | 007 empty `includedActionCategories` semantics (note under AR-1) | NONE (note) | 012 defines the semantics (L27) | None |
| AR-12 | 008/009: lease renewal by a no-consume checkpoint and the absence of a 009 U-1 attestation interface | RECOMMENDED | local liveness test; SG1 uses CI status of T-U1-10 | Clarify upstream |
| AR-13 | DB privilege model for 007/008/009 tables (worker least privilege; roles, positive grants, `sec_*` functions; FR-201) | **REQUIRED FOR ACTIVATION** (SG3/SG10) | unit MAC + broker independent reads + per-worker-principal anomaly rules R1-R6 plus the R7 tenant quota, the durable breach streak and quarantine (FR-173) | Adopt the role model at implementation |
| AR-14 | 007 `createAuthorization` has no precondition hook for a consent record | OPTIONAL | consent enforced at plan resolution, dispatch, broker issue, every request admission, mutation gate (FR-177) | Add a hook later? |
| AR-15 | F06 per-component pricing and refund for unexecuted work | RECOMMENDED (gates purchase of active/authenticated work) | active/authenticated work not purchasable until defined (FR-189, SG1) | Define in F06 |
| AR-16 | 001 readiness contract (FR-066..072) compatibility note | NONE (note) | strictly additive gating (FR-188) | None |
| AR-18 | 009 status and finalization wording: (1) when `ADMITTED` is set relative to the dispatch checkpoint, (2) what `DISPATCHED` means (queue job exists vs set after the checkpoint), (3) runtime step 3 says `REFUSED or KILLED` but the table has no pre-run `KILLED` edge, (4) `PLANNED->REFUSED` is labelled for U-1 only while the matrix and a checkpoint `STOP` reuse it, and the finalization contract calls `REFUSED` "never admitted at all" although an `ADMITTED` unit can be refused, (5) 009 `runtime-finalization-contract.md` boundary rule 1 makes `finalizeExecutionUnit` "the only code path" to a terminal status, while 012 adds the database entry points `sec_finalize_unit`, `sec_refuse_unclaimed_unit` and `sec_sweep_finalize_unit` over one body, and 009's own sweep must route 012 classes through the last, (6) 008 names a `releaseLease` companion without a signature, a transaction contract or a unit-keyed holder-token-free variant, and its admission and release are application operations, so a release inside a finalizing database transaction (4.10C) is not provided | **REQUIRED CLARIFICATION before activation** (SG1); no planning blocker | 012 reads the pickup status, uses only edges in the 009 implementation's table (`ExecutionUnitTransitionPolicy`), refuses before `RUNNING` only with `REFUSED` through a finalize-equivalent, adds no status or edge | 009 owner clarifies the text |
| AR-17 | 006 ADR-005 (flat price per domain; ACTIVE_SECURITY/AUTHENTICATED_WORKFLOW named flat-priced) vs class-level settlement of any class incl. passive (FR-198, P17) | CONTROLLED AMENDMENT REQUEST (before `CLASS_LEVEL` mode) | default `AREA_COUNT` mode: today's billing/refund unchanged; active/authenticated not purchasable (`SEC_ENGINE_DISABLED`) | Owner decides P17 and an ADR-005 amendment |
| AR-19 | 008 `requestAdmission`, `safetyCheckpoint`, `releaseLease`: all identifying arguments (including `now`) are caller-supplied, `releaseLease` is unspecified, no unit-keyed release by authority, no transaction-participating surface | **REQUIRED FOR ACTIVATION** (blocks FR-201 deployment; clarification or amendment request, **not approved, not implemented**) | claim-bound wrappers deriving every identifier from the claimed unit (data-model 4.10C), or the AR-13 alternative (a separate admission service) | 008 owner provides the surface or the alternative is approved after independent review |
| AR-20 | 009 queue topology (per-class queues, payload `{executionUnitId}`): no per-tenant job routing | REQUIRED only for Mode S (tenant isolation under worker compromise); conditional | Mode P (shared pool, rule CS1) is the only planned mode until the owner decides | Owner chooses Mode S or Mode P (OD-4) |
| AR-22 | 009 `scan-deadline-contract.md` rule 3 / SPEC 011 Execution Plane: absolute hard TTL at dispatch, execution-plane dead-man switch and orphan reconciler for 012's classes (F1) | REQUIRED FOR ACTIVATION of E14 and E15; **not approved** | 012 plans a child-side deadline and broker lease expiry and states which bounds are enforceable; activation stays blocked | 009 and SPEC 011 owners |
| AR-21 | 009/010/011 workers of non-012 classes and the legacy SECURITY capabilities write evidence, issues and module results without a claim-scoped capability | RECOMMENDED (hardening; the same function pattern applies) | 012 states the exposure and the poisoned-input path; reports state the producing unit class | Owners of those specs decide whether to adopt the pattern |

## AR-1 - `isAuthorized` has no account / role / action-category parameters

- **Class**: RECOMMENDED (hardening).
- **Affected**: SPEC 007 (F01) `isAuthorized` contract and `TargetAuthorization.scope` (`includedAccountRefs`, `includedRoles`, `includedActionCategories`): 007 defines the *shape* and defers the *semantics* to F05, but gives `isAuthorized` no account, role or action-category argument.
- **Why**: without enforcement the grant fields would be decorative; a per-class grant would authorize any identity and any action category within the class.
- **Local mitigation adopted**: `securityScopeGate(identityRef, role, actionCategory, destination)` runs before every F07 checkpoint, in addition to F01/F07, fail closed (`SEC_SCOPE_GATE_ERROR`), with a conformance test per action category (spec FR-011, FR-012; tasks T036, T037). Named limitation: enforced by 012 code plus conformance tests, not by F01 (the same governance model as 008 FR-019).
- **Owner decides**: whether to later extend `isAuthorized` with an action-category/account argument so enforcement moves into F01. Not required; no 012 task depends on it.
- **AR-11 (note, reconciliation L27)**: 007 treats `includedActionCategories` as an opaque shape and gives **no semantics for an empty list**. 012 (F05) defines them in `security-scope-contract`: an **empty list authorizes `READ` and `NEGATIVE_PROBE` only**; a non-empty list is a closed allow-list; `FIXTURE_MUTATE` always requires explicit listing (FR-011). Class NONE: no upstream edit wanted; recorded so 007's later hardening of this field does not silently change 012 behavior.

## AR-2 - 010 browser contexts have no session-injection primitive

- **Class**: OPTIONAL.
- **Affected**: SPEC 010 browser matrix/contexts (each `BROWSER` unit gets a fresh zero-state context).
- **Why**: authenticated browser testing (for example DOM XSS on an authenticated page) needs a way to inject a session/storage state; none exists.
- **Local mitigation adopted**: authenticated browser testing is `UNSUPPORTED` in v1 (FR-048, FR-085, FR-133); browser-based checks are unauthenticated and non-mutating, via 010 `BROWSER` units only; no screenshots or HAR of authenticated pages (T176). HTTP-level authenticated testing is unaffected.
- **Owner decides**: whether authenticated browser testing is a future product goal (P8). If yes, a 010 amendment (session-injection primitive and its redaction story) is needed first.

## AR-3 - Confirm WEB-kind Target suffices for APIs (and 011's remark) — CLOSED 2026-10-11

> **Owner decision P10 / AR-3 — OWNER-APPROVED 2026-10-11**: existing web targets may cover APIs when F01 authorization and scope requirements are satisfied. There is no distinct API Target kind and **no 007 amendment is required**. The text below is retained as the original analysis.

- **Class**: owner confirmation; **REQUIRED only if the owner chooses a distinct API Target kind**.
- **Affected**: SPEC 007 Target kinds and boundedness rule; SPEC 011 statement that live API targets "would need their own 007 amendment".
- **Why**: 012 treats an HTTP API as a `WEB`-kind destination (host/path/scheme/port) whose host satisfies 007's boundedness rule; an API on a different registrable domain needs its own verified Target and grant (grants are never combined, 007 FR-013; cross-domain composite flows `UNSUPPORTED` in v1). 011's remark is therefore only relevant if APIs are a distinct *kind*.
- **Local mitigation adopted**: WEB-kind destinations; API-ness is carried by `API_SURFACE` evidence, not by Target kind (FR-098, FR-100).
- **Owner decides (P10)**: confirm "WEB-kind suffices" at closure. If the owner instead wants a distinct API kind, this becomes REQUIRED and a 007 amendment must precede SG1 for the API checks (the rest of 012 is unaffected).

## AR-4 - F07 has no byte / auth-attempt / mutation budget dimension

- **Class**: OPTIONAL.
- **Affected**: SPEC 008 admission ledger (requests, concurrency, duration only).
- **Why**: 012 needs byte, auth-attempt, per-endpoint, per-identity, redirect-depth, retry and mutation limits.
- **Local mitigation adopted**: engine-local `LocalBudget`, pre-checked before every request, labeled "LOCAL - not F07-ledgered" in every contract and report; only tighter than F07, never a substitute (FR-069..FR-076; T028, T029). F07 remains authoritative for requests, concurrency and duration.
- **Owner decides**: whether to add real F07 dimensions later (cross-engine consistency, restart-safe counters).

## AR-5 - F07 closed enums; no credential-revocation trigger

- **Class**: OPTIONAL.
- **Affected**: SPEC 008 `KillSwitchReason` and `ExecutionAuditEventType` (closed).
- **Why**: broker-side credential revocation has no F07 kill reason; audit has no credential event type.
- **Local mitigation adopted**: the engine re-validates the credential lease at every checkpoint and ends the unit `COMPLETED` with verdict `BLOCKED` (`SEC_CREDENTIAL_REVOKED`) or `FAILED` per 009 classification; detail goes to the existing `AuditLogEntry` and into the redacted `payload` of EXISTING `ExecutionAuditEventType` values; no new enum value is used (FR-022, FR-039; T062, T068).
- **Owner decides**: whether a dedicated credential-revocation trigger is worth a 008 amendment.

## AR-6 - 009 `recordEvidence` redaction is mandatory only for three classes

- **Class**: NONE (no amendment needed). Recorded for the precedent.
- **Affected**: SPEC 009 FR-030 (mandatory redaction for specific unit classes) and Evidence envelope.
- **Why recorded**: redaction must also cover parent-side derived evidence and 012 evidence from `BROWSER`/`CRAWLER`/`PASSIVE_HTTP` units. 010 FR-045 already noted the same gap and resolved it locally.
- **Local mitigation adopted**: 012 adds its own value-aware redaction pre-pass applied to every 012 evidence write (FR-127, FR-128; T030, T031), following the 010 FR-045 precedent.
- **Owner decides**: nothing.

## AR-7 - 009 `FailureClass` lacks a target-broke class

- **Class**: NONE.
- **Affected**: SPEC 009 `FailureClass`.
- **Resolution**: `TARGET_UNAVAILABLE` covers a target that broke; a successful probe, 401 or 403 is a measured result (`COMPLETED` with evidence); `CUSTOMER_CODE_FAILURE` is not used (FR-059; T157).
- **Owner decides**: nothing.

## AR-8 - 009 U-1 text is uncommitted (provenance risk)

- **Class**: provenance risk (not an amendment request).
- **Affected**: `specs/009-core-scan-execution-platform/` working-tree changes (scan deadline policy, `scan-deadline-contract.md`) are modified/untracked relative to HEAD.
- **Why**: 012 relies on U-1 for unit timing, `onUnitExpired` (TERMINATED/PENDING) and `deadlineMs`. If U-1 text changes before commit, 012's Unit timing and FR-052/FR-061 must be re-checked.
- **Local mitigation adopted**: spec states the working tree is the source of truth and records the risk (spec header; research.md R0); tasks T521 and SG1 gate on the committed U-1 text and its behavioral self-test.
- **Owner decides**: commit and freeze the 009 U-1 text (or record an exception) before the 012 closure pass.

## AR-9 - SPEC 011 is untracked/uncommitted (provenance)

- **Class**: provenance risk (not an amendment request).
- **Affected**: `specs/011-source-backend-database-testing-platform/` (untracked).
- **Why**: 012 consumes 011 contracts (`SOURCE_SURFACE`, `DEPENDENCY`, `CODE_FLOW`, `RouteIdentity` grammar version 1) by reference.
- **Local mitigation adopted**: consumption is by contract name only; 012 never imports 011 code (FR-156); if 011 changes, advisory-matching and API-surface joins are re-verified at closure; T521 checks.
- **Owner decides**: commit 011 (or record an exception) before the 012 freeze.

## AR-10 - 009 `resolvePlan` has no per-unit additional authorization classes

- **Class**: RECOMMENDED.
- **Affected**: SPEC 009 `resolvePlan` / plan resolver: a unit is authorized against exactly one primary `ExecutionClass`.
- **Why**: a credentialed *crafted* request (for example a cross-identity authorization probe) is both `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW` work (FR-008, FR-161). Plan resolution cannot check the secondary class, so a missing secondary grant surfaces only at dispatch as `BLOCKED`, after charge.
- **Local mitigation adopted (FR-161, reconciliation L2)**: the E14 unit checkpoints every such request twice (primary `ACTIVE_SECURITY` with `consumes{request:true}`, secondary `AUTHENTICATED_WORKFLOW` with `consumes{request:false, concurrency:false}`); either `STOP` aborts; reverify is a single E14 unit with the dual checkpoint. 012 never edits 009.
- **Owner decides**: whether 009 later allows per-unit additional authorization classes so the refusal moves to plan time. Not required.

## AR-12 - Lease renewal by a `consumes{false,false}` checkpoint; no U-1 attestation interface

- **Class**: RECOMMENDED.
- **Affected**: SPEC 008 FR-004 / `safety-checkpoint-contract` (renewal is stated to happen "implicitly each time its holding unit passes a safety checkpoint", but `safetyCheckpoint` takes no `holderToken` and 008 admission requires the token on renewal) and SPEC 009 `tasks.md` T-U1-1..T-U1-10 (an adverse-test task, not a behavioral self-test or queryable attestation).
- **Why**: 012's liveness checkpoint (`consumes{false,false}`) is relied on to keep the 30 s F07 lease alive, and SG1 wants proof that U-1 is implemented.
- **Local mitigation adopted**: a local test asserts a unit survives longer than 30 s on liveness checkpoints alone (T562-class fixture); SG1 is defined as "009 T-U1-1..10 implemented and the T-U1-10 adverse suite green in CI".
- **Owner decides**: whether 008/009 state the renewal rule and expose an attestation. Not required for safety: a failed renewal already ends the unit (008 FR-006a).

## AR-13 - Database privilege isolation for the worker role (REQUIRED FOR ACTIVATION)

- **Class**: REQUIRED FOR ACTIVATION of the credential broker and of every active/authenticated engine (SG3, SG10). Not an edit of a frozen document: it is an implementation-level privilege boundary on 007 `TargetAuthorization`/`ScopeDefinition`, 008 `AdmissionLease`/`BudgetConsumption`/`KillSwitchState` and 009 `ExecutionUnit`/`ScanPlan`/`Scan`, which needs those specs' implementation owners' agreement because their worker code paths currently write some of those tables.
- **Why**: the unit MAC covers configuration fields, not unit status, plan, scan, `AdmissionLease`, `KillSwitchState` or the dispatch claim; without database isolation a worker-role session could flip a historical MAC-valid unit to `DISPATCHED`, write its own claim and delete kill-switch rows. MAC validation alone is not the trust boundary (FR-173, FR-201).
- **Required design (FR-201)**: roles `fahes_worker_exec`, `fahes_orchestrator`, `fahes_api_planner`, `fahes_broker`, `fahes_operator` with the **positive** grant matrix of data-model 4.10A (every unlisted table denied; FR-201 lists the grants, not a deny-list); security-definer functions `sec_claim_unit_host` (class-scoped by `servedClasses`, not tenant-scoped), `sec_record_step_table`, `sec_transition_unit` (the three non-terminal edges), `sec_finalize_unit` (claim owner only), `sec_refuse_unclaimed_unit` (the only no-claim path: `PLANNED` units, four database-verified step-0 reasons, `REFUSED` only), `sec_sweep_finalize_unit` (orchestrator login only, cause derived by the function), all over one internal terminal body with 009 `finalizeExecutionUnit` semantics (data-model 4.10B closed refusal-reason matrix), `sec_register_worker_principal`, `sec_revoke_worker_principal` (writing the 012-owned `UnitDispatchRecord`, `WorkerPrincipal`, `BrokerPrincipalState`); authenticated principals; broker verification of dispatch facts; durable `BrokerPrincipalIssueEvent`/`BrokerPrincipalState`; migration M012-7; privilege-bypass, replayed-historical-unit and multi-replica tests (T614, T615, T780-T785).
- **Worker write and read surface (MA-07, MA-17, MA-18)**: designed in FR-201(j) and data-model 4.10A, 4.10C and 4.10D: claim-scoped security-definer functions for every worker read and write, the `fahes_sec_derive` role for parent-derived records, claim-bound 008 wrappers, a `ModuleResult` trigger and claim-spread rule CS1. This is part of the required design, not an optional hardening; the remaining owner choice is the isolation mode (OD-4: Mode S or Mode P).
- **Alternative**: a technically equivalent isolation (for example a separate dispatch service owning those writes) is acceptable only after explicit independent approval.
- **Owner decides (OD-2)**: scheduling with the 007/008/009 implementation owners (cross-owner; unscheduled). Until it is deployed and its suite is green, the broker refuses issuance and active/authenticated execution stays disabled.

## AR-14 - 007 `createAuthorization` has no consent-record precondition

- **Class**: OPTIONAL.
- **Affected**: SPEC 007 `grant-lifecycle-contract` (`createAuthorization` preconditions 1-7).
- **Why**: FR-177 cannot be enforced "at grant creation" because 012 cannot modify 007.
- **Local mitigation adopted**: a grant may exist without a `SecurityConsentRecord`, but 012 refuses every use of it — plan resolution, dispatch (including uncredentialed `C1` units), broker issue, every permit mint and the mutation gate (`SEC_CONSENT_MISSING`; lookup error `SEC_SCOPE_GATE_ERROR`). A product route may require the record before calling 007 as a convenience, not as the boundary.
- **Owner decides**: whether 007 later gains a precondition hook. Not required.

## AR-15 - F06 per-component pricing and refund for unexecuted security work

- **Class**: RECOMMENDED (a dependency that **gates the purchase** of active/authenticated work; it is not an upstream document edit).
- **Affected**: F06 pricing/quote and credit-refund logic (`AREA_COST`, `terminal-refund.ts`, `timeout.ts`); 006 ADR-005 (flat per domain).
- **Why**: owner decision P15 (OWNER-APPROVED 2026-10-11) requires charging only for billable work actually executed, never for `BLOCKED`/`NOT_TESTED`/unexecuted checks; today `AREA_COST.SECURITY` is flat, the refund is an area-count function over delivered areas, and `DEGRADED` counts as delivered.
- **Proposed mechanism (P17, NOT approved; default `AREA_COUNT` = today's semantics)**: execution-class-level billing over `PASSIVE_SECURITY`, `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW` with execution-backed partial settlement (FR-198): per-class price from an F06 class price table; charge `floor(classPrice x executedWeight / plannedWeight)`; refund the remainder; idempotent through `SecuritySettlement` (unique on `scanPlanId`); in `CLASS_LEVEL` mode only, the SECURITY area is excluded from `refundForUndelivered`; the credit ledger is reused unchanged.
- **Local mitigation adopted (FR-189)**: in the default `AREA_COUNT` mode 012 changes no price, no charge and no refund (the passive partial-coverage gap is stated openly); it emits `securityBillableWorkSummary` as a read-only input; **active and authenticated work is not purchasable (`SEC_ENGINE_DISABLED`) until F06 defines the class price table and the settlement rule** (an SG1 condition); the passive class keeps today's price and semantics.
- **Owner decides**: P17, F06 scope and timing.

## AR-17 - Conflict between class-level settlement and 006 ADR-005 (flat price per domain)

- **Class**: CONTROLLED AMENDMENT REQUEST, needed before `x012.settlementMode = CLASS_LEVEL` can be enabled for ANY class; not a planning blocker because the default mode (`AREA_COUNT`) leaves billing unchanged.
- **Exact conflict**: ADR-005 (006 `decisions.md`) says only `LOAD_CAPACITY` and `SOURCE_EXECUTION` get variable/metered pricing and "every other class (including ... `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`) stays flat-priced". FR-198 (a) allocates the SECURITY price across classes and (b) charges proportionally to executed weight — both non-flat — and applies to the passive class as well, so the conflict is not limited to the unsold active classes.
- **Local mitigation adopted**: no 006 edit; default `AREA_COUNT` mode; active/authenticated classes not offered (`SEC_ENGINE_DISABLED`).
- **Owner decides**: P17 and an ADR-005 amendment through the controlled process (ADR-005 itself says a revisit needs new evidence and has no standing process yet).


## AR-18 - 009 status and finalization wording is ambiguous for the dispatch order (REQUIRED CLARIFICATION before activation)

- **Class**: CLARIFICATION REQUEST (no text is changed by 012); required before activation (SG1), not a planning blocker because 012 neither adds a status or an edge nor relies on a reading that the 009 diagram, runtime steps and status-by-cause matrix do not already support (checked line by line in `sixth-semantic-audit.md`).
- **Exact ambiguities** (009 `data-model.md:53-65`, `plan.md` lifecycle diagram, `contracts/execution-runtime-contract.md` steps 0-5, `contracts/runtime-finalization-contract.md`, `contracts/scan-deadline-contract.md:118,180-195`, `contracts/execution-unit-contract.md:84-86`): (1) `ADMITTED` is defined as "passed F07 safetyCheckpoint ... about to dispatch", yet runtime step 3 refuses on `STOP` before any transition to `ADMITTED`, and the only pre-U-1 edge into `REFUSED` is `ADMITTED->REFUSED`; (2) `DISPATCHED` is defined in U-1 as "a queue job exists and no child process has started", yet runtime step 1 enqueues the job first and step 4 sets `DISPATCHED` only after the checkpoint, and U-1 step 0 may see a `DISPATCHED` unit at pickup; (3) runtime step 3 says a checkpoint `STOP` transitions to `REFUSED or KILLED`, but the diagram and the matrix give `KILLED` only from `RUNNING` and map a pre-run kill switch to `REFUSED(KILL_SWITCH_PENDING)`; (4) the diagram labels `PLANNED->REFUSED` and `DISPATCHED->REFUSED` as U-1 deadline edges while the matrix and a checkpoint `STOP` from those statuses reuse them, and `finalizeExecutionUnit` describes `REFUSED` as "never admitted at all" although the matrix refuses `ADMITTED` and `DISPATCHED` units.
- **What 012 does**: `sec_claim_unit_host` changes no status; `sec_transition_unit` accepts only `PLANNED->ADMITTED` (guarded by a live F07 `AdmissionLease`), `ADMITTED->DISPATCHED` and `DISPATCHED->RUNNING`; every terminal outcome, including every pre-run refusal, goes through one internal body with 009 `finalizeExecutionUnit` semantics (idempotency, lease release, guarded edge, `BLOCKED` propagation, snapshot, audit, all in one transaction) reached by `sec_finalize_unit` (claim owner only), `sec_refuse_unclaimed_unit` (no claim; `PLANNED` only; four database-verified step-0 reasons) or the orchestrator-only `sec_sweep_finalize_unit` (cause derived from database state); a pre-run stop or refusal is `REFUSED` with the F07 reason through the edge 009's table defines for the status read at pickup, and `KILLED` is used only from `RUNNING`; the broker lease is issued after `RUNNING`; broker denial uses `RUNNING->COMPLETED`, never the U-1 `DISPATCHED->REFUSED` edge. The `ExecutionUnitTransitionPolicy` is generated from the 009 implementation and compared at SG1; if the implementation's table lacks an edge 012 needs, or 008's lease release cannot run inside the finalizing transaction, SG1 fails and this request becomes an amendment request; 012 never invents a transition.
- **Is any 012 repair inexpressible with 009's existing statuses and edges?** No. Every pre-run refusal uses an edge in the 009 diagram or matrix; `KILLED` is not used before `RUNNING`; no status or edge is added. This is why AR-18 stays an activation-time clarification and not an upstream planning blocker.
- **Fifth ambiguity (single-authority rule)**: 009 `runtime-finalization-contract.md` non-negotiable rule 1 says `finalizeExecutionUnit` "MUST be the only code path that transitions an `ExecutionUnit` to a terminal status". 012's database privilege boundary (FR-201, AR-13) requires the terminal write for `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW` units to happen inside security-definer functions so that a worker role holds no status privilege. Read literally, that is a second terminal-status code path. What 012 states and does not decide: the three entry points share one internal body that reproduces `finalizeExecutionUnit` rules 1-5 exactly (idempotency, lease release, guarded edge, snapshot, one-level `BLOCKED`) in one transaction; 009's own `expirePlanUnits` and sweep must call the sweep entry point for those classes instead of writing directly; equivalence is checked at SG1 by the transition-policy equality and the finalize-atomicity suite. **Not approved and not implemented**: whether 009 reads rule 1 as "one logical function with a database implementation" or amends it is the 009 owner's call.
- **Sixth ambiguity (008 transactional lease-release surface)**: 009 finalization step 2 releases the held F07 lease "via F07's own release operation", and requires the whole finalization to be one transaction (rule 3). 008 defines `releaseLease` only as "companion ... not separately respecified" (`safety-checkpoint-contract.md` step 3); its `AdmissionLease` has a per-acquisition `holderToken` that fences renewals (`data-model.md` AdmissionLease, FR-006a) and is silent on release by authority, on a unit-keyed release and on joining a caller's transaction. A TypeScript/Prisma operation cannot be assumed to participate in a security-definer function's transaction. The exact capability 012 requires is data-model 4.10C (same-session, unit-keyed, holder-token-free for the finalizer, idempotent, counter-correcting, definer-only; plus SQL-level admission operations for the worker role, or the AR-13 alternative of a separate dispatch and admission service). **Not approved and not implemented**: 008 is not edited; the 008 owner must either provide the capability or agree the alternative before SG1 can pass. Until then FR-201 cannot be deployed and broker and active-engine activation stay blocked; AR-19 states the required 008 amendment precisely.
- **Owner decides**: 009 clarifies the four wording statements (or confirms the implementation's table as authoritative) and states its position on the fifth; the 008 owner states whether the sixth capability exists or is delivered by the alternative.

## AR-16 - Compatibility note: readiness gating over the 001 readiness contract

- **Class**: NONE (note).
- **Affected**: the existing readiness contract (001 FR-066..072: pass = per-area thresholds and no regressions); SPEC 014 (not modified).
- **Why**: FR-188 adds a gate (`SECURITY_COVERAGE_INCOMPLETE`) to readiness, certificates, reports, exports, notifications and live progress events.
- **Compatibility analysis**: strictly additive — scans without a 012 coverage requirement, stored readiness verdicts and every existing response field are unchanged; one new blocker class, optional response fields (including the live event fields `coverageComplete`/`observedScore`) and a certificate precondition; `overallScore()` gains an additive output with an unchanged numeric result. SPEC 014 receives `coverageComplete` as a mandatory input; no frozen document is edited.

## Resolved additions (formerly "Proposed additions")

- AR-10 and AR-11 added (reconciliation L2, L27). AR-3 stays cross-referenced to P10 and AR-2 to P8 in plan.md.
- No new `SEC_*` codes were invented here; the registry is plan.md's closed 83-code table.
- `adversarial-review.md` is referenced by SC-005; it exists and carries its dispositions (Part 7); this file makes no claim about its content.
- The fourth repair pass (2026-10-15) reclassified AR-13 as REQUIRED FOR ACTIVATION, rescoped AR-17 to every class under `CLASS_LEVEL` settlement, and kept AR-15 as the F06 purchase gate.

## Frozen-doc modification audit

Statement for this repair pass (and the earlier passes): **no file under `specs/006-*`, `specs/007-*`, `specs/008-*`, `specs/009-*`, `specs/010-*` or `specs/011-*` was created, modified or deleted by SPEC 012 work**, and no application code, Prisma schema or migration was touched. Only files under `specs/012-security-auth-api-testing-platform/` are written. The pre-existing `specs/009-core-scan-execution-platform/` working-tree modifications (U-1 edits and untracked `scan-deadline-contract.md`) and the untracked `specs/011-*/` directory existed before this pass and are not attributable to it (AR-8, AR-9). Overall: **no frozen document text requires amendment to complete planning**; AR-13 is an activation prerequisite needing the 007/008/009 implementation owners' agreement, and AR-17 is needed only before `CLASS_LEVEL` billing. Verification at closure: run `git status` and `git diff --stat -- specs/006-* specs/007-* specs/008-* specs/009-* specs/010-* specs/011-*` and confirm no change attributable to 012 (task T504 repeats this after implementation).


## AR-19 - SPEC 008 transactional admission, checkpoint and release surface (REQUIRED FOR ACTIVATION)

- **Class**: clarification or amendment request, **not approved and not implemented**. Blocks deployment of FR-201 and therefore broker and active-engine activation (SG1, SG3, SG10).
- **Affected**: 008 `safety-admission-contract.md` (`requestAdmission(targetId, userId, executionClass, destination, executionId, idempotencyKey, consumes, now)`), `safety-checkpoint-contract.md` (`safetyCheckpoint(executionId, targetId, userId, ...)`, step 3 "`releaseLease`, not separately respecified") and 008 `data-model.md` `AdmissionLease` (`executionId`, per-acquisition `holderToken`, renewal guarded by the token).
- **Why**: (1) every identifying argument, including `now`, is supplied by the caller, so a worker role with EXECUTE can charge another tenant's budget or hold its concurrency lease (MA-18) and violates the database-clock rule (FR-178); (2) `releaseLease` has no stated signature, no unit-keyed release by authority and no `holderToken`-free variant, but 009 finalization and the sweep must release a crashed host's lease; (3) an application operation cannot be assumed to join a database function's transaction, while 009 finalization rule 3 forbids a half-finalized unit.
- **Required (data-model 4.10C)**: SQL-level or transaction-participating admission, checkpoint consumption and release; identifiers derived from the claimed unit; release by authority keyed by `executionId`; idempotent counter-correcting release; same-transaction audit.
- **Local mitigation adopted**: none that is safe; 012 refuses to deploy FR-201 and keeps the engines disabled. Alternative: the AR-13 separate admission service, acceptable only after independent approval.
- **Owner decides**: the 008 implementation owner provides the surface, or the alternative is approved (OD-2 scheduling).

## AR-20 - Per-tenant job routing for tenant-scoped worker principals (conditional)

- **Class**: required only if the owner chooses Mode S (OD-4); otherwise OPTIONAL. **Not approved.**
- **Affected**: 009 `plan.md` runtime and queue topology (per-class queues `webaudit-exec-active-security` and `webaudit-exec-authenticated-workflow`, payload `{executionUnitId}` only).
- **Why**: `WorkerPrincipal.servedTenantIds` makes the database refuse another tenant's claim, but a competing-consumer queue without tenant routing would deliver other tenants' jobs to a tenant-scoped instance, which would then be refused and stall until redelivery.
- **Required for Mode S**: deployment pools (or queue partitions) per tenant or tenant group, with the job routed by a tenant key outside the payload (queue name), and a registered principal per pool.
- **Owner decides**: Mode S or Mode P (OD-4).

## AR-22 - Hosting-failure backstop for E14 and E15 (REQUIRED FOR ACTIVATION)

- **Class**: REQUIRED FOR ACTIVATION of `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW`. **Not approved.** No frozen text is edited; 009 already states the obligation (`scan-deadline-contract.md` "Interaction with cancellation, F01 and F07" rule 3), and SPEC 009 U-1 is uncommitted (AR-8).
- **Affected**: SPEC 009 deadline contract, SPEC 011 Execution Plane (dead-man switch, hard TTL, orphan reconciler), the broker.
- **Needed from the owners (data-model 4.10F D1, D2)**: (1) the absolute hard TTL `H` (dispatch time + `timeoutPolicyMs` + `hardStopMarginMs`) stored as an absolute instant readable by the broker, the child and the reconciler; (2) an execution-plane dead-man switch and orphan reconciler that terminate the process group, or confirm the host gone, for a non-terminal unit past `H` without the parent, request broker revocation, and report the unit to the orchestrator; (3) a measured reconciler service level (none exists; 012 claims none).
- **Not requested and not relied on**: a hard-TTL cause in 009's status-by-cause matrix that finalizes the status row before the plan deadline, and any takeover or retry.
- **Local mitigation until approved**: broker lease expiry and the child-side deadline are planned in 012, the alerts of 4.10F exist, and E14 and E15 activation stays blocked (SG1, SG3).
- **Owner decides**: the 009 and SPEC 011 owners.

## AR-21 - Confinement of non-012 execution-class writes (RECOMMENDED)

- **Class**: RECOMMENDED. **Not approved.**
- **Affected**: 009/010/011 workers (`PASSIVE_HTTP`, `BROWSER`, `CRAWLER`, `SOURCE_*`) and the legacy SECURITY capabilities, which write `Evidence`, `Issue`, `ModuleResult` and `CapabilityExecution` without a claim-scoped capability.
- **Why**: 012's passive checks consume that evidence; a compromised passive worker can poison it or write another tenant's rows (today's behavior, not widened by 012). The same function pattern (4.10D) would close it.
- **Local mitigation**: 012 does not claim isolation for those classes; reports state the producing unit class; FR-196 is database-enforced for `ModuleResult(SECURITY)` after the marker only. **Stated exposure (IC-6)**: 012 adds no database control over legacy `Issue` or `CapabilityExecution` inserts and deliberately does not extend its privileges to legacy workers, so after the marker the application guard (FR-196(d)) is the only barrier and a defective or compromised legacy worker can insert late `Issue` rows; the stored score is not recomputed, so consumers count `Issue` rows at read time and caption rows created after finalization (coverage contract rendering rule 6, FR-188).
- **Owner decides**: the 009/010/011 implementation owners.
