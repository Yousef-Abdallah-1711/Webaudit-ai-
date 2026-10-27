# SPEC 012 Independent Adversarial Review

Reviewer posture: independent, skeptical, read-only. Package reviewed: `spec.md`, `plan.md`, `data-model.md`, `research.md`, `tasks.md`, `upstream-amendment-requests.md`, `contracts/*.md` (19). Verified against: 007 `spec.md` (FR-015a, FR-017a), 008 `contracts/safety-admission-contract.md` + `spec.md` FR-008, 009 `contracts/scan-deadline-contract.md` (U-1) + `execution-runtime-contract.md`, `packages/safe-net/src/{safe-fetch,connect-guard,address-rules,policy,validate-url}.ts`, `packages/redaction/src/{index,detect}.ts`, `packages/scoring/src/aggregate.ts`, `apps/worker/src/module-runner/persist.ts`, `apps/worker/src/config/monitoring.ts`, `apps/api/src/services/auth/token-vault.ts`, `apps/api/prisma/schema.prisma` (`AuditLogEntry`). `reconciliation-log.md` and `analyze-report.md` were not used as evidence. Nothing was executed; performance claims about regexes are by inspection and unmeasured.

Rating scale: ADEQUATE = a concrete mechanism exists, is owned, is testable, and I could not defeat it within the stated residual. WEAK = a mechanism exists but I found a path around it, or its test does not exercise the attack. GAP = no mechanism, or the specified mechanism is self-contradictory/ineffective.

Citation form: `file:line` (contract files are under `contracts/` unless a path is given). "Test" names a tasks.md id or contract test name, or MISSING.

## Cross-cutting findings that drive several ratings

- X1. `safe-fetch.ts:86` strips only `authorization`, `cookie`, `proxy-authorization`; `FR-081` (spec.md:227) and `security-scope-contract.md:172` claim "custom auth headers ... safe-net stripping retained". False for `API_KEY_HEADER` credentials (`secrets-management-contract.md:121`). `headersForHop` also keys "same enough" on `host`, not origin, so an https to http same-host hop keeps credentials (`safe-fetch.ts:118-123`). `safe-fetch.ts:132` follows up to 5 cross-origin hops today; the planned `SecurityHttpClient` (T026) does not exist.
- X2. FR-142 / `security-coverage-contract.md:76,80` score a `DEGRADED` SECURITY result from findings only (P13: no cap); `packages/scoring/src/aggregate.ts` `scoreFromFindings([])` returns 100 and `overallScore` averages it in. The "never present as complete" rule is a label obligation on unnamed consumers. `tasks.md:341` (T420) and `tasks.md:401` (T478) assert `DEGRADED` with score `null`, contradicting FR-142. The acceptance tests and the spec disagree.
- X3. The broker's "never trust the caller" rests on Postgres rows (`credential-broker-contract.md:49-65`) that the worker role can write (worker holds the DB URL: research R2/R4; worker also resolves plans and dispatches, plan.md D1). The stated reason for the broker (worker over-privilege) is not defeated for credential theft, only for data-at-rest theft.
- X4. `FR-007` (spec.md:135) says GET is not assumed harmless; `api-security-check-contract.md:84` (inv. 3) refuses only undeclared non-GET/HEAD/OPTIONS operations, so an undeclared state-changing GET receives active probes as `C1`.
- X5. `FR-161` (spec.md:343) says "replaying a customer-declared fixture operation under another registered identity" is single-class E15; `authorization-testing-contract.md:57` says the cross-identity request is credentialed and crafted and needs the E14 dual-class path. The same BOLA probe has two classifications.
- X6. `detect.ts:132` (lazy `[\s\S]*?` private-key block) and `detect.ts:120,176-189` (`SECRET_NAME` with unbounded leading and trailing name-char classes before `\s*[:=]`) are super-linear on adversarial text (by inspection). The redactor runs on up to 256 KiB hostile bodies, in the engine child and again in the parent (`security-evidence-contract.md:40-42`), with no time bound stated.
- X7. `monitoring.ts:9-29`: Sentry scrubber deletes four header names and scrubs breadcrumb `data` keys by name only. It does not touch exception messages, `extra`, `contexts` or breadcrumb messages, and has no access to any per-unit secret registry.
- X8. F07 admission is keyed by caller `idempotencyKey` and replays the first result for a repeated key without consuming (008 `spec.md` FR-008; `safety-admission-contract.md:19,62-63`). 012 specifies a unit-level key derived from `(unit id, attempt)` (`active-security-execution-contract.md:183`; 009 `execution-unit-contract.md:72`) but no per-request key rule.

---

# Part 1. The 50 required scenarios

### 1. Domain verified but active-security grant absent. ADEQUATE
- Threat: owner verifies a domain, assumes verified means testable, a worker starts a login or probe.
- Mechanism: FR-005 (spec.md:129); plan-time `isAuthorized` per class with F01 reason verbatim (`security-scope-contract.md:95-96`); dispatch step 2 and per-request F07 checkpoint (`active-security-execution-contract.md:42,56`); broker step 5 (`credential-broker-contract.md:56`); only C0 runs without a grant (plan.md:108-125).
- Owner: security-scope-contract. Test: T400, T430 (A01), T118.
- Residual: environment classification is self-attested (see A28).
- Attack on the mechanism: four independent refusals (plan, dispatch, per-request F07 which re-runs F01 `isAuthorized` fresh per `safety-admission-contract.md` step 2, broker). No ordering or race lets a request leave without a `PROCEED`. The passive half runs on ordinary fetch evidence and needs no credential. I found no path around it. ADEQUATE.

### 2. Grant expired between plan and dispatch. ADEQUATE
- Threat: grant valid at quote, expired when the job runs, or mid-unit.
- Mechanism: no cached `AUTHORIZED` (FR-003, spec.md:127); fresh F01 at dispatch and every request via F07; U-1 `GRANT_EXPIRES_BEFORE_DEADLINE` at plan (plan.md:218); lease expiry <= grant expiry (`credential-broker-contract.md:63`).
- Owner: security-scope-contract, credential-broker-contract. Test: T401, T431 (A02), `scope.gate.no-cache`, `broker.grant-expiry-bound`.
- Residual: clock source (A19).
- Attack: a stale `now` is the only handle (A19) and that is a separate defect. The decision itself is re-made in the F07 transaction per request. ADEQUATE.

### 3. Production restriction bypass through check reclassification. ADEQUATE
- Threat: a registry author declares a crafted probe `C0` so it runs against production.
- Mechanism: class is computed, declared class must equal it, else load rejects (FR-007, FR-149; `security-check-registry-contract.md` `loadSecurityRegistry` step 2); `C1+` refused at plan, broker, gate, dispatch (spec FR-078, spec.md:224); 007 FR-015a refuses the grant itself.
- Owner: security-check-registry-contract, security-scope-contract. Test: T021, T432 (A03), `T-REG-class-mismatch-rejected`.
- Residual: an under-described `probeDefinition` passes load (`security-check-registry-contract.md:226` own named limitation).
- Attack: the reclassification route is closed by four layers that do not depend on the class label (environment read, broker step 5, gate step 1, dispatch step 2). The surviving seam is render-time drift (rendered request has more than the definition declares). Add a render-time envelope assertion (G-34). The real production-bypass is misclassified environment, not reclassified checks (A28). ADEQUATE for the scenario as written.

### 4. Redirect outside target scope. WEAK
- Threat: login or probe returns 302 to an off-scope or downgraded origin carrying credentials.
- Mechanism: `SecurityHttpClient` forbids automatic cross-origin follow, each in-scope hop re-enters the pipeline (FR-081; `active-security-execution-contract.md:59,64-70`). Today's safe-net follows 5 hops automatically (`safe-fetch.ts:132`).
- Owner: active-security-execution-contract. Test: T404, T433 (A04), `T-E14-redirect-out-of-scope` (assert only `Authorization`/`Cookie` absent).
- Residual: none stated.
- Attack: (a) the stated reuse of safe-net stripping is false for custom header credentials (X1): an `API_KEY_HEADER` credential would be forwarded if any hop is followed with safe-net's rule; (b) "same-origin" is undefined and safe-net uses `host` (no scheme), so https to http on the same host keeps cookies and Bearer in clear text; (c) an in-scope cross-origin hop (IdP on a sibling in-scope subdomain) is recorded `SEC_REDIRECT_OUT_OF_SCOPE` though in scope, so login flows through SSO silently become `BLOCKED`. The design intent is right but the test only asserts two headers. WEAK. Repair G-9.

### 5. DNS rebinding. WEAK
- Threat: hostname resolves to a public address at check time and to a private or different address at connect.
- Mechanism: safe-net layer 3 checks the connected peer address before writing a byte (`connect-guard.ts`, post-connect `classifyAddressString`), per-hop dispatcher, `keepAlive:false`; FR-079.
- Owner: active-security-execution-contract. Test: T405, T434 (A05), T027.
- Residual: only address class (public vs private) is judged.
- Attack: private/loopback/metadata rebinding is genuinely closed. The surviving variant is rebinding to a different public address. `isInScope` is name-based (007), the connect guard only asks "is this public?", and ownership proof was of a name. A name re-pointed to someone else's public IP passes every layer (A28/scenario 7). Plan text "DNS pin" (`active-security-execution-contract.md:65`) overstates: no pinning to a verified address exists. WEAK. Repair G-2.

### 6. Cloud metadata SSRF. ADEQUATE
- Threat: probe, redirect, spec `servers[]` or URL-typed parameter makes Fahes call 169.254.169.254 or equivalent.
- Mechanism: safe-net address classes incl. metadata IPs, IPv6 `fd00:ec2::254`, NAT64/6to4 (`address-rules.ts:57-62,116,275-285`); WHATWG parse canonicalises encodings (`validate-url.ts`); FR-080 forbids Fahes from submitting prohibited destinations; URL-typed params only receive `IN_SCOPE` values (`probe-family-contract.md` inv. 13).
- Owner: probe-family-contract, active-security-execution-contract. Test: T435 (A06), T027, `T-PROBE-13`.
- Residual: provider list is static; Azure WireServer `168.63.129.16` (public-looking) is not in `address-rules.ts` and the hosting provider is undecided (P11).
- Attack: I could not construct a destination that passes URL, resolve and connect layers for a listed range. Residual is the unlisted provider-specific address. Add to METADATA class (G-42, LOW). ADEQUATE.

### 7. Third-party resource access. GAP
- Threat: customer-controlled DNS (or subdomain takeover, or CNAME to shared SaaS) makes an in-scope hostname reach a third party's public host; Fahes then sends up to the grant budget of active probes at someone who never consented. Same via wildcard scope `*.example.com` on a dangling subdomain.
- Mechanism: FR-082/083 (third-party hosts never probed; `servers[]` inventory only) are about names found in content. For the name that is in scope, nothing binds it to an address the owner controls. Test T436/A07 covers spec entries naming third-party hosts only.
- Owner: security-scope-contract / api-discovery-contract. Test: MISSING for resolved-address drift.
- Residual: legal exposure (C5 "third-party testing, never supported" is violated by construction).
- Attack: ownership verification (existing) proves control of a name at one moment; 007 binds grants to names. safe-net only rejects private classes. A malicious tenant verifies `attacker.example`, creates a STAGING target and grant, then sets an A record to a victim. Hosting-provider shared edges (customer staging CNAME to a PaaS) get probed with the provider's other tenants behind the same IP. No layer reads "the address I am about to dial belongs to the owner." GAP. Repair G-2.

### 8. Credential leaked in queue payload. WEAK
- Threat: secret lands in Redis through BullMQ job data, returnvalue, progress, logs or `failedReason`.
- Mechanism: payload exactly `{executionUnitId}` (FR-024; spec.md:155; T076, T077); unit row holds `credentialBindingRef` only.
- Owner: credential-broker-contract, security-evidence-contract. Test: T437 (A08) asserts the key set of `job.data` only.
- Residual: other BullMQ job fields.
- Attack: BullMQ also persists `returnvalue`, `progress` (`emitProgress` snapshots), `job.log` lines and `failedReason`/stack. A login failure error that embeds the request (undici errors, thrown `Error(`login failed ${body}`)) goes to `failedReason` in Redis and to Sentry. FR-024 lists "queue job payloads" and "progress events" but the test checks `job.data` only. Pre-existing runtime path not governed. WEAK. Repair G-16.

### 9. Credential leaked in worker logs. WEAK
- Threat: secret in a log line, exception message, error `cause`, crash report.
- Mechanism: exact-value registry plus structural rules (FR-128), Sentry scrubber "extended to value-aware matching" (FR-132, `security-evidence-contract.md:87-88`), tasks T422/T438, `evidence.log.sentry-scrub`.
- Owner: security-evidence-contract. Test: T422/T438 plant a value in a known path.
- Residual: unknown paths.
- Attack: today's scrubber is name-based and covers four header names (X7). The registry is per unit and per process (`security-evidence-contract.md:73`) but `beforeSend` is process-global in the parent; how the global hook learns secrets of N concurrent units is unspecified. The child has no stated logger/Sentry policy. Node error objects (`cause`, undici `UND_ERR_*`) serialize request options. WEAK. Repair G-16.

### 10. Credential leaked in AI prompt. WEAK
- Threat: secret, cookie or body reaches the AI provider.
- Mechanism: AI only after committed verdicts, class-level inputs, sealed `assemblePrompt` type (FR-144; `security-finding-contract.md:106-113`; `redaction/src/index.ts` sole route).
- Owner: security-finding-contract. Test: T439 (A10), T340, `finding.ai.no-credentials-in-prompt`.
- Residual: legacy path.
- Attack: `assemblePrompt` is pattern-based; the 012 guarantee is "inputs are class-level" by convention, not a closed input type. Until T001 lands, legacy `Issue.evidence` carries raw `Set-Cookie` values (`persist.ts:185`, `owasp-checker`) and the existing module AI layer reads findings. 012 cannot rely on `redactText` for unregistered cookie values (no pattern). The tests plant secrets; none asserts that AI inputs are built from a closed schema. WEAK. Repair G-19 (closed AI-input type) plus T001 before any enablement.

### 11. Cross-tenant secret retrieval. ADEQUATE
- Threat: tenant B (via API or a bug) causes broker to return tenant A's secret.
- Mechanism: broker step 6-7 (`userId == unit.userId`, target and identity match), AAD binds `userId` (`secrets-management-contract.md` step 6), API has insert-only ciphertext and wrap-only KMS, worker has no vault privilege (data-model.md:183-191), uniform NotFound (V-14).
- Owner: secrets-management, credential-broker. Test: T440 (A11), `broker.cross-tenant`, `secrets.tenant.isolation`.
- Residual: broker trusts rows the worker can write (A1, X3).
- Attack: for an API/UI attacker the layered check holds. The worker-compromise variant is A1 (GAP). Rated for the scenario as written. ADEQUATE.

### 12. Secret rotation during scan. ADEQUATE
- Threat: version changes mid-run, mixed credentials or lockout.
- Mechanism: lease pins the `ACTIVE` version resolved at issue (broker step 11, invariant 5); evidence records version id only; T441 (A12), `broker.version-pinning`.
- Owner: secrets-management, credential-broker.
- Residual: rotation does not revoke an in-flight lease (up to unit time or 30 min), so a leaked-and-rotated secret stays usable by the unit; UI copy must say "use Revoke to kill".
- Attack: stale-version login against a rotated target password counts toward the 3-attempt budget (scenario 18). No cross-credential mixing. ADEQUATE.

### 13. Secret revoked during active workflow. WEAK
- Threat: customer revokes; Fahes keeps using the credential.
- Mechanism: revoke marks leases `REVOKED` in the same transaction (data-model.md:233-236); engine detects via the host loop (<= 5 s) (`active-security-execution-contract.md:45`) and "at every checkpoint" (FR-039).
- Owner: credential-broker-contract. Test: T442 (A13), `broker.revoke-during-workflow` (asserts "<= 5 s", not a request count).
- Residual: stated as "one in-flight request" (`credential-broker-contract.md:192`).
- Attack: the per-request pipeline (FR-055, `active-security-execution-contract.md:49-62`) lists scope gate, budget, F07 checkpoint, none of which reads `leaseStatus`; broker liveness is read only in the 5-second host loop and in `SessionHost` per-checkpoint liveness. With pacing at 250/500 ms that is up to about 10-20 requests after revocation, with a revoked credential, not "one". The named limitation understates it and the test does not bound it. WEAK. Repair G-7.

### 14. Session survives grant expiry. ADEQUATE
- Threat: Fahes-held session continues after grant expiry.
- Mechanism: every request is F07/F01-checked, lease <= grant, jar dropped at next checkpoint (FR-043; `auth-session-contract.md` per-checkpoint liveness); server-side survivors flagged `SEC_SESSION_NOT_SERVER_INVALIDATED` plus `SESSION_UNCONFIRMED` with natural expiry.
- Owner: auth-session-contract. Test: T443 (A14), `session.grant-expiry-invalidates`.
- Residual: logout is impossible after expiry (admission refused), so every grant-expiry leaves a live server session for its natural lifetime on the customer's staging.
- Attack: Fahes-side persistence is nil (memory only). The server session is customer test data and is reported. No exploit. ADEQUATE.

### 15. Cookie reused across tenants. ADEQUATE
- Threat: one jar or connection pool serves two tenants.
- Mechanism: one `SessionHost` per `(unit, attempt, identity)`, per-host client, no shared agent (`auth-session-contract.md` isolation rules), one child process per unit (FR-053), lease tuple check.
- Owner: auth-session-contract. Test: T444 (A15), T409, T410, `session.isolation.*` (socket-id assertion).
- Residual: parent process holds secrets of concurrent tenants in one heap.
- Attack: no shared mutable HTTP state exists (safe-net creates a dispatcher per hop). Cross-tenant mixing would need a parent bug. ADEQUATE.

### 16. Role A session used for Role B. WEAK
- Threat: a request authorised as identity B is sent with A's jar (or vice versa).
- Mechanism: separate jars; `securityScopeGate(identityRef, role, ...)` (FR-012).
- Owner: auth-session-contract, security-scope-contract. Test: T445 (A16) asserts separate jars and `SEC_IDENTITY_NOT_IN_SCOPE`, which tests a different property.
- Residual: none stated.
- Attack: the gate receives `identityRef` from the caller (`security-scope-contract.md:58`); nothing binds that argument to the jar attached by `SessionHost.send(handle, req)`. A call site passing identity B to the gate and attaching handle A's cookies passes every check and mixes roles inside one unit (the authz comparison then reports on the wrong actor). WEAK. Repair G-22.

### 17. MFA challenge stalls workflow. ADEQUATE
- Threat: login blocks on a challenge page; unit hangs.
- Mechanism: unsupported modes, 120 s polling with checkpoints, per-request timeout, parent SIGKILL at `timeoutPolicyMs + hardStopMarginMs` (FR-090, FR-056, FR-061).
- Owner: auth-session-contract. Test: T446 (A17), T173, `session.mfa.modes`.
- Residual: how a "challenge observed" is recognised is unspecified (signature class), so an unrecognised challenge appears as `SEC_CREDENTIAL_REJECTED` and spends an attempt.
- Attack: no hang path survives timeouts and the SIGKILL. ADEQUATE for stall; fold the detection spec into G-18's window work.

### 18. Account lockout from retries. WEAK
- Threat: Fahes locks the customer's test account (also used by their CI).
- Mechanism: <= 3 attempts per identity (hard 5), counter in lease ledger so a restart cannot reset it (`credential-broker-contract.md:169`), one attempt on failure, lockout signal set (FR-074).
- Owner: auth-workflow-execution-contract, credential-broker-contract. Test: T447 (A18), T412, `broker.auth-attempt-counter-durable`.
- Residual: signal set is narrow.
- Attack: (a) the counter is "per identity per scan"; consecutive scans and reverify (30-request cap, 3 logins each, `security-reverify-contract.md:137`) reset it, so repeat runs exceed a typical 5-failures-per-15-minutes lockout; (b) real systems lock silently behind a generic 401, the lockout signals (423, `Retry-After`, "account locked") never fire; (c) a rejected stored credential should not be retried by the next scan. WEAK. Repair G-18.

### 19. Login workflow sends unexpected emails. WEAK
- Threat: login triggers "new device" email or SMS to a real person.
- Mechanism: `sideEffects[]` declared per check; undeclared or unfixtured side effect not run (`auth-workflow-execution-contract.md:88`, FR-088).
- Owner: auth-workflow-execution-contract, test-identity-contract. Test: T448 (A19) covers declared case only.
- Residual: customer asserts the identity is theirs.
- Attack: `sideEffects[]` is registry-author knowledge about the check, not knowledge about this target's behaviour; login notifications are common and are not declared. FR-088 guards recovery flows only. No identity-level attestation exists that mail and SMS from login go to a customer-owned sink. WEAK. Repair G-38 (LOW).

### 20. Password-reset flow triggers real side effects. ADEQUATE
- Threat: recovery probe emails a real user, rate-locks accounts.
- Mechanism: needs recovery fixture (customer sink) plus `AUTH_RECOVERY_OBSERVE` category listing, else `NOT_TESTED` (FR-088); no token guessing (FR-087); identifiers fixture-only (FR-092).
- Owner: auth-workflow-execution-contract. Test: T449 (A20), T172.
- Residual: sink ownership is customer-asserted; recovery tokens are customer data.
- Attack: category plus fixture gate holds. The recipient parameter must be sourced from the fixture sink only; covered by FR-092 and `identity.no-enumeration`. ADEQUATE.

### 21. Authorization test reads real customer data. WEAK
- Threat: authz probe pulls real (staging copy of production) customer records.
- Mechanism: fixture-only identifiers (FR-092), synthetic-values regex (data-model V-6), shape-only storage for authenticated bodies (`security-evidence-contract.md:76`), oracle yields booleans.
- Owner: authorization-testing-contract. Test: T450 (A21), T192, `T-AUTHZ-06`.
- Residual: "synthetic" is a regex plus customer assertion.
- Attack: FR-092 lets identifiers come from "a response to a prior fixture-scoped request in the same unit, validated to belong to the fixture"; ownership cannot be derived from a target-controlled response, so the validation is undefined and a collection endpoint (`GET /api/orders`) as a fixture locator hands back an unbounded set of real ids to follow. Also the 600-char excerpt (unauthenticated only) can hold real PII. WEAK. Repair G-27.

### 22. Horizontal privilege test targets another tenant. ADEQUATE
- Threat: tenant-boundary test crosses Fahes tenants.
- Mechanism: FR-097; all records share `userId`+`targetId`; broker refuses cross-tenant; fixtures validated same Target.
- Owner: authorization-testing-contract. Test: T451 (A22), `T-AUTHZ-09`.
- Residual: "application tenant B" is a customer-registered identity; Fahes cannot know whose tenant it is.
- Attack: only the customer's own registered identities can be used; nothing else is reachable. ADEQUATE.

### 23. Vertical privilege test uses an unauthorized admin account. WEAK
- Threat: admin credential used as the attacker or for mutations outside fixtures.
- Mechanism: FR-095; admin only as fixture owner (`test-identity-contract.md` rule 11); resolver never selects admin as requester.
- Owner: test-identity-contract. Test: T452 (A23), T194, `identity.admin-not-attacker`.
- Residual: admin-ness is a customer hint.
- Attack: rule 11 keys on `privilegeRankHint` (optional; null = unordered, data-model.md:362) and `usage: FIXTURE_OWNER` (a detail the contract's own "Open for closure" says has no ruling). An identity registered without those fields is an ordinary identity; empty `includedAccountRefs` means "any registered identity" (`security-scope-contract.md:121`); the resolver rule covers `authz.*` only, not `logic.*` workflows or the generic gate. WEAK. Repair G-23.

### 24. Business-logic probe changes real inventory. WEAK
- Threat: a logic or active-API step mutates real stock or orders.
- Mechanism: mutations need `FIXTURE_MUTATE` listed, consent default OFF, fixture confinement, sensitive-class refusal heuristic plus `SANDBOX_CONFIRMED` (FR-117, FR-119; `business-logic-security-contract.md` inv. 9).
- Owner: business-logic-security-contract, mutation-cleanup-contract. Test: T453 (A24), T312, `T-LOGIC-07`.
- Residual: sandbox safety is customer-asserted (named limitation).
- Attack: the heuristic is path/`operationId`/tag matching; an inventory endpoint named otherwise is an ordinary fixture mutation. The larger hole is outside logic workflows: active `api.*` probes treat undeclared GET as safe (X4), so `GET /cart/{id}/checkout?confirm=1`-style operations in an OpenAPI file receive boundary and wrong-type probes (up to 8/operation) as `C1` with no fixture and no consent. WEAK. Repair G-10.

### 25. Payment test causes a real charge. WEAK
- Threat: staging wired to live PSP keys, or a "sandbox" endpoint that is live.
- Mechanism: payment endpoints only through `SANDBOX_CONFIRMED` mapping; no code path supplies payment credentials (FR-117; `business-logic-security-contract.md` inv. 9).
- Owner: business-logic-security-contract. Test: T454 (A25), `T-MUT-payment-endpoint`.
- Residual: unverifiable assertion.
- Attack: the only control is a stored boolean. There is no deterministic tripwire (e.g. response carrying a live-mode indicator or a `sk_live` pattern from the existing detector, which `redaction` already has) and no per-run re-confirmation for sensitive classes. A misconfigured staging that charges real cards is exactly the failure "customer-asserted" cannot catch. WEAK. Repair G-24.

### 26. Duplicate mutation after worker retry. ADEQUATE
- Threat: crash or redelivery makes a mutating request go out twice.
- Mechanism: `maxAttempts:1`; durable `INTENDED` then `SENT` before the socket write via fenced writer; unique `claimKey` plus `sec-probe-attempt` claim before send; recovery never re-sends `SENT` or later (`mutation-cleanup-contract.md:91-96`, FR-120/FR-148/FR-166).
- Owner: mutation-cleanup-contract. Test: T417 (P18), T455 (A26), `T-MUT-duplicate-after-retry`.
- Residual: crash between claim and socket write is recorded as maybe-sent (safe direction).
- Attack: two live hosts (stalled redelivery, A25) still collide on the unique claim; the second skips. Credentialed units also hit the lease-triple uniqueness. I found no duplicate path. ADEQUATE.

### 27. Cleanup fails after cancellation. ADEQUATE (safety) with an operability hole
- Threat: user cancels mid-mutation; fixture left dirty.
- Mechanism: no cleanup after any stop (FR-122); parent finalizer writes residual manifest from durable intents (FR-162, `mutation-cleanup-contract.md:83-89`); check `INCONCLUSIVE`; UI warning before cancel (FR-171, U30 dependency).
- Owner: mutation-cleanup-contract. Test: T456 (A27), T306, T482 (R02).
- Residual: residue remains by design.
- Attack: safe direction; nothing sends after a stop. The hole is that a `RESIDUAL` fixture stays `SEC_FIXTURE_RESIDUAL_BLOCKED` until the customer acknowledges, and acknowledgement storage is deferred to a later UI spec (`data-model.md:534-535`), so the fixture has no exit state. ADEQUATE for safety; operability fix folded into G-35 (LOW).

### 28. F07 kill switch during a state-changing request. ADEQUATE
- Threat: kill fires after the request left; result trusted or fixture state unknown.
- Mechanism: abort composed from checkpoint controller; late response neither trusted nor persisted; intent becomes `SENT_UNCONFIRMED` then `RESIDUAL`; no cleanup (`active-security-execution-contract.md:128-131`; 008 FR-014 limitation named).
- Owner: active-security-execution-contract, mutation-cleanup-contract. Test: T426 (P27), T457 (A28), `T-E14-kill-mid-request`.
- Residual: remote completion cannot be prevented.
- Attack: SENT is durable before the write so the manifest is exact. ADEQUATE.

### 29. Rate-limit enforcement occurs after sending requests. WEAK
- Threat: budgets counted after the request, overshoot.
- Mechanism: `LocalBudget.precheck` before send; F07 admission consumes before send (`active-security-execution-contract.md:33,54,56`); T458 (A29), T028.
- Owner: active-security-execution-contract.
- Residual: overshoot bounded by F07.
- Attack: F07 request count is atomic in DB (hard cap). The local limits (per-endpoint 8, per-identity 100, bytes) use `precheck` and `commit` as two operations (`:33`) with an asynchronous IPC checkpoint between them; with two in flight both pass `precheck` at count 7 and both commit. The local counters are also per unit (per-endpoint, per-identity, bytes), not per plan, unlike mutations (which are read from durable intents). WEAK (LOW severity). Repair G-29.

### 30. Security probe loops indefinitely. ADEQUATE
- Threat: workflow or probe family never terminates.
- Mechanism: finite DAG <= 25 steps (FR-075); registry-declared finite probe lists; per-unit 300/150 request ceiling; `timeoutPolicyMs` plus parent SIGKILL; redirects <= 3; `Retry-After` pause = rest of unit.
- Owner: active-security-execution, auth-workflow-execution. Test: T459 (A30), `T-E15-dag-validation`.
- Residual: parent-side analysis loops (A10).
- Attack: all loops are bounded by data or time. ADEQUATE.

### 31. Response contains credentials. WEAK
- Threat: response echoes secrets or issues tokens that end up in stored evidence.
- Mechanism: exact-value registry in several encodings, structural header/cookie/query rules, pattern/entropy, body minimization, exposure indicator `{kind, location, lengthClass}` only (FR-128, FR-131; `security-evidence-contract.md:69-83`).
- Owner: security-evidence-contract. Test: T421 (P22), T460 (A31), `evidence.redaction.*`.
- Residual: transformed secrets (named).
- Attack: the stored "shape" is not value-free. `jsonShape` stores key names to depth 4, `queryParamNames[]`, `headerNames[]`, cookie `name` (`security-evidence-contract.md:58,76`). JSON maps keyed by emails, UUIDs, session ids, and cookie names embedding a hash (`wordpress_logged_in_<hash>`, `sess-<id>`) put values into "names". No rule redacts names. The 16-kind detector has no PII detectors. WEAK. Repair G-8.

### 32. Security evidence stores sensitive PII. WEAK
- Threat: emails, phones, ids persisted.
- Mechanism: "classes and counts only" derived in the child (`security-evidence-contract.md:87`), excerpts unauthenticated-only and only for `excerptAllowed` checks (`:76`), fixture identifier regex (V-6).
- Owner: security-evidence-contract. Test: T461 (A32), `evidence.pii.classes-only`.
- Residual: classifier correctness.
- Attack: `@webaudit/redaction` exports secret detectors only (`SECRET_KINDS`, `index.ts`); there is no PII detector in the repo and no spec for one, so "classes and counts" has no implementation target. Excerpts (<= 600 chars of public or error pages) are post-secret-redaction only, so names and emails in them persist. The same names problem as scenario 31. WEAK. Repair G-8.

### 33. AI hallucinates a vulnerability. WEAK
- Threat: AI text asserts a defect, or creates an `Issue`.
- Mechanism: Issues only through registry (`security-finding-contract.md` M8), AI text labelled `AI_JUDGMENT`, validator rejects classes absent from CWE/OWASP tags (`:112`), namespace guard `sec|auth|authz|api|logic|dep` on `layer:'AI'` findings (FR-165, T345/T346).
- Owner: security-finding-contract. Test: T462 (A33), T424 (P25), T485 (R05).
- Residual: free text.
- Attack: the guard is keyed on check-id namespace. The SECURITY module's AI layer can emit a finding with a checkId outside those namespaces (any `ai.*`-style id) and bypass it, while FR-165 (spec.md:347) and finding contract rule 6 intend a module-level ban. The text validator is a string match over prose and is bypassable by paraphrase. WEAK. Repair G-20.

### 34. Weak signal marked confirmed. WEAK
- Threat: a 500, banner or echoed marker becomes `CONFIRMED`.
- Mechanism: `CONFIRMED` needs `confirmable:true` and a fixture-confined oracle; injection families `confirmable:false`; downgrade rules (M2-M4, FR-140).
- Owner: security-finding-contract, authorization-testing-contract. Test: T463 (A34), `T-DISPATCH-confirm-downgrade`, T413 (P14).
- Residual: oracle quality.
- Attack: the oracle is computed in the child over target-controlled data and only a boolean reaches the parent (`authorization-testing-contract.md` inv. 4; `business-logic-security-contract.md` inv. 7); the parent cannot re-verify. The marker is described as "a field name/value class" (`authorization-testing-contract.md:33`) and data-model uses different kinds (`MARKER_PRESENT|MARKER_ABSENT|FIELD_EQUALS`, data-model.md:476) from the contract (`MARKER_FIELD|MARKER_ABSENCE_SHAPE|STATE_READBACK|NONE`): a field-name marker is satisfied by the actor's own data. See A8. WEAK. Repair G-17.

### 35. Zero probes executed but scan reports PASS. GAP
- Threat: nothing active ran, yet the SECURITY area shows a perfect numeric score.
- Mechanism: no bare PASS string (FR-137); `NOT_APPLICABLE` null when no real result (FR-142); sweep guarantees a verdict per check; `DEGRADED` marker is `coverageComplete:false` in the summary and a `degradedReason` string (`security-coverage-contract.md:80`).
- Owner: security-coverage-contract. Test: T464 (A35) covers zero *evidence*; MISSING for passive-only plus all-active-blocked.
- Residual: P13 "no cap" (plan.md:270).
- Attack: production scan, passive checks run and find nothing, every active check `BLOCKED`: state is `DEGRADED`, score is `scoreFromFindings([])` = 100, and it is averaged into the overall score (X2). The marker has no column (`ModuleResult` has `score,summary,skippedReason,degradedReason` only) and "no consumer may present it" binds code nobody owns (certificate, badge, email, 014 readiness). The tests that would exercise it assert score `null` for `DEGRADED` (T420/T478), the opposite of FR-142. GAP. Repair G-3.

### 36. API discovered but never authorized. ADEQUATE
- Threat: operation in an OpenAPI file gets probed because it was discovered.
- Mechanism: `probeEligible` requires `IN_SCOPE` and class and category; re-evaluated at plan, dispatch and per request; inventory writer is parent-only (FR-100; `api-discovery-contract.md` inv. 5; `api-security-check-contract.md` inv. 1).
- Owner: api-discovery-contract. Test: T465 (A36), `T-API-DISC-08`.
- Residual: none.
- Attack: eligibility stored in Evidence is advisory; the per-request gate and F01 re-ask. ADEQUATE.

### 37. OpenAPI spec contains malicious references. WEAK
- Threat: alias bomb, deep nesting, recursion, huge document.
- Mechanism: 5 MiB/depth 64/200k nodes with alias expansion counted, safe-schema load, 10 s wall-clock (`api-discovery-contract.md` inv. 2-4, budgets).
- Owner: api-discovery-contract. Test: T466 (A37), `T-API-DISC-03/04/05`.
- Residual: parser library `UNKNOWN` (plan.md:12).
- Attack: limits are to be enforced "while streaming, before building any object graph" but common YAML parsers are synchronous whole-document and expand aliases internally; a 10-second wall-clock cap cannot interrupt synchronous JS in the worker parent's event loop (the contract places the builder parent-side). A 5 MiB YAML can block the loop long enough to lose BullMQ locks and the F07 30 s lease renewal (A10, A25). The fixture asserts "within cap" but the architecture has no preemption. WEAK. Repair G-21.

### 38. External $ref triggers SSRF. ADEQUATE
- Threat: `$ref`, `servers`, `externalValue`, `$id` resolves to a URL or file and the library fetches it.
- Mechanism: whole-document pre-scan refuses any non-fragment `$ref` before parse hand-off; builder has no network (inv. 1-2); `servers[]` inventory only (FR-083); fixture T-API-DISC-02 with network spy.
- Owner: api-discovery-contract. Test: T467 (A38), `T-API-DISC-02`.
- Residual: a parser's default resolver if the pre-scan is bypassed by encoding.
- Attack: the pre-scan precedes the library, so default network resolvers are never reached for refused documents. Run the parser in a no-egress context anyway (folded in G-21). ADEQUATE.

### 39. CORS test incorrectly reports a vulnerability. WEAK
- Threat: `LIKELY` HIGH for a non-exploitable CORS configuration.
- Mechanism: `LIKELY` only with ACAO reflection and `Allow-Credentials:true` on a registered-identity endpoint; else `CONFIGURATION_RISK`/`INFORMATIONAL`, never `CONFIRMED` (FR-110; `probe-family-contract.md` inv. 17).
- Owner: probe-family-contract. Test: T468 (A39), `T-PROBE-12`.
- Residual: browser enforcement.
- Attack: a token-in-header API (Bearer, no ambient credentials) or a session cookie with `SameSite=Lax/Strict` makes `ACAC:true` reflection non-exploitable; the ladder does not consider credential transport or cookie attributes, so it reports `LIKELY` (cap HIGH). WEAK (LOW). Repair G-30.

### 40. Missing CSRF token incorrectly reported exploitable. ADEQUATE
- Threat: absence of a token reported as exploitable CSRF.
- Mechanism: FR-108; passive absence is `CONFIGURATION_RISK`/`INFORMATIONAL`; fixture comparison tops at `LIKELY`, never `CONFIRMED`; static finding templates (`security-finding-contract.md` M6).
- Owner: probe-family-contract. Test: T469 (A40), T242, `T-PROBE-11`.
- Residual: SameSite may block practical exploitation (stated in report).
- Attack: no path to "exploitable" wording exists in templates; add `exploitable` to copy-lint (cheap). ADEQUATE.

### 41. Dependency advisory becomes stale. WEAK
- Threat: old snapshot reported as current protection.
- Mechanism: freshness from `sourceRetrievedAt` <= 14 days else `NOT_TESTED` (FR-170, FR-112); one snapshot per plan.
- Owner: advisory-matching-contract. Test: T470 (A41), T488 (R08).
- Residual: provenance.
- Attack: the anchor is a manifest field supplied at operator import (`ADVISORY_MATCH` carries both timestamps); signature "if present" (data-model V-12). Re-stamping old data with a new `sourceRetrievedAt` defeats freshness. Derive freshness from the data (max advisory `modified`) and require a signature. WEAK (LOW). Repair G-32.

### 42. Dependency version cannot be resolved. ADEQUATE
- Mechanism: exact lockfile version only; unresolved is `NOT_TESTED` `SEC_VERSION_UNRESOLVED` (advisory-matching inv. 4; FR-112). Test: T471 (A42). ADEQUATE.

### 43. Two security checks duplicate a Finding. WEAK
- Threat: double-counted issue, nondeterministic severity.
- Mechanism: shared `rootCauseGroup`, canonical `checkId` into `fingerprintOf`, `createMany skipDuplicates` on `(scanId,fingerprint)` (`persist.ts`, `security-finding-contract.md:98-104`).
- Owner: security-finding-contract. Test: T472 (A43), T334.
- Residual: legacy overlap (named limitation 7).
- Attack: the canonical-member rule is "Open for closure" (`security-finding-contract.md:238`) and not in FR-141. Members are evaluated at different times with different severity/confidence; `skipDuplicates` keeps the first writer's row, so title and severity depend on evaluation order. Legacy `headers.*`/`owasp.*` findings for the same header carry different fingerprints and both deduct from the same area score during the strict parallel run. WEAK (LOW). Repair G-33.

### 44. Security scanner bypasses safe-net. WEAK
- Threat: engine or a dependency opens its own socket.
- Mechanism: single client rule, static import lint (T473/A44), "no fallback client" (`active-security-execution-contract.md:70`).
- Owner: active-security-execution-contract.
- Residual: "no other egress" (plan.md:71).
- Attack: the guarantee is a code-review lint over 012's own packages. The credential-bearing child is a normal Node process with unrestricted network and the full stdlib; any dependency (YAML, HTML, JSON parsers), a hostile-response-triggered bug in the child, or a mistake can dial anywhere. plan.md:72 explicitly says it is not the Principle XI VM bar. There is no OS-level egress control to the authorised hosts and nothing prevents exfiltration of a lease secret from a compromised child. WEAK. Repair G-6.

### 45. Browser-based probe bypasses F01. ADEQUATE
- Mechanism: 012 starts no browser; browser evidence only from 010 `BROWSER` units under F01/F07 and 010's safe-net proxy; unauthenticated, no crafted navigation (FR-085, FR-155; `probe-family-contract.md` inv. 10). Test: T474 (A45), T126, T176. Residual: 010's own page-script behaviour in production (passive, 010's scope). ADEQUATE.

### 46. Session cleanup races with finalization. WEAK
- Threat: unit finalizes, F07 lease released, while a child or session is alive.
- Mechanism: order jar drop, broker `DESTROYED`, `onUnitExpired=TERMINATED`, F07 release; finalize guard (live lease, deadline) (`credential-broker-contract.md:85-95`; 009 `scan-deadline-contract.md:193-199`).
- Owner: auth-session-contract. Test: T475 (A46), T148, `broker.destroy-ordering`.
- Residual: TOCTOU in 009 finalize guard (009 rule 1, named).
- Attack: `DESTROYED` needs proof from the parent (`{jarDisposed, childExited}`). If the parent is the process that died, no one can produce the proof, `onUnitExpired` stays `PENDING` until `TERMINATION_UNCONFIRMED` frees the F07 lease while the orphaned child may still hold the secret and cookies. No rule makes the child exit on IPC loss (every checkpoint is an IPC round trip, so it cannot send, but it holds credentials until its own exit). WEAK. Repair G-6.

### 47. Evidence write arrives after cancellation. WEAK
- Threat: post-stop response persisted as trusted evidence.
- Mechanism: fenced writer rejects terminal unit, terminal scan, passed deadline, dead lease (`security-evidence-contract.md:43-47`; 009 `scan-deadline-contract.md:247-253`).
- Owner: security-evidence-contract. Test: T476 (A47), T427 (P28).
- Residual: none stated.
- Attack: between `REQUESTED` stop and unit terminal state the unit is non-terminal and the lease was live at its last renewal; the fence does not read `KillSwitchState`, so a response completing in that window is written. The engine rule "late response after abort is neither trusted nor persisted" is code in the child, not a fence predicate. WEAK (LOW). Repair G-31.

### 48. Reverify reuses expired credentials. ADEQUATE
- Mechanism: fresh lease through full checklist; version re-resolved; triple unique; expired/revoked yields `INCONCLUSIVE` (`security-reverify-contract.md` steps 5-6; broker). Test: T477 (A48), T428 (P29), `reverify.lease.fresh-and-revalidated`. Residual: role change handled as `INCONCLUSIVE`. ADEQUATE.

### 49. Partial scan receives full security score. GAP
Same mechanism and failure as scenario 35. `NOT_APPLICABLE` null protects only the no-result case; `DEGRADED` with real passive results is scored 100 (X2); T478's expected "DEGRADED, score null" contradicts FR-142 so the fixture cannot pass against a spec-conformant implementation and tests nothing useful. GAP. Repair G-3.

### 50. Security engine exceeds approved budget. ADEQUATE
- Mechanism: F07 authoritative for requests/concurrency/duration with atomic admission (`safety-admission-contract.md:56-64`); local pre-check; ceilings 300/150 (plan.md:129). Test: T479 (A50), T458.
- Residual: per-endpoint/per-identity/byte counters are per unit (G-29); F07 per-request key derivation unspecified (A13).
- Attack: the approved budget (grant) is a DB-enforced hard cap provided A13 is fixed. ADEQUATE conditional on G-1.

---

# Part 2. Additional scenarios (28)

### A1. Broker as confused deputy; trust in worker-writable Postgres rows. GAP
- Threat: a compromised worker (or injected code) inserts/updates `ExecutionUnit` (status `RUNNING`, `userId`=victim, `credentialBindingRef`=victim ref), plan, `AdmissionLease`, and obtains a lease; broker re-reads those same rows and agrees.
- Mechanism: broker steps 1-9 read unit/plan/grant/lease from Postgres "never trusting the caller" (`credential-broker-contract.md:49-65`); lease-holder token check; per-tenant 20/min rate (`:168`); NONE for integrity of the rows themselves.
- Owner: credential-broker-contract. Test: MISSING.
- Residual: attacker limited to non-production, active-grant, unexpired credentials.
- Attack: the worker resolves plans, writes units, holds the DB URL (research R2/R4; plan.md D1). Broker and worker share the same truth source, so "re-read from Postgres" proves consistency of forged rows, not authenticity. AAD binding stops ciphertext transplant, not a lawful-looking request. The audited over-privilege that justified the broker (plan.md:487) survives for credential theft. GAP. Repair G-4.

### A2. Unit-state TOCTOU between broker check and delivery. WEAK
- Threat: revoke, kill or grant change after the transaction but before first use.
- Mechanism: lease row inserted before unwrap, `REVOKED` visible at next `leaseStatus` (`credential-broker-contract.md:63,78-83`).
- Owner: credential-broker-contract. Test: `broker.revoke-during-workflow` (timing only).
- Residual: <= 5 s window.
- Attack: step 12 does not re-check state after KMS unwrap; delivery then login can occur before the next host-loop tick since the per-request pipeline has no `leaseStatus` read (scenario 13). WEAK. Repair G-7.

### A3. IPC channel between worker parent and child; hostile-response parsing in the credential-bearing child. WEAK
- Threat: hostile response exploits a parser bug in the child (JSON/HTML/header/CSP parsers, `__proto__` keys), reads secrets, forges IPC messages (claims, intents, evidence), or the child outlives the parent.
- Mechanism: secrets over IPC memory only (FR-033), child has no DB and no KEK, parent SIGKILL (FR-053), parent re-runs redaction (stage 2).
- Owner: credential-broker-contract, active-security-execution-contract. Test: MISSING (IPC message validation, orphan child).
- Residual: no OS confinement (plan.md:72).
- Attack: the parent trusts child-supplied `identityRef`, class, intents, "sanitized candidate" and `confirmLeaseDestroyed` proof fields; none is validated against unit configuration. A compromised child holds live credentials with unrestricted egress (scenario 44) and can emit forged `CLEANUP_RECORD`/claims through the parent. WEAK. Repair G-6.

### A4. Crash dumps, core files, heap snapshots, swap. WEAK
- Threat: secrets in memory persisted by the runtime or the host.
- Mechanism: "core dumps disabled for the engine process group where the platform allows" (`credential-broker-contract.md:74`); best-effort zeroize (FR-034).
- Owner: credential-broker-contract. Test: MISSING.
- Residual: GC runtime; JS strings immutable and not zeroizable.
- Attack: JS secrets arrive as strings (immutable, copy-on-concat, interned); zeroize is a no-op for strings. Node diagnostics (`--heapsnapshot-signal`, `--heapsnapshot-near-heap-limit`, `process.report`), container core patterns, swap, and OOM tooling all capture heap. "Where the platform allows" is not a requirement. WEAK. Repair G-16.

### A5. Sentry/APM breadcrumbs and error messages echoing secrets. WEAK
- Threat: breadcrumb messages, `extra`, `contexts`, exception text, performance spans.
- Mechanism: planned value-aware Sentry scrubbing (FR-132).
- Test: `evidence.log.sentry-scrub` (message only).
- Attack: X7. `captureAlert` passes arbitrary `extra` unscrubbed (`monitoring.ts` `captureAlert`). Registry scope across concurrent units undefined. WEAK. Repair G-16.

### A6. Customer-controlled strings poison evidence, logs, UI and AI (log injection). WEAK
- Threat: header names, cookie names, JSON keys, `Server` banner, redirect `Location` contain CRLF, markup, prompt-injection text; stored in `headerNames[]`, `setCookie[].name`, `jsonShape.keys`, `locationClass`.
- Mechanism: UI renders excerpts as escaped text; AI gets class-level inputs; untrusted-data rule (FR-134).
- Test: `evidence.untrusted.never-html-never-ai` (body only).
- Attack: names and banner values are stored target-controlled strings with no charset, length or control-character normalization rule; `disclosure` checks persist `Server`/`X-Powered-By` values (allow-listed `parsedHeaders`). Any text field that reaches logs, CSV exports or the report is injection surface. WEAK. Repair G-25.

### A7. Evidence tampering and cloaking by the target. WEAK (limitation)
- Threat: customer or WAF detects Fahes and serves clean responses (false `NO_ISSUE_DETECTED`), or forges "vulnerable" responses.
- Mechanism: scoped statement wording (FR-137), `NO_ISSUE_DETECTED` limited to executed probes.
- Test: n/a. Residual: not resolvable in planning (see Part 5).
- Attack: no integrity channel to the target exists. Statement wording mitigates misrepresentation but certificates/readiness (014) may still consume it. Add explicit "observed responses are target-asserted" line to report copy (G-39 LOW).

### A8. Oracle spoofing leading to false CONFIRMED. WEAK
- Threat: a target echoing the marker, or a marker defined as a field name, makes `MARKER_PRESENT` true for non-violations; child-computed booleans cannot be re-verified by the parent.
- Mechanism: baseline validity, `confirmable` flag, owner control read.
- Test: `T-AUTHZ-01` (positive case only).
- Attack: no requirement that the marker be a unique high-entropy synthetic value, distinct per fixture owner, absent from the actor's own data; no negative-control read proving the actor's own resource lacks the marker. Both the contract and data-model oracle vocabularies differ. WEAK. Repair G-17.

### A9. Decompression bombs and oversized structured bodies in responses. WEAK
- Threat: gzip/brotli bomb or deep JSON in a response; read cap counts wire bytes.
- Mechanism: 256 KiB read cap and "bounded depth/size" parse (`active-security-execution-contract.md` step 8; `security-evidence-contract.md` inv. 23).
- Attack: safe-net throws at its byte cap (`safe-fetch.ts` `readBounded`, default 10 MiB) rather than truncating, and `request` does not decode; the contract assumes truncation and parsing of decoded content without stating a cap on decoded size or decompression ratio. WEAK (MEDIUM). Repair G-41.

### A10. ReDoS and event-loop blocking in the parent. GAP
- Threat: a hostile 256 KiB body triggers super-linear redaction/classifier cost in the parent (X6), blocking the loop; BullMQ lock and F07 30 s lease renewal lapse; job redelivered (A25) and concurrency lease released while a child is still sending.
- Mechanism: "short wall-clock bound" for `evaluate` (`security-check-registry-contract.md:203`) which cannot preempt synchronous code; no bound on redaction, classifiers (CSP, `Set-Cookie`, reflection).
- Owner: security-evidence-contract. Test: MISSING.
- Attack: by inspection `detect.ts:132` (many `-----BEGIN ... PRIVATE KEY-----` with no END) is quadratic and `SECRET_NAME` (`:120`) has overlapping unbounded classes before `\s*[:=]` (`:176-189`). Redaction runs in the parent too. GAP. Repair G-5.

### A11. Fixture abuse to make Fahes touch non-fixture or real data. WEAK
- Threat: customer declares production-copy or real records as "fixtures"; collection or wildcard locators; shared staging/production backends.
- Mechanism: synthetic-values regex, locator host must equal Target host (data-model V-6), `sandboxConfirmed` boolean.
- Test: `T-MUT-fixture-only-identifiers`.
- Attack: everything about "synthetic" and "isolated" is customer assertion; response-derived ids (scenario 21). Partly not resolvable (Part 5). WEAK. Repair G-27.

### A12. Grant-scope drift between `securityScopeGate` and F01. ADEQUATE
- Mechanism: gate runs in addition to F01/F07, fail closed; the same pure predicate is shared by plan resolution and gate (`security-scope-contract.md:97-102,123-132`); AND-composition so the stricter wins; unknown category strings refused.
- Test: `scope.gate.category-matrix`, `scope.gate.fail-closed`.
- Attack: divergence can only deny. The gate reads the grant by id as a second read (`:127`); a revoke between gate and checkpoint is caught by F07's own check. ADEQUATE. LOW repair: assert gate and checkpoint use the same grant id (G-34).

### A13. F07 idempotency-key derivation for per-request admission. GAP
- Threat: reusing the unit key for each request makes F07 replay the first `GRANTED` without consuming, so request budget never decrements and only local limits bound the unit.
- Mechanism: unit key derived from `(unit id, attempt)` (009 `execution-unit-contract.md:72`; `active-security-execution-contract.md:183`); "retry gets a new key" (`:87`). No per-request key rule, no per-action key table.
- Owner: active-security-execution-contract (the FR-019 unit-consumption policy). Test: T034 asserts request-unit counting but not the key rule.
- Attack: 008 FR-008 makes key derivation the caller's duty and states no protection when wrong; the 012 unit-consumption table (`:72-85`) omits keys. GAP. Repair G-1.

### A14. Class-boundary ambiguity between E15 and E14 for cross-identity requests. WEAK
- Threat: BOLA probes routed as E15-only "replay of a declared fixture operation under another identity" (FR-161) so only `AUTHENTICATED_WORKFLOW` authorization is needed, weakening consent gradation (a grant "for login workflows" permits attack-shaped probes).
- Mechanism: X5 contradiction.
- Test: `T-AUTHZ-18`, T040 (assert dual for crafted); no test defines "crafted" for replay.
- Repair G-11.

### A15. AuditLogEntry action-string injection. ADEQUATE
- Mechanism: `action` is a free `String` (`schema.prisma:858`); 012 action names are code-level constants (`data-model.md:619-630`), ids and closed reasons in `after`; labels validated (V-3).
- Attack: no request-derived string reaches `action`; add a lint constraining the action to a closed constant list (G-34, LOW). ADEQUATE.

### A16. Operator privilege abuse. WEAK
- Threat: operator with broker-host or KMS rights reads all credentials; operator `revoke-all` as tenant DoS; KEK ops without dual control.
- Mechanism: no operator read path (FR-021), DB role separation, SG10 owners and external review.
- Test: `secrets.roles.operator-limits` (API surface only).
- Attack: "operator" principal is undefined; broker-host operators can run broker code with unwrap permission; `rewrapAllForKekRotation` and `revokeAll*` have no stated dual control or alerting; break-glass absent but host access is unaddressed. WEAK. Repair G-37.

### A17. KMS outage and failure modes. ADEQUATE
- Mechanism: fail closed `SEC_BROKER_UNAVAILABLE`, no fallback (FR-037); create fails with nothing persisted; no lease cache; `broker.unavailable-fail-closed`.
- Residual: KEK deletion is irreversible (per-tenant KEK option); add key-deletion protection to SG3 (G-37).
- ADEQUATE.

### A18. Replay of lease triples and loss of ledgers after DB restore. GAP
- Threat: PITR restores an earlier state: lease rows, `BudgetConsumption`, `MutationIntent`, claims and auth-attempt counters after the restore point disappear; the triple is "free", duplicates and attempt budgets reset, F07 budget re-granted.
- Mechanism: NONE (uniqueness lives only in the restored DB).
- Test: MISSING.
- Repair G-15.

### A19. Time-source skew (DB vs worker vs broker). WEAK
- Threat: slow worker clock keeps an expired grant usable; broker computes lease `expiresAt` from its own clock.
- Mechanism: 009 uses DB `now()` for new deadline predicates (`scan-deadline-contract.md` Clock); F07 `requestAdmission(..., now)` and F01 `isAuthorized(..., now)` take a caller-supplied `now` (`safety-admission-contract.md:20`).
- Test: MISSING. 012 never states where `now` comes from for admission or `expiresAt`.
- Repair G-14.

### A20. IDOR on 012 control-plane routes. WEAK
- Mechanism: every read and write by id also filters `userId` (data-model.md:176-178, V-14), uniform NotFound.
- Test: named for credentials (T064) and a few reads; no enumeration of every 012 route.
- Attack: no RLS; app-layer convention across ~10 new route families (credentials, roles, identities, fixtures, config versions, API documents, residue summary, coverage, reverify, advisory import). One missed filter is a cross-tenant disclosure. Repair G-26.

### A21. Mass-assignment on TestIdentity, credential, fixture APIs. WEAK
- Threat: caller sets `userId`, `state`, `usage`, `currentVersionId`, `retiredAt`, `environmentClass`, `mutationConsents`, `sandboxConfirmed`.
- Mechanism: "`userId` re-derived, never caller supplied" only; validation rules on content (data-model §11).
- Test: MISSING.
- Attack: `FixtureResource.mutationConsents` is a customer-writable JSON column on the fixture (`data-model.md:429`), so the per-class consent that the plan wants to be a deliberate, copy-backed, grant-scoped act (SG9) can be written by an ordinary create/patch. Repair G-26.

### A22. Export, report and share-link leakage. WEAK
- Threat: reports and exports reveal API inventory, role labels, fixture ids, residual manifests, endpoint paths to anyone with a share link.
- Mechanism: FR-024 forbids secrets in exports; tenant-scoped reads.
- Test: `coverage.tenant-isolation`, `evidence.tenant.isolation` (cross-tenant only).
- Attack: `API_SURFACE` of an authenticated API and `PERMISSION_COMPARISON` are reconnaissance by structure; no sensitivity classification of 012 evidence kinds for public/shared report links or PDF/CSV export. Repair G-36.

### A23. Reverify billing and attempt abuse. WEAK
- Threat: repeated assert-fixed cycles use active probes at the flat `REVERIFY_COST`, burn login attempts and mutate fixtures.
- Mechanism: `reverifyRequestKey=(issueId, assertedFixedAt)` de-duplicates double clicks only (`security-reverify-contract.md:128`).
- Test: T368.
- Repair G-35.

### A24. AI explanation of redacted evidence; customer metadata to a third-party model. WEAK
- Threat: placeholder tokens, role keys, path templates, counts and fixture classes leave the tenant boundary to the AI provider; the explanation could echo them in reports.
- Mechanism: class-level inputs (FR-144).
- Attack: SG9 consent covers "credential storage and active testing", not AI processing of security evidence; no opt-out. Repair G-39 (LOW; mostly policy).

### A25. BullMQ stalled-job recovery and double-hosting of one unit. WEAK
- Threat: parent event loop blocked (A10) or worker lost, lock expires, the same unit is dispatched to a second worker while the first child still runs; F07 admission with the same key returns the first `GRANTED` result including the same lease token, so both hosts look like valid holders.
- Mechanism: terminal-unit no-op (009 rule 4); claims prevent duplicate probes; broker triple prevents a second lease.
- Attack: 009 rule 4 covers terminal units only; no rule that dispatch of a `RUNNING` unit under a live lease is refused or that the host holds a unique `hostInstanceId` CAS. Uncredentialed `C1` probes with stale claims can be re-sent (`security-check-registry-contract.md:137`, up to one retry). Repair G-28.

### A26. Multi-worker concurrency on the same identity. WEAK
- Threat: two scans, a reverify and an E14/E15 pair log in as one identity at once; target single-session policy kicks the other, producing false `logout-invalidation`/`SEC_SESSION_*` verdicts and lockouts.
- Mechanism: per-unit jars, <= 4 identities/unit, "1 in-flight per identity" within a unit.
- Test: MISSING (cross-unit).
- Repair G-19.

### A27. Legal and consent gaps. GAP
- Threat: self-service grants without a recorded, versioned authority and third-party-hosting attestation; no capture of who accepted which disclosure; shared-platform ToS (cloud/PaaS pentest policies); staging containing personal data processed by Fahes; contractor authority.
- Mechanism: SG9 "consent/disclosure copy approved (U30)" gates enrolment; `FixtureResource.mutationConsents` has `{grantedAt, grantedBy, targetAuthorizationId}` only; no consent entity exists in data-model.md.
- Test: MISSING.
- Repair G-13.

### A28. Customer misclassifies production as STAGING. GAP
- Threat: owner classifies a live site STAGING (or flips PRODUCTION to STAGING, runs active tests, flips back); staging shares prod DB/APIs/payment keys.
- Mechanism: classification is owner-attested; owner may reclassify any time; audit entry only (007 FR-017a/018a, spec lines 512-521). 012's "production prohibited" (FR-078) delegates entirely to that value.
- Test: MISSING.
- Attack: the headline safety claim of the package has no verification of its premise; `scope.reclassify.no-heal` addresses only mid-unit flapping. Partially resolvable (Part 5). Repair G-12.

---

# Part 3. Scoreboard

| | ADEQUATE | WEAK | GAP | Total |
|---|---|---|---|---|
| 50 required scenarios | 22 | 25 | 3 | 50 |
| 28 additional scenarios | 3 | 19 | 6 | 28 |
| **All 78** | **25** | **44** | **9** | **78** |

GAPs: scenarios 7, 35, 49; additional A1, A10, A13, A18, A27, A28.
Scenario IDs rated ADEQUATE: 1, 2, 3, 6, 11, 12, 14, 15, 17, 20, 22, 26, 27, 28, 30, 36, 38, 40, 42, 45, 48, 50; A12, A15, A17.
SC-005 ("all 50 scenarios each have a named mechanism, owning contract and acceptance test") is not currently true for scenarios 7, 35, 49 and is only nominally true for the 25 WEAK ones whose tests do not exercise the attack.

---

# Part 4. Required repairs (prioritized)

Each repair: id, severity, file and section, text or mechanism to add, acceptance test to add.

**G-1 [HIGH] Per-request F07 idempotency key rule.** Files: `contracts/active-security-execution-contract.md` "Unit-consumption policy" table and "Idempotency & retry"; `auth-workflow-execution-contract.md` Idempotency; spec FR-072/FR-077. Add: every checkpoint call carries `idempotencyKey = H(unitIdempotencyKey, callSite, requestOrdinal | probeClaimKey, redirectHopIndex)`; the dispatch-level key is used only for the dispatch checkpoint; retries and each hop get distinct ordinals; the secondary dual-class check uses `H(primaryKey, "SECONDARY")`. Test: `T-E14-per-request-key`: against a real F07 stub, N sent requests produce exactly N `BudgetConsumption` rows; a redelivered request with the same ordinal produces one.

**G-2 [HIGH] Bind active destinations to an owner-verified address (scenarios 5, 7).** Files: `security-scope-contract.md` "Safety & Authorization" (after redirect rules) and `credential-broker-contract.md` step 5; plan.md Production Safety Matrix note; `active-security-execution-contract.md` dispatch step 2 and `SecurityHttpClient` requirements. Add: before any `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` plan resolves and again at dispatch, re-run the existing Target ownership verification (the same proof the customer used) within a bounded age (provisional 24 h), and require the verification artifact to be served by the address `SecurityHttpClient` actually connects to (HTTP-file proof checked over the connection about to carry probes), or the customer declares an expected address set that the connect guard enforces. Refuse with a new closed code `SEC_TARGET_ADDRESS_UNVERIFIED` (adds to the 75-code registry; update T013 parity). Wildcard scopes require each in-scope hostname to pass the same proof. Test: `scope.destination.address-drift`: name re-pointed to a different public address after verification yields refusal and zero probe bytes; shared-edge CNAME fixture requires explicit customer attestation recorded in the consent record (G-13).

**G-3 [HIGH] DEGRADED SECURITY score integrity (scenarios 35, 49).** Files: spec FR-142 + P13 (plan.md:270); `security-coverage-contract.md` state/score table and invariants 4-5; `tasks.md` T420, T478, T336. Decide P13 at closure with a conservative default: when `coverageComplete == false`, persist `score = null` for the SECURITY `ModuleResult` (state `DEGRADED`, delivered for refund semantics) so `overallScore` excludes it (the aggregator already excludes null scores: `aggregate.ts` overall loop), and carry the findings-derived number only inside `summary`/coverage. If the owner insists on a numeric DEGRADED score, require a documented cap (e.g. <= 70) and an explicit `ModuleResult` marker column (additive migration), not a string in `degradedReason`. Reconcile T420/T478 with whichever is chosen (today they contradict FR-142). Test: `coverage.passive-only-production-no-100`: passive clean, all active blocked, asserts the persisted score is `null` or <= cap, never 100, and that overall score is unchanged by the SECURITY area.

**G-4 [HIGH] Broker trust anchor independent of worker-writable rows (A1, 11).** Files: `credential-broker-contract.md` steps 1-3 and Invariant 1; plan.md D2 and Complexity; `data-model.md` common rules (DB roles). Add: (a) the worker/engine-host DB role may not write `ExecutionUnit.{userId,targetId,credentialBindingRef,executionClass}`, `TargetAuthorization`, or `AdmissionLease` except through narrow security-definer functions that the broker's checks can rely on; (b) plan resolution (the only writer of unit identity fields) stamps each credentialed unit with a MAC over `(unitId, attempt, userId, targetId, credentialBindingRef, grantId, planId)` under a key the broker verifies and the engine-host does not hold; broker denies on MAC failure; (c) broker anomaly rule: more than K distinct credential references for one tenant from one worker principal in a window, or any issue for a unit created after its plan's `resolvedAt`, denies and alerts. If the plan resolver and engine host are the same principal, state that the broker only protects data at rest and rewrite the Constitution/Complexity justification accordingly. Test: `broker.forged-unit-rows`: a worker-role DB session inserts a unit row for another tenant's reference; broker denies, zero unwrap, alert emitted.

**G-5 [HIGH] Bound redaction and classifier cost; keep the parent loop responsive (A10).** Files: `security-evidence-contract.md` "Value-aware redaction pipeline" and Failure states; `security-check-registry-contract.md` evaluator step 7; SG4 (plan.md). Add: hard input cap before redaction (<= read cap), pre-segmenting for long runs without delimiters, replacing `[\s\S]*?` and `SECRET_NAME` forms with linear scanners (or run all hostile-text parsing in the child/worker thread with `resourceLimits` and terminate on overrun), and a watchdog: any synchronous parent section over 200 ms trips `SEC_ANALYSIS_BUDGET_EXHAUSTED` and fails closed to `{"_redactionFailed":true}`. Test: `evidence.redaction.adversarial-complexity`: 256 KiB of repeated key-armour openers and repeated secret-name fragments complete under a fixed time bound with event-loop lag under 100 ms.

**G-6 [HIGH] Child confinement and lifecycle (44, 46, A3).** Files: `active-security-execution-contract.md` "Isolation" (plan.md field 6 for both classes), `credential-broker-contract.md` delivery section, `auth-session-contract.md` teardown. Add: the engine child runs with OS/container egress restricted to a safe-net-backed CONNECT/egress proxy that enforces the authorised host set (the 010 `browser-proxy` pattern), no other egress; child exits on IPC disconnect within 2 s and on missed parent heartbeat; parent validates every child message against the unit's configuration (`identityRef`, class, fixture ids, intent fields) with a closed schema and never accepts proof fields (`jarDisposed`, `childExited`) from the child (the parent observes process exit itself); seccomp/no-new-privileges. Test: `engine.child.no-direct-egress` (direct `net.connect` fails), `engine.child.orphan-exits`, `engine.ipc.forged-message-rejected`.

**G-7 [MEDIUM] Per-request lease liveness (13, A2).** Files: `active-security-execution-contract.md` per-request pipeline (add step between 2 and 3), `credential-broker-contract.md` "Re-validation during a unit" and Named limitations; FR-039. Add: before step 5, read broker `leaseStatus` (or a revoke-push flag delivered over IPC and checked synchronously, plus periodic poll as backstop); on `REVOKED/EXPIRED` no further request. Correct the named limitation to "at most the in-flight request". Test: `broker.revoke-during-workflow` asserts at most 1 request is sent after the revoke commits.

**G-8 [HIGH] Names are values; add PII detection (31, 32).** Files: `security-evidence-contract.md` payload table (`headerNames`, `setCookie[].name`, `queryParamNames`, `jsonShape`) and redaction steps; plan.md SG4. Add: names pass the pattern/entropy detectors and a name-class allow-list (known header names; cookie names reduced to prefix class plus length class when matching `[-_.][0-9a-f]{16,}`/uuid); JSON key names beyond a small frequency threshold or matching id/email/uuid/high-entropy forms are replaced by `<key:class>`; add a PII detector set (email, phone, PAN with Luhn, IBAN, national-id formats) to the `@webaudit/redaction` extension and apply it to excerpts; default `excerptAllowed=false` except for header/CSP-class checks. Test: `evidence.names.value-bearing`: map keyed by emails/tokens, cookie `sess_<hash>` yield no value in any persisted field.

**G-9 [MEDIUM] Redirect credential rules (4).** Files: FR-081; `security-scope-contract.md:172`; `active-security-execution-contract.md` client requirements 2(d)/3; research R4. Add: same-origin means identical scheme+host+port; strip every credential-class header (registry-declared `injectionSpec` header names plus `Authorization`, `Cookie`, `Proxy-Authorization`, `X-*-Token`, `X-API-Key`, any name matching the structural rule) on any non-identical origin; refuse https to http hops outright; correct the false statement that safe-net already strips custom headers. Test: `T-E14-redirect-credentials`: API-key header, scheme downgrade and port change hops forward nothing.

**G-10 [HIGH] Undeclared operations are potentially mutating regardless of method (24, X4).** Files: `api-security-check-contract.md` inv. 3; `security-scope-contract.md` computeClassification; FR-007. Add: an operation with no customer declaration (`readOnlyDeclared`) is treated as potentially mutating for every method; active probes are refused (`SEC_MUTATION_NOT_PERMITTED`) unless declared read-only by the customer or fixture-confined with consent; static checks still run. Test: `T-API-undeclared-GET`: undeclared state-changing GET receives zero active probes; declared read-only GET receives them.

**G-11 [MEDIUM] One definition of "crafted" for credentialed requests (A14, X5).** Files: spec FR-161 and FR-008; `authorization-testing-contract.md` step 3; `auth-workflow-execution-contract.md` dual-class split. Add: any request issued under an identity other than the fixture owner against an owner's fixture (cross-identity replay) is `NEGATIVE_PROBE` and is E14 dual-class; E15 single-class is limited to login/logout/refresh and same-identity reads. Test: `T-AUTHZ-cross-identity-replay-dual`.

**G-12 [HIGH] Environment classification integrity (A28).** Files: `security-scope-contract.md` gate step 1; `credential-broker-contract.md` step 5; spec FR-013/FR-014/FR-078; `quickstart.md` Part C. Add 012-owned guards (no 007 change): (a) refuse issuing leases or active dispatch within a cool-off (provisional 24 h) after any reclassification from PRODUCTION; (b) require, per active/auth plan, a recorded attestation that the target uses no production data stores, payment keys or third-party production integrations (part of G-13's consent record); (c) if the Target's host was ever `PRODUCTION`-classified or has an unrelated production Target on the same registrable domain for the same tenant, require explicit re-attestation. State plainly in plan.md that production prohibition equals "customer-attested non-production". Test: `scope.reclassify.cooloff`: PRODUCTION to STAGING within 24 h yields `SEC_ENVIRONMENT_UNCLASSIFIED` (or new `SEC_ENVIRONMENT_COOLOFF`, registry update) and zero units.

**G-13 [HIGH] Consent record entity (A27).** Files: `data-model.md` (new `SecurityConsentRecord` table: versioned disclosure id, accepted-by, authority attestation, third-party/hosting-provider attestation, data-handling acknowledgement, mutation-class consents, timestamps, source address hash); spec FR-005/FR-119 and plan SG9; `mutation-cleanup-contract.md` (consent read from this record, not from `FixtureResource.mutationConsents`). Add: creating an `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` grant for a 012 target and enabling any mutation class requires a current record; no record, `SEC_CONSENT_MISSING`. Test: `consent.record-required-and-versioned`.

**G-14 [MEDIUM] Single time source (A19).** Files: spec FR-003/FR-033; `credential-broker-contract.md` step 12; `active-security-execution-contract.md` host loop; `security-scope-contract.md`. Add: every `now` passed to `isAuthorized`/`requestAdmission`/broker expiry computation is the database clock (`SELECT now()` in the same transaction); skewed worker clocks are ignored; alert if worker/DB skew exceeds 2 s. Test: `time.worker-clock-slow`: a worker clock 10 minutes behind cannot use an expired grant or over-extend a lease.

**G-15 [MEDIUM] Restore/replay protection (A18).** Files: `credential-broker-contract.md` Idempotency; `secrets-management-contract.md` incident section; quickstart runbook; data-model §13. Add: a monotonic `platformEpoch` (outside the restored database, e.g. KMS-held counter or broker-signed) stamped on units/leases; after any restore, bump the epoch, fail all non-terminal units, revoke all leases, reset nothing silently; auth-attempt and mutation counters are reconstructed conservatively (treated as exhausted) for the restore window. Test: `broker.post-restore-quarantine`.

**G-16 [HIGH] Logs, Sentry, BullMQ and dumps (8, 9, A4, A5).** Files: `security-evidence-contract.md` "PII minimization and logging"; `credential-broker-contract.md:74`; plan.md SG4/SG7. Add: a process-global exact-value registry (union over in-flight units) consulted by the logger and Sentry `beforeSend`; scrub `exception.values[].value`, `message`, `extra`, `contexts`, breadcrumb `message`; forbid logging error `cause` chains from `SecurityHttpClient`; sanitize BullMQ `returnvalue`, `progress`, `job.log`, `failedReason` and stacktrace; mandatory runtime posture (`ulimit -c 0`, no `--heapsnapshot-*`, no `process.report` on fatal for the engine process group, swap disabled or encrypted) enforced in an SG7 check, not "where the platform allows". Tests: `adverse.redis-job-keys-no-secret`, `adverse.sentry-error-message-no-secret`, `sg7.runtime-posture`.

**G-17 [MEDIUM] Oracle strength (34, A8).** Files: `authorization-testing-contract.md` Inputs/inv. 4-5; `test-identity-contract.md` rule 7; `data-model.md` §4.7 oracle kinds; reconcile vocabularies. Add: marker must be a unique synthetic value of at least 16 chars per fixture, registered with the exact-value registry, absent from the actor's own resources (negative control read per pair), and `CONFIRMED` requires both marker present for actor and absent in the actor's control read. One oracle vocabulary in both documents. Test: `T-AUTHZ-marker-field-name-not-enough`.

**G-18 [MEDIUM] Attempt budget across scans and silent lockouts (18).** Files: `credential-broker-contract.md` Budgets and step 9; `auth-session-contract.md` login; FR-070/FR-074. Add: auth-attempt budget is a rolling window per `TestIdentity` (provisional 24 h) across scans and reverify, held in the lease ledger; customer-declared `lockoutThreshold`/window on the identity caps attempts below it; a rejected stored credential marks the identity `CREDENTIAL_SUSPECT` and blocks further attempts until the customer re-confirms; define the MFA-challenge recogniser (closed signature classes). Tests: `broker.attempts-across-scans`, `session.silent-lockout-threshold`.

**G-19 [MEDIUM] One active lease per identity (A26) and closed AI-input type (10).** Files: `credential-broker-contract.md` step 10; `data-model.md` §4.3 (partial unique index on `testIdentityId` WHERE `status='ISSUED'`); `security-finding-contract.md` AI boundary. Add: new closed code `SEC_CREDENTIAL_LEASE_BUSY` (registry +1); ordering edges serialize E15 then E14 units. AI input assembler accepts only a closed schema of enums and numbers, never free strings from evidence; type-level enforcement plus test. Tests: `broker.identity-lease-exclusive`, `finding.ai-input-closed-schema`.

**G-20 [MEDIUM] AI-layer ban is module-level (33).** Files: spec FR-165; `security-finding-contract.md` rule 6; T345/T346. Add: for `ModuleType.SECURITY`, any `layer:'AI'` finding is dropped regardless of checkId; explanation text validator is advisory only and replaced by static template on any mismatch. Test: `ai-layer.security-module-any-checkid-dropped`.

**G-21 [MEDIUM] Isolate OpenAPI parsing (37, 38).** Files: `api-discovery-contract.md` inv. 3-4 and Budgets; plan.md Technical Context. Add: parse in a `worker_threads` (or child) context with `resourceLimits`, no network, hard terminate at 10 s; accept JSON only in v1 (YAML deferred) or run a byte-level alias/anchor and `<<` pre-scan before the library; prototype-pollution-safe key handling. Test: `T-API-DISC-alias-bomb-event-loop-lag`.

**G-22 [MEDIUM] Identity bound to the jar (16).** Files: `auth-session-contract.md` Operations; `security-scope-contract.md` gate. Add: `SessionHost.send` is the only way to attach credentials, derives `identityRef`/role from the handle, and calls the gate itself; a mismatched gate argument is refused. Test: `session.gate-identity-mismatch-refused`.

**G-23 [MEDIUM] Admin default-deny (23).** Files: `test-identity-contract.md` rule 11 and Inputs; `security-scope-contract.md` (empty `includedAccountRefs` semantics). Add: identities default to `usage = UNSET` which is not selectable as actor; actor use requires explicit `ACTOR_ALLOWED`; any role with highest `privilegeTier` or unset tier on a multi-role target is treated as high-privilege; empty `includedAccountRefs` never authorizes a high-privilege or `UNSET` identity. Apply to `logic.*` workflows too. Test: `identity.unset-usage-not-actor`.

**G-24 [MEDIUM] Sandbox tripwire (25).** Files: `business-logic-security-contract.md` inv. 9; `mutation-cleanup-contract.md` preconditions. Add: per-run typed re-confirmation for sensitive-class workflows; abort condition on any response carrying a live-mode indicator (e.g. `livemode:true`, live-key patterns already detected by `@webaudit/redaction`) recorded `SEC_MUTATION_NOT_PERMITTED`. Test: `T-LOGIC-live-mode-abort`.

**G-25 [MEDIUM] Normalize target-controlled strings (A6).** Files: `security-evidence-contract.md` sanitizer; FR-134. Add: every stored target-controlled string (header, cookie and JSON key names, banners, locations) passes a charset allow-list, max length 128, control-character stripping; UI/CSV exports escape. Test: `evidence.names.injection`.

**G-26 [MEDIUM] Route IDOR conformance and DTO allow-lists (A20, A21).** Files: `data-model.md` common rules; `test-identity-contract.md`; `secrets-management-contract.md`; tasks (new test). Add: closed write DTOs per entity (no `userId`, `state`, `currentVersionId`, `retiredAt`, `environmentClass`, `mutationConsents`, `usage` from clients except via dedicated routes); Postgres RLS on `credential_vault` and 012 tables keyed by `userId`; a conformance test enumerating every 012 route with a cross-tenant id. Test: `routes.idor-conformance`, `routes.mass-assignment-conformance`.

**G-27 [MEDIUM] No response-derived identifiers (21, A11).** Files: FR-092; `authorization-testing-contract.md` inv. 1; `test-identity-contract.md` Fixture rules. Add: v1 uses only identifiers registered in `FixtureResource.identifiers`; delete the "validated response id" clause; collection locators are refused unless the fixture declares `collection:true` with a maximum size. Test: `T-AUTHZ-06` extended with a response-injected id and a collection locator.

**G-28 [MEDIUM] Single live host per unit (A25).** Files: 009-facing `active-security-execution-contract.md` dispatch step 5; `runtime-finalization` interplay. Add: `DISPATCHED -> RUNNING` is a CAS that records `hostInstanceId`; dispatch of a `RUNNING` unit with a live lease held by another host is refused; the stale-claim re-send path for non-mutating probes is disabled for credentialed units. Test: `T-E14-double-dispatch`.

**G-29 [LOW] Atomic local reservation (29, 50).** Files: `active-security-execution-contract.md` `LocalBudget`. Replace `precheck/commit` with `reserve` (atomic increment) and `release`; read per-endpoint/per-identity/byte counters from a per-plan durable source like mutations. Test: `T-E14-local-budget-concurrent-reserve`.

**G-30 [LOW] CORS ladder (39).** Files: `probe-family-contract.md` inv. 17. `LIKELY` requires cookie-based session credential with `SameSite=None` (or declared); Bearer/header credentials and Lax/Strict cookies cap at `CONFIGURATION_RISK`. Test: `T-PROBE-12` extended.

**G-31 [LOW] Fence reads stop state (47).** Files: `security-evidence-contract.md` write order step 4. Add `no pending KillSwitchState for unit/scan/grant` to the fence predicate for unit-produced writes (residual manifests excluded). Test: `evidence.fence.stop-pending`.

**G-32 [LOW] Advisory freshness from data (41).** Files: `advisory-matching-contract.md` inv. 3 and import; data-model V-12. Freshness = max advisory `modified` in the payload; signature mandatory. Test: `advisory.restamped-old-data-stale`.

**G-33 [LOW] Deterministic finding merge (43).** Files: FR-141; `security-finding-contract.md:238`. Canonical member = lexicographically first id (state in FR-141); merge rule: highest confidence then severity wins by upsert; legacy-duplicate suppression via `rootCauseGroup` mapping during parallel run. Test: `finding.merge-deterministic-order`.

**G-34 [LOW] Consistency and small guards (3, A12, A15).** (a) data-model.md:478,833 "hard 50" contradicts the 25 cap (FR-075); (b) T420/T478 (see G-3); (c) test-identity-contract "2 units" vs 3 (already noted in tasks open item 5); (d) render-time assertion that the rendered request is within the computed class envelope; (e) gate and checkpoint use the same grant id; (f) lint that `AuditLogEntry.action` comes from a closed constant list; (g) add `exploitable` to copy-lint for non-`CONFIRMED` text.

**G-35 [LOW] Reverify limits and fixture exit state (A23, 27).** Per-issue reverify cooldown and daily cap; shared login-attempt window (G-18); a defined `RESIDUAL -> ACKNOWLEDGED` state transition and route (customer-only), audited, so a fixture is not blocked forever.

**G-36 [MEDIUM] Evidence sensitivity classes for exports (A22).** Files: `security-evidence-contract.md`; `security-coverage-contract.md`. Classify `API_SURFACE`, `PERMISSION_COMPARISON`, residual manifests, fixture ids as confidential; excluded from public/share links and bulk export unless the owner opts in; test `export.confidential-kinds-excluded`.

**G-37 [MEDIUM] Operator controls (A16, A17).** Files: `secrets-management-contract.md` Roles/Incident; plan.md SG10. Define the operator principal; dual control and alerting for `revokeAllForTenant`, `revokeAllForKek`, `rewrapAllForKekRotation`, KEK disable/delete; KMS key-deletion protection and scheduled-deletion delay; broker-host access logged and restricted. Test: SG3 drill extended.

**G-38 [LOW] Identity side-effect attestation (19).** Files: `test-identity-contract.md`. Registration records "login and notification emails/SMS from this identity go to customer-owned sinks only"; login checks require it.

**G-39 [LOW] Disclosure copy (A7, A24).** Add report line "observed responses are target-asserted" and an AI-processing disclosure plus opt-out in the SG9 copy list.

**G-40 [folded]** Redis job fields are in G-16.

**G-41 [MEDIUM] Decoded-size caps (A9).** Files: `active-security-execution-contract.md` step 8; FR-070. Cap decoded bytes and decompression ratio; truncate-and-flag rather than throw; JSON depth/key-count limits before parse. Test: `T-E14-decompression-bomb`.

**G-42 [LOW] safe-net provider coverage (6).** Add Azure `168.63.129.16` (and other provider virtual public addresses) to the `METADATA` class in `address-rules.ts` during T026; test in T027.

---

# Part 5. Not resolvable in planning (residual risks)

1. Truth of customer assertions: environment is non-production (G-12 reduces, cannot verify), staging uses no production backends, fixtures are synthetic, sandbox endpoints are fake, MFA is disabled for the test identity, identities are test-only.
2. Remote completion of in-flight requests at kill/cancel (008 FR-014); the target may have applied a mutation Fahes then cannot clean up (design chooses the safe direction).
3. Server-side sessions surviving after grant expiry or stop (logout is impossible after admission is refused).
4. Memory secrecy in a GC runtime: JS strings are not zeroizable; only short lease lifetimes, process kill and runtime posture (G-16) bound exposure.
5. Target cloaking and forged responses (A7): no integrity channel to the target; verdicts are statements about what was observed.
6. A compromised broker principal can unwrap anything it can reach (named limitation); G-4 and SG10 reduce but do not remove it.
7. Heuristic detectors (secret/PII/sensitive-class/reflection/engine-error signatures) have false negatives.
8. Legal exposure outside Fahes's control (hosting-provider policies, local law) beyond recording attestations (G-13).
9. Provisional numerics (budgets, timeouts, caps, 14-day freshness) are uncalibrated until `M` measurement (T523).
10. Upstream provenance: 009 U-1 text and 011 are uncommitted (AR-8/AR-9); a change invalidates unit timing and `onUnitExpired` assumptions.

---

# Part 6. Verdict

**READY-WITH-REPAIRS.** The architecture (no new execution class, per-class grants, broker, write-ahead intents, fenced evidence, verdict taxonomy) is sound and the closure pass can proceed once the following are done in the documents. None requires a redesign of an upstream spec; one (G-4) requires a design clarification of the worker/broker trust split, and one (G-3) is a product decision.

Must-fix before closure (HIGH): G-1, G-2, G-3, G-4, G-5, G-6, G-8, G-10, G-12, G-13, G-16. Should-fix before freeze (MEDIUM): G-7, G-9, G-11, G-14, G-15, G-17 through G-28, G-36, G-37, G-41. LOW items (G-29 through G-35, G-38, G-39, G-42) may be recorded as closure notes.

Pre-closure document fixes that are pure contradictions: FR-142 vs T420/T478; FR-081 safe-net claim vs `safe-fetch.ts:86`; FR-007 vs api-security-check inv. 3; FR-161 vs authorization-testing step 3; data-model "hard 50" vs FR-075; oracle vocabularies in authorization-testing vs data-model; broker "at every checkpoint" vs the per-request pipeline. Until the nine GAP items have mechanisms, SC-005 should not be marked satisfied.

---

# Part 7. Disposition (added 2026-10-11 by the lead after the review; the reviewer's ratings above are NOT edited)

The ratings above are the independent reviewer's and stand as written. This part records what the package did about each. **A rating is not upgraded by the author of the repair**: scenarios rated WEAK/GAP are re-rated only by an independent re-review at the closure pass. "Specified" below means the mechanism, owner, and test are now written down; it does not mean implemented or proven.

## The nine GAPs

| Scenario | Repair | Mechanism now specified | Test (tasks.md) |
|---|---|---|---|
| 7 Third-party resource access | G-2 | FR-172 owner-verified address binding; consent attestation for shared edges | T530, T531 |
| 35 / 49 Zero-probe PASS / partial full score | G-3 (modified) | **Review's "persist null" rejected** (`aggregate.ts` documents that nulling a computable score inflates the overall); instead FR-186 persisted `coverageComplete` + consumer audit; P13 cap remains an owner decision | T558, T559, T577, T420, T478 |
| A1 Broker confused deputy | G-4 | FR-173 security-definer writes, unit MAC, anomaly rule; honest statement if resolver and host are one principal | T536, T537 |
| A10 ReDoS in the parent | G-5 | FR-174 bounded/linear redaction, worker-thread limits, 200 ms watchdog | T538, T539 |
| A13 Per-request F07 key | G-1 | FR-072 per-request `idempotencyKey` | T562, T563 |
| A18 Restore replay | G-15 | FR-179 `platformEpoch`, post-restore quarantine | T544, T545 |
| A27 Legal/consent | G-13 | FR-177 `SecurityConsentRecord` | T534, T535 |
| A28 Production mislabeled as staging | G-12 | FR-176 cool-off + non-production attestation; stated plainly that the prohibition is "customer-attested non-production" | T532, T533 |

## Every repair G-1 … G-42

| G | Sev | Disposition | Where | Tasks |
|---|---|---|---|---|
| G-1 | HIGH | Specified | FR-072; active-security contract | T562, T563 |
| G-2 | HIGH | Specified | FR-172; scope contract; code `SEC_TARGET_ADDRESS_UNVERIFIED` | T530, T531 |
| G-3 | HIGH | Specified (modified, see above) | FR-142, FR-186; coverage contract; data-model M012-5c | T558, T559, T577 |
| G-4 | HIGH | Specified | FR-173; broker contract; plan Complexity | T536, T537 |
| G-5 | HIGH | Specified | FR-174; evidence contract; SG4 | T538, T539 |
| G-6 | HIGH | Specified | FR-175; active-security contract; plan class fill 6 | T540, T541 |
| G-7 | MED | Specified | FR-039; broker + active-security contracts | T548-class tests in T562/T546 |
| G-8 | HIGH | Specified | FR-128(e); evidence contract | T575 |
| G-9 | MED | Specified | FR-081 (false safe-net statement withdrawn) | T564, T565 |
| G-10 | HIGH | Specified | FR-007; scope + api-security-check contracts | T567, T568 |
| G-11 | MED | Specified | FR-008, FR-161; authz contract | T569 |
| G-12 | HIGH | Specified | FR-176; code `SEC_ENVIRONMENT_COOLOFF` | T532, T533 |
| G-13 | HIGH | Specified | FR-177; data-model 4.9B | T534, T535 |
| G-14 | MED | Specified | FR-178 | T542, T543 |
| G-15 | MED | Specified | FR-179 | T544, T545 |
| G-16 | HIGH | Specified | FR-180; SG4/SG7 | T546, T547 |
| G-17 | MED | Specified | FR-140; authz contract | T569 |
| G-18 | MED | Specified | FR-070, FR-187 | T560, T561 |
| G-19 | MED | Specified | FR-181, FR-144; code `SEC_CREDENTIAL_LEASE_BUSY` | T548, T549, T574 |
| G-20 | MED | Specified | FR-165 | T574 |
| G-21 | MED | Specified | FR-084 | T571, T572 |
| G-22 | MED | Specified | FR-041 | T575 |
| G-23 | MED | Specified | FR-095; data-model `IdentityUsage.UNSET` | T569 |
| G-24 | MED | Specified | FR-117 | T573 |
| G-25 | MED | Specified | FR-134 | T575 |
| G-26 | MED | Specified | FR-182 | T550, T551 |
| G-27 | MED | Specified | FR-092 | T569 |
| G-28 | MED | Specified | FR-183 | T552, T553 |
| G-29 | LOW | Specified | FR-071 | T562-class (`T-E14-local-budget-concurrent-reserve` inside T570 suite) |
| G-30 | LOW | Specified | FR-110 | T575 |
| G-31 | LOW | Specified | FR-058 | T575 |
| G-32 | LOW | Specified | FR-170 | T575 |
| G-33 | LOW | Specified | FR-141 | T575 |
| G-34 | LOW | Specified (a-g) | spec/data-model fixes; registry lints | T013, T575 |
| G-35 | LOW | Specified | FR-184 | T554, T555 |
| G-36 | MED | Specified | FR-185 | T556, T557 |
| G-37 | MED | Specified | FR-021 | T576 |
| G-38 | LOW | Specified | FR-088 | T569 |
| G-39 | LOW | Specified | plan SG9 copy list | T524 |
| G-40 | — | Folded into G-16 | — | — |
| G-41 | MED | Specified | FR-070 | T570 |
| G-42 | LOW | Specified | FR-079 | T566 |

## Not repaired — recorded residual (Part 5 stands)

Truth of customer attestations; remote completion of in-flight requests; memory secrecy in a GC runtime; forged target responses; compromised broker principal; heuristic detector false negatives; legal exposure outside Fahes's control; uncalibrated provisional numerics; upstream provenance (009 U-1 and 011 uncommitted).

## Verdict after repairs

Reviewer's verdict **READY-WITH-REPAIRS** stands as the independent verdict on the package *as reviewed*. The repairs above are specified; whether they close the 44 WEAK and 9 GAP ratings is for an **independent re-review at the closure pass** (T525), not for the author. One disagreement with the reviewer is recorded openly: G-3's "persist `null`" was rejected on repository evidence (`aggregate.ts` header), replaced by FR-186.
