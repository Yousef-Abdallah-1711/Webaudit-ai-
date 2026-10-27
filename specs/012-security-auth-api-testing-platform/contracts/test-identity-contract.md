# Contract: Test Identity, Test Role and Fixture Resource

Per FR-005, FR-019, FR-030, FR-042, FR-051, FR-091 through FR-097, FR-114, FR-117, FR-119, FR-125, FR-126 and Clarifications
(P1 customer-controlled accounts; mutation default OFF). Defines the customer-declared data that makes authenticated,
authorization and business-logic checks possible, how it is validated, and how it maps onto F01 scope fields. Planning only.

## Status / Ownership

Owner: SPEC 012, Context B/G (registration, validation) with consumption by Contexts A, C, F, G, I. Durable, tenant-owned,
customer-declared records (`TestIdentity`, `TestRole`, `FixtureResource`; entity shapes in `data-model.md`). Control-plane routes
in `apps/api/src/services/security/`. Status: planning, not frozen. **PRODUCT DECISION — PROVISIONAL P1: customer-provided test
accounts are mandatory** for any authenticated, authorization or business-logic check.

## Consumers

1. `securityScopeGate` and plan resolution (`security-scope-contract.md`) — resolve `identityRef` / role / allow-lists.
2. Credential Broker (`credential-broker-contract.md`) — checklist step 7 (identity within grant lists).
3. `SessionHost` (`auth-session-contract.md`) — one isolated jar per identity.
4. Authorization testing domain (`authorization-testing-contract`, Context G): `AuthorizationExpectation` matrix, pairwise comparisons.
5. Business-logic domain and `mutation-cleanup-contract` — `FixtureResource` registry, `maxMutations`, reset method.
6. `securityCoverageSummary` — identities/roles tested, fixture limitations.

## Inputs

- Authenticated owning tenant user (`userId`); a verified Target and its environment classification (007 Target registry).
- Customer-declared: role definitions (`TestRole.key`, label, privilege rank hint), identities, fixture resources, recovery sinks,
  `AuthorizationExpectation`, `BusinessInvariant` (the last two are separate contracts; they reference ids defined here).

## Outputs

```text
TestRole      = { id, userId, targetId, environment, key /* stable, [a-z0-9_-]{1,40} */, label, privilegeRankHint?: int }
TestIdentity  = { id, userId, targetId, environment, roleId, label, tenantFixtureKey?, state: DRAFT|ACTIVE|DISABLED|RETIRED,
                  credentialReferenceIds[] /* <=1 ACTIVE per kind */, mfaMode: DISABLED_FOR_TEST | SESSION_FIXTURE_ONLY, createdAt }
FixtureResource = { id, userId, targetId, environment, ownerIdentityId, resourceKind, locatorTemplate /* WebDestination template */,
                    markerSpec /* oracle: how to recognise the fixture's own data */, resetMethod: FIXTURE_CLEANUP_REQUEST | CUSTOMER_FIXTURE_RESET | MANUAL | NONE,
                    resetEndpointRef?, maxMutations: int<=3, sandboxConfirmed: bool, state, createdAt }
RegistrationResult = { ok: true, id } | { ok: false, validation: ValidationFailure[] }   // API error, not a check verdict
```

`TestIdentity.id` is the value stored in 007 `includedAccountRefs`; `TestRole.key` is the value stored in `includedRoles`.

## Operations

```text
registerRole(user, targetId, {key, label, privilegeRankHint?}) -> RegistrationResult
registerIdentity(user, targetId, {label, roleKey, mfaMode, tenantFixtureKey?}) -> RegistrationResult
attachCredential(user, identityId, credentialReferenceId) -> RegistrationResult          // via secrets-management-contract
registerFixtureResource(user, targetId, {ownerIdentityId, resourceKind, locatorTemplate, markerSpec, resetMethod, maxMutations, sandboxConfirmed}) -> RegistrationResult
retireIdentity | disableIdentity | retireFixture(user, id) -> ok
resolveIdentitiesForCheck(check, grant, target) -> {identities[], limitation?: SEC_FIXTURE_LIMITATION | SEC_IDENTITY_ROLE_UNMAPPED | SEC_FIXTURE_MISSING}  // pure read
```

### Validation rules (all enforced at registration **and** re-checked at plan resolution, broker issue and reverify)

1. **Same tenant**: every referenced record (`role`, `identity`, `credentialReference`, `fixture`) has the caller's `userId`; a cross-tenant reference is refused as not-found.
2. **Same Target**: identity, role, credential reference and fixture share one `targetId`; Fahes never tests across Targets (007 FR-013, spec Clarifications on APIs).
3. **Environment non-production and equal**: `environment` is `STAGING` or `DEVELOPMENT`, equal across the identity, its credential reference, its fixtures and the Target's **current** classification; PRODUCTION/unclassified is refused at registration and fails closed at use (`SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`). A Target reclassified to PRODUCTION makes every identity, credential and fixture unusable immediately (FR-029).
4. **Role mapping**: `roleId` must resolve to a `TestRole` on the same Target; an identity without a role is stored `DRAFT` and any check needing it is `NOT_TESTED` `SEC_IDENTITY_ROLE_UNMAPPED`. One role per identity (FR-030).
5. **Credential binding**: <= 1 `ACTIVE` credential reference per `(identity, kind)`; kinds limited to `PASSWORD_LOGIN`, `API_KEY_HEADER`, `BEARER_TOKEN`, `SESSION_FIXTURE`; the reference's own `testIdentityId` must equal the identity.
6. **MFA**: only `DISABLED_FOR_TEST` (customer asserts MFA is disabled/exempt for this identity in the test environment) or `SESSION_FIXTURE_ONLY` (a `SESSION_FIXTURE` credential with declared expiry). TOTP-seed / SMS / email OTP / human-assisted modes are refused (`SEC_MFA_CHALLENGE_UNSUPPORTED`).
7. **Fixture validity**: `locatorTemplate` host/scheme/port must be the Target's authorized host (FR-067) and path template parameterized only from the fixture itself; `ownerIdentityId` is a registered identity of the same Target; `markerSpec` is mandatory for any fixture used as an authorization oracle (a fixture without a marker can only yield `LIKELY`, FR-094); `maxMutations` is an integer 0..3 (FR-125; default 0 = read-only fixture); `resetMethod = NONE` with `maxMutations > 0` is refused (cleanup would be impossible, FR-119).
8. **Payment/refund/purchase/inventory/messaging fixtures**: allowed only with `sandboxConfirmed: true` and recorded as "customer-asserted fixture safety" (FR-117). Fahes cannot verify it.
9. **Tenant-boundary fixtures**: two `tenantFixtureKey` values within the **same** Fahes tenant and Target (FR-097); a key shared across Fahes tenants is impossible (rule 1).
10. **Cardinality**: <= 4 concurrently used identities per unit (FR-051); <= 20 identities, <= 20 roles, <= 200 fixtures per Target (provisional LOCAL limits).
11. **Admin identity**: an identity whose role is marked `privilegeRankHint` highest may be registered only with `usage: FIXTURE_OWNER` for authorization tests (FR-095); it is never selected as an attacker identity by the resolver. A vertical test requires a customer-registered low-privilege identity and customer-listed privileged operations.
12. **No inference**: role/identity/fixture relationships are what the customer declared; the resolver never infers roles from responses, never discovers identifiers (FR-092).

### Mapping to F01 scope refs

| 012 record | 007 field | Value |
|------------|-----------|-------|
| `TestIdentity` | `includedAccountRefs[]` | `TestIdentity.id` |
| `TestRole` | `includedRoles[]` | `TestRole.key` |
| Check/step declaration | `includedActionCategories[]` | closed set in `security-scope-contract.md` |

Grants list ids/keys only; the grant never stores usernames or secrets. An empty `includedAccountRefs` means any registered
identity of the Target (identities remain bound by rules 1-3). F01 does not enforce these lists (named limitation in
`security-scope-contract.md`); 012's gate and the broker do.

### Multi-role accounts (P1 detail, FR-030)

One identity has exactly one role. A real-world user who holds several roles is registered as **several identities** (one per
role, each with its own credential reference) so sessions and evidence never conflate roles (FR-042). Tests needing "role A and
role B" use two identities; the resolver reports `INCONCLUSIVE` `SEC_FIXTURE_LIMITATION` when only one role/identity exists for a pairwise check.

### What Fahes never does

- Never creates, provisions, self-registers, resets the password of, or recovers an account on the target.
- Never guesses, brute-forces, stuffs, harvests, scrapes or infers credentials, usernames, tokens or account identifiers (C5; FR-087, FR-092).
- Never enumerates identifiers; object ids come only from `FixtureResource.identifiers` (FR-092); response-derived identifiers are never used in v1.
- Never tests a third-party or other-tenant account; never uses an unregistered administrative credential (FR-095).
- Never creates fixtures on the target implicitly; creation is an explicit declared `FIXTURE_MUTATE` workflow step (FR-126).
- Never stores identity usernames in evidence, logs, audit or AI prompts; it stores `TestIdentity.id`, role key class and `credentialVersionId`.

### Fixture ownership and limits

A fixture is owned by one identity (the "owner"); authorization probes request it as another identity. Per fixture: `maxMutations <= 3`;
per unit <= 10; reset by the customer's declared endpoint (called as an authorized `FIXTURE_CLEANUP` step, 3 request units reserved locally per mutation: action, cleanup, verification read, FR-121) or marked `MANUAL` (cleanup becomes `SEC_CLEANUP_UNVERIFIED` unless a read verifies the state). The platform counts mutations in `MutationIntent`
(`mutation-cleanup-contract`) so limits survive crashes. A fixture in `RESIDUAL_UNKNOWN`/`RESIDUAL` state is excluded from later plans (`BLOCKED` `SEC_FIXTURE_RESIDUAL_BLOCKED`) until the customer acknowledges it. Residual manifests are written by the parent-side finalizer (FR-162), not the unit.

## Invariants

1. Every identity, role, credential reference and fixture of a check share `userId`, `targetId` and a non-production `environment` equal to the Target's current classification.
2. `TestIdentity.id` and `TestRole.key` are the only values placed in 007 `includedAccountRefs` / `includedRoles` by 012.
3. An identity has exactly one `TestRole`; at most one `ACTIVE` credential per kind.
4. No probe request path or object identifier originates outside a registered `FixtureResource` (response-derived identifiers are never used).
5. A fixture with `maxMutations > 0` always has a reset method other than `NONE`.
6. A fixture with no `markerSpec` never yields `CONFIRMED_VULNERABILITY`.
7. An admin/high-privilege identity is never chosen as the requesting (attacker) identity.
8. Registration never contacts the target.
9. State changes (disable/retire) take effect immediately for plan resolution and broker issue (re-read each time).
10. Identity usernames and fixture locators never appear in logs, evidence, AI prompts or reports beyond `id` and role-key class.

## Safety & Authorization

- **F01/F07**: registration is control-plane only and performs no target action; therefore no F01/F07 call. Registration is *not*
  authorization: use of any record still requires an active grant listing the class and categories (including `FIXTURE_MUTATE` consent) and a checkpoint per request.
- **Production**: refused at registration; fails closed at use; reclassification makes records unusable (rule 3).
- **Consent**: `FIXTURE_MUTATE`/side-effect classes are default OFF, enabled per grant-scoped consent (spec Clarifications). Registering a fixture does not enable mutation.
- **Customer responsibility notice** (consent copy is U30/F06, out of scope): the customer attests that identities are theirs, test-only, and that fixtures are safe to mutate.

## Failure states

| Condition | Verdict / status | Reason |
|-----------|------------------|--------|
| Registration validation failure (rules 1-9) | API error `ValidationFailure[]` | (no verdict; field-level codes) |
| Identity has no role | `NOT_TESTED` | `SEC_IDENTITY_ROLE_UNMAPPED` |
| No fixture for check | `NOT_TESTED` | `SEC_FIXTURE_MISSING` |
| Fixture fails validation at plan/run (env changed, host mismatch, retired) | `BLOCKED` | `SEC_FIXTURE_INVALID` |
| Fewer identities/resources than the check needs | `INCONCLUSIVE` | `SEC_FIXTURE_LIMITATION` |
| Identity not in grant allow-list | `BLOCKED` | `SEC_IDENTITY_NOT_IN_SCOPE` |
| MFA mode unsupported | `BLOCKED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` |
| Missing credential on identity | `BLOCKED` | `SEC_CREDENTIAL_MISSING` |
| Mutation consent missing | `BLOCKED` | `SEC_CONSENT_MISSING` |
| No recovery sink for a recovery check | `NOT_TESTED` | `SEC_SIDE_EFFECT_FIXTURE_MISSING` |
| No expectation / invariant | `NOT_TESTED` | `SEC_EXPECTATION_MISSING` / `SEC_INVARIANT_UNDEFINED` |
| Target is PRODUCTION / unclassified | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Residual fixture from earlier run not acknowledged | `BLOCKED` | `SEC_FIXTURE_RESIDUAL_BLOCKED` (`SEC_RESIDUAL_FIXTURE` remains the FLAG for residue left by a run) |

## Idempotency & retry

Registration calls carry an `idempotencyKey`; same key returns the first result. `(userId, targetId, key)` is unique for roles;
`(userId, targetId, label)` unique for identities. Registration is never retried against the target (nothing to retry). Resolver reads are pure.

## Evidence

No Evidence is produced by registration. Scan Evidence references `TestIdentity.id`, role key, `credentialVersionId`, `FixtureResource.id`;
`PERMISSION_COMPARISON` records identity/role/fixture **ids and outcome classes** only. Fixture markers are matched in memory; only the
boolean oracle result and a length class are stored. Audit via `AuditLogEntry` without usernames or secrets.

## Budgets/limits

**F07-authoritative**: none consumed at registration. **LOCAL**: counts in rule 10; `maxMutations` <= 3 per fixture and <= 10 per unit
(FR-125); <= 4 identities per unit. These are labeled "LOCAL — not F07-ledgered" in reports.

## Reverify

Reverify re-validates all rules for the identities/fixtures the original finding used (existence, state, environment, credential
state via broker, fixture reset capability, mutation consent). A retired identity or fixture -> reverify `INCONCLUSIVE`
`SEC_FIXTURE_MISSING` / `SEC_FIXTURE_INVALID` / credential reason; the original finding is kept. Mutating reverify needs current consent and a fresh fixture state read (FR-152).

## Boundary rules (MUST NOT)

1. MUST NOT create, guess, harvest, brute-force or infer accounts, credentials, roles or identifiers.
2. MUST NOT test any resource not registered as a fixture or any identity not registered by the tenant.
3. MUST NOT permit registration across tenants, Targets or for a PRODUCTION/unclassified environment.
4. MUST NOT use a high-privilege identity as the attacker side of a probe.
5. MUST NOT register a mutating fixture without a reset method and a `maxMutations` cap.
6. MUST NOT contact the target at registration or to "verify" an identity.
7. MUST NOT persist usernames, locators or secrets in evidence, logs, audit, AI input or reports.
8. MUST NOT combine identities from different Targets or tenants in one comparison.
9. MUST NOT treat `sandboxConfirmed` as verified fact; reports state it is customer-asserted.

## Named limitations

- Fahes cannot verify that an identity is truly test-only, that MFA is truly disabled, that a fixture is truly isolated or that a "sandbox" payment endpoint is fake (FR-117); these are customer assertions.
- A customer with only one identity gets `INCONCLUSIVE` for every pairwise check; no workaround by inference.
- Role semantics (which role is "higher") are customer hints; Fahes does not learn the target's permission model.
- Identity data lives in a tenant-owned table; its integrity is a precondition for `securityScopeGate` (see scope contract limitation).

## FR traceability

FR-005, FR-019, FR-030, FR-042, FR-051, FR-091, FR-092, FR-093 (matrix references), FR-094, FR-095, FR-096, FR-097, FR-114, FR-117, FR-119, FR-121 (3-unit reservation), FR-125, FR-126, FR-162 (residual manifest by finalizer), FR-167 (identities, roles and fixtures purged on account deletion); supports FR-011/FR-012 (ref semantics) and FR-087.

## Acceptance tests required (named, deterministic, fixture-based; not executed now)

- `identity.register.cross-tenant-refused`: role/credential/fixture of tenant B referenced by tenant A -> not-found validation error.
- `identity.register.cross-target-refused`: identity on target X with fixture on target Y rejected.
- `identity.register.production-refused`: PRODUCTION/unclassified Target rejected; later reclassification -> plan `BLOCKED` `SEC_PRODUCTION_PROHIBITED`.
- `identity.role.unmapped`: identity without role -> check `NOT_TESTED` `SEC_IDENTITY_ROLE_UNMAPPED`.
- `identity.multirole.two-identities`: user with 2 roles registered as 2 identities; one-identity pair test -> `INCONCLUSIVE` `SEC_FIXTURE_LIMITATION`.
- `identity.mfa.unsupported-modes`: TOTP/SMS mode refused at registration and `SEC_MFA_CHALLENGE_UNSUPPORTED` at use.
- `identity.fixture.reset-required`: `maxMutations=2`, `resetMethod=NONE` rejected; `maxMutations=4` rejected.
- `identity.fixture.no-marker-no-confirm`: fixture without marker yields at most `LIKELY` in the PERMISSION_COMPARISON fixture.
- `identity.scope-refs.mapping`: grant `includedAccountRefs` holds ids only; usernames absent; allow-list enforced by gate and broker.
- `identity.admin-not-attacker`: resolver never selects the admin-ranked identity as requester.
- `identity.no-enumeration`: probe resolver fixture never emits an object id absent from the fixture registry; a `RESPONSE_DERIVED` slot in a path position or used as an identifier and a redirect `Location` carrying an identifier outside the plan-known list are refused (MA-02).
- `identity.no-secret-in-evidence`: PERMISSION_COMPARISON/audit scan finds no username, locator or credential value.
- `identity.residual-fixture-excluded`: fixture with `RESIDUAL` state not planned until acknowledged; check `BLOCKED` `SEC_FIXTURE_RESIDUAL_BLOCKED`.

## Resolved additions

1. Residual-fixture blocking code: **L11** - `SEC_FIXTURE_RESIDUAL_BLOCKED` added to the registry; failure table, fixture section and test updated (`SEC_FIXTURE_INVALID` no longer used for this case).
2. Mutation reservation: **L9 / FR-121** - 3 request units (was 2).

## Open for closure

No item is open. `DRAFT`, `usage`, per-Target counts and the canonical field names are carried by data-model 4.4-4.6 (Consolidated repairs items 1, 4 and 8).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Canonical names**: field names follow `data-model.md` §4.4–4.6 (`displayLabel`, `privilegeTier`, `testRoleId`, `ownerTestIdentityId`, key regex `[a-z0-9_.-]`); contract spellings `label`/`privilegeRankHint`/`roleId`/`ownerIdentityId` are aliases to be renamed (F-9).
2. **Reset method (F-2)**: one set `FIXTURE_CLEANUP_REQUEST | CUSTOMER_FIXTURE_RESET | MANUAL | NONE`; `NONE` with `maxMutations > 0` is refused; `maxMutations` defaults to 0 (read-only).
3. **Oracle (F-3, G-17)**: the fixture's `markerSpec` is the only oracle vocabulary (`MARKER_FIELD | MARKER_ABSENCE_SHAPE | STATE_READBACK`), marker value >= 16 characters, registered in the exact-value registry, absent from the actor's own resources.
4. **Usage default-deny (G-23, FR-095)**: identities default `usage = UNSET` (not selectable as an actor); actor use requires explicit `ACTOR_ALLOWED`; highest `privilegeTier` or unset tier on a multi-role target is high-privilege; empty `includedAccountRefs` never authorizes a high-privilege or `UNSET` identity.
5. **Side-effect attestation (G-38, FR-088)**: registration records `sideEffectSinksAttested`; login checks require it.
6. **Fixture identifiers (G-27, FR-092)**: only `FixtureResource.identifiers`; no response-derived identifiers; collection locators refused unless `collection:true` with `maxCollectionSize`.
7. **Residual state**: `RESIDUAL_UNKNOWN` is a derived view of the latest `MutationIntent` (`RESIDUAL`), not a stored state; exit via the customer-only audited `ACKNOWLEDGED` transition (FR-184); a residual fixture is blocked `SEC_FIXTURE_RESIDUAL_BLOCKED`.
8. **Mutation cost**: 3 reserved request units per mutation (FR-121). Consent is read from `SecurityConsentRecord` (FR-177), not a fixture column. Per-Target limits 20 identities / 20 roles / 200 fixtures are confirmed in the data model; `DRAFT` identity state and `IdentityUsage` are carried there. DTO allow-lists/RLS per FR-182.
9. Identifiers come only from `FixtureResource.identifiers` (FR-092); earlier clauses allowing a validated response id are withdrawn.
10. **Attempt-window fields (FR-191)** live on the identity: `authAttemptWindowStart`, `authAttemptCount` (SENT attempts), `authFailureCount`, `lockoutSignalAt`, `credentialSuspectAt`; reservation state lives in `AuthAttemptReservation` (data-model 4.9F), not on the identity; written only through the broker operations, never by client DTOs (FR-182).
