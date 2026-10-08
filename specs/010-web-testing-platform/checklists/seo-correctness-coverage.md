# Checklist: SEO Correctness and Coverage

## Current-Capability Fidelity

- [x] CHK-SEO001 The claim "today's AI prompt (`apps/worker/src/prompts/seo.ts`) names coverage no
  actual capability backs" was independently verified by reading both the prompt text and every
  SEO-adjacent capability's own code — confirmed, not assumed.
- [x] CHK-SEO002 Every SEO check this spec adds (FR-036) is confirmed to be genuinely new coverage,
  not a duplicate of an existing `meta-checker`/`content-checker` check — cross-checked against
  both files' own actual check lists.

## Indexability Correctness

- [x] CHK-SEO003 `deriveIndexability`'s contradiction-handling is confirmed to name the actual
  blocking mechanism, never collapsing two disagreeing signals into one ambiguous verdict (FR-037).
- [x] CHK-SEO004 `robots.txt` is confirmed, by FR-021's explicit rule and `seo-check-contract.md`'s
  own non-negotiable boundary rule 3, to inform indexability only — never to gate reachability,
  which remains `crawler-contract.md`'s own separate concern.

## Orphan-Page Honesty

- [x] CHK-SEO005 `checkOrphanPage` is confirmed to require sufficient (non-budget-truncated) crawl
  coverage before returning `FINDING` — a budget-truncated crawl returns `INCONCLUSIVE`, never
  `FINDING` and never `PASS` (FR-038).
- [x] CHK-SEO006 The coverage metadata a `checkOrphanPage` result depends on is confirmed to be the
  same metadata `coverage-contract.md`'s own `scanWebCoverageSummary` exposes — no second, private
  coverage computation exists inside the SEO domain.

## Structured Data

- [x] CHK-SEO007 `validateStructuredData` is confirmed to validate parse validity and known-schema
  required-property presence only — no FR or contract claims search-engine rich-result eligibility
  beyond deterministic validation (FR-039).

## Rendered vs. Static Signal Honesty

- [x] CHK-SEO008 A rendered-vs-static signal mismatch is confirmed to be surfaced as its own named
  finding category, never silently resolved by preferring one signal (FR-040).

## Crawl-Budget Interaction

- [x] CHK-SEO009 Sitemap-discovered URLs are confirmed to count against the Crawler's own
  `discoveryBudget` — a large sitemap cannot bypass the page-count ceiling via a separate code path
  (FR-022).
- [x] CHK-SEO010 Every SEO check's coverage verdict is confirmed to be one of this platform's own
  six-value taxonomy (`coverage-contract.md`) — no SEO-specific seventh coverage value exists
  anywhere in this package.

## Duplicate Metadata Honesty (closure-pass addition)

- [x] CHK-SEO011 `checkDuplicateMetadata` is confirmed to require sufficient (non-budget-truncated)
  crawl coverage before comparing pages for duplicate title/description — a truncated crawl's own
  partial page set resolves `INCONCLUSIVE` for this check, never a false uniqueness or false
  duplicate claim (FR-036, FR-038's identical coverage-honesty discipline applied here).
