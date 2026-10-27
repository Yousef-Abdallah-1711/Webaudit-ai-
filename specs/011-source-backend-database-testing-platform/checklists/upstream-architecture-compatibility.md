# Upstream Architecture Compatibility Checklist: Source / Backend / Database / Automated Code Testing Platform

**Purpose**: Validate the quality of the requirements that make SPEC 011 a pure consumer of the frozen SPEC 006 (master
architecture, ADRs, Constitution), 007 (Target/Authorization/Scope), 008 (admission, checkpoint, kill, lease, audit), 009
(plan, runtime, evidence, artifact, finding, reverify, queues) and 010 (taxonomy and idempotency pattern) contracts, with
correct boundaries toward SPEC 012/013/014, a strict parallel run, and an honest statement of the upstream amendment position (U-1 resolved by the authorized 009 amendment, U-2 resolved by interpretation). This
checklist tests the written requirements, not any implementation.
**Created**: 2026-10-09
**Feature**: [spec.md](../spec.md) (FR-003, FR-004, FR-036, FR-050, FR-110, FR-114..116, FR-121..123, FR-132..140, SC-010) |
[plan.md](../plan.md) (`## SPEC 009 Integration`, `## F01 Integration`, `## F07 Integration`, `## Upstream Compatibility`) |
[data-model.md](../data-model.md) | [research.md](../research.md) R27

**Status (pass 3)**: 34/34 items satisfied by the current package; remaining unchecked items: 0.

**Note**: This checklist is a reviewer-owned requirements-quality review artifact. It was evaluated against the actual
files of the planning package and the upstream digests on 2026-10-09. It is PLANNING ONLY: nothing here executes,
builds or provisions anything.
**Marker Semantics**: `[x]` means the requirement-quality criterion is satisfied by the current spec package. `[ ]` means
a real gap, inconsistency or ambiguity remains; each such item carries a `**GAP**:` note naming where the package
falls short, so it can be repaired before closure. It does not mean implementation work is complete.

**Status (pass 2, re-evaluated against the repaired package)**: 31 of 34 items satisfied; 3 open (see `**GAP**:` notes).

## SPEC 006 (Master Boundaries, ADRs, Constitution)

- [x] CHK-UA001 Does the package state compatibility with each load-bearing 006 ADR (ADR-002 extend `AuditCapability`, no
  parallel v2 contract; ADR-003 new isolation system; ADR-004 ownership and authorization distinct; ADR-005 metering;
  ADR-006 strict parallel run; ADR-007 artifact retention parity and staged-upload gap; ADR-008/009 Principles and
  redaction/size budgets)?
  **RESOLVED**: plan.md `## Upstream Compatibility` "ADR conformance" paragraph (line 961) states conformance with
  ADR-002 (additive: enum values, evidence kinds, registries and engines only, touch list T1-T5), ADR-003, ADR-004,
  ADR-005, ADR-006, ADR-007 (retention parity, `originScanId`) and ADR-009 (redaction and size budgets); ADR-008
  (constitution Principles VIII-XIV) is covered by the per-principle Constitution Check table rather than cited by
  number.
- [x] CHK-UA002 Is each of Constitution Principles I-XIV evaluated with a stated mechanism (not an assertion), including the
  gated PASS of Principle XI and the re-check after design, and is `TODO(UNTRUSTED_EXECUTION_MECHANISM)` / 006 open decision
  #5 resolved at architecture level only?
  [Completeness, plan Constitution Check and Post-design re-check, Spec §FR-037, §FR-041]
- [x] CHK-UA003 Are the engine/domain boundaries preserved as 006 defines them: E12 read-only inspection that never decides
  Findings or executes code, E13 execution only, D26 and the other domains consuming evidence through registered checks and
  never executing, with Principle VIII applied "one layer down" and consolidation changing planning granularity only?
  [Consistency, Spec §FR-017, §FR-031, Consolidation note, plan Bounded Contexts A-G]
- [x] CHK-UA004 Are 006's execution classes used exactly as defined (`SOURCE_STATIC` = no grant, ownership only;
  `SOURCE_EXECUTION` = grant + F07), with no new `ExecutionUnitClass`, queue class or lifecycle state?
  [Consistency, Spec §FR-036, §FR-049, untrusted-execution-contract Non-negotiable rule 3]
- [x] CHK-UA005 Does the package demonstrate the 006 FR-024/025 additive test (new modules inert until flagged; existing
  capabilities, prices, thresholds, queues, report format untouched; enum additions additive-only with a forward-only
  `ADD VALUE` migration and a proof statement)?
  [Measurability, Spec §FR-115, §FR-116, data-model "Additive-only proof statement"]

## SPEC 007 (Target, Authorization, Scope)

- [x] CHK-UA006 Does 011 reuse 007's existing source Target modeling (`REPOSITORY` and `ARCHIVE` as ordinary Targets,
  REPOSITORY-shaped scope) with no new Target kind, no Scope dimension and no DB/API Target, because fixtures are Guest-local
  and are not Targets?
  [Consistency, Spec Clarification (new Target kind), plan F01 Integration, research.md R27 G5]
- [x] CHK-UA007 Is the F01 `RepositoryDestination {repositoryFullName, ref, path}` fully defined for every input 011
  accepts?
  **RESOLVED**: FR-004 and source-acquisition-contract Outputs 3: absent ref = resolved default-branch name; ZIP =
  ARCHIVE Target with REPOSITORY scope shape, `repositoryFullName` equal to the Target canonical value, empty-string
  ref (admitted only by empty `includedRefs`), path = workspace path; FR-151 grammar. [Completeness, Spec FR-002,
  FR-004, FR-122]
- [x] CHK-UA008 Are `isAuthorized` (plan resolution and, via F07, dispatch/checkpoint) and `isInScope` (requested ref, SHA
  pins, workspace path prefixes) consumed with 007's exact-match ref semantics, FR-015a (PRODUCTION permitted for this class,
  `environmentRestriction` non-empty), the TOCTOU rule (decision on requested ref recorded with the resolved SHA), and no
  `isAuthorized` call outside admission/checkpoint for safety-sensitive action?
  [Consistency, Spec §FR-004, §FR-122, §FR-123, source-acquisition-contract boundary rule 2]
- [x] CHK-UA009 Is the plan-time `isAuthorized` (snapshot grant ids only, never a verdict) explicitly not a substitute for
  the dispatch-time checkpoint, and is a SHA-only `includedRefs` grant specified to refuse a branch-name request unless the
  user pins the SHA, without any 007 change?
  [Clarity, plan F01 Integration, Spec Clarifications (ref semantics), 009 FR-022a]

## SPEC 008 (Admission, Checkpoint, Kill, Lease, Audit)

- [x] CHK-UA010 Does 011 consume `requestAdmission`/`safetyCheckpoint`/`triggerStop`/`recordExecutionAuditEvent` with no
  private budget, kill-switch, lease or audit mechanism, and is the EP dead-man switch a liveness backstop (destroying a
  Guest) rather than a second authority over admission or stop decisions?
  [Consistency, Spec §FR-050, §FR-110, §FR-123, plan F07 Integration, research.md R8]
- [x] CHK-UA011 Is the per-engine unit-consumption policy declared as 008 FR-019 requires (one request unit and one
  concurrency lease per run, not per step, held for the Guest's lifetime, idempotency key `H(executionUnitId, attempt)`)?
  [Completeness, Spec §FR-050, plan F07 Integration table row 1, untrusted-execution-contract Invariant 3]
- [x] CHK-UA012 Are the audit event types 011 writes (`SAFETY_VIOLATION`, `EXECUTION_COMPLETED`, `ESCALATED`) members of
  008's 12-value `ExecutionAuditEventType`, written only through `recordExecutionAuditEvent`, with F07's own events
  (`ADMISSION_*`, `BUDGET_*`, `STOP_*`, `STOPPED`) left to F07?
  [Consistency, plan F07 Integration "Audit events used", 008 audit enum]
  **RESOLVED (pass 3)**: The F07 event types 011 writes (`SAFETY_VIOLATION`, `EXECUTION_COMPLETED`, `ESCALATED`) are members of 008's enum; the disclosure event moved to `AuditLogEntry`, so no new F07 type exists.
- [x] CHK-UA013 Are lease fencing and checkpoint semantics preserved (supervisor, not the Guest, calls the checkpoint at
  dispatch and at least every 5 s; stale `holderToken` treated exactly as a stop; uncertainty is stop; escalation after 5 s
  without ACK is destroy; stop latency never looser than 5 s)?
  [Consistency, Spec §FR-050, §FR-051, §FR-123, plan F07 Integration]
- [x] CHK-UA014 Is the F07 gap that SCAN-scope kill does not cover REVERIFY plans (no `scanId`) handled by requirement
  (`configuration.originScanId` required on every REVERIFY `SOURCE_EXECUTION` unit and subscribed as a scan channel) without
  changing F07?
  [Completeness, Spec §FR-140, source-reverify-contract Invariant 5/boundary rule 4, research.md G7]
- [x] CHK-UA015 Is the mid-run effect of attestation revocation expressed through an existing F07 mechanism?
  **RESOLVED**: FR-143, isolation-policy-contract Safety/attestation lifecycle and untrusted-execution-contract
  invariant 2: revocation is handled without any new F07 trigger or PLATFORM-scope stop: new admission is refused, each Supervisor re-reads attestation status on its <= 5 s loop and destroys its own Guest (unit `FAILED`/`SAFETY_REFUSED`, audited in `AuditLogEntry`), and operators may use the existing per-execution `OPERATOR_EMERGENCY_STOP`.

## SPEC 009 (Plan, Runtime, Evidence, Artifact, Finding, Reverify, Queues)

- [x] CHK-UA016 Does 011 add no `ExecutionUnitClass`, no second scheduler or queue beyond the reserved
  `webaudit-exec-source-execution`, no private evidence/artifact store and no private runtime lifecycle, with Source Checks
  explicitly not units and the dispatcher running parent-worker side (as 010 did)?
  [Consistency, Spec §FR-036, §FR-049, §FR-110, §FR-111, plan Diagram 1]
- [x] CHK-UA017 Is the EvidenceKind extension additive and exactly enumerated (ten values), with the three reused kinds named
  and per-kind justification in the entity decision table?
  [Completeness, Spec §FR-114, data-model Entity Decision Table and additive enum section]
- [x] CHK-UA018 Is the mapping of 011 work onto 009 ExecutionUnits internally consistent (engineIds, configuration shapes,
  plan-time versus run-time binding)?
  **RESOLVED (pass 3)**: The 009 mapping is consistent: configuration carries `requestedStepKinds`, the concrete `commandPlan` is bound at phase 2 and recorded as `EXECUTION_STEP_RESULT` `stepKind: "PLAN"` (data-model, plan, untrusted-execution and reverify contracts agree); engineIds follow plan.md.
- [x] CHK-UA019 Does the FailureClass mapping use only 009's existing values and make the 009 `CUSTOMER_CODE_FAILURE`
  ambiguity explicit and locally resolved (customer outcomes `COMPLETED`; `FAILED` + `CUSTOMER_CODE_FAILURE` only for
  containment aborts, with an F07 `SAFETY_VIOLATION` event), with a stated amendment trigger if 009 later defines it
  differently?
  [Clarity, Spec §FR-056, plan SPEC 009 Integration failure table, research.md R16, G2]
- [x] CHK-UA020 Is the REVERIFY plan contract fully consumable (one-class minimal plan, no `scanId`, fresh snapshot, fresh
  F01, minimal steps, Issue states mapped to 009/006's existing `IssueState`)?
  **RESOLVED**: FR-148 and data-model tenant table last row: REVERIFY Artifacts use `scanId = originScanId` (009
  `createArtifact` is caller-supplied), retention follows the origin scan, tenant joins via ScanPlan/`originScanId`;
  plan G7/FR-140 for the kill scope; source-reverify-contract uses 009/006 IssueStates only; fixture 62.
- [x] CHK-UA021 Does retention reach parity with 009 (Artifacts and Evidence removed in the same per-scan transaction as
  report data, `report-retention-parity`, orphan sweep reuse) with the staged-upload gap addressed by an added deletion call
  site rather than inherited?
  [Consistency, Spec §FR-012, §FR-119, §FR-130, plan "Sweeps", 009 artifact retention]
- [x] CHK-UA022 Are zero new Prisma models and zero `@relation` edges into frozen models required (scalar ids only, 009 FR-040
  pattern), with the single migration limited to `ALTER TYPE ... ADD VALUE` and ordered after the 009 and 010 migrations?
  [Measurability, Spec §FR-116, §FR-138, SC-005, data-model "Migration ordering dependency"]
- [x] CHK-UA023 Are queue names and placement exact (`SOURCE_STATIC` on `webaudit-scan-phase` unchanged; `SOURCE_EXECUTION`
  on the reserved `webaudit-exec-source-execution`, `attempts: 1`, id-only payload; existing `webaudit-reverify` runner
  untouched and unused for 011 findings)?
  [Consistency, Spec §FR-017, §FR-036, plan Queues, source-reverify-contract boundary rule 7]
- [x] CHK-UA024 Do the evidence-idempotency requirements match 009's actual write path?
  **RESOLVED**: source-evidence-contract Idempotency, static-analysis-contract invariant 1 (line 72), backend contract
  invariant 13 and data-model: 009 `recordEvidence` has no dedupe, so every 011 evidence writer first claims
  `IdempotentClaim` scope `evidence-write` keyed `{scanPlanId}:{executionUnitId}:{attempt}:{kind}:{naturalKey}`; no
  009 capability is requested; fixture 51.
- [x] CHK-UA025 Is 011's own redaction obligation for `SOURCE_STATIC` evidence stated as an addition to 009's rule (009
  forces redaction only for `ACTIVE_SECURITY`, `AUTHENTICATED_WORKFLOW`, `SOURCE_EXECUTION`), mirroring SPEC 010's precedent?
  [Clarity, Spec §FR-117, plan "Post-design re-check" (c)]

## SPEC 010 (Frozen; Consumed by Pattern)

- [x] CHK-UA026 Is SPEC 010 stated to stay frozen and unchanged, with `CHECK_RESULT` neither reused nor widened, no
  `WebCheckDefinition` coupling (a sibling `SourceCheckDefinition` instead, justified in Complexity Tracking) and no import of
  010 code in any 011 contract?
  [Consistency, Spec §FR-114, §FR-132, coverage-contract boundary rule 7, plan Complexity Tracking row 5]
- [x] CHK-UA027 Is `IdempotentClaim` reused only by new scope strings with 010's claim/release semantics respected and all
  claim keys consistent?
  **RESOLVED**: data-model IdempotentClaim table (line 399-410) is the single authority for four new scope strings
  (`source-check-execution`, `source-acquire`, `ep-run-start`, `evidence-write`), each key beginning with
  `scanPlanId`, with 010 claim/release semantics (unique `(scope, claimKey)`, `resultRef`, not-ready releases claim);
  acquisition, automated-test and untrusted-execution contracts conform; plan defers keys to data-model.
- [x] CHK-UA028 Does 011 avoid any `PageIdentity` redesign or mapping (separate identifier families `SourceIdentity`,
  `RouteIdentity`, `BuildArtifactIdentity`, `DeploymentCommitId`; no `PageIdentity`/`RouteIdentity` mapping defined; the
  mapping left to SPEC 014; grammar versioned and changeable only by amendment request)?
  [Consistency, Spec §FR-131, source-correlation-contract Consumers 3/boundary rules 1 and 5]

## SPEC 012 / 013 / 014 Boundaries and Strict Parallel Run

- [x] CHK-UA029 Are the boundaries to 012 (live/deployed API security, auth attack testing, secrets and credential
  workflows, private registries/other git hosts), 013 (load, capacity, production profiling, APM) and 014 (readiness,
  cross-domain correlation) stated as ownership plus hand-off artifacts, with live-target requests refused and no readiness
  verdict or score computed here, and downstream specs bound to consume 011's contracts rather than invent private paths?
  [Completeness, Spec §FR-095, §FR-108, §FR-127, §FR-131, §FR-132, plan "SPEC 010/012/013/014 Boundaries", Diagram 15]
- [x] CHK-UA030 Is the strict parallel run specified with three independent default-off controls
  (`FAHES_SOURCE_TESTING`; `FAHES_SOURCE_EXECUTION` additionally requiring a healthy EP and an IAB attestation record;
  per-tenant allowlist), no cutover and no cutover mechanism, no pricing change (new modules not purchasable until F06), and a
  behavior matrix in which every flag combination leaves current scans, pricing, UX, queues and reports unchanged?
  [Measurability, Spec §FR-115, §FR-133, plan "Activation and Strict Parallel Run", quickstart flag matrix]
- [x] CHK-UA031 Do the migration-map decisions stay within "existing production path untouched until cutover" (006 FR-024,
  009 FR-040, ADR-006)?
  **RESOLVED**: plan Migration Map "Meaning of EXTEND" (line 409): EXTEND = new sibling code path, existing file
  behavior unchanged; `repo-clone.ts`, `retention.ts` and `apps/worker/src/workspace` are NOT modified; the complete
  touch list T1-T5 is additive only and covered by an additive-compatibility regression test (FR-133, quickstart
  fixture 54).

## Upstream Gaps G1-G9 and the "No Amendment" Statement

- [x] CHK-UA032 Are gaps G1 (no descendant kill), G2 (`CUSTOMER_CODE_FAILURE` ambiguity), G3 (no unit heartbeat or stuck-RUNNING
  sweeper), G5 (no DB/API Target), G6 (no feature flags), G7 (REVERIFY kill scope), G8 (spec-only upstream entities) and G9
  (sandbox-runner doc claim) each handled locally by consuming existing contracts, with a stated future amendment trigger
  and no contradiction of an upstream rule?
  [Completeness, plan "Upstream Compatibility", research.md R27, Spec §FR-051, §FR-056, §FR-133, §FR-138, §FR-140]
- [x] CHK-UA033 Is gap G4 (009's 15-minute scan-wide timeout sweep versus a 25-minute `SOURCE_EXECUTION` run) resolved or
  bounded by a requirement rather than parked?
  **RESOLVED**: FR-139 makes the G4 investigation a MUST with a deadline (explicit upstream amendment request before
  implementation of the first dispatch point if passive timeout behavior must change), plan G4/research UI-5 ("before
  first dispatch point") and task T152 carry it, E13 is stated not to depend on the sweep, and
  `FAHES_SOURCE_EXECUTION` stays default-off meanwhile, so no execution unit is dispatched before closure. SC-010 now
  names it as the one conditional implementation-start trigger.
- [x] CHK-UA034 Does SC-010 state the upstream amendment position truthfully (U-1 resolved by the authorized 009 amendment, U-2 resolved by interpretation, everything else local)? [Consistency, Spec §SC-010; upstream-amendment-requests.md]
  **RESOLVED (pass 4, 2026-10-10)**: SC-010 states that U-1 was resolved by the owner-authorized controlled amendment to SPEC 009 (FR-047, `scan-deadline-contract.md`) and U-2 by interpretation of 009 FR-033; the record is in `upstream-amendment-requests.md`; every other gap is resolved locally; no amendment to 006/007/008/010.

## Notes

- Items marked `[ ]` are repair targets for the planning package before the closure/freeze pass; they are not
  implementation tasks.
- Upstream facts were checked against the SPEC 006-010 digests prepared for this planning pass, not by re-reading the frozen
  spec packages.
