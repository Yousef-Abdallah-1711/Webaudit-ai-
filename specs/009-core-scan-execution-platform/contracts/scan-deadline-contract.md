# Scan Deadline Contract

**Controlled Upstream Amendment U-1 — Scan Deadline Policy** (added 2026-10-10; see `plan.md` "Controlled
Upstream Amendment U-1 — Scan Deadline Policy" for the previous contract, the proven conflict and the amendment
history). Per `spec.md` FR-047 (new), amending the interpretation of FR-040 for scans whose plan contains a
non-passive unit. This contract is the one authority for: how a plan's bounded deadline is calculated, how it is
anchored, who enforces it, and how it interacts with dispatch, finalization, cancellation, F07 stops, crash
recovery and refunds. It introduces NO new scheduler, NO new safety mechanism and NO change to F01 or F07.

## Definitions

- `legacyMaxDurationMs`: the value the existing timeout sweep uses today (`SCAN_TIMEOUT_MS`, default 900 000 ms).
- **Passive unit**: `executionUnitClass` in `PASSIVE_HTTP`, `SOURCE_STATIC`, `TELEMETRY`. **Non-passive unit**: any
  other class (the six F07 classes).
- `timeoutPolicyMs` (existing `ExecutionUnit` field): the full wall-clock a unit may legitimately take from
  `DISPATCHED` to terminal finalization. An engine MUST declare it to include setup (provisioning), dependency
  installation, the work itself (builds/tests/probes), result persistence, cleanup/teardown and finalization.
- `hardStopMarginMs` (new, engine-declared per class, default 60 000): the fixed margin of the parent-armed
  unconditional kill deadline (FR-019: `timeoutPolicyMs + fixed margin`), now an explicit number. An engine whose
  isolation runtime has its own teardown backstop longer than that default declares the larger value
  (SPEC 011 `SOURCE_EXECUTION` declares 300 000).
- `queueWaitAllowanceMs` (platform constant, default 60 000 per non-passive unit): the allowance for time between
  `ADMITTED` and `RUNNING`.
- `unitBudgetMs(u) = u.retryPolicy.maxAttempts x (u.timeoutPolicyMs + u.hardStopMarginMs + queueWaitAllowanceMs)`
  (every attempt can wait in the queue and can run to its hard stop, so all three terms repeat per attempt;
  `maxAttempts` is the FR-024 proven-idempotent bound, 1 for classes without proof).
- `dispatchThresholdMs(u) = u.timeoutPolicyMs + u.hardStopMarginMs` (the minimum remaining time for step 0). It
  deliberately excludes `queueWaitAllowanceMs`: that allowance budgets the wait BEFORE step 0, which has already
  elapsed when step 0 runs (see "Worked arithmetic and the dispatch threshold").
- `planFinalizationMarginMs` (platform constant, default 300 000): time reserved after the last unit for scan
  finalization and reporting.
- `SCAN_PLAN_MAX_DEADLINE_MS` (platform ceiling, default 21 600 000 = 6 h): no plan may carry a larger deadline.
  Raising the ceiling above 6 h is an amendment to this contract, not a configuration change.
- All constants are platform configuration with the stated defaults (provisional tuning values, hard-enforced);
  none is overridable per scan or per request.

## `computePlanDeadline`

```text
computePlanDeadline(graph: ExecutionGraph, grants: GrantRef[], now: DateTime, constants)
  -> { deadlineMs: int, breakdown: { passiveWindowMs, criticalPathMs, finalizationMarginMs, ceilingMs, grantCapMs? } }
   | { refused: "PLAN_DEADLINE_EXCEEDS_CEILING" | "GRANT_EXPIRES_BEFORE_DEADLINE" }
```

Pure and deterministic (FR-046); called only by `resolvePlan` (`execution-plan-contract.md` step 4a).

1. **Passive-only graph** (no non-passive unit): `deadlineMs = legacyMaxDurationMs` (read once at resolution).
   The effective behavior is identical to today's.
2. **Otherwise** `deadlineMs = L + C + M` where:
   - `L = legacyMaxDurationMs` if the graph has at least one passive unit, else 0 (the passive prefix shares
     today's single window; passive units are NOT summed);
   - `C` = the **critical path**: the maximum, over every directed path of non-passive units in the
     `ExecutionDependency` DAG, of the sum of `unitBudgetMs` along the path (parallel siblings do not add; a
     chain adds). Runtime-discovered child units of a frontier-driven class are bounded by their parent's
     `timeoutPolicyMs` and never extend `C` (FR-015);
   - `M = planFinalizationMarginMs`. `L` applies whenever the scan runs any passive-class unit or the legacy module phases
     (every SPEC 011 scan runs acquisition and analysis, so `L` always applies there).
3. If `deadlineMs > SCAN_PLAN_MAX_DEADLINE_MS` the plan is `REFUSED` with `PLAN_DEADLINE_EXCEEDS_CEILING`.
4. For every `TargetAuthorization` the plan references (read-only read of the F01 `expiresAt` scalar by id; no F01
   contract change): if `expiresAt - now < deadlineMs`, the plan is `REFUSED` with `GRANT_EXPIRES_BEFORE_DEADLINE`.
   A deadline is never silently clamped to a grant (a clamped plan could contain units that can never start). This is an
   EARLY-REFUSAL check at resolution time, not a guarantee: the scan may start later (queue wait) and the grant may
   still expire mid-scan, in which case the existing F01/F07 mechanisms (`EXPIRED` at the next checkpoint, dispatch
   admission) refuse or stop the affected units exactly as they do today; the plan deadline neither relies on nor
   overrides them.
5. The result is persisted on the `ScanPlan` (`data-model.md`: `deadlineMs`, `deadlineBreakdown`) in the same
   transaction that persists the graph. There is no update operation for either field.

## Anchor and effective deadline

```text
effectiveDeadlineAt(scan, plan?) -> DateTime
  INITIAL plan:   scan.startedAt + plan.deadlineMs        // startedAt is written exactly once, by the guarded
                                                          // QUEUED -> RUNNING_PHASE_1 transition
  REVERIFY plan:  plan.resolvedAt + plan.deadlineMs
  no ScanPlan:    scan.startedAt + legacyMaxDurationMs    // legacy scans, byte-for-byte today's behavior
```

1. `Scan.startedAt` cannot be rewritten (the transition is a compare-and-swap on `state = QUEUED`); `resolvedAt` is
   an immutable default. Therefore retries, redeliveries, worker restarts and progress events cannot move a
   deadline. Time spent in `AWAITING_QUESTIONNAIRE` counts against the deadline, exactly as today.
2. A non-passive unit of an `INITIAL` plan MUST NOT be dispatched while `Scan.startedAt` is null.
3. The deadline is derived at read time and never stored as an absolute timestamp (no second source of truth).

## Worked arithmetic and the dispatch threshold

`timeoutPolicyMs` MUST be declared as the sum of the engine's worst-case phase budgets from DISPATCH to terminal
finalization, with retries of any phase inside that phase's own budget. Example engine (SPEC 011 `SOURCE_EXECUTION`,
13 lifecycle phases): 30 + 30 + 10 + 120 + 30 + 1 500 + 60 + 120 + 30 + 60 + 30 + 10 s (phase 7 runs inside phase 6;
provisioning retries must fit inside the 120 s phase 4 budget) = 2 030 s = **2 030 000 ms (33 min 50 s)**;
`hardStopMarginMs` = 300 000; `queueWaitAllowanceMs` = 60 000; `maxAttempts` = 1.

| Quantity | Formula | Value |
|---|---|---|
| `unitBudgetMs` | 1 x (2 030 000 + 300 000 + 60 000) | **2 390 000 ms (39 min 50 s)** |
| `dispatchThresholdMs` | 2 030 000 + 300 000 | **2 330 000 ms (38 min 50 s)** |
| difference | `queueWaitAllowanceMs` | 60 000 ms (1 min) |
| four chained units, passive prefix | L + 4 x 2 390 000 + M = 900 000 + 9 560 000 + 300 000 | **10 760 000 ms (2 h 59 min 20 s)** (ceiling 21 600 000) |

**Why the two numbers differ (not a discrepancy).** The plan budget must cover the worst case from the moment a unit
becomes eligible, including up to `queueWaitAllowanceMs` of queue wait; the dispatch check runs at pickup, after that
wait has been spent, so it only needs the time the unit itself can still consume (`timeoutPolicyMs` + `hardStopMarginMs`).

**Lemma (a dispatch is never refused merely because earlier units used their full budget).** Let units u_1..u_n form a
chain with budgets b_i = a_i(t_i + h_i + q), deadline D = L + sum(b_i) + M, and start at time 0. Passive work ends by L.
Each attempt of a unit is picked up at most q after it becomes eligible and ends by its pickup + t_i + h_i (parent-armed
hard stop). By induction the pickup of u_i's first attempt is at most L + sum_{j<i} b_j + q, so remaining time at that
pickup is at least sum_{j>=i} b_j + M - q >= t_i + h_i (+ remaining attempts and later units), i.e. >= dispatchThresholdMs.
The same argument holds for attempt k > 1 because b_i contains (a_i - k + 1) further full attempts. Therefore the
dispatch precondition refuses only when real elapsed time exceeded the worst-case bounds (for example a non-chain
dependency not captured in the graph), never in the bounded case. Slack at the last unit is at least M.

## Dispatch precondition (extends `execution-runtime-contract.md` `dispatchExecutionUnit`)

Applies ONLY to non-passive units (passive-class dispatch on the scan-phase queue is unchanged, so a passive unit picked up
late behaves exactly as today). Executed as step 0, immediately after the worker re-reads the unit, its plan and its scan
from Postgres and BEFORE F07's `safetyCheckpoint` (so a refusal here consumes no F07 budget and acquires no lease). The
unit may be `PLANNED`, `ADMITTED` or `DISPATCHED` at that moment ("`DISPATCHED` means a queue job exists and NO child
process or Guest has started"; this resolves the ordering ambiguity between the 009 diagram and the runtime contract).

1. If the scan is terminal, or `now >= effectiveDeadlineAt`: do not dispatch; finalize the unit `REFUSED` with the reason
   from the matrix below (`SCAN_DEADLINE_EXPIRED`, `SCAN_CANCELLED` or `SCAN_FAILED`).
2. If `effectiveDeadlineAt - now < dispatchThresholdMs(unit)` (= `timeoutPolicyMs + hardStopMarginMs`): do not dispatch;
   finalize `REFUSED` `SCAN_DEADLINE_INSUFFICIENT` (the unit's own parent-armed kill deadline would fall after the scan
   deadline). If passive work overran `L`, this fails closed rather than starting a unit that cannot finish.
3. Otherwise continue with F07 `safetyCheckpoint` exactly as before.

The refusal reasons are reported by FR-039's coverage metadata as "did not contribute" with that reason.

## Running units (extends the engine's host loop)

Every non-passive unit's hosting process already runs a loop at F07's <= 5 s cadence (checkpoint, lease renewal).
That same iteration additionally reads `expired = scan.state is terminal OR now >= effectiveDeadlineAt` (one indexed
read). On `expired` the host terminates its own execution (kills the child process; for isolation runtimes, destroys
the Guest) and calls `finalizeExecutionUnit` with the outcome mapped in the status-by-cause matrix below. This is liveness
enforcement of the plan's own declared bound; it is NOT an F07 safety trigger and does not call `triggerStop`.
The 5 s cadence is shared; no timer service is added.

## Sweeper (the existing `timeout-sweep` job; no second scheduler)

`sweepTimedOutScans` is extended, not replaced. It remains the single repeatable job on `webaudit-maintenance`
(`upsertJobScheduler` key `timeout-sweep`), same interval, same guarded transition, same refund path. Per
invocation:

1. **Legacy pass (unchanged semantics)**: scans in the sweepable states, `startedAt < now - legacyMaxDurationMs`, that
   have NO `RESOLVED` `INITIAL` `ScanPlan` (a scan whose only plan was `REFUSED`, or that has none, is legacy). With no
   `ScanPlan` rows in existence the result set is identical to today's.
2. **Planned pass**: scans in the sweepable states that have an `INITIAL` `RESOLVED` `ScanPlan` and
   `startedAt + plan.deadlineMs < now`. The deadline comes from the plan, never from a hard-coded constant.
3. For each PLANNED candidate, in this order: (a) `expirePlanUnits(scanPlanId)` (below), then (b) every registered
   **module-result finalizer** for the plan (below), then (c) the existing single-transaction fresh re-read,
   delivered/undelivered computation and guarded `transition(from: observedState, to: TIMED_OUT)`. Steps (a) and (b)
   are idempotent and valid because the deadline has already passed; doing them BEFORE (c) means the refund is
   computed from module results that reflect everything the units actually delivered (otherwise a module with
   partial results would be refunded as undelivered). For a legacy candidate only (c) runs, exactly as today.
4. The refund is issued only after the guarded move succeeded (`moved: true`) and only per the existing
   `refundForUndelivered` / ledger rules. A lost race (`moved: false`) issues nothing. The gate cannot steal the transition after the
   deadline (it carries the deadline predicate, see "Plan-unit barrier"), so a scan past its deadline ends `TIMED_OUT`
   unless it was cancelled or failed first.
5. **Self-healing pass**: every invocation also selects non-terminal `ExecutionUnit`s whose plan's scan is terminal,
   and non-terminal units of `REVERIFY` plans past `resolvedAt + deadlineMs`, and applies `expirePlanUnits` to them,
   so no unit can outlive its scan or its plan for more than one sweep interval plus its own host's <= 5 s loop.

## `expirePlanUnits` and the status-by-cause matrix

```text
expirePlanUnits(scanPlanId) -> void   // idempotent; safe to run repeatedly and concurrently
```

Units are processed in **topological order, predecessors first**, one transaction per unit, each reading the unit's CURRENT
`idempotencyKey`. Because `finalizeExecutionUnit` propagates `BLOCKED` to direct dependents of a non-`COMPLETED`
unit, a dependent of an already expired predecessor ends `BLOCKED` (blocked-by the predecessor), never `REFUSED`; the
order makes every reason deterministic. A unit a host already finalized is a no-op. This function never writes to F07
tables and never calls `triggerStop`. It never invokes the scan-phase gate (the gate refuses after the deadline in any
case).

**Status-by-cause matrix (complete; every edge used is existing or explicitly ADDED).** "REFUSED(x)" means
`finalizeExecutionUnit({ REFUSED, reason: x })`.

| Cause | `PLANNED` | `ADMITTED` | `DISPATCHED` (no process yet) | `RUNNING` |
|---|---|---|---|---|
| Plan deadline passed (scan `TIMED_OUT` or sweep) | REFUSED(SCAN_DEADLINE_EXPIRED) via `PLANNED->REFUSED` **ADDED** | REFUSED(SCAN_DEADLINE_EXPIRED) via `ADMITTED->REFUSED` existing | REFUSED(SCAN_DEADLINE_EXPIRED) via `DISPATCHED->REFUSED` **ADDED** | FAILED(`TIMEOUT`, detail `SCAN_DEADLINE`) via `RUNNING->FAILED` existing |
| Scan `CANCELLED` (user) | REFUSED(SCAN_CANCELLED) (same edges as above) | REFUSED(SCAN_CANCELLED) | REFUSED(SCAN_CANCELLED) | CANCELLED via `RUNNING->CANCELLED` existing |
| Scan `FAILED` (platform) | REFUSED(SCAN_FAILED) | REFUSED(SCAN_FAILED) | REFUSED(SCAN_FAILED) | FAILED(`TRANSIENT_INFRASTRUCTURE`) existing |
| F07 `KillSwitchState` (REQUESTED/ACKNOWLEDGED/STOPPED) for the unit, scan, grant, target, tenant or platform, unit not yet terminal (read of F07 state, as every checkpoint does) | REFUSED(KILL_SWITCH_PENDING) | REFUSED(KILL_SWITCH_PENDING) | REFUSED(KILL_SWITCH_PENDING) | KILLED(f07Reason) or CANCELLED (`USER_CANCELLATION`) existing |
| Dispatch step 0 (before F07) | REFUSED(SCAN_DEADLINE_EXPIRED / _INSUFFICIENT) | same | same via `DISPATCHED->REFUSED` | n/a |

An F07 stop recorded for the unit beats the deadline outcome in every column. An `ADMITTED` or `DISPATCHED` unit holds
an F07 lease when its checkpoint already returned `PROCEED`; finalization releases it (subject to the termination
confirmation rule below for engines with an isolation runtime).

**Termination confirmation (engines with an isolation runtime).** Each non-passive engine registers an idempotent
`onUnitExpired(unit) -> TERMINATED | PENDING`. `TERMINATED` means the engine's execution is confirmed gone (SPEC 011:
the Execution Plane acknowledged `DESTROYED`). For a `RUNNING` unit `expirePlanUnits` finalizes only on
`TERMINATED`; on `PENDING` the unit stays non-terminal and keeps its F07 lease (so concurrency is not freed while a
Guest may still be alive) and the next sweep invocation retries. The engine's hosting-failure backstop bounds the
`PENDING` window (see rule 3 under "Interaction"); if a unit is still `PENDING` `hardStopMarginMs` after the deadline
the unit is finalized `FAILED`/`TRANSIENT_INFRASTRUCTURE` with detail `TERMINATION_UNCONFIRMED` and the engine raises
its operator alert (the Execution Plane quarantines the host). Pre-`RUNNING` units have nothing to terminate and are
finalized immediately.

## Plan-unit barrier in the scan phase chain and module-result finalizers

A `Scan` MUST NOT proceed to report synthesis, and therefore MUST NOT reach `COMPLETED`, while any unit of its
`INITIAL` plan is non-terminal. The orchestrator already chains phase jobs and never holds a worker slot for a wait
(R4: `awaitQuestionnaire` waits as a database row plus a delayed job). The barrier reuses that pattern; it adds no
edge into `COMPLETED` and no new scan state:

```text
continueScanIfPlanTerminal(scanId) -> continued | not-ready | lost-race      // idempotent
```

1. The orchestrator's existing continuation after its last module-running phase (the code that today moves to and
   enqueues `RUNNING_MASTER`) first calls the gate. If any unit of the scan's `RESOLVED` `INITIAL` plan is
   non-terminal it returns without continuing, leaving the scan in its current module-running state (a database-row
   wait; the job ends and releases its slot).
2. `finalizeExecutionUnit` calls the gate after each unit's terminal commit (post-commit, never inside the unit
   transaction).
3. When every unit is terminal the gate runs every registered **module-result finalizer**, then performs the same
   guarded continuation the orchestrator would have performed (winner enqueues, loser is a no-op, as in R4). The scan
   still reaches `COMPLETED` only through `RUNNING_MASTER -> RUNNING_DOCS -> COMPLETED`, so master synthesis sees the
   final unit outcomes.
4. A **module-result finalizer** is a domain/engine-registered, idempotent function `finalizeModuleResults(scanPlanId)`
   that writes the `ModuleResult` rows for the modules it owns from committed Evidence/Check outcomes (SPEC 011
   registers its FR-154 mapping and `sweepUnresolvedSourceChecks`; SPEC 010 registers its own). 009 only defines the
   extension point.
5. **Deadline predicate (atomic).** The gate's guarded continuation is a single compare-and-swap statement whose
   predicate includes the deadline evaluated by the database in the same statement (
   `WHERE id = ? AND state = <from> AND now() < <effective deadline>`). After the deadline the gate returns `not-ready`
   and only the sweep may end the scan (`TIMED_OUT`), so unit finalizations performed by `expirePlanUnits` can never
   resume the chain and expired scans never run master synthesis or docs. If the gate's statement commits before the
   deadline the chain continues and remains subject to the deadline in `RUNNING_MASTER`/`RUNNING_DOCS` (the margin `M`
   exists for them). The sweep's `TIMED_OUT` edge exists from every sweepable state; a lost sweep compare-and-swap
   (state moved by cancel, failure or a pre-deadline gate) is simply retried by the next invocation against the new
   state, so the outcome is `TIMED_OUT` unless another terminal state wins first, and the refund follows the winning
   state under the existing rules. A crash between the guarded move and the refund loses (never doubles) the refund,
   exactly as in the legacy sweep; that behavior is unchanged.

## Evidence and finalization fencing

1. `finalizeExecutionUnit` is the only terminal write for a unit (unchanged); a finalization with a different outcome
   for a terminal unit is rejected by its rule 2 and a stale idempotency key by rule 1. With `attempts: 1` the
   idempotency key never changes, so rule 1 does NOT fence a stale holder of the SAME attempt; `finalizeExecutionUnit`
   has no lease parameter. Every engine that holds an F07 lease MUST therefore confirm its lease is still live (the
   renewal result of its last checkpoint) and that the deadline has not passed immediately before it finalizes, and a
   stale holder that loses that check MUST NOT finalize.
2. Evidence written BY a unit's execution is fenced by the engine's execution wrapper, not by the generic
   `recordEvidence`: the wrapper MUST NOT write for a unit that is terminal or whose scan is terminal or whose plan
   deadline has passed, and the checks and the claim are ordered **fence first, claim second, write third** inside one
   transaction (a rejected writer therefore never leaves a live idempotency claim that could block the legitimate
   holder). The generic `recordEvidence` stays permissive because registry-dispatched evidence (SPEC 010
   `CHECK_RESULT`, SPEC 011 `SOURCE_CHECK_RESULT`) is written parent-side AFTER units are terminal and is attributed to
   a unit without being produced by that unit's execution; rejecting it would break those sweeps. Evidence committed
   before expiry is kept (FR-038). Because the generic path is permissive by convention, each engine MUST carry a test
   that every unit-produced evidence write goes through its wrapper.

## Clock, transitions and termination hooks

1. **Clock**: every NEW deadline comparison (dispatch step 0, host loop, planned-pass sweep selection, the gate's atomic
   predicate) uses the database clock (`now()` in the same statement or transaction). `Scan.startedAt` is written by the
   existing legacy transition code with the transitioning worker's clock and the legacy pass keeps comparing it to the
   worker's clock exactly as today (byte-identical legacy behavior); the resulting skew between the two clocks is
   bounded by the platform's time-synchronization requirement (<= 5 s, NTP) and is absorbed by `M`. The legacy value
   `legacyMaxDurationMs` is read through one shared configuration accessor used by both the API (plan resolution) and the
   worker (sweep).
2. **Transitions**: the complete set is the matrix above. Exactly two edges are ADDED to the 009 unit state machine,
   `PLANNED -> REFUSED` and `DISPATCHED -> REFUSED`; both lead to the existing `REFUSED` status and neither is reachable
   by any engine for any other purpose. No unit status is added. Every other edge used already exists in the 009 diagram,
   `data-model.md` and `execution-runtime-contract.md`. On the scan side no new edge is needed: `TIMED_OUT`,
   `CANCELLED` and `FAILED` already exist from every non-terminal state in `state-machine.ts`, and the gate uses only the
   existing forward edge. `finalizeExecutionUnit`'s existing rules (idempotence, lease release, `BLOCKED` propagation, no
   re-finalization with a different outcome) apply unchanged.
3. **Engine termination hook**: `onUnitExpired(unit) -> TERMINATED | PENDING` as defined above; a missing hook is a
   defect that blocks the engine's activation (rule 3 below).
4. **Query cost**: the self-healing pass needs an index that makes "non-terminal units of terminal scans/expired plans"
   a bounded query (implementation task T-U1-7).

## Interaction with cancellation, F01 and F07

1. User cancellation and F07 stops are processed by their existing paths and ALWAYS take precedence over the deadline:
   whichever terminal write happens first wins (compare-and-swap); the deadline never reverses or overrides a
   terminal state.
2. The deadline adds no F07 trigger, consumes no F07 budget and does not call `isAuthorized`; dispatch refusals
   (step 0) happen before `safetyCheckpoint`. F01/F07 contracts, enums and audit types are unchanged. The only F01
   interaction is the read-only `expiresAt` read in `computePlanDeadline` step 4.
3. Every non-passive engine MUST declare an independent hosting-failure backstop that terminates its execution within
   `hardStopMarginMs` after the unit's `timeoutPolicyMs` even if the hosting process is dead (SPEC 011:
   Execution Plane dead-man switch, hard TTL as an ABSOLUTE instant computed at dispatch = dispatch time +
   `timeoutPolicyMs` + `hardStopMarginMs`, orphan reconciler). Without it the engine may not be activated.

## Cross-spec obligations (recorded, not amendments of frozen specs)

Any non-passive engine becomes subject to this contract when it is wired, including SPEC 010's `BROWSER` and `CRAWLER`
classes: it must declare `hardStopMarginMs`, a hosting-failure backstop and `onUnitExpired`, and a domain that writes
`ModuleResult` rows must register a module-result finalizer. SPEC 010's frozen text neither requires nor forbids these;
they are implementation obligations of the engine wiring and are recorded here and in SPEC 011's
`upstream-amendment-requests.md`. If the project owner considers them an amendment to SPEC 010 it must be raised
separately; this amendment edits no SPEC 010 file. The premise that passive work ends within `L` is not enforced by this
contract (passive units keep today's per-module timeouts); if it fails, dispatch step 0 fails closed. `M` covers master
synthesis and docs after the last unit and is a provisional value that MUST be calibrated by measurement before any
non-passive class is activated.

## Failure behavior

| Condition | Result |
|---|---|
| Deadline cannot be computed (internal error) | `resolvePlan` fails closed: `REFUSED` with an internal-error reason (never a default deadline) |
| Plan resolves with `deadlineMs` over the ceiling | `REFUSED` `PLAN_DEADLINE_EXCEEDS_CEILING` |
| A referenced grant expires before the deadline | `REFUSED` `GRANT_EXPIRES_BEFORE_DEADLINE` |
| Dispatch with too little remaining time | unit `REFUSED` `SCAN_DEADLINE_INSUFFICIENT` (no budget consumed) |
| Dispatch after expiry | unit `REFUSED` `SCAN_DEADLINE_EXPIRED` |
| Sweep loses the compare-and-swap | no refund, no side effect; units still handled by the self-healing pass |

## Non-negotiable boundary rules

1. Every `RESOLVED` `ScanPlan` carries a bounded `deadlineMs`; there is no unlimited or "none" value.
2. No code path writes `ScanPlan.deadlineMs` or `Scan.startedAt` after creation; no retry, redelivery, restart or
   progress event may move a deadline.
3. The sweep consumes the authoritative plan deadline; it contains no hard-coded universal duration other than the
   legacy value used for scans without a `ScanPlan`.
4. A scan without a `ScanPlan` behaves exactly as before this amendment.
5. No second scheduler, queue, timer service or safety system is introduced; enforcement reuses the existing
   `timeout-sweep` job and the engine hosts' existing <= 5 s loops.
6. An expired or terminal plan is never resurrected: no transition leaves a terminal status, and dispatch step 0
   refuses every redelivery.
7. Deadline enforcement never weakens F01 authorization or F07 admission and never replaces an F07 stop.
8. No AI judgment participates in any deadline decision (FR-046).
