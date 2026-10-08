# Checklist: Accessibility Coverage and Honesty

## Automatability-Tier Discipline

- [x] CHK-A11Y001 Every registered Accessibility `WebCheckDefinition` declares exactly one of
  `AUTOMATED`/`PARTIALLY_AUTOMATED`/`HUMAN_JUDGMENT_REQUIRED` (FR-028) — no check with an undeclared
  tier can register.
- [x] CHK-A11Y002 No FR, contract, or success criterion anywhere in this package claims or implies
  full WCAG conformance from automated testing alone — confirmed by an explicit scan of `spec.md`'s
  own FR-028 wording and `accessibility-check-contract.md`'s own header.
- [x] CHK-A11Y003 The report-rendering obligation to display the tier next to any result is stated
  as a requirement (FR-028), not left to a future implementation's own discretion.

## Genuine Novelty Confirmation

- [x] CHK-A11Y004 The claim "zero accessibility-testing capability exists for customer targets
  today" was independently verified by searching for `axe`/`wcag`/`aria`-testing-logic across
  `packages/capabilities-vendored/` and `apps/worker/` — confirmed zero hits outside JSX attribute
  usage.
- [x] CHK-A11Y005 `apps/web`'s own internal E2E `@axe-core/playwright` usage is confirmed,
  explicitly, to test WebAudit's *own* product pages, not any customer-facing scan path — this
  distinction is stated in `spec.md`'s own FR-027, not merely assumed.

## Deterministic Measurement Discipline

- [x] CHK-A11Y006 Contrast checks are confirmed to use rendered, computed style — never source CSS
  color declarations alone (FR-030).
- [x] CHK-A11Y007 A contrast check against an unresolvable background (gradient/image/transparency
  stack) is confirmed to report `INCONCLUSIVE` with a stated reason, never a fabricated numeric
  ratio — verified against `accessibility-check-contract.md`'s own `computeContrast` signature.
- [x] CHK-A11Y008 Keyboard checks are confirmed to drive real key events and observe actual focus
  movement — never inferred solely from static ARIA/`tabindex` attribute presence (FR-029).
- [x] CHK-A11Y009 The keyboard-walk's own `maxSteps` bound is confirmed enforced regardless of page
  cooperation, and reaching the bound without returning to a seen focus target is itself recorded
  as a finding (likely focus trap) rather than silently discarded.

## Coverage Honesty

- [x] CHK-A11Y010 A check unable to run reliably on a given browser family is confirmed to report
  `UNSUPPORTED`, never a silent omission indistinguishable from `PASS` (FR-011, FR-041).
- [x] CHK-A11Y011 Every Accessibility check execution is confirmed to produce exactly one
  `CHECK_RESULT` Evidence row, including a `NOT_TESTED` row for a page where the check's own
  precondition was false.

## Evidence Provenance

- [x] CHK-A11Y012 Accessibility Findings are confirmed to trace, via `IssueEvidenceLink`, back to
  the exact `ACCESSIBILITY_NODE`/`DOM_NODE` Evidence and the exact `ExecutionUnit`/`BrowserMatrix
  Entry` that produced them (FR-042).

## Structural Honesty Enforcement (closure-pass addition)

- [x] CHK-A11Y013 A `HUMAN_JUDGMENT_REQUIRED` check's own `evaluate` function returning `PASS` or
  `FINDING` is confirmed to be overridden to `INCONCLUSIVE` by the Domain Check Registry itself —
  structural enforcement (FR-028a), not a convention the check's own author must remember. This
  closes the exact risk this spec's own closure instructions named: such a check must not
  accidentally receive a deterministic `PASS` merely because evidence was captured.
- [x] CHK-A11Y014 This override is enforced at one shared call site (`web-check-registry-
  contract.md`), not duplicated per check — a new `HUMAN_JUDGMENT_REQUIRED` check registered in
  the future inherits the protection automatically.
