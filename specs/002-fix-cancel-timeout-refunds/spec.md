# Feature Specification: Fix Cancellation & Timeout Refund Integrity

**Feature Branch**: `002-fix-cancel-timeout-refunds`

**Created**: 2026-09-10

**Status**: Draft

**Input**: User description: "Fix two independently-confirmed P0 financial-correctness defects in the
WebAudit AI scan lifecycle, both documented in
docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md (Section 6): (1) P0-CANCEL-1 —
cancellation does not interrupt in-flight worker execution, so the platform can incur real AI-provider
cost for a module already refunded to the user as undelivered; (2) P0-TIMEOUT-1 — the timeout sweep
computes refunds from a stale, unlocked snapshot, so a module that completes during batch processing
can still be refunded as undelivered. Constraints: elevated scrutiny for money/security-adjacent
surfaces, no weakening of existing guarantees, apps/api cannot import apps/worker's state machine,
file size limits (controllers ≤150 lines, services ≤200 lines), a dedicated regression test per
defect, no fabricated performance numbers, and an explicit non-goal of fixing the realtime
replay-on-reconnect gap."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A cancelled scan never lets the platform pay for work already refunded (Priority: P1)

A user cancels an in-progress audit while one of its checks is still running. The platform has already
told the user (via a credit refund) that this check's work is undelivered. The check must not go on to
silently finish, get persisted as a real result, and cost the platform real money for work the user was
already told didn't happen.

**Why this priority**: This is a direct, reproducible financial leak (the platform pays a real AI
provider for something it told the user never ran) and a data-integrity smell (a "cancelled" scan can
still end up with real result rows in it). It is one of the two confirmed P0 defects and is independently
shippable.

**Independent Test**: Cancel a scan while a check is mid-flight; confirm no result, no execution record,
and no cost is ever recorded for that check once cancellation has been discovered, while checks that
had already finished before the cancellation are unaffected.

**Acceptance Scenarios**:

1. **Given** a scan is running and a check inside it is still in progress, **When** the user cancels the
   scan, **Then** once the cancellation is discovered no further result is persisted for that in-progress
   check and no cost is recorded for it.
2. **Given** a scan is cancelled after every check in its current phase has already finished and been
   recorded, **When** the cancellation is processed, **Then** the already-recorded results and any
   credits already earned for them are left exactly as they were — cancellation never retroactively
   un-delivers finished work.
3. **Given** two checks are running at the same time in the same phase and the scan is cancelled while
   only one of them is still in progress, **When** cancellation is discovered, **Then** the in-progress
   check is skipped and the check that had already finished is recorded and charged normally.

---

### User Story 2 - An automatically-timed-out scan is refunded based on what actually happened, not a stale guess (Priority: P1)

A scan that runs long enough to be automatically timed out is refunded for whatever part of the work it
did not deliver. If a check finishes and its result is recorded at nearly the same moment the timeout
decision is being made, the refund must reflect that the check *was* delivered — not a snapshot taken
moments earlier that hadn't seen it yet.

**Why this priority**: This is the second confirmed P0 defect — a reproducible over-refund (the user
gets credited back for work that did, in fact, happen) and a ledger-accuracy problem. Independently
shippable and testable from User Story 1.

**Independent Test**: Force a check's result to be recorded at the exact moment a timeout decision is
being computed for its scan; confirm the refund reflects the check as delivered, not undelivered.

**Acceptance Scenarios**:

1. **Given** a scan is being automatically timed out and one of its checks finishes and is recorded
   during that decision, **When** the refund amount is calculated, **Then** that check is treated as
   delivered and is not included in the refunded amount.
2. **Given** a batch of several scans are being evaluated for timeout at once, **When** one scan's
   check finishes mid-batch, **Then** only that scan's refund reflects the update — no other scan's
   refund in the same batch is affected.
3. **Given** a scan is genuinely timed out with no further progress, **When** the refund is calculated,
   **Then** the outcome is unchanged from today's behavior — this fix must not reduce a refund a user
   was already correctly entitled to.

---

### Edge Cases

- What happens when a user-initiated cancellation and the automatic timeout sweep both reach the same
  scan at nearly the same moment? Exactly one of the two terminal outcomes must win, and only the
  winning outcome's side effects (state, refund) may apply — the loser must be a safe no-op, matching
  the existing single-writer guarantee on a scan's lifecycle state.
- What happens if the notification that a scan was cancelled never reaches the in-progress work (e.g. a
  transient delivery failure)? The already-in-flight check may finish and be recorded normally in this
  case — this is an accepted limit of checkpoint-based cancellation (interrupting before new work starts
  and before finished work is recorded, not stopping work already underway mid-execution), not a new
  failure mode introduced by this fix.
- What happens to a scan that is cancelled after it has already fully completed? No effect — cancelling
  a scan that is already in a finished state must remain a no-op, as it is today.
- What happens if a second browser tab is watching a scan that gets cancelled? It may not see the
  cancellation immediately and will pick it up on its own next reconnect — this is a known, pre-existing,
  explicitly accepted limitation and is **not** addressed by this feature.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST ensure that once a scan's cancellation has been discovered, no further
  check belonging to that scan has its result, execution record, or any provider cost recorded.
- **FR-002**: The system MUST NOT alter or remove the results, cost records, or credit entries for any
  check that had already finished and been recorded before its scan's cancellation was discovered.
- **FR-003**: The system MUST guarantee that a scan already refunded for a given check as "undelivered"
  can never also cause the platform to incur real, billable cost for that same check afterward.
- **FR-004**: The system MUST compute an automatically-timed-out scan's refund using that scan's true
  delivery state at the moment the refund decision is made, not an earlier snapshot that may have since
  become stale.
- **FR-005**: A check that finishes and is recorded before its scan's timeout-refund decision is
  finalized MUST be counted as delivered in that decision, even if an earlier snapshot had not yet seen
  it.
- **FR-006**: Every write that changes a scan's lifecycle state MUST remain guarded on the state the
  writer expects to find (the existing single-writer invariant) — neither fix may introduce a write that
  changes scan state unconditionally.
- **FR-007**: Cancellation MUST be enforced at checkpoints — before a new check begins and before a
  finished check's result is recorded — and is explicitly not required to interrupt a check already
  underway mid-execution.
- **FR-008**: The system MUST NOT double-charge or double-refund credits as a result of either fix; the
  existing guarantee that a scan's total charge, its delivered work, and its refunds always reconcile
  MUST continue to hold.
- **FR-009**: Each of the two defects MUST have an automated regression test that demonstrably fails
  against the current (unfixed) behavior and passes once fixed, exercised against the project's real
  database and queue infrastructure rather than a mocked-away boundary.
- **FR-010**: The pre-existing limitation that a second, already-open view of a cancelled scan may not
  reflect the cancellation until its own next reconnect MUST be left as-is and explicitly documented as
  an accepted gap, not expanded in scope or silently patched by this work.

### Key Entities

- **Scan**: An audit run with a lifecycle state (queued, running, cancelled, timed out, completed, ...),
  a total charged amount, and the set of checks it requested.
- **Check / Module Result**: The recorded outcome of one audited area within a scan — the unit whose
  in-flight-vs-recorded status this feature must get right on both the cancellation and timeout paths.
- **Execution Record**: A cost-bearing record (a code-layer or AI-layer execution) tied to one check,
  which must never be created for a check that was correctly skipped due to cancellation.
- **Credit Transaction / Refund**: The ledger entries recording what a scan was charged and what part of
  that charge was later returned; this feature's correctness is ultimately measured by whether these
  entries always reconcile with what actually happened.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of checks still in progress at the moment a scan is cancelled result in zero
  platform provider cost being recorded for that check.
- **SC-002**: Zero instances exist, across repeated test runs, of a persisted result for a check that
  was cancelled before it completed.
- **SC-003**: 100% of automatically-timed-out scans, verified by a test that intentionally races a
  check's completion against the refund decision, compute their refund using the check's true state at
  decision time rather than an earlier snapshot.
- **SC-004**: For every scan across the full existing test suite, total credits charged continues to
  equal total credits accounted for as delivered plus total credits refunded — zero regressions in this
  reconciliation after both fixes land.
- **SC-005**: Both new regression tests pass consistently with zero flakes across at least 5 repeated
  runs against real local infrastructure.
- **SC-006**: The full pre-existing adverse and unit test suites remain green after both fixes, with any
  pre-existing/environmental failures unchanged in cause and count from the pre-fix baseline.

## Assumptions

- "Checkpoint-based" cancellation — stopping new work and stopping a finished-but-unrecorded result from
  being recorded, without necessarily interrupting work already underway mid-execution — satisfies "a
  cancellation must actually stop in-flight work" for the purposes of this feature, per the explicit
  scope constraint given for this work.
- No user-facing UI change is required; the outward behavior a user sees (a cancelled scan, refunded
  undelivered credits) is unchanged except that it becomes accurate under the race conditions this
  feature closes.
- The existing infrastructure this project already runs (its queue and messaging layer) is sufficient
  to deliver a cancellation notification to in-progress work; this specification does not mandate a
  specific mechanism, leaving that to the implementation plan.
- Fixing the separate, already-documented SSRF gap in browser-based checks, building a load-testing
  harness, and fixing the realtime reconnect-replay gap are all explicitly out of scope for this
  feature.
