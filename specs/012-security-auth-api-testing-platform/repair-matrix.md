# SPEC 012 Blocker Repair Matrix — B-1 … B-13 (2026-10-11)

> **Superseded in part (2026-10-14)**: the third repair pass (`third-repair-matrix.md`, `third-review-handoff.md`) rewrote FR-172/173/175/186/187/189/190/191/196 and added FR-197..199. Statements below about the earlier address binding, child-held permits, local-only attempt counting and conditional-upsert single writer are historical and no longer normative.

**Status**: repairs written by the repair author; **not certified closed**. A SECOND independent review (`second-review-handoff.md`) must assess them. SPEC 012 remains NOT FROZEN; no code, migration, commit, push or deployment occurred.

Sources of the blockers: `closure-review.md` §6 (verbatim in the first column) and `adversarial-rereview.md` (scenario and N-issue detail, quoted by id). Requirements are in `spec.md` (FR-172…FR-175, FR-177, FR-039, FR-070, FR-141, FR-186…FR-196); contracts carry a "Blocker repairs B-1..B-13" addendum that overrides earlier text.

## Owner-approved decisions recorded (2026-10-11)

| Decision | Status in the documents |
|---|---|
| P1 customer-provided test accounts mandatory | **OWNER-APPROVED** (spec Clarifications; plan §Product decisions) |
| P2 stateful testing in authorized non-production only, default OFF | **OWNER-APPROVED** |
| P3 MFA-exempt accounts or pre-established authorized sessions | **OWNER-APPROVED** |
| P7 passive-first release; authenticated testing behind gates | **OWNER-APPROVED** |
| P10 / AR-3 existing web targets cover APIs under matching F01 scope and grants | **OWNER-APPROVED**; AR-3 **CLOSED**; no distinct API kind, no 007 amendment |
| P13 reject uncapped DEGRADED readiness scoring; keep observed scores; no readiness PASS with incomplete security coverage | **OWNER-APPROVED** → FR-186, FR-188, FR-196 |
| P15 charge only for billable work executed (never BLOCKED/NOT_TESTED) | **OWNER-APPROVED** → FR-189; AR-15 dependency |
| P11 KMS provider/hosting | **DEFERRED by the owner** until credential-broker activation (SG3) |
| P4, P5, P6, P8, P9, P12, P14 | still PROVISIONAL — **not approved** (no approval inferred) |
| P16 (new) shared-edge/CDN/PaaS targets via a provider-policy registry | UNRESOLVED; default NO in v1 (refused) |

## Repair matrix

### B-1 — Address binding (scenario 7 GAP; scenario 5)
- **Blocker (verbatim)**: "Scenario 7 / FR-172 still a GAP — Require HTTP-file proof for active classes; remove the customer-declared address-set escape; enforce the proof-derived address on every connection of the unit; fixtures for DNS-TXT and mid-unit re-point".
- **Root cause**: ownership proof by DNS TXT is read through `node:dns/promises.resolveTxt` (`verify.ts:27`), not through the connection that carries probes; the "expected address set" was customer-declared; shared edges were a consent checkbox; each request resolved DNS afresh, so a mid-unit re-point passed every layer.
- **Trust boundary**: tenant-controlled DNS and names ↔ Fahes outbound connections; Fahes ↔ third-party infrastructure.
- **Mechanism (FR-172)**: HTTP-file verification required; the unit host proves **hostname control and address control** (`Host: <ip>` proof) over the exact connection for each of ≤ 4 safe-net-classified addresses; only addresses passing both form the `provenAddressSet`, which pins the unit's connect guard (no fresh DNS, one connection per origin, re-proof on every new connection); plan time requires a ≤ 24 h `TargetAddressProof`, dispatch re-proves fresh; wildcard scopes prove each hostname; the declared-set alternative and shared-edge checkbox are **removed** (customer may only narrow); a hostname failing the address-control proof (shared hosting/CDN/PaaS/third party) is **refused**. Attestation alone never proves third-party infrastructure authorization.
- **Owner / contract**: `security-scope-contract` (Blocker repairs 1), `active-security-execution-contract` (1, 5), data-model 4.9D `TargetAddressProof`, plan D15.
- **Fail-closed**: any proof error, rate-limit (`level1RateBound`), timeout, DNS-TXT-only Target, failed address-control proof or out-of-set peer ⇒ `SEC_TARGET_ADDRESS_UNVERIFIED`, zero probe bytes.
- **Acceptance tests / tasks**: T600 (method), T601 (declared set), T602 (re-point and DNS change between authorization and connect), T603 (shared edge), T604 (failure modes, IP literal, wildcard), T608 (passive unaffected); implementation T605, T606, T607; sizing T746.
- **FR mapping**: FR-172, FR-079, FR-177.
- **Residual**: IP reuse inside a ≤ 15-minute unit; CDN/PaaS-hosted staging cannot use active testing in v1 (product impact, P16); relies on the existing FILE verification being served by the tenant's own host.
- **Upstream compatibility**: no 007–011 change; reuses the existing `TargetVerification.method` FILE (product code) and safe-net's four layers (connect-guard extension, T606).

### B-2 — Signing authority and resolver placement (scenario A1 / N-1)
- **Blocker (verbatim)**: "A1 / FR-173 / N-1: resolver principal — Name `apps/api` as plan resolver and MAC-key holder; relocate T117/T119/T537; MAC the identity list and class; record an amendment request for the DB-role constraints on 007/008/009 tables".
- **Root cause**: 012 tasks placed plan resolution and `unit-mac.ts` in `apps/worker`, but 009 places the Plan Resolver in `apps/api` (`plan.md:59`); the MAC omitted identity list and class; DB-role constraints were unrecorded although FR-159 requires every gap recorded.
- **Trust boundary**: untrusted worker plane ↔ broker trust zone ↔ API plan resolver.
- **Mechanism (FR-173)**: the API Plan Resolver is the **sole signer** of `configuration.x012.unitMac` (HMAC-SHA-256, versioned `unitMacKey`, covering unit/plan/user/target/credential ref/grant ids/class/**identityRefs**/configuration digest/epoch/key version); **no key exists in any worker** (`worker.no-mac-key`); the broker verifies on every issue, reads grant/plan/scan/kill-switch/credential rows through its own role and treats `AdmissionLease` as a liveness fence only; anomaly rule; tasks relocated (T117/T119 → `apps/api/src/services/planning/security/`, T537 split into signer/verifier).
- **Owner / contract**: `credential-broker-contract` (1), `secrets-management-contract` (1, 3), data-model 4.3 unit stamp, plan D2.
- **Fail-closed**: stamp absent/invalid, key unavailable or unknown `keyVersion` ⇒ `SEC_BROKER_DENIED`.
- **Acceptance tests / tasks**: T610 (no key in worker), T611 (MAC coverage), T614 (DB roles), T536 (forged unit rows); implementation T612, T613, T615.
- **FR mapping**: FR-173, FR-032.
- **Residual (stated)**: a compromised worker can obtain leases only for MAC-valid, dispatchable units of real tenants during their live window; a compromised broker principal remains a named limitation.
- **Upstream compatibility**: **AR-13 (RECOMMENDED)** records the least-privilege DB-role model; no frozen document is edited; 009's resolver placement verified in `009 plan.md`.

### B-3 — Partial coverage and readiness (scenarios 35 / 49; N-6)
- **Blocker (verbatim)**: "Scenarios 35/49 / FR-186: score still passes readiness — Decision-level consumer requirements: readiness no-go and no certificate when `coverageComplete:false`; additive partial marker in `overallScore`; name the files (`apps/worker/src/readiness/verdict.ts`, scoring consumers); resolve the two-writer conflict on `ModuleResult(SECURITY)` (N-6); P13 decided".
- **Root cause**: the marker was persisted but consumers decide on the score alone (`verdict.ts:61` `pass: score >= threshold`); the audit task was a string lint; two writers on `ModuleResult(SECURITY)` (`persist.ts:165-172` and the 012 finalizer).
- **Trust boundary**: security-coverage truth ↔ every consumer that makes a pass/certificate/notification claim.
- **Mechanism (P13 owner-approved; FR-186, FR-188, FR-196, FR-189)**: tri-state persisted `coverageComplete`; `securityCoverageGate(area)`; **fail-closed readiness policy** — observed score preserved and shown, area `pass` requires `COMPLETE`, blocker `SECURITY_COVERAGE_INCOMPLETE`, `isReady=false`, certificate requires ready **and** COMPLETE, a `null` on a coverage-required scan (`Scan.capabilitySnapshot.x012.coverageRequired`) is INCOMPLETE; enumerated consumer files (readiness `verdict/run/diff`, `certificate/create`, routes, `master-report`, `export`, admin service, emails, web pages); additive `partialModules` in `overallScore()`; **single writer** (legacy persist guarded by `coverageComplete IS NULL`, 012 finalizer last writer recomputing over all SECURITY Issues, AND-merge); partial billing via `securityBillableWorkSummary`.
- **Compatibility impact on the readiness contract**: strictly additive over 001 FR-066..072 (new blocker class, optional response fields, certificate precondition; scans without 012 coverage and stored verdicts unchanged); SPEC 014 receives the marker as a mandatory input; no frozen document edited (AR-16).
- **Owner / contract**: `security-coverage-contract` (1–3), plan D16, data-model 2 (`ModuleResult`), M012-5c.
- **Fail-closed**: unknown/`null` on a required scan ⇒ INCOMPLETE ⇒ no go, no certificate.
- **Acceptance tests / tasks**: T620 (`readiness.security-partial-is-no-go`), T621 (certificate), T622 (null marker), T623 (additive overallScore), T624 (consumers carry fields), T630 (single writer), T632 (billing), T634 (consumer contract test); implementation T625–T629, T631, T633.
- **FR mapping**: FR-186, FR-188, FR-189, FR-196, FR-142.
- **Residual**: the observed score is still computed and displayed (owner-approved); F06 pricing/refund (AR-15) gates purchase of active/authenticated work.
- **Upstream compatibility**: additive only; existing product code (not frozen specs) changes.

### B-4 — Hostile-text cost (scenario A10)
- **Blocker (verbatim)**: "A10 / FR-174 — Mandate terminable worker-thread (or proven-linear) execution for all hostile-text parsing; extend the test beyond redaction".
- **Root cause**: a same-thread watchdog cannot preempt a running regex; the spec allowed worker threads as an alternative; the test covered redaction only.
- **Trust boundary**: target-controlled text ↔ the event loops that renew locks, leases and heartbeats.
- **Mechanism (FR-174)**: all processing of target-controlled text (redaction, every classifier, JSON shaping, OpenAPI) runs only in a **HostileTextExecutor** (`worker_threads`, `resourceLimits`, input cap, per-job hard timeout enforced by **terminating the thread**) in both child and parent; linear patterns additionally required.
- **Owner / contract**: `active-security-execution-contract` (3), `security-evidence-contract` (1).
- **Fail-closed**: terminated job ⇒ `{"_redactionFailed": true}` or `INCONCLUSIVE` `SEC_ANALYSIS_BUDGET_EXHAUSTED`.
- **Tests / tasks**: T640 (per classifier, event-loop lag < 100 ms); implementation T641.
- **FR mapping**: FR-174, FR-128, FR-084.
- **Residual**: pool saturation is bounded by input caps and per-unit limits; heuristic detectors keep false negatives.
- **Upstream compatibility**: none required.

### B-5 — Compromised child (scenarios A3 / 44; N-2)
- **Blocker (verbatim)**: "N-2 / A3: compromised child — Parent-minted single-use per-request permit, bound to unit/host:port/ordinal, enforced by the egress proxy".
- **Root cause**: a host-set-only proxy does not bind a socket write to parent admission; gate, F07, local budget and mutation intent were cooperative child behavior.
- **Trust boundary**: engine child (parses hostile responses) ↔ parent (admission authority) ↔ network.
- **Mechanism (FR-175)**: parent-hosted, **request-granular egress gate**; OS/container egress for the child denied except the gate; single-use permit `(unit, ordinal, method, host:port, path-digest, max bytes, expiry ≤ 10 s)` minted only after the full admission pipeline (FR-190); the gate **re-originates** the upstream connection (pinned address set, safe-net) and forwards opaque bytes; no/reused/mismatched permit or pipelined request ⇒ close; mutation permit only after durable `SENT`; parent death removes egress; mandatory feasibility spike before SG5 (opaque CONNECT tunnels rejected).
- **Owner / contract**: `active-security-execution-contract` (1), plan D7.
- **Fail-closed**: gate unavailable ⇒ no egress; invalid permit ⇒ `SEC_EGRESS_PERMIT_INVALID`.
- **Tests / tasks**: T651 (refusals), T652 (no direct egress), T655 (mutation permit); implementation T653, T654; spike T650.
- **FR mapping**: FR-175, FR-190, FR-120.
- **Residual**: feasibility with the chosen HTTP client unproven until T650; OS-level egress confinement is infrastructure-dependent (P11/SG7); a compromised child still holds the lease secret in memory.
- **Upstream compatibility**: none; extends safe-net (product code).

### B-6 — Lease status read (scenarios 13 / A2)
- **Blocker (verbatim)**: "13 / A2: lease status read — Fail closed on status-read error; drop the 'push flag'; add the '≤ 1 request after revoke' task and an error-path fixture; add the missing tasks in N-8".
- **Root cause**: the push flag cannot exist (broker egress is KMS+Postgres only); the status-read failure mode was unspecified; the named test had no task.
- **Trust boundary**: broker (credential custody) ↔ worker parent.
- **Mechanism (FR-039, FR-190)**: per-request `getLeaseStatus` (≤ 1 s) as a **permit-mint precondition**; error/timeout/non-ISSUED ⇒ no permit; **no push channel**; a complete **fail-closed matrix** covers the clock, consent/cool-off/environment reads, exact-value registry, local reserve, kill-switch/F07, address pin, broker status, ledger checkpoint and MAC key; parent-assigned ordinals and post-replay stop re-check (N-12).
- **Owner / contract**: `credential-broker-contract` (2), `active-security-execution-contract` (2).
- **Fail-closed**: every listed dependency failing ⇒ no permit with the closed reason.
- **Tests / tasks**: T660, T661, T663 (one fixture per row), T664 (`T-E14-replayed-granted-after-stop`); implementation T662, T664.
- **FR mapping**: FR-039, FR-190, FR-072.
- **Residual**: at most the in-flight request(s) already permitted follow a revoke; fail-closed reduces availability when the broker is unreachable.
- **Upstream compatibility**: none (F07 reasons passed verbatim).

### B-7 — Auth-attempt counter (scenario 18 / N-3)
- **Blocker (verbatim)**: "18 / N-3: attempt counter has no writer — Broker `reserveAuthAttempt`; count failures separately from successes".
- **Root cause**: the durable counter had no write path, a crashed unit lost the in-memory count, and counting successful logins starved legitimate runs.
- **Trust boundary**: customer test account ↔ Fahes login activity (lockout risk).
- **Mechanism (FR-191, FR-070, FR-187)**: broker `reserveAuthAttempt`/`resolveAuthAttempt`, atomic increment-and-check under a row lock, durable **before** the send; failure limit 3 (hard max 5), total ceiling 12 per 24 h, customer `lockoutThreshold`; `SUCCESS` resets failures; unresolved reservations count as failures after 2 min; `credentialSuspect`/lockout blocks.
- **Owner / contract**: `credential-broker-contract` (3), `test-identity-contract`, `auth-session-contract`, data-model 4.5.
- **Fail-closed**: reservation refused ⇒ `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS`.
- **Tests / tasks**: T670 (four tests), T672 (starvation); implementation T671.
- **FR mapping**: FR-191, FR-070, FR-074, FR-187.
- **Residual**: provisional numerics are uncalibrated (T523); a target with a lower lockout threshold depends on the customer declaring it.
- **Upstream compatibility**: F07 has no such dimension (AR-4 OPTIONAL stays local).

### B-8 — Consent (scenario A27 / N-4)
- **Blocker (verbatim)**: "A27 / N-4: FR-177 — Restate against the enforcement points that exist (plan, dispatch, broker issue, per-request); add dispatch/per-plan checks; record the amendment request that 007 grant creation cannot be gated".
- **Root cause**: FR-177 was stated against 007 `createAuthorization`, which 012 cannot change; uncredentialed `C1` probes did not read the record.
- **Trust boundary**: customer consent/attestation ↔ Fahes active testing.
- **Mechanism (FR-177, FR-190)**: consent is enforced at plan resolution, dispatch (incl. uncredentialed C1), broker issue, **every permit mint** and the mutation gate; version-matched and non-superseded; lookup error ⇒ `SEC_SCOPE_GATE_ERROR`; sensitive-class workflows require an interactive recorded confirmation and refuse non-interactive runs.
- **Owner / contract**: `security-scope-contract` (2, 5), `credential-broker-contract` (6).
- **Fail-closed**: missing/stale ⇒ `SEC_CONSENT_MISSING`; read error ⇒ `SEC_SCOPE_GATE_ERROR`.
- **Tests / tasks**: T680, T534; implementation T681, T535.
- **FR mapping**: FR-177, FR-190, FR-117, FR-005.
- **Residual**: the click-through attestation is customer-asserted; a grant can exist without a record but is unusable by 012.
- **Upstream compatibility**: **AR-14 (OPTIONAL)** records the missing 007 precondition hook; no amendment needed.

### B-9 — Duplicate findings (scenario 43 / N-7)
- **Blocker (verbatim)**: "43 / N-7: merge rule — Group-barrier materialization, or drop 'highest confidence wins by upsert' (009 is first-writer-wins)".
- **Root cause**: 009 `materializeFinding` is `createMany … skipDuplicates` (first writer wins); evaluation order decided the winner.
- **Mechanism (FR-141)**: **group barrier** — members record results, the finalizer materializes the group's Finding once with a deterministic winner (confidence, severity, lexicographic `checkId`) chosen before the call; losing members carry `mergedInto`; legacy duplicates are visible, not suppressed, during the parallel run.
- **Owner / contract**: `security-finding-contract`, `security-check-registry-contract` (`groupMaterialization` flag).
- **Tests / tasks**: T690; implementation T691.
- **Trust boundary**: finding identity ↔ the order in which concurrently evaluated checks resolve.
- **Fail-closed**: a group is materialized only after every member resolved; the sweep resolves unresolved members as `BLOCKED`/`NOT_TESTED`, so a group can neither hang nor materialize from a partial view.
- **FR mapping**: FR-141, FR-146, FR-147.
- **Residual**: legacy and 012 duplicates coexist until the legacy checks are retired.
- **Upstream compatibility**: relies only on 009's existing materialization behavior.

### B-10 — Operation declarations (scenario 24 / N-5)
- **Blocker (verbatim)**: "24 / N-5 — Entity and DTO for operation declarations (`readOnlyDeclared`, `fixtureConfined`, `protectedMarkerRef`)".
- **Root cause**: the declarations that enable active API probes had no entity, DTO or consent design; the contract still listed them as open.
- **Mechanism (FR-192, FR-007)**: `ApiOperationDeclaration` (tenant-owned, versioned, closed DTO under FR-182 conformance); `FIXTURE_CONFINED` needs fixture, marker ref and consent; undeclared ⇒ potentially mutating; declared-read-only probes stay bounded and a baseline-vs-probe marker change ends the check `INCONCLUSIVE` and flags the declaration.
- **Tests / tasks**: T700 (and T567/T568); implementation T701.
- **Trust boundary**: customer assertion about an operation ↔ Fahes sending active probes to the customer's endpoint.
- **Owner / contract**: `api-security-check-contract` (Blocker repairs 1), `security-scope-contract` (FR-007 classification), data-model 4.9C.
- **Fail-closed**: no current declaration ⇒ no active probe (`SEC_MUTATION_NOT_PERMITTED`); a baseline-vs-probe marker change ⇒ `INCONCLUSIVE` and the declaration is flagged.
- **FR mapping**: FR-192, FR-007, FR-182, FR-177.
- **Residual**: `READ_ONLY` is a customer assertion; a false declaration on staging could mutate staging state (stated).
- **Upstream compatibility**: none.

### B-11 — Restore detection (scenario A18 / N-14)
- **Blocker (verbatim)**: "A18 / N-14 — Automatic restore/rollback detection, not a runbook step".
- **Root cause**: the epoch bump was a runbook step; nothing detected a restore, PITR or replica failover.
- **Mechanism (FR-193, FR-179)**: monotonic `leaseSeq`; **signed ledger checkpoint** written to an external write-once store at every issue and ≥ every 60 s; before issue the broker verifies the database against the newest checkpoint; behind/divergent DB, unreachable/unverifiable store or bad signature ⇒ **restore quarantine** (no issues, units fail, leases revoked, counters exhausted) cleared only by dual-control `acknowledgeRestore` (bumps the epoch).
- **Owner / contract**: `credential-broker-contract` (4), data-model 4.3/§1.
- **Fail-closed**: `SEC_RESTORE_QUARANTINE`.
- **Tests / tasks**: T710; implementation T711; investigation T712 (store selection under P11).
- **Trust boundary**: database state ↔ an external signed checkpoint that survives a restore.
- **FR mapping**: FR-193, FR-179, FR-181.
- **Residual**: detection window = checkpoint interval; checkpoint-store outage reduces availability.
- **Upstream compatibility**: none; store selection deferred with P11.

### B-12 — Child stdio and crash output (scenario 9 / N-15)
- **Blocker (verbatim)**: "9 / N-15 — Child stdio and crash-output policy".
- **Root cause**: nothing governed the child's stdout/stderr/uncaught-exception output (undici errors can carry request options including `Authorization`).
- **Mechanism (FR-194)**: `stdio: ['ignore','ignore','ignore','ipc']`, minimal environment, handlers emit only a closed crash code; the parent logs only closed crash codes, exit code and signal; core dumps disabled (FR-180).
- **Tests / tasks**: T720; implementation T721.
- **Trust boundary**: engine child (parses hostile data) ↔ parent process, container logs, Sentry and BullMQ.
- **Owner / contract**: `active-security-execution-contract` (Blocker repairs 4), `security-evidence-contract` (2), `auth-session-contract`.
- **Fail-closed**: a child crash yields only a closed crash code; no raw error object, message or stack crosses to the parent; the unit ends rather than continuing with unknown state.
- **FR mapping**: FR-194, FR-180.
- **Residual**: exact-value scrubbing of transformed secrets (Part 5 #4 of the review) is unchanged.
- **Upstream compatibility**: none.

### B-13 — Dispatch ownership and grant consistency (A25 / N-9; R-1 / N-10)
- **Blocker (verbatim)**: "N-9, N-10 — CAS-first dispatch/finalize ownership; resolve two-grant vs same-grant-id contradiction".
- **Root cause**: the dispatch checkpoint and broker lease ran before the CAS, so a stale second host could finalize a live unit; the same-grant-id rule failed closed whenever two grants were used.
- **Mechanism (FR-195)**: `IdempotentClaim{sec-unit-host}` (resultRef = `hostInstanceId`) claimed **before** the dispatch checkpoint and the broker lease; conflict ⇒ `SEC_UNIT_HOST_CONFLICT`, stop, never finalize; the wrapper verifies ownership before `finalizeExecutionUnit`; never stale-reclaimed; the grant-consistency rule is **per class** (one grant: equal ids; two grants: different ids, both valid).
- **Tests / tasks**: T730 (`T-E14-double-dispatch`, finalize guard, per-class consistency); implementation T731.
- **Trust boundary**: concurrent worker hosts ↔ the single authority that may run and finalize one unit.
- **Owner / contract**: `active-security-execution-contract` (Blocker repairs 5), `security-scope-contract` (4), data-model §6 (`sec-unit-host`).
- **Fail-closed**: a conflicting claim ⇒ the second host stops and never finalizes (`SEC_UNIT_HOST_CONFLICT`); a mismatched per-class grant id ⇒ `SEC_SCOPE_GATE_ERROR`.
- **FR mapping**: FR-195, FR-161, FR-183.
- **Residual**: `attempts:1` — no takeover; recovery is the 009 sweep.
- **Upstream compatibility**: reuses 010's `IdempotentClaim` pattern; no 009 status change.

## Remaining originally WEAK/GAP scenarios — where each is addressed

| Scenario | Addressed by |
|---|---|
| 5 DNS rebinding | B-1 (T602) |
| 7 Third-party resource access (GAP) | B-1 |
| 9 Credential in worker logs | B-12 (T720) |
| 13 / A2 Secret revoked / TOCTOU | B-6 |
| 18 Account lockout | B-7 |
| 19 Login emails | T740 (`identity.login-requires-sink-attestation`) |
| 24 Real inventory | B-10 |
| 25 Real charge | FR-117 amendment: interactive recorded confirmation, non-interactive refusal (T680/T681); tripwire demoted to a backstop |
| 29 Rate-limit after sending | T744 + T028/T029 updated to atomic `reserve` |
| 35 / 49 Partial score | B-3 |
| 43 Duplicate findings | B-9 |
| A1 Broker confused deputy | B-2 |
| A3 Compromised child | B-5 |
| A7 Target cloaking | accepted limitation; required copy line + T745 |
| A10 ReDoS | B-4 |
| A18 Restore | B-11 |
| A27 Consent | B-8 |
| A28 Production mislabeled staging | accepted residual; B-1's address-control proof reduces mis-pointed probing; FR-176 cool-off/attestation unchanged |

## N-issues (not blockers) — dispositions

N-6 → B-3 (FR-196); N-7 → B-9; N-8/N-13 → Phase 17 implementing tasks (T740–T746) and updated T028/T029/T091/T097/T442/T534; N-9/N-10 → B-13; N-11 → stale-text sweep applied in contracts (response-derived ids, E15 replay line, empty `includedAccountRefs`, coverage marker location, `precheck/commit`, "at every checkpoint", counts); N-12 → FR-190; N-14 → B-11; N-15 → B-12; N-16 → FR-181 text and broker item 5; N-17 → FR-021 emergency single-operator path; N-18 → FR-172(d), T746. N-1…N-5 → B-2, B-5, B-7, B-8, B-10.

## Outstanding items (not blockers of the repairs)

1. Product approvals still missing: P4, P5, P6, P8, P9, P12, P14 and P16 (default NO).
2. Upstream dependencies: AR-13, AR-14, AR-15 (gates purchase of active/authenticated work), AR-16 note; 009 U-1 and 011 uncommitted (AR-8/AR-9); 011's `DEPENDENCY` payload untyped.
3. P11 deferred: KMS provider, broker hosting and the external checkpoint store (SG3, T522, T712).
4. Mandatory feasibility spike T650 (egress gate) before SG5.
5. The second independent review.
