# Phase 0 Research: Security / Authentication / Authorization / API / Business-Logic Testing Platform

Planning artifact only. Nothing was executed against any network or target; no scanner was run; no source, schema or
migration was changed. Items that cannot be settled by reading the repository are labelled
`UNKNOWN — REQUIRES INVESTIGATION`; product policy items are `PRODUCT DECISION — PROVISIONAL` (conservative default stated,
confirmed at closure, see plan.md §"Product decisions" P1–P18); external facts not derivable from the repository are
marked `UNVERIFIED`. Repository evidence is cited as `path:line` where it was observed on 2026-10-10; frozen-upstream
statements are cited by spec/section. This file introduces **no** new FR number, `SEC_*` code, evidence kind or execution
class; the rulings that resolved the earlier needs and contradictions are summarized in R16 and recorded in full in
`reconciliation-log.md`; items the log does not resolve remain under "Open for closure" at the end.
Each decision section uses **Decision / Rationale / Alternatives / Consequences**.

---

## R0: Repository and provenance state

- **Decision**: treat the **working tree** as the source of truth and record the provenance risk; do not rely on committed
  history for 009 U-1, 011 or the 012 inputs.
- **Observed state (read-only, `git rev-parse` / `git status`, 2026-10-10)**: `HEAD = e42577304a2c` (equal to
  `origin/main` per the spec baseline). The working tree contains **uncommitted** modifications to ten 009 files
  (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `tasks.md`, and the contracts `evidence-envelope`, `execution-plan`,
  `execution-runtime`, `execution-unit`, `runtime-finalization`) — these carry the **U-1 deadline edits** — plus an
  **untracked** `specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md`; **untracked**
  `specs/011-source-backend-database-testing-platform/` and `specs/012-security-auth-api-testing-platform/`; and
  **untracked** `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/`. The `showcase-*`
  directories were not touched or read by this work.
- **Rationale**: SPEC 011 and the 009 U-1 text are the contracts 012's engines, deadlines and `onUnitExpired` hook bind to,
  yet neither is committed. A `git checkout`/`clean` by anyone would silently remove the contracts 012 depends on.
- **Alternatives**: (a) cite only committed text — rejected: U-1 (deadlines, `onUnitExpired`, `hardStopMarginMs`) would
  be invisible and the unit-timing section of plan.md would be unsupported; (b) commit upstream files as part of 012 —
  rejected: PLANNING ONLY, and 012 must not edit specs 006–011.
- **Consequences**: (1) plan.md §"Unit timing" and the `onUnitExpired` obligations are re-checked at closure if U-1 changes
  (spec Assumptions); (2) closure must verify 009 U-1 and 011 are committed *before* 012 is frozen (recorded as an
  ordering requirement, not a spec change); (3) every statement here about U-1/011 is attributed to the working-tree text.
- **Schema reality**: the real `apps/api/prisma/schema.prisma` contains **no** `Evidence`, `Artifact`, `ExecutionUnit`,
  `ScanPlan`, `IdempotentClaim`, `TargetAuthorization`, `AdmissionLease`, `KillSwitchState`, `ExecutionAuditEvent`
  or credential models (models present: `User … Target, TargetVerification, Scan, ModuleResult, Issue, VerificationAttempt,
  Capability…, AuditLogEntry, BillingEvent, …`). 007/008/009/010 exist only as specifications. 012 therefore plans against
  *intended* schemas, and every dependency on them is a gate (SG1/SG2).

---

## R1: Repository reality audit — existing security capabilities

Method: read each vendored capability's entrypoint and the shared SDK/worker seams. Classification vocabulary: **real
request** (the tool itself sends a request), **passive fetch** (one ordinary GET through `ctx.fetch` = safe-net),
**regex/heuristic** (string/regex test on a header/body), **config/static** (inspects configuration or committed text),
**AI** (LLM judgement). Verdicts: REUSE / EXTEND / REPLACE / DEPRECATE / NEW / OUT OF SCOPE — consistent with plan.md
"Capability migration map".

| Capability | What it actually does (evidence) | Mechanism | Verdict | Rationale / what changes |
|---|---|---|---|---|
| `headers-checker` | One `ctx.fetch(targetUrl)` (`headers-checker/src/index.ts:91`); emits `headers.csp-missing`, `headers.frame-options-missing`, `headers.content-type-options-missing`, `headers.referrer-policy-missing`, `headers.permissions-policy-missing` (`:35-75`) | passive fetch + **presence-only** header check; no value parsing | **EXTEND** | Value-parsing checks (`sec.cfg.*`: CSP directives, HSTS values, cache-control on sensitive responses), CWE/OWASP tags, honest verdicts. Remains as-is during strict parallel run (FR-160) |
| `owasp-checker` | One fetch (`owasp-checker/src/index.ts:106`); cookie flags via regex `/;\s*secure\b/i`, `/;\s*httponly\b/i`, `/;\s*samesite\s*=/i` (`:140-143`); `Server`/`X-Powered-By` version regex; splits `set-cookie` on commas with a lookahead (`:3-9`, `:37`) | passive fetch + **regex heuristic** on a comma-joined string | **EXTEND + rename later** | Needs multi-value `Set-Cookie` (safe-net joins with `', '`, R3); cookie hygiene/disclosure checks move to the registry. **Live defect**: `evidence: { setCookie }` (`:30,45,60`) persists the *raw* `Set-Cookie` value into `Issue.evidence` — T-HARDEN-1 (R4) |
| `ssl-analyzer` | `new URL(...).protocol === 'https:'` test (`ssl-analyzer/src/index.ts:44-48`) then one fetch and an HSTS header check (`:62`, `:67`, `:84`) | passive fetch + header check; **no TLS handshake inspection** (no protocol, cipher, chain, expiry) | **EXTEND / NEW** | HSTS and scheme logic reused; real TLS inspection is a NEW safe-net raw-socket door, gated (`SEC_TLS_INSPECTION_UNAVAILABLE` until then) |
| `data-leak-scanner` | Delegates to `@webaudit/redaction` detection (`data-leak-scanner/src/index.ts:1-25`); scans attached source files or the fetched page body (`:92-104`); finding evidence is value-free (`kind, path, line, column, length, placeholder`, `redaction/src/to-findings.ts:108-116`) | pattern + entropy detection over text | **REUSE / EXTEND** | Extend to JS bundles and API-response bodies; add no live-key validation (FR-113). The value-free evidence shape is the precedent 012 generalizes |
| `dependency-scanner` | Manifest/lockfile parsing plus a vendored advisory table `ADVISORIES` of **7** entries (`dependency-scanner/src/advisories.ts:36-81`: serialize-javascript, minimist, lodash, axios, semver, tar, ws) with `fixedIn` ranges; refuses range matching (`:102-137`) | static + **hard-coded table** | **REPLACE (advisory half) / REUSE (hygiene half)** | Advisory claims move to `AdvisorySnapshot` matching over 011 `DEPENDENCY`; deprecated-package/lockfile-hygiene checks stay. Spec/plan now state 7 entries (L25) |
| `bundle-analyzer` source-map | existing (unchanged by this spec) | static | **REUSE (relabel SECURITY)** | no change in 012 |
| Marketing labels "OWASP Top 10", "pentest" | UI/marketing wording (spec baseline) | — | **DEPRECATE claim** | coverage-based wording only (FR-137) |
| `network-inspector`, `lighthouse-analyzer`, `css-analyzer`, `content-checker`, `meta-checker`, `contradiction-detector` | not security testing | — | **OUT OF SCOPE** | — |
| `playwright-runner`, `screenshot-capture` | browser capability; `apps/probe-pool` has a browser pool but **no reference from `apps/worker/src` or `apps/worker/package.json`** | — | **OUT OF SCOPE (010)** | browser units are 010's; probe-pool is not wired (R3) |
| Active probes, auth, authz, API, logic, active CORS, injection indicators, CSRF fixtures | **do not exist** | — | **NEW** | this spec |
| `apps/api/src/services/auth/token-vault.ts` | AES-256-GCM, 12-byte IV, one env key (R2) | — | **REUSE pattern only** | not for 012 credentials (FR-017/026) |

**Overall finding**: there is **no** AI layer, no request-crafting and no authenticated testing in any existing security
capability; the five capabilities are one-GET passive checks (+ one static scanner). Nothing in the repository sends a
crafted request, stores a customer test credential, or holds a session. Everything beyond header/cookie/HSTS hygiene and
secret-pattern detection is NEW.

---

## R2: Credential and secret reality

- **Finding**: the only encryption primitive is `token-vault.ts` (72 lines): **AES-256-GCM**, 12-byte random IV, auth tag
  appended to ciphertext, key = **one** base64 32-byte `env.encryptionKey` (`ENCRYPTION_KEY`) read via `key()`; no key id, no
  key version, no KEK/DEK hierarchy, no AAD binding of tenant/record, no rotation path, no per-tenant key. An unset key
  fails closed unless `ALLOW_INSECURE_DEV_SECRETS=true`, in which case a constant-derived placeholder key is used
  (acceptable for dev; the file documents why).
- **Over-privilege**: `githubTokenFor(db, userId)` (`apps/api/src/services/intake/repos.ts:67`) is imported by the worker
  (`apps/worker/src/intake/materialise.ts:41`, used at `:224`); the worker therefore holds `ENCRYPTION_KEY` and a DB
  connection and can decrypt **every user's** stored GitHub token. A worker compromise today equals a full third-party-token
  compromise.
- **Gap**: there is **no customer test-credential storage** of any kind (no model, no route, no UI), no rotation, no
  revocation, no lease/audit trail for secret use, and `deletion.service.ts` nulls token columns on account deletion but
  has no vault concept (and relies on `User` cascade, which will not reach zero-relation 012 tables).
- **Implication for 012**: reusing `token-vault.ts` for customer test credentials would (a) put credentials under the same
  all-powerful key the worker already holds and (b) give no crypto-shred, versioning or audit. 012 therefore needs a new
  envelope scheme and a separate trust zone (R7). The existing vault is **unchanged** (FR-026).
- **Open**: KMS/HSM provider, broker hosting and network topology — `UNKNOWN — REQUIRES INVESTIGATION` (P11).

---

## R3: Session and login reality

- **Finding**: there is **no** session or cookie jar, no login automation, no auth-state model and no authenticated scan
  path in the repository. `safe-net`'s `safeFetch` (`packages/safe-net/src/safe-fetch.ts`) is **stateless**: it follows
  redirects by hand, strips `authorization`/`cookie`/`proxy-authorization` on cross-origin hops
  (`SENSITIVE_HEADERS`, `headersForHop`), and returns `headers` as `Record<string,string>` built by `headerRecord`, which
  **joins multi-value headers with `', '`** (`:67-75`) — so multiple `Set-Cookie` headers collapse into one string and
  `owasp-checker` must re-split with a regex (R1). There is no multi-value header API, no per-request timing, no
  `Retry-After`/redirect-chain *observation* surface beyond `redirects: string[]`, and (since `maxRedirects` defaults to 5 and
  the caller can only widen/narrow count) no "never follow cross-origin" mode.
- **Probe pool**: `apps/probe-pool` has a browser pool, but nothing under `apps/worker/src` references it (grep for
  `probe-pool` in the worker returns no hit); browser-based testing is **not wired** today and 010 is a spec only.
- **Implication**: both engines need (a) a `SecurityHttpClient` built *on* safe-net (extension: multi-value headers, timing,
  `AbortSignal`, forbid automatic cross-origin follow) and (b) a `SessionHost` that owns jar/renewal/logout. These are NEW
  (FR-054, FR-041). The package-export rule matters: `safe-net`'s `package.json` exports only `src/index.ts`, so every
  extension is made *inside* the package and re-exported as a new function that, like `safeFetch`, accepts **no policy or
  resolver argument** (the `allowLoopback` test seam stays unreachable from outside).

---

## R4: safe-net and redaction capability analysis and gaps

### safe-net (`packages/safe-net/src`: address-rules, connect-guard, resolve-guard, validate-url, safe-fetch, browser-proxy*, errors, policy, index)

- **Strengths (retain unchanged, FR-054/FR-079)**: four SSRF layers (URL validation → resolve guard → connect guard →
  per-hop revalidation by manual redirect loop, `maxRedirections: 0`); address-class refusals (loopback, link-local/metadata,
  RFC1918, alternate encodings, IPv6-mapped) in `address-rules.ts`; response buffered then socket closed (no pooled-socket
  rebinding window, `policy.ts` note); `DEFAULT_POLICY = { allowLoopback:false }`, constructed *inside* the entry point so
  no outside caller can reach `allowLoopback`; `DEFAULT_MAX_REDIRECTS = 5`, `DEFAULT_TIMEOUT_MS = 30_000`,
  `DEFAULT_MAX_RESPONSE_BYTES = 10 MiB`; `SsrfRefusedError` with refusal reasons.
- **Gaps relevant to 012**:
  1. **No scope filter**: it knows *public vs private*, not *which hosts a grant authorizes* — scope is F01's `isInScope`
     via F07 checkpoint, so every 012 request must be gated **before** safe-net (FR-055 order).
  2. **No budgets**: only a max-redirect and max-bytes constant; no per-unit bytes, per-endpoint or auth-attempt limits
     (`LocalBudget`, FR-070/071).
  3. **No timing or TLS metadata** in `SafeResponse` (`url, status, headers, redirects, bytes(), text()`); no TTFB, no
     certificate/protocol info (hence TLS-detail checks stay `SEC_TLS_INSPECTION_UNAVAILABLE`).
  4. **Multi-value headers lost** (R3) and **no `Retry-After`/redirect-hop status list**.
  5. **Automatic same-chain redirect following** up to 5 hops — acceptable for passive fetches, wrong for 012 where each hop
     is a checkpoint and cross-origin must not be followed.
  6. **Private targets are unreachable by design**: private/on-prem staging is unsupported in v1 (P9); 012 will not weaken it.

### redaction (`packages/redaction/src`: assemble, detect, redacted-prompt, to-findings; entry `index.ts`)

- **What it is**: a **text/pattern-based** secret detector. `SECRET_KINDS` (16): private key, AWS key id, GitHub token,
  Slack token, Stripe secret, Google API key, OpenAI, Anthropic, SendGrid, NPM token, Twilio, **JWT**, connection-string
  password, `AUTHORIZATION_HEADER`, generic secret assignment, high-entropy string (`detect.ts:33-50`), with a precedence table
  (named vendor > name-based > entropy). Public surface is deliberately four functions + types (`assemblePrompt`,
  `redactText`, `isRedactedPrompt`, `secretsToFindings`, `SECRET_KINDS`); `SecretMatch.value` never leaves the package.
- **Gaps for 012**: (1) **no structural rules** — it does not know that a `Cookie`/`Set-Cookie` *header value* or a URL
  *query value* is sensitive regardless of shape (a 20-char session id has no pattern); (2) **no exact-value registration**
  — it cannot be told "this specific token is in play, redact it wherever it appears", which the spec requires because a
  response can echo a token the request never sent (FR-128); (3) **no cookie/header-name awareness** or typed placeholders
  (`<redacted:cookie lenClass=M>`); (4) its `SecretKind` *type name* collides with the planned credential-kind enum (naming
  proposal in data-model.md §15 P-5); (5) it is not applied at evidence-persistence time anywhere on the SECURITY path.
- **Live defect (T-HARDEN-1)**: `apps/worker/src/module-runner/persist.ts` writes `evidence: finding.evidence ?? null`
  (`:185`) to `Issue.evidence` **without any redaction pass**, and `owasp-checker` supplies `evidence: { setCookie }` with the
  raw `Set-Cookie` value (`owasp-checker/src/index.ts:30,45,60`). A session cookie observed on a customer site is therefore
  stored verbatim today. This is a present-day defect independent of 012 activation; spec FR-160 and SG4 require the fix
  as a separate hardening task that must not wait for 012. (Not fixed here — planning only.)
- **Consequence**: 012 needs an extension to `@webaudit/redaction` (exact-value registry + structural header/cookie/query
  rules + typed placeholders) **before** any active/authenticated flag may be enabled (SG4).

---

## R5: Upstream binding-constraints digest

Only constraints that shape 012 decisions; each is stated as read from the frozen text (via the 012 spec's own citations,
verified against data-model files where noted).

**007 / F01 (authorization)**
- FR-015a: a grant whose `executionClasses` includes `ACTIVE_SECURITY` or `AUTHENTICATED_WORKFLOW` MUST NOT include
  `PRODUCTION` in `environmentRestriction` (verified in 007 spec line ~441). ⇒ no production active/authenticated testing,
  no amendment requested.
- FR-005/FR-006: ownership verification and authorization are separate; per-class grants, independent per-class checks.
- FR-007 (scope): `ScopeDefinition` carries `includedAccountRefs`, `includedRoles`, `includedActionCategories` (verified in
  007 data-model lines 145-147) as **shape only**; their semantics are explicitly deferred to F05 (this spec) and
  `isAuthorized` takes no account/role/action argument ⇒ 012's `securityScopeGate` (named limitation).
- FR-010/FR-024: no cached `AUTHORIZED` across more than one action; freshness at every destination/step.
- `TargetAuthorization`: `executionClasses[]`, `scopeId`, `environmentRestriction[]`, `requestBudget ≤ 1,000,000`,
  `concurrencyBudget ≤ 1,000`, `durationBudget ≤ 30 d`, finite always, `userId` denormalized, every lookup filters `userId`.

**008 / F07 (safety)**
- `requestAdmission`, `safetyCheckpoint(consumes{request,concurrency})`; admission lease **30 s** TTL, renewed per
  checkpoint, `holderToken` fencing (`AdmissionLease`, 008 data-model); checkpoint/stop cadence **≤ 5 s**; kill switch
  scopes EXECUTION/SCAN/GRANT/TARGET/TENANT/PLATFORM read in one indexed query; `KillSwitchReason` closed
  (`USER_CANCELLATION, AUTHORIZATION_REVOKED, ENVIRONMENT_RECLASSIFIED, OPERATOR_EMERGENCY_STOP, SYSTEM_SAFETY_POLICY`);
  `ExecutionAuditEventType` closed (`ADMISSION_GRANTED/REFUSED, BUDGET_*, STOP_*, STOPPED, ESCALATED, EXECUTION_COMPLETED,
  SAFETY_VIOLATION`); `payload` redacted before write.
- **No byte budget** (ledgers requests + concurrency; duration via grant expiry), **no cleanup after stop** (post-stop
  admission refused `KILL_SWITCH_PENDING`), in-flight requests may complete remotely (FR-014 named limitation), unit
  consumption policy must be declared per engine (FR-019).

**009 (core scan/execution)**
- Classes and queues (`webaudit-exec-active-security`, `webaudit-exec-authenticated-workflow`); queue payload exactly
  `{executionUnitId}`; `ExecutionUnit.retryPolicy.maxAttempts` default 1 for these classes (FR-024); mandatory redaction for
  ACTIVE/AUTH units (FR-030); `Evidence` typed envelope, `IssueEvidenceLink` many-to-many, `Artifact` R2 with
  `artifacts/<scanId>/<executionUnitId>/…` keys (data-model lines 259-333); zero-`@relation`-to-frozen-models rule;
  `FailureClass` mapping (a measured result is `COMPLETED`, never `FAILED`, R9a).
- **U-1 (uncommitted)**: immutable plan deadline, `onUnitExpired(unit) -> TERMINATED | PENDING`, `hardStopMarginMs`,
  hosting-failure backstop, "fence first, claim second, write third" (scan-deadline-contract.md lines ~193, 273, 294).

**010 (web testing)**
- Check-registry pattern (`onEvidenceCommitted`, claim before readiness query, non-recursion, sweeper as module-result
  finalizer); six verdicts (`PASS, FINDING, NOT_TESTED, UNSUPPORTED, BLOCKED, INCONCLUSIVE`); `IdempotentClaim{scope,claimKey,resultRef}`
  with `@@unique([scope, claimKey])` (010 data-model lines 162-175 — `scope` is a free string); **browser zero-state**: each
  `BROWSER` unit gets a fresh context, no session-injection primitive (⇒ AR-2); FR-045/FR-046 (redaction narrower than
  009's list; screenshots/HAR/traces **not** pixel/content-redacted).

**011 (source/backend/database)**
- `SOURCE_SURFACE` (with `surfaceComplete`), `DEPENDENCY` (lockfile-resolved), `CODE_FLOW`, `RouteIdentity`
  (`correlationGrammarVersion: 1`); untrusted-execution Provider Port behind AG1–AG10; FR-091: backend evidence is origin-labeled
  `SOURCE_DERIVED`/`EXECUTED_LOCAL`, **never `LIVE_TARGET`** — live deployed-API testing is 012's and a request for it through 011
  is refused; 011's data-model/decision-table (the format 012's data-model follows) creates **zero** new tables.

**Constitution v1.2.0 gates**: Development Workflow requires reviewed, reversible schema migrations (line ~508); principles
II, III, VIII, X, XI, XII, XIII, XIV as mapped in plan.md Constitution Check.

---

## R6: Decision — no new execution class; composite IDOR resolved as linked per-class units

- **Decision**: 012 adds **no** execution class. Authenticated/cross-identity workflows run as `AUTHENTICATED_WORKFLOW`
  (E15); crafted/adversarial/mutating probes as `ACTIVE_SECURITY` (E14); passive observations are parent-side registry checks
  over `PASSIVE_HTTP`/`BROWSER`/`CRAWLER`/`SOURCE_STATIC` evidence. A composite test (IDOR: two identities + a modified
  request) compiles to **one unit per class** linked by an `ExecutionDependency` edge used for *ordering and baseline
  validity only*; **no session crosses units** — each unit obtains its own broker lease and session (FR-062).
- **Resolves**: the open question recorded in `006-scan-architecture-v2/decisions.md` (Open-questions table: "Some vision-list
  testing capabilities (IDOR, business-logic/price/coupon manipulation, race conditions) genuinely span two execution classes
  … E14/E15 child specs should explicitly decide whether such tests run as one engine invoking the other, or as a distinct
  composite-class concept"; the 012 spec cites it as l.160).
- **Rationale**: (1) 007 FR-006 requires independent per-class authorization checks — a composite class would need one grant
  decision for two risk levels and invite "the weaker class authorizes the stronger" bugs; (2) a unit is the unit of
  admission, lease, retry, kill and billing; two classes in one unit would make `requiresSafetyCheckpoint`, queue and
  `retryPolicy` ambiguous; (3) 009's `ExecutionDependency` already exists for exactly this; (4) not passing a session between
  units removes the most dangerous cross-unit coupling (secret in a queue/DB); (5) 009's flat per-domain pricing (ADR-005)
  stays untouched.
- **Alternatives**: (A) one engine invoking the other in-process — rejected: breaks per-class authorization/isolation and
  would let E15 hold credentials inside an `ACTIVE_SECURITY` boundary; (B) a new composite class — rejected: new `ExecutionClass`
  = 007/008/009 amendment, new queue, new pricing semantics for no behavioral gain; (C) E14 only with an auth mode —
  rejected: authenticated state must not live in the engine that sends adversarial inputs by default.
- **Consequences**: composite checks pay two admissions and two lease issues; baseline validity (e.g. "identity B logged in")
  is re-established per unit; the dependency gates *ordering only*; coverage must show both units; reverify of a composite
  finding is a fresh multi-unit minimal plan (one probe family). **Refinement (L2 / FR-161)**: a credentialed *crafted* request
  is executed by an E14 unit with its own lease and `SessionHost` and is checkpointed under both classes (grant must authorize
  both; AR-10 RECOMMENDED); credentialed uncrafted replays stay single-class E15; reverify of such a finding is a single E14 unit
  with dual checkpoint. Alternative (C) above remains rejected for the *uncrafted/stateful workflow* case.

---

## R7: Decision — envelope encryption in a separate Credential Broker

- **Decision**: store customer test credentials as `CredentialVersion` ciphertext under **envelope encryption** (per-version
  random 256-bit data key, AES-256-GCM, fresh nonce, AAD = tenant+credential+version) with the data key wrapped by a KEK in a
  managed KMS/HSM; only a **separate, minimal Credential Broker** may unwrap; workers receive a short-lived lease over an
  authenticated, unit-bound channel into parent memory; the existing `ENCRYPTION_KEY`/`token-vault.ts` is not used.
- **Rationale**: R2 shows the worker holds the key and DB URL today; any in-process vault repeats that over-privilege with
  *customer test credentials for authenticated systems* as the new prize. Envelope encryption gives crypto-shred (destroy the
  wrapped key), per-version blast-radius, KEK rotation without re-encrypting payloads, and an audit trail at the KMS. A
  separate broker is the only place the unwrap permission lives, and it re-validates unit/lease/grant/tenant/target/identity/
  environment/kill-switch against Postgres on every issue (FR-032), so a compromised worker cannot obtain a credential
  outside a live authorized unit.
- **Criteria used**: (1) worker compromise must not yield a usable credential store; (2) crypto-shred/rotation/versioning;
  (3) no invented crypto; (4) customer data-incident blast radius; (5) operational cost/availability; (6) fail-closed on
  outage (FR-037).
- **Alternatives considered**:

  | Alternative | Why rejected / limitation |
  |---|---|
  | **In-worker vault** (new tables, `token-vault.ts` pattern, worker decrypts) | Fails criterion 1: worker has key + DB; identical to the audited over-privilege |
  | **KMS direct from the worker** (worker has KMS unwrap IAM) | Removes the shared env key but any worker compromise still unwraps *any tenant's* data key that the worker can fetch; no lease/fence/grant re-validation at the unwrap point; no per-unit replay control (FR-035) |
  | **HashiCorp-Vault-transit-style service** (encrypt/decrypt API, keys never leave the service) | Acceptable *as the KMS provider* behind the broker (the broker could call transit); not a substitute for the broker's authorization logic (unit/lease/grant/env checks) and adds a second service to operate; evaluate under the provider investigation — `UNVERIFIED` that it satisfies unwrap-only IAM scoping and audit |
  | **Per-tenant keys (KEK per tenant)** | Better isolation and a stronger crypto-shred (destroy tenant KEK, also defeats backup residue — data-model.md §15 P-4) but multiplies KMS keys/cost and rotation work; kept as an option to decide at the provider investigation, not a v1 requirement |
  | **Customer-held keys / bring-your-own-vault** | Out of scope v1; would need a customer agent (P9) |

- **Consequences**: a new deployable (`credential-broker`) and operational ownership (SG10); credentialed checks are `BLOCKED`
  (`SEC_BROKER_UNAVAILABLE`) when the broker is down; added latency per unit start; the API must be able to *seal* (wrap-only)
  without unwrap (open question P-2). **KMS/HSM provider: `UNKNOWN — REQUIRES INVESTIGATION`** — every candidate must offer
  unwrap-only IAM scoping, key versioning and audit; ⟂KMS fields in data-model.md are shape-only.

---

## R8: Decision — engine-local budgets vs an F07 amendment (AR-4)

- **Decision**: keep F07 authoritative for **requests, concurrency, duration**; enforce **bytes, auth attempts, per-endpoint,
  per-identity, redirects, retries, mutations, workflow steps** as **engine-local limits**, pre-checked before every request
  by a single `LocalBudget` consulted by `SecurityHttpClient`, labeled "LOCAL — not F07-ledgered" everywhere. A true F07 byte
  dimension remains optional amendment AR-4.
- **Rationale**: 008's ledger has no byte/auth/mutation dimension; amending 008 now would block 012 for a feature the
  architecture can enforce safely locally (limits can only be *tighter*, never looser, than F07's). Pre-check (not after-the-fact
  counting) is what makes a local limit a safety control. Each retry and redirect hop consumes budget like any request (FR-072).
- **Alternatives**: (A) amend 007/008 now — rejected: delay; changes frozen text; (B) no byte/attempt limits — rejected: a
  lockout-capable login path without an attempt cap is unsafe (FR-074); (C) count after the fact — rejected: a limit that is
  checked after the request is a post-mortem.
- **Consequences**: local counters are not durable across crash (a recovered unit re-derives from `MutationIntent`/claims and
  starts fresh with `maxAttempts:1`, so a crash cannot double-spend); reporting must label local vs F07 limits; auth-attempt
  limits across *units* (same identity, same scan) are not enforced by F07 — mitigated by `maxAttempts:1`, per-unit cap 3
  (hard max 5), lockout-signal stop, and the plan serializing identity use; a cross-unit auth-attempt ledger would be the
  AR-4-class hardening if measured need appears.

---

## R9: Decision — own `SECURITY_CHECK_RESULT` kind vs widening 010 `CHECK_RESULT`

- **Decision**: 012 uses its own evidence kind `SECURITY_CHECK_RESULT` (and its own `IdempotentClaim` scope
  `sec-check-execution`) rather than reusing 010's `CHECK_RESULT`.
- **Rationale**: 010 and 011 each forbid widening each other's kinds/scopes (011 chose its own kinds for the same reason);
  security verdicts carry fields 010's six-verdict result does not (confidence ladder, CWE/OWASP, severity derivation,
  classification, cleanup state, FLAG annotations); reuse would need a 010 amendment. The mapping to 010's verdicts is fixed
  (FR-136): `NO_ISSUE_DETECTED`≙`PASS`, the four confidence values≙`FINDING`, the rest identical.
- **Alternatives**: widen `CHECK_RESULT` with an optional `x012` block — rejected: amendment + risk of breaking 010 consumers;
  store verdicts only on `Issue` — rejected: non-findings (the majority) have no `Issue`, and confidence is not an `Issue` column.
- **Consequences**: one more `EvidenceKind` (additive enum value); readiness/coverage consumers (SPEC 014) must read
  `securityCoverageSummary`, not 010's `CHECK_RESULT`; the six 012 kinds are justified individually in plan.md.

---

## R10: Decision — mechanical check classification (anti-reclassification)

- **Decision**: the class of a check (C0–C5) is **computed from its probe definition and application semantics** by the
  registry loader; a declared class that differs is **rejected at load** (FR-007, FR-149).
- **Rationale**: classification gates production eligibility, required execution class, consent and budgets. If it were
  self-declared, one mislabeled check ("passive") would bypass the production prohibition (F01 FR-015a only protects the
  *grant*; a passive-labeled active probe would run on the passive path with no grant). HTTP method is a poor proxy: GET can mutate;
  a search POST can be read-only. The rule (FR-008): **C0 iff it adds no request beyond the ordinary passive fetch, attaches no
  credential, and sends no crafted header/parameter/body/method/Origin**.
- **Alternatives**: method-based classification — rejected (both directions wrong); author attestation + review — rejected
  (human error is the failure mode); runtime detection of state change — rejected (cannot be known before sending).
- **Consequences**: probe definitions must be fully declarative (FR-066) so the class can be computed; `sideEffects[]` and
  fixture-declared state changes drive `C2`; a loader lint (SG6) and a conformance suite assert recomputation; a check can
  only get *more* restrictive when its definition changes (new version).

---

## R11: Decision — no cleanup after stop; write-ahead intent

- **Decision**: before any `C2` request, a durable **`MutationIntent`** (`INTENDED` then `SENT`) is recorded and acknowledged;
  after any F07 stop/grant revocation **no** out-of-band cleanup is attempted; a **Residual Manifest** (`CLEANUP_RECORD`
  `RESIDUAL`) is emitted and the check is `INCONCLUSIVE` (`SEC_CLEANUP_FAILED`/`SEC_CLEANUP_UNVERIFIED`), never
  `NO_ISSUE_DETECTED` (FR-120–123).
- **Rationale**: F07's stop semantic is that admission is refused after a stop (`KILL_SWITCH_PENDING`); a platform that "cleans
  up anyway" defeats the kill switch and is exactly the action an operator stopped. A crash after a mutating request but before
  its result is recorded is otherwise indistinguishable from "never sent" — the write-ahead row is the only evidence that
  prevents a duplicate mutation after recovery (US7) and that tells the customer which fixture may be dirty.
- **Alternatives**: (A) best-effort cleanup after stop — rejected: violates 008 semantics; (B) record after the request —
  rejected: crash window; (C) idempotency keys only on the target — rejected: customer API may not honor them; (D) forbid
  mutation entirely — rejected for scope but kept as the **default OFF** (P2).
- **Consequences**: residual fixtures are a customer-visible state, not an error; mutation consumes 3 request units locally (action, cleanup, verification read; FR-121, L9)
  (mutation + cleanup, FR-121) and the cleanup must be admitted *before* the stop to run; `SENT_UNCONFIRMED` is never retried
  (`attempts:1`); the manifest writer is the parent-side finalizer (data-model.md §15 C-1); reports must say in-flight
  requests may complete remotely (FR-124).

---

## R12: Constitution compliance notes and consolidated named limitations

Compliance table is in plan.md §"Constitution Check" (PASS with named limitations). Notes by principle:

- **II Vendored forever** — probes, harmless alphabet, advisory data are local/vendored; the OSV import is an operator action.
- **III/IV** — deterministic verdicts; zero LLM in engines/registry; AI explains committed verdicts only (FR-144).
- **VIII** — E14/E15 produce Evidence; domain checks live in the registry; the **broker is a new service justified by genuine
  isolation** (R2), not convenience.
- **X** — verified domain ≠ authorization; production prohibited via F01 FR-015a.
- **XI/V** — no customer code is run by 012; 012 credentials unreachable from any `SOURCE_EXECUTION` Guest.
- **XII** — dedicated queues, `attempts:1`, U-1 `onUnitExpired`; `M` calibration pending.
- **XIII** — tenant-scoped credentials/sessions/evidence keys; lock-ordered vault operations; deletion shred.
- **XIV** — 18-field class fills, registry fields, budgets, retention, observability.
- **Development Workflow** — migrations reviewed and reversible (data-model.md §13), tests first (fixture suite).

**Named limitations (consolidated)**

1. `securityScopeGate` (account/role/action-category semantics) is **not F01-enforced**: enforced by 012 code + conformance
   tests (007 defines shape only). Hardening candidate AR-1.
2. **In-flight requests complete remotely** after a stop (008 FR-014); results are not trusted; cancellation reverses nothing.
3. **Memory zeroization is best-effort** in a garbage-collected runtime; mitigated by short leases (≤ min(unit timeout + margin, 30 min), L8), process-per-unit
   and SIGKILL, not eliminated.
4. **Sandbox fixture safety is customer-asserted** (`SANDBOX_CONFIRMED`, FR-117); Fahes cannot verify it.
5. **Screenshots/HAR/traces are not content-redacted** (010 FR-046); 012 captures none of authenticated pages in v1 (FR-133).
6. **`routes` joins with unresolved prefixes** (011 correlation): an unresolvable service/workspace key ⇒ `surfaceComplete:false`,
   never guessed (FR-099).
7. **Provisional numeric ceilings** (≤ 300 / ≤ 150 requests per unit, per-endpoint 8, 256 KiB bodies, 14-day advisory freshness,
   lease cap min(unit timeout + margin, 30 min), 250/500 ms pacing, etc.) are conservative starting points; they may be tightened without amendment, never
   loosened beyond 007/008 maxima.
8. **`M` calibration**: unit timing (plan.md §"Unit timing") is provisional until measured (009 U-1).
9. **Crypto-shred vs backups**: shred is effective only after the vault backup/PITR window or KEK retirement (data-model.md
   §15 P-4).
10. **Auth-attempt limits are per unit**, not a cross-unit F07 ledger (R8).
11. **Existing capabilities' `Issue.evidence` is unredacted today** (T-HARDEN-1) until the separate hardening task ships.
12. **Private-network targets and authenticated browser testing are unsupported** in v1 (P8, P9).
13. **012 depends on unimplemented 007/008/009/010 runtimes** and on uncommitted 009 U-1 and 011 text (R0, SG1).

---

## R13: Injection-testing safety analysis

- **Decision**: injection/XSS/CSRF checks are **indicator** checks with a closed, inert **harmless alphabet** (marker tokens
  with a unique per-probe id, quote/angle/brace *characters*, boundary lengths within schema type); they never extract data,
  execute commands, use time-delay primitives, reference files or networks, or attempt exploitation. Confirmation of SQLi,
  command injection, SSTI and similar is **intentionally limited**: an error-signature or reflected-unescaped marker yields at
  most `LIKELY_VULNERABILITY`; `CONFIRMED_VULNERABILITY` requires a registry `confirmable:true` check plus a fixture-confined
  oracle (authorization/logic cases only), never a status code and never AI (FR-106, FR-140).
- **Rationale — why confirmation is limited**: reliable confirmation of injection classes requires a *data-dependent
  behavior change* (boolean/time/UNION/out-of-band), i.e. executing attacker-controlled logic on the target's backend: that
  reads or alters data the customer did not register as a fixture, can degrade the target (time-delay), and can touch
  third-party systems (OAST). That is `C4/C5` and out of v1 and, for production, prohibited outright. The honest alternative
  is to report the *signal* with its `confirmationLimitation` and let the customer verify with their own tooling or static
  evidence (011 `CODE_FLOW`) — which is why the evidence preference order is static → spec-derived → bounded canary → response
  observation (FR-105).
- **Why a harmless alphabet**: a closed alphabet makes safety *lintable* (registry loader rejects any payload outside it, SG6),
  makes probes reproducible, and prevents the probe corpus from becoming an attack tool or a payload download surface
  (Principle II). `fh12ab"'<>`-style markers detect *reflection and escaping context* without being executable.
- **Alternatives**: curated exploit payload corpora — rejected (executable, dual-use, runtime download); time-based blind
  detection — rejected (degradation, race/DoS shape, FR-118); OAST callbacks — rejected v1 (FR-080: Fahes must not cause
  requests to prohibited destinations; third-party exposure); fuzzing — rejected (FR-102).
- **OWASP/CWE mapping approach**: each check carries **static** `cwe[]` and `owaspTags[]` declared in the registry at check
  version time, treated as *taxonomy labels for coverage and filtering only* (R14) — not as proof of compliance and never
  inferred at runtime or by AI. Coverage is stated in terms of **executed checks**, not "OWASP Top 10 covered" (the marketing
  claim is DEPRECATED, R1).
- **Severity derivation rationale**: severity is derived by a deterministic table from `(check default severity, confidence,
  environment, exploit prerequisites, asset-criticality hint)` and kept **separate from confidence** (FR-138). `LIKELY` never
  exceeds HIGH; `CONFIGURATION_RISK` never exceeds the check cap; `INFORMATIONAL` is INFO. **CVSS vectors are attached only
  when every base metric is determinable from evidence**; otherwise omitted — Fahes cannot know attack complexity, privileges
  or business impact for a black-box signal, and an invented vector is a fabricated precision (Principle IX). Business impact
  and asset criticality are customer inputs, never inferred. Product *security score* is unchanged by 012 (FR-142).

---

## R14: Standards and background (taxonomy references only)

These are cited as **taxonomies for check tags and coverage vocabulary**, not as claims that 012 achieves compliance with them.
No external fact below is derivable from the repository except where stated; version numbers and exact category lists are
`UNVERIFIED` here and must be confirmed against the primary documents at implementation time.

- **OWASP ASVS** (Application Security Verification Standard) — requirement-chapter taxonomy usable as a tag namespace for
  auth, session, access-control, API and business-logic checks. Edition/version: `UNVERIFIED`.
- **OWASP API Security Top 10** — category taxonomy (object-level authorization, broken authentication, excessive data
  exposure, function-level authorization, security misconfiguration, etc.) usable for `owaspTags`. Edition/year: `UNVERIFIED`;
  category *names* are not reproduced here to avoid asserting an unverified list.
- **OWASP WSTG** (Web Security Testing Guide) — test-scenario taxonomy usable to name check families and to justify *what a
  bounded test should observe*. Version: `UNVERIFIED`.
- **CWE** — weakness identifiers attached statically per check (e.g. an identifier for broken access control, missing
  attributes on a security-relevant cookie). Specific ids are chosen per check at implementation; none asserted here
  (`UNVERIFIED`).
- **OSV schema** (open source vulnerability format: advisory id, aliases, affected ecosystem/package, version ranges
  `introduced`/`fixed`, severity, references) — the planned `AdvisorySnapshot` import format (P4); exact schema version and a
  signed-distribution mechanism are `UNKNOWN — REQUIRES INVESTIGATION`. The repository's own `Advisory` type (`package,
  fixedIn, introducedIn?, id, severity, summary`, `advisories.ts:25-34`) is a strict subset and shows the fields the matcher
  already needs.
- **Repository-derived background (verifiable)**: the existing capabilities' check ids use dotted namespaces (`headers.*`,
  `owasp.*`, `ssl.*`, `dependency.*`); 012's `sec./auth./authz./api./logic./dep.` namespaces (FR-146) extend that convention.
- **Not cited**: no CVSS scoring formulas, CVE counts, or statistics are asserted.

---

## R15: Alternatives rejected log

| # | Alternative | Rejected because | Where it could return |
|---|---|---|---|
| 1 | **New execution class** (composite or "SECURITY_FULL") | 007 FR-006 per-class authorization; 008/009 amendments; ambiguous retry/queue/priced unit (R6) | Never needed if linked units suffice |
| 2 | **New `ModuleType`** (API, AUTH, AUTHZ, LOGIC) | Reuse `SECURITY`; facets inside the result; no pricing change (Clarifications; ADR-005) | Only if product/pricing wants separate SKUs (F06) |
| 3 | **New Target kind for APIs** | WEB-kind destination suffices; cross-domain APIs need their own Target+grant; avoids 007 amendment (AR-3 asks owner to confirm P10) | If owner decides APIs are a distinct Target kind |
| 4 | **Live advisory lookup during a scan** | Violates Principle II (vendored/offline), leaks dependency inventory to a third party, non-reproducible, availability coupling | Never in scan path; refresh stays an operator import |
| 5 | **OAST / out-of-band interaction testing** | Would make Fahes (or the target) contact uncontrolled/third-party hosts; conflicts with FR-080 and SSRF posture; unsupported `SEC_OOB_UNSUPPORTED` | A future spec with a controlled callback service and its own authorization |
| 6 | **Authenticated browser testing** (storage-state injection) | 010 defines zero-state browser contexts and no injection primitive (AR-2); screenshots/HAR unredacted (010 FR-046) | AR-2 amendment + 010 redaction upgrade |
| 7 | **Race-condition / concurrency testing** | Flood/DoS-shaped; `C4`; belongs to load/capacity (SPEC 013); bounded repeats (≤ 3) cover idempotency/quota invariants only (FR-118) | 013 with its own authorization class |
| 8 | **Customer scripts for business invariants** | Executing customer code violates Constitution XI/V and FR-068; closed declarative predicate set is deterministic and reviewable (FR-115) | A future isolated-execution spec; still not with credentials |
| 9 | **Automatic cleanup after stop** | Defeats the kill switch; admission is refused post-stop (R11) | Never; manifest + customer action instead |
| 10 | **Reusing `token-vault.ts`/shared `ENCRYPTION_KEY`** | Same over-privileged key the worker already holds (R2) | Pattern reuse only |
| 11 | **Fuzzing / payload corpora** | Dual-use, executable, runtime download; breaks Principle II and FR-102 | Never in v1 |
| 12 | **Production active testing** | 007 FR-015a prohibits; no evidence for an amendment | Evidenced 007 amendment only |
| 13 | **Fahes-generated test accounts / credential discovery** | Violates "never creates, guesses, harvests or brute-forces" (P1) | Never |
| 14 | **TOTP-seed storage / OTP interception for MFA** | Expands secret scope and legal surface; v1 supports MFA-exempt identities and pre-established session fixtures (P3) | Dedicated MFA spec |
| 15 | **GraphQL/gRPC/SOAP/WebSocket support in v1** | OpenAPI REST first (P6); each protocol needs its own probe grammar and harmless alphabet | Follow-on specs |
| 16 | **Cross-unit session passing** (resume E15 session in E14) | Moves a live secret across a queue/DB boundary; violates FR-062 | Never |

---

## R16: Reconciliation rulings summary

The planning pass raised ~40 contradictions and proposals; each has a lead ruling in `reconciliation-log.md` (L1-L40), carried into
`spec.md` (FR-001..FR-199) and `plan.md` (83-code `SEC_*` registry, P1-P18). The five most consequential:

| Ruling | Effect |
|---|---|
| **L1** | `DEGRADED` modules are scored from findings with a mandatory `coverageComplete:false` marker and coverage summary; no consumer may present them as complete/pass; `NOT_APPLICABLE` (null score) only with no real result; no cap (P13 OWNER-APPROVED 2026-10-11). Amends FR-142/SC-003. |
| **L2** | Dual-class rule FR-161: a credentialed crafted request in E14 is checkpointed under both `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW`; uncrafted credentialed replays are single-class E15; AR-10 RECOMMENDED. |
| **L3** | FR-162: residual manifests and `SESSION_UNCONFIRMED` records are written by the parent-side finalizer from durable `MutationIntent`, exempt from the unit fence, idempotent, no requests (resolves the C-1 fenced-writer contradiction). |
| **L8** | Credential lease cap = min(unit timeout + margin, 30 min); non-renewable, no re-lease (FR-033, P12); replaces the 15-minute cap. |
| **L27** | Empty `includedActionCategories` = READ + NEGATIVE_PROBE only (012-defined; 007 gives the field no semantics); non-empty = closed allow-list. |

## Open for closure

Resolved items from the former "Proposed additions" section are listed here with their rulings; anything not in the log stays open.

- Advisory table size: **L25** - corrected to 7 (this file's R1 row now says 7).
- Residual manifest vs fenced writer: **L3 / FR-162**.
- OpenAPI "Artifact" and `AdvisorySnapshot` payload storage: **L21 / FR-168** (`ApiDescriptionDocument`, `advisory-snapshots/<digest>`).
- Account deletion vs zero-relation rule: **L22 / FR-167**.
- Data-model proposals P-2 (API wrap-only), P-3 (7-day grace), P-4 (35-day backups / per-tenant keys), P-5 (`CredentialSecretKind`), P-6 (lease purposes `LOGIN`, `SESSION_REFRESH`, `API_AUTH`), P-12 (vault DB roles): **L23**. P-9 `lengthClass` buckets XS-XL: **L33**.
- Ordering requirement (commit 009 U-1 and 011 before freezing 012) and KMS-provider investigation items (unwrap-only IAM, key versioning, audit, per-tenant KEK, wrap-only API permission, transit-style provider): remain `UNKNOWN - REQUIRES INVESTIGATION` (plan P11 / SG3), not rulings.

Still open (no ruling in the log), owner questions:
- Hashes in evidence: RESOLVED — FR-128(d) allows only a non-secret structure hash; FR-131 indicators contain no value, prefix, suffix or hash.
- D8 mutation state vs separate cleanup enum: model as `state x cleanupState` (data-model C-7) - owner: confirm?
- Data-model proposals P-1 (login-flow definition location), P-7 (`TestRole.privilegeTier`), P-8 (per-mutation-class consent storage), P-10 (audit action vocabulary), P-11 (derived-evidence fencing statement), P-13 (vault lock order), P-14 (advisory snapshot retention/partitioning) - owner: resolve in data-model or amend?
- Cross-unit auth-attempt ledger as future hardening under AR-4 if measurement shows per-unit caps insufficient (R8) - owner: defer?

## R17 — Blocker-repair design decisions (2026-10-11)

**Decision A (B-1, reworked in the third pass): Verified Address Binding = hostname proof over validated TLS + plain-HTTP address-control proof + SPKI pin, per unit; it proves control of the serving address, not origin ownership.** *Rationale*: a hostname proof shows only that the tenant controls what a name serves; requesting the same token with `Host: <ip>` over plain HTTP port 80 succeeds only if the tenant controls the address's default virtual host, which shared edges, CDNs and PaaS tenants cannot do. TLS cannot authenticate an IP literal, so the address-control channel is unauthenticated (stated limitation) and is mitigated by the TLS-authenticated hostname proof, the recorded SPKI pin and 5-minute re-proof; the probes themselves always keep full TLS validation (no downgrade). HTTPS-only destinations with no default virtual host on port 80 are refused (`NO_DEFAULT_VHOST`); that product impact is accepted. *Alternatives rejected*: customer-declared expected addresses (the attacker declares the victim's IP); a consent checkbox for shared edges (attestation alone cannot establish third-party authorization); a provider-policy registry (needs curated provider facts that cannot be verified here). *Residual (not closable by proof)*: a tenant-controlled reverse proxy or forwarder passes both proofs and can relay probes to a third party; this is handled by the Destination Authorization Policy (Decision G), never by a claim of ownership.

**Decision B (B-2): the API Plan Resolver signs; workers hold no key.** *Rationale*: 009 places the Plan Resolver in `apps/api`; the broker needs a trust anchor a worker cannot forge. *Rejected*: signing in the worker (worthless stamp), relying on DB roles alone (not recorded in any contract; kept as AR-13 defense in depth).

**Decision C (B-5, reworked in the third pass): structured-request-frame egress gate with gate-side canonical HTTP serialization.** *Rationale*: the child has no network path and never emits HTTP bytes; it sends closed-schema request frames and the parent gate generates all framing (`Content-Length`, `Connection: close`, one request per connection), so request smuggling, desync and pipelining are unrepresentable and the internal single-use permit never leaves the parent. *Rejected*: a host-set-only proxy (cooperative child), child-framed bytes forwarded by a re-originating gate (the gate would have to parse and trust child framing), per-connection permits with an opaque CONNECT tunnel (pipelining inside the tunnel), moving all HTTP I/O into the parent including response parsing (hostile parsing next to the DB and broker channels). *Risk*: unproven. T650 is a mandatory feasibility gate (per-request TLS handshake cost, response streaming, OS egress denial, TLS-stack exposure parent versus isolated helper); if it fails active and authenticated execution stays disabled until a replacement design passes a new independent review.

**Decision D (B-3): keep observed `DEGRADED` scores, gate every decision consumer.** *Rationale*: `aggregate.ts` documents that nulling a computable score inflates the overall; the failure is consumers deciding on the number. The owner approved this direction (P13).

**Decision E (B-11): signed external checkpoint, not a database-resident counter.** *Rationale*: a restored database cannot be trusted to remember it was restored. *Open*: the store (P11 deferred).

**Decision F (B-9): group barrier, not upsert-wins.** *Rationale*: 009 materialization is first-writer-wins; any rule depending on update-on-conflict is unimplementable without changing 009.

## R18 — Third-repair-pass design decisions (2026-10-14)

**Decision G (N2-2): Destination Authorization Policy instead of a proof claim.** *Rationale*: no network proof distinguishes an owned origin from a tenant-controlled forwarder to a third party, so authorization is an explicit policy (VAB `DIRECT_PROVEN` + origin-ownership warranty + operator `ActiveTestingEnablement` + containment controls) with a fail-closed default; an attestation alone is accountability, never proof. *Rejected*: treating shared-edge attestation as sufficient (the first-pass design), claiming forwarder detection. *Open*: P16.

**Decision H (N2-4): admission order Phase A (reads) -> Phase B (releasable reservations) -> Phase C (F07 consume, last).** *Rationale*: F07 request consumption is cumulative and non-returnable, so every side-effect-free check must precede it and every reservation must be releasable.

**Decision I (N2-5): auth-attempt reservation state machine RESERVED -> SENT -> RESOLVED.** *Rationale*: counting a reservation as a failure on crash would let an unsent attempt lock an account out; counting nothing would let a crash reset the counter. Only SENT attempts are conservatively counted.

**Decision J (N2-7): anomaly detection keyed per worker principal.** *Rationale*: a per-tenant-only rule is evaded by spreading across tenants; per-principal rules R1-R6 plus the R7 tenant quota (quota enforcement, never principal-misbehavior evidence, so one tenant's volume cannot quarantine a principal) plus durable breach-streak quarantine bound the blast radius of a compromised worker; thresholds stay unmeasured until T523.

**Decision K (N2-6): execution-class-level settlement (P17, proposed).** *Rationale*: area-count refunds cannot express partial execution of a class; a per-class charge `floor(price x executed / planned)` is idempotent via `SecuritySettlement`. Conflict with ADR-005 is AR-17 (billing for active/authenticated classes stays disabled).

**Decision L (N2-10): transaction-based single writer.** *Rationale*: Prisma cannot express a conditional upsert update clause; insert-if-absent plus a guarded `updateMany` (legacy) and a `SELECT ... FOR UPDATE` transaction (finalizer) are implementable.

**What this research does not establish**: runtime feasibility of the egress gate (T650), OS egress denial, the checkpoint store and KMS (P11 deferred), and F06 pricing remain unproven gates.
