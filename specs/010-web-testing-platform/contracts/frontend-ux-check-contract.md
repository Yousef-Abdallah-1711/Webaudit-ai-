# Frontend/UX Check Contract

Per `spec.md` FR-023 through FR-026. The Frontend/UX domain's own `WebCheckDefinition`s — structural
and visual, consuming Browser-Engine Evidence, independent of any `VisualBaseline`'s own approval
state.

## Structural checks (FR-023 — run regardless of baseline state)

Each of the following is a deterministic `WebCheckDefinition` (`domain: UI`) consuming `DOM_NODE`/
`SCREENSHOT` Evidence: horizontal/viewport overflow, clipped content, overlapping content,
off-screen interactive controls, broken responsive grids, touch-target sizing below a fixed
minimum, modal/`z-index` conflicts (a modal rendered behind another layer, or background content
remaining interactive while a modal is open), broken image rendering (a decode failure, distinct
from `screenshot-capture`'s existing HTTP-status-based broken-image check, FR-005 parity), safe-area
violations (content clipped by a device notch/rounded-corner inset where the matrix entry's
viewport models one).

## State-testing evidence sources (FR-024)

A loading/error/empty/success-state check's `evaluate` function MUST source its input from exactly
one of:

1. **Naturally observed** — the state the page actually rendered during ordinary navigation.
2. **Controlled simulation** — this domain's own bounded network-delay/offline simulation
   (`functional-workflow-contract.md`'s shared primitives, reused here).
3. **Workflow-triggered** — a Fahes-declared workflow step's own assertion (`functional-workflow-
   contract.md`).

An AI-inferred "this state probably also exists" is never a fourth source this contract accepts.

## Content-stress / RTL-i18n (FR-025)

Bounded, DOM-local/browser-local checks only: long-text/long-translated-label overflow, mixed-
direction layout breakage (consuming `BrowserMatrixEntry.direction`), text-scaling clipping. No
check in this contract mutates real customer data; every stress input is synthesized client-side
(a DOM-injected long string, not a submitted form value — form submission is `functional-workflow-
contract.md`'s own, separately safety-classified, concern).

## Visual regression (FR-026, consuming `visual-baseline-contract.md`)

A `SCREENSHOT_DIFF`-producing check reads `visual-baseline-contract.md`'s own `getActiveBaseline`
for the current `(pageIdentity, browserMatrixEntryHash)`. No active, approved baseline →
`NOT_TESTED` (never `PASS`, since nothing was actually compared, and never `FINDING`). An active
baseline exists → diff against it; exceeding a fixed threshold → `FINDING`.

## Non-negotiable boundary rules

1. FR-023's structural checks MUST NOT be gated on `VisualBaseline`'s own approval state in any
   way — the two check families are independent, and this contract never conflates them.
2. A content-stress check MUST NOT submit any value to the target's own backend — every stress
   scenario in this contract is rendered and inspected client-side only.
3. No AI judgment may decide a structural-check verdict or a diff-threshold outcome (FR-053).
