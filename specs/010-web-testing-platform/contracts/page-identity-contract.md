# Page Identity Contract

Per `spec.md` FR-018. The one canonicalization function the Crawler Engine uses for in-crawl
deduplication — deliberately reusing F01's own normalization rules rather than inventing a second,
possibly-inconsistent algorithm.

## `computePageIdentity`

```text
computePageIdentity(url: WebDestination) -> PageIdentity   // PageIdentity is an opaque, comparable string
```

1. Apply F01's own `scope-matching-contract.md` normalization steps, in the same order that
   contract specifies: lowercase + punycode-fold the host; resolve the effective port; percent-
   decode and resolve `.`/`..` in the path; strip a trailing slash.
2. Discard the fragment entirely (never part of page identity).
3. Retain the query string **in full by default**. A query parameter is excluded from the
   comparable identity only if it appears on a fixed, explicitly-maintained allow-list of known
   non-semantic parameter names (session ids, common tracking/attribution parameters) this
   contract's own implementation ships and version-controls — **an unrecognized parameter is
   always treated as semantic** (closure-pass rule, `research.md` R-level closure finding): there
   is no heuristic, pattern-based, or AI-assisted stripping of any kind, and no "probably
   tracking" guess. Every parameter that survives exclusion is included, sorted by key, in the
   comparable identity.

## Relationship to `<link rel="canonical">`

`PageIdentity` is this spec's own crawl-dedup mechanism — it is **not** the same thing as a page's
own declared canonical URL, which is raw evidence the SEO domain evaluates on its own terms
(`seo-check-contract.md`'s own indexability logic, FR-037). Two pages with different `PageIdentity`
values MAY declare the same canonical target; this contract does not resolve that relationship.

## Non-negotiable boundary rules

1. This function is pure (no I/O, no database read) — identical posture to F01's own
   `scope-matching-contract.md`'s `isInScope`.
2. This function MUST NOT be used as a substitute for F01's own `isInScope` — identity and
   authorization are different questions; a `PageIdentity` match never implies anything about
   scope, and an `isInScope` result never implies anything about identity.
3. Step 3's exclusion list is an **allow-list**, never a heuristic — only a parameter name
   explicitly present on the maintained list may be excluded; every other parameter, known or not,
   is retained in the comparable identity by default. This MUST NOT strip a query parameter that
   changes the page's actual rendered content — master brief §32's own explicit "do not globally
   strip query strings if they are semantically meaningful" instruction, restated as a binding rule
   here, and strengthened by this closure pass's own "unknown = semantic by default" rule: a
   parameter is never excluded merely because it *looks* like it might be non-semantic.
4. Crawler-dedup identity (`PageIdentity`) and SEO canonical identity (`<link rel="canonical">`)
   MUST NOT be conflated anywhere in this platform — a check or contract that needs "is this the
   canonical URL for this content" asks `seo-check-contract.md`'s own indexability logic, never
   this contract's own dedup key, even though both are, coincidentally, strings derived from a URL.
