# Feature Specification: Load-Testing Harness and Concurrency Verification

**Feature Branch**: `004-load-testing-harness`

**Created**: 2026-09-11

**Status**: Draft

**Input**: User description: "Build and run a real load-testing harness for WebAudit AI, closing the
one remaining open item from the full-workflow review: no load-testing harness exists, the staged
concurrency plan (1 -> 60 audits) was never run, and no real performance numbers are asserted in either
direction. Golden-path scenario (create a target, quote, accept, create a scan, poll to completion for
a URL-only code-layer audit), staged concurrency (1, 5, 10, 20, 40, 60), real measurements (API
latency percentiles, queue wait, completion time, throughput, error rate) — never fabricated, marked
UNVERIFIED with a reason where a stage genuinely can't be run. A written report with a verdict against
this project's own stated targets, and a runbook so this is repeatable later. No product code changes
to make load testing possible — a real gap found this way is itself a finding to report. No real AI
provider spend (fixtures only), local environment only, and account for the fact that the heaviest
stages put real load on infrastructure other concurrent work on this machine also depends on."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Know, with real evidence, whether the platform holds up under its own stated concurrency target (Priority: P1)

The product has always claimed it can handle roughly 60 concurrent audits, a typical audit finishing in
about five minutes, and a report reaching its owner successfully essentially every time. Nobody has
ever actually driven that many audits through the system at once and measured what happens. Someone
responsible for this platform's readiness needs real evidence — not the absence of a complaint — before
they can stand behind those numbers.

**Why this priority**: This is the single remaining open item from a full production-readiness review
that closed every other finding. Every other guarantee this product makes has been backed by a real
test; this is the last one still resting on an unverified claim.

**Independent Test**: Run one audit through the full flow (create target → quote → accept → create scan
→ poll to completion) and confirm it completes and its timing is captured. That alone is a complete,
useful slice — everything after it is the same flow run at increasing scale.

**Acceptance Scenarios**:

1. **Given** the platform is running locally with its normal dependencies, **When** a single audit is
   driven through the complete golden path, **Then** it reaches a finished state and its total time and
   every step's response time are recorded.
2. **Given** a stage of several audits running at once (5, then 10, then 20, then 40, then 60), **When**
   that stage completes, **Then** the same measurements are recorded for that stage specifically, so
   each stage's numbers can be compared to the one before it rather than only reporting one aggregate
   figure for everything.
3. **Given** a stage that cannot be completed safely or successfully in this environment, **When** that
   is discovered, **Then** the report says so plainly, with the reason, rather than presenting a made-up
   or extrapolated number as if it were measured.
4. **Given** the full staged run is done, **When** the results are written up, **Then** the report states
   a plain verdict against this platform's own stated targets (roughly a five-minute typical audit,
   about sixty concurrent audits, and a report reaching its owner in the very large majority of cases)
   — not merely a data dump the reader has to interpret themselves.

### User Story 2 - Someone else can repeat this later without reverse-engineering it (Priority: P2)

A load test run once, by one person, and never run again is much less valuable than one that becomes a
routine, repeatable check. The next person who wants to know "does this still hold up" should be able to
follow a written procedure rather than needing to rediscover how it was done.

**Why this priority**: Directly requested, and consistent with this project's own convention of leaving
a runbook behind for anything meant to be operated more than once (e.g. the existing deployment
runbook). Independently valuable even if User Story 1's numbers are never looked at again.

**Independent Test**: Hand the written runbook to someone unfamiliar with this specific work and confirm
they can run at least the smallest stage themselves from the instructions alone.

**Acceptance Scenarios**:

1. **Given** the runbook and a working local checkout of this project, **When** someone follows it,
   **Then** they can start the load test's own prerequisites, run at least one stage, and find where the
   results were written, without needing anything not written down.

### Edge Cases

- What happens if a real, structural limit in the system (not the load-testing tooling) is hit while
  running a stage — for example, a configuration ceiling that makes a given number of concurrent audits
  outright impossible rather than merely slow? That is a genuine finding about the platform, reported
  with the same evidence standard as any other finding in the originating review, not something the
  harness quietly works around.
- What happens if this local machine is also being used for other work at the same time as a heavy
  stage runs? The heaviest stages must not be run blindly — the process must include checking that
  shared local infrastructure (the database and queue) is not already under contention from other work
  before starting one, and pausing if it is.
- What happens if a stage partially completes — some audits finish, others error or never complete? The
  report distinguishes delivered, errored, and never-completed outcomes for that stage rather than
  collapsing them into a single pass/fail number.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST provide a way to drive one complete audit through its real, ordinary
  workflow — creating a target, requesting and accepting a quote, creating a scan, and polling until it
  reaches a finished state — end to end, the same way a real user's request would.
- **FR-002**: The system MUST support running that same workflow at each of six increasing levels of
  concurrency (1, 5, 10, 20, 40, 60 simultaneous audits), one level at a time.
- **FR-003**: For each concurrency level actually run, the system MUST record: response time for each
  step of the workflow (with at least median and two higher percentiles), how long a request waited
  before being worked on, total time to reach a finished state, how many audits completed successfully
  per unit of time, and the proportion that failed or never finished.
- **FR-004**: The system MUST NOT incur any real third-party provider cost while running — every audit
  driven through this harness runs in the platform's existing no-real-spend test mode.
- **FR-005**: The system MUST NOT require any change to the product's own code to make load testing
  possible. If running a stage reveals that a change would be needed to go further (a configuration
  ceiling, a resource limit), that discovery MUST be written up as a finding, not fixed inside this
  work.
- **FR-006**: A stage that cannot be safely or successfully completed in this environment MUST be marked
  as unverified, with a stated reason, rather than replaced with an estimated or extrapolated figure.
- **FR-007**: The final output MUST include a written report stating, for each concurrency level that was
  run, the measurements from FR-003, and an overall verdict comparing what was measured against this
  platform's own previously stated performance targets.
- **FR-008**: The final output MUST include a runbook describing how to prepare the environment and run
  each stage again later, sufficient for someone who did not do this work themselves to repeat at least
  the smallest stage.
- **FR-009**: The process for running the two heaviest concurrency levels MUST include a check that the
  shared local database and queue are not already busy with other, unrelated work immediately
  beforehand, and MUST defer running if they are.
- **FR-010**: Every numeric result presented in the report MUST be traceable to an actual recorded run;
  the report MUST NOT contain a performance number that was not produced by that run.

### Key Entities

- **Load-test scenario**: A scripted repetition of the real audit workflow, parameterised by how many
  copies of it run at the same time.
- **Stage result**: The recorded measurements (latency percentiles, queue wait, completion time,
  throughput, error rate) for one concurrency level's run.
- **Load-test report**: The written comparison of stage results against this platform's stated
  performance targets, including an explicit verdict and any findings uncovered along the way.
- **Runbook**: The written procedure for preparing the environment and repeating a stage.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single audit's complete workflow is run and its timing is captured, with zero fabricated
  figures anywhere in the result.
- **SC-002**: At least three of the six staged concurrency levels are actually run to completion with
  real, recorded measurements — the review this closes was explicit that jumping straight to the
  heaviest load without staging is not the intent.
- **SC-003**: 100% of any concurrency levels not actually run are marked unverified with a stated reason,
  never presented as a passing or failing measurement.
- **SC-004**: The written report states one clear verdict — comparable in form to the originating
  review's own verdict style — against this platform's stated ~5-minute typical audit time, ~60
  concurrent audit target, and high report-delivery rate.
- **SC-005**: A person unfamiliar with this specific effort can follow the runbook to run the smallest
  stage themselves and locate its results, verified by the runbook actually being walked through once
  as if by a new reader.

## Assumptions

- "A finished state" for a load-tested audit means a URL-only, code-layer-capability audit reaching a
  completed or otherwise terminal outcome — the browser/screenshot-dependent capabilities are excluded
  because the mechanism that would let a capability actually use a browser is not wired into production
  yet, a separate, already-known and already-documented gap this work does not attempt to close or work
  around.
- This exercises the local development environment (the same database and queue instance this
  project's own automated tests already use), not a deployed environment — no deployed infrastructure
  exists to point this at, and the review this closes never asked for one.
- Not incurring real provider cost takes priority over completing every concurrency stage — if reaching
  the highest stages turned out to require anything that risked real spend, the correct outcome is to
  mark those stages unverified, not to relax that rule.
- The database and queue this exercises are shared with other concurrent work on this same machine;
  a heavier stage may need to be deferred to a quieter moment rather than run on a fixed schedule.
