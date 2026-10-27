# Upstream Amendment Requests Raised by SPEC 011 Planning

**Created**: 2026-10-09 · **Updated**: 2026-10-10 · **Status**: **U-1 RESOLVED** by a controlled, owner-authorized planning amendment to SPEC 009 (applied 2026-10-10); **U-2 RESOLVED BY INTERPRETATION** (no amendment). The request text below is preserved as the amendment history.

SPEC 011 treats 006–010 as frozen. An independent adversarial review plus direct verification of the repository found exactly **one** point where SPEC 011 cannot function without a change to a frozen contract (U-1) and **one** clarification request (U-2). Every other gap the review raised is resolved locally inside SPEC 011 (see `research.md` R27 and `adversarial-review.md` §C0). SPEC 011 closure/freeze MUST NOT proceed until U-1 is approved or SPEC 011 is explicitly rescoped.

## U-1 (was blocking; RESOLVED 2026-10-10 — see "Resolution of U-1" at the end of this section) — Scan-level timeout versus long-running non-passive units (SPEC 009)

**Frozen contract**: SPEC 009 FR-040 and `plan.md` Current-State: the existing 15-minute scan-wide timeout and its sweep are unchanged ("`PASSIVE_HTTP`/`SOURCE_STATIC` dispatch, today's existing cancellation/timeout/… remain exactly as today"). Constitution Principle XII: a class exceeding the short-job assumptions "(today: ~15-minute scan-wide timeout …) MUST NOT inherit them". 006 execution-class matrix: `SOURCE_EXECUTION` runs "minutes to tens of minutes".

**Verified repository behavior**: `apps/worker/src/orchestrator/timeout-scheduler.ts` sets `DEFAULT_MAX_DURATION_MS = 15 * 60_000` (env `SCAN_TIMEOUT_MS`, compose default `900000`); `apps/worker/src/orchestrator/timeout.ts` `sweepTimedOutScans` selects scans by `state in (…)` and `startedAt < cutoff` with no consideration of execution class or live units, terminates the scan and refunds undelivered areas.

**Conflict**: SPEC 009 defines no rule for the `Scan` row of a plan that contains a non-passive unit that legitimately runs longer than the sweep deadline. A `SOURCE_EXECUTION` unit has a unit timeout of about 33 minutes 50 seconds (SPEC 011 FR-158), so the sweep would mark the scan terminal and refund it while the Guest is alive and the supervisor is still persisting evidence. Principle XII forbids the scan from inheriting the 15-minute limit; FR-040 forbids changing the sweep. The two cannot both hold for such scans. (SPEC 010's long-running crawler/browser classes face the same question.)

**Requested amendment (additive; no behavior change for passive-only scans)**: add to SPEC 009 (runtime wiring, `execution-runtime-contract.md` or a new "scan deadline" rule):
1. A scan whose plan contains any non-passive `ExecutionUnit` carries a plan-level `maxDurationMs` ≥ the sum of its non-passive units' declared timeouts plus the passive window; the sweep uses that value for such scans and the existing 15-minute value for passive-only scans.
2. The sweep MUST NOT terminate a scan that has a non-terminal non-passive unit holding a live F07 lease without first stopping those units through F07 (`triggerStop(EXECUTION, …)`), so no Guest outlives its scan and no evidence is written to a terminal scan.
3. Refund computation for such scans follows delivered-area semantics already in `isDelivered`.

**Why SPEC 011 cannot absorb it**: any local workaround (separate scan row, heartbeat reset, hiding units from the sweep) either creates a second scan platform (forbidden, Principle VIII/FR-110) or edits the frozen sweep (forbidden by FR-040).

**Impact if not approved**: SOURCE_EXECUTION cannot be activated (it remains behind `FAHES_SOURCE_EXECUTION`, default off); SPEC 011 static analysis (`SOURCE_STATIC`, ≤ 5 min per unit) is unaffected and can proceed.

### Resolution of U-1 (2026-10-10)

The project owner authorized a minimal planning amendment to SPEC 009 only. Applied: `specs/009-core-scan-execution-platform/` — new `contracts/scan-deadline-contract.md`; FR-047, the FR-040 amendment note, SC-008 and the amendment history in `spec.md`; "Controlled Upstream Amendment U-1 — Scan Deadline Policy" in `plan.md`; `ScanPlan.deadlineMs`/`deadlineBreakdown` in `data-model.md`; step 4a in `execution-plan-contract.md`; step 0, 6a and rule 6 in `execution-runtime-contract.md`; scan/plan-end finalization in `runtime-finalization-contract.md`; terminal-unit rejection in `evidence-envelope-contract.md`; the `timeoutPolicyMs`/`hardStopMarginMs` declaration in `execution-unit-contract.md`; Phase 12 in `tasks.md`; R13 in `research.md`.

How the resolution differs from the original request: item 1 (plan-level maximum) is realized as an immutable, bounded, calculated `deadlineMs` (critical path, ceiling 6 h, grant expiry) anchored on `Scan.startedAt`; item 2 (the sweep must stop live units through F07 first) is NOT used: expiry is liveness enforcement by the engine hosts' existing <= 5 s loops plus a self-healing pass inside the same `timeout-sweep` job, so it needs no new F07 trigger and no 008 amendment; item 3 (refunds) is unchanged. Passive-only and unplanned scans keep today's 15-minute behavior exactly.

Residual dependency: SOURCE_EXECUTION activation waits for the 009 implementation tasks T-U1-1..T-U1-10 in addition to the isolation gates.

## U-2 (clarification, non-blocking; RESOLVED BY INTERPRETATION 2026-10-10) — Content-type-keyed artifact budgets (SPEC 009)

**Frozen contract**: `contracts/artifact-contract.md` `createArtifact` steps 2–3 enforce "the fixed per-object budget" and a per-scan cumulative budget; numeric values are left to implementation (009 FR-033 / spec Assumptions).

**Request**: confirm that the per-object and per-scan budgets MAY be keyed by content type (or by engine) so that a Source Snapshot Artifact (`application/vnd.fahes.source-snapshot`, ceiling 128 MiB compressed, provisional) and 011 report/log Artifacts (20 MiB per object, 50 MiB per run, FR-119) can coexist. SPEC 011 has chosen to treat this as an implementation decision inside 009's open parameter; this entry records it so the closure pass can confirm.

### Resolution of U-2 (interpretation within existing SPEC 009 contracts)

SPEC 009 FR-033 states that "the specific numeric ceilings are a future engine spec's own decision (the engine producing the artifact knows its own realistic size envelope)". `createArtifact` already receives `executionUnitId` (hence the engine/class) and `contentType`, so a budget lookup keyed by (engine class, content type) is an implementation of FR-033 behind the contract's "fixed budget" wording ("fixed" = platform-configured and not caller-chosen). SPEC 011 therefore declares its ceilings in its own spec: Source Snapshot content type 128 MiB per object; 011 report and log Artifacts 20 MiB per object and 50 MiB per run; per-scan accounting of the snapshot is 256 MiB. If an implementation exposes only a single per-scan number, that number must be configured at least as large as the sum of the declared envelopes of the engines present in the plan; choosing that aggregation rule is configuration, not a contract change. No SPEC 009 artifact policy was edited. To be confirmed at the closure review; if the owner disagrees with this reading it becomes a separate amendment that does NOT gate U-1.

## Resolved locally (no amendment) — recorded for traceability

| Review finding | Local resolution |
|---|---|
| 008 `ExecutionAuditEventType` is closed (no "source sent" value) | FR-147 uses the existing `AuditLogEntry` control-plane log (007 R3); 008 enum untouched. |
| 008 forbids SYSTEM triggers at PLATFORM scope / new automatic triggers | FR-143 rewritten: no PLATFORM scope; supervisor-local attestation re-check destroys its own Guest and finalizes the unit `FAILED`/`SAFETY_REFUSED`; operators may issue per-execution `OPERATOR_EMERGENCY_STOP`; no new F07 trigger is claimed. |
| 009 treats a concurrency refusal as terminal (partitions cannot "wait") | FR-152: partitions are chained with plan-level `ExecutionDependency` edges (no data dependency) so at most one runs at a time; nothing relies on refusal-then-redelivery. |
| 009 `recordEvidence` has no lease/terminal check | FR-055 rewritten: 011's own evidence wrapper validates the lease token and unit status in one locked transaction. |
| 008 admission re-checks concurrency on every `consumes.concurrency` call | The periodic 5 s checkpoint uses `consumes {request:false, concurrency:false}` plus a separate lease renewal; only dispatch consumes (FR-050). |
