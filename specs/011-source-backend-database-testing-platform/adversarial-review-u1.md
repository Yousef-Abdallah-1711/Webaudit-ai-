# Adversarial Review of the U-1 Scan Deadline Amendment (SPEC 009) and its SPEC 011 reconciliation

**Date**: 2026-10-10. **Reviewer**: the lead session, re-evaluating from scratch. **Independence caveat**: this is NOT an independent reviewer; the project owner instructed that no sub-agents be used, so the same session that designed the amendment attacked it. The earlier 50-scenario review (`adversarial-review.md`) was not reused for any verdict below. Verdicts: HOLDS (mechanism exists in a contract and is testable), WEAK (holds only with a stated assumption), DEFECT-FIXED (a real flaw found and repaired in this pass).

**Evidence read for this review**: `apps/worker/src/orchestrator/{timeout.ts,timeout-scheduler.ts,state-machine.ts,terminal-refund.ts,heartbeat.ts}`, `apps/api/src/services/intake/create-scan.ts`, SPEC 009 `spec.md`/`plan.md`/`data-model.md`/`contracts/*`, SPEC 008 `kill-switch-contract.md`, and the amended `contracts/scan-deadline-contract.md`.

## Flaws the review found in the first draft of the amendment (all repaired)

| # | Flaw | Repair |
|---|---|---|
| F1 | Generic `recordEvidence` rejection for terminal units would have broken SPEC 010 `CHECK_RESULT` and SPEC 011 `SOURCE_CHECK_RESULT`, which are legitimately written parent-side AFTER units are terminal. | Fencing moved to each engine's execution wrapper; generic path stays permissive (`scan-deadline-contract.md`, `evidence-envelope-contract.md` rule 0). |
| F2 | `PLANNED -> REFUSED` is not an existing transition, yet dispatch step 0 runs while the unit is still `PLANNED`. | Transition added solely for the deadline precondition (`execution-unit-contract.md` rule 7). |
| F3 | "A scan cannot complete with non-terminal units" had no mechanism (scan-phase jobs cannot wait hours). | Event-driven `continueScanIfPlanTerminal` gate called by the orchestrator and by unit finalization, plus a domain-registered module-result finalizer extension point. |
| F4 | Refund fairness: a module with partial results would be refunded as undelivered if module results were written after the guarded `TIMED_OUT` transaction. | Planned-pass order is expire units -> module-result finalizers -> guarded transaction. |
| F5 | A kill-switch coinciding with the deadline could be recorded as `TIMEOUT`, losing FR-021's three-way distinction. | Outcome mapping consults F07 `KillSwitchState`; the F07 outcome wins. |
| F6 | Legacy pass said "no `ScanPlan` row"; a scan with only a `REFUSED` plan must stay legacy. | "No RESOLVED INITIAL plan". |
| F7 | Worker clock skew could shift deadlines. | All comparisons use the database clock; one shared accessor for the legacy value used by API and worker. |
| F8 | Guest could survive a finalization performed by the self-healing pass if its host is dead. | Engine `onUnitExpired` hook (SPEC 011: parent-side `destroy(runId)`) plus the Execution Plane dead-man/TTL/reconciler. |

## The 12 required scenarios

| # | Scenario | Mechanism (contract) | Proving test | Verdict |
|---|---|---|---|---|
| 1 | Legacy scan exceeds 15 minutes | No RESOLVED plan -> legacy pass, identical query, `SCAN_TIMEOUT_MS`, guarded transition and refund (`scan-deadline-contract.md` Sweeper 1; boundary rule 4) | 009 T-U1-6 legacy regression, AC-1; 011 T338 | HOLDS (after F6) |
| 2 | Source execution runs past 15 minutes but within its deadline | Plan `deadlineMs` = L + C + M (worked example 10 760 000 ms for a 4-partition monorepo); sweep uses the plan value; BullMQ lock/stall behavior of the dedicated queue is per 009 FR-017 | AC-3; 011 T338 | HOLDS, ASSUMES the dedicated queue's lock renewal is configured for long jobs (implementation task in the engine's queue provisioning) |
| 3 | Scan exceeds its new deadline | Host loop ends units within <= 5 s of expiry; sweep (<= 1 interval) runs expire -> finalizers -> guarded `TIMED_OUT`; evidence committed earlier is kept | AC-3, AC-12; T339 | HOLDS |
| 4 | Retry tries to extend the deadline | `unitBudgetMs` already contains `maxAttempts`; deadline is `startedAt + deadlineMs` and `startedAt` is written once by a compare-and-swap on `state = QUEUED`; every attempt re-runs step 0 and needs `timeoutPolicyMs + hardStopMarginMs` remaining | AC-5; T338 | HOLDS |
| 5 | Worker crash during a long unit | Execution Plane dead-man (15 s) destroys the Guest; F07 lease expires; redelivery re-runs step 0 and F07 no-resurrection; 011 `finalizeStuckSourceExecutionUnits`; generic 009 self-healing pass finalizes at scan end | AC-12; T339, T314 | HOLDS, BOUNDED: for engines without their own stuck-unit sweep a stuck unit stays `RUNNING` until the scan deadline (UX cost, not a safety gap) |
| 6 | Sweeper races with successful completion | Both are compare-and-swap on `Scan.state`; exactly one wins; the gate has no time check; refund only after `moved: true` | AC-6, AC-13; T339/T344 | HOLDS |
| 7 | Refund races with unit finalization | Refund computed from a fresh in-transaction read after finalizers ran; unit finalization writes unit rows only; idempotent per guarded move | AC-7; T344 | HOLDS (after F4) |
| 8 | F07 kill switch during dependency installation | Kill finalizes `KILLED`/`CANCELLED`; deadline never reverses a terminal unit; coinciding deadline defers to the F07 outcome | AC-8, AC-15; T340 | HOLDS (after F5) |
| 9 | MicroVM cleanup after deadline expiry | Host loop destroys the Guest; `onUnitExpired` destroy for dead hosts; dead-man 15 s; hard TTL `timeoutPolicyMs` + 5 min; reconciler; `STOPPED` only after confirmed destroy | T340; 011 isolation fixtures | HOLDS (after F8); residual: an Execution Plane control-plane hang (register R29) |
| 10 | Stale worker finalizes an expired scan | `finalizeExecutionUnit` rejects a stale key and a different outcome for a terminal unit; the orchestrator's final transition is CAS-guarded and routed through the gate; evidence wrapper refuses unit-produced writes after scan terminal/deadline | AC-9; T339/T341 | HOLDS (after F1, F3) |
| 11 | Multiple units share one scan deadline | Deadline from the critical path (chains add, siblings do not); each unit re-checks remaining time at dispatch; late units are refused and dependents `BLOCKED` (reported by FR-039) | AC-11; T340 | HOLDS; WEAK ASSUMPTION: parallel siblings assume enough F07 concurrency (a refused lease is terminal in 009), unrelated to the deadline |
| 12 | Source execution starts too close to the deadline | Step 0: `remaining < timeoutPolicyMs + hardStopMarginMs` (2 330 000 ms) -> `REFUSED` `SCAN_DEADLINE_INSUFFICIENT` before F07, no budget or lease consumed | AC-10, AC-16; T340 | HOLDS (after F2) |

## Additional attacks considered

- **Deadline inflation by a user**: the deadline derives only from the resolved graph and platform constants; a ceiling (6 h) and grant expiry bound it; refused rather than clamped.
- **Reverify loops creating fresh deadlines**: each reverify is a separate bounded plan anchored on its own `resolvedAt`; F07 budgets still apply.
- **QUEUED forever**: legacy behavior (never swept) unchanged; non-passive units are not dispatched while `startedAt` is null.
- **Sweeper backlog**: existing batch size of 50 per run; the host loops end units independently, so a backlog delays only the scan's terminal state.
- **Grant expiring between resolution and start**: F07/F01 `isAuthorized` EXPIRED at each checkpoint still stops units; resolution refuses grants that cannot cover the deadline.
- **Passive-only plan equivalence**: same value as today, read through a single shared accessor.
- **F01/F07 weakening**: none; no new trigger, no new audit type, no new interface; the only F01 contact is a read of the `expiresAt` scalar.

## Remaining risks (accepted or tracked)

1. Queue lock/stall configuration for long jobs is an implementation task of the first engine to wire a non-passive queue (not a contract gap).
2. Engines lacking a stuck-unit sweep leave an in-deadline stuck unit `RUNNING` until the scan ends (bounded).
3. The deadline formula is conservative (passive window is added, not overlapped).
4. This review is not independent; an independent re-review at the closure pass is recommended.

## Verdict on U-1

No defect remains open in the amendment after the repairs above. U-1 is resolved at the planning level; its implementation (009 tasks T-U1-1..T-U1-10) is a prerequisite for activating `SOURCE_EXECUTION`.
