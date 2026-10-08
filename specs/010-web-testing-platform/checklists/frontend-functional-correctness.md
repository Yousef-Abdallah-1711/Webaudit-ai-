# Checklist: Frontend/UX and Functional Correctness

## Structural Checks Independence

- [x] CHK-FF001 Every structural Frontend/UX check (overflow, clipping, overlap, off-screen
  controls, broken grids, touch-targets, modal/z-index, broken images, safe-area) runs regardless
  of any `VisualBaseline`'s own approval state — confirmed by `frontend-ux-check-contract.md`'s own
  explicit rule 1.
- [x] CHK-FF002 No structural check's `evaluate` function depends on a prior scan's own data —
  every structural check is a pure function of the current scan's own captured Evidence.

## State-Testing Honesty

- [x] CHK-FF003 Every loading/error/empty/success-state check's evidence source is traceable to one
  of FR-024's three named categories (naturally observed, controlled simulation, workflow-
  triggered) — no fourth, AI-inferred source exists anywhere in this spec's contracts.
- [x] CHK-FF004 A single browser console warning is confirmed, by FR-034's own explicit rule, never
  to be automatically a finding on its own — each check's own evaluator declares the required
  signal combination.

## Visual Regression Lifecycle

- [x] CHK-FF005 No `SCREENSHOT_DIFF` finding can be produced for a `(pageIdentity,
  browserMatrixEntryHash)` pair with no active, approved baseline — confirmed by `frontend-ux-
  check-contract.md`'s own visual-regression check logic (`NOT_TESTED`, not `PASS`, when
  `getActiveBaseline` returns `null`).
- [x] CHK-FF006 `approveBaseline` is confirmed the only write path to both `VisualBaseline` (the
  pointer) and `VisualBaselineApproval` (the history) — no other contract or FR describes an
  alternate way to set or record an approval. Re-verified during this spec's closure pass after
  the pointer/history split (`data-model.md` Closure Finding CF-1).
- [x] CHK-FF007 Supersession (a new approval replacing an old one) is confirmed atomic with the new
  history row's own insert, via a single database statement that acquires a row-level lock on the
  `VisualBaseline` pointer row — no window exists with two simultaneously-active pointer rows for
  the same triple (re-verified against the corrected schema, `research.md` R14, adversarial #26/C1).
- [x] CHK-FF017 (closure-pass addition) An active, approved baseline's `Artifact` is confirmed
  excluded from its originating scan's own report-retention-parity sweep (FR-026a) — this was a
  genuine product-policy gap the original draft correctly declined to invent, now resolved by the
  user and closed in both `data-model.md` and `contracts/visual-baseline-contract.md`.
- [x] CHK-FF018 (closure-pass addition) Every workflow step above `LOCAL_BROWSER_MUTATION` carries
  an atomic idempotency claim before executing its own server-affecting action — a retried step
  recognizes its own prior execution and does not duplicate a server-side persistent mutation
  (FR-032a, `research.md` adversarial C21).
- [x] CHK-FF019 (closure-pass addition) A workflow step's own `actionSafety` value, including
  `DESTRUCTIVE`, is confirmed to grant no capability by itself — every mutating step still requires
  an independently-granted, freshly-re-checked F01 authorization; this platform's own catalog
  cannot manufacture permission to run a destructive action (FR-032a, `research.md` adversarial
  C22).

## Content-Stress / RTL Safety

- [x] CHK-FF008 Every content-stress check is confirmed DOM-local/browser-local only — no FR or
  contract describes submitting a stress value to the target's own backend.
- [x] CHK-FF009 RTL support is modeled as a rendering-direction capability
  (`BrowserMatrixEntry.direction`), not hardcoded to a specific locale — confirmed by `data-model.
  md`'s own value-object shape.

## Functional Workflow Safety

- [x] CHK-FF010 Every registered workflow step declares exactly one of FR-032's five action-safety
  tiers — no step with an undeclared or ambiguous tier can execute.
- [x] CHK-FF011 A step classified above `LOCAL_BROWSER_MUTATION` is confirmed to call F01's
  `isAuthorized` fresh, every single step, every time — never once per workflow at its own start
  (`functional-workflow-contract.md` rule 2).
- [x] CHK-FF012 No `WorkflowStep.target`/`value` field accepts arbitrary script or is passed to
  `eval` — confirmed by the fixed, closed primitive set in `data-model.md` and FR-031's explicit
  rule.
- [x] CHK-FF013 This spec's workflow catalog is confirmed Fahes-declared only — no FR or contract
  describes a customer-authored workflow storage/editor surface, per this session's own confirmed
  product-policy decision.
- [x] CHK-FF014 Form-testing checks are confirmed composed entirely from the bounded primitive set
  (FR-033) — no form-testing check independently invents its own submission mechanism.

## Bounded Simulation

- [x] CHK-FF015 Slow-network/offline simulation duration is bounded by a fixed maximum (FR-035) —
  confirmed as a named requirement, not left open-ended.
- [x] CHK-FF016 The absence of offline-capable behavior is confirmed, by FR-035's own explicit
  rule, never itself a finding absent an explicit assertion.
