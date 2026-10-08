# Functional Workflow Contract

Per `spec.md` FR-031 through FR-035. The bounded, Fahes-declared workflow catalog (this session's
own confirmed product-policy decision: no customer-authored workflows in this spec) and its
action-safety classification — the mechanism that keeps Functional Web Testing from ever blindly
mutating a target's real state.

## `runWorkflow`

```text
runWorkflow(workflow: WorkflowDefinition, page: AuditPage, targetAuthorization: TargetAuthorization | null) -> WorkflowOutcome
```

1. Evaluate `workflow.appliesWhen(evidence)` against this page's already-captured Evidence (e.g.
   "does this page have a `<nav>` with >= 2 top-level items" for the nav-testing workflow). `false`
   → the workflow is `NOT_TESTED` for this page — never attempted.
2. For each `WorkflowStep`, in order:
   a. If `step.actionSafety` is `READ_ONLY` or `LOCAL_BROWSER_MUTATION`: execute the primitive
      directly via the Browser Engine's own page-interaction surface.
   b. Otherwise (`SERVER_SIDE_REVERSIBLE_MUTATION`/`SERVER_SIDE_PERSISTENT_MUTATION`/`DESTRUCTIVE`):
      **first** attempt an `IdempotentClaim` (`data-model.md`, `scope: "workflow-step-mutation"`,
      `claimKey: "${executionUnitId}:${workflowId}:${stepIndex}:${attempt}"`, FR-032a). Claim lost
      (already executed, or another concurrent attempt is actively executing it) → treat as already
      handled, do not re-execute, proceed to the next step using the prior attempt's own recorded
      result. Claim won → call F01's `isAuthorized` fresh for this specific action against the
      Target's *current* `TargetAuthorization` (never cached from plan-resolution time, per F01's
      own FR-024). Refused → record this step `BLOCKED` (FR-041), set the claim's `resultRef`
      accordingly, and stop the workflow at this step (no later step executes on the assumption an
      earlier mutation happened when it did not). Permitted → execute the primitive, then set the
      claim's `resultRef` to the resulting Evidence id — this is what makes a retried call for the
      identical step/attempt identity recognize the mutation as already performed, never duplicating
      a server-side persistent action (closing `research.md` adversarial scenario C21).
   c. After every step: capture Evidence via `captureEvidence` (`DOM_NODE`/`CONSOLE_MESSAGE`/
      `SCREENSHOT` as applicable).
3. Evaluate the workflow's own assertion steps (`assertUrl`/`assertVisible`/`assertHidden`/
   `assertText`) against the captured Evidence — a failed assertion is this workflow's own
   `CheckOutcome` (`FINDING`, `web-check-registry-contract.md`'s own shape), with the specific
   failed assertion as the finding's own supporting evidence.

## Bounded network simulation (FR-035)

```text
simulateNetworkCondition(page: AuditPage, condition: "SLOW" | "OFFLINE", durationMs: number) -> void
```

`durationMs` is bounded by a fixed maximum (this contract does not fix the number). The *absence*
of offline-capable behavior is never itself recorded as a finding — only an explicit assertion step
(2c above) that the page fails to satisfy under the simulated condition is.

## Non-negotiable boundary rules

1. No `WorkflowStep.target`/`value` field is ever evaluated as code — these are bounded, typed
   selector/value descriptors only, never passed to `eval` or an equivalent (FR-031).
2. Step 2b's authorization check MUST be fresh, every time, for every step above
   `LOCAL_BROWSER_MUTATION` — never a single check at the workflow's own start covering every later
   step (F01's own FR-024, restated here specifically because a workflow is exactly the kind of
   multi-step sequence that rule exists to prevent shortcutting).
3. A workflow catalog entry is never customer-authored in this spec (FR-031) — this contract has
   no "load a user-supplied `WorkflowDefinition`" entry point.
3a. A step's own `actionSafety` declaration, including `DESTRUCTIVE`, confers no capability by
   itself (FR-032a) — it is purely the label step 2b's gate reads; the only thing that ever permits
   a mutating step to run is a fresh, independently-granted F01 `TargetAuthorization` check passing.
   This spec's own catalog can declare a step `DESTRUCTIVE` and it will still never execute against
   a target that has not separately authorized it — Functional Web Testing never silently becomes
   Active Security Testing (SPEC 012's own, separate domain) through this mechanism.
4. `simulateNetworkCondition`'s bound is enforced regardless of the page's own cooperation.
5. No AI judgment may decide a step's execution, an authorization check's outcome, or an assertion's
   pass/fail (FR-053).
