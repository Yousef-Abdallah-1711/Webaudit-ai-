# Contract: Source Correlation Identifiers

Per FR-131, FR-132, FR-120, FR-092. Defines the stable identifiers that let SPEC 012/013/014 correlate source, backend route, frontend route, runtime URL, build artifact and deployment commit. Identifiers only: no readiness engine, no cross-domain decision. Consumers: SPEC 012 (live API testing), SPEC 013 (performance and observability), SPEC 014 (cross-domain correlation and readiness), Source Check fingerprints.

## Signature (shape, not final TypeScript)

```text
computeSourceIdentity(workspaceRelPath, symbolPath?, anchor?) -> SourceIdentity     // opaque comparable string
computeRouteIdentity(method, routePattern, framework?)       -> RouteIdentity
computeBuildArtifactIdentity(workspacePath, kind, outputRelPath, snapshotDigest, templateId) -> BuildArtifactIdentity
normalizeCommitId(input) -> DeploymentCommitId | null
```

All four are pure functions (no I/O, no database read).

## Inputs

Observation and inventory data from E12 and from `EXECUTION_STEP_RESULT`; a commit identifier supplied by a downstream spec (for example from a deployment record).

## Outputs

Identifier strings embedded in Evidence (`SOURCE_LOCATION`, `SOURCE_SURFACE`, `CONTRACT_RESULT`, `EXECUTION_STEP_RESULT`, `SOURCE_MANIFEST`) and used as fingerprint parts.

## Ownership

Context X, with Context B producing source and route identifiers and Context C producing build-artifact identifiers. Owning spec: 011. Frozen once 011 is frozen; downstream specs consume, never redefine.

## Invariants

1. Grammar (ABNF-style, exact):
   - `SourceIdentity = "src:" pct(wsPath) ":" pct(relPath) [ "#" pct(symbolPath) ]`; `wsPath` = workspace path (`.` for root); `relPath` = workspace-relative; both NFC, `/`-separated, no leading `./`, no `..`; `symbolPath = ident *( "." ident )`, class members joined by `.`, never by `#`. `pct(x)` percent-encodes `%`, `:` and `#` (and control characters) as `%XX`, so a path containing `:` or `#` cannot make `src:a:b:c` ambiguous.
   - `RouteIdentity = "route:" pct(wsPath) ":" METHOD " " pattern`; `wsPath` is the workspace/service the route is declared in (`.` for root), `METHOD` uppercase, `pattern` per invariant 2. Including the workspace keeps two services in one monorepo that both expose `GET /health` distinct (their findings must not merge, FR-120); SPEC 012 joining a runtime URL to a route must supply the service/workspace key, and an unresolvable service is reported as `surfaceComplete: false`, never guessed.
   - `BuildArtifactIdentity = "build:" wsPath ":" kind ":" outRelPath "@" digest12`; `kind` in `{ "js-bundle", "next", "vite", "nuxt", "tsc", "other" }`; `digest12` = first 12 hex of the snapshot `contentDigest`.
   - `DeploymentCommitId = "commit:" sha40` where `sha40` is 40 lowercase hex chars.
2. Route normalization: strip query and fragment; collapse repeated `/`; ensure leading `/`; remove trailing `/` except root; lowercase the static segments only if the framework is case-insensitive by default, otherwise preserve case; convert every parameter syntax to `{name}` (Express `:id`, NestJS `:id`, Fastify `:id`, Next.js `[id]` and `[...slug]` to `{id}` and `{slug*}`, OpenAPI `{id}` kept); optional segments (`[[...slug]]`, `:id?`) emit both resulting patterns as separate identities; wildcard `*` becomes `{*}`; global prefix (for example NestJS `setGlobalPrefix`) is prepended only when statically provable, else the identity is flagged `prefixUnknown: true`.
3. `METHOD` is one of `GET HEAD POST PUT PATCH DELETE OPTIONS`; `all()` registrations expand to the explicit methods the framework implies and are marked `expanded: true`.
4. Commit normalization: accept a 40-hex SHA of any case (lowercased) or a 7 to 39 hex abbreviation, which is NOT promoted to a full identity (returns `null` unless a resolved full SHA is supplied); anything else returns `null`. Tags and branch names are never commit identities.
5. Where each appears: `SourceIdentity` in `SOURCE_LOCATION` and as the path part of source-rule fingerprints; `RouteIdentity` in `SOURCE_SURFACE`, `CONTRACT_RESULT` and route fingerprints; `BuildArtifactIdentity` in `EXECUTION_STEP_RESULT` for build steps; `DeploymentCommitId` in `SOURCE_MANIFEST` (`resolvedCommitSha` rendered as `commit:<sha>`).
6. Stability guarantees: identifiers exclude line numbers, column numbers and tool versions, so a line insertion does not change them; a file rename or symbol rename changes `SourceIdentity` (accepted limitation); the same route inventory yields the same `RouteIdentity` set regardless of registration order; `digest12` ties a build identity to one snapshot, so a new commit yields a new build identity.
7. Source and ref identity: `SourceIdentity` and `RouteIdentity` are workspace-relative and independent of the ref. For GitHub input the identity of the content is the resolved commit SHA (`commit:<sha>`), never a branch name, so a request with no explicit ref (default branch resolved to a SHA) correlates by SHA. A ZIP upload has no commit: `SOURCE_MANIFEST` carries no `DeploymentCommitId` (`normalizeCommitId` returns `null`), and correlation with an upload uses `SourceIdentity`/`RouteIdentity` plus the snapshot `contentDigest` only. The F01 destination ref (default branch name, or `""` for ZIP) is an authorization identity, not a correlation identifier.
8. Identifier grammar is versioned (`correlationGrammarVersion: 1`, recorded in `SOURCE_MANIFEST`); a grammar change is a new version and requires an upstream amendment request, not a silent edit.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|---|---|---|---|
| Route pattern not statically derivable | `DYNAMIC_ROUTE_UNRESOLVED` | none | route omitted from inventory; dependent checks `INCONCLUSIVE` |
| Framework unsupported for route extraction | `UNSUPPORTED_FRAMEWORK` | none | `UNSUPPORTED` |
| Malformed commit input | (none; returns `null`) | none | caller treats as absent |
| Identity function throws | (none; class only) | `ENGINE_DEFECT` | dependent checks `BLOCKED` |

## Safety

Identifiers contain only paths, symbol names, route patterns, a digest prefix and a commit SHA. They never contain file contents, secrets, query values or credential-file paths; excluded credential files produce no identity.

## Idempotency

Pure and deterministic; identical inputs always produce identical strings. Evidence carrying them follows the owning contract's idempotency keys.

## Consumers and hand-off

1. SPEC 012: joins `RouteIdentity` from `SOURCE_SURFACE` with live API observations; commit identity from its deployment inputs via `normalizeCommitId`.
2. SPEC 013: joins `RouteIdentity` and `BuildArtifactIdentity` to performance and observability data.
3. SPEC 014: performs cross-domain correlation and readiness using these identifiers plus SPEC 010's own `PageIdentity` for web pages; this contract defines no mapping between `PageIdentity` and `RouteIdentity`.

## Non-negotiable boundary rules

1. This contract MUST NOT redesign, extend or reference internals of SPEC 010 `PageIdentity`; the two identifier families are never conflated.
2. This contract implements no readiness engine, no scoring, and no cross-domain verdict; correlation decisions belong to SPEC 014.
3. Identifiers MUST NOT embed line numbers, tool versions, timestamps or secrets.
4. A commit identity MUST be a full 40-hex SHA; a branch, tag or abbreviation is never a commit identity.
5. Downstream specs MUST consume these grammars as defined; any need for a different grammar MUST be raised as an upstream amendment request, not a private variant.
6. Identifier functions MUST be pure; none may read the repository, network or database.
7. A route that cannot be statically derived MUST be omitted with a recorded reason (`DYNAMIC_ROUTE_UNRESOLVED`), never guessed.
8. Reason codes MUST come from the registry in `source-evidence-contract.md`.
