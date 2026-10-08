# Accessibility Check Contract

Per `spec.md` FR-027 through FR-030. The Accessibility domain's own `WebCheckDefinition`s,
consuming the Browser Engine's real axe-core pass — genuinely new capability (`research.md`'s own
confirmation that zero customer-facing accessibility testing exists today).

## Evidence this domain consumes

- `ACCESSIBILITY_NODE` (009's own existing `EvidenceKind`) — the raw axe-core result set, captured
  by the Browser Engine running axe-core inside its own child process against the rendered page
  (`browser-execution-contract.md` step 6).
- `DOM_NODE` — for keyboard/focus-sequence checks (FR-029), which need more than axe-core's own
  static-analysis pass can provide.

## Automatability-tier declaration (FR-028, mandatory on every registered check)

Every Accessibility `WebCheckDefinition` MUST declare exactly one of:

- `AUTOMATED` — axe-core's own deterministic rule output (e.g. missing `alt`, invalid ARIA
  attribute value, duplicate `id`).
- `PARTIALLY_AUTOMATED` — a check this platform can run deterministically but whose result requires
  human confirmation to be conclusive (e.g. "focus order *looks* sequential" vs. "focus order is
  logically correct for this specific page's intent").
- `HUMAN_JUDGMENT_REQUIRED` — a check this platform can surface evidence for but cannot itself
  verdict (e.g. "is this alt text *meaningful*," not merely present).

A report MUST render this tier next to any result from the check it belongs to (`spec.md`'s own
explicit requirement) — no report produced by this platform may imply full WCAG conformance from
automated testing alone.

**Structural override (FR-028a, closure-pass addition)**: a `HUMAN_JUDGMENT_REQUIRED` check's own
`evaluate` function MAY return `PASS`/`FINDING`, but the Domain Check Registry
(`web-check-registry-contract.md`) overrides either to `INCONCLUSIVE` before recording it — this
contract's own checks MUST NOT rely on their own `PASS`/`FINDING` return value being persisted
as-is when declared at this tier, and MUST NOT be written expecting that override to be bypassable.

## Keyboard interaction checks (FR-029)

```text
runKeyboardWalk(page: AuditPage, maxSteps: number) -> FocusSequence
```

Drives real `Tab`/`Shift+Tab`/`Enter`/`Space`/`Escape`/Arrow-key events through the Browser
Engine's own page-interaction primitives (`browser-execution-contract.md`) and records the actual
resulting focus-target sequence as `DOM_NODE` Evidence. `maxSteps` is a fixed bound (this contract
does not fix the number) preventing an infinite-tab-loop page from hanging the check — reaching
`maxSteps` without returning to a previously-seen focus target is itself recorded as a
`FINDING` (a likely focus trap) rather than silently truncated with no result.

## Contrast checks (FR-030)

```text
computeContrast(element: ComputedStyleRef) -> { ratio: number } | { inconclusive: true, reason: string }
```

Reads the rendered, computed foreground/background/opacity/theme-state. Returns `inconclusive`
(never a fabricated ratio) when the element's effective background cannot be deterministically
resolved to a single flat color (a CSS gradient, a background image, a transparency stack with
more than one layer).

## Non-negotiable boundary rules

1. Every check MUST declare an automatability tier (FR-028) — a check with no declared tier is a
   registration-time error, never silently defaulted to `AUTOMATED`.
2. `computeContrast`'s `inconclusive` path MUST NOT be bypassed by a heuristic best-guess ratio —
   `INCONCLUSIVE` is the only honest outcome when the background cannot be resolved (FR-030).
3. `runKeyboardWalk`'s `maxSteps` bound MUST be enforced regardless of the page's own cooperation —
   identical posture to 009's own `SIGKILL`-deadline philosophy, applied here at the check-
   evaluation layer rather than the process layer.
4. No AI judgment may decide an axe-core rule's own pass/fail, a focus-sequence verdict, or a
   contrast resolvability determination (FR-053).
