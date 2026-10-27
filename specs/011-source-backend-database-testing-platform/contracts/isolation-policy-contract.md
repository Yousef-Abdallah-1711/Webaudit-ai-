# Contract: Isolation Policy (Isolation Acceptance Bar, matrix, images, attestation)

Per FR-037 through FR-047 (including FR-044 resource isolation), FR-058..061, FR-143, FR-144 and FR-157. The testable bar a Provider Port implementation must pass before it may run
customer code. Consumers: untrusted-execution-contract, `MicroVmProvider` implementers, the Linux isolation CI job,
platform operator, external reviewer. Resolves Constitution `TODO(UNTRUSTED_EXECUTION_MECHANISM)` and 006 open decision #5
at architecture level. Ordinary containers alone are NOT claimed to give perfect hostile-code isolation.

## Signature (shape, not final TypeScript)

```text
IsolationAttestation = { attestationId, providerId, providerBuildId, vmmVersion, hostKernelVersion, guestKernelVersion,
  imageIds[], conformanceSuiteVersion, conformanceRunId, iabItems{1..10: PASS|FAIL, evidenceRef}, externalReviewRef,
  residualRiskAcceptanceRef, issuedAt, expiresAt, status: VALID|SUSPENDED|REVOKED, revokedAt?, revocationReason? }
ExecutionImage = { imageId, digest, signature, nodeVersion, packageManagers{npm,pnpm,yarn}, runners{vitest,jest,nodetest},
  postgresVersion:16, sbomRef, provenanceRef, vulnScanRef, builtAt }
conformance(provider) -> { fixtureId, expected, observed, pass }[]
```

## Inputs

A candidate provider build plus image catalog; the hostile-fixture catalog (FR-141); external review report; the VMM,
host kernel and image versions. Activation additionally reads `FAHES_SOURCE_EXECUTION` and the attestation id.

**Provider-selection preconditions (FR-157), evaluated BEFORE any IAB run.** A candidate provider must first demonstrate, with evidence: (a) per-interface host firewalling enforced outside the Guest; (b) per-run bandwidth and rate limiters; (c) destroy confirmation that includes scratch wipe; (d) a host-resident dead-man switch that works with no Supervisor connectivity; (e) an exclusive host channel (vsock-class) for the agent with a single authenticated connection per run; (f) no memory-balloon or shared-memory device exposed to the Guest. A managed Firecracker-class service that exposes none of these, or a cloud VM without nested virtualization, fails the preconditions and cannot enter IAB evaluation.

**Attestation record (signed, expiring, fail-closed).** An `IsolationAttestation` is a document signed by the attestation authority key (public key pinned in worker configuration, rotated by config change); it is NOT an opaque id. The activation guard and every Supervisor loop verify: (1) signature valid, (2) `now < expiresAt` (maximum validity 90 days; expiry behaves as revocation), (3) `providerId`/`providerBuildId`/`imageIds` equal the live provider's reported build, (4) `status` is `VALID` in the revocation list, which each Supervisor reads on its 5 s loop; if the revocation list cannot be read for 3 consecutive loops (15 s) the Supervisor treats the attestation as revoked (fail closed). `FakeExecutionPlane` and any provider whose `providerId` starts with `fake` can NEVER hold a `VALID` production attestation: the activation guard refuses them whenever `NODE_ENV` is `production`, regardless of flags.

## Outputs

An `IsolationAttestation` record (code-level/config artifact, not a Fahes table, FR-116) that gates
`FAHES_SOURCE_EXECUTION`; conformance reports; operator-visible escape telemetry (seccomp kills, VMM faults, egress-deny hits).

## Ownership

Platform operator and the EP deployment (`infrastructure/execution-plane/`, planned) own enforcement and attestation.
The Supervisor only reads the attestation and refuses without a `VALID` one. The conformance suite is owned in-repo
(`packages/source-execution-contract/`, planned) and runs on Linux CI against the real provider.

## Invariants

IAB clauses (FR-041); each has a proving test, runnable against `MicroVmProvider` in Linux CI (fake provider runs only the harness):

1. Kernel boundary per run via hardware virtualization (or a user-space kernel inside a dedicated VM); guest kernel never
   shared across runs. Proof: fixture `kernel-share` reads host `/proc/version` markers and attempts `kexec`, module load,
   `/dev/kmem`; expect no host marker, calls denied.
2. No writable state shared between runs or tenants. Proof: fixture `residue-writer` run, then tenant B run reads every
   mount, scratch block device and package cache; expect zero bytes of tenant A content.
3. Default-deny egress outside the Guest; no route to private/link-local/metadata/management/control-plane ranges. Proof:
   fixtures `metadata-169.254`, `rfc1918-sweep`, `ep-mgmt-probe`, `dns-exfil`, `redis-5432-6379`; all fail, denials logged host-side.
4. Resource caps enforced outside the Guest. Proof: `fork-bomb`, `memory-bomb`, `disk-fill`, `cpu-spin`, `output-flood`; run
   ends contained, host metrics stay within the cap.
5. No Fahes secret, credential or env reachable. Proof: `secret-hunt` scans Guest env, fs, process list, vsock, DNS for
   planted canary values held by the Supervisor/worker/EP; zero canary hits.
6. Images signed, digest-pinned, SBOM-bearing, vulnerability-scanned; patch SLA for host kernel and VMM. Proof: `image-gate`
   rejects unsigned, tag-only and digest-mismatch images; SBOM present; critical-CVE age check against SLA
   (provisional: critical <= 7 days, high <= 30 days). The item covers Guest userland as well as the host: Node, package managers and PostgreSQL baked into an image must be supported (Node 22 and 24; Node 20 is end-of-life) and free of unpatched critical CVEs; the `ExecutionImage` catalog entry carries `vulnScanResult` (max severity and scan date) and `eolDate`, an image over the CVE age SLA or past EOL is refused (`IMAGE_NOT_TRUSTED`), and images are rebuilt monthly and on any critical advisory. Fixtures: `image-gate`, `critical-cve-image`.
7. Escape-fixture suite passes on the real provider in Linux CI on every image or VMM/kernel change. Proof: CI job
   `isolation-conformance` blocks attestation renewal on any failure; developer machines run only `FakeExecutionPlane`.
8. Teardown proof: destroy confirmed, scratch wiped, no residual process/device/tap/cgroup. Proof: `teardown-audit` lists
   host artefacts by `runId` after `destroy`, after kill during phase 4, 6 and 10, and after supervisor loss (dead-man).
9. External penetration review before first production activation; findings fixed or risk-accepted in writing.
10. Documented residual-risk acceptance (register in `research.md`, FR-060, with a named acceptance owner recorded in
    `residualRiskAcceptanceRef`): VMM/kernel zero-day class, proxy covert channels, shared-host side channels
    (cache/timing), supply-chain compromise of images, and operator error. Every residual named here MUST have a row in the
    research register; the proxy keeps no cross-run cache (dependency-installation-contract), so no cache timing channel exists.

"No known escape path" means items 1-9 satisfied and no unpatched published escape for the pinned VMM and host/guest kernels.

Mandatory isolation matrix (all enforced outside the Guest unless stated):

| Surface | Enforced | Where | Verified by |
|---------|----------|-------|-------------|
| Filesystem | read-only signed rootfs; snapshot read-only then copied to size-capped scratch; no host mounts; no shared caches (FR-042) | VMM block devices | fixtures 2, `host-fs-read`, `cache-poison` |
| Network | default deny; only lockfile-proxy during P1; none after (FR-043) | host/tap firewall at EP edge | fixture 3 + P3 probe |
| Processes | one Guest per run; pids limit is a Guest cgroup limit (the VMM sees host threads, not guest pids, and bounds memory, vCPU, IOPS and bandwidth); the agent runs in a reserved cgroup so a fork bomb is recorded as `RESOURCE_LIMIT_EXCEEDED` and not as agent tampering; destroy kills all | Guest cgroups + VMM | `fork-bomb`, `orphan-daemon` |
| Memory | VMM memory size, balloon off | VMM | `memory-bomb` |
| CPU | vCPU count + cgroup quota on the VMM process | host cgroups | `cpu-spin` |
| Disk | scratch image size cap, IOPS/bandwidth rate limits | VMM | `disk-fill`, `iops-hammer` |
| Temp storage | tmpfs/overlay inside scratch quota; wiped at teardown | VMM + EP | `teardown-audit` |
| Secrets/credentials | none provisioned; synthetic env only; presigned URL single-object, read-only, 10-minute TTL, consumed by the EP only (FR-045, FR-146) | Supervisor + EP | `secret-hunt`, `url-reuse` |
| Kernel attack surface | jailer, dedicated unprivileged user, seccomp on VMM, minimal guest kernel and devices | host | review + `syscall-fuzz-smoke` |
| IPC | only a byte-capped vsock channel to the host agent; no shared memory, no host sockets, no Docker socket | VMM | `vsock-abuse`, `docker-sock` |
| Tenant boundaries | one Guest per run, never reused; per-tenant concurrency 1; scoped per-run credentials (FR-046) | EP scheduler | fixtures 2 and `cross-tenant-read` |

Named fixture catalog (single table; names are stable and `quickstart.md` includes each by exactly this name; fixtures
run only on the Linux CI isolation job against the real provider, never on a developer workstation, FR-061):

| Fixture | IAB item / matrix row | Attack it attempts |
|---------|----------------------|--------------------|
| `kernel-share` | 1 | read host `/proc/version` markers, `kexec`, module load, `/dev/kmem` |
| `residue-writer` | 2 | leave bytes in scratch/cache for the next tenant run |
| `host-fs-read` | filesystem | read host paths through any mount |
| `cache-poison` | filesystem, 2 | plant content in a shared package/build cache (none may exist) |
| `metadata-169.254` | 3 | reach cloud metadata |
| `rfc1918-sweep` | 3 | reach private ranges |
| `ep-mgmt-probe` | 3 | reach EP management/control plane |
| `dns-exfil` | 3 | exfiltrate through DNS |
| `redis-5432-6379` | 3 | reach Redis/Postgres service ports |
| `fork-bomb` | 4, processes | exhaust pids |
| `memory-bomb` | 4, memory | exhaust memory |
| `disk-fill` | 4, disk | fill scratch |
| `cpu-spin` | 4, CPU | hold CPU |
| `output-flood` | 4 | flood stdout/stderr |
| `iops-hammer` | disk | saturate IOPS |
| `secret-hunt` | 5 | find planted Supervisor/worker/EP canaries |
| `url-reuse` | secrets/credentials | reuse the presigned snapshot URL or run credential outside its object/run/TTL |
| `image-gate` | 6 | start unsigned, tag-only or digest-mismatch image |
| `teardown-audit` | 8, temp storage | leave residual process/device/tap/cgroup after destroy |
| `orphan-daemon` | processes | survive `destroy` |
| `syscall-fuzz-smoke` | kernel attack surface | fuzz syscalls |
| `vsock-abuse` | IPC | oversize/malformed vsock traffic |
| `docker-sock` | IPC | reach a Docker socket |
| `cross-tenant-read` | tenant boundaries | read another tenant's workspace/snapshot/log |
| `attestation-revoked-mid-run` | FR-143 | revoke the attestation while a run is live; expect new admission refused and the live run destroyed by its own Supervisor within one 5 s loop (unit `FAILED`, `SAFETY_REFUSED`; no PLATFORM-scope stop) |
| `vsock-forge` | IPC, result integrity | a customer-user process (not the agent) opens the host channel or sends a well-formed forged event stream; expect rejection of the second/unauthenticated connection and no forged result accepted |
| `reporter-forge` | result integrity | a test or lint plugin prints a well-formed forged "all passed" report; expect count reconciliation to flag any inconsistency and every pass/fail to remain labelled runner-reported |
| `proxy-bypass-matrix` | 3, dependency egress | CONNECT, redirect to another host, header smuggling, DNS rebinding and IP-literal hosts through the dependency proxy; expect every one denied and logged |
| `critical-cve-image` | 6 | start an image with an unpatched critical CVE or an EOL runtime; expect `IMAGE_NOT_TRUSTED` |
| `ipv6-ula-cgnat-sweep` | 3 | reach IPv6 ULA/link-local, CGNAT (100.64.0.0/10) and cloud-specific internal ranges; extends `rfc1918-sweep` and `metadata-169.254` |

Attestation lifecycle (FR-143): the attestation record can be revoked. Revocation immediately refuses new SOURCE_EXECUTION
admission (`EXECUTION_PLANE_UNAVAILABLE`); each Supervisor re-reads the attestation status on its <= 5 s loop and destroys its own Guest and finalizes the unit `FAILED` with `SAFETY_REFUSED` (audited in `AuditLogEntry`); operators may additionally issue a per-execution `OPERATOR_EMERGENCY_STOP`. No PLATFORM-scope stop is used (it would refuse admission for every safety-gated class) and no new F07 trigger is claimed (untrusted-execution-contract invariant 2).
Re-attestation is required after any image, VMM or kernel change.

Operator access (FR-144): operators may stop runs and read run metadata and diagnostics without payloads; they MUST NOT read
tenant snapshots, logs or evidence payloads in v1 (no break-glass). Escape telemetry shown to operators carries no tenant payloads.

Credentials (FR-146): the only credentials in a run are a one-time, single-object, read-only 10-minute presigned snapshot
URL consumed by the EP and a run-scoped bearer credential valid only for that `runId`; the Guest receives none.

Forbidden access list (each is a negative fixture; success of any access is a failed conformance run): production DB
credentials; Fahes app secrets (JWT, encryption, AI keys); Redis; R2 master credentials; host filesystem; Docker socket;
cloud metadata services; other tenants' workspaces/snapshots/logs; internal management services and the EP control plane.

Image provenance (FR-047): images come only from the versioned catalog; start requires valid signature and pinned digest;
SBOM and vulnerability scan references are mandatory; the image id and digest are recorded in every run's evidence.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|-----------|-------------|--------------|---------|
| No `VALID` attestation, expired, suspended, or revoked | `EXECUTION_PLANE_UNAVAILABLE` | `SAFETY_REFUSED` | dependent checks `BLOCKED` |
| Image unsigned/unpinned/unscanned | `IMAGE_NOT_TRUSTED` (new) | `SAFETY_REFUSED` | `BLOCKED` |
| Escape-detection signal during a run | `SANDBOX_POLICY_VIOLATION` (flag, signal in Evidence) then `CONTAINMENT_ABORT` (outcome) | `CUSTOMER_CODE_FAILURE` | unit `FAILED`, F07 `SAFETY_VIOLATION`, host quarantined pending review; checks `BLOCKED` |
| Cap hit | `RESOURCE_LIMIT_EXCEEDED` | none (measured) | unit `COMPLETED` |
| Egress denied by policy | `NETWORK_BLOCKED_BY_POLICY` | none (measured) | test annotated; `REQUIRES_EXTERNAL_SERVICE` in coverage |

## Safety

Attestation is revoked on any failed conformance run, a published escape for the pinned VMM/kernel, or an
unreconciled teardown; revocation behaves as `DisabledProvider` for new work and, for live runs, is observed by each Supervisor on its
5 s loop, which issues `destroy(runId)` itself (FR-143), so the live-run bound is one loop interval to issuance plus teardown.

## Idempotency

Conformance runs are keyed by `(providerBuildId, imageId set, suiteVersion)`; re-attesting an unchanged build is a no-op.

## Consumers

untrusted-execution-contract, dependency-installation-contract (network cut), execution-fixture-contract (fixture limits).

## Non-negotiable boundary rules

1. Container-only isolation is never the sole boundary and is never described as sufficient for hostile code.
2. No IAB item may be waived per tenant, plan, or environment; `PRODUCTION` target environments do not relax any item.
3. Enforcement points live outside the Guest; a Guest-side limit is depth, never the proof.
4. Activation without a `VALID` attestation and external review is a defect, not a configuration option.
5. Fixtures that attack isolation run only on the Linux CI hosts against the real provider, never on a developer workstation (FR-061).
