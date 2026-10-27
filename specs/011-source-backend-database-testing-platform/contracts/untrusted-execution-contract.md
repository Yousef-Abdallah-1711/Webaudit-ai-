# Contract: Untrusted Execution (SOURCE_EXECUTION unit adapter, Engine E13)

Per FR-035 through FR-061 (core FR-048..058) and FR-143, FR-144, FR-146, FR-147, FR-152, FR-155, FR-156, FR-157,
FR-158. How a `SOURCE_EXECUTION`
`ExecutionUnit` runs customer code in one per-run microVM Guest on the Execution Plane (EP) and what the trusted
Execution Supervisor must do around it.
Consumers: Command Policy, Dependency Installation, Build/Type-check, Execution Fixture contracts; the Source Check
dispatcher; SPEC 012/013/014 (via the Provider Port only, never a private runner). Not a 009 amendment: generic unit
lifecycle, queues, `finalizeExecutionUnit`, `recordEvidence`, `createArtifact` stay 009's; F07 calls stay 008's.
This file is the authority for the 13-phase lifecycle table and the EP run states; `plan.md` reproduces its timeouts and
failure classes verbatim and `data-model.md` conforms to its run states.

## Signature (shape, not final TypeScript)

```text
interface ExecutionPlaneProvider {
  provision(spec: RunSpec): RunHandle          // create-or-get; runId = H(executionUnitId, attempt)
  start(runId): void                           // idempotent
  streamEvents(runId, fromSeq): AsyncIterable<GuestEvent>   // byte-capped, sequence-numbered, untrusted
  heartbeat(runId, supervisorLeaseToken): void // resets EP dead-man timer (supervisor sends one every 5 s; dead-man = 15 s)
  destroy(runId): DestroyAck                   // idempotent; DESTROYED only after scratch wipe + device/tap teardown
  getRun(runId): RunRecord | NOT_FOUND         // state: PROVISIONING|READY|RUNNING|DESTROYING|DESTROYED|QUARANTINED
  listRuns(olderThan): RunRecord[]             // orphan reconciler input
}
RunSpec = { imageId, imageDigest, snapshotUrl (single-object, 10-minute, read-only, consumed by the EP), snapshotDigest,
  limits{vcpu,memMiB,scratchMiB,pids,iops,netBytes,stepWall,runWall,outputBytes}, networkPolicy: NONE|LOCKFILE_PROXY(+allowlistRef),
  commandPlan: Step[] (template ids + validated params), syntheticEnv, hardDeadlineAt (ABSOLUTE instant = dispatch time + timeoutPolicyMs + hardStopMarginMs), tenantId }
```

`runId` is deterministic; `provision` for an existing `runId` returns the existing record, never a second Guest.
`commandPlan` in `RunSpec` is the plan bound at phase 2 (the unit's `configuration.requestedStepKinds` are the request;
the EP receives only the validated, bound steps). The EP refuses (does not queue) `provision` for a tenant that already
has a non-`DESTROYED` run: the refusal is the EP API error `TENANT_CONCURRENCY` (an API error, not an evidence reason
code); the Supervisor treats it as `TRANSIENT_INFRASTRUCTURE`. F07 admission and EP concurrency are independent controls
(FR-158).

EP run states (`RunRecord.state`), the only states the EP exposes:

| State | Meaning | Allowed next |
|-------|---------|--------------|
| `PROVISIONING` | host and image digest verified; Guest booting; snapshot being injected; policy being applied | `READY`, `DESTROYING` |
| `READY` | Guest booted, snapshot copied read-only then to size-capped scratch, resource and network policy applied and verified; no customer Step started | `RUNNING`, `DESTROYING` |
| `RUNNING` | at least one customer Step started | `DESTROYING` |
| `DESTROYING` | `destroy(runId)` accepted (stop, TTL, dead-man, failure or normal end); teardown in progress | `DESTROYED`, `QUARANTINED` |
| `DESTROYED` | scratch wiped and device/tap/cgroup teardown confirmed; terminal | none |
| `QUARANTINED` | destroy or wipe unconfirmed, or containment abort pending review; host takes no new tenant work | `DESTROYED` (reconciler or operator confirms teardown) |

F07 `STOPPED` is recorded only when the run is `DESTROYED`.

## Inputs

An admitted unit: `configuration.requestedStepKinds` (the concrete `commandPlan` is bound from the verified manifest at
phase 2 and recorded as `EXECUTION_STEP_RESULT` `stepKind: "PLAN"`), snapshot artifact id + `contentDigest` (digest
re-verified; the Artifact key is 009's `artifacts/<scanId>/<executionUnitId>/<contentDigest>`, with `scanId = originScanId`
for REVERIFY, FR-148), selected Execution Image (FR-047), grant/destination (REPOSITORY), `originScanId` for REVERIFY
(FR-140), lease `holderToken`.

## Outputs

Typed Evidence only (`EXECUTION_STEP_RESULT`, `TOOL_DIAGNOSTIC`, `TEST_RESULT`, `COVERAGE_REPORT`, `MIGRATION_RESULT`,
`CONTRACT_RESULT`, `SCHEMA_SNAPSHOT`) via `recordEvidence`; log Artifacts via `createArtifact`; a terminal unit status.
Usage fields for metering (FR-125): Guest seconds, CPU seconds, peak memory, scratch bytes, network bytes, step counts.

## Ownership

The Supervisor (worker side, `apps/worker/src/source-testing/`) owns: F07 admission/checkpoint, lease token, validation
and redaction of Guest output (redaction itself runs in a credential-less worker, invariant 15), evidence commit,
finalization. The EP owns: Guest lifecycle, resource enforcement, network policy, dead-man timer, teardown proof. The
Guest owns nothing: its output is untrusted data. The Supervisor child holding the mTLS client credential parses NO raw
Guest log bytes (FR-156); the EP and Guest hold no Fahes application secrets (FR-039).

Per-run credentials (FR-146): the only credentials that exist for a run are (a) a one-time, single-object, read-only
presigned snapshot URL with a 10-minute TTL, consumed by the EP and never given to the Guest (expiry is the bound; object
stores offer no revocation primitive), and (b) a run-scoped bearer credential for the Supervisor-to-EP API, issued per
`runId`, valid only for `heartbeat`, `streamEvents`, `getRun` and `destroy` of that `runId`, and dead once the run is
`DESTROYED`. The Guest receives neither. Neither is ever logged or stored in Evidence.

Operator access (FR-144): operators may issue the per-execution `OPERATOR_EMERGENCY_STOP` (F07, EXECUTION scope;
invariant 2) and read run metadata and diagnostics
(state, timings, resource counters, teardown audit). Operators cannot read snapshots, logs or Evidence payloads in v1
(no break-glass; any future break-glass needs its own spec and audit).

## Invariants

1. One unit = one run = one Guest = one ordered `commandPlan` (bound at phase 2 from `requestedStepKinds`); no second scheduler or private queue (FR-049).
2. F07 call shape (FR-050). Dispatch calls `safetyCheckpoint` with `consumes {request:true, concurrency:true}` exactly
   once. While the Guest lives, the Supervisor runs one loop every <= 5 s that (a) calls the checkpoint/stop-pending
   sub-check with `consumes {request:false, concurrency:false}`, (b) renews the lease separately (lease TTL 30 s,
   renewal every 5 s), (c) sends the EP `heartbeat`, and (d) re-reads the isolation attestation status, and (e) reads the SPEC 009 deadline expiry (`scan terminal OR now >= effectiveDeadlineAt`, one indexed read, `scan-deadline-contract.md`) — on expiry the Supervisor destroys its Guest and finalizes `FAILED`/`TIMEOUT` (detail `SCAN_DEADLINE`) or, per the 009 status-by-cause matrix, `CANCELLED` when the scan was cancelled and `FAILED`/`TRANSIENT_INFRASTRUCTURE` when the scan failed. This is liveness enforcement, not an F07 trigger. Dispatch of a
   unit that is already `RUNNING` or terminal is a no-op returning the prior state (no second checkpoint consumption,
   no second Guest). The Guest never calls F07.
   Attestation revocation (FR-143): a `REVOKED` or `SUSPENDED` attestation (a) refuses new SOURCE_EXECUTION admission
   with `EXECUTION_PLANE_UNAVAILABLE`; (b) is observed by the Supervisor on its 5 s loop, which destroys its own Guest
   and finalizes the unit `FAILED` with FailureClass `SAFETY_REFUSED` (reason `EXECUTION_PLANE_UNAVAILABLE`), audited
   in `AuditLogEntry`; (c) operators MAY additionally issue a per-execution `OPERATOR_EMERGENCY_STOP` (F07, EXECUTION
   scope). No new F07 trigger is claimed and no PLATFORM-scope stop exists. Re-attestation is required after any image,
   VMM or kernel change.
3. Consumption policy: 1 request unit + 1 concurrency lease per run (not per step), held for the Guest lifetime.
4. Stale `holderToken`, `STOP`, or checkpoint uncertainty (F07 FR-021) means immediate `destroy(runId)`; never log-and-continue.
5. Termination primitive is `destroy` of the whole Guest; single-process kill is never relied upon (FR-051).
6. `STOPPED` is recorded only after the EP returns `DESTROYED` (scratch wiped). Unconfirmed teardown leaves the run
   `QUARANTINED` and non-STOPPED, quarantines the host, alerts the operator (FR-051, FR-057).
7. EP dead-man switch: no `heartbeat` for 15 s (three missed 5 s beats; deliberately shorter than the 30 s F07 lease so a stalled Supervisor cannot lose its lease while its Guest is still alive) destroys the Guest; hard TTL = an ABSOLUTE instant computed at dispatch (dispatch time + `timeoutPolicyMs` + 5 min margin, never restarted at run creation) (FR-052). `timeoutPolicyMs` for a SOURCE_EXECUTION unit is 33 min 50 s = the sum of the 13 lifecycle phase maxima (30 + 30 + 10 + 120 + 30 + 1 500 + 60 + 120 + 30 + 60 + 30 + 10 s = 2 030 s: the 25 min run envelope from `READY` plus every setup, validation, persistence, teardown and finalization phase; provisioning retries must fit inside the 120 s phase budget) (FR-158), so 009's unconditional parent-armed SIGKILL (`timeoutPolicyMs` + fixed margin, never extended by the child) can never cut a run that legitimately uses its whole envelope while it is still persisting or tearing down; the run-envelope clock starts when the Guest reaches `READY`.
   Stop latency (FR-123, "no looser than 5 s") is measured at `destroy(runId)` issuance, not at completion; completion
   is confirmed separately by `DESTROYED`. If the Supervisor is dead or silent, the parent orchestrator escalates by
   issuing `destroy(runId)` directly (independent of the Supervisor) and records an `ESCALATED` audit event; the
   dead-man switch and hard TTL are the last resort.
8. Evidence writes go through the 011 evidence wrapper: it FIRST validates (fence) the lease token, that the unit and owning scan are non-terminal and that the plan deadline has not passed inside ONE database transaction holding a row lock on the unit, THEN claims `evidence-write`, THEN writes (009 `recordEvidence` has no lease or terminal-state check, so the fence is this wrapper's, FR-055); Guest payloads are size-capped, schema-validated, then redacted (invariant 15) before `recordEvidence` (FR-039, FR-117). 009 `recordEvidence` has no dedupe, so every writer
   first claims `IdempotentClaim` scope `evidence-write`, key `{scanPlanId}:{executionUnitId}:{attempt}:{kind}:{naturalKey}`;
   a lost claim means the Evidence already exists and the write is skipped. Finding text derived from Evidence passes
   `@webaudit/redaction` before `materializeFinding` (FR-150).
9. Run envelope (binding): the per-run wall clock (default 25 min, <= the grant `durationBudget`) bounds the whole run.
   Per-step walls (install 10, build 10, type-check 5, lint 5, test 10 min) are maxima clamped to the REMAINING run wall;
   their sum may exceed the run wall. A step wall expiry yields a `TIMED_OUT` step result and does not fail the unit
   (FR-087). Steps not started when the envelope is exhausted are not executed; their checks are `INCONCLUSIVE` with
   reason `RUN_BUDGET_EXHAUSTED` and the unit still ends `COMPLETED`. Reruns (<= 2) consume the same envelope.
10. Customer-step retry across attempts is disabled; `attempts: 1`. Provisioning-only failure (no customer Step started)
    may retry provisioning inside the same attempt, at most 2 times (FR-054).
11. Execution Plane run creation is idempotent via `IdempotentClaim` scope `ep-run-start` plus deterministic `runId` (FR-135).
12. Disclosure (FR-147): before phase 4 mints a presigned URL the Supervisor records the audit event
    `source.sent_to_execution_plane` (an `AuditLogEntry` action; F07's closed `ExecutionAuditEventType` is not extended) (tenant, target, snapshot digest, EP run id; no content). No audit event, no Guest.
13. Monorepos (FR-152): one `SOURCE_EXECUTION` unit per entry of the scan configuration's `executionWorkspaces` list (default `["."]`), at most 4 (provisional, config), FIXED AT PLAN RESOLUTION before detection runs; detection only validates it (`WORKSPACE_NOT_FOUND` for a missing path; a detected unselected Tier-1 workspace is `NOT_TESTED` with `WORKSPACE_CAP_EXCEEDED`). Units are
    independent (own Guest, lease, envelope and budget) and are CHAINED by plan-level `ExecutionDependency` edges with no data dependency, so at most one runs at a time per scan; nothing relies on a refused lease being redelivered (009 treats a concurrency refusal as terminal). A platform-failed predecessor leaves successors `BLOCKED` (009 fan-in rule); customer-code outcomes end `COMPLETED` and never block.
14. Containment abort threshold: 3 contained resource-cap kill events (OOM, disk, pids, output) within one run abort it
    (provisional). Relationship of the two codes: `SANDBOX_POLICY_VIOLATION` is the FLAG recording the detected signal
    in Evidence (tamper, seccomp-kill-class, output-flood hard cap, or the third resource kill); `CONTAINMENT_ABORT` is
    the BLOCKED outcome reason of the abort. The abort sets unit `FAILED` + `CUSTOMER_CODE_FAILURE` and F07
    `SAFETY_VIOLATION`. Fewer than 3 contained kills stay measured (`RESOURCE_LIMIT_EXCEEDED`, unit `COMPLETED`).
15. Redaction and credential concentration (FR-156). The Supervisor child holds the EP mTLS credential and therefore parses NO raw Guest log bytes. Raw Guest output is passed to a credential-less forked redaction worker (scrubbed environment, no network, memory cap, parent-armed kill deadline 60 s) in bounded windows (<= 64 KiB chunks, total <= the 10 MiB per-step cap); the worker also performs the exact-value scrub of secret values detected in the snapshot (held in memory only). If the deadline is exceeded the raw bytes are DISCARDED, never persisted unredacted, and the step evidence records `INCONCLUSIVE` with `RUNNER_OUTPUT_UNPARSEABLE`. The existing detector's quadratic behavior on hostile input is fixed additively before activation (task in `tasks.md`).
16. Result integrity (FR-155). The Guest agent runs as a different user from every customer process; customer processes run in separate PID/mount/user namespaces with NO access to the host channel (vsock) device; the host accepts exactly ONE authenticated agent connection per run (per-run key unreachable by the customer user) and rejects any second connection or unauthenticated frame; runners are launched by the agent and their structured output is captured by the agent. Because a customer process can still print a well-formed forged report, every pass/fail derived from reporter output is labelled **runner-reported** in Evidence, check reasons and the coverage statement and is never described as independently verified. Fixtures: `vsock-forge`, `reporter-forge`.
17. Pids and starvation (FR-157). The process-count limit is a Guest cgroup limit (the VMM sees host threads, not guest pids; it bounds memory, vCPU, IOPS and bandwidth); the agent runs in a reserved cgroup so a fork bomb is recorded as `RESOURCE_LIMIT_EXCEEDED` and is not misread as agent tampering.

## Lifecycle (13 phases, FR-048); times are provisional tuning defaults, hard-enforced

The "FailureClass" column holds ONLY 009 `FailureClass` names (`none` = measured outcome or no failure). Reason codes
are in their own column.

| # | Phase | Timeout | FailureClass | Reason code | Retry | Cancel/stop | F07 checkpoint / audit | Recovery |
|---|-------|---------|--------------|-------------|-------|-------------|------------------------|----------|
| 1 | Resolve authorized immutable snapshot | 30 s | refused -> `SAFETY_REFUSED`; digest mismatch -> `ENGINE_DEFECT` | `SNAPSHOT_DIGEST_MISMATCH` on mismatch | none | REFUSED/KILLED, no Guest | dispatch `safetyCheckpoint`; `ADMISSION_GRANTED/REFUSED` | re-read unit; no-resurrection check |
| 2 | Detect toolchain, bind `commandPlan` | 30 s | `INVALID_CONFIGURATION` | `UNSUPPORTED_VERSION` | none | stop before provision | checkpoint | recompute (pure) |
| 3 | Select signed image | 10 s | `SAFETY_REFUSED` | `EXECUTION_PLANE_UNAVAILABLE` / `IMAGE_NOT_TRUSTED` | none | stop | checkpoint | none needed |
| 4 | Provision Guest, inject snapshot | 120 s | `TRANSIENT_INFRASTRUCTURE` | none | re-provision same attempt (no customer step yet, <= 2) | `destroy` | `source.sent_to_execution_plane` (an `AuditLogEntry` action; F07's closed `ExecutionAuditEventType` is not extended), `BUDGET_RESERVED`; checkpoint each 5 s | `getRun(runId)`; destroy partial |
| 5 | Apply resource + network policy | 30 s | `ENGINE_DEFECT` (policy unverifiable) | none | none | `destroy` | checkpoint | destroy on doubt |
| 6 | Execute Steps | run envelope <= 25 min from `READY` (fixed; may only be capped lower); per-step maxima clamped to remaining envelope | measured outcomes: none; containment abort -> `CUSTOMER_CODE_FAILURE` | `TIMED_OUT` (step), `RUN_BUDGET_EXHAUSTED`, `RESOURCE_LIMIT_EXCEEDED`, `CONTAINMENT_ABORT` | none across attempts | `destroy`, no more steps | checkpoint <= 5 s; `SAFETY_VIOLATION` on abort | Guest alive after crash -> destroy |
| 7 | Capture stdout/stderr + results | with phase 6 | none (output flood: truncate head+tail, `TRUNCATED`; hard cap -> abort via invariant 14) | `SANDBOX_POLICY_VIOLATION` on hard cap | none | stop reading | checkpoint | n/a (ephemeral) |
| 8 | Validate + redact (credential-less redaction worker, invariant 15) | 60 s | invalid payload: none (check `BLOCKED`); redactor fault -> `ENGINE_DEFECT` | none | none | skip, persist nothing new | checkpoint | rerun idempotently |
| 9 | Persist via 009 | 120 s | `TRANSIENT_INFRASTRUCTURE` | none | idempotent via `evidence-write` claim / `createArtifact` | persist already-validated only | lease token required | orphan sweep (009) |
| 10 | Terminate Guest | 30 s | unconfirmed -> `TRANSIENT_INFRASTRUCTURE` (run `QUARANTINED`) | `EP_TEARDOWN_UNCONFIRMED` | `destroy` repeated | same | `STOP_ACKNOWLEDGED` | reconciler `listRuns` |
| 11 | Wipe + confirm cleanup | 60 s | `TRANSIENT_INFRASTRUCTURE` (alert) | `EP_TEARDOWN_UNCONFIRMED` | repeat | same | none | host stays quarantined |
| 12 | Release lease, `finalizeExecutionUnit` | 30 s | `TRANSIENT_INFRASTRUCTURE` | none | idempotent (key = unit key) | same | `BUDGET_RELEASED`, `EXECUTION_COMPLETED` | redelivery returns prior outcome |
| 13 | Record final F07 stop/audit | 10 s | none (alert only) | none | idempotent | `recordStopped` | `STOPPED` | sweep backfills |

## Failure behavior

| Condition | Reason code | FailureClass | Verdict / unit status |
|-----------|-------------|--------------|-----------------------|
| EP unprovisioned/unhealthy, no `VALID` attestation, attestation revoked, `DisabledProvider` | `EXECUTION_PLANE_UNAVAILABLE` | `SAFETY_REFUSED` | dependent checks `BLOCKED`; no fallback (FR-058) |
| Step wall limit | `TIMED_OUT` (step result) | none (measured) | unit `COMPLETED`; step `TIMED_OUT`; check `INCONCLUSIVE` (a single test exceeding its limit is just a failed test case) |
| Run envelope exhausted | `RUN_BUDGET_EXHAUSTED` | none (measured) | unit `COMPLETED`; unstarted steps' checks `INCONCLUSIVE` |
| More than 4 Tier-1 workspace partitions | `WORKSPACE_CAP_EXCEEDED` | none | extras not executed, `NOT_TESTED` |
| Contained OOM/disk/pid cap (fewer than 3 events) | `RESOURCE_LIMIT_EXCEEDED` | none (measured) | unit `COMPLETED`; `INCONCLUSIVE` |
| Tamper, seccomp-kill-class, output-flood hard cap, 3rd contained resource kill | `CONTAINMENT_ABORT` (signal recorded as flag `SANDBOX_POLICY_VIOLATION`) | `CUSTOMER_CODE_FAILURE` | unit `FAILED`; checks `BLOCKED`; F07 `SAFETY_VIOLATION` |
| Outer unit deadline (009), no completion | `TIMED_OUT` (run result) | `TIMEOUT` | unit `FAILED`; checks `INCONCLUSIVE` |
| Provider/host lost, surviving Guest after supervisor loss | none (infrastructure) | `TRANSIENT_INFRASTRUCTURE` | destroy; no auto-retry once a customer Step started |
| User cancel / operator, grant revocation, reclassification | none | `CANCELLED` / `KILLED` | F07 reason from `KillSwitchState` (EXECUTION/SCAN/GRANT/TARGET scopes only; no PLATFORM-scope stop is used by 011) |
| Attestation revoked mid-run | `EXECUTION_PLANE_UNAVAILABLE` | `SAFETY_REFUSED` | Supervisor destroys its own Guest and finalizes `FAILED`; audited in `AuditLogEntry` |
| Untrusted image, digest/signature mismatch | `IMAGE_NOT_TRUSTED` | `SAFETY_REFUSED` | `BLOCKED` |
| Snapshot digest mismatch | `SNAPSHOT_DIGEST_MISMATCH` | `ENGINE_DEFECT` | `BLOCKED` |
| Teardown unconfirmed | `EP_TEARDOWN_UNCONFIRMED` | `TRANSIENT_INFRASTRUCTURE` | run `QUARANTINED`, non-STOPPED, host quarantined |

Status semantics (D16, FR-056): failing build/tests/type errors are measured results, unit `COMPLETED`; never `FAILED`.

## Safety

Class `SOURCE_EXECUTION`: grant listing the class, scope REPOSITORY, F07 gated, queue `webaudit-exec-source-execution`.
Implementations: `MicroVmProvider` (production, only after IAB, see isolation-policy-contract), `FakeExecutionPlane`
(deterministic contract double for all developer machines), `DisabledProvider` (default; refuses everything).
`LocalProcessProvider` MUST NOT exist in any build (FR-038). Hostile fixtures never run on a developer workstation (FR-061).

## Idempotency

`runId = H(executionUnitId, attempt)`; `provision` create-or-get; `destroy` idempotent; `finalizeExecutionUnit` key is the
unit key; duplicate dispatch yields at most one Guest (F07 fencing rejects the stale holder). Claim scopes used:
`ep-run-start` and `evidence-write`; every claimKey begins with `scanPlanId` (REVERIFY plans have one) so keys cannot
collide across tenants or scans.

## Consumers

Source Check dispatcher, source-evidence-contract, command-policy, dependency-installation, build-typecheck, execution-fixture.

## Non-negotiable boundary rules

1. No customer code runs in the API, any BullMQ worker, `apps/sandbox-runner`, or any process with Fahes secrets (FR-035).
2. No fallback to weaker isolation when the EP is unavailable; refuse with `EXECUTION_PLANE_UNAVAILABLE` (FR-058).
3. No new `ExecutionUnitClass`, queue name, or lifecycle state; the supervisor never extends the 009 SIGKILL deadline.
4. Guest output is never trusted before validation and redaction; a stopped run's late output is discarded.
5. No automatic retry of a run in which any customer Step has started.
6. The scan-wide timeout sweep MUST NOT be this lifecycle's mechanism. SPEC 009 U-1 (applied 2026-10-10) gives every plan an immutable bounded `deadlineMs`; this unit declares `timeoutPolicyMs` = 2 030 000 ms and `hardStopMarginMs` = 300 000 ms (equal to the EP hard-TTL margin), so `unitBudgetMs` = 2 390 000 ms (one attempt); dispatch step 0 (009 `execution-runtime-contract.md`) refuses the unit with `SCAN_DEADLINE_EXPIRED` or `SCAN_DEADLINE_INSUFFICIENT` (fewer than 2 330 000 ms of deadline remaining) BEFORE F07 admission, consuming no budget or lease. A four-partition chain therefore yields `deadlineMs` = 900 000 + 4 x 2 390 000 + 300 000 = 10 760 000 ms (2 h 59 min 20 s). SOURCE_EXECUTION stays default-off until the 009 implementation tasks T-U1-1..T-U1-10 have landed and the isolation gates pass (FR-139, FR-158).
6a. Pre-finalize confirmation (009 "Evidence and finalization fencing" rule 1): immediately before phase 12 calls `finalizeExecutionUnit`, the Supervisor re-confirms in one read that its F07 lease token is still live and the plan deadline has not passed; otherwise it finalizes nothing (the 009 sweep owns the unit) because with `attempts: 1` the idempotency key alone does not fence a stale holder.
7. The Execution Plane backstop required by 009 (`scan-deadline-contract.md` "Interaction", rule 3) is this contract's dead-man switch (15 s), hard TTL and orphan reconciler (the hard TTL is an ABSOLUTE instant computed at DISPATCH = dispatch time + `timeoutPolicyMs` + `hardStopMarginMs`, passed to the EP in `provision`, never restarted at run creation): a Guest cannot outlive its unit by more than `hardStopMarginMs` even if its Supervisor is dead. This contract also registers the 009 engine hook `onUnitExpired(unit)` = `TERMINATED | PENDING` (009 "Termination confirmation"): an idempotent parent-side `destroy(runId)` to the Execution Plane that returns `TERMINATED` ONLY when the EP has confirmed the Guest destroyed and scratch wiped (or `getRun` reports `STOPPED`/absent), and `PENDING` otherwise (destroy slow, unconfirmed, or the run `QUARANTINED`). 009 `expirePlanUnits` finalizes a `RUNNING` unit and releases its F07 lease ONLY on `TERMINATED`; on `PENDING` the unit keeps its lease and the next sweep retries; a unit still `PENDING` more than `hardStopMarginMs` after the deadline is finalized `FAILED/TRANSIENT_INFRASTRUCTURE` with detail `TERMINATION_UNCONFIRMED` (the EP hard TTL and reconciler have by then destroyed the Guest). A Guest therefore never outlives its released lease on the normal path, and its unit-produced evidence goes through the evidence wrapper of invariant 8, which additionally refuses a write when the unit is terminal, the scan is terminal or the plan deadline has passed (009 `scan-deadline-contract.md` "Evidence and finalization fencing"). Registry-dispatched `SOURCE_CHECK_RESULT` evidence is parent-side and is not fenced this way.
7. No SOURCE_EXECUTION starts without the `source.sent_to_execution_plane` (an `AuditLogEntry` action; F07's closed `ExecutionAuditEventType` is not extended) audit event (FR-147), and no operator reads tenant payloads (FR-144).
