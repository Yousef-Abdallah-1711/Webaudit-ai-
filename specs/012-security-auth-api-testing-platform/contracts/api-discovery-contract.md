# Contract: API Discovery (API Surface Builder)

## Status / Ownership

**Status**: PLANNING — NOT FROZEN (SPEC 012 closure pass pending). **Ownership**: Context H (API Security Testing Domain), discovery half. Owned by 012; implemented as a parent-side deterministic derivation in `apps/worker/src/security/` (plan.md §"Project structure"). No execution class, no queue, no credential, **no network**.

Per FR-083, FR-084, FR-098, FR-099, FR-100, FR-168, FR-163, FR-063, FR-135, FR-143, FR-155, FR-156 (plus FR-001, FR-079, FR-127, FR-131). Reasons come only from the plan.md closed `SEC_*` registry or are upstream passthrough.

## Consumers

- `api-security-check-contract.md` (probe planner reads `API_SURFACE`; the only source of probe-eligible operations).
- `authorization-testing-contract.md` (operation lookup for `AuthorizationExpectation` rows).
- `business-logic-security-contract.md` (workflow steps may reference operations by `apiIdentity`).
- `security-coverage-contract` (the `securityCoverageSummary` endpoint counters: discovered / authorized / tested / skipped, FR-143).
- SPEC 014 (API identities and `RouteIdentity` handoff, FR-157); SPEC 013 sees no 012 inventory beyond timing metadata.

## Inputs

1. **OpenAPI document** (FR-098, FR-084): OpenAPI 3.0.x or 3.1.x, JSON or YAML, **bundled** (single document), stored as a tenant-owned `ApiDescriptionDocument` bound to the Target (FR-168; R2 key `api-descriptions/<userId>/<targetId>/<digest>`; **not** a 009 `Artifact`, which requires a scan and unit; tenant check on read). Never fetched from a URL by the builder.
2. **011 `SOURCE_SURFACE`** Evidence (origin `SOURCE_DERIVED`), including `surfaceComplete` and each `RouteEntry.routeIdentity` (011 `source-correlation-contract.md` inv. 1-3, grammar `correlationGrammarVersion: 1`, consumed unchanged; 011 `backend-contract-testing-contract.md` Signature/inv. 10).
3. **Observed authorized traffic**: committed `HTTP_TRANSACTION` / `HAR` Evidence produced by 010 `BROWSER`/`CRAWLER` units (010 `browser-execution-contract.md`, `crawler-contract.md`) and 012 passive fetch, already redacted at write time.
4. **Target context**: the Target (kind `WEB`), its canonical host, environment classification, and the F01 verdict inputs (grant classes and action categories) used to compute `scopeVerdict` (no request is made; FR-100).
5. **Service/workspace key** (customer-declared mapping `workspacePath -> host/base path`, provided with the OpenAPI/source association) required only for the source join (inv. 8).
6. Version pins: `apiSurfaceBuilderVersion`, `correlationGrammarVersion: 1`, `specParserVersion` (parser library is `UNKNOWN - REQUIRES INVESTIGATION`, plan.md Technical Context).

## Outputs

- `API_SURFACE` Evidence (new kind, plan.md §"Evidence kinds added"), one row per `(apiIdentity, origin)` plus one **inventory header** row per build run.
- Counters consumed by coverage: `{discovered, authorized(probe-eligible), tested, skipped[{reason}]}` (computed; `tested` is updated by the `SECURITY_CHECK_RESULT` finalizer, not by the builder).
- `SECURITY_CHECK_RESULT` rows for builder-level refusals (`BLOCKED`/`UNSUPPORTED`/`FLAG`, never a Finding).

`API_SURFACE` row shape (essentials, redacted by construction; no example values, no server URLs with credentials, no stored values):

```text
API_SURFACE = {
  apiIdentity,                 // "api:" pct(authority) ":" METHOD " " pattern   (012-local derived key; pattern = 011 inv.2 normalization)
  origins: Set<OPENAPI|SOURCE_DERIVED|OBSERVED>,   // a merged row lists every origin that contributed; per-origin facts kept separately
  method, pathTemplate,
  parameters: [{name, in: path|query|header|cookie, schemaTypeClass, required, urlTyped: bool, formatClass}],   // urlTyped: format uri / name class (feeds probe-family SSRF-destination-safety, static only)
  requestSchemaRef?, responseSchemaRefs[{statusClass, ref}],   // JSON-pointer into the stored `ApiDescriptionDocument`, never inlined bodies
  authRequirements: {declared: NONE|SCHEME[], source: OPENAPI|SOURCE_DERIVED|UNKNOWN},
  scopeVerdict: IN_SCOPE | OUT_OF_SCOPE | UNAUTHORIZED_CLASS,
  scopeReason?,                // F01 reason verbatim, or SEC_DESTINATION_PROHIBITED, or SEC_API_NOT_AUTHORIZED
  probeEligible: boolean,      // FR-100: IN_SCOPE and grant lists class and action category (computed at plan time, re-derived at dispatch)
  environment,                 // Target's CURRENT classification at build time
  routeIdentity?,              // 011 identity, only when the join succeeded
  deprecated?: boolean, versionSegment?: string,
  surfaceComplete: boolean, incompleteReasons[],           // SEC_API_SURFACE_INCOMPLETE (FLAG)
  sourceRefs: [{kind, apiDescriptionDocumentId|evidenceId, pointer}], builderVersion, specDigest }
InventoryHeader = { buildKey, counts{discovered, authorized, outOfScope, unauthorizedClass, skipped[]}, surfaceComplete, specSummary{openapiVersion, sizeBytes, maxDepth, nodeCount}, refusals[] }
```

## Operations

```text
buildApiSurface(scanPlanId, targetId, inputs: ApiDiscoveryInputs) -> {rows: API_SURFACE[], header: InventoryHeader, results: SECURITY_CHECK_RESULT[]}   // pure, no network
parseOpenApi(apiDescriptionDocumentRef, limits) -> NormalizedSpec | SpecRefusal                                  // offline, bounded
deriveFromSource(sourceSurface, keyMap) -> CandidateOp[]                                           // 011 join, never guessed
deriveFromTraffic(httpTransactions, targetHosts) -> CandidateOp[]                                  // observed, templated
classifyScope(candidate, target, grants) -> {scopeVerdict, scopeReason, probeEligible}             // isInScope + class availability; NO request
mergeInventory(candidates) -> API_SURFACE[]                                                        // dedupe by apiIdentity
onApiInputsCommitted(evidenceRef)                                                                   // sole trigger path (registry pattern, FR-147)
```

Ordered steps of `buildApiSurface`:

1. Claim `IdempotentClaim{scope:"sec-check-execution", claimKey:"${scanPlanId}:api.discovery:${builderVersion}:${buildKey}"}` **before** reading inputs (FR-147 pattern). `buildKey` = hash of `(specDigest?, sourceSurfaceEvidenceIds sorted, trafficEvidenceIds sorted, targetId)`. A second delivery returns the existing rows.
2. Precondition: at least one input present, else one `SECURITY_CHECK_RESULT` `NOT_TESTED`/`SEC_NO_EVIDENCE` and an empty inventory (header `discovered: 0`); never an inferred inventory.
3. `parseOpenApi`: verify tenant ownership of the `ApiDescriptionDocument` (FR-168); enforce limits (inv. 2-4) **while streaming**, before building any object graph; reject per refusal table.
4. Normalize each operation: method (`GET HEAD POST PUT PATCH DELETE OPTIONS` only; other methods recorded `SKIPPED` with `SEC_UNSUPPORTED_TARGET_TYPE`), path template to 011 normalization (inv. 2 of source-correlation-contract) so `{id}` form is shared, parameters, schema refs, security requirement resolution (operation-level overrides document-level; an explicit empty list = `NONE`).
5. `deriveFromSource` (inv. 8) and `deriveFromTraffic` (inv. 9).
6. `classifyScope` per candidate (inv. 5-7), with the environment re-read from the Target's *current* classification (FR-014).
7. `mergeInventory` (inv. 10) and compute counters; write rows through the fenced evidence wrapper with `IdempotentClaim{scope:"sec-evidence-write", claimKey:"${scanPlanId}:${executionUnitId|parent}:${attempt}:API_SURFACE:${apiIdentity}:${origin}"}` (FR-135).

## Invariants

1. **No network, ever.** The builder has no HTTP client, no DNS access, no credential and no queue. It reads committed Evidence and `ApiDescriptionDocument` records only. A test asserts the module imports neither `safe-net` nor any network API.
2. **Reference policy (FR-084).** Any `$ref` whose target is not a JSON pointer inside the same document (`#/...`), and any `file:`, `http:`, `https:`, `data:`, UNC or relative-file reference, anywhere in the document (including `externalValue`, `$schema`, `$dynamicRef` to non-fragment, and `servers`-like fields that embed resolvers) is **refused for the whole spec**: `BLOCKED`/`SEC_API_SPEC_EXTERNAL_REF_REFUSED`, no partial inventory from that document, and no byte is fetched.
3. **Size and structure limits (FR-084).** Document size <= 5 MiB, nesting depth <= 64, total node count <= 200 000 (nodes counted as parsed mapping/sequence/scalar values, aliases counted at expansion). Exceeding any limit aborts parsing at the first violation: `BLOCKED`/`SEC_API_SPEC_TOO_LARGE`.
4. **YAML aliases/anchors and recursion.** Alias/anchor expansion is counted toward the node limit as if expanded (so a "billion laughs" shape hits inv. 3); an alias cycle or a `$ref` cycle is detected by a visited-set over resolved pointers; a *legitimate* recursive schema (a tree type) is allowed only as a reference, never inlined beyond depth 64. Any cycle that cannot be represented as a reference, any non-JSON/YAML content, any YAML tag/merge construct beyond plain scalars/mappings/sequences/aliases (no custom tag constructors, no code-evaluating tags) is `BLOCKED`/`SEC_API_SPEC_INVALID`. Parser configuration is a safe-schema load with no object construction.
5. **Discovery is not authorization (FR-100).** `scopeVerdict` is computed only from `isInScope` over the operation's destination and class availability: `IN_SCOPE` (host within the Target's boundedness rule and `isInScope` yes), `OUT_OF_SCOPE` (host/path outside the Target or `isInScope` refuses), `UNAUTHORIZED_CLASS` (in scope but no active grant lists the class the planned probe family requires). `probeEligible` is `true` only for `IN_SCOPE` **and** class **and** action category listed (F01 `isAuthorized` result is *not* cached; the planner re-asks at plan resolution and again at dispatch, FR-003). The builder never calls `isAuthorized` for a safety-sensitive action itself (FR-004); `classifyScope` is advisory inventory metadata and consumes the plan-time F01 result passed in.
6. **`servers[]` is inventory only (FR-083).** Every `servers` entry (including variables with defaults and relative URLs) is recorded as a candidate *authority*. Each is classified; entries failing the Target boundedness rule (own canonical host or subdomain, plan.md Clarifications) or safe-net destination classes (private/loopback/link-local/metadata, FR-079) are `OUT_OF_SCOPE` and, if the destination class itself is prohibited, `scopeReason = SEC_DESTINATION_PROHIBITED`. No `servers` entry is resolved, pinged or DNS-resolved. Server variable expansion is limited to declared enum/default values; an unbounded variable yields `incompleteReasons += "SERVER_VARIABLE_UNBOUNDED"` and `surfaceComplete:false`.
7. **WEB-kind only.** An API is a `WEB`-kind destination (plan.md Clarifications; AR-3 is CLOSED by the owner's P10 approval of 2026-10-11). Different registrable domain than the Target => `OUT_OF_SCOPE` (grants are never combined, 007 FR-013); cross-domain composite flows are `UNSUPPORTED` in v1.
8. **Source join without guessing (FR-099).** A `SOURCE_SURFACE` route joins a runtime/spec operation only when the customer-declared service/workspace key maps the route's `wsPath` to an authority, **and** normalized `METHOD + pattern` match exactly. Otherwise the route is emitted as `origin: SOURCE_DERIVED` with `authority: null`, `scopeVerdict: OUT_OF_SCOPE`-equivalent `probeEligible:false`, and the inventory header gets `surfaceComplete:false` with `SEC_API_SURFACE_INCOMPLETE` (FLAG). The `routeIdentity` string is copied verbatim; the builder never constructs, parses for meaning, or normalizes a `RouteIdentity` itself (011 inv. 8: grammar versioned, no private variants). A `prefixUnknown:true`, `expanded:true`, or `confidence: BEST_EFFORT` route retains those flags and never becomes `probeEligible` on source evidence alone (a spec or observed row must corroborate).
9. **Observed traffic** becomes `origin: OBSERVED` rows only for requests whose destination passed scope at capture time; templates are derived by replacing observed path segments that match the declared parameter pattern or, absent a spec, by the 011 `{name}` convention only when the same method+shape was seen with >= 2 distinct values (otherwise the literal path is kept, no guessing). Query *values* are never stored (FR-128); observed rows carry parameter names and type/length classes only. Third-party hosts in traffic are recorded `OUT_OF_SCOPE` and never probed (FR-082).
10. **Dedupe/idempotency.** `apiIdentity` is the dedupe key: `method` upper-case, `pattern` normalized, authority canonicalized (lowercase host, default port elided, IDNA ASCII). Rows from several origins merge into one row with an `origins` set; conflicting facts (e.g. OPENAPI says auth required, OBSERVED saw 200 unauthenticated in passive capture) are **retained side by side** in `authRequirements` per origin and never merged into one value; a conflict sets `incompleteReasons += "ORIGIN_CONFLICT"` (informational; does not change `probeEligible`). Rebuilding with identical inputs yields byte-identical rows (deterministic ordering by `apiIdentity`, then origin).
11. **Unsupported API types.** A document that is Swagger/OpenAPI 2.x, a GraphQL schema/introspection result, gRPC/protobuf descriptor, WSDL/SOAP, AsyncAPI or WebSocket description, or observed traffic that is a GraphQL/gRPC/SOAP/WebSocket exchange, is `UNSUPPORTED`/`SEC_UNSUPPORTED_TARGET_TYPE` with a closed `unsupportedKind` detail enum (`OPENAPI_2`, `GRAPHQL`, `GRPC`, `SOAP`, `WEBSOCKET`, `ASYNCAPI`, `OTHER`). Detection is by document discriminator/content-type class, not by guessing from names. These produce no `API_SURFACE` operation rows.
12. **Facts not values.** `API_SURFACE` never stores example values, default values of secrets, `x-` extension string values, description text, or server URLs containing userinfo/query; those fields are dropped or replaced by typed placeholders before write (FR-127/FR-128). The builder also runs the 012 value-aware redactor over every derived row (FR-127).
13. **Counters are facts.** `discovered` = distinct `apiIdentity` rows (all origins); `authorized` = rows with `probeEligible:true`; `tested` = rows with at least one executed probe result (from `SECURITY_CHECK_RESULT`, written by finalizer); `skipped` = `discovered - tested` with a closed reason each (`SEC_API_NOT_AUTHORIZED`, `SEC_DESTINATION_PROHIBITED`, `SEC_BUDGET_LOCAL_*`, F01 reason passthrough, `SEC_API_SURFACE_INCOMPLETE`, `SEC_UNSUPPORTED_TARGET_TYPE`). Invariant: `discovered = tested + skipped`; `authorized <= discovered`; `tested <= authorized`.
14. **No runtime discovery loop (FR-063).** New endpoints observed during an E14/E15 unit are written as `OBSERVED` rows with `probeEligible:false` and `scopeReason` empty; they are tested only in a later, separately authorized plan.
15. **Evidence immutability.** `API_SURFACE` rows are append-only per `buildKey`; a rebuild after new inputs writes a new `buildKey` and supersedes by pointer in the header, never by mutation; old rows remain for reproducibility.
16. **Non-recursion.** `API_SURFACE` and `SECURITY_CHECK_RESULT` are not triggers for `onApiInputsCommitted`.

## Safety & Authorization

- Discovery needs **no grant** (no request, no credential, no destination contacted) and is permitted for PRODUCTION targets: it is a C0 derivation (plan.md Production Safety Matrix "API surface derivation; advisory matching - Allowed"). It reads only Evidence and the tenant's `ApiDescriptionDocument` records already committed.
- F01 is consumed only to *label* eligibility (inv. 5); F07 is not touched (no request or concurrency consumed). Any later probe goes through `securityScopeGate` + `safetyCheckpoint` in the api-security-check-contract (FR-004, FR-012).
- `ApiDescriptionDocument` records are tenant-scoped; the builder verifies `ApiDescriptionDocument.userId == scan.userId`, the Target binding and Target ownership; mismatch => `BLOCKED`/`SEC_SCOPE_GATE_ERROR` (fail closed).
- PRODUCTION/unclassified target: inventory is built and `probeEligible` is forced `false` with `scopeReason = SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` (FR-013, FR-078); the inventory is still reported (coverage honesty).
- OpenAPI content is **untrusted data** (FR-134): never interpreted as instructions, never sent to AI unredacted, never rendered as HTML; free-text fields (description/summary) are not stored.

## Failure states

| Condition | Verdict / status | Reason |
|---|---|---|
| No OpenAPI, no `SOURCE_SURFACE`, no observed traffic | `NOT_TESTED`; empty inventory | `SEC_NO_EVIDENCE` |
| Spec has external/file/http/data `$ref` | `BLOCKED` (whole document) | `SEC_API_SPEC_EXTERNAL_REF_REFUSED` |
| Spec > 5 MiB, depth > 64, nodes > 200 000, operations > 5 000, alias expansion bomb | `BLOCKED` | `SEC_API_SPEC_TOO_LARGE` |
| Parse wall-clock cap (10 s) overrun | `BLOCKED` | `SEC_ANALYSIS_BUDGET_EXHAUSTED` |
| Builder evaluation threw | `BLOCKED` | `SEC_EVALUATION_ERROR` |
| Unparseable, cyclic non-reference, forbidden YAML construct, not OpenAPI 3.0/3.1 shape | `BLOCKED` | `SEC_API_SPEC_INVALID` |
| Swagger 2.0 / GraphQL / gRPC / SOAP / WebSocket / AsyncAPI | `UNSUPPORTED` | `SEC_UNSUPPORTED_TARGET_TYPE` |
| Source join impossible (no service key / dynamic route / `prefixUnknown`) | row kept; header FLAG | `SEC_API_SURFACE_INCOMPLETE` |
| Operation host outside Target / prohibited destination class | row `OUT_OF_SCOPE`; not probe-eligible | F01 `OUT_OF_SCOPE` verbatim, or `SEC_DESTINATION_PROHIBITED` |
| Class not granted for planned probe family | row `UNAUTHORIZED_CLASS`; `BLOCKED` at check level | `SEC_API_NOT_AUTHORIZED` (+ F01 `NO_MATCHING_GRANT` carried verbatim as `upstreamReason`) |
| Target PRODUCTION or unclassified | rows built; not eligible | `SEC_PRODUCTION_PROHIBITED` / `SEC_ENVIRONMENT_UNCLASSIFIED` |
| Upstream producer unit (010/011) not `COMPLETED` | that input skipped; header notes it | `SEC_UPSTREAM_PRODUCER_FAILED` |
| `ApiDescriptionDocument` belongs to another tenant or other Target / scope gate internal error | `BLOCKED`; nothing read | `SEC_SCOPE_GATE_ERROR` |
| `securityScopeGate`/builder feature gate off | `NOT_TESTED` | `SEC_ENGINE_DISABLED` |

Partial results: a refused spec does not discard `SOURCE_DERIVED`/`OBSERVED` rows from other inputs; the inventory header lists `refusals[]`.

## Idempotency & retry

- Check-execution claim in Operations step 1 (FR-147); evidence-write claims per row (FR-135). Recovery or duplicate trigger re-reads claims and writes nothing new.
- No retry: the builder is a pure function; transient infrastructure failure (DB/R2 read) is a worker-level retry of the parent task under 009 rules, not a builder behavior. Parsing results are never "healed" by a second parser pass with relaxed limits.
- `buildKey` mismatch (inputs changed) => new build, new rows; coverage counters reference the latest `buildKey` for the plan.

## Evidence

`API_SURFACE` (per-row + header) and `SECURITY_CHECK_RESULT` (refusals). Provenance on every row: `sourceRefs`, `specDigest`, `builderVersion`, `correlationGrammarVersion`. Redacted before write (FR-127). Retention parity with the report (FR-132); storage keys tenant-isolated. Not a Finding source on its own: only the api-security-check-contract static checks (e.g. write operation without auth requirement) turn inventory facts into verdicts.

## Budgets / limits (F07 vs LOCAL)

- **F07**: none consumed (no request/concurrency). 
- **LOCAL - parse limits** (not F07-ledgered, labeled as such per FR-070): size 5 MiB, depth 64, nodes 200 000; per-plan operation cap 5 000 operations (**provisional**; overflow => remaining operations `SKIPPED` with `SEC_API_SPEC_TOO_LARGE`, which the registry defines as covering operation limits); parse wall-clock cap 10 s (provisional; overrun => `BLOCKED`/`SEC_ANALYSIS_BUDGET_EXHAUSTED`, the parent-side analysis budget code). Memory bounded by streaming counters.

## Reverify

API-discovery has no Finding of its own. Reverify of an `api.*` finding (api-security-check-contract) re-derives the single operation's row from the **current** stored spec/inventory (fresh `buildApiSurface` over the same artifact version or a newer customer-supplied one), re-computes `scopeVerdict` with fresh F01 (destination bound from `Issue.location` by `parseSecurityLocation`, method ignored, FR-163/FR-151); a `Issue.location` that cannot be bound to a concrete in-scope destination yields `INCONCLUSIVE`/`SEC_REVERIFY_UNVERIFIABLE` (FR-163), and an operation that no longer exists in the current spec/inventory yields `INCONCLUSIVE`/`SEC_ENDPOINT_GONE` (FR-153). `INCONCLUSIVE` maps to Issue state `UNVERIFIABLE` (FR-164). Prior rows are preserved and linked.

## Boundary rules (MUST NOT)

1. MUST NOT make any network request, DNS lookup or `isAuthorized` call for a safety-sensitive action.
2. MUST NOT fetch, resolve or follow any `$ref`, `servers`, `externalDocs`, `externalValue`, `file:`, `http(s):`, `data:` or remote schema.
3. MUST NOT treat a discovered operation, a `servers[]` entry or a response-derived URL as authorization or as a destination.
4. MUST NOT guess a service/workspace key, a base path, or a route join; MUST NOT construct or reinterpret a `RouteIdentity`.
5. MUST NOT store example values, secrets, server URLs with userinfo/query, or free-text descriptions in Evidence.
6. MUST NOT create execution units, queue jobs or probes outside the plan (FR-063).
7. MUST NOT emit an inventory row for an unsupported API type, and MUST NOT silently drop it (the refusal row is mandatory).
8. MUST NOT merge conflicting per-origin facts into one value, and MUST NOT treat absence from the inventory as "no endpoint exists".
9. MUST NOT redefine or fork 010/011 identity grammars; MUST NOT widen 010 `CHECK_RESULT` or 011 kinds.

## Named limitations

- Inventory is only as complete as the customer-provided spec, the (static) 011 surface and the observed authorized traffic; it is never an exhaustive attack surface (hence `surfaceComplete` and `SEC_API_SURFACE_INCOMPLETE`).
- Spec-declared authentication requirements may differ from runtime behavior; the builder records the *declaration*, not the truth (the api-security-check-contract tests behavior).
- The service/workspace key mapping is customer-declared; Fahes cannot verify it. A wrong mapping can misjoin routes (mitigated by exact `METHOD + pattern` equality and `probeEligible` requiring corroboration).
- Dynamic routes, runtime-registered handlers, gateways rewriting paths and versioned prefixes added by a proxy are invisible to static inputs.
- Parser library and YAML implementation are `UNKNOWN - REQUIRES INVESTIGATION`; the limits above are requirements any library/wrapper must satisfy, validated by the fixtures below.
- GraphQL/gRPC/SOAP/WebSocket and live-DB APIs are out of scope for v1.

## FR traceability

FR-098 (inputs/shape), FR-099 (join), FR-100 (eligibility), FR-083 (`servers`), FR-084 (parse limits), FR-079 (destination classes, consumed), FR-063 (no runtime unit creation), FR-127/131/134/135 (evidence hygiene/idempotency), FR-143 (coverage counters), FR-155/156 (010/011 consumption), FR-147 (idempotent trigger), FR-001 (every endpoint accounted for), FR-013/FR-078 (environment), FR-141/FR-145 (identity feeds fingerprint and `Issue.location`), FR-168 (`ApiDescriptionDocument` storage), FR-163/FR-164 (reverify location binding and routing, consumed), FR-153 (endpoint gone).

## Acceptance tests required (named; deterministic, fixture-based; not executed in this pass)

- `T-API-DISC-01-spec-40-ops-12-in-scope`: 40 operations, 12 in scope => discovered 40, authorized 12, tested <= 12, skipped 28 each with a closed reason; invariant 13 equation holds.
- `T-API-DISC-02-external-ref-refused-no-network`: `$ref` to http/file/data/relative-file => whole spec `SEC_API_SPEC_EXTERNAL_REF_REFUSED`; network-spy fixture records zero calls; zero rows from that document.
- `T-API-DISC-03-spec-limits`: 5 MiB+1 byte, depth 65, 200 001 nodes each => `SEC_API_SPEC_TOO_LARGE` at the first violation without building the full graph.
- `T-API-DISC-04-yaml-alias-bomb`: nested-alias expansion fixture => bounded, rejected; process memory/time within cap.
- `T-API-DISC-05-recursive-ref`: legitimate recursive schema allowed (as reference); `$ref` self-cycle without type information => `SEC_API_SPEC_INVALID`.
- `T-API-DISC-06-servers-inventory-only`: `servers` with metadata IP, loopback, other registrable domain => `OUT_OF_SCOPE`/`SEC_DESTINATION_PROHIBITED`; network spy empty; no DNS resolver call.
- `T-API-DISC-07-source-join-needs-key`: `SOURCE_SURFACE` with two `wsPath` services both exposing `GET /health`; no key => `surfaceComplete:false`, `SEC_API_SURFACE_INCOMPLETE`, identities stay distinct; with key => joined; `RouteIdentity` string byte-equal to input.
- `T-API-DISC-08-discovery-not-authorization`: discovered op with no grant => `UNAUTHORIZED_CLASS`, `probeEligible:false`, zero requests ever issued for it.
- `T-API-DISC-09-production-inventory-only`: PRODUCTION target => rows exist, none eligible, reason `SEC_PRODUCTION_PROHIBITED`.
- `T-API-DISC-10-unsupported-types`: Swagger 2, GraphQL introspection, gRPC descriptor, SOAP WSDL, WebSocket => `SEC_UNSUPPORTED_TARGET_TYPE` with correct `unsupportedKind`; no rows.
- `T-API-DISC-11-dedupe-multi-origin`: same operation in spec + source + traffic => one row, three origins, conflicting auth facts kept side by side, `ORIGIN_CONFLICT`.
- `T-API-DISC-12-idempotent-rebuild`: duplicate `onApiInputsCommitted` and recovered worker => zero new rows; byte-identical on rebuild.
- `T-API-DISC-13-no-values-persisted`: spec with example secrets/URLs with userinfo/query => none present in any `API_SURFACE` row (redactor + schema drop).
- `T-API-DISC-14-cross-tenant-artifact`: `ApiDescriptionDocument` of another tenant => `SEC_SCOPE_GATE_ERROR`, nothing read.
- `T-API-DISC-15-runtime-new-endpoint`: engine unit observes an unplanned endpoint => `OBSERVED`, not eligible, no new unit.
- `T-API-DISC-16-non-recursion`: writing `API_SURFACE`/`SECURITY_CHECK_RESULT` does not re-trigger the builder.

## Resolved additions

- `apiIdentity` grammar (was item 1) -> **L20**: `"api:" pct(authority) ":" METHOD " " pattern`, not a `RouteIdentity`; stays as written in the row shape; data-model owns the home.
- Prohibited destination class (was item 5) -> **L19 / FR-100**: `OUT_OF_SCOPE` + `SEC_DESTINATION_PROHIBITED`; written in inv. 6 and the failure table.
- OpenAPI storage -> **L21 / FR-168**: `ApiDescriptionDocument` replaces the 009 `Artifact` everywhere in this file.
- Operation cap -> plan registry text of `SEC_API_SPEC_TOO_LARGE` ("size/depth/node/operation limits") covers it; alias bomb -> `SEC_API_SPEC_TOO_LARGE`, alias cycle/forbidden YAML -> `SEC_API_SPEC_INVALID` (items 2, 4 resolved by registry wording).
- Parse wall-clock overrun -> adopted `SEC_ANALYSIS_BUDGET_EXHAUSTED` (**L11**); evaluator throw -> `SEC_EVALUATION_ERROR` (**L11**); endpoint gone -> `SEC_ENDPOINT_GONE` (**L11**); reverify location binding -> **FR-163/FR-164/L4/L5**.

## Open for closure

1. Owner: confirm the provisional numeric caps 5 000 operations and 10 s parse wall-clock (not in FR-084); add to plan Budgets or drop.
2. Owner: confirm `unsupportedKind` (`OPENAPI_2, GRAPHQL, GRPC, SOAP, WEBSOCKET, ASYNCAPI, OTHER`) is acceptable as a closed detail field rather than a reason code.
3. Owner: the customer-declared service/workspace key mapping (`wsPath -> authority`) has no entity in data-model.md; add it to the Target/`ApiDescriptionDocument` association record or confirm another home.

## Consolidated repairs (authoritative; third repair pass, 2026-10-14)

Single normative section replacing the earlier "Analyze and adversarial repairs" and "Blocker repairs B-1..B-13" addenda: superseded items were deleted, not overridden; retained items keep their original review labels. Requirements: spec FR-161..FR-201. Nothing here claims runtime feasibility; T650 and the other feasibility gates stay open.

1. **Isolated parsing (G-21, FR-084)**: parse in a `worker_threads`/child context with `resourceLimits`, no network, hard terminate at 10 s; byte-level alias/anchor/`<<` pre-scan before the YAML library; prototype-pollution-safe key handling. Test `T-API-DISC-alias-bomb-event-loop-lag`.
2. **Storage (FR-168)**: customer descriptions live in `ApiDescriptionDocument`, not a 009 `Artifact`.
3. Operation declarations (FR-192) are a separate customer-asserted store (`ApiOperationDeclaration`) keyed by the same normalized `operationKey` as the inventory; discovery never creates or alters a declaration, and an inventory entry without a declaration is probe-ineligible for active checks.
4. **READ_ONLY limitations**: owned by `api-security-check-contract.md` (consolidated item "READ_ONLY limitations (FR-192)"); discovery makes no request and relies on none of it.
