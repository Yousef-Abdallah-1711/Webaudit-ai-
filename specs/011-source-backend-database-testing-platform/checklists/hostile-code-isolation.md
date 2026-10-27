# Hostile-Code Isolation Checklist: Source / Backend / Database / Automated Code Testing Platform

**Purpose**: Validate the quality (completeness, clarity, consistency, measurability, edge-case coverage) of the
requirements that govern running a customer's own install/build/test code: the Isolation Acceptance Bar (IAB), the
trusted/untrusted split, the Provider Port, termination and cleanup, the 13-phase lifecycle, crash recovery, and the
hostile-fixture catalog. This checklist tests the written requirements, not any implementation.
**Created**: 2026-10-09
**Feature**: [spec.md](../spec.md) | [plan.md](../plan.md) (`## Hostile-Code Isolation Model`, `## Execution Lifecycle (13 phases)`) |
[contracts/isolation-policy-contract.md](../contracts/isolation-policy-contract.md) |
[contracts/untrusted-execution-contract.md](../contracts/untrusted-execution-contract.md) | [research.md](../research.md) R3-R8, R12, R29

**Status (pass 3)**: 34/34 items satisfied by the current package; remaining unchecked items: 0.

**Note**: This checklist is a reviewer-owned requirements-quality review artifact. It was evaluated against the actual
files of the planning package on 2026-10-09. It is PLANNING ONLY: nothing here executes, builds or provisions anything.
**Marker Semantics**: `[x]` means the requirement-quality criterion is satisfied by the current spec package. `[ ]` means
a real gap, inconsistency or ambiguity remains; each such item carries a `**GAP**:` note naming where the package
falls short, so it can be repaired before closure. It does not mean implementation work is complete.

**Status (pass 2, re-evaluated against the repaired package)**: 32 of 34 items satisfied; 2 open (see `**GAP**:` notes).

## IAB Items 1-10: Testable, With a Proving Mechanism

- [x] CHK-HI001 Is IAB item 1 (kernel boundary per run via hardware virtualization) stated as a checkable property with a
  named proving mechanism (kernel-share fixture: host `/proc/version` marker, `kexec`, module load, `/dev/kmem` denied)?
  [Measurability, Spec §FR-041(1), isolation-policy-contract Invariant 1, plan IAB table row 1]
- [x] CHK-HI002 Is IAB item 2 (no writable state shared between runs or tenants) paired with a two-run residue test
  (`residue-writer` then tenant B reads every mount, scratch device and cache) and a scratch-wipe verification?
  [Measurability, Spec §FR-041(2), §FR-042, isolation-policy-contract Invariant 2]
- [x] CHK-HI003 Is IAB item 3 (default-deny egress enforced outside the Guest, no route to private/link-local/metadata/
  management/control-plane ranges) testable through named fixtures (`metadata-169.254`, `rfc1918-sweep`, `ep-mgmt-probe`,
  `dns-exfil`, `redis-5432-6379`) with host-side denial logging?
  [Measurability, Spec §FR-041(3), §FR-043, isolation-policy-contract Invariant 3]
- [x] CHK-HI004 Is IAB item 4 (resource caps enforced outside the Guest) bound to concrete fixtures (`fork-bomb`,
  `memory-bomb`, `disk-fill`, `cpu-spin`, `output-flood`) whose expected result is "contained, host metrics within cap"
  rather than "does not crash"?
  [Measurability, Spec §FR-041(4), §FR-044, isolation-policy-contract Invariant 4]
- [x] CHK-HI005 Is IAB item 5 (no Fahes secret reachable) proved by planting canary values held by the Supervisor, worker
  and Execution Plane and sweeping Guest env, filesystem, process list, vsock and DNS (`secret-hunt`), so the requirement
  is falsifiable rather than asserted?
  [Measurability, Spec §FR-041(5), §FR-045, isolation-policy-contract Invariant 5]
- [x] CHK-HI006 Is IAB item 6 (signed, digest-pinned, SBOM-bearing, vulnerability-scanned images with a patch SLA) tied to
  a rejecting gate (`image-gate`: unsigned, tag-only, digest-mismatch) and a numeric SLA (critical <= 7 days, high <= 30 days,
  marked provisional)?
  [Measurability, Spec §FR-041(6), §FR-047, isolation-policy-contract Invariant 6]
- [x] CHK-HI007 Is IAB item 7 (escape-fixture suite passes on the REAL provider in Linux CI on every image or VMM/kernel
  change) stated with a blocking consequence (attestation renewal blocked on any failure) and a stated fake-provider role
  limited to harness checks on developer machines?
  [Measurability, Spec §FR-041(7), §FR-061, isolation-policy-contract Invariant 7]
- [x] CHK-HI008 Is IAB item 8 (teardown proof) defined by an observable post-condition (`teardown-audit` lists host
  artefacts by `runId` after destroy, after kill during phases 4/6/10, and after supervisor loss) plus a defined result for
  an unconfirmed teardown (host quarantined)?
  [Measurability, Spec §FR-041(8), §FR-051, isolation-policy-contract Invariant 8]
- [x] CHK-HI009 Are IAB items 9 and 10 (external penetration review; documented residual-risk acceptance) given a recorded,
  checkable artifact (attestation `externalReviewRef`, `residualRiskAcceptanceRef`) so activation cannot proceed on an
  informal sign-off?
  [Completeness, Spec §FR-041(9)(10), §FR-040, isolation-policy-contract signature]
- [x] CHK-HI010 Is "no known escape path" operationalized (items 1-9 satisfied and no unpatched published escape for the
  pinned VMM/kernel, plus item 10) instead of left as an unprovable absolute, and is the claim of "perfect" isolation
  explicitly forbidden?
  [Clarity, Spec §FR-041, research.md R6, isolation-policy-contract Invariants]

## Principle XI Compliance and Boundary Claims

- [x] CHK-HI011 Is it stated unambiguously that ordinary containers (even rootless/hardened) are never the sole boundary and
  never described as sufficient for hostile code, with container-in-Guest permitted only as added depth?
  [Consistency, Spec §FR-037, §FR-041, isolation-policy-contract Non-negotiable rule 1, research.md R5]
- [x] CHK-HI012 Does the package forbid reuse or extension of `apps/sandbox-runner` and any fallback to it, in requirement
  text (not only research), and is the same prohibition repeated in the plan's migration map and the quickstart blockers?
  [Consistency, Spec §FR-035, §FR-058, plan Current-Capability Migration Map #21, quickstart Part C blocker 2]
- [x] CHK-HI013 Is Principle XI's "no credential reachable under any circumstance, including indirectly via shared
  filesystem, process or network namespace" restated as a testable requirement covering env, tokens and the snapshot
  (credential-file denylist, GitHub token never leaving the trusted worker, presigned URL pulled by the EP host)?
  [Completeness, Spec §FR-045, §FR-009, source-acquisition-contract Safety 2]
- [x] CHK-HI014 Is egress "explicit and minimal" (Principle XI) expressed as one consistent rule: only the lockfile-pinned
  exact-URL allowlist during P1, everything else denied?
  **RESOLVED**: dependency-installation-contract 4c/4b/6 and plan P1: exact-URL allowlist only, deny by default, NO
  metadata-path exception (an installer needing metadata fails as `LOCKFILE_OUT_OF_SYNC`); host list only admits
  lockfile entries and never permits traffic by itself. [Consistency, Spec FR-043, FR-066]
- [x] CHK-HI015 Is each of filesystem, process, memory, CPU, disk/IOPS and temp-storage isolation given an enforcement
  point outside the Guest and a named verifying fixture in the mandatory matrix (rather than a Guest-side limit as proof)?
  [Completeness, Spec §FR-042, §FR-044, isolation-policy-contract matrix and rule 3]
- [x] CHK-HI016 Are kernel attack surface and IPC isolation specified (jailer, unprivileged VMM user, seccomp on the VMM,
  minimal guest devices; only a byte-capped vsock channel; no shared memory, host sockets or Docker socket) with
  `vsock-abuse`, `docker-sock` and `syscall-fuzz-smoke` as verifiers?
  [Completeness, isolation-policy-contract matrix rows "Kernel attack surface" and "IPC"]
- [x] CHK-HI017 Is cross-tenant isolation free of any shared mutable resource, including package/build caches?
  **RESOLVED**: dependency-installation-contract 4f ("No cache"), plan Principle XIII row, research R9 and
  FR-042/FR-046 all forbid any cross-run or cross-tenant package/metadata/build cache, so no hit/miss timing channel
  exists; isolation-policy-contract IAB 10 repeats it.
- [x] CHK-HI018 Is the forbidden-access list complete and each entry a negative test whose success of access fails
  conformance (production DB credentials, app secrets, Redis, R2 master credentials, host filesystem, Docker socket, cloud
  metadata, other tenants' workspaces/snapshots/logs, management services and EP control plane)?
  [Completeness, isolation-policy-contract "Forbidden access list", Spec §FR-035, §FR-043]
- [x] CHK-HI019 Is the trusted-versus-untrusted split explicit about who holds what (Supervisor: credentials and mTLS client
  certificate; EP and Guest: no Fahes secret) and is all Guest output declared untrusted, size-capped, schema-validated and
  redacted on the trusted side before persistence?
  [Clarity, Spec §FR-039, untrusted-execution-contract Ownership/Invariant 8, plan Diagram 5]

## Provider Port, Attestation and No-Fallback

- [x] CHK-HI020 Are the three Provider Port implementations specified with the safe default (`DisabledProvider`, refuses all
  execution), a test double (`FakeExecutionPlane`), and an explicit, build-wide prohibition on a `LocalProcessProvider` (plus
  a CI static check against provider code spawning customer-influenced argv)?
  [Completeness, Spec §FR-038, untrusted-execution-contract Safety, research.md R7]
- [x] CHK-HI021 Is the effect of attestation expiry, suspension or revocation on already-running Guests specified as a
  concrete, bounded mechanism rather than a phrase?
  **RESOLVED**: FR-143, isolation-policy-contract Safety and untrusted-execution-contract invariant 2:
  revocation/suspension refuses new admission; each Supervisor re-reads attestation status on its <= 5 s loop, destroys its own Guest and finalizes the unit `FAILED`/`SAFETY_REFUSED` (no PLATFORM-scope stop, no new F07 trigger; operators may add per-execution stops); bound = one loop interval plus teardown; fixture `attestation-revoked-mid-run` / quickstart 45.
- [x] CHK-HI022 Is "no silent fallback to weaker isolation" proven across all unavailability cases (unprovisioned, unhealthy,
  no valid attestation, flag off, tenant not allowlisted, image untrusted) with a distinct reason code and the static path
  left unaffected?
  [Consistency, Spec §FR-058, §FR-133, quickstart flag matrix, source-evidence-contract `EXECUTION_PLANE_UNAVAILABLE`/`IMAGE_NOT_TRUSTED`]
- [x] CHK-HI023 Is image provenance specified end to end (versioned catalog; start requires valid signature and pinned
  digest; SBOM and vulnerability-scan references mandatory; image id and digest recorded in every run's evidence)?
  [Completeness, Spec §FR-047, isolation-policy-contract "Image provenance", data-model ExecutionImage]

## Termination, Dead-Man Switch and Cleanup

- [x] CHK-HI024 Is the termination primitive stated as destruction of the whole Guest (descendants die by construction),
  with process-level kill explicitly not relied upon, and `STOPPED` recorded only after the EP confirms `DESTROYED` and
  scratch wipe, including for escaped or double-forked descendants?
  [Clarity, Spec §FR-051, research.md R8 (gap G1), plan Diagram 13]
- [x] CHK-HI025 Are the dead-man interval (15 s without heartbeat, shorter than the 30 s F07 lease) and F07 timings reconciled with a derivation (a stale supervisor and a replacement holder can never both control a live Guest; heartbeat every 5 s; tolerates two missed beats; `timeoutPolicyMs` 33 min 50 s; hard TTL = `timeoutPolicyMs` + 5 min)?
  [Consistency, Spec §FR-052, research.md R8, plan F07 Integration]
- [x] CHK-HI026 Is the hard-TTL margin one value across the package?
  **RESOLVED**: hard TTL = unit timeout + 5 min margin in FR-052, plan budget table, research R8 (line 278 "single
  value used everywhere"), data-model and untrusted-execution-contract invariant 7. [Consistency, Spec FR-052, plan
  Resource Budget Table, research R8]
- [x] CHK-HI027 Is the stop path (5 s F07 ceiling; escalation = destroy) specified consistently in the contract that the
  implementer will read?
  **RESOLVED**: untrusted-execution-contract invariant 2 (lines 90-92): stop latency measured at `destroy(runId)`
  issuance, completion confirmed separately by `DESTROYED`; parent orchestrator escalates by direct `destroy(runId)`
  with an `ESCALATED` audit event if the Supervisor is dead or silent. [Measurability, Spec FR-123]
- [x] CHK-HI028 Is cleanup failure specified as never silent (alert + host quarantine + no new tenant work on an
  unconfirmed host) and covered by an orphan reconciler that destroys runs older than TTL with no live unit?
  [Completeness, Spec §FR-057, plan Diagram 13, data-model EP run lifecycle]

## Lifecycle, Crash Recovery and Fencing

- [x] CHK-HI029 Does each of the 13 lifecycle phases declare timeout, failure classification, retry, cancellation, F07
  checkpoint, audit event and crash-recovery action, with ONE authoritative table?
  **RESOLVED (pass 3)**: Lifecycle table reproduced in plan.md matches the contract (timeouts, FailureClass-only class column, separate reason-code column, run envelope, `timeoutPolicyMs` 33 min 50 s, dead-man 15 s).
- [x] CHK-HI030 Are crash recovery and retry rules complete and consistent: deterministic `runId = H(executionUnitId,
  attempt)`, create-or-get provisioning, surviving Guest destroyed and classified `TRANSIENT_INFRASTRUCTURE`, provisioning-only
  retry before any customer Step, and no automatic retry of a run in which any customer Step has started?
  [Completeness, Spec §FR-054, §FR-135, untrusted-execution-contract Invariants 10-11]
- [x] CHK-HI031 Is stale-result fencing specified (evidence writes require a live lease token; stale token treated as an
  immediate stop; duplicate dispatch yields at most one Guest; late output after stop discarded) with a named reason code
  and fixture?
  [Completeness, Spec §FR-055, §FR-050, source-evidence-contract `STALE_RESULT_REJECTED`, quickstart fixture 28]
- [x] CHK-HI032 Are the per-run and per-step time budgets and the serialization of multiple workspace runs defined without
  contradiction?
  **RESOLVED**: plan Execution Lifecycle "Run envelope (binding)" and untrusted-execution-contract phase 6: per-step
  walls are maxima clamped to the remaining 25-min envelope; a clamped step is `TIMED_OUT`, unstarted steps are
  `RUN_BUDGET_EXHAUSTED` (INCONCLUSIVE), reruns share the envelope; contract invariant 13 and plan: per-tenant limit 1
  is NOT the serializer: workspace units are chained by plan-level `ExecutionDependency` edges, max 4 selected workspaces fixed at plan resolution (FR-152). [Clarity, Spec
  FR-044, FR-046]

## Defense-in-Depth Claims, Residual Risk and Fixtures

- [x] CHK-HI033 Is the E12 forked child's "no network" property stated honestly, with a proving mechanism?
  **RESOLVED**: static-analysis-contract invariant 5 states honestly that Node `--permission` has no network control;
  "no network" is enforced by absence of network code, worker network policy and a unit test that fails on any
  socket/fetch attempt; research R12 agrees; FR-026 stays defense in depth, not a Principle XI claim.
- [x] CHK-HI034 Do the residual-risk register and the hostile-fixture catalog fully cover what the IAB and contracts name?
  **RESOLVED (pass 3)**: Residual-risk register (research R29) gained rows for operator error, vsock/reporter forgery, redaction DoS, export-ignore, applier infidelity, header covert channel, image EOL, U-1, provider capability gaps, EP control-plane hang and stop latency; isolation fixtures I25-I29 added and listed in the isolation contract.

## Notes

- Items marked `[ ]` are repair targets for the planning package before the closure/freeze pass; they are not
  implementation tasks.
- This checklist deliberately does not re-verify upstream (SPEC 006-010) compatibility; see `upstream-architecture-compatibility.md`.
