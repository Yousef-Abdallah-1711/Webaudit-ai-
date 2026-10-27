# SPEC 012 Independent Adversarial RE-REVIEW (post-repair)

Citation form: `file:line`. Contracts are under `contracts/` unless a path is given. `spec.md` = `specs/012-.../spec.md`. Ratings: ADEQUATE = concrete mechanism, owned, testable, I could not defeat it inside the stated residual. WEAK = mechanism exists but I found a path around it, or its named test/owner does not exercise the attack. GAP = no mechanism, or the mechanism is defeated by the attacker's own choice of configuration or is self-contradictory.

---

# 1. Method and independence statement

I am an independent re-reviewer. I did not write SPEC 012, its repairs, `analyze-report.md`, `reconciliation-log.md`, or the original `adversarial-review.md`. I edit only this file. `adversarial-review.md` (including Part 7 "Disposition") was read as the author's CLAIMS, not evidence; its original ratings are unchanged. `analyze-report.md` and `reconciliation-log.md` were used only to locate stale text, not as evidence of effectiveness.

Read in full: amended `spec.md` (FR-001..FR-187), `plan.md`, `data-model.md`, all 19 `contracts/*.md` including every "Analyze and adversarial repairs" addendum, `upstream-amendment-requests.md`; `tasks.md` read for Phases 0-1, 13 and the T520-T578 block plus grep of every repair test name; `research.md` by grep only (R2/R4, resolver, over-privilege). Frozen upstream actually opened: `007 contracts/grant-lifecycle-contract.md` (`createAuthorization` preconditions 1-7), `008 contracts/safety-admission-contract.md` and `safety-checkpoint-contract.md`, `009 plan.md` (:59, :661 Plan Resolver location), `009 contracts/finding-materialization-contract.md` (:22), `009 contracts/scan-deadline-contract.md` (clock :257-260, `TERMINATION_UNCONFIRMED` :198). Not re-opened: 010, 011, constitution (cited only where a 012 claim rests on them; no finding of mine depends on them). Repository reality opened: `packages/safe-net/src/{safe-fetch,connect-guard,browser-proxy,browser-proxy-handlers}.ts`, `packages/redaction/src/detect.ts`, `packages/scoring/src/aggregate.ts`, `apps/worker/src/module-runner/persist.ts`, `apps/worker/src/config/monitoring.ts`, `apps/worker/src/readiness/verdict.ts`, `apps/api/src/services/readiness/certificate.ts`, `apps/worker/src/orchestrator/timeout.ts`, `apps/api/src/services/control-gate/verify.ts`, `apps/api/prisma/schema.prisma` (`Target`, `TargetVerification`). Nothing was executed; no network, scanner or payload.

Method: for each of the 53 originally WEAK/GAP scenarios I located the operative amended sentence, the owner, the named test and the tasks.md task text, then tried to defeat it (races, ordering, partial failure, upstream behaviour, implementation reality, main-text vs addendum contradiction).

---

# 2. Scoreboard

53 originally WEAK/GAP scenarios (25 W + 3 G in Part 1; 19 W + 6 G in Part 2), fresh ratings:

| | ADEQUATE | WEAK | GAP | Total |
|---|---|---|---|---|
| Part 1 (28) | 16 | 11 | 1 | 28 |
| Part 2 (25) | 17 | 8 | 0 | 25 |
| **All 53** | **33** | **19** | **1** | **53** |

- ADEQUATE (33): 4, 8, 10, 16, 21, 23, 31, 32, 33, 34, 37, 39, 41, 44, 46, 47; A4, A5, A6, A8, A9, A11, A13, A14, A16, A19, A20, A21, A22, A23, A24, A25, A26.
- WEAK (19): 5, 9, 13, 18, 19, 24, 25, 29, 35, 43, 49; A1, A2, A3, A7 (accepted limitation), A10, A18, A27, A28. (Part 1: 5, 9, 13, 18, 19, 24, 25, 29, 35, 43, 49 = 11.)
- GAP (1): 7.
- Movement vs original: 8 GAP -> WEAK/ADEQUATE (35, 49, A1, A10, A18, A27, A28 -> WEAK; A13 -> ADEQUATE); 7 stays GAP; 25 original WEAK -> 25 ADEQUATE; no scenario got worse in rating.

Regression check on the 25 originally ADEQUATE (1, 2, 3, 6, 11, 12, 14, 15, 17, 20, 22, 26, 27, 28, 30, 36, 38, 40, 42, 45, 48, 50; A12, A15, A17). Regressions caused by repairs:
- R-1 (A12): FR-161 allows "two grants" for the dual-class rule (spec.md:372) but `security-scope-contract.md:289` (G-34e) makes a gate/checkpoint grant-id mismatch `SEC_SCOPE_GATE_ERROR`. With two grants the primary and secondary checkpoints return different `grantId`s, so the two-grant option always fails closed. Availability regression, safety direction. See N-10.
- R-2 (2, 14, 13): the repair adds a broker status read before every request (`active-security-execution-contract.md:264`, FR-039 spec.md:202) but never states the failure mode of that read and the "push flag" is impossible under the broker boundary. See N-8 and the fail-open inventory.
- R-3 (50): the budget guarantee is now "conditional on G-1" being right; its only test uses an F07 stub (`tasks.md:467`), so 008 replay semantics are not exercised.
- R-4 (17, 48): FR-070/187 rolling 24 h attempt window (default 3) plus E15 baseline + dependent E14 + refresh + reverify logins all drawing on one counter will starve legitimate runs (safe direction, availability). See N-3.
- No regression found for 1, 3, 6, 11, 12, 15, 20, 22, 26, 27, 28, 30, 36, 38, 40, 42, 45, A15, A17 (28: the new fence-reads-stop rule yields `SENT_UNCONFIRMED` via the finalizer, consistent).

---

# 3. Per-scenario re-rating

Each block: original -> repair claimed; operative mechanism (quote, file:line); owner/test and whether the test exercises the attack; defeat attempt; FRESH RATING; minimal remaining fix.

### 4. Redirect outside scope. WEAK -> ADEQUATE
- Repair: G-9 / FR-081. Mechanism: "'same-origin' means identical scheme+host+port; every credential-class header ... is stripped by `SecurityHttpClient` on any non-identical origin ... an https->http hop is refused outright" (spec.md:256); T564/T565 (tasks.md:469-470) name API-key header, scheme downgrade, port change.
- Defeat attempt: unknown custom header names (covered by "any name matching the structural rule of FR-128"); same-origin hop keeps credentials (correct). Cross-origin hops are never followed at all (`active-security-execution-contract.md:59`), so stripping is belt-and-braces. T565 edits shared `safe-net/src/safe-fetch.ts` (regression surface, tested by T025 "existing safe-net suite unchanged").
- Residual: an in-scope sibling-origin hop (SSO IdP) is recorded `SEC_REDIRECT_OUT_OF_SCOPE` though in scope (availability/labelling only).
- Rating ADEQUATE. Fix (LOW): code `SEC_REDIRECT_OUT_OF_SCOPE` meaning should say "cross-origin, not followed".

### 5. DNS rebinding. WEAK -> WEAK
- Repair: G-2 / FR-172 (spec.md:386) + T530/T531.
- Mechanism covers private/loopback rebinding (safe-net layer 3, `connect-guard.ts:72-99`) and re-pointing between verification and dispatch. The proof is checked "at plan resolution and again at dispatch" only.
- Defeat: after the dispatch proof, a unit lives up to 600 s (E14) / 900 s (E15) and every request makes a fresh connection with its own DNS resolution (`createSafeDispatcher` per hop, `connect-guard.ts:99`); re-pointing the name to another public address mid-unit passes every layer. `active-security-execution-contract.md:65` "DNS pinning" is safe-net's resolve-then-classify, not pinning to the proven address. T530 tests re-pointing before dispatch only.
- Rating WEAK. Fix: at the dispatch proof, derive the verified peer address set and have the unit's connect guard refuse any other address for the whole unit (extend T531 to enforce the proof-derived set, not only a declared one).

### 7. Third-party resource access. GAP -> GAP
- Repair: G-2 / FR-172: "the existing Target ownership proof MUST be re-run within a bounded age (provisional 24 h) and satisfied by the address SecurityHttpClient will actually connect to (the file/DNS proof is checked over that connection), or the customer declares an expected address set that the connect guard enforces" (spec.md:386).
- Defeat (the attacker chooses the route): (a) existing verification has two methods (`TargetVerification.method`; `verify.ts:27,43,50-100`): DNS TXT is read through `node:dns/promises.resolveTxt`, not through any connection, so "DNS proof checked over that connection" is self-contradictory. A tenant who proves `attacker.example` by DNS TXT then points the A record at a victim's public IP passes the proof unchanged. (b) The alternative "customer declares an expected address set" is customer-asserted: the attacker declares the victim's IP as the expected set. (c) shared-edge/CNAME is a consent-record checkbox (`SecurityConsentRecord.sharedEdgeAttestation`, data-model.md:672). (d) wildcard scope requires per-hostname proof, which is fine for HTTP-file proof only. (e) no per-connection binding after dispatch (see 5).
- Owner/test: scope contract addendum 3 (`security-scope-contract.md:284`), T530/T531 (tasks.md:435-436). T530 asserts "name re-pointed to a different public address after verification" against a HTTP-file-style fixture; there is no DNS-method or declared-set attack fixture.
- Rating GAP: the mechanism is defeated by a legal configuration the attacker controls. Fix: (1) for `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` require HTTP-file verification (reject DNS-TXT-only Targets); (2) delete the customer-declared address-set alternative or make it additive only (can shrink, never replace the proof); (3) the proof request itself must be made through the same pinned address that is then enforced for every connection of the unit; (4) test fixtures for DNS-TXT-verified + declared-set and for mid-unit re-point.

### 8. Credential leaked in queue payload. WEAK -> ADEQUATE
- Repair: G-16 / FR-180 (spec.md:394): "BullMQ returnvalue, progress, job.log, failedReason and stack traces are sanitized"; payload exactly `{executionUnitId}` (spec.md:184). Tests `adverse.redis-job-keys-no-secret` (T546, tasks.md:451) scans Redis job keys, not only `job.data`; implementation T547.
- Defeat: exact-value matching only; a secret transformed outside the registered encodings or embedded in an error built by a lower layer survives. The sanitizer must run before BullMQ persists `failedReason` (wrapper around the processor); T547 names it.
- Rating ADEQUATE (residual: transformed secrets, Part 5 #4). Fix (LOW): errors that cross the queue boundary should be closed codes, not scrubbed strings.

### 9. Credential leaked in worker logs. WEAK -> WEAK
- Repair: FR-180 process-global exact-value registry consulted by logger and Sentry `beforeSend`, scrub of `exception.values[].value`, message, extra, contexts, breadcrumbs, "no `cause` chains" (spec.md:394). Today's scrubber deletes four header names (`monitoring.ts:9`) and `captureAlert` passes `extra` through (`monitoring.ts:74`), so the extension is real work (T547, tasks.md:452).
- Defeat: the engine child is a separate OS process. Nothing governs its stdout/stderr/uncaught-exception output (undici errors carry request options incl. `Authorization`); container logs capture it outside the parent's registry. "Never log cause chains" is a rule, not an enforced mechanism; T546 plants a value "in a known path".
- Rating WEAK. Fix: child spawned with stdio ignored except the IPC channel; child uncaught handler emits only a closed code; parent logs closed crash codes only; extend T546 with a child hard-crash fixture whose error object embeds a registered secret.

### 10. Credential leaked in AI prompt. WEAK -> ADEQUATE
- Repair: G-19: "The AI input assembler accepts only a closed schema of enums and numbers (never free strings from evidence), enforced by type and by test" (spec.md:343); T574 (tasks.md:479). Legacy raw `Set-Cookie` evidence is closed by T001 which is an SG4 precondition (plan.md:251).
- Defeat: the existing module AI layer reads legacy findings with free text during the parallel run (FR-160); that path is not the 012 assembler. After T001 the legacy cookie value is no longer persisted. T574 is test-only (no implementing task) - see N-13.
- Rating ADEQUATE conditional on T001 landing first (it is gated). Fix: add the implementing task for the closed-schema assembler.

### 13. Secret revoked during active workflow. WEAK -> WEAK
- Repair: G-7 / FR-039: "Before every request the engine also reads the broker lease status (or a revoke-push flag delivered over IPC and checked synchronously, with the periodic poll as backstop); ... at most the one in-flight request follows a revocation" (spec.md:202); `credential-broker-contract.md:239`; `active-security-execution-contract.md:264`.
- Defeat: (a) the "push flag" cannot exist: broker egress is "KMS and Postgres only" (`credential-broker-contract.md:105` invariant 7, :120) and workers have no vault privilege (data-model.md:211), so only a per-request broker RPC is possible. (b) The failure mode of that RPC (timeout/error mid-run) is unspecified; only issue-time unavailability is fail-closed (`credential-broker-contract.md:131`, FR-037). (c) No task: the test the addendum names, `broker.revoke-during-workflow` with "at most 1 request", has no task; T442 still expects "next checkpoint" (tasks.md:365); T062 is "<= 5 s" (tasks.md:94). Part 7's mapping "T548-class tests in T562/T546" points at unrelated tasks (T562 per-request key, T546 logging).
- Rating WEAK. Fix: state fail-closed on status-read error/timeout; drop "push"; add task `broker.revoke-during-workflow` asserting <= 1 request after the revoke commits and a fixture where the status call errors.

### 16. Role A session used for role B. WEAK -> ADEQUATE
- Repair: G-22 / FR-041: "`SessionHost.send` is the only way to attach credentials; it derives `identityRef`/role from the jar handle and calls `securityScopeGate` itself, and a caller-supplied identity/role that mismatches the handle is refused" (spec.md:207); `auth-session-contract.md:236`. Test `session.gate-identity-mismatch-refused` is named inside T575 (tasks.md:480).
- Defeat: bypass via a header slot in a request template (closed header set FR-066) or a direct `SecurityHttpClient.send` with a manually built `Cookie`: the structural header rule and the single-client lint (T473) cover; no credential-bearing header slot exists.
- Rating ADEQUATE. Fix (LOW): T575 is a bundle with no implementing task (N-13).

### 18. Account lockout from retries. WEAK -> WEAK
- Repair: G-18 / FR-070, FR-187 (spec.md:242, 401): rolling 24 h window per `TestIdentity` across scans and reverify, durable on the identity; `lockoutThreshold` caps; `credentialSuspectAt` blocks.
- Defeat: the counter has no write path. Broker operations are only issue/confirmDestroyed/revoke (`credential-broker-contract.md:44-47`); `grep authAttemptCount` finds only the data-model columns and an addendum sentence; T561 puts the columns in `apps/api/.../identity.ts` (tasks.md:466). Nobody increments `authAttemptCount` atomically before each login, so the cross-scan limit is unowned; within a unit only the child's in-memory `LocalBudget` counts. FR-181 serializes holders per identity so a race is unlikely, but a crashed unit loses the in-memory count. Separately, 3 attempts per 24 h covering successful logins starves legitimate E15 + E14 + refresh + reverify (N-3).
- Rating WEAK. Fix: add broker operation `reserveAuthAttempt(identityId)` (atomic increment-and-check, called by the parent before each LOGIN_ATTEMPT/refresh, durable before the send); count failed attempts separately from successful logins.

### 19. Login workflow sends unexpected emails. WEAK -> WEAK
- Repair: G-38 / FR-088: "Identity registration records an attestation that login and notification emails/SMS for the identity go to customer-owned sinks only; login checks require it" (spec.md:266); data-model `sideEffectSinksAttested` (data-model.md:428).
- Defeat: the mechanism is a checkbox (acceptable, customer-asserted). No test: T448/A19 asserts `sideEffects[]` only (tasks.md:371); T096/T091 do not mention the attestation.
- Rating WEAK (LOW). Fix: test `identity.login-requires-sink-attestation`.

### 21. Authorization test reads real customer data. WEAK -> ADEQUATE
- Repair: G-27 / FR-092 (spec.md:273): "response-derived identifiers are never used in v1, and a collection locator is refused unless the fixture declares `collection:true` with a maximum size"; excerpts default off (FR-128e). T569 (tasks.md:474).
- Defeat: stale contrary text remains in contracts whose addendum does not repeal it: `auth-workflow-execution-contract.md:127` (inv. 9 "or a fixture-validated response"), `mutation-cleanup-contract.md:102` (inv. 3), `test-identity-contract.md:91,107`, `authorization-testing-contract.md:64`. Spec FR-092 and the test-identity/authz addenda win, but an implementer of E15/mutation can read the old clause.
- Rating ADEQUATE (spec authority is explicit). Fix: delete the stale clauses (N-11).

### 23. Vertical test uses an unauthorized admin account. WEAK -> ADEQUATE
- Repair: G-23 / FR-095 (spec.md:276): "Identities default to `usage = UNSET`, which is not selectable as an actor; actor use requires explicit `ACTOR_ALLOWED`; ... an empty `includedAccountRefs` never authorizes a high-privilege or `UNSET` identity"; data-model `IdentityUsage` (data-model.md:168). Test `identity.unset-usage-not-actor` in T569.
- Defeat: `security-scope-contract.md:121` still says empty list = "any registered identity" and its addendum (:280-289) does not cross-reference; implement-from-scope-contract would miss the high-privilege exclusion. Ambiguity: FR-095 first sentence says admin is "never as an attacker" while the new text lets `ACTOR_ALLOWED` apply to a high-privilege identity.
- Rating ADEQUATE (default-deny is robust). Fix: scope-contract addendum cross-reference; state that a highest-tier identity can never be `ACTOR_ALLOWED`.

### 24. Business-logic probe changes real inventory. WEAK -> WEAK
- Repair: G-10 / FR-007 (spec.md:164): "An operation with no customer declaration (`readOnlyDeclared`) is treated as potentially mutating for every HTTP method: active probes ... are refused ... unless the customer declares it read-only or fixture-confined with consent". T567/T568 (tasks.md:472-473).
- Defeat: the enabling declarations have no home. `readOnlyDeclared`, `fixtureConfined`, `protectedMarkerRef` appear only in spec.md and contracts (grep: 8 hits, none in data-model); `api-security-check-contract.md:213` still lists the entity as an open item ("Until then non-GET active probing is refused"), so with the repair literally applied no active API probe can ever be enabled, and any ad hoc field added later is a customer-writable assertion with no DTO/consent design. The test's second half ("a declared read-only GET receives them") cannot be written without the entity.
- Rating WEAK. Fix: add an `ApiOperationDeclaration` (or `ApiDescriptionDocument` sidecar) entity with closed DTO, per-operation `readOnlyDeclared|fixtureConfined`, covered by FR-182 conformance.

### 25. Payment test causes a real charge. WEAK -> WEAK
- Repair: G-24 / FR-117 (spec.md:307): "Sensitive-class workflows require per-run typed re-confirmation, and any response carrying a live-mode indicator ... aborts the workflow with `SEC_MUTATION_NOT_PERMITTED`". T573 (tasks.md:478, test only).
- Defeat: the tripwire fires only after the first sensitive request returned, i.e. after the first real charge; a PSP/gateway whose response carries no recognized live marker (custom API, non-JSON, hashed id) never trips it. This is exactly the original attack (staging wired to live keys) with a detector that has recall limits. The typed re-confirmation has no owner (consent UI is U30) and no implementing task; scheduled/CI-triggered scans have nobody to type.
- Rating WEAK; residual is customer misconfiguration (Part 5 #1). Fix: owner/UX for re-confirmation (or refuse sensitive-class workflows on non-interactive runs) and an implementing task.

### 29. Rate-limit enforcement after sending. WEAK -> WEAK
- Repair: G-29 / FR-071 (spec.md:243): "every counter is taken by an atomic `reserve` ... returned by `release`; ... counters for credentialed units are read from a durable per-plan source".
- Defeat: the mechanism is sound, but tasks.md was not updated: T028 still tests `precheck` (tasks.md:59); `T-E14-local-budget-concurrent-reserve` has no task (grep: none); Part 7 maps G-29 to "T570 suite" and T570 is the decompression bomb test (tasks.md:475). The contract class signature still reads `precheck/commit` (`active-security-execution-contract.md:33,54`) with the addendum overriding.
- Rating WEAK (LOW). Fix: task `T-E14-local-budget-concurrent-reserve`; update T028/T029 to `reserve/release`.

### 31. Response contains credentials. WEAK -> ADEQUATE
- Repair: G-8 / FR-128(e) (spec.md:324): names "pass the pattern/entropy detectors and a name-class allow-list (value-bearing names become `<name:class>`), and a PII detector set (email, phone, card number with Luhn, IBAN, national-id formats) runs on excerpts; `excerptAllowed` defaults to false". `security-evidence-contract.md:232`; test `evidence.names.value-bearing` (T575).
- Defeat: a small JSON object keyed by non-pattern usernames (e.g. a map with 3 keys) is under the "small frequency threshold" and stored in `jsonShape` (depth 4). Residual classifier recall, named.
- Rating ADEQUATE. Fix (LOW): for authenticated responses store only keys present in the declared schema; no implementing task for the PII detectors (T031 covers registry/structural only) - N-13.

### 32. Security evidence stores sensitive PII. WEAK -> ADEQUATE
- Same repair (G-8). Excerpts default off except header/CSP-class checks; `{piiClass,count}` derived in the child (`security-evidence-contract.md:87`). Rating ADEQUATE; same residual and N-13.

### 33. AI hallucinates a vulnerability. WEAK -> ADEQUATE
- Repair: G-20 / FR-165 (spec.md:376): "for `ModuleType.SECURITY` any `layer:'AI'` finding is dropped regardless of `checkId`, and AI explanation text is validated against the committed verdict and replaced by a static template on any mismatch". Test T574. Module-level, not namespace-keyed, so the original bypass (any `ai.*` id) is closed. Rating ADEQUATE. Fix (LOW): name the drop site (`persist.ts:174` createMany path or the module runner) in the implementing task.

### 34. Weak signal marked confirmed. WEAK -> ADEQUATE
- Repair: G-17 / FR-140 (spec.md:339): marker "unique synthetic value of at least 16 characters, registered with the exact-value registry and absent from the actor's own resources; `CONFIRMED` requires the marker present for the actor and absent in the actor's negative-control read for the pair"; one oracle vocabulary `FixtureResource.markerSpec` (data-model.md:464). Test `T-AUTHZ-marker-field-name-not-enough` (T569).
- Defeat: oracle booleans are still child-computed (parent cannot re-verify; A3 child-compromise residual). A target echoing the marker for every request is caught by the negative control.
- Rating ADEQUATE. Fix (LOW): the authz decision table (`authorization-testing-contract.md:70-82`) does not show the negative-control column; addendum item 2 carries it.

### 37. OpenAPI spec contains malicious references. WEAK -> ADEQUATE
- Repair: G-21 / FR-084 (spec.md:259): "Parsing runs in an isolated `worker_threads`/child context with `resourceLimits`, no network and a hard terminate at 10 s; alias/anchor/merge-key expansion is pre-scanned at byte level before the library runs; object keys are handled prototype-pollution-safe". `api-discovery-contract.md:204`; T571/T572 (tasks.md:476-477).
- Defeat: the original defeat (a synchronous parser blocking the parent loop past a 10 s "wall clock") is closed because `worker.terminate()` interrupts synchronous JS and `resourceLimits` bounds memory; the byte-level pre-scan is linear. Residual: parser library still `UNKNOWN` (plan.md:12); T571 asserts loop lag bounded.
- Rating ADEQUATE. Fix (LOW): none beyond selecting the library under T522.

### 39. CORS test incorrectly reports a vulnerability. WEAK -> ADEQUATE
- Repair: G-30 / FR-110 (spec.md:297): `LIKELY` only if reflection and `Allow-Credentials: true` are observed "and the session credential is a cookie with `SameSite=None` (or declared); Bearer/header credentials and Lax/Strict cookies cap at `CONFIGURATION_RISK`". `probe-family-contract.md:250`; test `T-PROBE-12` extended inside T575 (tasks.md:480).
- Defeat: "(or declared)" is a customer declaration that can only raise to `LIKELY` (never `CONFIRMED`, `probe-family-contract.md:107`). Rating ADEQUATE. Fix (LOW): the older fixture T468/A39 (tasks.md:391) does not cover the Bearer/Lax case; T575 does.

### 41. Dependency advisory becomes stale. WEAK -> ADEQUATE
- Repair: G-32 / FR-170 (spec.md:381): "freshness is further bounded by the newest advisory `modified` timestamp inside the payload (a re-stamped old export does not become fresh), and a signature is mandatory"; data-model `AdvisorySnapshot.newestAdvisoryModifiedAt`, `manifestSignature` mandatory for ACTIVE (data-model.md:595-601); T575 `advisory.restamped-old-data-stale`, T488/R08.
- Defeat: the digest covers the advisory records, so `modified` cannot be altered after signing; a legitimately quiet upstream (no new advisory for >14 days) reads stale (safe direction). Signature scheme `UNKNOWN` (named). Main-text freshness definition in `advisory-matching-contract.md:46` (sourceRetrievedAt only) is overridden by its addendum (:257).
- Rating ADEQUATE.

### 35. Zero probes executed but scan reports PASS. GAP -> WEAK
- Repair: FR-142/FR-186 (spec.md:341, 400); `ModuleResult.coverageComplete Boolean?` (data-model.md:946); T558/T559/T577. The author rejected "persist null" on `aggregate.ts` evidence; I agree (`aggregate.ts:3-26` documents the inflation rule).
- Mechanism now: a `DEGRADED` SECURITY result "is scored from its findings plus a mandatory, persisted `coverageComplete:false` marker ... no consumer ... may present a `DEGRADED` SECURITY score as complete or as a security pass" (spec.md:341).
- Defeat: passive clean + all active `BLOCKED` still persists score 100 and `overallScore` still averages it (`aggregate.ts:103-125`; `AreaScore` has no marker field). Live consumers decide pass/fail on the number: `verdict.ts:61` `pass: score !== null && score >= threshold` then a go verdict and `certificate.ts` with a per-area pass row; `timeout.ts:42` delivered semantics. The only owner for the labelling is T577, an audit test whose assertion is "none renders 'secure'/'passed'" (tasks.md:482) - a string lint, while readiness returns a boolean `isReady`; the files to change (`aggregate.ts`, `verdict.ts`, `certificate.ts`, `export.ts`, `master-report.ts`) are not named as implementation work and T337 says "packages/scoring untouched" (tasks.md:275). P13 (cap) stays undecided (plan.md:275). Also two writers on `ModuleResult(SECURITY)` (N-6).
- Rating WEAK (a real mechanism and column now exist; the number and the decision consumers are still unguarded). Fix: (1) make `coverageComplete:false` an explicit no-go in `computeVerdict` and suppress certificate issuance (decision-level test, not string lint); (2) additive `partialModules` on `OverallScore`; (3) name the files; (4) resolve P13 at closure.

### 43. Two checks duplicate a Finding. WEAK -> WEAK
- Repair: G-33 / FR-141 (spec.md:340): canonical member lexicographically first; "on merge the highest confidence, then severity, wins by upsert".
- Defeat: 009 `materializeFinding` upserts "exactly as today's existing `persistModuleResult` pathway" (`finding-materialization-contract.md:22`), which is `createMany ... skipDuplicates: true` (`persist.ts:174-195`): first writer wins, no update-on-conflict, and confidence is not an `Issue` column. 012 cannot make severity "win by upsert" without a different write. Members evaluate at different times (claim-per-check), so without a group barrier title/severity still depend on evaluation order. "Legacy duplicate suppression via `rootCauseGroup` mapping" (`security-finding-contract.md:248`) has no owning task.
- Rating WEAK. Fix: materialize a group's Finding once, from the sweep/finalizer, after all members resolved, choosing the winner before calling `materializeFinding`; or drop the "upsert" claim and accept first-writer-wins with a stated bias.

### 44. Security scanner bypasses safe-net. WEAK -> ADEQUATE
- Repair: G-6 / FR-175 (spec.md:389): child "runs with OS/container egress restricted to a safe-net-backed egress proxy that enforces the authorized host set (the 010 `browser-proxy` pattern) and no other egress"; tests `engine.child.no-direct-egress`, `engine.child.orphan-exits`, `engine.ipc.forged-message-rejected` (T540, tasks.md:445).
- Defeat: existing `browser-proxy*.ts` classifies address class only (`browser-proxy-handlers.ts:83-99`), no host allow-list: new work (T541). OS egress restriction depends on hosting that is `UNKNOWN` (P11) and is verified only at SG7. A CONNECT proxy sees host:port, not paths.
- Rating ADEQUATE for the scenario as written (no second client/socket path). The cooperative-child gap is N-2. Fix: N-2.

### 46. Session cleanup races with finalization. WEAK -> ADEQUATE
- Repair: FR-175: child "exits on IPC disconnect within 2 s and on a missed parent heartbeat; ... never accepts proof fields (`jarDisposed`, `childExited`) from the child - it observes process exit itself". `auth-session-contract.md:239`; T540.
- Defeat: parent dies: nobody confirms, `onUnitExpired` stays `PENDING` until `TERMINATION_UNCONFIRMED` (`scan-deadline-contract.md:198`) releases the F07 lease; the orphan child loses IPC (exits), and if egress is the parent-hosted proxy it also loses network. That last property is implicit, not stated.
- Rating ADEQUATE. Fix (LOW): state that the egress proxy lives in the parent process so parent death removes egress.

### 47. Evidence write after cancellation. WEAK -> ADEQUATE
- Repair: G-31 / FR-058 (spec.md:227): "The fence predicate also requires no pending `KillSwitchState` for the unit, its scan or its grant (parent-derived residual manifests are exempt, FR-162)". `security-evidence-contract.md:235`; T575 `evidence.fence.stop-pending`.
- Defeat: sub-millisecond TOCTOU inside the single transaction is inherent; the child-side rule "late response after abort neither trusted nor persisted" backs it. Rating ADEQUATE.

### 49. Partial scan receives full security score. GAP -> WEAK
- Same repair and defeat as 35. T478 now asserts `DEGRADED` + `coverageComplete:false` + "report/overall output lists SECURITY among partial areas" (tasks.md:401), but no task changes `overallScore`'s output to list partial areas, so T478 can only pass if T577-adjacent work adds that field. Contradiction with FR-142 is gone. Rating WEAK; fix as 35.

### A1. Broker as confused deputy. GAP -> WEAK
- Repair: G-4 / FR-173 (spec.md:387): worker role may not write `ExecutionUnit.{userId,targetId,credentialBindingRef,executionUnitClass}`, `TargetAuthorization` or `AdmissionLease` "except through narrow security-definer functions"; unit MAC under a key "the broker verifies and the engine host does not hold"; anomaly rule; honest sentence "If the plan resolver and engine host are ever the same principal, the broker protects only data at rest".
- Defeat: (a) 012's own plan places the resolver in the worker: `security-scope-contract.md:10` ("`apps/worker/src/security/` for the plan-time resolver"), T117/T119 (tasks.md:136,138) and T537 `apps/worker/src/security/plan/unit-mac.ts` (tasks.md:442). If implemented as tasked, the worker holds the MAC key and FR-173 is the ineffective case it names. But `009 plan.md:59,661` puts the Plan Resolver in `apps/api/src/services/planning/`; the repair is effective only if 012 aligns to that and says so. (b) `008 safety-admission-contract.md` boundary rule 1 makes `requestAdmission` the only writer of `AdmissionLease` and it runs in the worker; security-definer functions for 008 tables are an implementation constraint on 007/008/009 that is nowhere recorded: `upstream-amendment-requests.md` still states "NO amendment REQUIRED" and FR-159 requires every gap to be recorded. (c) The MAC covers `(unitId, attempt, userId, targetId, credentialBindingRef, grantId, planId)` but not `identityRefs`/class: a worker able to edit `configuration.identityRefs` can request another identity under an empty `includedAccountRefs`. (d) With holder-token check (`credential-broker-contract.md:53`) a compromised worker can only obtain leases for units it legitimately hosts, which genuinely narrows the attack.
- Rating WEAK. Fix: state resolver principal = API; move T117/T119/T537; MAC the identity list and class; record an AR for the DB-role constraints on 007/008/009 tables.

### A2. Unit-state TOCTOU between broker check and delivery. WEAK -> WEAK
- Same repair path as 13 (pre-request status read). Same defeat (no task, unspecified failure mode). Step 12 still unwraps before any re-check; the first request's pre-request read closes the window only if fail-closed. Rating WEAK; fix as 13.

### A3. IPC channel / hostile-response parsing in credential-bearing child. WEAK -> WEAK
- Repair: FR-175 (closed-schema IPC validation, no child proof fields, exit on disconnect, egress proxy). Forged IPC messages and orphan child are addressed (T540).
- Defeat: the child needs no IPC message to send. A child compromised by a parser bug sends directly through the egress proxy, which enforces only the host set: F07 admission, `securityScopeGate`, the local budget and the write-ahead mutation intent are all cooperative child behaviour. Nothing binds a socket write to a parent-issued `PROCEED`. See N-2. `no-new-privileges`/seccomp are "where the platform allows".
- Rating WEAK. Fix: N-2 (single-use parent-minted request permit checked by the proxy).

### A4. Crash dumps, core files, heap snapshots, swap. WEAK -> ADEQUATE
- Repair: FR-180 (spec.md:394): "core dumps disabled, no heap-snapshot/diagnostic-report on fatal, and swap disabled or encrypted - enforced by an SG7 check, not 'where the platform allows'"; `sg7.runtime-posture` (T546). JS string non-zeroizability remains named (Part 5 #4). Rating ADEQUATE. Fix (LOW): SG7 is a gate-time check, add a periodic posture assertion.

### A5. Sentry/APM breadcrumbs and error messages echoing secrets. WEAK -> ADEQUATE
- Repair: FR-180 enumerates `exception.values[].value`, `message`, `extra`, `contexts`, breadcrumb messages; process-global registry solves the per-unit scope question; `tracesSampleRate: 0` (`monitoring.ts:50`). Tests `adverse.sentry-error-message-no-secret` (T546), impl T547 edits both `monitoring.ts` files. Rating ADEQUATE (exact-value residual).

### A6. Customer-controlled strings poison evidence/logs/UI/AI. WEAK -> ADEQUATE
- Repair: G-25 / FR-134 (spec.md:330): "Every stored target-controlled string ... passes a charset allow-list, a 128-character maximum and control-character stripping; UI and CSV exports escape"; AI inputs are enums/numbers only (FR-144). Test `evidence.names.injection` (T575). Rating ADEQUATE.

### A7. Evidence tampering and cloaking by the target. WEAK (limitation) -> WEAK (accepted limitation)
- Repair: G-39 (SG9 copy line "observed responses are target-asserted", plan.md:256; T524). Unresolvable in planning (Part 5 #5). The requirement is copy, not a lint; `coverage.copy-lint` checks forbidden strings only (`security-coverage-contract.md:115`). Fix (LOW): add a required-line copy check. Not a blocker.

### A8. Oracle spoofing leading to false CONFIRMED. WEAK -> ADEQUATE
- Same repair as 34 (unique >= 16-char marker, negative control). Rating ADEQUATE.

### A9. Decompression bombs / oversized structured bodies. WEAK -> ADEQUATE
- Repair: G-41 / FR-070 (spec.md:242): "Decoded response size is capped (decoded bytes and decompression ratio; truncate-and-flag, never throw) and JSON depth/key-count limits apply before parsing"; T570 (test only). Defeat: today's `readBounded` throws at the cap (`safe-fetch.ts:258-267`) and undici `request` does not decode; T025/T026 do not list decoded caps, so implementation placement is unowned (N-13). Rating ADEQUATE (specified and tested; owner gap is editorial).

### A10. ReDoS and event-loop blocking in the parent. GAP -> WEAK
- Repair: G-5 / FR-174 (spec.md:388): input cap, "linear-time scanners (or execution in a worker thread with `resourceLimits` and terminate-on-overrun), and a watchdog - any synchronous parent section over 200 ms trips `SEC_ANALYSIS_BUDGET_EXHAUSTED`". T538/T539 (tasks.md:443-444).
- Defeat: a same-thread watchdog cannot preempt a running regex; it only reports after the fact. The spec offers worker-thread isolation as an alternative ("or"), not a requirement; with "linear scanners + watchdog" a missed super-linear pattern still stalls the loop (the lazy `[\s\S]*?` at `detect.ts:132` and `SECRET_NAME` at `detect.ts:120` are the known ones). FR-174 covers "hostile text parsing and redaction" generally but T538's fixture is redaction only; the CSP/Set-Cookie/reflection classifiers and the JSON shaper are not in a test. BullMQ lock/F07 renewal still depend on the parent loop.
- Rating WEAK. Fix: require all hostile-text parsing (redaction and every classifier) to run in a terminable worker thread or child, or prove linear complexity per pattern; extend T538 to each classifier.

### A11. Fixture abuse to touch non-fixture or real data. WEAK -> ADEQUATE
- Repairs: G-27 (no response-derived ids, collection guard), nonProductionAttested in the consent record (FR-176b, data-model.md:669), synthetic-value regex (V-6). Residual = customer assertion (Part 5 #1). Rating ADEQUATE within residual.

### A13. F07 idempotency-key derivation for per-request admission. GAP -> ADEQUATE
- Repair: G-1 / FR-072 (spec.md:244): "Every checkpoint call carries its own deterministic `idempotencyKey = H(unitIdempotencyKey, callSite, requestOrdinal | probeClaimKey, redirectHopIndex)` ... the secondary dual-class check uses `H(primaryKey, "SECONDARY")`, and a redelivered request with the same ordinal replays the same F07 result without a second consumption (008 replay semantics)". `active-security-execution-contract.md:262`; T562/T563 (tasks.md:467-468).
- Checked against 008: replay is keyed by `(targetAuthorizationId, idempotencyKey)` and enforced by unique constraints on consumption rows (`safety-admission-contract.md` boundary rule 3), so distinct per-request keys produce one consumption per sent request, and `consumes{false,false}` calls create no row (no replay needed). Defeat attempts: reuse of an ordinal replays GRANTED without consuming: the spec does not say who assigns the ordinal (must be parent-assigned, monotonic, never child-supplied; N-12); a replayed GRANTED after a kill is not proof of current authorization (008 rule 3 vs step 1 ambiguity; N-12); T562 runs against an "F07 stub" so 008's actual replay behaviour is not exercised.
- Rating ADEQUATE. Fix (LOW): parent-assigned ordinals; post-replay stop-pending sub-check; run T562 against the real 008 implementation once it exists.

### A14. Class-boundary ambiguity between E15 and E14 for cross-identity requests. WEAK -> ADEQUATE
- Repair: G-11 / FR-008, FR-161 (spec.md:165, 372): "a cross-identity replay is always a `NEGATIVE_PROBE` and therefore E14 dual-class (one definition of 'crafted' for credentialed requests)". Addenda in scope (:286), authz (:217), E15 (:243) agree. Stale: `auth-workflow-execution-contract.md:57` still lists the replay as E15 single-class and `authorization-testing-contract.md:59`; addenda win. The named test `T-AUTHZ-cross-identity-replay-dual` has no task, but `T-AUTHZ-18` and T481 (tasks.md:404) exercise dual-class on the cross-identity probe. Rating ADEQUATE. Fix: delete stale lines.

### A16. Operator privilege abuse. WEAK -> ADEQUATE
- Repair: G-37 / FR-021 (spec.md:181): `revokeAllForTenant`, `revokeAllForKek`, `rewrapAllForKekRotation` and KEK disable/delete "require dual control (two distinct operator principals) and raise alerts; KMS key deletion carries deletion protection and a scheduled-deletion delay; broker-host access is logged and restricted". T576 drill. Residual: broker-host operator with memory access (Part 5 #6). Side effect: dual control delays incident revoke-all (N-17). Rating ADEQUATE.

### A18. Replay of lease triples / ledger loss after DB restore. GAP -> WEAK
- Repair: G-15 / FR-179 (spec.md:393): monotonic `platformEpoch` held outside the database, stamped on units/leases; "after any restore the epoch is bumped, all non-terminal units fail, all leases are revoked, and auth-attempt and mutation counters are reconstructed conservatively".
- Defeat: the bump is a runbook step; nothing detects a restore. A provider-driven PITR, replica failover with async lag, or a restore performed without the runbook leaves DB rows older than the external counter with no trigger. T544 "after a simulated restore the epoch bumps" tests the response, not detection. The epoch counter's own unavailability behaviour is unspecified.
- Rating WEAK. Fix: broker records a monotonic ledger high-water mark (max lease sequence/time) in the external store on every issue and refuses to issue when the DB ledger is behind it (automatic quarantine); specify fail-closed on epoch-store errors.

### A19. Time-source skew. WEAK -> ADEQUATE
- Repair: G-14 / FR-178 (spec.md:392): every `now` passed to `isAuthorized`, `requestAdmission`/`safetyCheckpoint` and broker expiry is the DB clock (`SELECT now()`), alert at 2 s skew. Consistent with 009's clock rule (`scan-deadline-contract.md:259-260`). T542. Defeat: fetching `now` and calling F07 are two steps (ms). Rating ADEQUATE. Fix (LOW): specify behaviour when the clock query fails (N fail-open inventory).

### A20. IDOR on 012 control-plane routes. WEAK -> ADEQUATE
- Repair: G-26 / FR-182 (spec.md:396): closed DTO allow-lists, "Postgres row-level security keyed by `userId` protects the vault and 012 tenant tables", conformance test enumerating every route with a cross-tenant id. T550/T551. RLS works on scalar `userId` columns, so the zero-relation rule is not an obstacle; feasibility note: Prisma needs per-request `SET LOCAL`, and worker/broker roles need bypass or role-specific policies (so RLS does not defend against a compromised worker; A1 covers that). Rating ADEQUATE.

### A21. Mass-assignment on TestIdentity/credential/fixture APIs. WEAK -> ADEQUATE
- Repair: FR-182 + consent moved out of the fixture (`SecurityConsentRecord`, data-model.md:658-682). Stale: T091 still lists `FixtureResource.mutationConsents` (tasks.md:117) and T097 "consent flags" (:123), contradicting data-model.md:469; harmless if T091 is corrected. T550 includes the mass-assignment probe. Rating ADEQUATE.

### A22. Export/report/share-link leakage. WEAK -> ADEQUATE
- Repair: G-36 / FR-185 (spec.md:399): confidential kinds excluded from share links and bulk export unless the owner opts in; T556/T557. Rating ADEQUATE. Fix (LOW): define opt-in granularity.

### A23. Reverify billing and attempt abuse. WEAK -> ADEQUATE
- Repair: G-35 / FR-184 (spec.md:398): per-issue cooldown and daily cap sharing the identity's login window; T554/T555. Values are not stated (implementer picks); safe direction. Rating ADEQUATE. Fix (LOW): state provisional numbers.

### A24. AI explanation of redacted evidence; customer metadata to third-party model. WEAK -> ADEQUATE
- Repair: FR-144 closed enum/number schema (spec.md:343) means role keys, path templates and fixture classes (strings) cannot be AI inputs at all; plus SG9 AI-processing disclosure/opt-out (plan.md:256) and `dataHandlingAck` (data-model.md:670). No technical opt-out flag exists; policy residual. Rating ADEQUATE.

### A25. BullMQ stalled-job recovery and double-hosting. WEAK -> ADEQUATE
- Repair: G-28 / FR-183 (spec.md:397): "`DISPATCHED -> RUNNING` is a compare-and-swap recording `hostInstanceId`; dispatching a `RUNNING` unit with a live lease held by another host is refused; the stale-claim re-send path for non-mutating probes is disabled for credentialed units." T552/T553.
- Defeat: ordering. `active-security-execution-contract.md:42-44` runs the dispatch checkpoint (step 3) and the broker lease (step 4) before the CAS (step 5), and step 4 says a broker denial finalizes the unit `COMPLETED`/`BLOCKED`. A stale second host that replays the dispatch checkpoint (same key, same holderToken per 008 replay) then hits `SEC_CREDENTIAL_LEASE_ALREADY_ISSUED` and can finalize a live unit, passing the finalize guard (live lease) with the replayed token. Fixable by placing the CAS first and CAS-ing finalize on `hostInstanceId`.
- Rating ADEQUATE as stated in FR-183 (it says dispatch of a RUNNING unit is refused). Fix: N-9.

### A26. Multi-worker concurrency on the same identity. WEAK -> ADEQUATE
- Repair: G-19 / FR-181 (spec.md:395): partial unique index on `testIdentityId WHERE status='ISSUED'`, `SEC_CREDENTIAL_LEASE_BUSY`, ordering edges serialize E15 then E14. Test T548. Defeat: an `ISSUED` row past `expiresAt` blocks the identity until a sweeper marks it `EXPIRED` (N-16, availability); customer's own CI on the same account is out of Fahes's control. Rating ADEQUATE.

### A27. Legal and consent gaps. GAP -> WEAK
- Repair: G-13 / FR-177 (spec.md:391): `SecurityConsentRecord` "MUST exist and be current to create an `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW` grant for a 012 target and to enable any mutation class; none => `SEC_CONSENT_MISSING`". Entity: data-model.md:658-682 (versioned, immutable, `disclosureVersion`, attestations, `sourceAddressHash`).
- Can 012 enforce "no grant without consent"? No. `createAuthorization` (`007 grant-lifecycle-contract.md`) has fixed preconditions 1-7 with no hook and 012 adds no amendment request (`upstream-amendment-requests.md:14` "NO amendment REQUIRED"). T534 (tasks.md:439) asserts "SEC_CONSENT_MISSING for grant creation", which 012 cannot implement because the UI calls 007 directly. The enforcement points that DO exist outside 007: plan resolution (`security-scope-contract.md:285` item 4b: "a current `SecurityConsentRecord` with `nonProductionAttested` is required per active/authenticated plan"), broker issue (`credential-broker-contract.md:240` item 5), the gate for `FIXTURE_MUTATE` (`security-scope-contract.md:120`). Not checked: dispatch or per-request for uncredentialed `C1` probes; the plan.md registry text for `SEC_CONSENT_MISSING` (plan.md:147) is still "mutation/side-effect class consent not enabled". An unconsented grant can exist and be used by anything that is not a 012 engine.
- Rating WEAK. Fix: restate FR-177 as "no 012 plan, lease or dispatch without a current record" with the dispatch step and per-plan gate named; record the AR; update the code's registry meaning; the click-through consent stays customer-asserted (Part 5 #8).

### A28. Customer misclassifies production as STAGING. GAP -> WEAK
- Repair: G-12 / FR-176 (spec.md:390): "production prohibition equals customer-attested non-production, and 012 states so plainly" plus (a) 24 h cool-off after reclassification from PRODUCTION (`SEC_ENVIRONMENT_COOLOFF`), (b) per-plan non-production attestation, (c) re-attestation if the host was ever PRODUCTION or the tenant has an unrelated production Target on the same registrable domain.
- Defeat: a customer that classifies STAGING from the start, and registers no production Target, trips none of (a)-(c); (c) needs a public-suffix computation that is unspecified; (a) is derived from `AuditLogEntry environment.reclassified` and the first classification is `environment.classified`. The repairs add friction and an honest statement; they cannot verify the premise (Part 5 #1). No independent technical signal (shared certificate/IP/headers with a known production host) is specified.
- Rating WEAK (accepted residual). Fix (optional): passive cross-check of the Target's certificate/IP against the tenant's other Targets; otherwise accept.

---

# 4. New issues introduced or exposed by the repairs

- **N-1 (HIGH) Resolver principal and DB-role feasibility are inconsistent with 009 and unrecorded.** `009 plan.md:59,661` places the Plan Resolver in `apps/api`; 012 tasks put plan resolution and `unit-mac.ts` in `apps/worker` (tasks.md:136,138,442; scope contract :10). FR-173 constrains how 007/008/009 tables are written (worker role barred from `TargetAuthorization`, `AdmissionLease`, unit identity columns, while 008 boundary rule 1 makes the worker-hosted `requestAdmission` the only `AdmissionLease` writer). No AR exists (`upstream-amendment-requests.md:14,129` still claim none; FR-159 requires one). MAC omits `identityRefs`/class. Fix: declare API as resolver and MAC-key holder; move the tasks; MAC identity list; add AR.
- **N-2 (HIGH) Parent-side admission is not bound to the socket.** The egress proxy enforces the host set only (existing proxy: address class only, `browser-proxy-handlers.ts:83-99`). A child compromised via hostile-response parsing can send without gate, F07, local budget or mutation intent (A3, 44). Fix: parent mints a single-use per-request permit at `PROCEED` (bound to unit, host:port, ordinal) that the proxy requires per connection; a mutation permit is minted only after the durable `SENT` ack.
- **N-3 (MED) Attempt counter has no writer and would starve runs.** See 18. Fix: broker `reserveAuthAttempt`; count failures separately from successes.
- **N-4 (MED) FR-177 is stated against a function 012 cannot change.** See A27.
- **N-5 (MED) Operation declarations have no entity.** See 24 (`readOnlyDeclared`, `fixtureConfined`, `protectedMarkerRef`).
- **N-6 (MED) Two writers on `ModuleResult(SECURITY)` in the parallel run.** `persist.ts:165-172` upserts the same `(scanId,module)` row with `update: row` (legacy runner) while the 012 finalizer also upserts it (`security-coverage-contract.md:68`); `row` omits `coverageComplete` so a late legacy write leaves a stale marker beside a legacy state/score; whether legacy findings enter the 012 score is undefined (`security-coverage-contract.md:124,197`). Fix: one writer and a defined merge (score over legacy + 012 findings; marker = AND).
- **N-7 (MED) "Upsert highest confidence wins" is not implementable.** See 43.
- **N-8 (MED) G-7 and G-29 have no tasks; Part 7 task mappings are wrong.** "T548-class tests in T562/T546" and "T570 suite" (Part 7 lines 682, 704 of the original review) reference unrelated tasks. Also no task for `T-AUTHZ-cross-identity-replay-dual`, side-effect attestation, PII detector set, names allow-list implementation.
- **N-9 (MED) Dispatch ordering lets a stale host finalize a live unit.** See A25. Fix: CAS first; finalize CAS on `hostInstanceId`.
- **N-10 (LOW-MED) Two-grant dual-class vs same-grant-id rule.** See R-1.
- **N-11 (LOW) Stale contradictory text left in place:** response-derived ids (`auth-workflow-execution-contract.md:127`, `mutation-cleanup-contract.md:102`, `test-identity-contract.md:91,107`, `authorization-testing-contract.md:64`); E15 replay = single-class (`auth-workflow-execution-contract.md:57`); empty `includedAccountRefs` = any identity (`security-scope-contract.md:121`); coverage marker carried by `summary`/`degradedReason` (`security-coverage-contract.md:80`); `precheck/commit` (`active-security-execution-contract.md:33,54`, T028 tasks.md:59); broker "at every checkpoint" (`credential-broker-contract.md:80-83`); `FR-001..FR-171`, "75-code", "nine tables" (`data-model.md:9-10,17`; `secrets-management-contract.md:229`; `advisory-matching-contract.md:3`; `quickstart.md:10`; `tasks.md:9`); T091 `FixtureResource.mutationConsents` (tasks.md:117); `SEC_CONSENT_MISSING` registry meaning (plan.md:147).
- **N-12 (LOW) Ordinal ownership and replay.** Per-request ordinal must be parent-assigned; a replayed GRANTED (`safety-admission-contract.md` rule 3) is not current authorization after a stop.
- **N-13 (LOW) Orphan test-only repair tasks.** T567-T576 are tests with "DoD: the named tests green" and, for G-8, G-19/20, G-22, G-24, G-30-G-33, G-41, no implementing task; T575 bundles seven tests in one file.
- **N-14 (LOW-MED) Restore detection absent.** See A18.
- **N-15 (LOW) Child stdio/uncaught-exception path ungoverned.** See 9.
- **N-16 (LOW) Expired-`ISSUED` lease blocks the identity.** `lease_one_issued_per_identity` (data-model.md:360) holds until a sweeper flips status; the issue transaction should treat `expiresAt < dbNow` as dead.
- **N-17 (LOW) Dual control slows incident response.** Define an emergency single-operator `disable`/revoke path for one tenant while keeping dual control for KEK operations.
- **N-18 (LOW) FR-172 proof runs through `level1RateBound`** (`verify.ts:310-345`): a rate-limit refusal is indistinguishable from "not published"; must map to `SEC_TARGET_ADDRESS_UNVERIFIED` (closed), which is acceptable, but the 24 h re-proof load per hostname should be sized.

---

# 5. Fail-open inventory

Every place a missing/failed dependency could let a request or credential use proceed. "Closed" = refuses; "OPEN-RISK" = proceeds or unspecified.

| Dependency / condition | Behaviour | Status | Citation |
|---|---|---|---|
| Broker unreachable at issue | `SEC_BROKER_UNAVAILABLE`, no fallback | Closed | spec.md:200; broker contract :131 |
| Broker status read fails mid-run (pre-request liveness and host loop) | not specified; "periodic poll as backstop" only | OPEN-RISK (state fail-closed) | spec.md:202; broker :80-83 |
| Revoke "push" to worker | impossible (broker egress KMS+Postgres only) | design flaw, not a fail-open per se | broker :105, :120 |
| KMS down at issue / create | deny / API error, nothing persisted | Closed | secrets contract :149-151 |
| KMS-held epoch store down (FR-179) | not specified | OPEN-RISK (state fail-closed) | spec.md:393 |
| MAC key unavailable / MAC check error (FR-173) | MAC failure denies; key-unavailable not specified | partly closed | spec.md:387 |
| DB clock query fails before `isAuthorized`/`requestAdmission` | not specified (008 fails closed only on its own errors) | OPEN-RISK (state fail-closed) | spec.md:392; 008 admission step 5 |
| F07 `requestAdmission` error | `REFUSED/INTERNAL_ERROR` | Closed | 008 admission rule 4 |
| F07 replay of a prior `GRANTED` after a stop (retried checkpoint with same ordinal) | replays GRANTED | OPEN-RISK (N-12) | 008 admission rule 3 vs step 1 |
| Consent record missing | `SEC_CONSENT_MISSING` at plan, broker, mutation gate | Closed at 012 use-points | scope addendum :285; broker :240 |
| Grant created without consent record | cannot be prevented (007 unmodifiable) | OPEN by design (unused by 012) | A27 |
| Consent record read error at plan/broker | not specified | OPEN-RISK (state fail-closed) | scope addendum |
| Consent superseded/disclosure changed mid-unit (uncredentialed C1) | not re-checked per request/dispatch | OPEN-RISK (LOW) | scope addendum :285 |
| Address proof (FR-172) fails or errors | `SEC_TARGET_ADDRESS_UNVERIFIED` | Closed | spec.md:386 |
| Address proof satisfied by DNS-TXT method / customer-declared address set | passes by design | OPEN (GAP 7) | spec.md:386; verify.ts:27 |
| Re-point after dispatch proof | not rechecked | OPEN-RISK (5, 7) | contract :65 |
| Cool-off / reclassification audit read fails | not specified | OPEN-RISK (state fail-closed) | spec.md:390 |
| safe-net refusal / layer failure | `SEC_SAFE_NET_REFUSED` | Closed | spec.md:229 |
| Redaction error/watchdog trip | `{"_redactionFailed":true}`, raw never written | Closed | spec.md:325, 388 |
| Exact-value registration failure before first request | engine behaviour not stated (secrets contract says write refused for API only) | OPEN-RISK (state: no send) | spec.md:324(a) |
| Fence rejects write | dropped, no claim | Closed | spec.md:227 |
| Kill-switch read error | F07 `INTERNAL_ERROR` | Closed | 008 admission rule 4 |
| Egress proxy down | child has no egress (if OS-enforced) | Closed (infra-dependent) | spec.md:389 |
| Compromised child sends without parent PROCEED | proxy checks host set only | OPEN-RISK (N-2) | spec.md:389 |
| IPC loss / missed heartbeat | child exits within 2 s | Closed (child-cooperative) | spec.md:389 |
| Parent dies, child orphaned | exit + (implicit) no proxy | Closed if proxy in parent | A46 |
| `TERMINATION_UNCONFIRMED` | F07 lease released after margin | OPEN-RISK (accepted, 009) | scan-deadline :198 |
| Registry load failure | `SEC_ENGINE_DISABLED` | Closed | registry contract :82 |
| Feature flag / SG gate off | `SEC_ENGINE_DISABLED` | Closed | spec.md:366 |
| Gate internal error / grant-id mismatch | `SEC_SCOPE_GATE_ERROR` | Closed | scope contract :129, :289 |
| Per-identity lease already `ISSUED` | `SEC_CREDENTIAL_LEASE_BUSY` | Closed | spec.md:395 |
| Unmapped reason code in coverage | counted `INCOMPLETE_SCAN` | Closed (conservative) | coverage contract :88 |
| `coverageComplete` null on pre-migration `ModuleResult` | consumer behaviour not specified | OPEN-RISK (LOW) | data-model.md:946 |
| Consumer not updated for `coverageComplete` | readiness `pass` computed from score alone | OPEN-RISK (35/49) | verdict.ts:61 |

---

# 6. Residual risks unresolved in planning

1. Customer assertions remain the premise of every safety claim: non-production (A28), no production data stores, fixture safety, sandbox endpoints (25), identity is test-only, sink attestation (19), consent click-through (A27).
2. Compromised child: until N-2, a parser-bug compromise bypasses gate/F07/budgets/intents; with it, the child still holds the lease secret (JS strings are not zeroizable).
3. Compromised broker principal / broker-host operator (named limitation, secrets contract :197).
4. Remote completion of in-flight requests at kill/cancel; no cleanup after stop (by design).
5. Heuristic detectors (secrets, PII, names, sensitive-class, live-mode, reflection, engine-error signatures) have false negatives.
6. Target cloaking/forged responses (A7); verdicts are statements about observed responses.
7. Provisional numerics (budgets, windows, cooldown, 24 h, 14 d, 3/24 h attempts) are uncalibrated until `M` (T523); the attempt window is probably too tight (N-3).
8. Upstream provenance: 009 U-1 and 011 uncommitted (AR-8/AR-9); T521.
9. The score number for a partial SECURITY area stays computable and can read 100 (P13 undecided); safety then depends on every consumer.
10. KMS/broker hosting, YAML parser, OSV distribution `UNKNOWN` (P11); OS-level child egress confinement is infra-dependent and verified only at SG7.

---

# 7. FINAL VERDICT

**READY-WITH-REPAIRS.** Not READY-FOR-FREEZE: one scenario is still a GAP (7) and several repaired scenarios still have a path around the mechanism or an unowned piece. Not NOT READY: the architecture is sound, every residual is fixable inside 012 documents/tasks, no upstream frozen text must change (two upstream-facing constraints must be recorded as AR items), and the repairs removed most of the original defeats.

Justification: of 53 originally WEAK/GAP scenarios, 33 are now ADEQUATE, 19 WEAK, 1 GAP; no regression in safety direction; two availability regressions (R-1, R-4). The remaining weaknesses are concentrated in four areas: destination ownership binding, the worker/resolver trust split, cooperative-child enforcement, and the partial-score consumers.

Must-fix before freeze:
1. Scenario 7 / FR-172: require HTTP-file proof for active classes, remove the customer-declared address-set escape, enforce the proof-derived address for every connection of the unit, add DNS-TXT and mid-unit re-point fixtures (also closes 5).
2. A1 / FR-173 / N-1: name the API as plan resolver and MAC-key holder, relocate T117/T119/T537, MAC the identity list and class, record the AR for DB-role constraints on 007/008/009 tables.
3. 35/49 / FR-186: decision-level (not string-lint) consumer requirements: `computeVerdict` no-go and no certificate on `coverageComplete:false`, additive marker in `overallScore`, named files, P13 decided; resolve the dual writer (N-6).
4. A10 / FR-174: mandate terminable worker-thread (or proven-linear) execution for all hostile-text parsing and extend T538 to classifiers.
5. N-2 / A3: parent-minted single-use request permit enforced by the egress proxy.
6. 13 / A2: fail-closed on status-read error, drop "push", add the `<= 1 request` task and an error-path fixture (and the missing tasks of N-8).
7. 18 / N-3: broker `reserveAuthAttempt` and separate failed/successful counts.
8. A27 / N-4: restate FR-177 against the enforcement points that exist, add dispatch/per-plan checks, update `SEC_CONSENT_MISSING`, record the AR.
9. 43 / N-7: group-barrier materialization (or drop "upsert wins").
10. 24 / N-5: entity and DTO for operation declarations.
11. A18 / N-14: automatic restore/rollback detection.
12. 9 / N-15: child stdio and crash-output policy.
13. N-9 and N-10: CAS-first dispatch/finalize ownership; fix the two-grant vs same-grant-id contradiction.
Should-fix: N-11 stale text sweep, N-12, N-13, N-16, N-17, 19, 25, 29.
