# Scope-Matching Contract

Per FR-007/FR-008/FR-010. This is the deterministic function `isAuthorized` (the authorization-check
contract) calls internally to evaluate whether a `destination` is admitted by a `ScopeDefinition` —
exposed separately here because future engines (Browser, Crawler, Active Security) also need to
call it directly and repeatedly *within* one execution (e.g. a crawler deciding, per discovered
link, whether to follow it) without going through the full authorization check each time.

## Signature (shape)

```text
isInScope(scope: ScopeDefinition, destination: WebDestination | RepositoryDestination) -> boolean
```

## Normalization (applied before matching, per FR-008 — order matters)

For a `WebDestination`:
1. Lowercase the host, strip exactly one trailing `.` if present (`example.com.` and `example.com`
   are the same host for matching purposes), then apply punycode-folding (so a Unicode-homograph
   host and its punycode-encoded form normalize identically — closes the "Unicode/punycode bypass"
   class of scope-escape attempt). The query string, if any, is discarded before any other step —
   it is never part of the comparable destination (per `spec.md` FR-007's query-string exclusion).
2. Resolve the effective port: if `destination.port` is absent, use the scheme's standard port
   (`80`/`443`); a scope pattern's own `ports` field (if non-empty) is compared against this
   resolved port, never against "absent".
3. Percent-decode the path, then resolve `.`/`..` segments against the root (closes the "path
   encoding bypass" class — a request for `/%2e%2e/admin` and a request for `/admin`'s sibling
   normalize to the same comparable path before any prefix check runs).
4. Strip a trailing slash from both the normalized path and every configured path-prefix pattern
   before prefix comparison (so `/api` and `/api/` are treated as the same prefix boundary).

For a `RepositoryDestination`: lowercase `repositoryFullName` for comparison (matching the existing
`REPO_PATTERN` canonical-form convention); `ref` and path prefixes are compared exact/normalized the
same way as the web path rule above.

## Matching algorithm

```text
function isInScope(scope, destination):
    normalized = normalize(destination)   # per the rules above
    if matchesAnyExclusion(scope, normalized): return false
    return matchesAnyInclusion(scope, normalized)
```

`matchesAnyExclusion`/`matchesAnyInclusion` evaluate each dimension (host, path-prefix, scheme/
port, or for repositories: repo name, ref, path-prefix) **independently** — an exclusion entry in
`excludedHosts` disqualifies the destination regardless of what `excludedPathPrefixes` says, and
vice versa; dimensions are never combined into a single compound pattern a destination must match
as a whole. This means a destination is excluded if *any* configured exclusion list, on its own
dimension, matches it — exclusion lists are ORed together across dimensions, the same way inclusion
lists are (FR-008's "at least one inclusion entry matches" already implies this for inclusion; this
paragraph makes the same rule explicit for exclusion, closing the ambiguity of whether an exclusion
match requires agreement across dimensions).

- **Host matching** (`WEB` scope): an entry matches if it equals the normalized host exactly, or if
  it is of the form `*.example.com` and the normalized host has exactly one additional label
  prepended to `example.com` (i.e. `a.example.com` matches `*.example.com`; `a.b.example.com` does
  NOT match `*.example.com` — per Clarifications 2026-10-07's single-level-wildcard decision; there
  is no flag to widen this to recursive matching in this spec's scope — a future spec that
  genuinely needs recursive matching extends this contract additively with its own justification).
- **Path-prefix matching**: an entry matches if the normalized destination path starts with the
  normalized entry, on a path-segment boundary (`/api` matches `/api/v1/users`, not `/apiary`).
- **Scheme/port matching**: the destination's resolved scheme/port must be in the scope's `schemes`/
  `ports` list, or that list must be empty (meaning "default only," per FR-007).
- **Repository matching**: `repositoryFullName` must equal exactly; `ref` must be in
  `includedRefs`/not in `excludedRefs` by exact string match (no glob, per FR-007); path prefixes
  follow the same rule as web.

## Redirect / cross-origin / crawl-frontier rule (FR-010)

This contract is called **fresh, for the actual destination reached**, every single time a browser
follows a redirect, loads a cross-origin resource, or a crawler expands its frontier to a new URL —
never inferred from the fact that some *other*, already-admitted URL on the same request chain was
in scope. There is no "same-site" or "known CDN host" special case anywhere in this contract: a CDN
host is in scope if and only if it independently satisfies the matching algorithm above against the
same `ScopeDefinition` an engine is already enforcing for the rest of its traversal.

## Non-negotiable boundary rules

1. This function MUST NOT accept or evaluate a raw user-supplied regular expression under any
   circumstance (FR-007) — every pattern this contract ever compares against is one of the
   structured field types `data-model.md` defines.
2. Exclusion MUST be evaluated against the full, normalized destination before inclusion is checked
   (FR-008) — never the reverse order, and never "first match wins" across a combined, unordered
   list that does not distinguish inclusion from exclusion.
3. This function is pure (no I/O, no database read) — it operates only on the `ScopeDefinition`
   object and the `destination` object already passed to it; it does not itself resolve DNS, follow
   redirects, or fetch anything. Normalization above is string/structural manipulation only.
