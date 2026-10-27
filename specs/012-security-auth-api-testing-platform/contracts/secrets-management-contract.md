# Contract: Secrets Management (Context B — credential vault)

Per FR-016 through FR-030 and FR-024, FR-025, FR-026, FR-127, FR-128. Defines how customer-provided test credentials are
stored, versioned, rotated, revoked, expired and destroyed. Delivery to a running unit is `credential-broker-contract.md`;
identities and roles are `test-identity-contract.md`. Planning only; no code, schema or infrastructure is created.

## Status / Ownership

Owner: SPEC 012, Context B. Code home planned: `apps/credential-broker/` (vault tables, KMS client, unwrap) and
`apps/api/src/services/security/` (write-only control-plane routes that hand ciphertext/metadata to the vault). Status:
planning, not frozen; gated by SG3, SG4, SG8, SG9, SG10. KMS/HSM provider is `UNKNOWN — REQUIRES INVESTIGATION`; any
provider MUST offer unwrap-only IAM scoping, key versioning and audit (FR-016). The existing GitHub token vault
(`token-vault.ts`, one env key, no key id) is **unchanged** and is reused as a pattern only (FR-017, FR-026).

## Consumers

1. Credential Broker (`credential-broker-contract.md`) — the only reader of ciphertext and the only holder of KMS unwrap.
2. Test Identity registry (`test-identity-contract.md`) — `CredentialReference` is bound to a `TestIdentity`.
3. API control-plane routes and the customer UI (write-only secret entry, metadata display).
4. Operator tooling (revoke / disable / revoke-all only).
5. Audit / incident-response runbook (quickstart) and SG3 key-rotation drill.
6. Reverify (`security-reverify-contract`) — re-validates reference state through the broker; never reads the vault.

## Inputs

- Customer secret entry: `{kind, label, secretMaterial, targetId, environment, testIdentityId, expiresAt?}` over TLS, once.
- Authenticated tenant context (`userId`) from the API session.
- KMS: KEK key ids/versions; `wrap(dataKey, kekId, aad)` / `unwrap(...)` (provider-defined; no custom cipher).

## Outputs

- `CredentialReference` (stable, tenant-owned) and immutable `CredentialVersion` (ciphertext + wrapped data key + metadata).
- Metadata views: `{referenceId, label, kind, versionNumber, state, expiresAt, createdAt, lastRotatedAt, targetId, environment, testIdentityId}`.
  No plaintext, no ciphertext prefix, no hash/fingerprint of the secret is ever returned (FR-018).
- Audit events (no values). Tombstone after delete.

## Operations

```text
createCredentialReference(user, {kind, label, targetId, environment, testIdentityId, expiresAt?}) -> referenceId
putCredentialVersion(user, referenceId, secretMaterial) -> {versionNumber}             // create or rotate
revokeCredentialReference(actor: owner|operator, referenceId, reasonCode) -> ok        // immediate, one-way
disableCredentialReference(actor: owner|operator, referenceId) -> ok                   // reversible by owner only
deleteCredentialReference(owner, referenceId) -> ok                                    // crypto-shred + tombstone
shredAllForAccountDeletion(system, userId) -> n                                        // FR-167: crypto-shred every version, revoke leases, audited
expireSweep(now) -> n                                                                  // job; marks EXPIRED, schedules shred
revokeAllForTenant(operator, userId, reasonCode) -> n                                  // incident response
revokeAllForKek(operator, kekVersionId, reasonCode) -> n                               // incident response
rewrapAllForKekRotation(operator, fromKek, toKek) -> n                                 // rotation; no plaintext leaves broker
```

Ordered steps:

**`putCredentialVersion` (create / rotate)**
1. Authenticate owner; require `reference.userId == userId` (tenant isolation).
2. Validate `kind` (enum `CredentialSecretKind`, L23) in {`PASSWORD_LOGIN`, `API_KEY_HEADER`, `BEARER_TOKEN`, `SESSION_FIXTURE`} (FR-027); `CLIENT_CERTIFICATE` /
   `OAUTH_CLIENT_CREDENTIALS` -> API error `SEC_UNSUPPORTED_CREDENTIAL_KIND`.
3. Validate environment is non-production and equals the bound Target's current classification; validate `expiresAt` is finite,
   <= now + 90 days, default now + 30 days; `SESSION_FIXTURE` requires a declared `expiresAt` and is never extended (FR-050).
4. Register the secret as a known value with the redactor for this request's lifetime (exact-value registry, FR-128) before any logging.
5. Generate a fresh random 256-bit data key (DEK) from the platform CSPRNG; generate a fresh 96-bit nonce.
6. Encrypt with AES-256-GCM, **AAD = canonical encoding of `{userId, referenceId, versionNumber, kind, targetId, kekVersionId}`**
   (binds ciphertext to tenant+credential+version; moving ciphertext between rows fails authentication).
7. Wrap the DEK with the KEK in managed KMS (`kekVersionId` recorded); the API performs the wrap using a **wrap-only** KMS permission (L23 P-2) and never holds unwrap. Persist `{ciphertext, nonce, wrappedDek, kekVersionId, aadVersion}`.
8. Zeroize plaintext and DEK buffers (best-effort). In one DB transaction create the new version `ACTIVE` and set the prior `ACTIVE`
   version to `SUPERSEDED` (FR-020). Emit audit event.

**`revokeCredentialReference`**: set reference `REVOKED` (one-way) in a transaction; all `ISSUED` leases of its versions are marked
`REVOKED` in the same transaction (`credential-broker-contract.md` revocation rules); ciphertext remains until
revocation + grace (default 7 days) then is crypto-shredded (FR-023).

**`deleteCredentialReference`** (crypto-shred): destroy every version's wrapped DEK (and delete ciphertext); keep a tombstone
`{referenceId, userId, kind, deletedAt, versionIds[]}` so Evidence references to a `CredentialVersion` id stay resolvable as "deleted". Leases revoked first.

**`shredAllForAccountDeletion`** (FR-167, L22): on user account deletion, crypto-shred every `CredentialVersion` of the tenant, revoke all leases first, then purge the tenant's 012 tables as an explicit audited step (012 tables carry no `User` relation, so the `User` cascade does not reach them). Tombstones follow the data-model purge rule.

**`expireSweep`**: references past `expiresAt` become `EXPIRED` (unusable immediately; the broker re-checks time on every issue);
ciphertext shredded at expiry + grace (default 7 days).

### Lifecycle states

`CredentialReference.status` is `ACTIVE | DISABLED | REVOKED | RETIRED` (data-model `ReferenceStatus`): `ACTIVE -> DISABLED -> ACTIVE` (owner re-enable), `ACTIVE|DISABLED -> REVOKED` (one-way); expiry is `now >= expiresAt` recomputed by every reader (no stored `EXPIRED` reference status), and delete is crypto-shred followed by `RETIRED` (`retiredAt`, tombstone). Rotation grace for the superseded version is 7 days (L23 P-3). Backups containing ciphertext are bounded to 35 days or use per-tenant keys (L23 P-4; SG3 item). `CredentialVersion`: `ACTIVE -> SUPERSEDED | REVOKED | EXPIRED -> SHREDDED`. At most one `ACTIVE`
version per reference; at most one active reference per `(testIdentityId, kind)` (FR-030).

## Invariants

1. Every stored secret is `AES-256-GCM` ciphertext under a per-version random DEK wrapped by a managed-KMS KEK; no other
   cipher, mode, or derivation scheme exists in the vault (FR-016).
2. The AAD includes tenant, credential, version, kind, target and KEK version; decrypt with a mismatched AAD fails.
3. Workers, the API and the AI layer hold no KEK, no persisted DEK, and no unwrap permission; only the broker principal can unwrap (FR-017). The API's only KMS permission is wrap-only (L23 P-2). Vault DB roles: broker read/write, the API and operators only through the `vault_*` security-definer functions of data-model 4.10A (no direct INSERT or UPDATE), worker none (L23 P-12, MA-05); the functions are created and operated under the hardening requirements of data-model 4.10E (IC-1).
4. The shared env `ENCRYPTION_KEY` is never used for a 012 credential; 012 tables share no columns with the GitHub token vault (FR-017, FR-026).
5. No API, log, audit payload, error body, metrics label or UI returns plaintext, ciphertext, nonce, DEK or any secret-derived value (FR-018, FR-022).
6. A `CredentialReference` is bound to exactly one Target, one environment, one `TestIdentity`, and a finite `expiresAt` <= 90 days (FR-019).
7. `CredentialVersion` rows are immutable; rotation never mutates a prior version except marking it `SUPERSEDED` (FR-020).
8. Revocation is immediate and one-way; a revoked reference can never return to `ACTIVE` (FR-020).
9. Only the owning tenant user may create, rotate, re-enable or delete; operators may only `revoke` and `disable` and `revoke-all` (FR-021). No operator read path exists.
10. Raw secret material never appears in ScanPlan, ScanConfiguration, ExecutionUnit, queue payload, progress event, log, Sentry event,
    Evidence, Artifact, Issue, AI prompt, report, export, or screenshot (FR-024).
11. Credentials are unreachable from any `SOURCE_EXECUTION` Guest or `apps/sandbox-runner` (FR-025; Constitution XI).
12. The vault performs **no** target-facing validity check (no "test this credential"); validation only occurs as the first login step inside an authorized unit (FR-028).
13. A reference whose Target is (re)classified PRODUCTION is unusable immediately; the broker re-reads environment on every issue (FR-029).
14. Every lifecycle event produces an audit record whose payload passed the redactor with the credential's value registered as known secret (FR-022).

## Safety & Authorization

- **F01 / F07**: the vault performs no target action, so it makes no F01/F07 call. Storing a credential does not authorize using
  it; use requires an active F01 grant listing the class, the broker's re-validation (`credential-broker-contract.md`) and an F07
  checkpoint on every request (FR-005). A verified domain alone never authorizes credential use.
- **Production**: creating a reference for a PRODUCTION or unclassified Target is refused at the API (error, not a check verdict).
  A later reclassification to PRODUCTION leaves the reference stored but unusable (invariant 13) and surfaces `SEC_PRODUCTION_PROHIBITED` at use.
- **Tenant isolation**: every vault query is keyed by `userId` from the authenticated context, never from request body; cross-tenant
  reference ids behave as not-found. AAD binding gives cryptographic tenant separation in addition.
- **Roles**: owner = create/rotate/re-enable/delete/revoke/disable; operator = revoke/disable/revoke-all only; support staff and
  AI have no access. No break-glass read in v1 (FR-021).
- **Separation from GitHub token vault**: separate service principal, separate tables and key hierarchy; a compromise of one
  does not grant the other (FR-026).

### Supported / unsupported secret kinds (FR-027)

| Kind | v1 | Notes |
|------|----|-------|
| `PASSWORD_LOGIN` | supported | username+password pair for one `TestIdentity`; login flow described by identity/workflow data |
| `API_KEY_HEADER` | supported | header name from a closed allow-list; value secret |
| `BEARER_TOKEN` | supported | static test token |
| `SESSION_FIXTURE` | supported | pre-established session with mandatory `expiresAt`; never extended |
| `CLIENT_CERTIFICATE`, `OAUTH_CLIENT_CREDENTIALS` | `UNSUPPORTED` | `SEC_UNSUPPORTED_CREDENTIAL_KIND`; designed-for only |
| TOTP seed, SMS/email OTP, private package registry / other git-host tokens | `UNSUPPORTED` | `SEC_MFA_CHALLENGE_UNSUPPORTED` at use; no storage in v1 |

### Incident response (FR-023)

Suspected leak: (1) operator `revokeAllForTenant` or `revokeAllForKek` (all leases `REVOKED`, references `REVOKED`);
(2) KEK rotation: provision new KEK version, `rewrapAllForKekRotation` inside the broker (DEKs unwrapped and rewrapped without
leaving the broker; plaintext secrets never touched), then disable the old KEK version; (3) tenant notified; (4) post-incident audit review.
Runbook lives in quickstart; SG3 requires a passed rotation + incident drill.

## Failure states

Vault operations are control-plane API calls; their failures are API errors. A *scan-time* consequence is a check verdict.

| Condition | Verdict / status | Reason |
|-----------|------------------|--------|
| Unsupported kind submitted | API error; at scan time `UNSUPPORTED` | `SEC_UNSUPPORTED_CREDENTIAL_KIND` |
| Reference absent / not owned | scan: `BLOCKED` | `SEC_CREDENTIAL_MISSING` |
| Reference expired | `BLOCKED` | `SEC_CREDENTIAL_EXPIRED` |
| Reference revoked / disabled / deleted | `BLOCKED` | `SEC_CREDENTIAL_REVOKED` |
| Reference bound to a different Target / tenant / environment than the unit | `BLOCKED` | `SEC_CREDENTIAL_SCOPE_INVALID` |
| Target now PRODUCTION | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` |
| KMS unreachable on create | API error; nothing persisted | (no verdict) |
| KMS / broker unreachable at use | `BLOCKED` | `SEC_BROKER_UNAVAILABLE` (no fallback read) |
| AAD / GCM authentication failure on unwrap | lease denied; operator alert | `SEC_CREDENTIAL_SCOPE_INVALID` |
| Redaction registration failure | write refused | (no verdict; nothing persisted) |

## Idempotency & retry

`putCredentialVersion` takes a client-supplied `idempotencyKey`; a repeat with the same key returns the first result and never
creates a second version. Revoke, disable, delete and expire are idempotent. `rewrapAllForKekRotation` is resumable and
idempotent per version (rewrapped marker). Vault operations are never automatically retried against the target (none exist).

## Evidence

No Evidence kind stores a secret. Scan Evidence records `credentialVersionId` and reference id only (FR-024, FR-047). Audit is by
`AuditLogEntry` (control-plane) and, when tied to an execution, 008 `recordExecutionAuditEvent` redacted `payload` on existing
event types, never a new enum value. Audit events: `CREDENTIAL_CREATED`, `_ROTATED`, `_REVOKED`, `_DISABLED`, `_EXPIRED`,
`_DELETED`, `_REVOKE_ALL`, `_KEK_ROTATED`, `_ACCOUNT_SHREDDED` as `AuditLogEntry` action names (control-plane strings, not 008 enum values).

## Budgets/limits

All **LOCAL — not F07-ledgered** (the vault is not an F07 resource): max credential lifetime 90 days (default 30); max references
per `TestIdentity` = 1 active per kind; max `secretMaterial` size 16 KiB; write rate limit per tenant (provisional 30/hour);
retention: ciphertext deleted at revocation/expiry + 7-day grace. Lease lifetime is the broker's limit. No F07 request budget is consumed.

## Reverify

Reverify does not touch the vault. It obtains a fresh lease through the broker, which re-reads reference state (existence, expiry,
revocation, version). A reference that expired/was revoked since the original scan yields reverify `INCONCLUSIVE` with the
closed reason (`SEC_CREDENTIAL_EXPIRED` / `SEC_CREDENTIAL_REVOKED`); the original finding and evidence are preserved (FR-153).

## Boundary rules (MUST NOT)

1. MUST NOT invent a cipher, KDF or key-wrapping scheme; use AES-256-GCM and the KMS provider's wrap.
2. MUST NOT reuse a DEK, nonce, or AAD across versions.
3. MUST NOT return, log or audit any secret or secret-derived value (including hashes, prefixes, lengths beyond a length class).
4. MUST NOT grant workers, API, AI, support staff or operators a read path to plaintext.
5. MUST NOT share keys, tables, columns or IAM principals with the GitHub token vault; MUST NOT use env `ENCRYPTION_KEY`.
6. MUST NOT validate a credential against the target from the vault.
7. MUST NOT mutate a `CredentialVersion` after creation (except marking `SUPERSEDED`/`REVOKED`/`EXPIRED`/`SHREDDED`).
8. MUST NOT widen a reference's Target, environment, tenant, or identity after creation (create a new reference).
9. MUST NOT store credentials for PRODUCTION or unclassified Targets.
10. MUST NOT expose any 012 credential to a `SOURCE_EXECUTION` Guest or sandbox runner.
11. MUST NOT extend a `SESSION_FIXTURE` past its declared `expiresAt`.

## Named limitations

- Best-effort memory zeroization in a garbage-collected runtime (FR-034); lease lifetimes are therefore short.
- KMS provider, broker hosting and network topology are `UNKNOWN — REQUIRES INVESTIGATION` (P11); the architecture is provider-neutral.
- A compromised broker principal can unwrap any DEK it can reach; mitigations are unwrap-only IAM, minimal surface, audit and SG10 external review, not elimination.
- Value-aware redaction cannot detect a secret that was transformed (re-encoded, split); exact-value registration plus structural rules reduce but do not eliminate this.
- No operator break-glass: a customer who loses a secret must re-enter it.

## FR traceability

FR-016, FR-017, FR-018, FR-019, FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030; supports FR-050, FR-127, FR-128; FR-167 (account-deletion shred); FR-035 and FR-033 are consumed by the broker.

## Acceptance tests required (named, deterministic, fixture-based; not executed now)

- `secrets.encrypt.aad-binding`: ciphertext moved to another reference/tenant fails GCM auth (fake KMS).
- `secrets.encrypt.fresh-dek-nonce`: two versions of the same plaintext produce different DEK/nonce/ciphertext.
- `secrets.access.workers-no-kek`: worker/API principals' unwrap call denied by fake KMS policy.
- `secrets.api.write-only`: no route response/serializer/error contains plaintext or ciphertext (schema scan over fixtures).
- `secrets.lifecycle.rotate-supersede`: rotation yields one `ACTIVE` + prior `SUPERSEDED`; prior ciphertext intact until grace.
- `secrets.lifecycle.revoke-one-way`: re-enable after revoke refused; leases revoked in same transaction.
- `secrets.lifecycle.expire-unusable`: past `expiresAt` -> broker deny `SEC_CREDENTIAL_EXPIRED`.
- `secrets.lifecycle.delete-crypto-shred`: wrapped DEK gone, unwrap impossible, tombstone retained, Evidence id resolvable.
- `secrets.roles.operator-limits`: operator `create`/`read` refused; `revoke`/`disable` allowed; no read endpoint exists.
- `secrets.tenant.isolation`: tenant B cannot see/revoke tenant A reference (behaves as not found).
- `secrets.env.production-refused`: create against PRODUCTION target refused; reclassification makes broker deny.
- `secrets.kind.unsupported`: `CLIENT_CERTIFICATE` -> `SEC_UNSUPPORTED_CREDENTIAL_KIND`.
- `secrets.redaction.known-value`: known secret value injected into an audit payload / error / log fixture is replaced; no raw value anywhere (`SC-001`).
- `secrets.incident.kek-rotation`: rewrap all versions, old KEK disabled, no plaintext crossing the broker boundary.
- `secrets.separation.github-vault`: 012 tables share no column/key with the GitHub token vault.
- `secrets.idempotent.put`: repeated `idempotencyKey` creates one version.
- `secrets.account-deletion.shred`: deleting a user shreds every version, revokes leases, purges 012 tenant tables (FR-167).

## Resolved additions

1. Audit action names: control-plane `AuditLogEntry` strings (kept as stated); the list gains `_ACCOUNT_SHREDDED` via **L22 / FR-167**. Whether `AuditLogEntry` accepts free action strings remains a data-model check (see Open).
2. FR-018 garbled phrase: **L12** - spec fixed to "no secret-derived value (no prefix/suffix/length/hash) in UI"; this contract already conforms.
3. Vault API failures stay API errors; the only API-surface code is `SEC_UNSUPPORTED_CREDENTIAL_KIND` (registry: 83 codes).
4. Enum name: **L23** - `CredentialSecretKind` adopted; wrap-only API KMS permission (P-2), 7-day rotation grace (P-3), 35-day backup bound (P-4), vault DB roles (P-12) applied to steps, invariant 3 and lifecycle.
5. Account deletion: **L22 / FR-167** - `shredAllForAccountDeletion` added.

## Open for closure

No item is open. Audit action names come from a closed constant list (Consolidated repairs item 6).

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **AAD and column names (F-17)**: this contract's AAD `{userId, referenceId, versionNumber, secretKind, targetId, kekVersion}` + persisted `aadVersion` is the authority; `data-model.md` column names are canonical (`wrappedDataKey`, `kekRef`, `kekVersion`, `secretKind`).
2. **Operator controls (G-37, FR-021)**: `revokeAllForTenant`, `revokeAllForKek`, `rewrapAllForKekRotation` and any KEK disable/delete require dual control (two distinct operator principals) and alert; KMS deletion protection plus a scheduled-deletion delay; broker-host access logged and restricted. SG3 drill extended.
3. **Reference status (F-5, FR-187)**: `CredentialReference.status ∈ ACTIVE|DISABLED|REVOKED|RETIRED` and `disabledAt`; `disableCredentialReference` is owner-reversible, operators may disable but never re-enable on the owner's behalf; a DISABLED reference is never issuable.
4. **Sweeper hosts (F-28)**: the credential expire/shred sweep and the lease revocation sweep are broker-internal timers (leader-elected by a DB advisory lock; no second scheduler); the mutation recovery sweep is part of the registered module-result finalizer plus the existing 009 `timeout-sweep` self-healing pass; advisory import is an operator CLI.
5. **Account deletion (FR-167)** and **route conformance (G-26, FR-182)**: closed DTO allow-lists, row-level security keyed by `userId`, IDOR and mass-assignment conformance tests (`routes.idor-conformance`, `routes.mass-assignment-conformance`).
6. **Audit vocabulary (G-34f)**: `AuditLogEntry.action` strings for 012 come from a closed constant list enforced by a lint.
7. **Restore (G-15)**: incident runbook includes epoch bump and quarantine after any database restore.
8. **`unitMacKey` lifecycle (FR-173).** Versioned HMAC key held only by the API plan-resolution principal and the broker verifier; generated in the KMS/HSM boundary decided under P11 (deferred until broker activation); rotation = new `keyVersion` signed forward, old versions verify-only until all units stamped with them are terminal; compromise response = revoke the key version (all units stamped under it are denied by the broker) and replan. No worker environment, image or secret store contains it (`worker.no-mac-key`).
9. **Operator paths (N-17).** Emergency single-operator `disable`/`revoke` for ONE tenant; dual control for tenant-wide, KEK and `acknowledgeRestore` operations.
10. **DB roles (AR-13, REQUIRED FOR ACTIVATION; FR-201).** Roles `fahes_worker_exec` (per-instance login roles registered in `WorkerPrincipal`), `fahes_orchestrator`, `fahes_api_planner`, `fahes_broker`, `fahes_operator`, with the **positive grant matrix** of `data-model.md` section 4.10A (every unlisted table is denied). The worker role has no write on `TargetAuthorization`, `ScopeDefinition`, `ScanPlan`, `KillSwitchState`, the `ExecutionUnit` authority columns and `status` (changed only through `sec_claim_unit_host`, the non-terminal `sec_transition_unit` edges and one shared terminal body reached only by `sec_finalize_unit` (claim owner), `sec_refuse_unclaimed_unit` (`PLANNED`, four database-verified step-0 reasons, `REFUSED` only) and the orchestrator-only `sec_sweep_finalize_unit`), the vault tables, `UnitDispatchRecord`, `WorkerPrincipal` (written only by the operator functions `sec_register_worker_principal`/`sec_revoke_worker_principal`) or the 012 authority tables; it writes `AdmissionLease`/`BudgetConsumption` only through 008's `requestAdmission`; the broker role reads the 007/008/009 tables it needs and writes only vault tables. The privilege-bypass suite is an SG3/SG10 acceptance condition; MAC validation alone is not the trust boundary.
