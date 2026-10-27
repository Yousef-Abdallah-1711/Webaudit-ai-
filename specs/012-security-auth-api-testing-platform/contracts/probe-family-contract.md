# Contract: Probe Families (injection, XSS, CSRF, SSRF-destination-safety, security configuration)

## Status / Ownership

**Status**: PLANNING — NOT FROZEN. **Ownership**: Contexts D (passive analysis), E (E14 probes) and H (per-operation application) of SPEC 012. Definitions are vendored registry data (`packages/security-registry/`, FR-066, FR-146); static/passive checks run parent-side (Security Check Evaluator, FR-147); crafted probes run in E14 `ACTIVE_SECURITY` units (non-production only). This contract states **abstract probe classes and the closed inert alphabet only; it contains no payload strings and none may be added to any contract or fixture description** (fixtures reference alphabet class ids).

Per FR-079..FR-085, FR-105..FR-113 (primary), plus FR-006..FR-012, FR-055..FR-057, FR-066/067, FR-069..077, FR-086, FR-100..104 (pointers), FR-127..135, FR-136..141, FR-146..150, FR-151..153, FR-161 (dual-class), FR-163/FR-164/FR-165/FR-169. Reasons only from the plan.md closed `SEC_*` registry or upstream passthrough.

## Consumers

- Security Check Evaluator and `materializeFinding` (009); `api-security-check-contract.md` (applies these families per operation: `api.cors.*`, `api.hdr.*`, `api.err.*`); `authorization-testing-contract.md` (shares fixture/oracle machinery for CSRF fixtures); `auth-session-contract.md` (cookie/session attributes); `security-coverage-contract` (probe families executed); `security-reverify-contract` (one probe family per plan, FR-151).
- Upstream facts consumed: 010 `browser-execution-contract.md` (`BROWSER` units, evidence `DOM_NODE`, `CONSOLE_MESSAGE`, `HAR`; fresh zero-state, unauthenticated), `crawler-contract.md`, `page-identity-contract.md`; 011 `source-evidence-contract.md` / `static-analysis-contract.md` (`SOURCE_SURFACE` incl. `externalHttpCallSites[]`, `CODE_FLOW`, `DEPENDENCY`); 011 `source-correlation-contract.md` (`RouteIdentity`).

## Inputs

- Passive `HTTP_TRANSACTION`/`HAR` Evidence (ordinary responses, already redacted); 010 DOM/console Evidence for unauthenticated pages; 011 static Evidence (`SOURCE_SURFACE`, `CODE_FLOW`); `API_SURFACE` rows (parameter types, `urlTyped`) with `probeEligible`.
- For C1+ probes: ACTIVE grant, non-production environment, action categories (`NEGATIVE_PROBE`, `READ`; `FIXTURE_MUTATE` for CSRF mutating fixtures), probe definitions (registry), customer fixtures (CSRF comparison endpoint, registered identity), per-op local budgets.
- Vendored **versioned** classifiers: reflection-context classifier, engine-error signature classes (class names only), sensitive-field/secret-shape classifier (`@webaudit/redaction` detectors), header/value parsers (CSP, HSTS, `Set-Cookie`, CORS, cache-control).

## Outputs

- `SECURITY_CHECK_RESULT` per `(checkId, checkVersion, scopeKey[, probeIndex])` with FR-136 verdicts; `HTTP_TRANSACTION` (sanitized) from E14; Findings for the four finding verdicts only (FR-139); `Issue.location = METHOD + https://host/path-template` (FR-145); fingerprint parts `[checkVersionMajor, normalizedPathTemplate, METHOD, identityRole?, parameterName?, probeFamily]` with the check's (or its `rootCauseGroup`'s canonical) `checkId` passed separately to `fingerprintOf` (FR-141, L6); `SECURITY_REPRODUCTION` for `CONFIRMED` only (template ids + outcome classes).
- Result payload essentials: `probeFamily`, `canaryShapeId?`, `reflectionContext?`, `signatureClass?`, `confirmationLimitation ∈ {NONE, REQUIRES_DATA_DEPENDENT_BEHAVIOR_CHANGE, REQUIRES_BROWSER_EXECUTION, REQUIRES_CROSS_SITE_BROWSER_CONTEXT, REQUIRES_STATE_CHANGE, REQUIRES_PROHIBITED_DESTINATION, REQUIRES_OOB_INTERACTION}`, `contextDependent: bool`, `baselineCompared: bool`, `requestCount`, scope statement inputs (FR-137).

## Operations

```text
evaluateStaticFamily(familyId, committedStaticEvidence) -> SECURITY_CHECK_RESULT[]                     // C0, parent-side, pure/synchronous
evaluatePassiveConfig(committedHttpEvidence) -> SECURITY_CHECK_RESULT[]                               // C0, headers/cookies/CSP/HSTS/cache/disclosure
planFamilyProbes(familyId, apiSurface|pageSurface, grants, env, localLimits) -> FamilyProbePlan        // pure; preference order, eligibility gate
renderCanary(shapeId, probeIdentity) -> Canary | LintRefusal                                           // deterministic; closed alphabet; lint at load AND at render
runFamilyProbes(unit: ExecutionUnit{ACTIVE_SECURITY}, plan) -> HTTP_TRANSACTION[]                      // E14; FR-055 request order unchanged
evaluateActiveFamily(committedEvidence, plan) -> SECURITY_CHECK_RESULT[]                               // pure; ladders in inv. 6-14
```

Ordered steps (per family): (1) apply the **preference order** (inv. 1) and stop at the first rung that yields a decision or is the highest rung the target/grant permits; (2) classify mechanically (FR-007) — rungs 1-2 and rung 4 over already-fetched data are `C0`, rung 3 is `C1`/`C2`; (3) eligibility gate (api-security-check-contract.md inv. 1 reused verbatim); (4) render canary from a registered shape id with a per-probe `ID` (inv. 3-5); (5) send under FR-055 order, **plus a paired baseline request without the canary** when the ladder needs a differential (inv. 7); (6) bounded read, parse in memory, classify, redact, record; (7) evaluate and write `SECURITY_CHECK_RESULT`.

## Check catalog

| Family | Check-id prefix | Rung ladder | Class | Notes |
|---|---|---|---|---|
| Injection indicators — reflection/quote-error (DB-error observation) | `sec.inj.reflect.*`, `sec.inj.quote-error.*` | static -> spec -> canary -> observation | `C0` static / `C1` canary | active only for the two canary-expressible indicators (inv. 4) |
| Injection (command, template, path-traversal, unsafe deserialization, NoSQL operator forms) | `sec.inj.static.*` | **static and spec-derived only in v1** (011 `CODE_FLOW`/`SOURCE_SURFACE` sinks, parameter-type facts) | `C0` | active variants are registry `UNSUPPORTED` entries with reason `SEC_PROBE_CLASS_UNSUPPORTED` (alphabet cannot express them; L16) |
| XSS | `sec.xss.*` | static sinks -> reflection context -> CSP/headers -> 010 DOM/console evidence | `C0` / `C1` | no exfiltration; unauthenticated browser evidence only |
| CSRF | `sec.csrf.*` (public forms, attributes), `auth.csrf.*` (session-bound; FR-086) | attributes/tokens (passive) -> fixture comparison | `C0` / `C2` fixture-confined | token absence is never "exploitable" |
| SSRF destination safety | `sec.ssrf.*` | static sinks -> spec-typed params -> in-scope response analysis | `C0` / `C1` | Fahes never requests a prohibited destination; OAST `UNSUPPORTED` |
| Security configuration | `sec.cfg.*` (`csp-*`, `hsts-*`, `cookie-*`, `hdr-*`, `cors-*`, `method-exposure`, `debug-disclosure`, `cache-control`, `sensitive-endpoint`, `tls-*`) | passive observation -> crafted-Origin C1 where defined | `C0` / `C1` | separation in inv. 15 |
| Secret-in-response exposure | `sec.leak.*` (reuse/extend `data-leak-scanner`, FR-113) | passive observation | `C0` | exposure indicator only (inv. 18) |
| Dependency advisories | `dep.*` | **not owned here** | `C0` | see `advisory-matching-contract.md`; inv. 20 |

## Invariants

### Preference order and alphabet

1. **Preference order (FR-105).** For injection/XSS/SSRF-class families the evaluator MUST attempt, in order: (1) static evidence (011 `SOURCE_SURFACE`/`CODE_FLOW`), (2) spec-derived expectations (`API_SURFACE` parameter/type/format facts), (3) harmless bounded canary inputs, (4) non-destructive response observation of what was sent in (3) or already captured. A lower rung is not run when a higher rung already yields a decisive verdict **and** the check declares `stopOnDecisive:true`; every skipped rung is recorded (coverage). Rung 3 requires `ACTIVE_SECURITY` + non-production; absent that, the result for the active half is `BLOCKED` with the closed reason while rungs 1-2 and passive rung 4 still report.
2. **Closed inert canary alphabet (v1, FR-105).** A canary is exactly one of the registered **shape ids**:
   - `PLAIN_TOKEN`: the token alone;
   - `QUOTE_MARKERS`: the token followed by exactly one double-quote character and exactly one single-quote character;
   - `ANGLE_MARKERS`: the token enclosed in one left and one right angle-bracket character;
   - `COMBINED_MARKERS`: the token followed by the quote markers and enclosed in the angle-bracket pair.
   The token is `fh<ID>` where `ID` is 8 lowercase base-32-alphabet characters derived deterministically from `(planId, checkId, checkVersion, apiIdentity, parameterName, probeIndex)` (unique per probe; used to find the reflection of *this* probe only). The permitted characters of a rendered canary are exactly `a-z`, `0-9`, `"`, `'`, `<`, `>`; total length <= 48.
3. **Canary lint (registry load, SG6, and again at render).** A canary or probe is rejected (load error; at render time: request never sent, check `BLOCKED`/`SEC_SCOPE_GATE_ERROR`, fail closed) if it: contains any character outside inv. 2; contains any run of letters other than the single `fh<ID>` token (no tag names, event names, function names, keywords, schemes, extension names, protocol words); contains whitespace, control characters, or more than one token; contains any character that could separate or chain commands or statements, introduce an expression/interpolation/template delimiter, reference a path, file, drive, URL, host or network location, encode another character, or terminate a line; encodes a delay, sleep, loop, arithmetic or boolean-logic construct; or names a data-extraction construct. The lint is a positive allow-list (inv. 2) **plus** a named negative fixture per forbidden *class* above (fixtures state the class, not an example string).
4. **Alphabet reach is deliberately small.** Because the alphabet has no separators, no path or expression characters and no braces, it can express only: *reflection/escaping context* (XSS-style markers) and *quote-handling error behavior* (SQL/NoSQL-style parse errors). Command injection, template injection, path traversal, unsafe deserialization and NoSQL operator abuse **cannot** be actively probed in v1 and are `UNSUPPORTED`-active (`SEC_PROBE_CLASS_UNSUPPORTED`, FR-106, L16) with static/spec-derived indicators only. This is a named limitation, not a gap to be patched by widening the alphabet silently.
5. **Placement.** A canary is placed only into a parameter/field that the operation schema or observed page declares as user-controlled string input (query, path-slot-for-fixture-only, body field, declared header from the closed header set FR-066), one parameter per probe, one shape per probe; all other fields carry valid baseline values. Probes are data (FR-066); max 8 requests per endpoint including baselines (api-security-check-contract.md inv. 8).

### Verdict ladders (FR-106)

6. **Reflection / XSS-context ladder.** The reflection classifier (deterministic, vendored, versioned) parses the *baseline-unaware* response *in memory* and assigns the reflected token one context class: `HTML_TEXT`, `HTML_ATTR_DQ`, `HTML_ATTR_SQ`, `HTML_ATTR_UNQUOTED`, `SCRIPT_STRING_DQ`, `SCRIPT_STRING_SQ`, `URL_CONTEXT`, `NON_HTML_BODY` (e.g. JSON/plain text), `HEADER`, `NONE`. Marker handling is classified `RAW` (marker characters unchanged) or `NEUTRALIZED` (encoded/removed). Ladder:
   - `LIKELY_VULNERABILITY` — token reflected with a **RAW marker that is significant in that context** (angle markers raw in `HTML_TEXT`; double-quote raw in `HTML_ATTR_DQ`/`SCRIPT_STRING_DQ`; single-quote raw in `*_SQ`; any raw marker in `HTML_ATTR_UNQUOTED`) in a response whose content type is an HTML document type. Never `CONFIRMED` (`confirmationLimitation: REQUIRES_BROWSER_EXECUTION`, FLAG `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` because proof would require executing script in a victim context).
   - `NO_ISSUE_DETECTED` — token reflected with all significant markers `NEUTRALIZED`; scoped statement.
   - `INFORMATIONAL` — token reflected raw in `NON_HTML_BODY`/`HEADER`-free contexts (reflection without an executable context).
   - `NO_ISSUE_DETECTED` (scoped "canary not reflected in executed probe") when the token is absent from the response — **never extended to stored/second-order reflection, which is not tested** (named limitation).
   - `INCONCLUSIVE` / `SEC_RESPONSE_AMBIGUOUS` when the response is truncated at the body-read cap before the reflection can be assessed, transport error, or content type undeterminable.
7. **Quote-error ladder (DB error signature).** A paired baseline (no markers) and a `QUOTE_MARKERS` request are sent. Verdicts:
   - `LIKELY_VULNERABILITY` — the marker response contains an engine-error **signature class** from the vendored list (class names such as relational-engine syntax error, document-engine parse error; matched against structure/classes, never stored verbatim) that is **absent from the baseline**. **Never `CONFIRMED`** (confirmation would need data-dependent behavior change, `confirmationLimitation: REQUIRES_DATA_DEPENDENT_BEHAVIOR_CHANGE`, FLAG `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY`).
   - `INCONCLUSIVE` / `SEC_SIGNAL_WEAK` — generic 5xx or unspecific error, a signature already present in the baseline (benign page that mimics one), or an error whose class cannot be matched.
   - `NO_ISSUE_DETECTED` — marker response equals the baseline response class/shape or a documented validation rejection (4xx with schema-conformant error), scoped.
   - Engine identity (which DBMS) is recorded as a class only when unambiguous; it never raises severity.
8. **Differential rule.** Any ladder rung that depends on "the canary caused X" requires a baseline request; if the baseline cannot be obtained (budget, error) the maximum verdict is `INCONCLUSIVE`/`SEC_SIGNAL_WEAK`.
9. **Severity caps (FR-138).** `LIKELY` injection/XSS indicators: default cap MEDIUM unless the check declares a different cap in the registry (never above HIGH); `CONFIGURATION_RISK` per check cap; AI never sets severity.
10. **XSS non-exfiltration (FR-107).** No XSS probe includes script, event handlers, cookie access, network calls, DOM mutation, form submission or any action on behalf of a user. DOM source->sink indicators come **only** from committed 010 evidence of unauthenticated `BROWSER` units (`DOM_NODE`, `CONSOLE_MESSAGE`, `HAR`) and 011 sinks; 012 starts no browser of its own (FR-085, FR-155) and captures no authenticated page evidence (FR-133). CSP observations are passive (inv. 15).

### CSRF (FR-108)

11. **CSRF fixture comparison.** Allowed only against a customer-registered `FixtureResource` endpoint that is non-mutating or fixture-confined (mutating => `C2`, `FIXTURE_MUTATE`, consent, write-ahead intent, cleanup per `mutation-cleanup-contract`; default OFF). Variants executed for **one registered identity session** (own lease): (V0) valid baseline with token/origin as the application expects; (V1) same request without the CSRF token; (V2) same request with the inert foreign Origin form (inv. 17, FR-110). Because V1/V2 are credentialed *crafted* requests, the unit is E14 and every request in it is checkpointed under the dual-class rule (FR-161): primary `ACTIVE_SECURITY` plus secondary `AUTHENTICATED_WORKFLOW` with `consumes{request:false, concurrency:false}`; V0 in the same unit is conservatively dual-checkpointed too. Evaluation by shape oracle (fixture marker or state readback), never status alone.
    - `LIKELY_VULNERABILITY` (indicator) — V1 **or** V2 accepted (same oracle result as V0) while V0 accepted. Never `CONFIRMED`: no real cross-site browser context is exercised (`confirmationLimitation: REQUIRES_CROSS_SITE_BROWSER_CONTEXT`); `SameSite`/browser behavior may block it in practice (stated).
    - `NO_ISSUE_DETECTED` — V1 and V2 rejected, V0 accepted, scoped.
    - `INCONCLUSIVE` / `SEC_FIXTURE_LIMITATION` — V0 not accepted, no fixture endpoint, or oracle `NONE`.
    - Token absence, missing `SameSite`, or missing Origin/Referer enforcement *observed passively* is `CONFIGURATION_RISK` (MEDIUM cap) or `INFORMATIONAL` — **never** "exploitable CSRF". No destructive operation is ever triggered to "prove" CSRF.

### SSRF destination safety (FR-079..FR-083)

12. **No prohibited-destination requests.** Fahes MUST NOT request, resolve, or ask a target to fetch cloud metadata, link-local, loopback, RFC1918/private, alternate IP encodings, IPv6-mapped or zone forms, rebinding-prone names or proxy-tricked destinations to test SSRF. Every request destination (initial, redirect hop, URL embedded in a probe) passes `isInScope` via `safetyCheckpoint` **and** safe-net layers 1-4 **unchanged**; 012 adds no allow-list and never sets `SAFE_NET_ALLOW_TARGETS` outside tests (FR-079). Redirect, DNS-rebinding, IPv6, alternate-IP, metadata and proxy handling is delegated wholly to safe-net's connect guard; this contract adds only the 012 redirect policy (cross-origin not followed, a same-origin hop followed only as a planned `REDIRECT_HOP` step of a declared `READ_ONLY` operation, FR-200(e), credentials never forwarded off-origin, FR-081).
13. **SSRF indicators are limited to**: (a) static — 011 `SOURCE_SURFACE.externalHttpCallSites[]` and `CODE_FLOW` showing a request parameter reaching a URL-fetching sink without a recorded allow-list; (b) spec-based — `API_SURFACE.parameters[].urlTyped` (`format: uri`, URL-typed names); (c) **in-scope response analysis**: an `ACTIVE_SECURITY` probe may submit, to a `urlTyped` parameter, only a URL whose host and path come from `API_SURFACE` authorities already `IN_SCOPE` (the Target's own host and an existing eligible `GET` operation path) and observe whether the response behaves as if the server fetched it (shape/status/content-class change vs a baseline). This is the first of the two named alphabet exceptions to inv. 3 (a network-looking value; FR-080(i), L16) and is lint-restricted to values constructed from `API_SURFACE` and passed through `isInScope` before render; a value that fails `isInScope` or any safe-net class is never rendered (SEC_DESTINATION_PROHIBITED).
    - Ladder: static flow with parameter reachability => `LIKELY_VULNERABILITY` (cap MEDIUM; `confirmationLimitation: REQUIRES_PROHIBITED_DESTINATION`); spec-typed only => `CONFIGURATION_RISK` or `INFORMATIONAL`; in-scope fetch behavior observed => `CONFIGURATION_RISK` ("server fetches user-supplied URL; allow-listing unverified"); no behavior => `NO_ISSUE_DETECTED` scoped; never `CONFIRMED` (impact needs a prohibited destination).
14. **OAST/out-of-band interaction is `UNSUPPORTED`** (`SEC_OOB_UNSUPPORTED`): no callback infrastructure, no DNS/HTTP canary listener, no blind-SSRF/blind-injection/blind-XSS detection. Third-party resources reached by a page (scripts, APIs, CDNs, URLs found in responses) are **never probed**; they appear only as passive CSP/CORS/observation facts (FR-082). A URL found in a response or spec is never a destination (FR-083).

### Security configuration (FR-109, FR-110)

15. **Separation of outcomes.** Configuration checks classify each observation into exactly one of: `CONFIGURATION_RISK` (misconfiguration observed from parsed values — e.g. weak CSP directive set, missing/short HSTS, cookie lacking attributes, permissive header combinations, debug/stack disclosure, shared-cache of sensitive responses); `INFORMATIONAL` with `contextDependent:true` (the value is risky only in a context Fahes does not know, e.g. a policy keyword on a purely static public page; promoted to `CONFIGURATION_RISK` only when the customer has declared the endpoint sensitive/authenticated or a registered identity session observed it); `CONFIRMED_VULNERABILITY` (only where the registry entry declares `confirmable:true` and a fixture-confined oracle observed proof — none of the v1 passive config checks are confirmable); `NO_ISSUE_DETECTED` (scoped, parsed values meet the check's rule). Checks parse **values**, not presence (Spec US1). Severity <= check cap, MEDIUM for most, <= HIGH (FR-138). CWE/OWASP tags static per check.
16. **TLS and certificates.** TLS-*visible* facts from the ordinary passive fetch (scheme, redirect-to-HTTPS behavior, HSTS header, mixed-scheme references, fetch-level TLS error class if safe-net reports one) are `C0`. **Real TLS inspection** (protocol versions, cipher suites, chain, expiry, SAN) requires a guarded raw-socket facility in safe-net that does not exist; until built and gated by a distinct task, TLS-detail checks are `UNSUPPORTED` with `SEC_TLS_INSPECTION_UNAVAILABLE` (verdict `UNSUPPORTED`, never `PASS`), and certificate validity is reported only as the fetch-level observation. No check implies a certificate was inspected.
17. **CORS (FR-110).** Passive (`C0`): parse CORS response headers on ordinary captured responses (wildcard with credentials flag, `null` allowed, missing `Vary: Origin` when a specific origin is echoed, overbroad methods/headers, preflight cache). Active (`C1`, non-production, `ACTIVE_SECURITY`): one request per probe carrying a crafted `Origin` from the closed forms `ORIGIN_FOREIGN_INERT` (an origin built as `https://fh<ID>` plus a reserved non-resolvable suffix; **a header value only, never a destination and never resolved or contacted**) and `ORIGIN_NULL`; this is the second named alphabet exception (header slot `Origin` only; FR-110, L16). Ladder:
    - `LIKELY_VULNERABILITY` **only if both** an arbitrary-origin reflection in `Access-Control-Allow-Origin` **and** `Access-Control-Allow-Credentials: true` are observed for an endpoint that a **registered-identity authenticated session** reached (identity-bearing probe; same composite/ lease rules as authorization-testing-contract.md); severity cap HIGH (FR-110, FR-138).
    - `CONFIGURATION_RISK`: arbitrary-origin reflection (or `null` allowed) without credentials, or wildcard where the response is declared sensitive; cap MEDIUM.
    - `INFORMATIONAL`: wildcard on a declared-public, unauthenticated resource.
    - `NO_ISSUE_DETECTED`: foreign/`null` origins not reflected/allowed, scoped.
    Never `CONFIRMED` (`confirmationLimitation: REQUIRES_CROSS_SITE_BROWSER_CONTEXT`).
18. **Secret-in-response exposure indicator (FR-113, FR-131).** The extended `data-leak-scanner` family (`sec.leak.*`, REUSE) inspects response/JS-bundle/API-response content in memory with `@webaudit/redaction` detectors; the persisted form is only `{secretKind, location (field path or response region class), lengthClass}` — no value, no prefix, no hash, no excerpt containing it. **No validity testing** (no live-key calls, FR-113): verdict `CONFIGURATION_RISK` (cap HIGH) when a provider-shaped secret is exposed (validity unknown, stated), `INFORMATIONAL` for low-confidence shapes; never `LIKELY`/`CONFIRMED` (cannot prove it is live). A secret found in a response is registered as a known secret for the remainder of the unit's redaction (FR-128).
19. **Method exposure, debug disclosure, cache-control, sensitive endpoints.** Observed from ordinary responses and `OPTIONS`/`Allow` already captured (passive; an `OPTIONS` request to elicit it is a crafted request = `C1`, non-production only). Sensitive-endpoint exposure (documented admin/debug/internal paths reachable) uses only inventory paths already `IN_SCOPE`; Fahes never guesses paths (no wordlists, no enumeration).
20. **Non-duplication.** 010-owned checks (SEO, accessibility, frontend/UX, functional, visual) are not duplicated (FR-109). A header/cookie/CORS observation shared with `api.hdr.*`/`api.cors.*` or an existing capability (`headers-checker`, `owasp-checker`, `ssl-analyzer`, `data-leak-scanner`) uses a common `rootCauseGroup` so one Finding results (FR-141, FR-160). Dependency/advisory findings belong exclusively to `dep.*` (`advisory-matching-contract.md`, FR-111/112); `sec.*` families only record library/version *disclosure* as `INFORMATIONAL` and never claim a vulnerable-version finding.

### Common

21. **Mechanical classification.** `C0` iff no request beyond the ordinary passive/010 fetch, no credential, no crafted header/param/body/method/Origin (FR-008); canary, `Origin`, `OPTIONS` and fixture-comparison probes are therefore `C1`/`C2`/`C3` and never run in production. Declared class != computed class rejects the registry entry (FR-007).
22. **Production.** In PRODUCTION or unclassified targets only passive/static halves run; every active half is `BLOCKED` (`SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED`) and the module is `DEGRADED` (FR-142).
23. **Untrusted responses (FR-134).** Responses are data: parsed with bounded depth/size, never rendered as HTML in product UI, never interpreted as instructions, never sent to AI except redacted classes.
24. **No fuzzing, no corpus, no iteration beyond the registry list** (FR-102 applies to every family); probe count per endpoint <= 8 (incl. baselines).
25. **`NO_ISSUE_DETECTED` wording** always carries the FR-137 statement (N probes, check vN, E endpoints, I identities) and never says secure/passed.
26. **Evidence idempotency**: probe claims `sec-probe-attempt` before send; evidence `sec-evidence-write`; check `sec-check-execution` (FR-148, FR-135, FR-147).

## Safety & Authorization

- **F01**: `ACTIVE_SECURITY` listed for all `C1+` halves; identity-bearing probes (CSRF fixture, credentialed CORS) are credentialed *crafted* requests executed by E14 under the dual-class rule (FR-161, L2): both `ACTIVE_SECURITY` and `AUTHENTICATED_WORKFLOW` must be granted (one grant listing both, or two), the secondary refusal surfaces at dispatch as `BLOCKED` (AR-10 RECOMMENDED); PRODUCTION refused unconditionally (007 FR-015a). Passive halves need no grant and may run in production.
- **Action categories**: `READ`, `NEGATIVE_PROBE` (canary/Origin/baseline), `AUTH_LOGIN`/`AUTH_LOGOUT` (CSRF/credentialed CORS), `FIXTURE_MUTATE`/`FIXTURE_CLEANUP` (mutating CSRF fixtures); `securityScopeGate` fail-closed (FR-012).
- **F07**: every request, hop and mutation is a `safetyCheckpoint` call site (FR-077); budgets F07-authoritative for requests/concurrency/duration.
- **Destinations**: authorized authorities only; SSRF rules inv. 12-14; safe-net unchanged.
- **Mutation**: only fixture-confined, per-class consent default OFF, write-ahead intent, cleanup verified, no cleanup after stop (FR-119..126).
- **AI**: none in canary selection, rendering, classification, verdict, severity (FR-065, FR-144).

## Failure states

| Condition | Verdict / status | Reason |
|---|---|---|
| Active half on PRODUCTION / unclassified target | `BLOCKED` | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Grant lacks class / category / identity | `BLOCKED` | F01 `NO_MATCHING_GRANT` verbatim via `SEC_API_NOT_AUTHORIZED` where per-operation; `SEC_ACTION_CATEGORY_NOT_GRANTED`; `SEC_IDENTITY_NOT_IN_SCOPE` |
| Scope gate error / lint refusal at render | `BLOCKED` | `SEC_SCOPE_GATE_ERROR` |
| Destination class prohibited / failed `isInScope` | `BLOCKED`; request not sent | `SEC_DESTINATION_PROHIBITED` / F01 `OUT_OF_SCOPE` |
| safe-net refusal | `BLOCKED` | `SEC_SAFE_NET_REFUSED` |
| Redirect off scope | observation; not followed | `SEC_REDIRECT_OUT_OF_SCOPE` |
| Mutating CSRF fixture without consent / not permitted | `BLOCKED` | `SEC_CONSENT_MISSING` / `SEC_MUTATION_NOT_PERMITTED` |
| No CSRF/auth fixture or oracle `NONE` | `INCONCLUSIVE` / `NOT_TESTED` | `SEC_FIXTURE_LIMITATION` / `SEC_FIXTURE_MISSING` |
| Credential state failure | `BLOCKED` | `SEC_CREDENTIAL_*`, `SEC_BROKER_UNAVAILABLE`, `SEC_MFA_*` |
| 429 / `Retry-After` | endpoint paused; `BLOCKED` | `SEC_RATE_LIMIT_ENCOUNTERED` |
| Local budget exhausted | `BLOCKED` | `SEC_BUDGET_LOCAL_*` |
| F07 budget / kill / revocation | per 009; remaining probes `BLOCKED` | `BUDGET_EXHAUSTED_*`, `KILL_SWITCH_PENDING` verbatim |
| Generic 5xx, signature present in baseline, unmatched error | `INCONCLUSIVE` | `SEC_SIGNAL_WEAK` |
| Timeout / reset / truncated / undeterminable content type | `INCONCLUSIVE` | `SEC_RESPONSE_AMBIGUOUS` |
| No committed evidence for a passive check | `NOT_TESTED` | `SEC_NO_EVIDENCE` |
| Confirmation would need unsafe activity | verdict capped; FLAG | `SEC_CONFIRMATION_REQUIRES_UNSAFE_ACTIVITY` |
| Real TLS inspection requested | `UNSUPPORTED` | `SEC_TLS_INSPECTION_UNAVAILABLE` |
| OAST / blind interaction requested | `UNSUPPORTED` | `SEC_OOB_UNSUPPORTED` |
| Active command/template/path-traversal/deserialization/NoSQL/fuzz probe requested | `UNSUPPORTED` | `SEC_PROBE_CLASS_UNSUPPORTED` |
| Evaluator threw or overran | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Parent-side analysis budget exhausted | `BLOCKED` | `SEC_ANALYSIS_BUDGET_EXHAUSTED` |
| Unsupported API/target type | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE` |
| Producer unit failed (010/011) | `BLOCKED` | `SEC_UPSTREAM_PRODUCER_FAILED` |
| SG2/SG6 gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |
| Cleanup failed / unverified (mutating CSRF) | `INCONCLUSIVE`; never `NO_ISSUE_DETECTED` | `SEC_CLEANUP_FAILED` / `SEC_CLEANUP_UNVERIFIED` |

## Idempotency & retry

Probe identity `(planId, checkId, checkVersion, endpointIdentity, identityRef?, probeIndex)` (FR-148); `sec-probe-attempt` claim before send; recovery never re-sends a probe whose `SENT` record exists; `maxAttempts: 1` (FR-057). A retry is permitted only for a probe whose definition declares `idempotent:true` (canary/baseline GETs, `Origin` reads), <= 1 (LOCAL), consuming F07 budget with a new `idempotencyKey`; CSRF mutating variants and any `C2` step are never retried. Passive checks are claim-first, pure and re-runnable; duplicate triggers write nothing new (FR-147).

## Evidence

`HTTP_TRANSACTION` (sanitized: method, path *template*, parameter name, status, header *names* + flagged value classes, body shape, reflection context class, <= 600-char redacted excerpt only if it contains no reflected canary context beyond the token), `SECURITY_CHECK_RESULT`, `SECURITY_REPRODUCTION` (confirmed only; none of these families is confirmable in v1 except fixture-oracle CSRF/authz-style cases the registry explicitly marks), `CLEANUP_RECORD` (CSRF mutating). Canary *shape id and token* are stored (inert); no page body, cookie, token or secret value; exposure indicators per inv. 18; redaction failure writes `{"_redactionFailed": true}` (FR-129); retention parity (FR-132).

## Budgets / limits (F07 vs LOCAL)

- **F07**: requests, concurrency (E14 <= 2 in flight, <= 300 requests/unit provisional), grant expiry.
- **LOCAL (not F07-ledgered, FR-070)**: <= 8 requests per endpoint including baselines; canary length <= 48; probes per family per endpoint = registry-listed shapes only (<= 4 shapes); CSRF comparison <= 3 requests (V0, V1, V2) + readback + cleanup, <= 6 per pair-equivalent; body read <= 256 KiB; total response bytes <= 32 MiB/unit; redirects 0 cross-origin, <= 3 planned same-origin hops; inter-request delay 250 ms (`C1`) / 500 ms (`C3`); retries <= 1 (idempotent only); mutations <= 3/fixture, <= 10/unit; unit `timeoutPolicyMs` 600 000 (E14) / 900 000 (E15 for identity-bearing), margin 60 000.

## Reverify

`FRESH_MINIMAL_PLAN` (FR-152): one probe family, one endpoint, one canary shape, fresh `ID`, routed to the 009 REVERIFY path before the legacy resolver (FR-164), fresh F01 (concrete destination bound from `Issue.location` by `parseSecurityLocation`, method ignored; unbindable => `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE`, FR-163) and F07 admission; identity-bearing reverify is a single E14 unit with dual-class checkpoints (FR-161); passive findings re-evaluated from freshly captured passive evidence (a new single-unit passive plan; production allowed for passive only); identity-bearing probes take fresh leases; CSRF mutating reverify requires current consent and fresh fixture state. `PASSED` only when the executed probe observed the secure behavior (neutralized/rejected/not-reflected with a valid baseline); `FAILED` when the indicator recurs; `INCONCLUSIVE` with the closed reason (credentials, fixture, grant, environment, budget, `SEC_ENDPOINT_GONE`, `SEC_REVERIFY_UNVERIFIABLE`) otherwise, mapped to Issue `UNVERIFIABLE` (FR-164); billing per FR-169 (P14 PROVISIONAL). A stored request or canary is never replayed.

## Boundary rules (MUST NOT)

1. MUST NOT send any character outside the closed alphabet, any executable construct, time-delay primitive, file/network reference (other than the two named exceptions), command separator, or data-extraction construct; MUST NOT add a payload to this contract, a fixture description, or the registry outside the lint.
2. MUST NOT fuzz, mutate randomly, iterate corpora, enumerate paths/parameters/identifiers, or exceed the per-endpoint cap.
3. MUST NOT request, resolve or ask a target to fetch any prohibited destination; MUST NOT weaken safe-net, add allow-list entries, or use OAST/callbacks.
4. MUST NOT probe third-party resources or follow cross-origin redirects; MUST NOT forward credentials off-origin.
5. MUST NOT claim `CONFIRMED` for injection, XSS, CSRF, SSRF, CORS or secret-exposure indicators; MUST NOT report a DB error signature as `CONFIRMED`; MUST NOT treat token absence as exploitable CSRF.
6. MUST NOT exfiltrate, read cookies, run script, submit forms, or act on behalf of a user; MUST NOT trigger a destructive operation to prove CSRF.
7. MUST NOT store response bodies, secrets, cookie/session/CSRF values, reflected page content or secret hashes/prefixes; MUST NOT validate a found secret against its provider.
8. MUST NOT run active probes in PRODUCTION/unclassified targets, in `SOURCE_EXECUTION` Guests, or without fresh F01/F07/scope-gate per request.
9. MUST NOT claim TLS/certificate inspection without the gated facility; MUST NOT report `PASS` for unavailable checks.
10. MUST NOT duplicate 010 checks or claim advisory/dependency findings; MUST NOT use AI for any decision; MUST NOT define new reason codes, kinds, classes or FRs.

## Named limitations

- v1 active injection coverage is limited to reflection/escaping context and quote-handling error behavior; command, template, path-traversal, deserialization and NoSQL-operator injection are static/spec-only (alphabet cannot express them safely).
- Stored/second-order XSS and injection, blind (out-of-band) variants, DOM XSS on authenticated pages and any exploit confirmation are not tested; `NO_ISSUE_DETECTED` means only "no issue in the executed probes".
- A reflection-context classifier and signature-class lists are heuristics; WAFs, custom error pages and content negotiation produce `INCONCLUSIVE`.
- CSRF and CORS indicators cannot be confirmed without a real cross-site browser context; browser `SameSite`/CORS enforcement may block practical exploitation (stated in every such report).
- Real TLS inspection (protocols, ciphers, chain, expiry) is unavailable until a safe-net raw-socket door exists (`SEC_TLS_INSPECTION_UNAVAILABLE`).
- Secret exposure indicates exposure only; validity unknown by design.
- Safe-net coverage of rebinding/IP-encoding/metadata/proxy tricks is exactly what `packages/safe-net` provides; 012 relies on it and adds no extra layer.

## FR traceability

FR-105 (preference order, alphabet), FR-106 (ladders, `confirmationLimitation`), FR-107 (XSS), FR-108 (CSRF), FR-109 (configuration, TLS, non-duplication), FR-110 (CORS), FR-111/112 (dependency pointer), FR-113 (secret exposure), FR-079..FR-083 (SSRF/destinations/redirects/third-party), FR-084/085 (spec offline pointer; browser reuse), FR-006..FR-012 (classification/gate), FR-055..057, FR-066/067, FR-069..077, FR-100..104 (shared API rules), FR-127..135, FR-136..141, FR-146..150, FR-151..153, FR-160 (parallel run), FR-161 (dual-class credentialed crafted requests), FR-163/164/169 (reverify binding/routing/billing), FR-165 (no AI findings), FR-080 (named canary exceptions), FR-170 (not applicable here; advisory freshness is in `advisory-matching-contract.md`).

## Acceptance tests required (named; deterministic; fixture-based; not executed in this pass)

- `T-PROBE-01-alphabet-lint-positive`: every registered shape renders only `[a-z0-9"'<>]`, <= 48 chars, one `fh<ID>` token.
- `T-PROBE-02-alphabet-lint-negative`: one negative fixture per forbidden *class* (executable-script-like construct, delay primitive, file reference, network reference, command-separator class, extraction construct, extra letter run, whitespace/control) — each rejected at load and at render with the request never sent (fixtures describe the class, not a string).
- `T-PROBE-03-reflect-raw-likely`: fixture echoing the canary raw in an HTML text node => `LIKELY`, `confirmationLimitation: REQUIRES_BROWSER_EXECUTION`, never `CONFIRMED`.
- `T-PROBE-04-reflect-escaped`: markers encoded => `NO_ISSUE_DETECTED` with scoped statement.
- `T-PROBE-05-db-error-likely`: baseline clean, quote-marker response with engine-error class => `LIKELY`, not `CONFIRMED`, `confirmationLimitation: REQUIRES_DATA_DEPENDENT_BEHAVIOR_CHANGE`.
- `T-PROBE-06-benign-error-mimic`: error page present in baseline and marker response => `INCONCLUSIVE SEC_SIGNAL_WEAK`.
- `T-PROBE-07-generic-500`: bare 500 => `INCONCLUSIVE SEC_SIGNAL_WEAK`.
- `T-PROBE-08-baseline-required`: baseline budget-exhausted => max verdict `INCONCLUSIVE`.
- `T-PROBE-09-non-html-reflection`: JSON echo => `INFORMATIONAL` at most.
- `T-PROBE-10-preference-order`: static decisive => canary rung not planned (when `stopOnDecisive`); skipped rungs appear in coverage; production => only rungs 1-2 + passive run.
- `T-PROBE-11-csrf-fixture-comparison`: V0 ok, V1 accepted => `LIKELY` (not `CONFIRMED`); V1+V2 rejected => `NO_ISSUE_DETECTED`; token absent only => `CONFIGURATION_RISK`/`INFORMATIONAL`; mutating fixture follows write-ahead/cleanup; no fixture => `SEC_FIXTURE_LIMITATION`.
- `T-PROBE-12-cors-passive-vs-active`: passive-only on production; crafted-Origin only non-production; reflection+credentials on registered-identity endpoint => `LIKELY` cap HIGH; reflection without credentials => `CONFIGURATION_RISK` cap MEDIUM; neither => `NO_ISSUE_DETECTED`.
- `T-PROBE-13-ssrf-never-prohibited-destination`: spy asserts zero requests/DNS to metadata, loopback, private, alternate-encoding, IPv6-mapped and rebinding fixtures; URL-typed parameter probe renders only `IN_SCOPE` values; failing value never rendered.
- `T-PROBE-14-ssrf-oast-unsupported`: blind/callback check => `UNSUPPORTED SEC_OOB_UNSUPPORTED`; no listener exists.
- `T-PROBE-15-third-party-never-probed`: page referencing third-party hosts => observations only; zero requests.
- `T-PROBE-16-tls-unavailable`: TLS-detail check => `UNSUPPORTED SEC_TLS_INSPECTION_UNAVAILABLE`; fetch-level observations only; never PASS.
- `T-PROBE-17-config-separation`: fixtures for each of CONFIGURATION_RISK / context-dependent INFORMATIONAL / NO_ISSUE_DETECTED; context declaration promotes; severity caps honored.
- `T-PROBE-18-secret-exposure-indicator`: provider-shaped secret in a response => indicator `{kind, location, lengthClass}` only; value absent from every persisted/log/AI surface; no validity call made.
- `T-PROBE-19-no-010-duplication`: SEO/a11y fixture yields no `sec.*` finding; shared header root cause yields one Finding via `rootCauseGroup`.
- `T-PROBE-20-no-exfiltration-xss`: XSS probe/browser evidence contains no script, cookie access or network call; 012 starts no browser.
- `T-PROBE-21-dependency-not-here`: library-version disclosure => `INFORMATIONAL` only; no vulnerable-version finding from `sec.*`.
- `T-PROBE-22-unsupported-active-families`: command/template/traversal/deserialization active probe => registry `UNSUPPORTED`, no probe definition, no code path.

## Resolved additions

- Item 1 (reason gap) -> **L11 / L16**: `SEC_PROBE_CLASS_UNSUPPORTED` adopted.
- Item 2 (FR-105 families vs alphabet) -> **L16 / FR-105/FR-106**: command, template, path-traversal, deserialization and NoSQL active probes are `SEC_PROBE_CLASS_UNSUPPORTED` in v1; static/spec-only.
- Item 3 (alphabet exceptions) -> **L16 / FR-080**: the two named exceptions are the in-scope URL value (FR-080(i)) and the inert `Origin` form (FR-110).
- Item 5 (identity-bearing probes) -> **L2 / FR-161**: E14 unit, dual-class checkpoint; AR-10 RECOMMENDED.
- Item 6 (CSRF overlap) and item 8 (id prefixes) -> **L17**: `auth.csrf.*` (session-bound fixture comparison) vs `sec.csrf.*` (passive); prefixes `sec.inj`, `sec.xss`, `sec.csrf`, `sec.ssrf`, `sec.leak`, `sec.cfg` accepted.
- Item 9 (pointer): `contracts/advisory-matching-contract.md` exists; confirmed.
- Fingerprint -> **L6 / FR-141**; reverify -> **L4/L5/L24**; endpoint gone -> **`SEC_ENDPOINT_GONE`**.

## Open for closure

1. Owner: V0 (uncrafted baseline) in the CSRF E14 unit is conservatively dual-checkpointed; FR-161 only mandates dual checkpoints for credentialed crafted requests. Confirm or split V0 into an E15 unit. (The `confirmationLimitation` enum, the MEDIUM default cap and the canary-lint reason are accepted as provisional in Consolidated repairs item 2.)

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **CORS ladder (G-30, FR-110)**: `LIKELY` only with a cookie session credential and `SameSite=None` (or declared); Bearer/header credentials and Lax/Strict cookies cap at `CONFIGURATION_RISK`. Test `T-PROBE-12` extended.
2. **Canary lint refusal** maps to `SEC_SCOPE_GATE_ERROR` (fail closed, accepted); `confirmationLimitation` values and the MEDIUM default cap for `LIKELY` are accepted as provisional.
3. SSRF/destination safety additionally relies on the verified address binding (FR-172): probes only ever reach the unit's proven address set; reflection/engine-error/CSP/Set-Cookie classifiers run in the HostileTextExecutor (FR-174).
