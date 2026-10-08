# Coverage Contract

Per `spec.md` FR-041. The check-level coverage taxonomy that extends 009's own `scanCoverageSummary`
(unit-level: what ran) one level down to individual checks (what was actually decided, and how
confidently) — the structural guarantee behind this spec's own User Story 2.

## The six-value taxonomy

```text
CheckVerdict = "PASS" | "FINDING" | "NOT_TESTED" | "UNSUPPORTED" | "BLOCKED" | "INCONCLUSIVE"
```

| Verdict | Meaning | Who assigns it |
|---|---|---|
| `PASS` | The check ran, had sufficient evidence, and found no defect. | The check's own `evaluate` function |
| `FINDING` | The check ran and found a defect. | Same |
| `NOT_TESTED` | The check's own precondition (`appliesWhen`/`canRun`-equivalent) was false — never applicable to this page/target. | Same |
| `UNSUPPORTED` | The check cannot execute reliably on this unit's `BrowserMatrixEntry.browserFamily`. | The Domain Check Registry (`web-check-registry-contract.md` step 3), before `evaluate` is even called |
| `BLOCKED` | The check could not run due to a dependency/scope/authorization refusal, or its own `evaluate` call threw. | The Domain Check Registry (step 2) or the workflow engine (FR-032's refusal path) |
| `INCONCLUSIVE` | The check ran but the available evidence was insufficient to decide `PASS` vs. `FINDING` with confidence. | The check's own `evaluate` function |

## `scanWebCoverageSummary` (read path, extends 009's own `scanCoverageSummary`)

```text
scanWebCoverageSummary(scanPlanId: string) -> {
  unitCoverage: ReturnType<typeof scanCoverageSummary>,  // 009's own, unchanged
  checkCoverage: {
    checkId: string, domain: ModuleType, automatabilityTier: AutomatabilityTier,
    verdictCounts: Record<CheckVerdict, number>,
  }[],
  crawlCompleteness?: { pagesDiscovered: number, pagesReached: number, budgetExhausted: boolean },
}
```

A pure read over `CHECK_RESULT` Evidence rows for the plan, grouped by check — computes no
readiness verdict, no pass/fail judgment, and no score (that remains a future SPEC 014's own
concern, mirroring 009's own FR-038 framing).

## Readiness, non-recursion, and the finalization sweep (FR-041a, closure-pass addition)

A multi-unit check's own verdict is only computed once every one of its `requiredEvidenceKinds` is
present for its own declared `readinessScope`, gated by an atomic `IdempotentClaim` so a retried,
replayed, or concurrently-duplicated trigger can never produce two `CHECK_RESULT` rows for the same
logical execution (`web-check-registry-contract.md`; `research.md` R15). `CHECK_RESULT` itself is
permanently excluded from the set of Evidence kinds that can trigger this computation — structural,
not developer discipline — so the registry's own output can never recursively re-trigger itself. At
`ScanPlan` finalization, `sweepUnresolvedChecks` gives every check that never reached a recorded
verdict a terminal `BLOCKED`/`NOT_TESTED` outcome — this is what makes `scanWebCoverageSummary`'s
own completeness claim actually complete, rather than silently missing whatever never got evaluated.

## Non-negotiable boundary rules

1. Every check execution this platform attempts MUST produce exactly one `CheckVerdict` — there is
   no seventh value, and no code path that leaves a check with no recorded verdict at all
   (`research.md` adversarial #29, closed structurally by FR-041a's finalization sweep above).
2. `UNSUPPORTED` and `NOT_TESTED` MUST be distinguishable from each other and from `PASS` in every
   report this platform renders — never collapsed into a single "skipped" bucket that loses the
   distinction between "could not run here" and "ran and found nothing."
3. `scanWebCoverageSummary` never fabricates a completeness verdict ("good enough" / "not good
   enough") — it reports facts for a future consumer (SPEC 014) to judge, never judging itself
   (identical framing to 009's own `finding-materialization-contract.md` rule 3).
4. No AI judgment may decide a `CheckVerdict` or a coverage fact (FR-053).
