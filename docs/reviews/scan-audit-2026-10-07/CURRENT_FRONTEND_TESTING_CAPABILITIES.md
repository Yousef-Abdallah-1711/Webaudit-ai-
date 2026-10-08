# Current Frontend / UX / Resilience Capabilities

Read-only audit, 2026-10-07.

## Full scanner inventory — UI/"Design" module (3 capabilities)

| Capability | Layer | Mechanism | Measures |
|---|---|---|---|
| `screenshot-capture` | CODE | `ctx.fetch` (works) + `ctx.withPage` (dead) | Working: broken `<img>` references — resolves the URL, confirms status<400 and a real `image/*` Content-Type (<=15 images sampled). Dead: horizontal overflow (`scrollWidth` vs `clientWidth`), tiny tap targets (<24px interactive elements), blank-page-render liveness check (full-page screenshot byte-length) |
| `css-analyzer` | CODE | Source only | Stylesheet byte size (>300KB); `!important` ratio (>2% of declarations, floor of 10 uses); distinct hard-coded colour count (>48) — regex-counted after stripping comments/strings, not a CSS parser |
| `impeccable` | **AI** | No code layer at all. Contributes a system-prompt addition (spacing/hierarchy/contrast/alignment/visual-noise critique criteria) + a context string built from `ui.*`-namespaced code findings and the design-intent questionnaire answers, to the single per-module AI call | Design critique — explicitly a judgment call, not a measurement, per its own module comment: "a design critique is inherently a judgment call... Principle III's 'anything measurable is measured [in the code layer]'" |

Because the rendering-dependent half of `screenshot-capture` is dead in current deployments (same unwired `ctx.withPage` gap as Performance/CWV), `impeccable`'s AI critique today runs on a reduced signal: broken-image findings plus whatever design-intent text the questionnaire captured — not the overflow/tap-target measurements its own context-builder was written to use.

## Frontend/UX/resilience matrix (customer-target testing only — Fahes's own dev Playwright/axe-core suite under `apps/web/tests/` is explicitly excluded per the audit brief's own instruction, since it tests Fahes's own UI, not a customer's)

| Capability | Tested today for customer targets? | Mechanism | Evidence quality |
|---|---|---|---|
| Responsive/viewport issues | NOT IMPLEMENTED | — | — |
| Visual regression (baseline + diff) | NOT IMPLEMENTED | no baseline store, no pixel/perceptual diff, no viewport/browser/locale matrix anywhere in `capabilities-vendored` | HIGH confidence of absence |
| Layout shift | PARTIAL, dead | `cwv-analyzer`'s CLS measurement (see Performance doc) | — |
| Loading / error / empty states | NOT IMPLEMENTED | — | — |
| Form validation / double submit | NOT IMPLEMENTED | no form-interaction code exists | — |
| Accessibility (axe-core-class testing) | NOT IMPLEMENTED | `@axe-core/playwright` is a devDependency of Fahes's own `apps/web` test suite only — never imported by any `capabilities-vendored/*` package | HIGH |
| Contrast | NOT IMPLEMENTED as a deterministic check (only as an unstructured AI critique dimension via `impeccable`) | — | — |
| RTL/LTR, cross-browser, offline/slow-network simulation | NOT IMPLEMENTED | — | — |
| Content stress (long text, Arabic/RTL, 0/1/1000 records) | NOT IMPLEMENTED | would require authenticated test accounts or API-level fixture injection, neither of which exists | — |
| 200%/400% zoom, text scaling | NOT IMPLEMENTED | — | — |
| Broken images | IMPLEMENTED | `screenshot-capture` | HIGH |
| Horizontal overflow, tiny tap targets | SPECIFIED, NOT OPERATIVE | `screenshot-capture`, gated on the dead browser pool | HIGH |

## Visual regression architecture — explicit distinction

Fahes's own `apps/web/tests/visual/` and related Playwright/axe-core suites develop and verify **Fahes's own product UI**. They are not invoked by the scan engine against any customer target — confirmed by searching every `capabilities-vendored/*/package.json` for a `playwright`/`axe-core` dependency: none found. The only place these libraries appear as real dependencies is `apps/web/package.json` (Fahes's own E2E suite) and `apps/probe-pool/package.json` (the unwired browser-pool library). There is no baseline-screenshot store, no diff threshold, no approved-baseline workflow, and no comparison-artifact model for customer targets.

## Content stress testing

Testing customer UIs with long/translated text, Arabic/RTL content, missing images, or 0/1/100/1000-record states would require either: customer-provided test fixtures, an authenticated test account, API-level mocking, or full browser automation against a live rendering — none of which exist in the current architecture. This is a new capability, not an extension of an existing one.

## Frontend/UX maturity: Level 1

One fully operative deterministic check (broken images, HTTP-based) plus one AI judgment call running on reduced signal. The specified Level 2-3 capabilities (overflow, tap targets, CWV, visual regression) are blocked entirely on the same single piece of missing infrastructure: a deployed, cross-process browser-pool service.
