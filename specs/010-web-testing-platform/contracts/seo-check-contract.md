# SEO Check Contract

Per `spec.md` FR-036 through FR-040. The SEO domain's own `WebCheckDefinition`s, spanning both
today's unchanged HTTP-only Evidence path and new Crawler/Browser-Engine Evidence.

## Evidence this domain consumes

- Today's existing `meta-checker`/`content-checker` findings (FR-005 parity, unchanged dispatch) —
  title/description/viewport/canonical/H1/`html lang`/alt-text/thin-content.
- `CRAWL_DISCOVERY` (internal-link graph, redirect chains, HTTP status per discovered page).
- `STRUCTURED_DATA` (JSON-LD/schema.org capture).
- `DOM_NODE` (rendered/client-side title/meta, for the mismatch check below).
- `robots.txt`/sitemap content, captured by the Crawler Engine (`crawler-contract.md`), consumed
  here as evidence only — never as a crawl-boundary signal (FR-021).

## `checkDuplicateMetadata` (FR-036, closure-pass addition)

```text
checkDuplicateMetadata(crawlCoverage: CrawlCoverageSummary, pages: { pageIdentity, title, description }[]) -> CheckOutcome[]
```

Flags two or more discovered pages sharing an identical title or description. Per FR-038's own
coverage-honesty discipline, applied identically here: this check only runs once `crawlCoverage`
reports sufficient (non-budget-truncated) coverage over the compared set — a budget-truncated
crawl's own partial page set is `INCONCLUSIVE` for duplicate-metadata purposes (comparing 40 of an
estimated 120 pages could both miss real duplicates and falsely suggest uniqueness).

## `deriveIndexability` (FR-037)

```text
deriveIndexability(signals: { httpStatus, robotsMeta?, xRobotsTag?, robotsTxtRule?, canonical? }) -> IndexabilityVerdict
```

Combines every available signal; when two signals disagree (e.g. `robotsTxtRule` allows but
`robotsMeta` says `noindex`), the verdict names the **actual blocking mechanism** explicitly (here:
the page's own meta tag, since it is the more specific, page-level signal) rather than reporting
only one signal or an ambiguous combined state.

## Orphan-page check (FR-038)

```text
checkOrphanPage(pageIdentity: PageIdentity, crawlCoverage: CrawlCoverageSummary) -> CheckOutcome
```

Returns `FINDING` (orphan) only when `crawlCoverage` itself reports sufficient completeness (not
budget-truncated below a fixed confidence bound) **and** no discovered page's internal-link graph
references this `pageIdentity`. A budget-truncated crawl → `INCONCLUSIVE`, never `FINDING` and
never silently `PASS`.

## Structured-data check (FR-039)

```text
validateStructuredData(raw: string) -> { valid: true, schemaType?: string } | { valid: false, parseError: string }
```

JSON-LD parse validity and known-schema required-property presence only, against a maintained
schema contract this spec does not itself author (a vendored, versioned schema-validation
component, per Constitution Principle II). Never asserts rich-result eligibility beyond what was
deterministically checked.

## Rendered-vs-static mismatch check (FR-040)

```text
checkRenderedVsStaticMismatch(staticSignal: string, renderedSignal: string) -> CheckOutcome
```

A difference between the two → `FINDING`, naming both values explicitly, never silently preferring
one.

## Non-negotiable boundary rules

1. `deriveIndexability` MUST name the specific blocking mechanism on a contradiction — never a
   generic "not indexable" with no stated cause.
2. `checkOrphanPage` MUST read `crawlCoverage`'s own completeness metadata before concluding
   orphan status — never infer completeness from the mere fact that a crawl ran.
3. `robots.txt` content informs `deriveIndexability` only — it MUST NOT be consulted by any
   function in this contract to decide whether a page was *reachable*, which is `crawler-
   contract.md`'s own, separate concern (FR-021).
4. No AI judgment may decide an indexability verdict, an orphan-page determination, or a structured-
   data validity result (FR-053).
