# Quickstart: Validating a Future Implementation Against SPEC 010

Extends 009's own eight-step child-spec validation checklist (since every future Engine
implementation — E10/E11 — and every future Domain implementation consuming this platform must
pass it against this spec specifically, not only against 009). This is a validation checklist for
a *future implementation session*, not something this planning pass itself runs.

## Part A — Engine implementation (E10 Browser/Probe, E11 Crawler)

1. Does the `BROWSER`/`CRAWLER`-class dispatch wrapper re-read the full `ExecutionUnit` from
   Postgres before acting on it (009's own FR-018), never trusting queue-payload content?
2. Does every **engine-chosen destination** (top-level navigation, redirect-of-navigation, popup,
   crawl-frontier expansion, workflow `navigate` step) call F01's `isInScope`/`isAuthorized` fresh,
   with zero caching across two different destinations — and is every **ordinary page subresource**
   (fonts/CSS/JS/images/analytics/embeds) left to `packages/safe-net`'s own unconditional egress
   policy instead, never independently F01-scope-checked (`research.md` R13)?
3. Is a fresh `BrowserContext` created per unit, with zero persisted state (cookies/storage/
   Service Workers) surviving its own teardown?
4. Are browser permissions (camera/mic/geolocation/clipboard/downloads/notifications) denied by
   default, with no override path?
5. Is the crawler's `discoveryBudget.maxPages` enforced via a single atomic conditional-increment
   statement against `CrawlBudgetCounter` (never a count-then-create sequence), and is
   `PageIdentity` dedup enforced via an atomic `IdempotentClaim` (never a bare SELECT-then-INSERT)?
6. Is every Evidence write routed through 009's own `recordEvidence` — zero direct writes to the
   `Evidence` table from engine code?
7. Does the `SIGKILL` deadline (009's own FR-019, reused) fire regardless of the browser
   process's own cooperation, and is the resulting outcome correctly triaged (`TIMEOUT` vs.
   `ENGINE_DEFECT`, FR-009)?
8. Is `@webaudit/redaction` called for every `CONSOLE_MESSAGE`/`HAR`/form-bearing `DOM_NODE`
   payload before persistence (FR-045)?

## Part B — Domain implementation (Frontend/UX, Accessibility, Functional Web, SEO)

9. Does every registered `WebCheckDefinition` declare `requiredEvidenceKinds`,
   `supportedBrowserFamilies`, and (for Accessibility) an `automatabilityTier` — with no field left
   implicit?
10. Does the check's own `evaluate` function read only already-committed Evidence — zero direct
    browser/network calls from Domain code?
11. Does every check execution produce exactly one `CHECK_RESULT` Evidence row, covering all six
    taxonomy values including `NOT_TESTED`/`UNSUPPORTED`/`BLOCKED`/`INCONCLUSIVE` — never a silent
    gap, and is this guaranteed by an atomic `IdempotentClaim` gate plus a plan-finalization
    `sweepUnresolvedChecks` pass rather than developer discipline alone (FR-041a)?
11a. Is `CHECK_RESULT` confirmed absent from every registered check's own `requiredEvidenceKinds`
    (rejected at registry load time if present) — closing recursive self-triggering structurally?
12. For Accessibility specifically: is the automatability tier rendered in every report alongside
    that check's result, and is a `HUMAN_JUDGMENT_REQUIRED` check's own `PASS`/`FINDING` verdict
    confirmed overridden to `INCONCLUSIVE` by the registry itself (FR-028a)?
13. For Functional Web specifically: does every workflow step declare an action-safety tier, and
    is F01's `isAuthorized` re-checked fresh for every step above `LOCAL_BROWSER_MUTATION`?
14. For SEO specifically: does `deriveIndexability` name the actual blocking mechanism on a
    contradiction, and does `checkOrphanPage` refuse to assert orphan status from a budget-
    truncated crawl?
15. Does a `FINDING`-verdict check call 009's own `materializeFinding` with correct
    `supportingEvidenceIds` and (where viewport-specific) `BrowserMatrixEntry` identity in
    `fingerprintParts`?

## Part C — Platform-wide consumption discipline

16. Does the implementation introduce zero private replacement for `ScanPlan`/`ExecutionGraph`/
    `ExecutionUnit`, queueing, progress, cancellation, `Evidence`/`Artifact`, or Finding
    provenance?
17. Does the implementation introduce zero widening of 009's own `ExecutionUnitClass` enum?
18. Is reverify for any `ExecutionUnit`-sourced finding routed through 009's own FR-029 fresh-
    minimal-plan mechanism (with the one named orphan-page exception, FR-043), never a bespoke
    reverify path?
19. Is today's existing five-`ModuleType` HTTP-only dispatch, pricing, and scan-creation UX
    confirmed unchanged by `git diff`?
20. Does every new persisted construct (`VisualBaseline`/`VisualBaselineApproval`/
    `IdempotentClaim`/`CrawlBudgetCounter` and any future Domain-specific addition) re-derive
    tenant ownership rather than performing a bare id lookup?
21. (closure-pass addition) Does `approveBaseline` perform the pointer-upsert-plus-supersession as
    one atomic transaction, and does an active approval's own `Artifact` get excluded from its
    originating scan's retention sweep per FR-026a?
22. (closure-pass addition) Does every workflow step above `LOCAL_BROWSER_MUTATION` carry an
    `IdempotentClaim` before executing its own mutation, and is a step's `DESTRUCTIVE`
    classification confirmed to grant no capability absent an independently-passing, freshly
    re-checked F01 authorization (FR-032a)?

All twenty-two steps MUST pass before a future implementation session may consider itself
consuming this platform's contracts correctly, per this spec's own SC-005 bar.
