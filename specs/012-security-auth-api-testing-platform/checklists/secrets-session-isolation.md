# Secrets and Session Isolation Checklist: Security / Authentication / Authorization / API / Business-Logic Testing Platform (SPEC 012)

**Purpose**: Credentials, brokered leases and authenticated sessions are isolated, bounded and destroyed on every exit path
**Created**: 2026-10-10 · **Re-scored**: 2026-10-11 after the analyze pass and the independent adversarial review repairs (no stale marks carried over)
**Feature**: [spec.md](../spec.md), [plan.md](../plan.md), [analyze-report.md](../analyze-report.md), [adversarial-review.md](../adversarial-review.md)

**Review Ownership**: reviewer-owned requirements-quality artifact. `[x]` means the criterion was verified against the package text (the check is named after each item); it does **not** mean implementation is complete or that a design is secure.
**Marker Semantics**: items needing owner judgment, upstream commits, an independent re-review or implementation evidence stay `[ ]` with the reason shown.

## Secrets at rest

- [x] CHK001 Credentials use envelope encryption (per-version data key, AES-256-GCM, KMS-wrapped KEK); no custom cryptography — _FR-016_
- [x] CHK002 Workers, API and AI hold no KEK or data key at rest; the shared env ENCRYPTION_KEY is not used — _FR-017_
- [x] CHK003 Secrets are write-only: no API returns plaintext, UI shows no secret-derived value — _FR-018_
- [x] CHK004 Versioning, rotation, expiry, revocation, crypto-shred deletion and retention are defined — _FR-019..023_
- [x] CHK005 Operators can revoke/disable but never read or create; destructive operator actions need dual control — _FR-021_
- [x] CHK006 Raw secrets never appear in ScanPlan, queue payload, logs, Evidence, Findings, AI prompts, reports — _FR-024_

## Broker and leases

- [x] CHK007 A separately deployed broker is the only unwrapper, justified by isolation — _FR-031_
- [x] CHK008 Broker re-validates unit, lease, plan, grant, environment, tenant, target, identity and kill switch from Postgres, never trusting the caller — _FR-032_
- [x] CHK009 Broker trust anchor does not rely on worker-writable rows (MAC stamp, security-definer writes, anomaly rule) — _FR-173_
- [x] CHK010 Delivery is memory-only over IPC; no disk, env, command line, queue, log or Redis — _FR-033_
- [x] CHK011 One lease per (version, unit, attempt); one ISSUED lease per identity — _FR-035; FR-181_
- [x] CHK012 Failure to authenticate (missing/expired/revoked/incorrect/rate-limited/MFA/invalid scope) is BLOCKED and never a PASS — _FR-036_
- [x] CHK013 Broker unavailable fails closed with no direct vault fallback — _FR-037_
- [x] CHK014 The API Plan Resolver is the sole signer of the unit MAC (covering identity list and class); no signing or verification key exists in any worker; the broker reads grant/plan/kill-switch rows itself — _FR-173; test worker.no-mac-key_
- [x] CHK015 A lease-status read precedes every request; error/timeout admits no request; there is no revoke-push channel — _FR-039_
- [x] CHK016 Authentication attempts are reserved atomically and durably before sending; failures are counted separately; unresolved reservations count as failures — _FR-191_
- [x] CHK017 Restore/rollback is detected automatically from a signed external ledger checkpoint and quarantines issuance — _FR-193_
- [x] CHK018 The child has no stdio and crash output is a closed code — _FR-194_

## Sessions

- [x] CHK019 Sessions are execution-local, bound to (unit, attempt, identity) and never mix tenants, environments, roles or scans — _FR-041/042_
- [x] CHK020 A session cannot outlive its grant; checked at every checkpoint — _FR-043_
- [x] CHK021 Teardown runs on every exit path and onUnitExpired returns TERMINATED only after lease destruction — _FR-045/052_
- [x] CHK022 Revocation is observed before each request (at most one in-flight request follows) — _FR-039_
- [x] CHK023 Restore epoch and account-deletion shred exist — _FR-179/167_
- [x] CHK024 MFA is never bypassed; unsupported modes are reported honestly — _FR-090_

## Open

- [ ] CHK025 A KMS/HSM provider is selected and the unwrap-only IAM and rotation drill have passed — _OPEN — UNKNOWN — REQUIRES INVESTIGATION; gate SG3, task T522_ **Class: activation-only gate (P11, T522).**
- [ ] CHK026 External security review of the broker has been performed — _OPEN — gate SG10, task T524_ **Class: activation-only gate (SG10, T524).**
- [ ] CHK027 KMS provider selection (P11) and the external checkpoint-store selection are resolved and drilled — _OPEN — P11 is DEFERRED by the owner until credential-broker activation (SG3, T522, T712)_ **Class: owner decision P11 (deferred) and activation gate (SG3).**

## Third repair pass (2026-10-14; author-checked planning text only, independent review pending)

- [x] CHK028 Auth attempts follow RESERVED -> SENT -> RESOLVED; an unsent attempt is never counted as a failed login; an unresolved SENT attempt is conservatively counted; release is idempotent — _FR-191, T670_
- [x] CHK029 Broker anomaly rules R1-R6 are keyed per worker principal and R7 is a tenant quota that never counts toward quarantine, with thresholds, windows, quarantine, audit events and fail-closed behaviour; spreading across tenants cannot evade them — _FR-173, T536_
- [x] CHK030 A checkpoint-store outage denies new issues, bounds existing leases to a 5-minute grace, then revokes and fails closed; recovery verifies before resuming — _FR-193, T710, T768_

## Fourth repair pass (2026-10-15; author-checked planning text only, independent re-review pending)

- [x] CHK031 The FR-201 database privilege boundary is a mandatory activation prerequisite (SG3/SG10) with a privilege-bypass suite; MAC validation alone is not claimed as the trust boundary — _FR-173, FR-201, T780-T783_
- [x] CHK032 Anomaly windows are durable rows shared by every replica; R6 counts integrity denials only; one non-terminal reservation per identity is enforced by a partial unique index and SENT rows count pessimistically — _FR-173, FR-191, T670, T784, T785_
- [ ] CHK033 FR-201 roles, functions and migration M012-7 are deployed and the privilege-bypass, replayed-historical-unit and multi-replica suites are green — _OPEN — activation evidence; requires the 007/008/009 implementation owners_ **Class: activation-only gate (FR-201 deployed; requires AR-13 and AR-19).**

## Fifth targeted repair (2026-10-15; author-checked planning text only, independent confirmation pending)

- [x] CHK034 Principals are authenticated (mTLS identity joined to `WorkerPrincipal`; `session_user` in the database functions); no caller-asserted `principalId`/`hostInstanceId` is trusted — _FR-173, FR-201, T816, T817_
- [x] CHK035 Anomaly enforcement is serialized by a fixed lock order (principal row, then tenant advisory lock) over durable events with idempotency keys; R7 caps a tenant across principals; the worker-compromise blast radius is stated accurately — _FR-173, T784-T785, T816_
- [x] CHK036 A worker principal exists only through `sec_register_worker_principal` (atomic `WorkerPrincipal` + `BrokerPrincipalState`), carries `servedClasses` that `sec_claim_unit_host` enforces, and the stated blast radius says the claim is class-scoped but not tenant-scoped — _FR-173, FR-201(b)(c), data-model 4.9H/4.9K, T824, T825_
- [x] CHK037 Quarantine uses a durable consecutive-breach-window streak updated under the principal row lock; R6 needs a minimum sample; all thresholds are labelled unmeasured starting values — _FR-173, data-model 4.9H, T824, T825_
- [ ] CHK038 Anomaly thresholds are calibrated from measured worker concurrency (T523) and the SG3 record cites the calibration — _OPEN — activation; gate SG3_ **Class: activation-only gate (T523 calibration).**
- [x] CHK039 R7 is a tenant quota: it denies the issue, writes no event, never counts as a breach or in R6 and never quarantines a principal; the single-tenant R3 availability residual is stated, and thresholds stay unmeasured and gated on T523 — _FR-173, data-model 4.9H, credential-broker item 7, T833, T834_
- [x] CHK040 Every worker-callable broker operation (issue, reserve, mark, resolve, release, status, confirm) is bound to the claim owner, the verified credential binding and the lease or reservation row; a compromised worker principal cannot exhaust another tenant's attempt allowance or revoke another tenant's lease — _FR-032, FR-173, FR-191, FR-201(f), credential-broker item 12, T837, T838_
- [x] CHK041 Vault state changes (rotate, revoke, disable, delete, revoke-all) have defined security-definer write paths for the owner and operator roles, so the insert-only API role and the no-read operator role can perform every FR-020/FR-021 transition — _data-model 4.10A, T841, T842_
- [x] CHK042 Worker reads and writes are claim-scoped security-definer functions that derive tenant, plan, target, grants and clock from the claimed unit and take no argument naming them; parent-derived records are written only by `fahes_sec_derive`; the 008 wrappers derive every identifier from the unit; the residual (a shared pool can still claim across tenants, bounded by CS1; isolation only in Mode S) is stated — _FR-173, FR-201(j), data-model 4.10A, 4.10C, 4.10D, T852 to T863_
- [ ] CHK043 The write and read confinement suite (T852, T854, T856, T858, T862) and the claim-bound 008 wrapper suite (T860) are green in the target deployment — _OPEN — activation evidence; gates SG3, SG10_ **Class: activation-only gate.**
- [x] CHK044 Every privileged function family (`sec_*`, `vault_*`, `sec_derive_*`, the 008 wrappers) is bound by twelve normative hardening requirements: fixed trusted `search_path`, qualified references, PUBLIC execute revoked, minimal grants, non-superuser NOBYPASSRLS NOLOGIN owners, NOINHERIT worker logins, no unsafe dynamic SQL, argument validation, no worker CREATE or TEMP, no escalation, closed error codes, catalog conformance check — _FR-201(k), data-model 4.10E, T865, T866_
- [ ] CHK045 The hardening suite and the catalog conformance check (T865, T866) are green in the target deployment, and the managed database offers non-superuser NOLOGIN function owners — _OPEN — activation evidence; gates SG3, SG10_ **Class: activation-only gate.**
- [x] CHK046 The Mode S tenant bound applies to `sec_peek_unit`, `sec_refuse_unclaimed_unit` and `sec_claim_unit_host`: tenant derived from the unit row, uniform denial identical to a nonexistent unit, no mutation, no F07 effect, platform-scope audit only; the claim check order is fixed in one place — _FR-201(c)(l), data-model 4.10D, T867, T868_
- [x] CHK047 The evidence-truthfulness boundary is stated: claim-scoped access gives provenance, not truth; a compromised claimant can cause false findings and false `NO_ISSUE_DETECTED` for the units it claims; captions are required on every surface; late legacy `Issue` rows are captioned and AR-21 states the exposure — _FR-173 residual (4), FR-188, FR-196(d), AR-21, T871, T872_
- [x] CHK048 The `sec-evaluate` queue is specified (closed schema, producer and consumer authority, idempotency, amplification limits, sweep predicate from the database, revalidation before every derived write) and Redis is never an authority — _data-model 4.10D, T869, T870_
- [ ] CHK049 The Mode S pre-claim suite, the evaluator queue suite and the claim-liveness suite (T867, T869, T873) are green in the target deployment — _OPEN — activation evidence; gate SG10_ **Class: activation-only gate.**
- [x] CHK050 The worst-case claim recovery delay is documented (SIGKILL deadline plus a sweep interval for `RUNNING`; remaining plan deadline up to 6 h for a pre-run crash), no takeover or retry is invented, and faster recovery is recorded as not requested — _data-model 4.10D, plan.md, T873, T874_
- [x] CHK051 The hosting-failure crash matrix covers seven cases (parent alive, crash before RUNNING, crash after RUNNING, host crash, broker unreachable, reconciler delayed, plan deadline) with authoritative deadline, responsible component, terminal outcome, lease and credential behavior, recovery bound and failure behavior, claims only bounds that a non-parent component enforces, and names the dependency on the absolute hard TTL, the child deadline, the broker lease expiry and the orphan reconciler — _FR-052, data-model 4.10F, T876_
- [ ] CHK052 The hosting-failure backstop (absolute hard TTL, execution-plane dead-man switch, orphan reconciler, measured reconciler service level) is approved upstream and implemented, and the crash suite is green in the target deployment — _OPEN — upstream amendment dependency AR-22, AR-8 and activation gate SG1, SG3; E14 and E15 activation blocked_ **Class: upstream amendment dependency and activation-only gate.**
- [x] CHK053 Pre-claim denials are returned structured results with one shape (no exception), the denial audit commits in the same transaction (no autonomous transaction or dblink), audit emission is bounded by durable per-principal database counters, audit fields hold no unit id, hash, tenant, scan or plan id, and abuse quarantines only the offending principal — _FR-201(l), data-model 4.9H, 4.9K, 4.10D, T878, T879_
- [x] CHK054 The evaluator queue has trusted producers only (orchestrator and evaluator), the worker hook is a no-op, no per-principal enqueue cap is claimed, per-plan dedupe, depth cap, retry, poison and overflow audit are specified, and Redis is never an authority — _data-model 4.10D, T869, T870, T880_
- [x] CHK055 The explicit CREATE, TEMP and schema-privilege revocation set (PUBLIC, worker logins, trusted schemas, temporary schema, managed-database restrictions) and its verification queries are specified as planned validation, not executed — _FR-201(k), data-model 4.10E.1, T881, T882_
- [x] CHK056 Principal derivation is defined for direct, session-pooled, transaction-pooled and proxied connections, trusts only `session_user`, never an application-supplied identifier, and fails closed when the principal cannot be established — _FR-201(m), data-model 4.10E.2, T881, T882_
- [ ] CHK057 The F1 to F6 suites (T876, T878, T880, T881) are green in the target deployment, including the privilege queries and the pooler paths actually used — _OPEN — activation evidence; gate SG3, SG10_ **Class: activation-only gate.**

## Notes

- Scores are mechanical-plus-reviewed as of 2026-10-11; any later edit to spec/plan/contracts requires re-running the generator checks (analyze2.py + this script) before trusting a mark.
- Unchecked items are not defects in the planning text; they are decisions, commits, reviews or implementation evidence that do not yet exist.
