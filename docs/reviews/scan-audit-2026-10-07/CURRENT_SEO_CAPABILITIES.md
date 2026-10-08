# Current SEO / Search-Visibility Capabilities

Read-only audit, 2026-10-07.

## Full scanner inventory — SEO module (2 capabilities, both regex-on-fetched-HTML, module SEO)

| Capability | Checks |
|---|---|
| `meta-checker` | `<title>` present and non-empty (and <=60 chars, else a separate low-severity finding); `<meta name="description">` present and non-empty (<=160 chars); `<meta name="viewport">` present; `<link rel="canonical">` present. Regex extraction, not a DOM parser — attribute-order tolerant, both quote styles, case-insensitive |
| `content-checker` | Exactly one `<h1>` (0 -> HIGH finding, >1 -> LOW finding); `<html lang>` attribute present; images missing `alt` (aggregated into one finding with a count, not one finding per image); thin content (<200 visible words after stripping tags/scripts/styles) |

## Coverage matrix

| Item | Status | Evidence |
|---|---|---|
| Title / meta description / viewport / canonical | IMPLEMENTED | `meta-checker` |
| H1 structure / lang attribute / alt text / thin content | IMPLEMENTED | `content-checker` |
| robots.txt | NOT IMPLEMENTED | no capability fetches this file |
| sitemap.xml | NOT IMPLEMENTED | same |
| Indexability / noindex directive | NOT IMPLEMENTED | — |
| Structured data (schema.org / JSON-LD) | NOT IMPLEMENTED | — |
| OpenGraph / Twitter cards | NOT IMPLEMENTED | — |
| hreflang | NOT IMPLEMENTED | — |
| Redirect chains / broken links / status codes | PARTIAL, but owned by other modules — `network-inspector` (PERFORMANCE) and `playwright-runner` (TESTING) cover pieces of this, not SEO itself | cross-module, a labeling quirk worth noting |
| Duplicate metadata across pages | NOT IMPLEMENTED (no multi-page crawl exists at all, see architecture doc) | — |
| Heading structure beyond H1 count (H2-H6 hierarchy) | NOT IMPLEMENTED | — |
| Internal linking graph | NOT IMPLEMENTED | — |
| Rendered vs. server-rendered content (JS SEO) | NOT IMPLEMENTED — no browser rendering available (same dead `ctx.withPage` gap documented elsewhere) | — |
| Mobile-friendliness signals beyond viewport-tag presence | NOT IMPLEMENTED | — |
| Schema validation | NOT IMPLEMENTED | — |

## SEO maturity: Level 1-2

Real and deterministic for what it covers (seven distinct meta/content checks), but narrow: no crawl-based checks (robots/sitemap), no structured-data checks, no multi-page duplicate-content detection.
