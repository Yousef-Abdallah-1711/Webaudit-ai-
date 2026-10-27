# Quickstart: Validating the SPEC 012 Planning Package and a Future Implementation

This feature produces no running system, so there is no "run the app" quickstart. This is a validation guide in the style of 006, 007, 009 and 011. Part A explains the planning package and how to read it. Part B is the downstream-validation checklist (for SPEC 013/014 authors and for implementers). Part C outlines operator runbooks. Part D is a fixtures-only local validation recipe for a future implementer. **None of it is executed in the planning pass**: no scanner, probe, credential, KMS, network call or real target is touched (Part D is explicitly NOT executed now).

## Part A - What this planning package contains and how to read it

| File | Purpose | Read when |
|---|---|---|
| `spec.md` | Single source of truth: FR-001..FR-201 (FR-161..171 = reconciliation additions; FR-172..187 = adversarial-review repairs; FR-188..196 = blocker repairs B-1..B-13; FR-197..199 = third-pass repairs N2-1..N2-10; FR-200..201 = fourth-pass repairs F-01/F-02, with FR-172/173/175/186/187/189/190/191/196 rewritten), SC-001..SC-006, clarifications, provisional product decisions | first, in full |
| `plan.md` | Context map (A-J), 18-field class contracts for `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW`, production safety matrix, budgets, closed 83-code `SEC_*` reason registry (one code per row), SG1-SG10 gates, D1-D14 diagrams, planned structure | second |
| `research.md` | Repository audit R1-R4 (no active security today; worker holds app key; unredacted `Issue.evidence`), decisions, provenance risk R0, named limitations R12 | when a decision's rationale is needed |
| `reconciliation-log.md` | Lead rulings L1-L40 for every contract conflict and proposed addition | when a contract and the spec seem to disagree |
| `data-model.md` | Ten new durable tables (incl. `ApiDescriptionDocument`), six new `EvidenceKind` values, execution-local state | when writing a migration/type |
| `contracts/` (19) | Normative interfaces: `security-scope`, `secrets-management`, `credential-broker`, `test-identity`, `auth-session`, `security-check-registry`, `active-security-execution`, `auth-workflow-execution`, `mutation-cleanup`, `api-discovery`, `api-security-check`, `authorization-testing`, `business-logic-security`, `probe-family`, `security-evidence`, `security-finding`, `security-coverage`, `security-reverify`, `advisory-matching` (each `*-contract.md`) | when implementing/consuming that area |
| `tasks.md` | Dependency-ordered tasks T001.. (test first), 29 plan fixtures + 50 adversarial fixtures + 9 reconciliation fixtures (R01-R09), FR-001..FR-201 traceability table (Phase 16 = adversarial-review repair tasks T530-T576; Phase 17 = T600-T746; Phase 18 = T750-T770) | before dispatching any work |
| `upstream-amendment-requests.md` | Every upstream gap, classified, with the local mitigation adopted | before touching or relying on any frozen document |
| `adversarial-review.md` | Written separately: analysis of the 50 required scenarios | for the safety argument |

**Reading order for a new reader**: spec Clarifications -> plan "Production Safety Matrix" and "Activation gates" -> the contract for your area -> `tasks.md` phase for your area.

**Core mental model**: Fahes performs *authorized, bounded, evidence-driven* testing. Verified ownership is never permission. Active and authenticated testing is non-production only, customer-fixture-confined, checkpointed per request, and every unprovable outcome is `INCONCLUSIVE`/`NOT_TESTED`/`BLOCKED`/`UNSUPPORTED` - never PASS. Engines (E14, E15) produce typed Evidence only; the Security domain's registry evaluator materializes Findings.

**Status**: planning complete, not frozen. Nothing in the package is implemented; all `tasks.md` boxes are unchecked and gated by SG1 and by the closure-and-freeze pass.

## Part B - Downstream-validation checklist

Run each check against the spec/contract text (for SPEC 013/014 authors, at their own planning time) and against the code (for implementers, at review time). Each item: **Check** -> **Expected (PASS)** -> **FAIL consequence**. Items marked (BLOCKS) block unconditionally.

### B1. For SPEC 013 (Performance/Load/Capacity/Observability) and SPEC 014 (Functional/Regression/Cross-Domain/Readiness) authors

1. **No private credential store (BLOCKS).** Does the spec store, cache or deliver any credential, token or cookie outside `credential-broker-contract` / `secrets-management-contract`? *Expected*: all credentials come from `CredentialReference` via `issueCredentialLease`; none persisted elsewhere. *FAIL*: spec is rejected; raise an upstream amendment request instead.
2. **No private session store.** Any session state outside the execution-local `SessionHost` (`auth-session-contract`)? *Expected*: none persisted/serialized/shared across units. *FAIL*: blocked.
3. **No private security dispatcher/evidence store.** Does it add its own check dispatcher, evidence kind duplicating `SECURITY_CHECK_RESULT`, or finding path bypassing `materializeFinding`? *Expected*: consumes `security-check-registry-contract`, `security-evidence-contract`, `security-finding-contract`. *FAIL*: blocked.
4. **Authorization consumed, not re-implemented (BLOCKS).** Every safety-sensitive action goes through 008 `safetyCheckpoint` after `securityScopeGate`; no direct `isAuthorized` call. *Expected*: checkpoint call sites enumerated (the seven action types: `HTTP_REQUEST`, `REDIRECT_HOP`, `LOGIN_ATTEMPT`, `LOGOUT`, `FIXTURE_MUTATION`, `FIXTURE_CLEANUP`, `SESSION_REFRESH`) plus the spec's own additions. *FAIL*: blocked.
5. **Unit-consumption policy declared.** What is "one request" for the new engine, stated against 008 FR-019 and `active-security-execution-contract` (one HTTP request incl. each hop/retry = one F07 unit). *Expected*: declared before its `/speckit-tasks`.
6. **Queue payload is only `{executionUnitId}` (BLOCKS).** *Expected*: no credential, URL, header or identity in a queue payload or `ExecutionUnit`; only opaque `credentialBindingRef`.
7. **No weakening of safe-net.** New HTTP behavior goes through `SecurityHttpClient`/safe-net; no allow-list entry, no `SAFE_NET_ALLOW_TARGETS` outside tests. *FAIL*: blocked.
8. **Production stance.** Does the spec request production active/authenticated testing? *Expected*: no; if yes it is an evidenced amendment to 007 FR-015a, not a local decision.
9. **013 boundary.** 012 timing metadata is consumed as non-authoritative only; no load or DoS-shaped probing is attributed to 012; rate-limit active probing stays `UNSUPPORTED` in 012 and is 013's to define under its own grant class.
10. **014 boundary.** Consumes `securityCoverageSummary`, `rootCauseGroup` and API identities; does not redefine fingerprints (FR-141) or `RouteIdentity` grammar.
11. **Reason codes.** Any new reason is added by explicit amendment; 012's `SEC_*` registry is closed; upstream reasons pass through verbatim.
12. **Gaps raised explicitly.** Any divergence is recorded as an upstream amendment request (pattern of `upstream-amendment-requests.md`), never silently.

### B2. For implementers (review gates; pass/fail against code)

1. **Production never active (BLOCKS).** Test: active/authenticated unit against PRODUCTION or unclassified target never created/dispatched; reasons `SEC_PRODUCTION_PROHIBITED`/`SEC_ENVIRONMENT_UNCLASSIFIED`. Fixtures PF04, A03.
2. **Registry class recomputation.** The loader recomputes class from the probe definition and rejects declared != computed; GET/POST are never assumed harmless/destructive (T019, T021, A03).
3. **Checkpoint call sites enumerated.** Static scan shows every send path is reachable only through scope gate -> `LocalBudget` -> `safetyCheckpoint` -> `SecurityHttpClient` (T034, T029). No direct `fetch`/`http(s)`/`net` import in engine packages (A44).
4. **Budget before send.** A spy proves every local limit is consulted before the network call, including retries and redirect hops (A29, T028).
5. **Queue payload only `{executionUnitId}`.** Both queues; `ExecutionUnit` carries only `credentialBindingRef` (T076, A08).
6. **No secret on any surface.** ScanPlan, ScanConfiguration, ExecutionUnit, queue, progress, logs, Sentry, Evidence, Artifact, Issue, AI prompt, report, export contain no planted credential/session/CSRF/cookie value (A09, A10, PF22, PF23).
7. **Redaction is value-aware.** Exact-value registry + structural header/cookie/query rules + body minimization; a response-borne secret is caught; failure writes `{"_redactionFailed": true}` (T030, T031). T-HARDEN-1 done for existing capabilities (T001).
8. **Worker/API/AI hold no KEK or data key.** Only the broker can unwrap; `ENCRYPTION_KEY` unused for 012 (T052, T060).
9. **Secrets write-only.** No route returns plaintext; operators revoke/disable only; no break-glass read (T064).
10. **Broker fail-closed.** Unreachable broker -> `SEC_BROKER_UNAVAILABLE`; no direct vault read path (T060).
11. **Teardown on every exit path.** Complete/fail/cancel/kill/deadline/crash leave no live lease or jar within `hardStopMarginMs`; `onUnitExpired` returns `TERMINATED` only after `confirmLeaseDestroyed` (T146, T148, A46).
12. **Fenced evidence writes.** Every unit-produced write passes the fenced wrapper (fence, claim, write); none after terminal state (T032, A47, PF28).
13. **Mutation safety.** Write-ahead intent precedes every C2 request; `attempts: 1`; recovery never re-sends a `SENT` intent; no cleanup after stop; residual manifest emitted (T300, T306, PF18, PF27, A26-A28).
14. **Honest verdicts.** `NO_ISSUE_DETECTED` is always rendered with its executed-probe statement and never as "secure"/"passed"; zero executed probes -> `NOT_TESTED` (`SEC_NO_EVIDENCE`) and score `null` (T127, A35). Partial scan -> `DEGRADED`, scored from findings with persisted `coverageComplete:false` and the coverage summary attached, never presented as complete (A49; `null` score only for `NOT_APPLICABLE`).
15. **Confidence ladder.** `CONFIRMED_VULNERABILITY` only with `confirmable: true` and a fixture-confined oracle; SQL-error banner is at most `LIKELY`; generic 500 is `INCONCLUSIVE` (T330, A34).
16. **Discovery is not authorization.** An API discovered but out of scope or without class/category is never requested (`SEC_API_NOT_AUTHORIZED`); OpenAPI parsing is offline and refuses external `$ref` (T214, T210, A36-A38).
17. **Fixture confinement.** Authz and logic probes touch only registered `FixtureResource` identifiers; payment/inventory endpoints only through `SANDBOX_CONFIRMED` fixtures with the "customer-asserted fixture safety" statement (T192, T312).
18. **No credential attacks.** No password guessing, stuffing, brute force, recovery-token guessing; auth attempts <= 3 per identity; lockout stops attempts (T172, T412).
19. **Reverify is fresh and minimal.** New single-unit REVERIFY plan, fresh F01/F07, fresh lease; a reverify that could not run is never `PASSED` (T360, T362, A48).
20. **No frozen document modified.** `git diff` shows no change under specs 006-011 attributable to 012 (see `upstream-amendment-requests.md` audit).
21. **Strict parallel run.** Existing SECURITY capabilities unchanged with 012 flags off and on (T124).
22. **Gates.** All three flags default off; each SG1-SG10 guard closed disables exactly its listed behavior (T380-T390).
23. **Free-text reasons.** Zero; every non-PASS names a `SEC_*` or upstream code (SC-002, T013).
24. **No AI authority.** AI never decides verdict/confidence/severity/scope/authorization; receives no credentials/tokens/cookies/bodies; labeled `AI_JUDGMENT` (T340, A10, A33).

25. **Dual-class checkpoint (FR-161).** A credentialed *crafted* request in an E14 unit is checkpointed under both `ACTIVE_SECURITY` (`consumes{request:true}`) and `AUTHENTICATED_WORKFLOW` (`consumes{request:false, concurrency:false}`); either STOP aborts; uncrafted credentialed replays are single-class E15; a missing secondary grant surfaces as `BLOCKED` at dispatch (T040/T041, R01).
26. **Residual manifest (FR-162).** After a stop/kill/cancel/expiry the parent-side finalizer (not the dead unit) writes `RESIDUAL_MANIFEST`/`SESSION_UNCONFIRMED` `CLEANUP_RECORD`s from durable `MutationIntent` rows, idempotently, sending no request (T314/T315, R02).
27. **Cancel warning (FR-171).** Before a cancel of a scan that mutated fixtures the product states that residual fixture state may remain; no cleanup is attempted after a cancel (T316/T317; copy is U30).
28. **Reverify routing and binding (FR-163/164).** `sec|auth|authz|api|logic|dep` findings are routed to the 009 REVERIFY path before the legacy resolver; `Issue.location` is bound to a concrete in-scope destination or reverify is `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE` (T364-T367, R03/R04).
29. **AI layer (FR-165).** The SECURITY AI layer never emits findings for 012 namespaces (T345/T346, R05).
30. **Account deletion (FR-167) and document storage (FR-168).** Deletion crypto-shreds credentials and purges all 012 tenant tables and R2 objects; customer OpenAPI lives in `ApiDescriptionDocument`, not an `Artifact` (T078/T079, T222/T223, R07/R09).
31. **Advisory freshness (FR-170).** The bound is measured from `sourceRetrievedAt`, not `importedAt` (T248/T249, R08).

32. **Verified address binding (FR-172).** Active classes need HTTP-file verification; the unit host proves hostname control and address control (`Host: <ip>`) per candidate address and pins the unit to the proven set; a DNS-TXT-only Target, a failed address-control proof (shared edge/CDN/PaaS) or an out-of-set peer is refused (T600-T608).
33. **Signing authority (FR-173).** The API Plan Resolver is the only MAC signer; no worker environment, image or secret store holds the key; the broker denies on a missing/invalid stamp (T610-T615).
34. **Readiness gate (FR-188, P13 OWNER-APPROVED).** Clean passive + all active blocked => readiness no-go with `SECURITY_COVERAGE_INCOMPLETE`, observed score shown, no certificate; every enumerated consumer applies the gate; the consumer contract test fails when one does not (T620-T634).
35. **Egress gate and permits (FR-175, FR-190).** The child has no network path; every request is a structured frame admitted by the parent in the FR-190 order (reads, reservations, F07 last) and serialized by the gate with an internal single-use permit; the fail-closed matrix has one error-path fixture per row; the T650 spike precedes SG5 (T650-T664).
36. **Hostile text (FR-174), child output (FR-194), unit host (FR-195).** Terminable worker-thread executor per classifier; no child stdio and closed crash codes; `sec-unit-host` claim and finalize guard (T640-T641, T720-T721, T730-T731).
37. **Attempt reservation (FR-191), restore detection (FR-193), consent points (FR-177), operation declarations (FR-192), group barrier (FR-141), partial billing (FR-189).** T670-T672, T710-T712, T680-T681, T700-T701, T690-T691, T632-T633.

### B3. Expected overall outcome

A downstream spec or implementation that passes B1 (planning) and B2 (code) is ready for its own `/speckit-tasks` or merge review. Failure of B1 items 1, 4, 6 or B2 items 1, 3, 5, 6, 25 blocks unconditionally; these encode the platform's highest-severity obligations (no private credential store, authorization never bypassed, no secret leakage, production never active).

## Part C - Operator runbooks (outlines only)

Outlines for the named owners (SG10). Full runbooks are written before activation; none is executed now.

### C1. Credential incident response (suspected leak)
1. Trigger and triage: classify (single credential, tenant, broker/KMS compromise); open incident; stop new leases (broker kill: all credentialed checks `BLOCKED` `SEC_BROKER_UNAVAILABLE`).
2. Contain: operator `revoke-all-for-tenant` or `revoke-all-for-KEK-version` (T070/T071); confirm outstanding leases `REVOKED`/destroyed and engine jars dropped via `confirmLeaseDestroyed`; confirm no live session.
3. KEK rotation: create new KEK version, re-wrap data keys, retire the old version; verify unwrap-only IAM; record in `AuditLogEntry`.
4. Tenant notification: notify affected tenants (what was exposed: ciphertext only vs lease window), instruct them to rotate target-side test credentials; record notification.
5. Evidence review: confirm no secret in Evidence/logs (value-aware redaction scan); note any `SEC_SESSION_NOT_SERVER_INVALIDATED` residual sessions and their natural expiry.
6. Post-incident: blameless review; update drills; feed gaps to upstream amendment list if a frozen contract is implicated.

### C2. Broker outage
1. Expected behavior: credentialed units `BLOCKED` (`SEC_BROKER_UNAVAILABLE`), passive checks unaffected; no fallback path.
2. Detect/alert on broker health; communicate degraded SECURITY results to tenants (`DEGRADED`, `coverageComplete:false`).
3. Recover: restore broker, verify KMS reachability, sweep leases of terminal units, re-run affected scans as new plans (never replay leases).
4. Confirm stuck units resolved via `onUnitExpired` (`TERMINATION_UNCONFIRMED` handling) and refunds follow delivered-area semantics.

### C3. Advisory snapshot import cadence
1. Operator imports an OSV-format snapshot on a fixed cadence (provisional: weekly; freshness bound 14 days); verify source, digest, signature; record import time and provenance.
2. Verify the snapshot before activation (diff counts, ecosystem coverage); never fetch advisories at scan time.
3. Staleness alert before the bound; stale snapshot makes advisory checks `NOT_TESTED` (`SEC_ADVISORY_STALE`).
4. Rollback to the previous snapshot digest if an import is bad.

### C4. Residual fixture manifest handling (customer-facing)
1. When a mutating test ends `RESIDUAL`/`SENT_UNCONFIRMED`, the report lists fixture ids, last confirmed state and expected manual action (Residual Manifest, written by the parent-side finalizer from durable intents, FR-162). A fixture left `RESIDUAL` is excluded from later plans (`SEC_FIXTURE_RESIDUAL_BLOCKED`) until the customer acknowledges it.
2. Customer resets the fixture using their declared reset mechanism; Fahes never performs out-of-band cleanup after a stop.
3. Customer may then re-run (a new plan with fresh consent); the prior check remains `INCONCLUSIVE` (`SEC_CLEANUP_FAILED`/`SEC_CLEANUP_UNVERIFIED`).
4. Support notes: cancellation does not reverse issued requests (008 FR-014 named limitation) and no cleanup is attempted after a user cancel; the cancel confirmation and the report warn that residual fixture state may remain (FR-171; copy is U30).

### C5. Account deletion and credential purge (FR-167)
1. Confirm the deletion path revoked credentials, destroyed leases, crypto-shredded every `CredentialVersion` and purged all 012 tenant tables and R2 objects (`tenant.purge_012` audit row); the `User` cascade alone does not reach 012 tables.
2. Note the backup residue bound (35 days or per-tenant KEKs, SG3 item) when answering customer questions about shredded credentials.

### C7. Database restore / rollback (FR-193)

1. A restore, point-in-time recovery or replica failover is detected automatically: the broker compares the database ledger (`leaseSeq`, ledger digest, system identifier) with the newest signed checkpoint in the external write-once store and enters restore quarantine (`SEC_RESTORE_QUARANTINE`): no lease issues, non-terminal units fail, leases are revoked, counters are treated as exhausted.
2. Verify the restore point, then run `acknowledgeRestore` with **two distinct operators** (dual control); it bumps `platformEpoch`.
3. Detection window equals the checkpoint interval (<= 60 s); an unreachable checkpoint store also quarantines (fail closed).

### C6. Other runbook stubs
Grant revoked/expired mid-run (expected `BLOCKED`, session dropped); account lockout on the customer's test identity (customer unlocks; Fahes does not retry); kill switch and environment reclassification handling; calibration of `M` and unit timings before activation.

## Part D - Local validation recipe for a future implementer (fixtures only; NOT executed now)

Lease sizing note: broker leases live at most `min(unit timeout + hardStopMargin, 30 min)` and are never renewed; workflows are capped at 25 steps; each mutation reserves 3 request units locally.

Preconditions: SG1 satisfied and the 012 closure-and-freeze done. Everything runs on loopback fixture servers with a fake KMS; no real target, no real credential, no external network, no real KMS. Do not run any of this in the planning pass.

1. **Prepare**: set `AI_MODE=fixtures`; keep `FAHES_SECURITY_PASSIVE|ACTIVE|AUTHENTICATED` off; start loopback fixture servers from `packages/security-engine/tests/fixtures/`; use `FakeKms` (T051) and a local Postgres.
2. **Unit/contract layer**: run the registry, classifier, `LocalBudget`, redaction, fenced-writer, scope-gate, broker and session tests (Phases 1-2, 5) and confirm each was seen failing for the intended reason before its implementation landed.
3. **Passive slice (US1)**: enable only `FAHES_SECURITY_PASSIVE` in the test environment; run the passive fixtures (weak CSP, missing HSTS, unflagged cookie, permissive CORS, debug banner, strong config, zero responses); assert verdicts, `NO_ISSUE_DETECTED` rendering, `NOT_TESTED` on no evidence, no crafted request sent.
4. **Credentialed slice (US2/US3)**: enable ACTIVE/AUTHENTICATED in tests only against loopback fixture servers; run PF07-PF13 and A08-A18; assert broker deny matrix, queue payload shape, no secret on any surface, lockout stop, teardown on kill/crash.
5. **Authz/API/probes/logic slices (US4-US7)**: run PF14-PF20 and A21-A43; assert confidence ladder, fixture confinement, discovery-vs-authorization counts, cleanup behavior.
6. **Reverify (US8)**: run PF29, A48 and R03/R04 (location binding, namespace routing).
   **Reconciliation fixtures**: run R01-R09 (dual-class, residual manifest after cancel, claim staleness, account deletion, advisory source age, API description intake, AI-layer restriction).
7. **Aggregate (T480)**: run the full T-FIX suite and assert SC-001..SC-005; record results as SG6 evidence.
8. **Gate matrix (T390)**: toggle each SG closed in turn; confirm each disables exactly its behavior and that PRODUCTION stays active-refused in every state.
9. **Teardown audit**: after each run assert zero live leases/jars and that no planted secret string appears in logs, DB rows, Redis or artifacts.
10. **Record** the pass/fail in `tasks.md` T502 and attach to the closure/activation review. Real-target runs are out of scope for this recipe and require an active grant, a non-production target and SG1-SG10.
