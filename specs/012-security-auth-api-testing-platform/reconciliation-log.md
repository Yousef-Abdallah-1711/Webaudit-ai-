# Reconciliation Log — SPEC 012 planning pass

Purpose: every "Proposed additions" item and every contradiction raised by the contract/data-model/task writers, with the **lead ruling** and where it landed. `spec.md` and `plan.md` carry the rulings; contracts, data-model, research, tasks and amendment requests were updated to match (verified by the analyze pass, `analyze-report.md`). Rulings are planning decisions, not owner approvals; product-policy items are marked PROVISIONAL (plan.md §Product decisions).

| # | Source | Finding | Ruling | Landed in |
|---|---|---|---|---|
| L1 | coverage-contract C-1 | FR-142/SC-003 want `null` score on DEGRADED, but `MODULE_STATES_SCORED` includes DEGRADED and a scorable state with null score is an upstream bug | DEGRADED is scored from findings **with mandatory `coverageComplete:false` marker + coverage summary**; no consumer may present it as complete/pass; `NOT_APPLICABLE` (null) only when no real result; cap = **P13 PROVISIONAL no cap** | spec FR-142, SC-003; plan P13 |
| L2 | authz contract / reverify R-1 | credential use ⇒ E15 (FR-008) vs plan D5 composite; reverify single-class rule | **Dual-class rule FR-161**: credentialed *crafted* request in E14 is checkpointed under both classes; credentialed uncrafted replays are single-class E15; reverify = single E14 unit with dual checkpoint; **AR-10 RECOMMENDED** (009 per-unit additional authorization classes) | spec FR-008, FR-062, FR-161; plan D5; AR-10 |
| L3 | mutation/evidence P-E2 | residual manifest vs fenced writer | **FR-162**: parent-side finalizer writes `CLEANUP_RECORD`/`SESSION_UNCONFIRMED` from durable `MutationIntent`; not unit-produced; idempotent; no requests | spec FR-122, FR-162 |
| L4 | reverify F-2/R-2 | `Issue.location` is not an F01 destination | **FR-163** `parseSecurityLocation` + concrete destination binding; unbindable ⇒ INCONCLUSIVE `SEC_REVERIFY_UNVERIFIABLE` | spec FR-163 |
| L5 | reverify | legacy `resolveReverifyCapability` null ⇒ UNVERIFIABLE | **FR-164** route 012 namespaces to 009 REVERIFY before legacy; INCONCLUSIVE ⇒ Issue `UNVERIFIABLE` | spec FR-164 |
| L6 | finding F-1 | `fingerprintOf` hashes checkId; rootCauseGroup dedupe | canonical group `checkId`; parts exclude checkId | spec FR-141 |
| L7 | finding F-4 | AI layer could emit findings | **FR-165** AI explanation only | spec FR-165 |
| L8 | broker | 15-min lease cap = E15 timeout | cap = min(timeout+margin, 30 min); no re-lease | spec FR-033, P12 |
| L9 | mutation | 2 vs 3 request units | **3** (action, cleanup, verification read); local accounting | spec FR-121; plan Budgets |
| L10 | mutation | mutation-count window | per scan plan from durable intents | spec FR-125 |
| L11 | registry/finding/api/broker | new reason codes | accepted: `SEC_PROBE_CLASS_UNSUPPORTED` (also for C4/C5 registry entries; `SEC_CHECK_CLASS_UNSUPPORTED` rejected as duplicate), `SEC_EVALUATION_ERROR` (replaces `SEC_CHECK_EVALUATE_THREW`), `SEC_WORKFLOW_INVALID`, `SEC_STALE_EVIDENCE_REJECTED` (FLAG), `SEC_FINDINGS_CAPPED` (FLAG), `SEC_ENDPOINT_GONE`, `SEC_ADVISORY_SNAPSHOT_UNAVAILABLE`, `SEC_ANALYSIS_BUDGET_EXHAUSTED`, `SEC_BROKER_DENIED`, `SEC_FIXTURE_RESIDUAL_BLOCKED`. Total 75, one per row | plan §Reason-code registry |
| L12 | secrets | FR-018 garbled phrase | fixed: no secret-derived value (no prefix/suffix/length/hash) in UI | spec FR-018 |
| L13 | scope/contracts | step cap 25 vs 50 | **25 everywhere** | spec FR-075; plan |
| L14 | business-logic | FR-118 "≤3" ambiguity | ≤ 3 **total executions** per action key | spec FR-118 |
| L15 | business-logic | FR-116 vs FR-128/131 | evaluate in-child over transient observations; persist predicate id, boolean, class-level values (`recordMode`); engine-evaluated verdict capped LIKELY | spec FR-116 |
| L16 | probe-family | alphabet cannot express command/template/etc. | those active probes `SEC_PROBE_CLASS_UNSUPPORTED` in v1; named exceptions: in-scope URL value (FR-080) and inert Origin (FR-110) | spec FR-105, FR-080 |
| L17 | probe-family | CSRF ids split | `auth.csrf.*` (session-bound fixture comparison) vs `sec.csrf.*` (passive); prefixes `sec.inj/xss/csrf/ssrf/leak/cfg` | contracts |
| L18 | authz | FR-094 gaps | expected ALLOW/observed DENY ⇒ INFORMATIONAL; 2xx marker absent ⇒ scoped NO_ISSUE; 404 under strict DENY ⇒ INFORMATIONAL | spec FR-094 |
| L19 | api-discovery | prohibited destination verdict | OUT_OF_SCOPE + `SEC_DESTINATION_PROHIBITED` | spec FR-100 |
| L20 | api-discovery | `apiIdentity` form | accepted `"api:" pct(authority) ":" METHOD " " pattern` (not a RouteIdentity) | api-discovery-contract |
| L21 | data-model | OpenAPI/advisory storage vs Artifact | **FR-168** `ApiDescriptionDocument`; `advisory-snapshots/<digest>` | spec FR-168; data-model |
| L22 | data-model | account deletion cascade | **FR-167** explicit shred+purge | spec FR-167 |
| L23 | data-model | `CredentialSecretKind` name clash | adopt `CredentialSecretKind`; P-2 wrap by API with wrap-only KMS permission; P-3 rotation grace 7 days; P-4 backups bounded to 35 days or per-tenant keys (SG3 item); P-6 lease `purpose` closed set `LOGIN`,`SESSION_REFRESH`,`API_AUTH`; P-12 vault DB roles (broker RW, API insert-only ciphertext, worker none) | data-model |
| L24 | reverify R-5 | billing | **FR-169 / P14 PROVISIONAL** | spec FR-169 |
| L25 | data-model | advisory table 7 entries | corrected in spec/plan | spec/plan |
| L26 | broker | FR-035 vs FR-057 | stated as unused-in-v1 | spec FR-035 |
| L27 | scope | empty `includedActionCategories` | 007 gives no semantics (opaque shape); 012 (F05) defines **empty = READ + NEGATIVE_PROBE only**; non-empty = closed allow-list | security-scope-contract; AR-1 note |
| L28 | active contract | mid-run revocation outcome | COMPLETED when ≥1 probe completed, else FAILED | spec FR-059 |
| L29 | mutation | user cancel ⇒ no cleanup | confirmed; **FR-171** UI/report warning (U30 dep) | spec FR-171 |
| L30 | registry | claim stale threshold | **FR-166** | spec FR-166 |
| L31 | finding | mapping INCONCLUSIVE→UNVERIFIABLE | accepted (L5) | spec FR-164 |
| L32 | advisory | freshness anchor | `sourceRetrievedAt` | spec FR-170 |
| L33 | evidence | naturalKey per kind; lengthClass buckets XS–XL; `synthesized:true` marker on sweep-written results | accepted | security-evidence-contract; data-model |
| L34 | coverage | facets `CONFIGURATION`,`DEPENDENCY`; `coverageBehavior.preconditionIsApplicability`; lockfile scope covered by any per-match result | accepted | coverage/registry contracts |
| L35 | finding | severity steps S3–S5 | provisional; owner confirmation at closure (PROVISIONAL) | finding contract |
| L36 | registry | 009 ModuleResult enum mapping, Issue severity INFO, progress `waitingOn` names unverified | **verify against 009/schema in analyze pass**; unresolved items recorded as closure blockers-of-record | analyze-report |
| L37 | tasks | TLS door has no task | deliberate: deferred (v1 `SEC_TLS_INSPECTION_UNAVAILABLE`); placeholder row "deferred" added | tasks |
| L38 | spec/plan | HEAD short vs full | same commit `e42577304a2c` | — |
| L39 | active contract | dispatch checkpoint (concurrency) vs per-request (request) split | accepted: dispatch checkpoint `consumes{concurrency:true}`, per-request `consumes{request:true}`, periodic liveness `consumes{false,false}` | active-security contract |
| L40 | active contract | E14 units holding no lease: backstop | 009 self-healing pass + parent SIGKILL suffice; `onUnitExpired` still declared | active-security contract |

## Second pass — analyze (F-n) and independent adversarial review (G-n), 2026-10-11

Both reports are in `analyze-report.md` (0 CRITICAL, 6 HIGH, 19 MEDIUM, 15 LOW) and `adversarial-review.md` (50 required + 28 additional scenarios; verdict READY-WITH-REPAIRS). Rulings below; the full disposition per scenario is in `adversarial-review.md` §Disposition.

| # | Source | Ruling | Landed in |
|---|---|---|---|
| L41 | F-1 / G-3 | **Rejected** the review's "persist `score = null` for DEGRADED": `packages/scoring/src/aggregate.ts` documents that nulling a computable score *inflates* the overall (the worst area leaves the average) and that `MODULE_STATES_SCORED` includes DEGRADED. Adopted instead a **persisted** `ModuleResult.coverageComplete` (additive migration M012-5c) so the partial marker is enforceable data, not a label on unnamed consumers; cap = P13 owner decision. Fixtures T420/T478 corrected | spec FR-142, FR-186; coverage contract; tasks T558/T559 |
| L42 | F-2 | one cleanup/reset vocabulary `FIXTURE_CLEANUP_REQUEST \| CUSTOMER_FIXTURE_RESET \| MANUAL \| NONE` | data-model 4.6/4.8; contracts |
| L43 | F-3 / G-17 | oracle lives on the fixture (`markerSpec`); marker >= 16 chars, negative control read | data-model 4.6; authz contract; FR-140 |
| L44 | F-4 | terminal cleanup states `REVERTED`/`RESIDUAL` + `residualReason`; `ABANDONED` for never-sent intents; `ACKNOWLEDGED` customer exit | FR-120, FR-184; data-model 3/8.3; plan D8 |
| L45 | F-5 / G-18 | durable identity attempt window, lockout, credential-suspect; reference `status`/`disabledAt` | FR-187; data-model 4.1/4.5 |
| L46 | F-6 | AdvisorySnapshot adopts contract states (`IMPORTED/VERIFIED/ACTIVE/SUPERSEDED/REVOKED`) | data-model 4.9 |
| L47 | F-7 / AR-12 | SG1 = 009 T-U1-1..10 implemented + T-U1-10 adverse suite green in CI | plan SG1; AR-12 |
| L48 | F-10 / G-11 | one definition of "crafted": cross-identity replay is `NEGATIVE_PROBE` (E14 dual-class) | FR-008, FR-161 |
| L49 | F-13 | one lease per `(version, unit, attempt)`; purpose informational; pin version before insert | broker contract; data-model 4.3 |
| L50 | F-14 | `VALUE_RECORDED` is a bounded, redacted exception | FR-116; data-model 10 |
| L51 | G-1 | per-request F07 idempotency key | FR-072 |
| L52 | G-2 | owner-verified address binding; new code `SEC_TARGET_ADDRESS_UNVERIFIED` | FR-172 |
| L53 | G-4 | broker trust anchor (security-definer writes, unit MAC, anomaly rule) | FR-173 |
| L54 | G-5/G-8/G-16/G-25 | bounded redaction cost; names are values; logging/Sentry/BullMQ/dump posture; string normalization | FR-174, FR-128e, FR-180, FR-134 |
| L55 | G-6/G-28 | child confinement; single live host CAS | FR-175, FR-183 |
| L56 | G-12/G-13/G-14/G-15 | environment cool-off (`SEC_ENVIRONMENT_COOLOFF`), `SecurityConsentRecord`, single DB time source, restore epoch | FR-176..FR-179 |
| L57 | G-19/G-20/G-26 | lease exclusivity (`SEC_CREDENTIAL_LEASE_BUSY`), AI module-level ban + closed AI input schema, DTO allow-lists + RLS | FR-181, FR-165, FR-144, FR-182 |
| L58 | G-10/G-9/G-21/G-23/G-24/G-27/G-29..G-33/G-35..G-39/G-41/G-42 | undeclared ops mutating; redirect credential stripping; isolated OpenAPI parse; usage default-deny; sandbox tripwire; no response-derived ids; atomic reservation; CORS ladder; fence stop-state; freshness from data; deterministic merge; reverify limits; export classes; operator dual control; decoded caps; Azure metadata address | FR-007, FR-081, FR-084, FR-095, FR-117, FR-092, FR-071, FR-110, FR-058, FR-170, FR-141, FR-184, FR-185, FR-021, FR-070; tasks T564-T576 |
| L59 | F-8/F-11/F-12/F-16/F-17/F-19..F-40 | stale values and vocabulary drift fixed (MFA names, hard 50, 8-entry, T013/T018 wording, AAD authority, LOCAL labels, call-site labels, placeholder format, SG refs, trace table regenerated untruncated) | spec, plan, data-model, contracts, tasks, quickstart |
| L60 | adversarial Part 5 | residual risks recorded as not resolvable in planning (customer attestations, remote completion of in-flight requests, memory secrecy in a GC runtime, forged target responses, compromised broker principal, heuristic detector false negatives, legal exposure, uncalibrated provisional numerics, upstream provenance) | adversarial-review.md Part 5; plan Complexity |

## Third pass — blocker repairs B-1..B-13 and owner approvals (2026-10-11)

Inputs: `closure-review.md` §6, `adversarial-rereview.md` (independent), owner approval of P1, P2, P3, P7, P10/AR-3, P13, P15 and deferral of P11. Rulings below are the **repair author's design decisions** (recommendations until the second independent review); owner approvals are marked OWNER-APPROVED and are the only decisions treated as approved.

| # | Source | Ruling | Landed in |
|---|---|---|---|
| L61 | Owner | P1, P2, P3, P7, P10/AR-3, P13, P15 recorded OWNER-APPROVED; P11 DEFERRED to broker activation; nothing else inferred; AR-3 closed | spec Clarifications; plan §Product decisions; AR doc |
| L62 | B-1 / scenario 7 | **Verified address binding**: HTTP-file proof only; hostname + address-control proof (`Host: <ip>`) over the connection; unit pinned to `provenAddressSet`; fresh proof at dispatch; plan-time recency via `TargetAddressProof`; declared-address-set and shared-edge attestation **removed**; shared edge/CDN/PaaS refused (provider-policy registry = unresolved P16, default NO) | FR-172; scope contract; data-model 4.9D; plan D15 |
| L63 | B-2 / A1 | API Plan Resolver is the sole MAC signer; no key in worker; MAC covers identity list/class/config digest; broker reads rows itself and treats `AdmissionLease` as liveness only; T117/T119/T537 relocated; **AR-13** (RECOMMENDED) | FR-173; broker contract; secrets contract; AR-13 |
| L64 | B-3 / 35, 49 | Readiness fail-closed gate with enumerated consumer files; observed score preserved; tri-state marker with `coverageRequired` snapshot; single-writer rule for `ModuleResult(SECURITY)`; additive `partialModules`; compat note **AR-16** | FR-186, FR-188, FR-196; coverage contract; plan D16 |
| L65 | P15 | Partial billing via `securityBillableWorkSummary`; active/authenticated work not purchasable until F06 (**AR-15**) | FR-189; plan SG1 |
| L66 | B-4 / A10 | HostileTextExecutor (terminable worker threads) for all hostile text in child and parent | FR-174 |
| L67 | B-5 / A3 | Parent-hosted request-granular egress gate re-originating upstream connections with single-use permits; feasibility spike T650 mandatory before SG5 | FR-175, FR-190; active contract; plan D7 |
| L68 | B-6 / 13, A2 | Per-request `getLeaseStatus` as permit precondition; no push; fail-closed matrix; parent-assigned ordinals; replay re-check | FR-039, FR-190 |
| L69 | B-7 / 18 | Broker `reserveAuthAttempt`/`resolveAuthAttempt`; failures counted separately; 3 failures / 12 reservations per 24 h | FR-191, FR-070, FR-187 |
| L70 | B-8 / A27 | Consent enforced at plan, dispatch, broker issue, every permit mint, mutation gate; lookup error fails closed; **AR-14** (OPTIONAL) | FR-177 |
| L71 | B-9 / 43 | Group-barrier materialization; legacy duplicates visible during the parallel run | FR-141 |
| L72 | B-10 / 24 | `ApiOperationDeclaration` entity, DTO, consent link, marker-change tripwire | FR-192 |
| L73 | B-11 / A18 | Signed external ledger checkpoint, `leaseSeq`, restore quarantine, dual-control `acknowledgeRestore` | FR-193, FR-179 |
| L74 | B-12 / 9 | Child stdio ignored; closed crash codes | FR-194 |
| L75 | B-13 / A25 | `sec-unit-host` claim before dispatch checkpoint; finalize ownership guard; per-class grant consistency | FR-195 |
| L76 | Scenario 25 | Sensitive-class workflows need interactive recorded confirmation; non-interactive runs refuse; tripwire demoted to backstop | FR-117 |
| L77 | N-16, N-17 | Expired `ISSUED` lease is dead for exclusivity; emergency single-operator per-tenant revoke/disable | FR-181, FR-021 |
| L78 | New codes | `SEC_EGRESS_PERMIT_INVALID`, `SEC_RESTORE_QUARANTINE`, `SEC_UNIT_HOST_CONFLICT` (81 total) | plan registry |
| L79 | N-11 | Stale-text sweep (response-derived ids, E15 replay, empty `includedAccountRefs`, coverage marker location, `precheck/commit`, counts) | contracts; spec; docs |
| L80 | Handoff | Second independent review package prepared; no self-certification | second-review-handoff.md |
| L81 | N2-1 | Verified Address Binding reworked: hostname proof over validated TLS (SNI, SPKI pin) + plain-HTTP port-80 address-control proof; proofs establish control of the serving address only; `NO_DEFAULT_VHOST` refusal accepted | FR-172; plan D15; data-model 4.9D |
| L82 | N2-2 | Destination Authorization Policy: forwarders are undetectable, so authorization is explicit policy (warranty + operator `ActiveTestingEnablement` + containment); attestation alone is never proof; fail-closed default (P16) | FR-197; plan P16/SG8 |
| L83 | N2-3 | Child has no network path; structured request frames; gate-side canonical HTTP/1.1 serialization; one request per connection; full TLS validation; T650 mandatory feasibility gate | FR-175, FR-199; plan SG5 |
| L84 | N2-4 | Admission order Phase A reads -> Phase B releasable reservations -> Phase C F07 consume last | FR-190 |
| L85 | N2-5 | Auth-attempt reservation lifecycle RESERVED -> SENT -> RESOLVED; unsent never a failure; idempotent release | FR-191; data-model 4.9F |
| L86 | N2-6 | Execution-class-level settlement (proposed P17); ADR-005 conflict recorded as AR-17 | FR-189, FR-198; data-model 4.9G |
| L87 | N2-7 | Broker anomaly detection keyed per worker principal (R1-R6, quarantine); checkpoint-store outage grace | FR-173, FR-193; data-model 4.9H |
| L88 | N2-8 | Stale-text sweep: contracts consolidated into single authoritative sections; tasks T161/T530/T531/T536/T537/T540/T541 and others rewritten in place; counts 83 codes / 199 FRs / P1-P18 | contracts; tasks; plan |
| L89 | N2-9/N2-10 | Live progress events are consumers; transaction-based single writer; REVERIFY barrier over scheduled members; READ_ONLY limitations | FR-188, FR-196, FR-141, FR-192 |
| L90 | Handoff | Third repair pass complete as a planning artifact; no self-certification; independent review required | third-repair-matrix.md; third-review-handoff.md |
