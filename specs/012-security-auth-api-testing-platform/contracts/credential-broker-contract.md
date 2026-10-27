# Contract: Credential Broker (Context B/C — lease issuance, delivery, destruction)

Per FR-031 through FR-040, FR-024, FR-029, FR-035, FR-043, FR-052, FR-151. The only component that can unwrap a data key and
the only way a secret reaches a unit. Vault storage is `secrets-management-contract.md`; the in-unit session is
`auth-session-contract.md`. Planning only.

## Status / Ownership

Owner: SPEC 012, Context B (delivery side of F05). Separately deployed trust zone (`apps/credential-broker/`, plan.md D2),
justified by isolation (Principle VIII; the audited worker holds the app key and DB URL). Status: planning, not frozen;
hard prerequisite for any credential use (FR-040); gated by SG3 and SG10. Hosting, network topology and KMS provider are
`UNKNOWN — REQUIRES INVESTIGATION`.

## Consumers

1. E15 (`AUTHENTICATED_WORKFLOW`) and E14 (`ACTIVE_SECURITY`) worker **parent** processes (issue / confirm / revoke).
2. `SessionHost` in the engine child (`auth-session-contract.md`) — receives the secret over parent IPC.
3. 009 sweeper / `expirePlanUnits` via the engine `onUnitExpired` hook (`scan-deadline-contract.md` §Termination confirmation).
4. Reverify (`security-reverify-contract`) — fresh lease per reverify unit.
5. Secrets vault revoke paths (`secrets-management-contract.md`) — revoke-all calls `revokeLease`.

## Inputs

```text
issueCredentialLease(executionUnitId, purpose: LeasePurpose, attempt: int, testIdentityId) -> LeaseResult     // the worker principal is derived from the authenticated connection (FR-173, FR-201); it is never an argument
LeasePurpose = LOGIN | SESSION_REFRESH | API_AUTH        // closed (L23 P-6); single purpose per lease
```

The broker accepts only ids from the caller; it trusts **none** of the caller's claims about unit state, grant, tenant, target,
environment or identity (FR-032). Authentication: the worker principal authenticated by the mutual-auth channel and registered in `WorkerPrincipal` with its `servedClasses` (a database-enforced class bound on the claim, not a tenant bound; FR-173, FR-201).

## Outputs

```text
LeaseResult =
  | { ok: true, leaseId, credentialVersionId, kind, secretEnvelope /* in-memory over channel only */, expiresAt, pinnedVersion }
  | { ok: false, reason: SEC_* | upstream reason verbatim }   // unit state/class/stale lease/attempt/plan/deadline mismatch -> SEC_BROKER_DENIED (L11)
LeaseState = ISSUED | REVOKED | DESTROYED | EXPIRED       // durable ledger row: ids, timestamps, outcome; NEVER the secret
```

## Operations

```text
issueCredentialLease(...) -> LeaseResult
confirmLeaseDestroyed(leaseId, proof: {childExited: ParentObservedExit{pid, exitCode|signal, observedAt}}) -> {state: DESTROYED} | {state: REVOKED, pendingChild: true}   // the proof is produced only by the parent that forked the child; the jar lives in child memory, so disposal is established by the observed process exit; a child-reported value is never accepted
revokeLease(leaseId | credentialVersionId | referenceId | userId, reasonCode) -> n
```

### `issueCredentialLease` ordered steps (FR-032) — one transaction-consistent read against Postgres

1. Authenticate worker principal; resolve `executionUnitId` tenant-scoped from Postgres (never from the caller's claim).
2. Unit exists and status is **`RUNNING` only** (a `PLANNED`, `ADMITTED` or `DISPATCHED` unit is denied; the lease is requested after `RUNNING`, FR-195); class is `AUTHENTICATED_WORKFLOW` or `ACTIVE_SECURITY` (E14 only for the credentialed crafted request of the dual-class rule, FR-161); `attempt` equals the unit's current attempt. Any mismatch -> deny `SEC_BROKER_DENIED` (L11).
3. The unit's F07 lease is live: an unreleased, unexpired `AdmissionLease` row of the unit whose grant is among the unit's `grantIds` (the broker receives no holder token, so this is liveness evidence and never authority, FR-173; a missing, released or expired lease -> `SEC_BROKER_DENIED`); plan is `RESOLVED` and its deadline has not passed
   (009 U-1: `SCAN_DEADLINE_EXPIRED` / `SCAN_DEADLINE_INSUFFICIENT` verbatim); scan is non-terminal.
4. No kill switch pending for unit, scan, grant, target, tenant or platform scope (F07 `KillSwitchState` read) -> else deny `KILL_SWITCH_PENDING` verbatim.
5. The unit's grant is currently `ACTIVE`, unexpired, and lists the unit's class; Target environment (re-read **now**) is non-production (FR-029) -> else `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` / F01 reason verbatim.
6. **Binding (MA-03).** `configuration.x012.credentialBindings` is the sorted list `[{testIdentityId, credentialReferenceId}]` (ids only) and `credentialBindingRef` is the SHA-256 hex of its RFC 8785 canonical JSON; the broker recomputes the digest from the list and requires equality with the MAC-covered `credentialBindingRef` (mismatch -> `SEC_BROKER_DENIED`, integrity denial), and requires the set of `testIdentityId` in the list to equal the MAC-covered `identityRefs`. The requested `testIdentityId` must be a member of that list (else `SEC_IDENTITY_NOT_IN_SCOPE`, integrity denial: a worker asked for an identity its unit does not carry); the reference is **the list entry's** `credentialReferenceId`, never one the caller or the vault index chooses, and it must have `userId == unit.userId`, `targetId == unit.targetId`, `testIdentityId == requested identity`, state `ACTIVE`, `expiresAt` > now -> else `SEC_CREDENTIAL_MISSING` / `_EXPIRED` / `_REVOKED` / `_SCOPE_INVALID`.
7. The requested identity is within the grant's `includedAccountRefs` (if listed) and its `TestRole.key` within `includedRoles` (if listed) -> else `SEC_IDENTITY_NOT_IN_SCOPE`.
8. The credential kind is supported (`SEC_UNSUPPORTED_CREDENTIAL_KIND` otherwise); the identity count in the unit does not exceed 4 (FR-051).
9. Per-identity auth-attempt allowance not already exhausted and no lockout flag for that identity in this scan (`SEC_ACCOUNT_LOCKOUT_RISK`); recent rate-limit mark on the identity -> `SEC_CREDENTIAL_RATE_LIMITED`.
10. Pin the `ACTIVE` `CredentialVersion` id resolved **now** (version pinning; later rotation does not alter an issued lease).
11. Uniqueness: insert lease row with unique key `(credentialVersionId, executionUnitId, attempt)`; conflict -> deny `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED` (FR-035). Insert happens **before** unwrap.
12. Unwrap the DEK in KMS (AAD recomputed from row); decrypt in broker memory; set `expiresAt = min(now + 30 min, now + unit remaining (timeoutPolicyMs + hardStopMarginMs), grant expiresAt, reference expiresAt, plan deadline)` (cap = min(unit timeout + margin, 30 min), FR-033, L8); non-renewable, no re-lease.
13. Return the envelope over the authenticated channel to the worker **parent**; zeroize broker buffers; audit `LEASE_ISSUED` (ids only).

Any failed step denies with its reason and writes a denial audit row (FR-022). Steps 2-9 are re-run in full for every issue;
there is no lease cache.

### Delivery and memory handling (FR-033, FR-034)

- Transport: authenticated, tenant- and unit-bound channel (mTLS or equivalent; provider UNKNOWN) from broker to the owning
  worker's **parent** process. Parent hands to child over IPC; the secret exists only in parent/child process memory.
- Never written to disk, environment variables, command line, queue/Redis, logs, core dumps (disabled for the engine process
  group where the platform allows), progress events, Sentry, or AI prompts. The queue payload remains exactly `{executionUnitId}`.
- The child holds no DB connection and no KEK; the parent holds no longer-lived secret than the lease.
- Teardown zeroizes buffers best-effort (named limitation); the lease TTL is the real bound.

### Re-validation during a unit (FR-039)

The parent re-validates the lease **before every request** (FR-039, FR-190) through `getLeaseStatus` (see the pre-request liveness item below); the <= 5 s checkpoint cadence stays as the liveness loop. `broker.leaseStatus(leaseId)` returns
`ISSUED|REVOKED|EXPIRED|DESTROYED` (state only). Revocation/expiry causes the engine to tear down per `auth-session-contract.md`
and end the unit `COMPLETED` with the check verdict `BLOCKED` `SEC_CREDENTIAL_REVOKED` (or `SEC_CREDENTIAL_EXPIRED`), or `FAILED`
per 009 classification; never a new F07 `KillSwitchReason` (Clarifications).

### `confirmLeaseDestroyed` and teardown ordering vs lease release (009 U-1 gap)

1. Engine child: invalidate session locally, drop jars, exit (or the parent kills the child); the **parent** observes the process exit itself (FR-175).
2. Parent calls `confirmLeaseDestroyed(leaseId, proof)` with the parent-observed exit; the broker marks `DESTROYED` only when the observed exit matches the lease's bound child pid;
   otherwise `REVOKED` (secret already unusable; a re-issue is denied by triple uniqueness).
3. Only after step 2 returns `DESTROYED` may `onUnitExpired` return `TERMINATED`; on any doubt it returns `PENDING`, keeping the
   unit non-terminal and **keeping its F07 lease** (009 `scan-deadline-contract.md` §Termination confirmation).
4. The F07 lease is released by 009 finalization only after `TERMINATED`. Ordering is therefore:
   session dropped -> broker lease `DESTROYED` -> `onUnitExpired = TERMINATED` -> F07 lease release. A dead host is handled by the
   sweeper revoking leases of terminal/expired units (`revokeLease`) and `onUnitExpired` staying `PENDING` until the hosting-failure
   backstop (parent SIGKILL group + broker TTL) is proven; `TERMINATION_UNCONFIRMED` after `hardStopMarginMs` (verbatim) raises the operator alert.

## Invariants

1. The broker never trusts caller-supplied unit, tenant, target, environment, grant or identity data; all are re-read from Postgres per issue (FR-032).
2. Every lease is single-purpose, single-unit, single-attempt; `(credentialVersionId, executionUnitId, attempt)` is unique (FR-035).
3. A lease insert precedes unwrap; a denied issue never unwraps.
4. `expiresAt` never exceeds 30 minutes, the unit's remaining `timeoutPolicyMs + hardStopMarginMs`, grant expiry, reference expiry or plan deadline; leases are non-renewable.
5. The lease pins one `CredentialVersion`; rotation during a unit does not change the version in use (FR-036 note; US2 scenario 3).
6. The lease ledger and every audit/telemetry record contain ids, state and reason codes only — never URLs, headers, bodies, identity names, or secrets (FR-038).
7. The broker makes zero outbound connections to any target or customer host (FR-038); its egress allow-list is KMS and Postgres only.
8. No code path reads the vault directly for credential use other than via `issueCredentialLease`; broker unavailability never falls back to any other path (FR-037).
9. `confirmLeaseDestroyed` is idempotent; `DESTROYED` requires both proofs.
10. Grant revocation, credential revocation/expiry, reference disable, environment reclassification to PRODUCTION, kill switch, plan expiry each cause outstanding leases to read `REVOKED` on next status check at the latest (FR-039).
11. Failure to authenticate (any `SEC_CREDENTIAL_*`, MFA, lockout, rate limit) is always `BLOCKED`/`INCONCLUSIVE`, never `NO_ISSUE_DETECTED` (FR-036).
12. **Every worker-callable operation is bound to the claim owner (MA-01).** `issueCredentialLease`, `reserveAuthAttempt`, `markAuthAttemptSent`, `resolveAuthAttempt`, `releaseAuthAttempt`, `getLeaseStatus` and `confirmLeaseDestroyed` each verify, in the operation's own transaction, the principal derived from the connection against the unit's `UnitDispatchRecord`, the unit status, the identity's membership in the unit's binding and the existence of the lease or reservation row (consolidated item 12); no argument names a tenant, a principal or a status; the broker-facing database functions are hardened per data-model 4.10E (IC-1).

## Safety & Authorization

- **F01**: the broker is a *defender* re-check, not a replacement: it reads grant state, class listing, environment and
  account/role lists itself (account/role enforcement is 012-owned, see `security-scope-contract.md` named limitation). It does not
  call `isAuthorized` for a destination (it has none); the engine's `safetyCheckpoint` still runs for every request.
- **F07**: the broker reads F07 lease/kill-switch state but does not admit, charge or release; issuing a lease consumes no F07
  budget and does not extend any F07 lease. `LOGIN_ATTEMPT` is the first F07 request unit (FR-028).
- **Production**: step 5 denies PRODUCTION/unclassified (FR-029, FR-078); a credential is dead for the unit the moment the Target is reclassified.
- **Trust zone / network rules**: the broker runs in its own zone; inbound only from worker principals and the API control-plane;
  outbound only to KMS and Postgres; workers have no route to KMS or vault tables; the child process has no route to the broker.
- **Telemetry without secrets**: metrics/log fields limited to `leaseId`, `unitId`, `credentialVersionId`, `kind`, `outcome`,
  `reason`, durations. Request bodies and decrypted buffers are never logged; redactor with exact-value registry wraps broker logging.
- **Rotation during scan**: a rotation (new `ACTIVE` version) does not affect issued leases; units that start after rotation pin the new version; Evidence records the version id.
- **Revocation during workflow**: next checkpoint detects `REVOKED`, session is dropped, remaining steps are `BLOCKED` `SEC_CREDENTIAL_REVOKED`; completed steps' evidence is kept but the check cannot be `NO_ISSUE_DETECTED` for unexecuted steps.
- **Grant expiry**: step 5 and the 5-second lease status check make lease life <= grant life (FR-043).

## Failure states

| Condition | Verdict / status | Reason |
|-----------|------------------|--------|
| Broker unreachable / timeout (lease requested after `RUNNING`) | unit `COMPLETED` through `sec_finalize_unit`, dependent checks `BLOCKED` before any credentialed request; fail closed | `SEC_BROKER_UNAVAILABLE` |
| No reference / not tenant's | `BLOCKED` | `SEC_CREDENTIAL_MISSING` |
| Reference or lease expired | `BLOCKED` | `SEC_CREDENTIAL_EXPIRED` |
| Revoked / disabled / deleted (before or during unit) | `BLOCKED` | `SEC_CREDENTIAL_REVOKED` |
| Wrong tenant/target/environment for the credential, AAD failure | `BLOCKED` | `SEC_CREDENTIAL_SCOPE_INVALID` |
| Unit state not `RUNNING`, wrong unit class, missing/released/expired F07 lease, plan or deadline mismatch, attempt mismatch, caller is not the unit's claim owner, requested identity not in the unit's binding | `BLOCKED` | `SEC_BROKER_DENIED` (or `SEC_IDENTITY_NOT_IN_SCOPE` for the identity case) |
| Target rejected the credential on first login | `BLOCKED` | `SEC_CREDENTIAL_REJECTED` |
| Target 429 / auth rate limit | `BLOCKED` | `SEC_CREDENTIAL_RATE_LIMITED` (and `SEC_RATE_LIMIT_ENCOUNTERED` for the endpoint) |
| Lockout signal | `BLOCKED` | `SEC_ACCOUNT_LOCKOUT_RISK` |
| MFA challenge in an unsupported mode | `BLOCKED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` |
| MFA window timed out (>120 s) | `BLOCKED` | `SEC_MFA_TIMEOUT` |
| Identity outside grant allow-list | `BLOCKED` | `SEC_IDENTITY_NOT_IN_SCOPE` |
| Unsupported credential kind | `UNSUPPORTED` | `SEC_UNSUPPORTED_CREDENTIAL_KIND` |
| Second issue for same triple | `BLOCKED` | `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED` |
| PRODUCTION / unclassified Target | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Grant revoked/expired/class missing | `BLOCKED` | F01 `REVOKED` / `EXPIRED` / `NO_MATCHING_GRANT` verbatim |
| Kill switch pending | unit stop per 009/F07 | `KILL_SWITCH_PENDING` verbatim |
| Plan deadline passed | refused per 009 | `SCAN_DEADLINE_EXPIRED` verbatim |
| Teardown unconfirmed | `onUnitExpired` = `PENDING`; after margin `FAILED` | `TERMINATION_UNCONFIRMED` verbatim |

## Idempotency & retry

Issue is idempotent only in the sense that the triple is unique: a repeat issue for the same triple is **denied**, not replayed
(prevents replay after crash). Recovery of a crashed unit obtains a new `attempt` only where 009 idempotence is proven; because
active/authenticated units default to `maxAttempts: 1` (FR-057), a crashed unit is not re-run and its lease is revoked by the
sweeper (named interaction: FR-035's "new attempt" path is effectively unused in v1). `confirmLeaseDestroyed` and `revokeLease` are idempotent. The worker never retries issue in a loop; one retry of a transport failure is allowed only
before the ledger row exists (triple still free) and counts toward no F07 budget.

## Evidence

Lease ledger row (durable, no secret): `{leaseId, credentialVersionId, executionUnitId, attempt, purpose, issuedAt, expiresAt, state, destroyedAt?, denialReason?}`.
Unit Evidence (`AUTH_STATE_TRANSITION`, `SECURITY_CHECK_RESULT`) records `credentialVersionId` and `leaseId`, never values. Audit: `AuditLogEntry`
and redacted `payload` on existing 008 `ExecutionAuditEventType` values (FR-022); issue/deny/destroy/revoke each audited.

## Budgets/limits

**F07-authoritative**: none consumed by the broker. **LOCAL**: lease <= min(unit `timeoutPolicyMs + hardStopMarginMs`, 30 minutes); <= 4 identities/leases per unit; issue rate
per tenant (provisional 20/minute); auth attempts per identity: rolling 24 h window, effective failure limit 3 (hard max 5), ceiling 12 SENT attempts, reserved through `AuthAttemptReservation` (FR-191) so a
crash-restart cannot reset it; status-check cadence <= 5 s; broker request timeout 5 s (provisional).

## Reverify

Each reverify unit obtains a **fresh** lease through the full checklist (FR-151): re-validates reference existence, expiry, revocation,
version, environment, grant, account/role lists; pins the version current at reverify start; a lease from the original scan is never reused.
Failure maps to reverify `INCONCLUSIVE` with the closed credential reason (FR-153).

## Boundary rules (MUST NOT)

1. MUST NOT unwrap before the full checklist and the unique-lease insert pass.
2. MUST NOT return or log secret material outside the single authenticated delivery to the worker parent.
3. MUST NOT deliver to a child process directly, nor write secrets to disk, env, command line, queue, Redis or logs.
4. MUST NOT renew a lease past the unit, grant, reference or 30-minute bound, and MUST NOT re-lease within a unit.
5. MUST NOT make outbound requests to targets or any customer host.
6. MUST NOT fall back to a direct vault read when unavailable.
7. MUST NOT issue a second lease for the same `(credentialVersionId, executionUnitId, attempt)`.
8. MUST NOT trust or cache caller claims, prior checklist results, or a previous issue's validation.
9. MUST NOT add an F07 `KillSwitchReason` or `ExecutionAuditEventType` value; revocation maps to local stop.
10. MUST NOT map any credential failure to a passing verdict.
11. MUST NOT issue a lease to a Guest, sandbox runner, API process or AI layer.

## Named limitations

- Parent/child memory zeroization is best-effort (FR-034).
- Between a revocation and the next checkpoint (<= 5 s) the child may still hold the secret and may complete one in-flight request (008 FR-014 limitation).
- The broker can only confirm destruction on the engine's proof plus its own state; a host that dies with a live server-side session cannot be proven clean (`SEC_SESSION_NOT_SERVER_INVALIDATED`, `auth-session-contract.md`).
- Broker availability becomes a dependency of all credentialed checks (fail-closed by design).
- The lease cap is min(unit `timeoutPolicyMs + hardStopMarginMs`, 30 min) (L8); because a lease is issued after setup, a workflow that outlives its lease ends its remaining checks `BLOCKED` `SEC_CREDENTIAL_EXPIRED` and is never re-leased (FR-033).

## FR traceability

FR-024, FR-029, FR-031, FR-032, FR-033, FR-034, FR-035, FR-036, FR-037, FR-038, FR-039, FR-040, FR-043 (lease-vs-grant bound), FR-051, FR-052 (via `confirmLeaseDestroyed`), FR-057 (maxAttempts 1), FR-151; FR-161 (E14 credentialed crafted units lease like any unit); FR-167 (account deletion calls `revokeLease(userId)` before shred); FR-173, FR-195, FR-201 (authenticated principals, issue only for a `RUNNING` unit, durable anomaly state), FR-191 and FR-201(f) (operation binding to the claim owner, MA-01).

## Acceptance tests required (named, deterministic, fixture-based; not executed now)

- `broker.checklist.each-denial`: one fixture per checklist step 2-9 -> exact reason, zero unwrap calls (fake KMS call counter = 0).
- `broker.cross-tenant`: unit of tenant A referencing tenant B reference -> `SEC_CREDENTIAL_SCOPE_INVALID`.
- `broker.cross-target-env`: reference for target X used by unit of target Y; target reclassified PRODUCTION -> denied.
- `broker.wrong-unit-state`: unit not `RUNNING`/terminal, wrong class, other-principal dispatch record, missing or released F07 lease, attempt mismatch -> `SEC_BROKER_DENIED`.
- `broker.lease-uniqueness`: concurrent double issue -> exactly one `ok`, other `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED`.
- `broker.version-pinning`: rotate during unit -> in-flight lease unchanged; next unit pins new version; Evidence holds version id only.
- `broker.revoke-during-workflow`: revoke at step N -> detected <= 5 s, session dropped, later steps `BLOCKED`, no PASS.
- `broker.grant-expiry-bound`: lease `expiresAt` <= grant expiry; grant expiring mid-run -> lease `REVOKED`.
- `broker.unavailable-fail-closed`: broker down -> `SEC_BROKER_UNAVAILABLE`, zero credentialed requests, no vault read attempted.
- `broker.no-secret-leak`: scan ledger, audit, logs, metrics, queue payload, Evidence, IPC non-secret messages for the secret value -> zero hits (`SC-001`).
- `broker.no-outbound`: network sandbox test shows broker egress only to KMS/Postgres.
- `broker.destroy-ordering`: `onUnitExpired` returns `PENDING` until `confirmLeaseDestroyed` = `DESTROYED`; F07 lease released only after `TERMINATED`.
- `broker.crash-recovery-sweep`: killed host -> sweeper revokes lease; no re-issue for same triple.
- `broker.auth-attempt-counter-durable`: restart does not reset attempts; the 4th failure in the 24 h window is denied (effective failure limit 3, FR-191).
- `broker.failure-never-pass`: each `SEC_CREDENTIAL_*` and MFA fixture yields a non-PASS verdict.

## Resolved additions

1. Lease expiry vs workflow length: **L8 / FR-033 / P12** - cap = min(unit timeout + margin, 30 min); no re-lease; expiry ends remaining checks `BLOCKED` `SEC_CREDENTIAL_EXPIRED`. Step 12, invariant 4, budgets, boundary rule 4 updated.
2. Distinct code for unit state/class/stale lease/attempt mismatch: **L11** - `SEC_BROKER_DENIED` (replaces `SEC_CREDENTIAL_SCOPE_INVALID` for those cases; scope-invalid retained for tenant/target/environment/AAD). Steps 2-3, failure table and test updated.
3. FR-035 vs FR-057 new-attempt path: **L26** - stated as unused in v1 in FR-035; Idempotency section already conforms.
4. Lease purpose set: **L23 P-6** - `LOGIN`, `SESSION_REFRESH`, `API_AUTH`.

## Open for closure

No item is open. FR-032 now lists accounts and roles; role semantics are FR-011/FR-012 (`TestRole.key` in `includedRoles`), so this is not an owner decision.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Lease uniqueness and purpose (F-13)**: exactly one lease exists per `(credentialVersionId, executionUnitId, attempt)`; `purpose` is an informational tag; refresh and API use reuse the in-memory secret. The issue transaction **pins the version before inserting the lease row** (steps 10 and 11 are swapped).
2. **One active lease per identity (G-19, FR-181)**: a second concurrent `ISSUED` lease for a `TestIdentity` is denied `SEC_CREDENTIAL_LEASE_BUSY` (partial unique index); ordering edges serialize E15 then E14 units. Test `broker.identity-lease-exclusive`.
3. **Time and restore (G-14/G-15, FR-178/FR-179)**: expiry computed on the database clock; each lease carries `platformEpoch`; after a restore the epoch is bumped, all non-terminal units fail, all leases are revoked and counters are reconstructed as exhausted. Test `broker.post-restore-quarantine`.
4. **Ledger names and caps (F-39)**: the lease ledger columns are `status` and `endReason` (data-model §4.3); the lease `expiresAt` cap is the minimum of the unit's remaining `timeoutPolicyMs + hardStopMarginMs`, 30 minutes, the grant expiry, the credential version expiry and the plan deadline.
5. **Expired-`ISSUED` lease (N-16, FR-181).** The issue transaction treats an `ISSUED` lease with `expiresAt` earlier than the database clock as `EXPIRED` and marks it, so a dead lease never blocks the identity.
6. **Emergency path (N-17, FR-021).** Single-operator `disable`/`revoke` for ONE tenant (audited, alerting); dual control stays mandatory for tenant-wide and KEK operations.
7. **Trust anchor, signing, database isolation, authenticated principals and anomaly rules (FR-173, FR-201).** Issue step 0: verify `configuration.x012.unitMac` (HMAC-SHA-256 over `(unitId, scanPlanId, userId, targetId, credentialBindingRef, grantIds, executionUnitClass, identityRefs, configurationDigest, inputsRootDigest, platformEpoch, keyVersion)`) under the versioned `unitMacKey`; the API Plan Resolver is the sole signer and no key exists in any worker process/env/image (`worker.no-mac-key`); absent/invalid stamp, unavailable key or unknown version => `SEC_BROKER_DENIED`. **MAC validation is not the complete trust boundary.** The broker derives the **principal from the authenticated connection** (mTLS/workload identity joined to `WorkerPrincipal`); a `principalId` or `hostInstanceId` supplied as a request argument is ignored and, when it differs, denied as an integrity denial. Through its own role the broker verifies the dispatch facts that only `sec_claim_unit_host` can write: the unit is `RUNNING` (leases are issued after `RUNNING`), its `UnitDispatchRecord.principalId` equals the authenticated principal, `dispatchedAt` is inside the lease window, `dispatchSeq` was not seen before, scan and plan are non-terminal and before deadline, and `(unitId, attempt)` has no earlier lease; a historical, terminal, already-leased or other-principal unit is denied. These checks are meaningful only if `fahes_worker_exec` cannot write those fields: the FR-201 privilege boundary (AR-13) is a **mandatory activation prerequisite** (SG3/SG10); without it the broker refuses to issue. **Anomaly enforcement is atomic across replicas**: each issue and each integrity denial runs in a transaction that locks the principal's `BrokerPrincipalState` row (`FOR UPDATE`), then takes the tenant advisory lock (lock order is always principal, then tenant), reads the windows from `BrokerPrincipalIssueEvent`, evaluates R1-R7 and inserts the event (unique keys make retries idempotent); a deadlock or serialization failure retries and never grants; integrity denials are written by a second short transaction with the same locks in the same order. Rules (**every threshold, window and count is an unmeasured design starting value, not a calibrated one**; T523 must derive them from measured concurrency and the SG3 record must cite the calibration): R1 > 5 distinct tenants from one principal in 10 min; R2 > 20 distinct credential references from one principal in 10 min; R3 > 30 issues/min from one principal; R4 a unit whose dispatch record names another principal; R5 a unit created after its plan's `resolvedAt`; R6 integrity-deny ratio > 50 % over 5 min, evaluated only when the window holds at least 10 events (issues plus integrity denials; tenant-attributable denials and R7 quota denials are never counted); R7 is a **tenant quota, not principal-misbehavior evidence**: > 5 distinct references for one tenant from one principal, or > 8 for that tenant across all principals, in 10 min denies the issue (`SEC_BROKER_DENIED`, detail `TENANT_QUOTA`, audit `broker.tenant_quota.deny`) and is not an integrity denial, not a breach, never changes the streak, is not counted in R6, writes no event row and never quarantines a principal; it caps one tenant at 5 distinct references per principal, so one tenant alone cannot reach R2 or R1 (a sustained single-tenant burst above R3 on one principal can still breach R3: a stated availability residual, bounded by queue concurrency and cleared by the operator). Response: deny and alert (`broker.anomaly.deny`); quarantine uses durable counters in `BrokerPrincipalState`: a breach is an R1/R2/R3 or R4/R5 denial or an R6 trip (never an R7 denial), a breach window is a tumbling 10-minute bucket `floor(epoch s / 600)`, `breachStreak`/`lastBreachBucket` are updated in the principal-locked transaction (same bucket: unchanged; previous bucket: +1; otherwise 1), and a streak of 3 quarantines the principal (`broker.principal.quarantine`) until an operator `clearPrincipal` (audited; resets the streak). A principal without a `BrokerPrincipalState` row (created together with its `WorkerPrincipal` row by `sec_register_worker_principal`) is refused as a registration error. **Residual blast radius (true only with FR-201)**: a compromised worker instance, as its own principal, can claim any live non-terminal unit of any tenant whose class is in its registered `servedClasses` (`sec_claim_unit_host` enforces the class and is not tenant-scoped), drive it through the guarded edges and lease for it, at most at the R1-R3 rates and the R7 tenant cap, each lease for at most min(unit remaining time, 30 minutes); it then holds that tenant's secret for the lease's life and can exfiltrate or use it directly; N compromised instances multiply the rates by N until quarantined; it cannot lease for terminal, historical, already-leased, outside-`servedClasses` or other-principal units, cannot impersonate another principal, and can deny service by claiming units. Through the claim it can also finalize those units (a closed, host-asserted refusal, or after `RUNNING` a completion or failure) and block their direct dependents, limited to units it claimed; without a claim it can only refuse `PLANNED` units of its served classes for the four database-verified step-0 reasons (`sec_refuse_unclaimed_unit`) and cannot call the sweep. The claim-spread rule CS1, the `servedTenantIds` tenant bound and the write and read confinement are in FR-173, FR-201(j) and data-model 4.10D. Tests: `broker.forged-unit-rows`, `worker.no-mac-key`, `broker.db-privilege-bypass-denied`, `broker.replayed-historical-unit-denied`, `broker.principal-asserted-argument-rejected`, `broker.principal-impersonation-refused`, `broker.concurrent-issue-same-principal-serializes`, `broker.concurrent-issue-two-replicas-single-window`, `broker.concurrent-issue-same-tenant-across-principals-r7`, `broker.lock-order-deadlock-retry-never-grants`, `broker.restart-keeps-window-and-quarantine`, `broker.integrity-deny-idempotent`, `broker.anomaly.cross-tenant-spread`, `broker.anomaly.per-principal-quarantine`, `broker.anomaly.tenant-induced-denials-not-counted`, `broker.r7-quota-denial-not-a-breach`, `broker.r7-quota-never-quarantines-principal`, `broker.r7-quota-excluded-from-r6-and-r1-r3`, `broker.single-tenant-burst-r3-residual-documented`, `broker.anomaly.false-positive-burst-cleared`, `broker.anomaly.fail-closed-when-state-unreadable`, `db.session-user-principal-binding`, `broker.principal-without-state-row-refused`, `broker.breach-streak-durable-across-restart`, `broker.breach-streak-concurrent-update-single-count`, `broker.r6-minimum-sample-not-tripped-by-one-denial`, `db.claim-class-not-served-refused`.
8. **Auth-attempt reservations (FR-191).** `AuthAttemptReservation` states RESERVED -> SENT -> RESOLVED(SUCCESS | FAILURE | UNRESOLVED_AS_FAILURE) and RESERVED -> RELEASED; operations `reserveAuthAttempt` (atomic under a row lock on the identity; first lazily resolves rows older than 2 minutes; refuses `SEC_BUDGET_LOCAL_AUTH_ATTEMPTS` when the **effective failure count** (`authFailureCount` plus non-terminal SENT reservations, pessimistic) reaches 3 (hard max 5), SENT attempts reach 12, `lockoutSignalAt`/`credentialSuspectAt` is set, a next attempt on the effective count would reach the customer's `lockoutThreshold`, or a fresh non-terminal reservation of another unit exists (detail `PENDING_ATTEMPT`)), `markAuthAttemptSent` (immediately before the gate's first byte; fails if RELEASED/expired), `resolveAuthAttempt` (first terminal outcome wins), `releaseAuthAttempt` (only before SENT), all idempotent on `(identityId, executionUnitId, attempt, ordinal)`. At most one non-terminal row per identity is enforced by the partial unique index `UNIQUE (testIdentityId) WHERE state IN ('RESERVED','SENT')`. An unsent attempt is never counted as a failed login; a SENT attempt unresolved after 2 minutes is resolved `UNRESOLVED_AS_FAILURE`; restore resolves all non-terminal reservations `UNRESOLVED_AS_FAILURE`. Tests: `broker.reserve-atomic-under-concurrency`, `broker.unsent-not-counted-as-failure`, `broker.release-idempotent`, `broker.sent-unresolved-conservative`, `broker.pending-sent-counts-pessimistically`, `broker.second-reservation-refused-by-unique-index`, `broker.crashed-unit-sent-row-blocks-then-sweeps`, `broker.duplicate-reserve-returns-existing`, `broker.success-not-counted-as-failure`, `broker.attempts-across-scans`.
9. **Issue-time checks (FR-172, FR-176, FR-177, FR-197).** Issue checks the current `SecurityConsentRecord` (including the origin-ownership warranty), a current `ActiveTestingEnablement`, a `PROVEN` `TargetAddressProof` <= 24 h, the environment cool-off, `credentialSuspect` and the attempt window; consent missing => `SEC_CONSENT_MISSING`, enablement missing => `SEC_DESTINATION_AUTHORIZATION_UNMET`, any read error => `SEC_BROKER_DENIED` (fail closed).
10. **Restore detection and checkpoint-store outage (FR-193).** `writeLedgerCheckpoint()` (at every issue and at least every 60 s) and `verifyLedgerCheckpoint()` (before every issue) against the signed checkpoint `(platformEpoch, maxLeaseSeq, ledgerDigest, dbSystemIdentifier, issuedAt)` in an external write-once store; a database behind or divergent, or a bad signature => restore quarantine (`SEC_RESTORE_QUARANTINE`): no issues, all non-terminal units fail, all leases `REVOKED`, counters exhausted, cleared only by `acknowledgeRestore(operatorA, operatorB)` which bumps `platformEpoch`. Store outage: new issues denied immediately; existing leases continue only while the last successful checkpoint verification is <= 5 minutes old (grace G, provisional); after G the broker revokes every `ISSUED` lease and admission fails closed (`SEC_BROKER_UNAVAILABLE`); on recovery the database is verified against the newest checkpoint: consistent => issuing resumes (failed units and revoked leases stay terminal, nothing resumes automatically), inconsistent => quarantine. Detection window = checkpoint interval (stated limitation). Tests: `broker.post-restore-quarantine`, `broker.checkpoint-outage-grace-then-revoke`, `broker.checkpoint-recovery-consistent-resumes`, `broker.checkpoint-recovery-inconsistent-quarantines`.
11. **Pre-request liveness (FR-039, FR-190).** `getLeaseStatus(leaseId, executionUnitId) -> ISSUED | REVOKED | EXPIRED | DESTROYED` is a Phase A read before every request (timeout 1 s; error/timeout/non-`ISSUED` admits nothing: `SEC_BROKER_UNAVAILABLE` or the lease reason). There is no revoke-push channel; at most the in-flight request(s) already admitted (<= the unit's in-flight limit, plus the Phase A to C window) follow a revoke commit. Tests `broker.revoke-during-workflow`, `broker.status-read-error`.
12. **Authorization of every worker-callable operation (MA-01; FR-173, FR-191, FR-201).** The issue checklist (steps 1-13) authenticates the principal and binds it to the unit; the other six worker-callable operations previously named only their arguments, which let a compromised worker principal, using its own valid mTLS identity, name **another tenant's** identity or lease: `reserveAuthAttempt` plus `markAuthAttemptSent` plus `resolveAuthAttempt(FAILURE)` three times would exhaust a victim identity's rolling attempt allowance for 24 h (a cross-tenant denial of service outside the claim-bounded residual), and `confirmLeaseDestroyed` with a forged proof would flip a victim's `ISSUED` lease to `REVOKED`. Rule: for each operation the broker derives the principal from the connection and, **in the same transaction**, requires all of: (a) the unit (named by the operation, or the unit of the lease or reservation row it names) has a `UnitDispatchRecord` for the operation's `attempt` whose `principalId` equals the authenticated principal; (b) the unit's status is `RUNNING` for `issueCredentialLease`, `reserveAuthAttempt` and `markAuthAttemptSent`, and `RUNNING` or terminal-with-the-resource-still-open for `resolveAuthAttempt`, `releaseAuthAttempt`, `getLeaseStatus` and `confirmLeaseDestroyed` (so teardown after a kill still works); (c) the identity named is a member of the unit's verified binding (item-6 digest check) and a lease or reservation row for `(identity, unit, attempt)` exists and is in a state the operation may act on; (d) tenant and target are read from the unit row, never from an argument; (e) for `confirmLeaseDestroyed`, the proof is the parent-observed exit of the child pid recorded when the lease was issued (never a child-supplied field). Any failure is `SEC_BROKER_DENIED`, changes no state, and is recorded as an `INTEGRITY_DENY` (the R4 class, counted in R6 and in the breach rules of FR-173). Sweeper, expiry and lazy-resolution paths (`revokeLease`, `reserveAuthAttempt`'s resolution of rows older than 2 minutes, `expireSweep`) and the operator routes run inside the broker or under operator roles and have no worker-callable entry. **Residual (stated)**: with this rule a compromised principal can drive reservations, sends and leases only for identities of units it has claimed, which is inside the existing claim blast radius (FR-173); it cannot reach another unit's identity or lease. Tests: `broker.op-foreign-unit-denied` (each of the six operations against a unit claimed by another principal), `broker.reserve-foreign-identity-denied`, `broker.reserve-identity-outside-binding-denied`, `broker.mark-sent-foreign-reservation-denied`, `broker.resolve-foreign-reservation-denied-no-counter-change`, `broker.status-foreign-lease-denied`, `broker.confirm-destroyed-foreign-lease-denied-no-state-change`, `broker.confirm-destroyed-proof-not-parent-observed-denied`, `broker.op-denial-recorded-as-integrity-deny`, `broker.binding-digest-mismatch-denied`, `broker.requested-identity-not-in-binding-denied`, `broker.binding-identity-set-equals-identity-refs`, `broker.sweeper-ops-not-worker-callable`.
