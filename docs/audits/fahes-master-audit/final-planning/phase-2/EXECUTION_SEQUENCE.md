# Execution Sequence (phase 2)

Turns the 53-task backlog (`../IMPLEMENTATION_BACKLOG.md`) into an ordered sequence. **No duplicate tasks are created**; original IDs are kept. "Start now" is conservative: it is `YES` only where the task needs no decision and no unapproved design, and is **never** an instruction to start. Starting any code task still needs your explicit authorization (see `FIRST_IMPLEMENTATION_GATE.md`).

## Corrections to the original backlog (original files unchanged)

1. **F-03 prerequisites overstated.** The backlog lists DEC-034 and F-02 as prerequisites for SPEC 007. SPEC 007 needs neither: its own T019 allows stubbing budget consumption (`specs/007…/tasks.md` T019) and `BUDGET_EXHAUSTED` is "DOWNSTREAM RUNTIME ENFORCED" by F07 (`data-model.md:360`). Proposed correction: F-03 has no decision prerequisites; it requires start authorization, environment (Docker/Postgres for T003+ only), and the baseline of existing gates (F-01a).
2. **F-03 slice 1 hidden coupling (new evidence).** `packages/types/tests/unit/enum-drift.test.ts` fails its "accounts for every enum in the schema" test when `schema.prisma` gains an enum that is neither mirrored in `packages/types/src/domain.ts` (`MIRRORED`) nor listed in `NOT_MIRRORED`. 007 T001 adds three enums and does not mention this. Slice 1 must therefore also mirror (or explicitly record as not mirrored) `ExecutionClass`, `TargetEnvironmentClassification`, `ScopeTargetKind`. This is an implementation choice (decision category F), not an owner decision; AGENTS.md says to share domain types through `packages/types`.
3. **F-01 split.** No CI exists and none is mandated by any document (`PROJECT_MAP.md` only records its absence). Scope depends on baseline results (PROJECT_MAP warns of Turbo cycles and pre-existing failures) and on DB/Redis services in CI. F-01a (baseline evidence) is startable; F-01b (workflow) is not until DEC-067 and F-01a.
4. **DEC-062** is moot under today's area-based refund; it does not block B-02 unless DEC-038 is adopted.

## Sequence

### A. Safe evidence and documentation tasks

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| EV-06 | evidence | DEC-022,DEC-057 | — | YES — repository reading only; no decision needed | Collect each engine's consumes policy per call (010 states none) | Table per engine | — | evidence report file in repo |
| EV-08 | evidence | DEC-052,DEC-051 | — | YES — repository reading only | Confirm 010 effect points needing authorization (context creation, navigation) | Enumerated effect list | — | evidence report file in repo |
| G-07 | documentation (edits canonical specs) | DEC-019,DEC-022 | — | YES — planning-directory document only (no canonical spec edit) | Terminology and SPEC-prefixed ID map | No bare P/F/A/N in new text; consumes terminology used | grep check | reviewed diff of the named spec files + validation greps |
| G-10 | documentation (edits canonical specs) | DEC-019 | — | YES — new CSV files only; old CSVs untouched | New CSVs with file:line refs, normalized severity, independence labels, coverage of 007-012 | Coverage table per spec; closed severity enum | script validation | reviewed diff of the named spec files + validation greps |
| EV-01 | evidence | DEC-050 | — | NO — needs an owner/spec-owner statement or target-environment access | Obtain 008 lock-order statements/implementation plan for admission, renewal, release, reclaim, reconcile | Documented order per operation | — | evidence report file in repo |
| EV-02 | evidence | DEC-054 | — | NO — needs an owner/spec-owner statement or target-environment access | Confirm whether the Execution Plane can reject stale provision (tombstone/epoch) | Provider contract text or test | — | evidence report file in repo |
| EV-03 | evidence | DEC-053 | — | NO — needs an owner/spec-owner statement or target-environment access | Confirm 011 phase-to-009-status mapping and credential timing | 011 owner statement in repo | — | evidence report file in repo |
| EV-04 | evidence | DEC-056 | — | NO — needs deployment configuration evidence | Verify DB bind-parameter logging disabled and statement logging config | Deployment config evidence | — | evidence report file in repo |
| EV-05 | evidence | DEC-063 | — | NO — needs the reclaim job to exist (S-03) | Verify the lease reclaim sweep exists/cadence once implemented | Job registration + interval evidence | — | evidence report file in repo |
| EV-07 | evidence | DEC-044,DEC-040 | — | NO — needs an owner/spec-owner statement or target-environment access | Verify managed Postgres supports non-superuser NOLOGIN owners, CREATE/TEMP revocation, pooler identity | Verification queries run on the target deployment | — | evidence report file in repo |

### B. Independent infrastructure

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| F-01 | independent infrastructure | DEC-067 | — | PARTIAL — split: F-01a baseline evidence of the existing gate commands may start (needs your authorization to run builds/tests; Docker is down for DB suites); F-01b CI workflow needs DEC-067 and F-01a results | CI for typecheck, lint, unit, adverse on PR | CI green on main | existing suites (pnpm typecheck/lint/test/test:adverse) | diff + test output + acceptance table |

### C. Foundational security and data-contract work

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| F-03 | foundational (SPEC 007; independent of 008/009) | DEC-003,DEC-034 | F-01,F-02 | AFTER YOUR START AUTHORIZATION — slice 1 only (007 T001–T002 plus enum mirroring). Corrected prerequisites: no decisions; F-01a baseline only (backlog listed DEC-003/DEC-034 and F-01/F-02; see correction 1). See FIRST_IMPLEMENTATION_GATE | Implement 007 tasks T001-T042 tests-first: ExecutionClass enums, TargetEnvironment, TargetAuthorization, ScopeDefinition, isAuthorized | 007 contract and adverse tests green | 007 unit/adverse/contract suites | diff + test output + acceptance table |
| F-02 | foundational | DEC-034,DEC-044 | — | NO (design may be drafted) — adoption needs DEC-034 / DEC-044 / DEC-045 direction | Role/grant matrix and function inventory for 007/008/009/012 tables | Matrix reviewed by all table owners | review | diff + test output + acceptance table |
| S-01 | SPEC-local (008) | DEC-020,DEC-044 | F-03,F-02 | NO — prerequisite decisions or tasks not satisfied | 008 data model | prisma validate; constraints per data-model.md | schema/constraint tests | diff + test output + race/adverse results |
| S-02 | SPEC-local (008) | DEC-050,DEC-045 | S-01,G-03 | NO — prerequisite decisions or tasks not satisfied | Atomic admission with locked counter, replay lookup before counter lock, trusted-caller/identity derivation per DEC-045 | No over-admission under N concurrent callers; replay returns same result | apps/api/tests/adverse/safety-admission-race.test.ts; replay tests | diff + test output + race/adverse results |
| S-03 | SPEC-local (008) | DEC-050,DEC-063,DEC-045 | S-02 | NO — prerequisite decisions or tasks not satisfied | Renewal (token), release by authority (unit-keyed, token-free, transaction-joinable), reclaim and drift reconcile jobs with fixed lock order | Release inside caller txn; reclaim ≤ one sweep interval after expiry | lease race and lock-order stress tests | diff + test output + race/adverse results |
| S-04 | SPEC-local (008) | DEC-048,DEC-049 | S-02,G-03 | NO — prerequisite decisions or tasks not satisfied | triggerStop/acknowledge/recordStopped/escalation plus stranded-state handling per owner decision | No stranded REQUESTED row without alert; ordering per decision | kill-switch lifecycle tests incl. hostless | diff + test output + race/adverse results |
| S-05 | SPEC-local (008) | DEC-050 | S-02,S-03,S-04 | NO — prerequisite decisions or tasks not satisfied | Concurrency/adverse suite: duplicate admission, release vs reclaim, finalize vs renewal, competing lock orders | All races from the crash matrix reproduced and bounded | adverse suite | diff + test output + race/adverse results |

### D. Spec finalization (documentation that edits canonical specs; after approvals)

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| G-01 | documentation (edits canonical specs) | DEC-018,DEC-066 | G-02 | NO — prerequisite decisions or tasks not satisfied | Owner commits U-1(+U-1b) then 011 by explicit paths | git ls-files shows the allowlists tracked; allowlist-only diff | git diff --cached --name-only equals allowlist | reviewed diff of the named spec files + validation greps |
| G-02 | documentation (edits canonical specs) | DEC-011,DEC-012,DEC-013,DEC-021,DEC-023,DEC-024,DEC-064,DEC-066 | G-08 | NO — prerequisite decisions or tasks not satisfied | Apply only the owner-approved amendment text | Validation criteria of the approved amendment; grep shows one definition per status | doc consistency greps | reviewed diff of the named spec files + validation greps |
| G-03 | documentation (edits canonical specs) | DEC-045,DEC-048,DEC-049,DEC-050,DEC-063 | EV-01 | NO — prerequisite decisions or tasks not satisfied | Lock order, release surface, stranded-stop handling, recordStopped, reclaim job | 008 states lock order for every operation; stranded-state and recordStopped rules exist | doc checks | reviewed diff of the named spec files + validation greps |
| G-04 | documentation (edits canonical specs) | DEC-042,DEC-052,DEC-051 | EV-08 | NO — prerequisite decisions or tasks not satisfied | Ceiling ordering, pool construction after RUNNING, per-effect fence, U-1 obligations | 010 text consistent with 009 lifecycle | doc checks | reviewed diff of the named spec files + validation greps |
| G-05 | documentation (edits canonical specs) | DEC-053,DEC-054,DEC-046 | EV-02,EV-03 | NO — prerequisite decisions or tasks not satisfied | Status mapping, post-RUNNING provisioning, creation fence, no second F07 call | 011 phases mapped to 009 statuses; EP creation fence specified or explicitly absent | doc checks | reviewed diff of the named spec files + validation greps |
| G-06 | documentation (edits canonical specs) | DEC-044,DEC-047,DEC-050,DEC-055,DEC-058,DEC-063 | G-02 | NO — prerequisite decisions or tasks not satisfied | PLANNED-only claim, remove resume branches, 30 s wording, BudgetCounter in global order, unclaimed refusal rule. 012 remains untracked | 012 consistent with 009; T814 expectations updated | doc checks | reviewed diff of the named spec files + validation greps |
| G-08 | documentation (edits canonical specs) | DEC-069 | — | NO — prerequisite decisions or tasks not satisfied | Write implementation task lists mirroring this backlog | Every 009/010 FR cited by ≥1 implementation task | traceability script | reviewed diff of the named spec files + validation greps |
| G-09 | documentation (edits canonical specs) | DEC-031,DEC-065 | — | NO — prerequisite decisions or tasks not satisfied | Status axes once owner supplies dates | Headers state PLANNING/AUTHORITY/FREEZE/IMPLEMENTATION/ACTIVATION | grep | reviewed diff of the named spec files + validation greps |

### E. SPEC-local implementation (009 core)

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| CORE-01 | SPEC-local (009) | DEC-051,DEC-015 | S-01,G-02 | NO — prerequisite decisions or tasks not satisfied | 009 data model incl. claim and ledger | prisma validate; invariants (unique claim, deadline nullability) | schema tests | diff + test output + matrix trace results |
| CORE-02 | SPEC-local (009) | DEC-024 | CORE-01 | NO — prerequisite decisions or tasks not satisfied | resolvePlan, computePlanDeadline (T-U1-1..3) | Deadline immutable, bounded, grant-aware | planning unit/adverse tests | diff + test output + matrix trace results |
| CORE-03 | SPEC-local (009) | DEC-056,DEC-058,DEC-021 | CORE-01 | NO — prerequisite decisions or tasks not satisfied | claimUnitHost, token mechanics, stop-first cause classifier | Second claimant gets ALREADY_CLAIMED; stop never masked by deadline | claim race tests; precedence table tests | diff + test output + matrix trace results |
| CORE-04 | SPEC-local (009) | DEC-011,DEC-012,DEC-057,DEC-016,DEC-014,DEC-060 | CORE-03,S-02 | NO — prerequisite decisions or tasks not satisfied | Dispatch sequence, pickup-ignore, pre-F07 read, conditional lease predicate (two ordered statements), host loop from PROCEED, CAS transitions | All edges guarded; stale host writes fail | dispatch race/crash suite from matrix | diff + test output + matrix trace results |
| CORE-05 | SPEC-local (009) | DEC-051,DEC-064 | CORE-04,G-02 | NO — prerequisite decisions or tasks not satisfied | Start gate, authorizeEffect, effect ledger, onUnitExpired hook contract | No new authorization after terminalization; hook PENDING while AUTHORIZED | effect-race tests; hook tests | diff + test output + matrix trace results |
| CORE-06 | SPEC-local (009) | DEC-047,DEC-049,DEC-045 | CORE-04,S-03 | NO — prerequisite decisions or tasks not satisfied | finalizeExecutionUnit sole terminal writer, BLOCKED propagation, lease release integration, recordStopped integration | Idempotent; one transaction with release when AR-19 surface exists | finalize race tests | diff + test output + matrix trace results |
| CORE-07 | SPEC-local (009) | DEC-059,DEC-024 | CORE-04,CORE-06 | NO — prerequisite decisions or tasks not satisfied | Planned-pass sweep, expirePlanUnits, continueScanIfPlanTerminal (T-U1-6..8), enqueue reconciler | Legacy sweep tests unchanged and green; AC-1..AC-20 | existing timeout tests + new adverse | diff + test output + matrix trace results |
| CORE-08 | SPEC-local (009) | DEC-006 | CORE-01 | NO — prerequisite decisions or tasks not satisfied | Evidence envelope, artifacts, progress, finding materialization (009 FR-026..FR-037) | Append-only evidence; redaction before store | contract tests | diff + test output + matrix trace results |
| CORE-09 | SPEC-local (009) | DEC-005 | CORE-04,CORE-05,CORE-06,CORE-07 | NO — prerequisite decisions or tasks not satisfied | Race/crash adverse suite from U1B_RACE_CRASH_MATRIX_v2 and final-planning adversarial pass | Every matrix row has a test or an explicit UNPROVEN note | adverse suite | diff + test output + matrix trace results |
| CORE-10 | SPEC-local (009) | DEC-005 | CORE-07 | NO — prerequisite decisions or tasks not satisfied | Passive-only and no-plan scans unchanged | AC-1 and refund tests identical results | existing suites | diff + test output + matrix trace results |

### F. Engines

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| E-01 | SPEC-local (engine) | DEC-052,DEC-042,DEC-051 | CORE-05,G-04 | NO — prerequisite decisions or tasks not satisfied | Browser engine (E10) per decided ceiling option; context creation after RUNNING with authorizeEffect | Ceiling honoured without held lease starvation (per option) | browser pool SSRF suite; ceiling tests | diff + test output + conformance results |
| E-02 | SPEC-local (engine) | DEC-042 | E-01 | NO — prerequisite decisions or tasks not satisfied | Crawler (E11) and domains D22-D25 | Coverage states per 010 contracts | 010 contract tests | diff + test output + conformance results |
| E-03 | SPEC-local (engine) | DEC-041,DEC-006 | CORE-08 | NO — prerequisite decisions or tasks not satisfied | E12 SOURCE_STATIC (011 tasks) | Static analysis evidence only; no customer-code execution | 011 tests for E12 | diff + test output + conformance results |
| E-04 | SPEC-local (engine) | DEC-054,DEC-002 | CORE-05,G-05 | NO — prerequisite decisions or tasks not satisfied | Execution Plane provider interface, fake provider, DisabledProvider; no real provider | Fail-closed when provider absent | fake-provider contract suite | diff + test output + conformance results |
| E-05 | SPEC-local (engine) | DEC-053,DEC-054,DEC-051,DEC-046 | E-04,G-05 | NO — prerequisite decisions or tasks not satisfied | E13 supervisor lifecycle with post-RUNNING provisioning, effect authorization, onUnitExpired | No provision before RUNNING; hook confirms teardown | lifecycle + stale-provision tests (fake provider) | diff + test output + conformance results |
| E-06 | SPEC-local (engine) | DEC-044,DEC-045,DEC-046,DEC-040,DEC-033 | F-02,S-03,CORE-06,G-06,EV-07 | NO — prerequisite decisions or tasks not satisfied | Credential broker, vault, principals, definer functions | Broker refuses issuance until SG3/SG10 | 012 broker tests | diff + test output + conformance results |
| E-07 | SPEC-local (engine) | DEC-007,DEC-055,DEC-058,DEC-039 | CORE-06,E-06 | NO — prerequisite decisions or tasks not satisfied | E14 passive-first engine and registry | No active class purchasable | 012 contract/adverse tests | diff + test output + conformance results |
| E-08 | SPEC-local (engine) | DEC-037,DEC-055 | E-07 | NO — prerequisite decisions or tasks not satisfied | E15 authenticated workflow | Consent, MFA modes per approved P-items | 012 tests | diff + test output + conformance results |
| E-09 | SPEC-local (engine) | DEC-009,DEC-061 | E-07,B-01 | NO — prerequisite decisions or tasks not satisfied | D20 checks and coverage materialization | coverageComplete marker set on partial work | 012 coverage tests | diff + test output + conformance results |

### G. Cross-spec integration (billing, coverage, readiness)

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| B-01 | cross-spec integration | DEC-009,DEC-061 | CORE-08 | NO — prerequisite decisions or tasks not satisfied | Coverage marker; readiness never PASS when coverageComplete:false | Readiness test matrix | readiness unit/adverse tests | diff + test output + numeric example reproduction |
| B-02 | cross-spec integration | DEC-032,DEC-038,DEC-062,DEC-035,DEC-036 | CORE-06 | NO — prerequisite decisions or tasks not satisfied | Implement the owner-approved OD-3 outcome; default AREA_COUNT unchanged until then | Numeric examples in target design §10 hold | refund property tests | diff + test output + numeric example reproduction |
| B-03 | cross-spec integration | DEC-070 | B-02 | NO — prerequisite decisions or tasks not satisfied | Idempotent settlement and outage tests (finalize vs refund crash window) | No double refund; lost refund detectable | crash tests | diff + test output + numeric example reproduction |

### H. Rollout and final verification

| Task | Kind | Prereq decisions | Prereq tasks | Start now? | Deliverable | Acceptance (from backlog) | Verification | Completion evidence |
|---|---|---|---|---|---|---|---|---|
| O-01 | rollout / final verification | DEC-048,DEC-051 | CORE-07 | NO — prerequisite decisions or tasks not satisfied | Alerts: stuck units, stranded stop rows, AUTHORIZED effects past margin, orphan leases | Alerts fire in drills | drill tests | drill report / runbook |
| O-02 | rollout / final verification | DEC-069 | CORE-10 | NO — prerequisite decisions or tasks not satisfied | Rollout/rollback runbooks and flags default-off | Rollback = flags off verified in staging | staging drill | drill report / runbook |
| O-03 | rollout / final verification | DEC-046 | E-05,E-06 | NO — prerequisite decisions or tasks not satisfied | Gate verification harness | Each gate has a runnable check | gate checks | drill report / runbook |
| O-04 | rollout / final verification | DEC-043,DEC-002 | E-05 | NO — prerequisite decisions or tasks not satisfied | External isolation review and penetration test of the Execution Plane (011 FR-041) | Report filed | — | drill report / runbook |
| O-05 | rollout / final verification | DEC-068 | CORE-06 | NO — prerequisite decisions or tasks not satisfied | Correlation ids and redaction for new events | No raw tokens or credentials in logs | redaction tests | drill report / runbook |

## Consistency notes

- Tasks listed: 53 of 53; each original ID appears exactly once; none duplicated.
- Prerequisite decisions are the backlog's own unless corrected above; no decision is treated as approved unless its register status is `EXISTING APPROVED DECISION` or `RESOLVED BY AUTHORITATIVE EXISTING CONTRACT`.
- For evidence tasks (EV-*) the decision IDs in the original backlog are the decisions the evidence **informs**, not prerequisites: EV-06 and EV-08 gather repository facts and do not rely on the outcome of DEC-057, DEC-052 or DEC-051, so they are startable now. Cross-check result: the only startable-now tasks (EV-06, EV-08, G-07, G-10) rely on no unresolved security, billing or lifecycle contract.
- Within each group tasks are dependency-ordered; across groups the order is D-(spec edits) interleaved with C/E by prerequisite, not by spec number.
