# Current Source & Testing Capabilities

Read-only audit, 2026-10-07.

## "Testing" domain — what the word actually means today (2 capabilities, module TESTING)

| Capability | Mechanism | What it is |
|---|---|---|
| `playwright-runner` | `ctx.fetch` only (no browser), same-origin links extracted from the fetched page's own markup, up to 15 sampled, skipping `mailto:`/`tel:`/`javascript:`/`data:` | **Broken same-origin link detection.** Explicitly named for the tool class but scoped, by its own module comment, to "the one genuinely answerable through `ctx.fetch` alone" — no clicking, no form submission, no navigation flow, no browser at all |
| `contradiction-detector` | No network, no page — reads only `input.priorModuleResults` (the aggregate score/state/finding-count summaries the *other* modules already produced in this same scan) | **A QA-of-QA check on the audit's own internal scoring consistency** — flags e.g. a module scoring "healthy" (>=90) despite carrying a CRITICAL/HIGH finding, or a module marked FAILED (meaning "measured nothing") while still reporting findings. This is a check on Fahes's own output, not a claim about the customer's site at all |

**Direct answer**: "Testing" today means (a) does every same-origin link on one fetched page resolve, and (b) is this audit's own scoring internally consistent. It does not mean unit tests, integration tests, contract tests, E2E tests, browser interaction, form tests, navigation tests, auth tests, checkout/payment tests, or execution of the customer's own test suite in any form.

## Source-level analysis depth (repository/archive input)

| Item | Status | Evidence |
|---|---|---|
| Framework detection | NOT IMPLEMENTED | no capability inspects framework signatures |
| Dependency install / build execution | NOT IMPLEMENTED | sandbox-runner executes Fahes's own harness, never the customer's package scripts (see CURRENT_SCAN_ARCHITECTURE.md §6) |
| Running the customer's own test suite | NOT IMPLEMENTED | — |
| Lint / typecheck of customer code | NOT IMPLEMENTED | — |
| SAST | NOT IMPLEMENTED | zero AST tooling as a dependency in any of the 16 vendored capability packages |
| Dependency vulnerability audit | PARTIAL, weak — 8-entry hardcoded advisory table | `dependency-scanner/src/advisories.ts` |
| Secret scanning | IMPLEMENTED | `data-leak-scanner` via `@webaudit/redaction` |
| Code-quality rules (beyond CSS metrics) | NOT IMPLEMENTED for JS/TS logic | — |
| DB schema / migrations inspection | NOT IMPLEMENTED | — |
| API routes / auth middleware / permission logic inspection | NOT IMPLEMENTED | — |
| ORM usage / raw SQL inspection | NOT IMPLEMENTED | — |
| Validation-schema / upload-handler / webhook inspection | NOT IMPLEMENTED | — |

What does run against source, concretely: `dependency-scanner` (manifest/lockfile regex + the 8-entry advisory table), `bundle-analyzer` (byte-size/minification/sourcemap heuristics restricted to recognized build-output directories), `css-analyzer` (regex metrics on stylesheet text), `data-leak-scanner` (secret-pattern matching, source or fetched-page). All four are regex/metric-based. Zero AST parsing, zero symbolic/dataflow analysis, zero LLM-based code reading exists anywhere in `capabilities-vendored`. CONFIDENCE: HIGH — this is a repository-wide design decision stated explicitly in multiple capabilities' own module comments (e.g. `meta-checker`: "No HTML parsing library is a dependency anywhere in this repo").

## Source maturity: Level 1

Regex/manifest-level metrics only, by deliberate design choice recorded in the source itself, not by omission.
