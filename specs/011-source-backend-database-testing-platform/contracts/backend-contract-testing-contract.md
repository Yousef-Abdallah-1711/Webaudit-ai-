# Contract: Backend Contract Testing (source-derived and Guest-local)

Per FR-091 through FR-099, FR-131, FR-132 (plus FR-082, FR-096, FR-097). Consumers: Backend domain
(`ModuleType BACKEND`) Source Checks, `coverage-contract.md`, `source-reverify-contract.md`, SPEC 012
(via `SOURCE_SURFACE`). Reason codes only from the `source-evidence-contract.md` registry. Check ids use the prefix `backend.*`
(R2); build/test checks stay `tests.*` and are not repeated here.

## Signature (shape, not final TypeScript)

```text
extractSourceSurface(snapshot, workspace) -> SourceSurface                     // SOURCE_STATIC, E12 observer
validateContractDocument(snapshot, surface) -> ContractDrift[]                  // static
planBackendProbes(surface, contractDoc, budget) -> ProbePlan                    // trusted, pure
runBackendProbes(probePlan) -> ContractResult[]                                 // Guest: backend.start.recognized + Fahes tool backend.probe.schema
EvidenceOrigin = "SOURCE_DERIVED" | "EXECUTED_LOCAL"       // "LIVE_TARGET" is not a value: refused, SPEC 012
SourceSurface = { framework, workspacePath, routes: RouteEntry[], envReads[], externalHttpCallSites[], dbAccessSites[],
                  surfaceComplete: boolean }   // false when any route/mount is dynamic or unresolved, or a service could not be resolved
RouteEntry = { method, normalizedPattern, handlerRef: {path, symbol, line}, validationSchemaRef?,
  middlewareNames[], declaredResponseTypes[], confidence, routeIdentity }      // RouteIdentity = route:<wsPath>:<METHOD> <pattern> (workspace-scoped; two services in one monorepo with `GET /health` stay distinct)
```

## Inputs

- Snapshot and framework detection (Express, Fastify, NestJS, Next.js route handlers at Tier 1; Koa and
  Hono best-effort, marked `confidence: BEST_EFFORT`, FR-092).
- An OpenAPI or JSON Schema document present in source (parsed statically; never fetched remotely).
- For local probing only: a recognized start template (`backend.start.recognized`) matching the detected
  framework and entry file; synthetic environment values; selected service doubles; the in-Guest
  PostgreSQL fixture (`database-schema-contract.md`/`migration-testing-contract.md`).
- Probe budget: concurrency 1; per-run in-Guest request budget (provisional 500 HTTP requests to the local app; invariant 6; not F07 units).

## Outputs

- `SOURCE_SURFACE` Evidence (origin `SOURCE_DERIVED`): route inventory per workspace.
- `CONTRACT_RESULT` Evidence (origin `SOURCE_DERIVED` for drift, `EXECUTED_LOCAL` for probes).
- `SOURCE_CHECK_RESULT` verdicts and Findings (route/contract fingerprint
  `[METHOD, normalizedRoutePattern, operationId?, checkId]`).
- `CONTRACT_RESULT` payload essentials: `origin`, `checkId`, `routeIdentity`, `method`, `pattern`,
  `contractRef {file, jsonPointer}`, `expected {status[], schemaRef}`, `observed {status, schemaViolations[],
  durationMs}` (observed only for `EXECUTED_LOCAL`), `probeKind` (`ROUTE_EXISTS`, `STATUS_DECLARED`,
  `RESPONSE_SCHEMA`, `BOUNDARY_VALUE`, `PAGINATION_PARAM`, `FILTER_PARAM`, `SORT_PARAM`), `requestIndex`,
  `requestBudgetRemaining`, `startTemplateVersion`, `imageId`, `snapshotDigest`. Bodies redacted and
  excerpt-capped (FR-117/118).

## Ownership

Backend domain owns extraction rules, drift checks and probe planning. E12 runs the extraction observer;
E13 runs the Guest-local app and probe runner. Neither engine decides Findings (D1).

## Invariants

1. Three-way separation: `SOURCE_DERIVED` (static), `EXECUTED_LOCAL` (Guest-local), `LIVE_TARGET`
   (deployed API) is refused with `OUT_OF_SCOPE` and handed to SPEC 012. Every evidence row carries its
   origin; origins are never merged in a single verdict.
2. Source validation: the OpenAPI/JSON Schema document is validated for syntax and schema validity; drift
   checks compare it with the inventory: route in contract missing in code, route in code absent from
   contract (undeclared), undeclared status codes, parameter definition mismatches. A finding cites both
   locations; absence of a contract yields `CONTRACT_ABSENT` (`NOT_TESTED` for contract checks), never `PASS`.
3. Local app start only via a recognized template (framework entry detected statically; argv, no shell,
   no `package.json` script run by name). No template match yields `START_TEMPLATE_UNRECOGNIZED`
   (`NOT_TESTED`; the registry code, `NO_RECOGNIZED_START` does not exist); a start that fails or never becomes healthy within its limit yields `FIXTURE_STARTUP_FAILED`
   (`BLOCKED`), not a test failure.
4. Probes are derived solely from the contract schema: route existence, declared status codes,
   response-versus-schema validation, boundary values at declared schema constraints (min, max, enum,
   required, format, maxLength), and declared pagination, filter and sort parameters. Request values are
   deterministic (seeded) and synthetic.
5. FORBIDDEN (FR-095), each also enumerated as an explicit negative fixture: attack-payload corpora;
   authentication bypass; IDOR or object-id enumeration; brute force or credential guessing; injection
   (SQL, command, template, header); rate-limit hammering; fuzzing beyond schema-derived constraints;
   any request to a non-Guest endpoint; any request to a host other than the Guest loopback address.
   Anything of this kind belongs to SPEC 012.
6. Concurrency is 1. The per-run request budget is an in-Guest probe budget, distinct from F07 request
   units (F07 consumes one request unit and one concurrency lease per run, FR-050). Every HTTP request
   the probe runner sends to the local app, including boundary-value requests, counts as one; readiness
   health checks of the start template do not. The supervisor caps the budget by also counting requests
   in the Guest agent's report. When exhausted the remaining probes are not sent and are recorded
   `INCONCLUSIVE` with `REQUEST_BUDGET_EXHAUSTED` (coverage is incomplete, the cause is a budget, not an absent precondition);
   the run is not failed and never "complete".
7. Environment: required variables are found statically (`process.env.X`, config readers) and given
   synthetic non-secret values; `DATABASE_URL`-style variables point only to the in-Guest fixture; no real
   secret is supplied (FR-096). Missing but required variable yields `MISSING_ENV_VAR` (environment
   limitation, `NOT_TESTED`).
8. External HTTP is blocked (egress none). Optional in-Guest service doubles (mail sink, generic HTTP
   stub, fake payment gateway, queue fixture where the image provides one) are wired only through variables
   Fahes sets and are selected explicitly; unselected need yields `REQUIRES_EXTERNAL_SERVICE` (FR-097).
9. Background jobs are tested only when testable safely against in-Guest fixtures; otherwise `NOT_TESTED`
   with the missing requirement named (FR-098, FR-099). Unsupported framework yields `UNSUPPORTED`.
10. Hand-off: `SOURCE_SURFACE` plus `RouteIdentity` is the sole input SPEC 012 may rely on from 011;
    SPEC 011 emits no live-target evidence (FR-131, FR-132). `surfaceComplete: false` tells SPEC 012 the inventory is not exhaustive; route fingerprints include `workspacePath` so findings for same-named routes of different services never merge (FR-120). Check ids use the `backend.*` prefix.
11. Dynamic routes: a route whose pattern is not statically derivable (computed paths, runtime registration) is omitted from the
    inventory and recorded with reason `DYNAMIC_ROUTE_UNRESOLVED` (`INCONCLUSIVE` for the checks that would cover it); it is
    never guessed and never recorded as `NOT_DISCOVERED` (a test-suite status). Coverage counts it as unresolved, not absent.
12. Negative-probe guard: the probe plan can only contain the probe kinds listed in invariant 4, and the in-Guest probe runner
    (`backend.probe.schema`) refuses at runtime any request that is not a planned probe against the Guest loopback address
    (forbidden kinds of invariant 5, a non-loopback host, a non-planned path). A refusal is a defect of the planner/runner:
    it is recorded as `ENGINE_DEFECT` (checks `BLOCKED`) and aborts the probe step; the request is never sent. Each forbidden
    kind is an explicit negative fixture that proves the guard refuses it.
13. Evidence writes (`CONTRACT_RESULT`, `SOURCE_SURFACE`) first claim `IdempotentClaim` scope `evidence-write`, key
    `{scanPlanId}:{executionUnitId}:{attempt}:{kind}:{naturalKey}`; request-index keys below are the `naturalKey`.

## Failure behavior

| Reason code | FailureClass / status | Verdict |
|---|---|---|
| `CONTRACT_ABSENT` | none | `NOT_TESTED` |
| `START_TEMPLATE_UNRECOGNIZED` | none | `NOT_TESTED` |
| `FIXTURE_STARTUP_FAILED` | none | `BLOCKED` |
| `REQUIRES_EXTERNAL_SERVICE` | none | `NOT_TESTED` |
| `MISSING_ENV_VAR` | none | `NOT_TESTED` |
| `REQUEST_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` (remaining probes) |
| `DYNAMIC_ROUTE_UNRESOLVED` | none | `INCONCLUSIVE` |
| `RUN_BUDGET_EXHAUSTED` (run envelope, distinct from the probe budget) | none | `INCONCLUSIVE` |
| `UNSUPPORTED_FRAMEWORK` | none | `UNSUPPORTED` |
| `OUT_OF_SCOPE` (live target requested) | `SAFETY_REFUSED` at plan resolution | refused, no unit |
| Probe runner asked to send a forbidden or non-Guest-loopback request (guard refusal) | `ENGINE_DEFECT`, request never sent | `BLOCKED`; probe step aborted |
| The app under test itself attempts a non-Guest destination | `NETWORK_BLOCKED_BY_POLICY` (policy denies; if the attempt is a tamper signal, flag `SANDBOX_POLICY_VIOLATION` + `CONTAINMENT_ABORT`, `CUSTOMER_CODE_FAILURE`, F07 `SAFETY_VIOLATION`) | `NOT_TESTED` for the affected probe |
| Probe parse/extractor exception | `ENGINE_DEFECT` | `BLOCKED` |

## Safety

The app under test is customer code and runs only in the Guest (FR-035) with egress cut (P4 phase).
The probe runner is Fahes-authored and runs in the Guest against loopback only; the Guest network policy
enforces this independently of the runner. Response bodies are untrusted data: size-capped, redacted,
never fed to AI as instructions.

## Idempotency

Extraction and drift checks are idempotent over `(snapshotDigest, ruleVersion)`. Probe plans are
deterministic from `(contract digest, seed)`; probe execution is not retried across attempts (`attempts: 1`,
FR-054); evidence keys derive from `(executionUnitId, requestIndex)`.

## Consumers

`coverage-contract.md` (routes exercised), `source-reverify-contract.md`, SPEC 012 (`SOURCE_SURFACE`),
SPEC 014 (input only).

## Non-negotiable boundary rules

1. `LIVE_TARGET` evidence MUST NEVER be produced or accepted by this platform.
2. The forbidden probe list MUST NEVER be partially enabled behind a flag.
3. Probe traffic MUST NEVER leave the Guest loopback.
4. The in-Guest request budget (500) MUST be enforced hard and MUST NEVER be conflated with F07 request units.
5. Missing contract, template, env input or infrastructure MUST be `NOT_TESTED`/`UNSUPPORTED`, never `PASS`.
6. Real secrets and customer service endpoints MUST NEVER be supplied to the app.
