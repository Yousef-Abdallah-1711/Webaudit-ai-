# Q2.2 — Terminal edge from `DISPATCHED`: comparison

Prepared 2026-10-22 for the owner. **Analysis only; nothing is chosen and no existing spec was edited.** Premise (owner-approved Q2 = B, Q2.1 = (i), "subject to review of the full state-transition and crash-recovery contract"): the sequence is `PLANNED → ADMITTED → DISPATCHED → RUNNING`, where `DISPATCHED` = "admitted by F07 and handed to the host for forking; no child process/Guest has started". A queue job exists while the unit is still `PLANNED`; F07 admission happens on pickup.

Evidence labels: `HEAD`, `WORKING_TREE`, `DOC`, `CODE`. All DOC claims cite the file read this session.

## 1. The problem to solve

Between `ADMITTED → DISPATCHED` and `DISPATCHED → RUNNING` the host holds an F07 lease (taken at admission) and has not started the child. Three events can end the unit in that window: (a) plan/scan deadline expiry or scan cancel/fail (the sweep), (b) a pre-run F07 stop (kill switch), (c) host crash. HEAD has only `ADMITTED → REFUSED` (`plan.md:257`, HEAD). `FAILED` is defined from `RUNNING` (`plan.md` diagram, `RUNNING --> FAILED`). So under (i) a unit stranded in `DISPATCHED` has **no valid terminal edge** today. `PLANNED → REFUSED` is needed under every option (step-0 refusal from `PLANNED`).

## 2. Options

- **E1**: `DISPATCHED → REFUSED` (the second U-1 edge, `execution-unit-contract.md` rule 7, WORKING_TREE).
- **E2**: `DISPATCHED → FAILED` (class `TRANSIENT_INFRASTRUCTURE` or a new detail), no `DISPATCHED → REFUSED`.
- **E3 (= option iii)**: no persisted `DISPATCHED` before `RUNNING`; fork and `RUNNING` in one step.

## 3. Comparison

| Criterion | E1 `DISPATCHED→REFUSED` | E2 `DISPATCHED→FAILED` | E3 no persisted `DISPATCHED` |
|---|---|---|---|
| **Deadline expiry / scan end** | Fits the U-1 matrix unchanged: one cause → `REFUSED(SCAN_DEADLINE_EXPIRED / SCAN_CANCELLED / SCAN_FAILED)` for every pre-`RUNNING` status (`scan-deadline-contract.md:182-186`) | Matrix column for `DISPATCHED` becomes `FAILED(...)` while `PLANNED`/`ADMITTED` stay `REFUSED`: the same cause yields two terminal statuses depending on a sub-second window | No `DISPATCHED` column; matrix shrinks by one column; `ADMITTED` carries the whole pre-fork window |
| **Pre-run F07 stop (kill switch)** | `REFUSED(KILL_SWITCH_PENDING)` uniformly (matrix `:185`); matches 012 principle "every pre-`RUNNING` stop or refusal is `REFUSED`, never `KILLED`" (sixth matrix N5-3) | Splits the rule: `REFUSED` before `DISPATCHED`, `FAILED` after; contradicts N5-3 and T814's `dispatch.checkpoint-stop-uses-existing-edge` | Uniform (`REFUSED` from `ADMITTED`) |
| **Host crash / recovery** | Sweep (`sec_sweep_finalize_unit` in 012, 009 `expirePlanUnits`) finalizes the orphan to `REFUSED` after plan deadline; lease expires unrenewed (012 4.10F case 2: F07 lease 30 s; no broker lease exists before `RUNNING`) | Same recovery path, different status; a `FAILED` unit invites the retry machinery (below) | Crash before `RUNNING` leaves `ADMITTED` (HEAD edge exists); recovery identical |
| **Terminal-state semantics** | `REFUSED` must be redefined from "never admitted" (`runtime-finalization-contract.md:19`; `spec.md` FR-014 "never admitted… at or before the checkpoint") to "terminal before execution started" (needed anyway for the existing `ADMITTED→REFUSED` edge, AR-18 item 4) | Defines `FAILED` for a unit that never ran: today `FAILED` means classified execution failure (`FailureClass`, FR-023); `FailureClass` has no "never started" member (`data-model.md` FailureClass enum) | Cleanest semantics: `FAILED` stays "ran and failed", `REFUSED` "never ran" |
| **Retry interaction (FR-023/024)** | `REFUSED` is never retried with the same inputs (F01 rule referenced by FR-023 `SAFETY_REFUSED`) | `TRANSIENT_INFRASTRUCTURE` is "retryable, bounded attempts" (`spec.md` FR-023); a never-started unit could be re-dispatched after the deadline logic had already decided it must end — needs a counter-rule | n/a |
| **Dependents** | Non-`COMPLETED` outcome ⇒ one-level `BLOCKED` propagation (`runtime-finalization-contract.md` step 5) — same for all options | same | same |
| **Billing / refunds** | Legacy: refunds use **module** states (`refundForUndelivered(chargedCredits, requestedCount, deliveredCount)`, `packages/config/src/refund.ts:15-25`; `isDelivered` on `ModuleState`), not unit status → no effect on legacy billing. 012 `AREA_COUNT` (default) is the same. 012 `CLASS_LEVEL` (P17, not approved): "refused" and "platform failure" both weigh 0 (`012/spec.md` FR-198) → no billing difference between E1 and E2 | same as E1 numerically; but customer-visible reason differs ("refused: deadline" vs "failed") | same as E1 |
| **F07 budget** | A request unit may already be consumed at admission (012 N2-4 "non-returnable F07 request unit"); status does not change that | same | same |
| **Customer-visible coverage (FR-039)** | "did not contribute" + closed reason string | would show a failure class for work that never started (misleading) | as E1 |
| **T814 / SPEC 012** | T814 already expects `REFUSED` from `PLANNED`, `ADMITTED` **and** `DISPATCHED` (`012/tasks.md:609`) → **no 012 test change** | T814 case expectation changes; 012 4.10B tier matrix ("non-`RUNNING` units `REFUSED`") and 4.10F case 2 change; `sec_sweep_finalize_unit` cause table changes | T814 `DISPATCHED` case removed; `sec_transition_unit`'s `ADMITTED->DISPATCHED`/`DISPATCHED->RUNNING` and FR-183 (`DISPATCHED → RUNNING` CAS, `012/spec.md:401`) rewritten; E14 step 5 (`active-security-execution-contract.md:44`) rewritten |
| **011 / 010** | no references to these edges found in 011 normative files; 010 none | same | same |
| **State-model change vs "preserve existing model" (owner Q2)** | Keeps the enum and all HEAD edges; adds `PLANNED→REFUSED` and `DISPATCHED→REFUSED` (already in the working-tree U-1) | Adds `PLANNED→REFUSED`, `DISPATCHED→FAILED`; changes `FAILED` meaning | Removes a status value; contradicts "Preserve PLANNED → ADMITTED → DISPATCHED → RUNNING" (Q2.1) |
| **Documents to touch** | least (U-1 text already uses E1) | many | most |

## 4. Observations (not recommendations)

1. E3 conflicts with the owner's Q2.1 instruction to preserve `PLANNED → ADMITTED → DISPATCHED → RUNNING`; it is listed because Q2.2 named it.
2. E1 is the only option under which the U-1 matrix, 012's T814 and N5-3 stay consistent without text changes beyond the `DISPATCHED`/`REFUSED` definitions.
3. E2 is the only option that needs a new rule to prevent retry of a never-started unit, and it gives customers a failure signal for work that did not run.
4. Under every option the `REFUSED` definition in `spec.md` FR-014 and `runtime-finalization-contract.md:19` ("never admitted") is already inconsistent with the existing `ADMITTED → REFUSED` edge and must be reworded (AR-18 item 4).
5. None of the options needs a lease-release *mechanism* decision: release inside finalization is unchanged (rule 2 of `runtime-finalization-contract.md`); the transactional surface remains AR-19, open.

## 5. Evidence gaps

- No test exists for any of this (no runtime). Effects on retry behaviour and sweep races are DOC-derived.
- The exact length of the `DISPATCHED` window is an implementation property (fork latency); the argument for E3 is smaller crash window, not an absence of one — `ADMITTED` still holds a lease for that window.
- Whether `TRANSIENT_INFRASTRUCTURE` retry would in practice re-dispatch past a passed deadline depends on step 0 (it would refuse), so E2's retry risk is bounded by step 0, but the interaction needs an explicit rule.

## 6. Decision wording for the owner

Q2.2: choose **E1**, **E2**, **E3**, or state another edge. If E1 is chosen, confirm the wording "`REFUSED` = terminal before execution started". If E2, state the retry rule and the `FAILED` definition. If E3, state that Q2.1 (i) is relaxed.
Answer: ____
