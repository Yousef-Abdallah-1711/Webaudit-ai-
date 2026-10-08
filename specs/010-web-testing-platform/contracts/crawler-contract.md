# Crawler Contract

Per `spec.md` FR-016 through FR-022. How a `CRAWLER`-class `ExecutionUnit` discovers bounded,
in-scope work and hands it to 009's own additive runtime-discovered-child-unit mechanism.

**Closure-pass revision (2026-10-08)**: the original draft said budget/dedup were "hard ceilings
enforced by counting actually-created child units" without naming an atomic mechanism — under
concurrent discovery workers, a bare count-then-create sequence races. This revision names the
exact atomic primitives (`research.md` R16).

## `dispatchCrawlerUnit`

```text
dispatchCrawlerUnit(executionUnitId: string) -> void
```

1. Read this unit's own `discoveryBudget` (`{ maxPages, maxDepth, maxConcurrency }`) from
   `configuration` (FR-016), and this crawl's `crawlRootExecutionUnitId` (the originating seed
   unit, shared by every descendant discovery unit in this plan).
2. Fetch the current frontier entry (seed URL, or a URL handed off from a prior discovery pass).
   Apply FR-020's response-size ceiling (checked during streaming decompression, never after
   fully buffering, `research.md` adversarial #23) and redirect-hop ceiling before attempting to
   parse.
3. Extract candidate links (and, if this is the seed unit, sitemap-referenced URLs, FR-022).
4. For each candidate: compute its `PageIdentity` (`page-identity-contract.md`). Attempt an
   `IdempotentClaim` (`data-model.md`) with `scope: "crawl-discovery"` and `claimKey:
   "${crawlRootExecutionUnitId}:${pageIdentity}"`. No row won → this exact page was already
   claimed (by this or a concurrently-running discovery unit) — record `CRAWL_DISCOVERY` Evidence
   with `scopeVerdict: "DUPLICATE"` and move to the next candidate. This is the atomic,
   race-safe dedup gate: two concurrent discovery units racing for the identical `PageIdentity`
   cannot both win (`research.md` R16's guarantee).
5. Claim won → call F01's `isInScope`/`isAuthorized` fresh for this exact destination (F01's own
   scope-matching-contract crawl-frontier rule, reused unchanged — see `research.md` R13 for the
   precise navigation/subresource scoping this applies to). Out of scope → record `CRAWL_
   DISCOVERY` Evidence with `scopeVerdict: "REFUSED_OUT_OF_SCOPE"` (FR-017); set this claim's
   `resultRef` to that Evidence row's id; never create a child unit for it.
6. In scope → attempt the atomic budget reservation: `UPDATE "CrawlBudgetCounter" SET
   "pagesCreated" = "pagesCreated" + 1 WHERE "crawlRootExecutionUnitId" = $1 AND "pagesCreated" <
   $maxPages RETURNING "pagesCreated"` (`data-model.md`'s own named raw query). No row affected
   (budget exhausted) → record `CRAWL_DISCOVERY` Evidence with `scopeVerdict: "BUDGET_EXHAUSTED"`;
   set this claim's `resultRef` accordingly; create no child unit. `maxDepth` is checked locally
   (this candidate's own hop-count from the seed, no shared state, no race possible) alongside the
   reservation.
7. Reservation succeeded → create a child `ExecutionUnit` (009's own execution-unit-contract.md
   generation rule for frontier-driven classes, reused unchanged) of class `CRAWLER` (further
   traversal) or `BROWSER` (a page needing rendering), recording `CRAWL_DISCOVERY` Evidence with
   `scopeVerdict: "FOLLOWED"`; set this claim's `resultRef` to the new child unit's id.
8. When this unit's own frontier is exhausted or the budget was hit during this unit's own pass:
   record `CRAWL_DISCOVERY` Evidence with `scopeVerdict: "BUDGET_EXHAUSTED"` for every remaining
   undiscovered candidate this unit itself observed, and finalize cleanly (FR-020) — never hang
   waiting for budget that will not arrive. Budget exhaustion is recorded as coverage information
   (consumed by `coverage-contract.md`/`seo-check-contract.md`'s own orphan-page honesty rule,
   FR-038), never as this `ExecutionUnit`'s own `FAILED` outcome.

## `robots.txt` handling (FR-021 — this spec's own Clarifications)

`robots.txt` is fetched and its content recorded as Evidence for the SEO domain's own indexability
logic (`seo-check-contract.md`). This contract's own step 5 scope check is never informed by
`robots.txt` — a `Disallow`-listed path that is in F01 scope is still a valid discovery candidate.

## Non-negotiable boundary rules

1. Step 5's scope check MUST run fresh for every candidate, every time — never inferred from the
   fact that the page that linked to it was itself in scope (F01's own rule, reused; identical
   framing to 009's own Edge Cases for the identical CRAWLER scenario).
2. `maxPages` MUST be enforced via the single atomic conditional-increment statement (step 6) —
   never a separate count-then-create sequence in application code. `maxDepth` MUST be computed
   from the candidate's own discovery path, never from a shared counter.
3. Dedup (step 4) MUST use the `IdempotentClaim` atomic-claim primitive — never a bare `SELECT`-
   then-`INSERT` sequence, which races under concurrent discovery workers exactly as this closure
   pass was asked to eliminate.
4. A `PageIdentity` match (step 4) MUST use `page-identity-contract.md`'s own normalization exactly
   — no call site invents its own, looser or stricter, comparison. An unrecognized query parameter
   is semantic by default (`page-identity-contract.md`'s own closure rule) — it is never collapsed
   away by a guess.
5. This contract decides only discovery — it MUST NOT itself decide a SEO/content finding (FR-001).
6. No AI judgment may decide a scope, dedup, or budget outcome (FR-053).
