# Web Check Registry Contract

Per `spec.md` FR-001/FR-001a/FR-023/FR-027/FR-028a/FR-031/FR-036/FR-041/FR-041a/FR-042. The one
generic dispatch mechanism that turns committed Evidence into `CHECK_RESULT` Evidence and, where
warranted, a Finding — the central seam that keeps every Domain's checks out of the Browser/
Crawler Engine's own isolated child process (`spec.md`'s own Clarifications; `research.md` R3).

**Closure-pass revision (2026-10-08)**: the original draft of this contract described triggering
and dispatch in prose without closing the resulting lifecycle (recursion, duplicate execution,
readiness, idempotency under retry/replay/concurrency). This revision makes every one of those
guarantees structural, not a developer-discipline convention — see `research.md` R15.

## Trigger set (non-negotiable rule, closes recursion structurally)

The registry is triggered by a newly-committed Evidence row of any kind **except** `CHECK_RESULT`.
`CHECK_RESULT` is permanently excluded from the trigger set — the registry writes it, but never
subscribes to it. A `WebCheckDefinition` whose own `requiredEvidenceKinds` lists `CHECK_RESULT` is
rejected at registry load time (`data-model.md`'s own validation rule), not merely discouraged.
This is what makes infinite self-triggering impossible **by construction**: there is no code path
by which the registry's own output can become its own input.

## `onEvidenceCommitted` (parent-worker-side, synchronous, called once per newly-committed, non-`CHECK_RESULT` Evidence row)

```text
onEvidenceCommitted(evidence: Evidence, scanPlanId: string) -> void
```

1. For every registered `WebCheckDefinition` whose `requiredEvidenceKinds` includes
   `evidence.kind`: compute `scopeKey = check.readinessScope(evidence)` (defaults to the owning
   `executionUnitId` when the check declares no custom scope function, FR-041a) and
   `claimKey = "${scanPlanId}:${check.id}:${check.version}:${scopeKey}:${browserMatrixEntryHash ?? ''}"`.
2. Attempt `IdempotentClaim` with `scope: "check-execution"` and this `claimKey`
   (`data-model.md`'s own claim/retry semantics, reused unchanged). No row won (another caller
   already completed or is actively evaluating this exact identity) → stop; this is the structural
   guarantee against duplicate execution from retries, replays, or two Evidence rows for the same
   check's two different required kinds both triggering a call (`research.md` R15's guarantee B/E).
3. Claim won → query whether **every** kind in `check.requiredEvidenceKinds` now has at least one
   committed row scoped to `scopeKey` (a pure read over already-committed Evidence, never new
   state). Not yet ready (a sibling required kind has not arrived) → release the claim (delete the
   `IdempotentClaim` row, since this was not a genuine execution — a later Evidence commit for the
   same check/scope will attempt the claim again) and stop.
4. Ready → proceed to step 5-9 below (evaluation). Catch any exception from `check.evaluate`:
   record `CHECK_RESULT` with `verdict: "BLOCKED"` naming the internal error, set this claim's
   `resultRef` to the written `CHECK_RESULT` Evidence's id, and stop (`research.md` adversarial
   #27) — never propagate the exception to the owning `ExecutionUnit`'s own finalization.
5. If `check.supportedBrowserFamilies` does not include this scope's resolved
   `BrowserMatrixEntry.browserFamily` (where applicable): record `CHECK_RESULT` with `verdict:
   "UNSUPPORTED"` (FR-011) without calling `evaluate` at all.
6. Otherwise call `check.evaluate(evidenceBatch)`.
7. **`HUMAN_JUDGMENT_REQUIRED` override (FR-028a)**: if `check.automatabilityTier ===
   "HUMAN_JUDGMENT_REQUIRED"` and the returned verdict is `PASS` or `FINDING`: override to
   `INCONCLUSIVE` and log an anomaly — such a tier cannot, by its own definition, have produced a
   trustworthy automated `PASS`/`FINDING` decision.
8. Record exactly one `CHECK_RESULT` Evidence row for the resulting verdict (009's own
   `recordEvidence`).
9. Update this claim's `resultRef` to the written `CHECK_RESULT` Evidence's id (closing the claim —
   any later retry/replay for this identity now finds `resultRef IS NOT NULL` and is a clean
   no-op, `research.md` R15's guarantee E/G).
10. For a `FINDING`-verdict outcome: call `check.fingerprintPartsFor(evidenceBatch, outcome)`
    (including `BrowserMatrixEntry` identity iff `check.isViewportSpecific`, FR-042), then 009's own
    `materializeFinding`, passing the just-written `CHECK_RESULT` Evidence id plus
    `outcome.supportingEvidenceIds`. 009's own `materializeFinding` is independently idempotent
    (its own "skipping any id already linked" rule, reused unchanged) — this step's own claim-gated
    exactly-once-execution guarantee (steps 2/4/9) means `materializeFinding` is in practice called
    at most once per `CheckExecutionIdentity` anyway, but the two guarantees are not relied on to
    substitute for each other (`research.md` R15's guarantee F).

## `sweepUnresolvedChecks` (finalization pass — closes the "evidence never arrives" gap)

```text
sweepUnresolvedChecks(scanPlanId: string) -> void   // called once, when every ExecutionUnit in the plan reaches a terminal status
```

For every registered `WebCheckDefinition` whose `requiredEngine`/domain applies to this plan and
for which no `CHECK_RESULT` was ever recorded (readiness was never achieved, because a required-
evidence-producing `ExecutionUnit` never reached `COMPLETED`): record `CHECK_RESULT` with `verdict:
"BLOCKED"` if the missing evidence's own producing unit ended in `FAILED`/`CANCELLED`/`KILLED`/
`REFUSED`/`BLOCKED`, or `verdict: "NOT_TESTED"` if the check's own `appliesWhen`/precondition was
never satisfied by anything the plan actually produced. This closes the one remaining way a
requested check could otherwise end a scan with **no** recorded verdict at all — which this
platform's own FR-041 treats as exactly the failure mode ("missing execution silently read as
PASS") it exists to prevent, extended here to "missing execution silently read as *nothing at
all*."

## Non-negotiable boundary rules

1. This is the only call path that produces `CHECK_RESULT` Evidence — no `WebCheckDefinition`'s own
   code writes Evidence or calls `materializeFinding` directly (identical "one write path"
   discipline to 009's own `evidence-envelope-contract.md`).
2. `CHECK_RESULT` is never, under any circumstance, a member of the trigger set this contract
   subscribes to — this is checked at registry load time, not only documented in prose.
3. Step 2's `IdempotentClaim` MUST be attempted before step 3's readiness check, and the readiness
   check's own "not ready" outcome MUST release the claim rather than leave it dangling — a
   released claim is indistinguishable from one that was never attempted, so a later, genuinely-
   ready trigger is never blocked by an earlier, premature one.
4. Step 1's dispatch is by declared `requiredEvidenceKinds` match alone — this function MUST NOT
   contain any check-specific or domain-specific branch; adding a new check requires zero edit to
   this function's own code (Constitution Principle I, restated for this spec's own registry).
5. A check's own `evaluate` call is synchronous, in-process computation over already-collected
   Evidence only — it MUST NOT itself perform a new browser/network operation; exceeding a fixed,
   short wall-clock bound is itself treated as a defect in that check's own implementation and
   recorded `BLOCKED`.
6. `sweepUnresolvedChecks` MUST run exactly once per plan, after every `ExecutionUnit` reaches a
   terminal status — never before (which would prematurely `BLOCKED` a check still genuinely
   waiting on in-progress sibling evidence).
7. No AI judgment may decide any step's dispatch, readiness, classification, override, or
   materialization inputs (FR-053) — every step is a pure, deterministic function of its inputs and
   the registered `WebCheckDefinition`s' own declared, versioned shape.
