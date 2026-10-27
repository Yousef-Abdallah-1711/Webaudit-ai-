# Contract: Security Scope (Context A) — classification, `securityScopeGate`, enforcement points

Per FR-001 through FR-015, FR-077, FR-078, FR-079, FR-081, FR-083 (and FR-003/FR-004 as they bind every later stage).
Defines how a requested security check becomes `{classification, class, scope verdict, reason}` at plan time, the
012-owned semantics of 007's `includedAccountRefs` / `includedRoles` / `includedActionCategories`, and every point where
F01 and F07 are consulted. Planning only; pseudo-signatures are shapes, not final TypeScript.

## Status / Ownership

Owner: SPEC 012, Context A (a 012 domain module consumed by the 009 Plan Resolver; code home planned
`packages/security-engine/` for `securityScopeGate`, `apps/api/src/services/planning/security/` for the plan-time resolver (009 places the Plan Resolver in `apps/api`; the worker hosts only the per-request gate and holds no signing key)). Status:
planning, not frozen. 012 introduces **no** authorization service, scheduler, budget ledger or kill switch: F01
(`isAuthorized`, 007 `authorization-check-contract.md`), F07 (`requestAdmission` / `safetyCheckpoint`, 008
`safety-checkpoint-contract.md`) and 009 (`resolvePlan`) are consumed unchanged (FR-002).

## Consumers

1. 009 Plan Resolver (`execution-plan-contract.md`) calls `resolveSecurityChecks` during `resolvePlan` for SECURITY.
2. E14 / E15 engines (`active-security-execution-contract`, `auth-workflow-execution-contract`) call
   `securityScopeGate` before every checkpoint.
3. Credential Broker (`credential-broker-contract.md`) re-runs the environment and identity-scope part of the gate.
4. Security Check Registry loader (`security-check-registry-contract`) calls `computeClassification` to reject a mismatched
   declared class (FR-007).
5. Reverify (`security-reverify-contract`) calls `resolveSecurityChecks` with `kind: REVERIFY`.
6. `securityCoverageSummary` reads the planning-refusal verdicts this contract produces.

## Inputs

- `ScanConfiguration` SECURITY profile (requested check ids + versions) and the registered `SecurityCheckDefinition`s
  (their `probeDefinition`, `sideEffects[]`, `requestBudget`, `actionCategories[]`, `consentFlags[]`).
- Target (`WEB` kind) with its **current** environment classification (`STAGING | DEVELOPMENT | PRODUCTION | unclassified`).
- Active `ScopeGrant` rows per class: `scope`, `includedAccountRefs`, `includedRoles`, `includedActionCategories`
  (007 grant shape), `expiresAt`, per-class ceilings.
- Customer data: `TestIdentity`, `TestRole`, `FixtureResource`, consent flags (`test-identity-contract.md`).
- 009 deadline anchor (`scan-deadline-contract.md` §Anchor) only to the extent plan resolution already consumes it.

## Outputs

```text
CheckClassification = C0 | C1 | C2 | C3 | C4 | C5                       // FR-006
SecurityPlanEntry = {
  checkId, checkVersion, classification: CheckClassification,
  requiredClass: PASSIVE_HTTP | BROWSER | CRAWLER | SOURCE_STATIC | NONE_PARENT_SIDE | ACTIVE_SECURITY | AUTHENTICATED_WORKFLOW | UNSUPPORTED,
  actionCategories: ActionCategory[], environmentRequirement, boundarySet,
  scopeVerdict: PLANNED | BLOCKED | NOT_TESTED | UNSUPPORTED,
  reason?: SEC_* | F01 reason verbatim
}
SecurityGateDecision = { allow: true } | { allow: false, reason: SEC_* , category?: ActionCategory }
```

Planning refusals are recorded as `SECURITY_CHECK_RESULT` Evidence (verdict `BLOCKED|NOT_TESTED|UNSUPPORTED`), never dropped (FR-001).

## Operations

```text
computeClassification(probe: ProbeDefinition, semantics: ApplicationSemantics) -> CheckClassification   // pure
resolveSecurityChecks(cfg, target, grants, registry, kind: INITIAL|REVERIFY) -> SecurityPlanEntry[]       // pure + F01 reads
securityScopeGate(identityRef?: TestIdentity.id, role?: TestRole.key, category: ActionCategory,
                  destination: WebDestination, ctx: {unitId, attempt, grantId, env}) -> SecurityGateDecision
```

### `computeClassification` (FR-006..FR-010) — mechanical, ordered, first match wins

1. If the definition is registered as `UNSUPPORTED` (credential attacks, brute force, DoS, data extraction, command
   execution, third-party testing, production mutation, OAST, fuzzing, race/flood, active rate-limit probing) -> `C5`
   (never supported) or `C4` (potentially destructive, unsupported in v1). `C4`/`C5` entries have **no** `probeDefinition`
   and no code path (FR-010); the loader refuses an entry that has both.
2. If the definition declares any `FIXTURE_MUTATE` step or a `sideEffects[]` entry other than `NONE` -> `C2`, or `C3` if it
   is also session-bound or multi-step.
3. If it attaches a credential, a session, or has more than one dependent step with session state -> `C3`.
4. Else if it adds any crafted header, parameter, body, method, `Origin`, or any request beyond the unmodified passive
   fetch / 010 browser / 010 crawler traffic -> `C1` (FR-008).
5. Else (derived purely from committed evidence, or from the ordinary passive response) -> `C0`.

The HTTP method is never an input to this function (FR-007): a state-changing GET that a registered fixture declares
mutating is `C2`; a read-only search POST is `C1`. The class a check *declares* is compared with the computed class at
registry load; any difference rejects the registry entry (anti-relabel).

### Required execution class (FR-008, plan.md "Production Safety Matrix")

| Class | Required F01 `ExecutionClass` | Queue |
|-------|------------------------------|-------|
| C0 from ordinary responses | `PASSIVE_HTTP` / `BROWSER` / `CRAWLER` / `SOURCE_STATIC` producer; evaluation parent-side | existing |
| C0 derived (API surface, advisory match) | none (parent-side, no network) | none |
| C1 | `ACTIVE_SECURITY` | `webaudit-exec-active-security` |
| C2, C3 | `AUTHENTICATED_WORKFLOW` (E15); a credentialed *crafted* request is an E14 `ACTIVE_SECURITY` unit under the dual-class rule (FR-161, L2): checkpointed under both classes, grant must authorize both; units linked by `ExecutionDependency` for ordering only (FR-062) | `webaudit-exec-authenticated-workflow` (E15) / `webaudit-exec-active-security` (E14 crafted) |
| C4, C5 | none; `UNSUPPORTED` | none |

### Plan-resolution domain -> class mapping and unit-template / precondition predicate (FR-002)

For each requested check, in order: (a) look up the registry entry; unresolved id -> `NOT_TESTED` `SEC_PRECONDITION_UNMET`;
(b) flag off for the class (`FAHES_SECURITY_PASSIVE|ACTIVE|AUTHENTICATED`, SG gate unmet) -> `NOT_TESTED` `SEC_ENGINE_DISABLED`;
(c) `C4/C5` -> `UNSUPPORTED` with the registry reason (`SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_OOB_UNSUPPORTED`, or
`SEC_TLS_INSPECTION_UNAVAILABLE`, or `SEC_PROBE_CLASS_UNSUPPORTED` as registered, L11); (d) environment filter (below); (e) for each required class call
`isAuthorized(targetId, userId, class, destination, now)` — not `AUTHORIZED` -> `BLOCKED` with the F01 reason verbatim
(`NO_MATCHING_GRANT`, `REVOKED`, `EXPIRED`, `BUDGET_EXHAUSTED`, `OUT_OF_SCOPE`, `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`);
(f) action-category and identity checks via the same predicate `securityScopeGate` uses (a pure function of grant scope,
check declaration, and identity registry) — failures `SEC_ACTION_CATEGORY_NOT_GRANTED` / `SEC_IDENTITY_NOT_IN_SCOPE` /
`SEC_CONSENT_MISSING`; (g) data preconditions: no identity for the role -> `NOT_TESTED` `SEC_IDENTITY_ROLE_UNMAPPED`; no
fixture -> `NOT_TESTED` `SEC_FIXTURE_MISSING`; no recovery sink -> `NOT_TESTED` `SEC_SIDE_EFFECT_FIXTURE_MISSING`; no
invariant / expectation -> `NOT_TESTED` `SEC_INVARIANT_UNDEFINED` / `SEC_EXPECTATION_MISSING`; fewer identities than the check needs
-> `INCONCLUSIVE` `SEC_FIXTURE_LIMITATION`. The predicate records a closed verdict; it never fabricates a pass (FR-002).
Surviving entries are grouped into per-engine unit templates (`security.active.*`, `security.auth.*`) with
`credentialBindingRef` (opaque) and `retryPolicy.maxAttempts: 1`; the grant ids that returned `AUTHORIZED` are snapshotted by
reference (007 `authorization-check-contract.md` §"Two mandatory call points").

### Action categories and 007 field semantics (FR-011)

Closed set: `READ`, `AUTH_LOGIN`, `AUTH_LOGOUT`, `AUTH_RECOVERY_OBSERVE`, `NEGATIVE_PROBE`, `FIXTURE_MUTATE`, `FIXTURE_CLEANUP`.

| 007 field | 012 semantics (F01 stores the shape only) |
|-----------|-------------------------------------------|
| `includedAccountRefs` | list of `TestIdentity.id` values (never usernames, never emails) |
| `includedRoles` | list of `TestRole.key` values |
| `includedActionCategories` | subset of the closed set above; any other string is invalid at grant-write validation in 012 consumers and refused at the gate. 007 gives the field no semantics (opaque shape); 012 defines them (L27) |

Category rules for `securityScopeGate`:
- Each check/step declares its categories exactly (FR-009); a step with no declared category is refused (`SEC_SCOPE_GATE_ERROR`).
- Empty/absent `includedActionCategories` authorizes `READ` and `NEGATIVE_PROBE` **only**; every other category needs an explicit entry.
- `FIXTURE_MUTATE` additionally needs the per-mutation-class consent flag (default OFF) -> `SEC_CONSENT_MISSING`; `FIXTURE_CLEANUP` is allowed only for a fixture that already has a `SENT`/`CONFIRMED` `MutationIntent` in this unit.
- A non-empty `includedAccountRefs` / `includedRoles` is a closed allow-list; an identity outside it -> `SEC_IDENTITY_NOT_IN_SCOPE`. An empty list authorizes only registered identities of this Target with `usage = ACTOR_ALLOWED` that are **not high-privilege** (highest `privilegeTier` or unset tier on a multi-role target); it never authorizes a `UNSET`, `FIXTURE_OWNER` or high-privilege identity (FR-095). Identities remain tenant+Target+environment bound by `test-identity-contract.md`.

### `securityScopeGate` ordered steps (runs **before** every F07 checkpoint; fail closed)

0. Read the database clock (FR-178); any error => `SEC_SCOPE_GATE_ERROR`.
1. Read the Target's **current** environment (FR-014) and the environment cool-off (FR-176). `PRODUCTION` -> deny `SEC_PRODUCTION_PROHIBITED`; unclassified -> deny `SEC_ENVIRONMENT_UNCLASSIFIED`; within cool-off -> `SEC_ENVIRONMENT_COOLOFF` (FR-013, FR-078).
2. Validate `category` is in the closed set and in the check's declared set.
3. Re-read the unit's grant (by id) and apply the category / account / role rules above; read the current `SecurityConsentRecord` (missing or stale => `SEC_CONSENT_MISSING`, FR-177), the current `ActiveTestingEnablement` and the origin-ownership warranty (missing => `SEC_DESTINATION_AUTHORIZATION_UNMET`, FR-197) and the unit's address pin (`SEC_TARGET_ADDRESS_UNVERIFIED`, FR-172); a read error on any of them is `SEC_SCOPE_GATE_ERROR` (fail closed). Identity, role, category and destination are supplied by the parent from the plan step (FR-200), never by the child.
4. Verify `destination` host is in the target's authorized hosts and the request is parameterized from authorized inputs (FR-067, FR-083).
5. Any thrown error, missing data, or timeout inside the gate -> deny `SEC_SCOPE_GATE_ERROR` (fail closed; no default permit).
6. Return `allow`. The gate result is **not** cached beyond this one action (FR-003, 007 FR-024).

The gate decision never replaces `isInScope`/`isAuthorized`; it runs in addition, then `safetyCheckpoint` runs F01+F07.

## Invariants

1. No `SecurityPlanEntry` is dropped; every requested check yields exactly one entry with a closed reason (FR-001).
2. `computeClassification` output for a given probe definition is deterministic and independent of HTTP method.
3. A registry entry whose declared class differs from the computed class never loads (FR-007, FR-149).
4. `C4`/`C5` entries have no probe definition (FR-010).
5. No `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` unit exists in a plan whose Target is `PRODUCTION` or unclassified (FR-078).
6. `securityScopeGate` is called before **every** `safetyCheckpoint` call site of FR-077 and returns deny on every internal error.
7. A gate allow is valid for exactly one action; no `AUTHORIZED`/allow result is stored across actions.
8. 012 never calls `isAuthorized` directly for a safety-sensitive action at run time (FR-004); plan-time and reverify-time calls are by `resolvePlan` only.
9. A verified domain alone never yields an allow for any category except passive observation (FR-005).
10. Grants are never combined across classes or grant rows to satisfy one entry (007 rule 2, FR-013).

## Safety & Authorization

**F01/F07 enforcement points (FR-003, plan.md D9)** — authorization is evaluated freshly at each:

| Stage | Enforcement | Notes |
|-------|-------------|-------|
| Scan creation / quote | F01 `isAuthorized` per class, representative destination; 012 filter refuses PRODUCTION active classes before any charge | refuse before charge; no partial active plan for a refused class |
| Plan resolution | `resolveSecurityChecks` as above | grant ids snapshotted by reference |
| Unit dispatch | 009 `dispatchExecutionUnit` fresh F01 + F07 `safetyCheckpoint(consumes{request:false,concurrency:true})` | 009 dispatch step 0 deadline precondition applies first (`scan-deadline-contract.md`) |
| Each active destination | `securityScopeGate` then `safetyCheckpoint(consumes{request:true,concurrency:false})` | step order is invariant (FR-055) |
| Each redirect hop | `isInScope` via checkpoint **and** safe-net layers 1-4 | counts as one F07 request unit (FR-072) |
| Each state-changing step (`LOGIN_ATTEMPT`, `LOGOUT`, `FIXTURE_MUTATION`, `FIXTURE_CLEANUP`, `SESSION_REFRESH`) | gate with the matching category + checkpoint | `FIXTURE_MUTATION` pre-reserves 3 request units locally: action, cleanup, verification read (FR-121, L9) |
| In-flight idle / long step | checkpoint cadence <= 5 s (008 `safety-checkpoint-contract.md` §Required behavior 4) | |
| Reverify | fresh `resolvePlan(REVERIFY)`, `destination = Issue.location` (FR-145, FR-151) | no reuse of the original plan |

**Production matrix**: C0 on ordinary responses, derived C0 (API surface, advisory), and 011 static evidence run in
production; everything else is `RESTRICTED_TO_NON_PRODUCTION` and refused (`SEC_PRODUCTION_PROHIBITED`). F01 FR-015a already
forbids `PRODUCTION` in the grant of both active classes; the 012 filters are defense in depth, not the primary control.
Environment is read at each check; a STAGING->PRODUCTION reclassification stops requests through F07
(`ENVIRONMENT_RECLASSIFIED`) and is never "healed" by reclassifying back within the same unit (FR-014).

**Redirect and destination rules (FR-079, FR-081, FR-083)**: every destination (initial, redirect hop, OpenAPI `servers`
entry, URL embedded in a probe or in a response) passes `isInScope` through the checkpoint and safe-net layers 1-4 (scheme,
literal IP, DNS pin, connect guard). Default is **no automatic cross-origin redirect following**: a cross-origin or
out-of-scope hop is recorded `SEC_REDIRECT_OUT_OF_SCOPE` as an observation, not followed, not a finding; a same-origin
hop (<= 3) is followed only when the parent matches it to a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation (FR-200(e)) and is then fully re-admitted. `Authorization`, `Cookie` and custom auth headers are never forwarded off-origin (safe-net
stripping retained). A destination derived from response content, a customer-controlled redirect, or an OpenAPI `servers`
list is data, never a request target by itself. 012 adds no allow-list entry; `SAFE_NET_ALLOW_TARGETS` is test-only.
Prohibited destination classes (metadata, link-local, loopback, RFC1918, alternate encodings, IPv6-mapped, rebinding) surface as
`SEC_DESTINATION_PROHIBITED` / `SEC_SAFE_NET_REFUSED`.

## Failure states

| Condition | Verdict / status | Reason |
|-----------|------------------|--------|
| PRODUCTION target, class >= C1 | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` |
| Target has no environment | `BLOCKED` | `SEC_ENVIRONMENT_UNCLASSIFIED` |
| No active grant for class | `BLOCKED` | F01 `NO_MATCHING_GRANT` (verbatim) |
| Grant revoked / expired / budget / out of scope | `BLOCKED` | F01 `REVOKED` / `EXPIRED` / `BUDGET_EXHAUSTED` / `OUT_OF_SCOPE` / `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED` |
| Category absent from grant | `BLOCKED` | `SEC_ACTION_CATEGORY_NOT_GRANTED` |
| Identity/role outside grant allow-list | `BLOCKED` | `SEC_IDENTITY_NOT_IN_SCOPE` |
| Mutation consent flag off | `BLOCKED` | `SEC_CONSENT_MISSING` |
| Gate internal error | `BLOCKED` | `SEC_SCOPE_GATE_ERROR` |
| Redirect hop out of scope | `BLOCKED` (observation) | `SEC_REDIRECT_OUT_OF_SCOPE` |
| Destination class prohibited / safe-net refusal | `BLOCKED` | `SEC_DESTINATION_PROHIBITED` / `SEC_SAFE_NET_REFUSED` |
| Class C4/C5 requested | `UNSUPPORTED` | registry reason (`SEC_UNSUPPORTED_TARGET_TYPE`, `SEC_OOB_UNSUPPORTED`, `SEC_TLS_INSPECTION_UNAVAILABLE`, `SEC_PROBE_CLASS_UNSUPPORTED`) |
| Flag/gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| F07 stop at any call site | unit `CANCELLED`/`KILLED`/`REFUSED` per 009 | F07 reason verbatim (`KILL_SWITCH_PENDING`, `BUDGET_EXHAUSTED_REQUEST`, `BUDGET_EXHAUSTED_CONCURRENCY`, `INTERNAL_ERROR`) |

## Idempotency & retry

`resolveSecurityChecks` is pure apart from F01 reads; re-running yields identical entries for identical inputs and is safe
to repeat. The gate is stateless. Retry of a refused call is only a fresh call with different inputs (007 rule 3); there is
no soft-refuse retry. Units carry `maxAttempts: 1` (FR-057).

## Evidence

Planning refusals: `SECURITY_CHECK_RESULT` with `{checkId, checkVersion, classification, verdict, reason, scopeKey}` and no
URLs with query values, identities or secrets. Gate denials at run time: audit via 008 `recordExecutionAuditEvent` redacted
`payload` (existing event types only) and the unit's check result; never new enum values.

## Budgets/limits

Context A consumes budgets and does not own them. **F07-authoritative**: request count, concurrency, duration (grant
expiry). **LOCAL — not F07-ledgered**: per-check `maxRequests`, per-endpoint (<= 8), per-identity, auth attempts (default 3,
hard max 5), redirect depth (0 cross-origin, <= 3 planned same-origin hops) — pre-checked by `LocalBudget` in
`active-security-execution-contract`. Class ceilings (plan.md §Budgets) are tighter than F07's; never looser.

## Reverify

Re-resolves the check classification from the registry definition at the pinned major version, re-reads the environment, and
calls `isAuthorized` for the concrete destination bound from `Issue.location` by `parseSecurityLocation` (FR-163; an unbindable location is `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`). 012 namespaces are routed to the 009 REVERIFY path before the legacy resolver (FR-164). A stored `SecurityPlanEntry` is never replayed. If classification would now
differ, the check is `INCONCLUSIVE` `SEC_REVERIFY_UNVERIFIABLE`.

## Boundary rules (MUST NOT)

1. MUST NOT derive classification from the HTTP method or from a self-declared field.
2. MUST NOT default-permit on missing environment, grant, category or identity data.
3. MUST NOT cache an allow decision across actions, units or reverify.
4. MUST NOT call `isAuthorized` directly at run time for a safety-sensitive action; use `safetyCheckpoint`.
5. MUST NOT relabel a check passive (or lower its class) to run it in production.
6. MUST NOT treat a verified domain as authority for credential use, mutation, repetition or production active action.
7. MUST NOT add a `ModuleType`, execution class, scheduler, budget ledger or authorization service.
8. MUST NOT follow a cross-origin redirect automatically, or forward auth headers off-origin.
9. MUST NOT request a destination taken from response content or an OpenAPI `servers` entry without the FR-079 checks.
10. MUST NOT rename or paraphrase F01/F07/009 reason strings; they pass through verbatim.

## Named limitations

- **F01 does not enforce account / role / action category.** 007 defines the shapes and gives `isAuthorized` no such
  parameters; enforcement is by `securityScopeGate` (012 code) plus conformance tests, the same governance model as 008
  FR-019. A bug in the gate is not caught by F01. Optional hardening AR-1 (pass category/account into `isAuthorized`) is
  not required for safety.
- The gate's identity and role view is a read of 012's own registry rows; it relies on their integrity.
- Plan-time authorization is representative; run-time freshness is the control (007 FR-024).

## FR traceability

FR-001, FR-002, FR-003, FR-004, FR-005, FR-006, FR-007, FR-008, FR-009, FR-010, FR-011, FR-012, FR-013, FR-014, FR-015,
FR-077, FR-078, FR-079, FR-081, FR-083 (enforcement points); consumed-by FR-055 (step order), FR-072, FR-121 (3-unit reservation), FR-161 (dual-class rule), FR-163 and FR-164 (reverify binding/routing).

## Acceptance tests required (named, deterministic, fixture-based; not executed now)

- `scope.classify.method-independent`: state-changing GET fixture -> C2; read-only search POST fixture -> C1.
- `scope.classify.declared-mismatch-rejected`: registry entry declaring C0 for a crafted-`Origin` probe fails load.
- `scope.classify.c4c5-no-probe`: entry with class C5 and a probe definition fails load.
- `scope.plan.production-active-blocked`: PRODUCTION target -> every C1+ entry `BLOCKED` `SEC_PRODUCTION_PROHIBITED`; C0 entries `PLANNED`.
- `scope.plan.unclassified-blocked`: no environment -> `SEC_ENVIRONMENT_UNCLASSIFIED`.
- `scope.plan.no-grant-passthrough`: no grant -> reason string equals `NO_MATCHING_GRANT` byte-for-byte.
- `scope.gate.category-matrix`: one case per category (7) x {listed, unlisted, empty list} against the documented rules.
- `scope.gate.fixture-mutate-needs-consent`: category listed but consent off -> `SEC_CONSENT_MISSING`.
- `scope.gate.identity-allowlist`: identity id not in `includedAccountRefs` -> `SEC_IDENTITY_NOT_IN_SCOPE`; role outside `includedRoles` likewise.
- `scope.gate.fail-closed`: injected throw/timeout in gate -> `SEC_SCOPE_GATE_ERROR`, zero requests.
- `scope.gate.no-cache`: grant revoked between two actions -> second action denied.
- `scope.redirect.cross-origin-not-followed`: 302 to other origin -> `SEC_REDIRECT_OUT_OF_SCOPE`, no second request, auth headers absent.
- `scope.destination.rebinding-metadata`: resolver stub flips to 169.254.169.254 -> `SEC_SAFE_NET_REFUSED`.
- `scope.reclassify.no-heal`: STAGING->PRODUCTION->STAGING mid-unit -> stays stopped.
- `scope.reverify.fresh-authz`: grant expired before reverify -> `EXPIRED` verbatim, no fallback to old plan.

## Resolved additions

1. Empty `includedActionCategories` semantics: **L27** - 007 gives no semantics; 012 defines empty = READ + NEGATIVE_PROBE only (FR-011); stated in the 007 field table and category rules above.
2. Non-empty list vs empty default reconciliation: **L27** - non-empty = closed allow-list; empty = READ + NEGATIVE_PROBE (category rules unchanged).
3. C4/C5 refusal reason: **L11** - `SEC_PROBE_CLASS_UNSUPPORTED` accepted for C4/C5 registry entries (a separate "check class unsupported" code was rejected as a duplicate); added to plan-resolution step (c) and the failure table.
4. Composite/credentialed crafted routing: **L2 / FR-161** - required-class table updated.
5. Mutation reservation: **L9 / FR-121** - 3 request units.

## Open for closure

No item is open. The call-site to action-category mapping is decided in Consolidated repairs item 6.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Plan-resolution precedence (F-25)**: the environment filter (PRODUCTION/unclassified/cool-off) runs **before** the F01 call, and the address binding and Destination Authorization Policy checks (below) run after the filter and before F01. A PRODUCTION target therefore yields `SEC_PRODUCTION_PROHIBITED` (never `NO_MATCHING_GRANT`); a non-production target without a grant yields the F01 reason verbatim. Fixture PF01 (T400) is STAGING; its PRODUCTION twin expects `SEC_PRODUCTION_PROHIBITED`.
2. **Undeclared operations (G-10, FR-007)**: `computeClassification` treats an operation with no current customer declaration (`ApiOperationDeclaration`, FR-192) as potentially mutating for every HTTP method; active probes are refused `SEC_MUTATION_NOT_PERMITTED` unless the operation is declared read-only or fixture-confined with consent. Static (C0) checks still run. Test `T-API-undeclared-GET`.
3. **Environment integrity (G-12, FR-176)**: (a) no lease and no active dispatch within a 24 h cool-off after any reclassification **from** PRODUCTION (`SEC_ENVIRONMENT_COOLOFF`); (b) a current `SecurityConsentRecord` with `nonProductionAttested` is required per active/authenticated plan; (c) a host ever PRODUCTION-classified, or a tenant production Target on the same registrable domain, requires re-attestation. State plainly in reports: production prohibition is "customer-attested non-production". Test `scope.reclassify.cooloff`.
4. **Single definition of "crafted" (G-11, FR-008/FR-161)**: any request under an identity other than the fixture owner against the owner's fixture is a `NEGATIVE_PROBE` (E14 dual-class); E15 single-class covers login/logout/refresh and same-identity reads only. The required-class table is read accordingly.
5. **Time source (G-14, FR-178)**: every `now` given to `isAuthorized`, `safetyCheckpoint` and broker expiry is the database clock; worker clocks are ignored; skew > 2 s alerts. Test `time.worker-clock-slow`.
6. **Call-site to action-category mapping (closes the inferred-mapping item)**: `HTTP_REQUEST`/`REDIRECT_HOP` => the check's declared category (`READ` or `NEGATIVE_PROBE`); `LOGIN_ATTEMPT` and `SESSION_REFRESH` => `AUTH_LOGIN`; `LOGOUT` => `AUTH_LOGOUT`; `FIXTURE_MUTATION` => `FIXTURE_MUTATE`; `FIXTURE_CLEANUP` => `FIXTURE_CLEANUP`. Call-site names are audit/idempotency labels, not `safetyCheckpoint` parameters (F-36).
7. **Consent enforcement points (B-8, FR-177).** 012 cannot gate 007 `createAuthorization` (AR-14). Consent is checked at: plan resolution (API), dispatch (parent; including uncredentialed `C1` units), broker issue, every permit mint (FR-190) and the mutation-class gate; the record must match the live `disclosureVersion` and not be superseded. A lookup error is `SEC_SCOPE_GATE_ERROR` (fail closed); missing/stale => `SEC_CONSENT_MISSING`.
8. **Resolver principal (B-2, FR-173).** Plan-time resolution and unit stamping run in `apps/api`; the gate library used per request in the worker never signs anything.
9. **Sensitive-class workflows (FR-117).** Dispatch requires the `run.sensitive_confirmed` audit event for the run; non-interactive runs refuse (`SEC_CONSENT_MISSING`).
10. **Fail-closed matrix (FR-190)** is normative for every dependency the gate reads (clock, consent, cool-off/environment, registry, address pin).
11. **Verified Address Binding (FR-172).** Preconditions for any ACTIVE_SECURITY/AUTHENTICATED_WORKFLOW use of a hostname: Target verified by HTTP file (a DNS-TXT-only Target is refused `SEC_TARGET_ADDRESS_UNVERIFIED`); plan resolution (API) requires a `PROVEN` `TargetAddressProof` <= 24 h and performs no network proof itself; the proof is produced by the `AddressProofClient` (safe-net, rate-limited per hostname via `level1RateBound`) in API/parent, never by the engine child, is ownership-verification traffic (not F01, not F07), is never sent before the dispatch checkpoint passes, and is audited (`address_proof.run`). At most 4 candidates; more than 4 or any non-public candidate refuses the hostname (never truncated). Only the default ports are supported (443 for the target, 80 for the address-control proof); plain-HTTP targets and non-default ports are refused (`PLAINTEXT_TARGET`, `NON_DEFAULT_PORT`, `SEC_UNSUPPORTED_TARGET_TYPE`; P18 default unsupported) and every proof and pin is bound to (hostname, port). Hostname proof: direct connect to the candidate, TLS >= 1.2, SNI = hostname, ALPN `http/1.1`, full validation, no redirects, token match, record the SPKI hash (invalid certificate => `SEC_TARGET_TLS_UNVERIFIED`; private-CA/self-signed unsupported in v1, P18). Address-control proof: plain HTTP port 80 `GET http://<ip>/<path>?<fresh random value>` with `Host: <ip>` and `Cache-Control: no-cache` for every candidate (a response with `Age` > 0, a cache-hit indicator or a status other than 200 is refused; the token is the tenant's public verification token, so the proof shows only that the address's default virtual host serves the tenant's file); a destination that cannot answer there (HTTPS-only, redirect, closed port) fails with class `NO_DEFAULT_VHOST` and is refused; the unauthenticated channel's exposure to an on-path injector is a stated limitation mitigated by the TLS hostname proof, the SPKI pin and 5-minute re-proof. The connect guard is pinned to the `provenAddressSet` and the SPKI hash for the unit's life; a peer outside the set or a changed SPKI refuses. Wildcard scopes prove each hostname; IP-literal destinations are never in scope; `allowedSubset` may only narrow. **The proofs establish control of the serving address and hostname content only; they do NOT establish ownership of an upstream origin** (see the next item). Tests: DNS-TXT-only refused; attacker-declared address set ignored; mid-unit re-point refused; shared edge fails address-control; HTTPS-only target `NO_DEFAULT_VHOST`; invalid certificate refused; SPKI change refused; proof-path rate limit => `SEC_TARGET_ADDRESS_UNVERIFIED`; IP literal refused; proof traffic not counted as F07 and not sent before the checkpoint.
12. **Destination Authorization Policy (FR-197; P16 PENDING, fail-closed default).** Proofs cannot show origin ownership: a tenant-controlled reverse proxy or forwarder can pass every proof and relay probes to a third party. This is a security limitation, and authorization is established by policy, not proof and not by customer attestation alone. Active or authenticated use requires ALL of: VAB class `DIRECT_PROVEN`; a current `SecurityConsentRecord` with the origin-ownership warranty (accountability, not proof); a current operator-created `ActiveTestingEnablement` (bound to the Target and hostnames, <= 90 days, revocable, audited); and the containment controls (identifying `User-Agent` `FahesSecurityScan/<id>` and `X-Fahes-Scan-Id` on every probe, published source ranges and abuse contact, per-tenant active-request ceilings by trust tier, tenant-scope kill switch on an abuse report). Until P16 is approved and the enablement process exists, active/authenticated execution is refused for every destination with `SEC_DESTINATION_AUTHORIZATION_UNMET`. A forwarder remains undetectable and the report never claims the origin was proven owned. Tests: `scope.dap.default-refuse`, `scope.dap.warranty-missing-refused`, `scope.dap.enablement-expired-refused`, `scope.dap.forwarder-fixture-passes-proofs-but-needs-enablement`, `scope.dap.identifying-headers-present`.
13. **Per-class grant consistency (B-13, FR-195).** The primary-class checkpoint's grant id must equal the gate's primary-class grant id and the secondary-class checkpoint's grant id the gate's secondary-class grant id; one grant listing both classes yields equal ids, two grants yield different ids and both are valid (FR-161); any other mismatch => `SEC_SCOPE_GATE_ERROR`. Render-time assertion (G-34d): the rendered request is verified inside the computed class envelope before the gate runs.
