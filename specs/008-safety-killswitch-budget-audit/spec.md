# Feature Specification: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail

**Feature Branch**: `008-safety-killswitch-budget-audit`

**Created**: 2026-10-07

**Status**: Planning complete — frozen for downstream specs (F02 Scan Profiles/Execution Planning, F04
Execution Runtime, F05 Credentials/Sessions, F06 Credits/Metering, and any `ACTIVE_SECURITY`/
`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`/`SOURCE_EXECUTION` engine spec — E13/E14/E15/E16 — may now consume
this spec's Safety Admission, Kill Switch, Safety Checkpoint, and Execution Audit contracts without
redesigning them). No implementation has occurred under this feature — see Migration & Backward
Compatibility (FR-026) and SC-005.

**Downstream contract freeze**: future specs MUST consume this spec's four shared contracts
(`contracts/safety-admission-contract.md`, `kill-switch-contract.md`, `safety-checkpoint-contract.md`,
`execution-audit-contract.md`) rather than inventing parallel safety mechanisms. Specifically, no future
engine spec (E13/E14/E15/E16) or runtime spec (F04) may independently implement: its own
authorization-plus-budget read-then-act logic; a private budget reservation system; private kill-switch
state; a private execution-audit trail that bypasses mandatory redaction; or a direct call to F01's
`isAuthorized` for a safety-sensitive action that bypasses this spec's admission/checkpoint contracts
(FR-001/FR-018's own boundary rules already state this; this note exists so a reader of the header alone
sees it without opening every contract file).

**Input**: User description: "F07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail. Child
spec of the completed master architecture at `specs/006-scan-architecture-v2/` and the frozen Foundation
Spec 01 at `specs/007-foundation-target-authorization-scope/` (per `roadmap.md`, F07 depends only on F01).
This is the shared runtime safety control plane that future execution engines (Browser/Probe, Crawler,
Active Security, Authenticated Workflow, Load/Capacity, Untrusted Source Execution) must depend on for:
atomic budget admission/reservation, a kill-switch model, crash/retry/stale-lease recovery, idempotency,
and an execution audit trail with mandatory redaction. Must NOT design any specific engine's execution/test
logic, must NOT weaken F01's absolute production prohibition, must NOT implement anything in this session."
(Full triggering brief, evidence baseline, and F01 contract boundary supplied in the session that created
this spec; current-state infrastructure claims are drawn from a dedicated read-only audit performed in that
same session, treated here as settled fact with file:line citations preserved below, not re-derived.)

**A note on template fit**: like its sibling F01, this is a foundation/platform-contract spec, not an
end-user-facing feature — it produces a real, consumable contract (a safety admission function, a
kill-switch state machine, an audit-event schema) that F04 (Execution Runtime, not yet planned) and every
future active-class engine (E13 Untrusted Source Execution, E14 Active Security, E15 Authenticated
Workflow, E16 Load/Capacity) will call directly. Its "users" are: (a) the platform engineer who implements
the admission/reservation service and the kill-switch propagation mechanism this spec contracts; (b)
every future engine spec's author, who must consume `SafetyAdmission`/the kill-switch contract/
`ExecutionAuditEvent` rather than invent a parallel safety mechanism; (c) an operator, who is the actual
human who triggers an emergency stop once an engine exists to stop; (d) a target's owner, whose
revocation (F01) this spec is responsible for turning into an actual stopped process. Success criteria mix
planning-artifact completeness (per the parent's pattern) with concrete, testable safety-mechanism
properties specific to this spec's scope.

## Clarifications

### Session 2026-10-07

- Q: What is the maximum acceptable time between a stop being requested (user cancellation, authorization
  revocation observed, or operator emergency stop) and a cooperating execution unit observing that stop
  and ceasing new safety-sensitive action, before this spec's escalation path engages? → A: 5 seconds,
  fixed as a platform-wide ceiling (tighter than today's ~60s per-module timeout grain; matches the
  existing per-call `AbortSignal.timeout` cadence already used for AI/network calls) — see FR-013.
- Q: Does `ExecutionAuditEvent` (the record of what a scan execution attempted against a third-party
  target) follow the same retention policy and timing as today's report/evidence data (per the parent
  architecture's ADR-007), or does it need its own, longer, compliance-driven retention given it is the
  only record of adversarial/authenticated activity directed at a customer's target? → A: Same retention
  policy and timing as today's report data; no separate compliance-driven tier by default — revisit only
  with a concrete future compliance requirement as new evidence — see FR-024.
- Q: Can a platform operator's emergency stop target a single running execution only, or must it also be
  able to stop every execution currently running under a specific grant, a specific target, or a specific
  tenant in one action? → A: Multi-scope — execution, grant, target, tenant, or platform-wide, so an
  operator can respond to a live incident at its actual blast radius — see FR-010.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Two workers cannot both consume the last unit of a scarce budget (Priority: P1)

A future engine (e.g. Active Security) is about to dispatch a unit of work against a target under a grant
whose `concurrencyBudget` has exactly one remaining slot. Two workers race to start overlapping work under
the same grant at nearly the same instant. Today's `isAuthorized` contract (F01) is a pure, side-effect-free
read — calling it from both workers, even immediately before each dispatch, lets both read "one slot
remains" and both proceed, oversubscribing the grant's safety-critical concurrency limit.

**Why this priority**: this is the exact race F01's own FR-024 names as something it deliberately does not
prevent and explicitly assigns to F07 ("a simple read-then-act check is insufficient for concurrency
enforcement... this spec does not claim otherwise"). Every other story in this spec depends on this one
being solved first — a kill switch and an audit trail are meaningless safety controls if the budget they
are supposed to bound can already be silently oversold by two concurrent callers.

**Independent Test**: can be fully tested by configuring a grant with `concurrencyBudget: 1`, issuing two
concurrent admission requests for the same grant and execution class, and confirming exactly one succeeds
and the other is refused with a distinguishable "budget exhausted" reason — entirely independent of any
engine actually existing yet, since this story tests the shared admission primitive, not an engine.

**Acceptance Scenarios**:

1. **Given** an active `TargetAuthorization` grant with `concurrencyBudget: 1` and zero current leases,
   **When** two callers request admission for the same grant and execution class within the same
   millisecond, **Then** exactly one receives a granted lease and the other is refused, never both granted
   and never both refused.
2. **Given** the same grant with its one lease held, **When** a third caller requests admission, **Then**
   it is refused with a reason distinguishable from "revoked," "expired," and "out of scope."
3. **Given** a grant with `requestBudget: 1,000,000` and 999,999 already consumed, **When** two callers
   each attempt to consume one request unit concurrently, **Then** exactly one succeeds and the other is
   refused — the request budget is exhausted exactly once, never left at a negative remaining value and
   never silently allowed to go over by more than the single admitted unit.

---

### User Story 2 - A running execution actually stops when its authorization is revoked (Priority: P1)

An `ACTIVE_SECURITY` execution is currently running against a target under a `TargetAuthorization` grant.
The target's owner revokes that grant mid-execution — because they changed their mind, discovered the
grant was created in error, or observed unexpected behavior. F01's own contract (FR-014's closure-pass
boundary) is explicit that `revokedAt` is "a database write, not a signal delivered to a running process"
and that physically interrupting already-running work is this spec's responsibility, not F01's. Today's
platform has no mechanism that turns a revocation into a stopped process at all — the closest existing
primitive (scan cancellation, `apps/worker/src/orchestrator/cancellation.ts`) is scoped to one `scanId`,
is a cooperative flag checked at two specific checkpoints in the existing orchestrator
(`apps/worker/src/orchestrator/orchestrator.ts` ~lines 401-406, 456), and is explicitly documented as not
interrupting a capability call already in flight.

**Why this priority**: tied with User Story 1 as P1 because a kill switch that does not actually stop
anything is not a safety control, it is a false sense of one — this is precisely the gap Constitution
Principle X's "a working emergency stop reachable independent of the normal cancellation path" exists to
close, and the gap F01's own handoff brief flagged as unresolved and explicitly deferred to this spec.

**Independent Test**: can be fully tested by granting an authorization, starting a (simulated) long-running
execution unit that performs a safety-sensitive action once per second, revoking the grant mid-run, and
confirming the execution unit observes the stop and ceases further safety-sensitive action within this
spec's own bounded stop-latency guarantee (FR-013) — entirely independent of any specific engine's actual
test logic, since this story tests the shared stop-propagation mechanism, not what the execution was
actually doing.

**Acceptance Scenarios**:

1. **Given** a running execution unit dispatched under a now-revoked grant, **When** the next
   safety-sensitive checkpoint inside that execution unit is reached, **Then** it observes the stop and
   refuses to proceed, recording why.
2. **Given** the same scenario, **When** the execution unit does not reach a cooperative checkpoint within
   this spec's stop-latency bound, **Then** escalation engages per FR-013/FR-014, and the escalation event
   itself is audited.
3. **Given** an execution unit that has already fully stopped, **When** a stale, redelivered copy of its
   underlying job is later processed (a BullMQ redelivery, a worker crash-and-restart), **Then** it is
   recognized as belonging to already-stopped work and is not resurrected into a second, duplicate
   execution.
4. **Given** an operator-triggered emergency stop against a specific running execution, **When** the
   target's owner never revoked anything themselves, **Then** the stop still succeeds and is distinguishably
   audited as operator-initiated, not as an authorization-revocation reaction.

---

### User Story 3 - A reviewer can reconstruct exactly what an execution did, under what permission, and why it stopped (Priority: P2)

After an `AUTHENTICATED_WORKFLOW` execution completes (or fails, or is killed), a reviewer — an engineer
investigating an incident, a customer asking "what did Fahes actually do against my site," or a future
compliance process — needs to reconstruct: who initiated it, against which Target, under which
`TargetAuthorization`/`ScopeDefinition`/`TargetEnvironment`, what budget was reserved and consumed, what
was actually attempted, when it started and stopped, and why it stopped (completed normally, refused at
admission, cancelled, revoked, killed, crashed). Today's `AuditLogEntry` (`apps/api/prisma/schema.prisma`
lines 853-867) is an admin/control-plane log with no `scanId`/execution linkage, no cost/timing fields, and
is never written for scan lifecycle, credit, or capability-execution events — it cannot answer any of these
questions today, because nothing resembling an active/adversarial execution exists yet to generate them.

**Why this priority**: lower than User Stories 1-2 because an audit trail does not itself prevent harm the
way admission control and the kill switch do — but it is this spec's other named deliverable (per
`specs/006-scan-architecture-v2/roadmap.md`'s F07 row: "`ExecutionAuditEvent`, the emergency-stop and
target-safety-kill-switch mechanisms, and the... budget enforcement hooks") and the only mechanism that
makes the first two stories' behavior independently verifiable after the fact rather than merely trusted.

**Independent Test**: can be fully tested by running a (simulated) execution unit through admission,
execution, a safety-relevant event (a budget reservation, a refusal, a stop), and completion, then querying
this spec's audit trail and confirming every field User Story 3's question list above requires is present,
correctly attributed, and — for any field that could carry a secret, token, cookie, or credential — redacted
before the query ever returns it.

**Acceptance Scenarios**:

1. **Given** an execution that was refused admission (budget exhausted), **When** a reviewer queries the
   audit trail for that attempt, **Then** they find a recorded `ExecutionAuditEvent` showing the refusal
   and its specific reason, even though no `CapabilityExecution`-equivalent row was ever created for work
   that never started.
2. **Given** an execution whose evidence-producing payload happened to echo back a session cookie or an
   API key, **When** that event is persisted, **Then** the persisted record has that value redacted through
   the existing `@webaudit/redaction` mechanism, never stored or displayable in raw form.
3. **Given** an execution that was stopped by the kill switch, **When** a reviewer inspects its audit
   trail, **Then** they can distinguish "stopped via user cancellation," "stopped via authorization
   revocation," and "stopped via operator emergency stop" as three different recorded reasons, never a
   single undifferentiated "stopped."

### Edge Cases

- **Two workers race for the last concurrency slot** → User Story 1, Scenario 1; resolved by FR-001/FR-002's
  atomic admission primitive, never by a read-then-act check.
- **A worker reserves budget, then crashes before starting work** → the reservation must not leak
  permanently; FR-004/FR-006 require a bounded lease with recovery on expiry, not a reservation held
  forever by a dead worker.
- **A worker consumes budget, then crashes before acknowledging completion to the caller** → resolved by
  this spec's own transaction boundary, not left ambiguous: the database transaction committing **is** the
  consumption, full stop — if the transaction committed, the unit is consumed, whether or not the crashed
  caller ever received the response. A caller that does not receive a response after a call it believes
  may have landed MUST re-query admission state by the same idempotency key (FR-008) before assuming
  failure, never blindly retry with a freshly-minted key — the same discipline `BillingEvent`'s own
  received-vs-applied check already requires of a webhook sender that did not receive a 200.
- **A BullMQ job is redelivered (stalled-job recovery, at-least-once delivery) for an execution that
  already fully consumed its budget and completed** → FR-008 requires idempotent replay of this spec's own
  *budget ledger*: the redelivered job's admission call recognizes the same idempotency key as already
  applied and returns the same result without consuming a second unit. **Scope correction (found during
  this spec's own independent adversarial review)**: this guarantees the ledger is never double-counted;
  it does **not**, by itself, guarantee the redelivered job skips re-executing its own actual side effect
  (e.g., resending a payload, repeating an authenticated-workflow step) — a `GRANTED` reply to a duplicate
  admission call tells the caller it may proceed, not that it should skip its own action. Preventing
  re-execution of the action itself is each engine's own job-level idempotency/state-tracking
  responsibility (per FR-019's unit-consumption-policy deferral), which this spec's admission ledger
  supports (by making a second admission call cheap and safe to issue) but does not itself enforce.
- **A stopped job's queue entry is retried anyway** → FR-014 requires that a stop, once acknowledged, is
  permanent for that execution unit's identity — no retry path may resurrect it.
- **A kill-switch stop is triggered twice for the same scope key** (e.g. a user double-clicks cancel, two
  operators act on the same incident) → `KillSwitchState`'s `@@unique([scope, scopeId])` constraint
  (`data-model.md`) makes the second `triggerStop` call an idempotent no-op against the existing
  `REQUESTED`/`ACKNOWLEDGED` row, never a second competing stop record or a duplicated audit event beyond
  what the first trigger already wrote.
- **Authorization is revoked mid-request** (User Story 2) → FR-012/FR-013.
- **A Target's `TargetEnvironment` classification changes from staging to production while an
  `ACTIVE_SECURITY` execution is already running under a staging-only grant** → FR-016 requires the next
  safety checkpoint to observe this and refuse to continue, exactly as it would observe a revocation; this
  spec does not special-case "environment changed" as a lesser event than "revoked."
- **The kill switch is requested while Redis is unavailable** → resolved, not left open: `triggerStop`'s
  Postgres `KillSwitchState` write (the authoritative half, `research.md` R1/R4) succeeds regardless of
  Redis's availability — only the best-effort propagation accelerant is affected. An already-running
  execution still observes the stop at its own next checkpoint poll of Postgres, within FR-013's 5-second
  bound; Redis's absence degrades how much *sooner* than that bound the execution might have learned about
  the stop, never whether it eventually does.
- **The database write for a budget reservation succeeds but the corresponding Redis-side (or
  equivalent) concurrency-lease write fails, or vice versa** → FR-009 requires one of the two orderings to
  be authoritative and the other to be reconciled or rolled back, never left in a state where the two
  disagree about whether a lease is held.
- **An operator attempts to kill a different tenant's execution** → FR-011 requires the same tenant-scoped
  authority model F01 already established for grant revocation (operators act platform-wide by design, but
  every action is attributed and audited, never anonymous).
- **A redirect, a newly discovered crawl destination, or a workflow's next step arrives mid-execution** →
  this spec does not re-design F01's per-destination scope re-check (FR-010 of F01); it requires that
  **every** such re-check that would consume additional request budget also goes through this spec's
  admission primitive, not only the first request of an execution.
- **The platform restarts (deploy, crash) while a kill-switch stop is in the REQUESTED or ACKNOWLEDGED
  state, or while concurrency leases are held** → FR-017 requires both to be recoverable from durable state
  on restart, never silently forgotten (a forgotten in-flight stop request must not let a killed execution
  effectively resume; a forgotten lease must not stay allocated forever against a worker that no longer
  exists).
- **An execution that was never authorized at all (refused at admission) still needs an audit trail entry**
  (User Story 3, Scenario 1) → FR-023.

## Requirements *(mandatory)*

### Functional Requirements — Safety Admission (atomic check-and-reserve)

- **FR-001**: This spec MUST define a single shared **Safety Admission** operation that every future
  execution engine calls immediately before any safety-sensitive action (dispatching a unit of work, or —
  for `CRAWLER`/`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY` — each individual request/step
  within an already-running execution, per F01's FR-010/FR-024 per-destination re-check requirement). This
  operation MUST atomically combine, as one indivisible unit: (a) a fresh call to F01's `isAuthorized`
  contract for the specific `(targetId, executionClass, destination)` triple, and (b) — only if that call
  returns `AUTHORIZED` — reservation of one unit each of whatever budgets the calling action requires
  (a request-budget unit, a concurrency-budget lease, or both). No caller may observe step (a)'s result and
  separately perform step (b); this spec's admission operation is the only code path that performs both.
- **FR-002**: Safety Admission MUST be safe under concurrent callers: if N callers simultaneously request
  admission against a grant with fewer than N units of remaining budget, exactly as many as the remaining
  budget allows MUST succeed, and the rest MUST be refused with a reason attributing the refusal to budget
  exhaustion specifically (distinguishable from `REVOKED`/`EXPIRED`/`OUT_OF_SCOPE`/
  `ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED`, F01's existing five reasons) — never a partial or
  ambiguous outcome, and never both/all callers succeeding.
- **FR-003**: A successful Safety Admission result MUST be a durable, identifiable object (an
  **Admission Lease**, for concurrency-consuming actions) or a durable consumption record (for a
  request-budget-only consumption with no concurrency component) — never a bare boolean. Every future
  engine receives this object/record and is responsible for later calling this spec's release/completion
  operation (FR-007) against it; this spec does not trust a caller's own bookkeeping as the source of truth
  for what is currently reserved.
- **FR-004**: Every Admission Lease (concurrency-consuming grant) MUST carry an explicit, bounded
  **lease duration of 30 seconds**, renewed implicitly each time its holding execution unit passes a
  safety checkpoint (FR-018) — six times the 5-second checkpoint cadence FR-013 already fixes, chosen to
  give margin against one slow checkpoint while staying an order of magnitude tighter than this
  codebase's existing generic BullMQ job lock duration (5 minutes), because a concurrency lease is a
  safety-critical scarce resource, not a job-processing mutual-exclusion lock (`research.md` R3's full
  reasoning). This is distinct from the grant's own `durationBudget` (F01) — a lease exists to bound how
  long one execution unit may hold one concurrency slot before this spec's own recovery mechanism (FR-006)
  reclaims it, which is a materially shorter and differently-owned concept than F01's grant-lifetime budget.
- **FR-005**: Safety Admission MUST fail closed on any internal error (a database write failure, a
  cache/lock-store read failure, F01's `isAuthorized` itself erroring) — an error MUST surface as a refusal,
  distinguishable from every other refusal reason, never as a default-granted admission (Constitution
  Principle X's fail-closed requirement, applied to this spec's own operation exactly as F01's own
  `authorization-check-contract.md` applies it to `isAuthorized`). An error at any step of FR-001's
  required sequence MUST leave **no partial effect** — no counter incremented, no consumption/lease row
  inserted — the entire admission transaction rolls back as a unit; a caller observing `REFUSED` after an
  internal error MUST be able to trust that nothing was reserved or consumed by that attempt.
- **FR-005a** (budget-exhaustion reason reconciliation, found during this spec's own checklist review):
  F01's `isAuthorized` (FR-013(e) of `specs/007-foundation-target-authorization-scope/spec.md`) already
  returns its own `BUDGET_EXHAUSTED` refusal reason when a grant's request/concurrency budget is
  exhausted — and F01's own FR-015 explicitly defers the *authoritative tracking* that reason depends on
  to this spec's `BudgetCounter`. This spec's own admission operation separately distinguishes
  `BUDGET_EXHAUSTED_REQUEST`/`BUDGET_EXHAUSTED_CONCURRENCY` (FR-002) at its own, later, lock-guarded check
  (FR-001 step 3). These are **not two competing concepts**: F01's `isAuthorized` implementation MUST read
  this spec's `BudgetCounter` (a plain, non-locked read, since `isAuthorized` remains a pure, side-effect-
  free function per F01's own FR-024) to decide its own `BUDGET_EXHAUSTED` verdict, and that read MAY be
  momentarily stale — it is advisory, not authoritative. This spec's own lock-guarded re-check (FR-001 step
  3) is what is actually authoritative and race-free; a caller that somehow reached step 3 despite F01's
  own (possibly stale) check already passing is refused there instead, with this spec's own, more specific
  `BUDGET_EXHAUSTED_REQUEST`/`BUDGET_EXHAUSTED_CONCURRENCY` reason — never a silent pass-through of F01's
  undifferentiated reason once this spec's own check has run.

### Functional Requirements — Lease Recovery, Release, and Crash Safety

- **FR-006**: An Admission Lease whose holder does not renew it (or complete/release it) within its bounded
  duration (FR-004) MUST be automatically reclaimed — its concurrency unit becomes available to other
  callers again — without requiring the original holder to still be alive or responsive. This is this
  spec's answer to "a worker reserves then crashes": the reservation does not leak permanently, bounded by
  the lease duration, not by any crash-detection mechanism this spec would otherwise need to invent.
- **FR-006a (lease fencing, found during this spec's own independent adversarial review)**: Every
  `AdmissionLease` MUST carry a **holder token**, a fresh opaque value generated at acquisition time —
  distinct from the idempotency key (FR-008), which identifies *the attempt*, not *the currently-live
  holder*. Renewing a lease MUST present that lease's current holder token; a renewal whose presented
  token does not match (because the lease has since been reclaimed and, for a still-live execution-unit
  identity, possibly re-acquired by a different worker) MUST fail, and — this is the part a token alone
  does not provide for free — **a worker whose renewal fails for this reason MUST treat that failure
  exactly as if a kill-switch stop had been triggered against its own execution unit**: it aborts its own
  composed `AbortSignal` (`research.md` R6) and ceases further safety-sensitive action immediately, never
  merely logging the failure and continuing on the assumption its lease is still probably fine. This closes
  the concrete failure mode this spec's own Edge Cases name ("a new worker owns the same execution while
  the old worker is still alive") precisely: the idempotency key alone lets a redelivered job observe "this
  attempt was already admitted," but does not, by itself, tell the *original*, still-alive worker that it
  has been superseded — the holder-token check is what does.
- **FR-007**: Releasing an Admission Lease, or recording final consumption of a request-budget unit, MUST
  be idempotent: releasing/completing the same lease or consumption record more than once (a duplicate
  release call, a retried completion) MUST have the same effect as releasing/completing it exactly once,
  and MUST NOT free, credit, or re-reserve more budget than was actually consumed by that one unit of work.
- **FR-008**: Every budget-consuming operation this spec defines (reservation, consumption, release) MUST
  be keyed by a caller-supplied idempotency identity (an execution-unit id plus an attempt/step identifier,
  not invented freshly by this spec — reusing the shape of the existing `BillingEvent` received-vs-applied
  pattern, `apps/api/prisma/schema.prisma` lines 869-893, per this session's infrastructure audit) such that
  a BullMQ job redelivery, a queue-level retry, or a duplicate call with the same identity never double-
  reserves, double-consumes, or double-releases — the second call observes "already applied" and returns
  the same outcome as the first, without repeating the effect. This guarantee depends on the calling engine
  deriving its idempotency key **deterministically from stable attempt identity** (the same execution unit
  and the same logical step/retry produce the same key every time) — correctly deriving that key is the
  calling engine's own contract to honor (declared per FR-019's unit-consumption-policy requirement), not
  something this spec's admission operation can enforce from the inside; a caller that mistakenly mints a
  fresh key per invocation for what is actually the same retried attempt receives no idempotency protection
  for that specific mistake, exactly as `BillingEvent`'s own id-based scheme provides no protection against
  a sender that reuses a fresh id per retry.
- **FR-009**: Where Safety Admission's atomic reservation (FR-001) is implemented across two different
  durable stores (for example, a fast in-memory/Redis-backed concurrency-lease store and the system-of-record
  Postgres database), this spec MUST define which store is authoritative for the admission *decision* and
  require that a write-disagreement between the two (one succeeds, the other fails) is detected and
  reconciled — either by rolling back the succeeding side or by a defined repair path — never left as a
  silent state where the two stores disagree about whether a lease is currently held. This spec does not
  prescribe Redis, a specific Lua script, or a specific locking primitive here (that is a `/speckit-plan`
  decision grounded in this session's infrastructure audit, which found `apps/api/src/services/queue/
  admission-gate.ts`'s single-Lua-script ZSET pattern as the closest existing proven analog); it requires only
  that the chosen implementation name one authoritative source of truth and close this disagreement case
  explicitly. **Resolved, not left open (found during this spec's own `/speckit-analyze` cross-artifact
  pass)**: for the Safety Admission reservation specifically, `research.md` R1 already forecloses this
  conditional — `plan.md` uses Postgres alone, never a second store, for the admission/budget decision
  (per the constitution's Technology Constraints barring Redis from being a system of record), so no
  store-disagreement reconciliation path is actually needed for `requestAdmission` itself. This FR's
  conditional framing is preserved as written because it states a general principle this spec's own chosen
  design happens to satisfy by construction (there is only one store, so no disagreement is possible) —
  it would become active again only if some future amendment to R1 reintroduced a second store for this
  specific decision, which is itself a decision this spec's own governance bar (Constitution Principle
  XIV) requires to be explicit, not a silent implementation choice.

### Functional Requirements — Kill Switch

- **FR-010**: This spec MUST define at least these kill-switch **scopes**: a single execution unit (one
  dispatched unit of work), a scan (every execution unit belonging to one `Scan`), a `TargetAuthorization`
  grant (every execution currently running under one specific grant — the direct mechanism by which a
  grant revocation, FR-012, becomes a physical stop), and a platform-wide emergency stop (every currently
  running execution, regardless of tenant). **Per Clarifications 2026-10-07**: an operator-triggered
  emergency stop MUST be able to target any one of: a single execution, every execution under a specific
  grant, every execution against a specific Target, or every execution belonging to a specific tenant/user —
  in addition to the platform-wide scope — because an operator responding to a live incident (a target
  reporting harm, a compromised account) needs to act at the blast-radius the incident actually has, not
  only at the single-execution or platform-wide extremes.
- **FR-011**: This spec MUST define the **actors** permitted to trigger each kill-switch scope: the owning
  user may cancel their own scan/execution (today's existing cancellation path, preserved); the owning
  user's grant revocation (F01, FR-014/FR-017) MUST automatically trigger a grant-scoped stop through this
  spec's mechanism, with no separate manual stop action required; a platform operator (existing
  `User.isOperator` flag, consistent with F01's FR-017 operator-revocation precedent) may trigger any
  scope including platform-wide; this spec's own automatic safety policy (FR-016, an environment
  reclassification observed mid-execution) MUST itself be able to trigger an execution-scoped stop with no
  human actor required, attributed to `SYSTEM`. **Budget exhaustion is deliberately NOT a third `SYSTEM`
  kill-switch trigger** (closing an inconsistency found during this spec's own closure/freeze pass, between
  an earlier draft of this FR and `kill-switch-contract.md`'s own precondition 3, which names only
  revocation and reclassification): exhausting a grant's request or concurrency budget blocks *new*
  admission (FR-002) — it never needs to forcibly stop work that already legitimately holds its own
  reservation, for exactly the same reason FR-016a gives for excluding duration-budget expiry. Every
  trigger, regardless of actor, MUST be audited (FR-022) with the triggering actor (a userId, an operator's
  userId, or `SYSTEM`) distinguishable in the record.
- **FR-012**: An authorization revocation (F01 FR-014) MUST be treated by this spec as an automatic,
  immediate trigger for a grant-scoped kill-switch stop — this spec is the mechanism F01's own FR-014
  closure-pass boundary names ("physically interrupting already-running work is F07's kill-switch
  mechanism... until F07 exists, a revoked grant's already-dispatched work is refused from
  re-authorization at its next checkpoint but is not guaranteed to be forcibly interrupted mid-request").
  Once this spec exists, that guarantee changes to: a revoked grant's running executions are actively
  signaled to stop, not merely left to discover the revocation passively at their own next voluntary
  checkpoint. **"Immediate" has the same concrete meaning F01's own FR-014 gives its "immediately"**: the
  `KillSwitchState` write happens synchronously as part of (or immediately following, in the same logical
  operation) F01's `revokeAuthorization` call succeeding — no propagation delay is modeled between
  revocation and the `KillSwitchState` row's creation; whatever delay exists afterward is only the
  bounded, measured kind FR-013 already names (checkpoint cadence, Redis-accelerant latency). A future
  implementation of F01's `revokeAuthorization` (`specs/007-foundation-target-authorization-scope/
  contracts/grant-lifecycle-contract.md`) is responsible for calling this spec's `triggerStop` (scope
  `GRANT`, `scopeId` = the grant's id, `reason: AUTHORIZATION_REVOKED`) as part of the same operation that
  sets `revokedAt` — this is the one concrete integration point this spec requires F01's own future
  implementation to add; F01's contract text itself remains unmodified, since the call site is additive
  wiring, not a change to `revokeAuthorization`'s existing signature or semantics.
- **FR-013**: This spec MUST define the kill-switch stop lifecycle with at least these states:
  `REQUESTED` (the stop trigger has fired and been durably recorded), `ACKNOWLEDGED` (the targeted
  execution unit has observed the request and ceased further safety-sensitive action), `STOPPED` (the
  execution unit has fully exited — no further work, no further budget consumption, workspace/session
  cleanup complete). **Per Clarifications 2026-10-07, this spec fixes the cooperative stop-latency bound**:
  an execution unit MUST check for a pending stop request at least once every 5 seconds of wall-clock
  execution time (a tighter bound than today's existing ~60-second per-module timeout granularity,
  justified because a kill switch is a safety control, not a resource-efficiency control, and 5 seconds is
  well within the existing per-request/per-AI-call timeout grain this codebase already uses via
  `AbortSignal.timeout`, per this session's infrastructure audit) and MUST reach `ACKNOWLEDGED` within that
  same window of the stop becoming `REQUESTED`. This is a platform-wide default **ceiling**, not a target —
  any future execution class's own child spec MAY commit to a tighter bound for its own checkpoints, but
  MUST NOT exceed this one without a documented amendment to this spec, the same governance bar F01's
  FR-011 applies to its own platform-wide budget maximums.
- **FR-014**: If an execution unit does not reach `ACKNOWLEDGED` within FR-013's bound, this spec MUST
  define an **escalation** path: for a process this platform directly controls (a BullMQ worker process, a
  sandboxed child process), escalation MUST culminate in forcible termination (the existing sandbox-runner
  precedent of an unconditional, parent-side `SIGKILL` on every outcome path, `apps/sandbox-runner/src/
  host/server.ts`/`limits/timeout.ts`, per this session's infrastructure audit, is this spec's proof that
  forcible termination is already an accepted, working pattern in this codebase — this spec generalizes it,
  it does not invent it). For a resource this platform does not directly control (an external provider call
  already in flight, a browser session mid-navigation), escalation MUST, at minimum, ensure no further
  budget is consumed and no further result from that in-flight call is trusted or persisted once the
  execution unit has been marked `STOPPED` — this spec does not claim to guarantee the remote side itself
  stops instantly, only that Fahes stops acting on it. Every escalation event MUST be audited (FR-022) as
  its own distinguishable event, separate from the original stop request. **Named limitation (found during
  this spec's own checklist review, stated here rather than left visible only in `research.md` R7)**: this
  spec cannot, by itself, guarantee that a truly hung worker **process** (not merely a slow one — one whose
  own event loop never again checks the composed `AbortSignal`) is forcibly terminated; that requires a
  process topology (e.g. each long-running execution unit running in its own killable subprocess/worker
  thread) this spec does not design. This spec names that requirement as an explicit dependency on F04
  (Execution Runtime, not yet planned) rather than silently assuming every future engine will happen to run
  inside an independently killable process boundary.
- **FR-015**: Once an execution unit reaches `STOPPED`, this spec MUST guarantee it **does not resurrect**
  through any of the following vectors, named explicitly rather than left to a general "a duplicate
  dispatch" catch-all: a BullMQ retry; a stalled-job redelivery; a duplicate dispatch for the same
  execution-unit identity; a stale worker that held an expired/reclaimed lease (FR-006) returning and
  attempting to continue after its lease was already reclaimed; and a new worker picking up the same
  execution-unit identity while the original (slow, not yet reclaimed) worker is still alive. Every one of
  these MUST be recognized as belonging to already-stopped (or, for the lease case, no-longer-leased) work
  and MUST be refused before any further action, distinct from FR-008's idempotency guarantee (FR-008
  prevents double-counting a budget; this requirement
  prevents the stopped *work itself* from running again at all).
- **FR-016**: A Target's `TargetEnvironment` reclassification observed between two of an execution's own
  checkpoints (e.g. staging to production, per F01's own Edge Cases) MUST be treated by this spec identically
  to an authorization revocation for kill-switch purposes: the next safety checkpoint that would otherwise
  admit further work under that grant instead triggers an execution-scoped stop, because F01's own
  `isAuthorized` check (re-run fresh at that checkpoint, per F01 FR-010/FR-024) already refuses once the
  environment no longer satisfies the grant's `environmentRestriction` — this spec's responsibility is only
  to ensure that refusal is treated as a stop trigger (FR-012's mechanism), not silently swallowed as "this
  one action failed, retry the next one." **Once `REQUESTED`, a stop triggered this way is never cancelled
  by a subsequent reclassification back to a permitted environment** (e.g. production → staging → the grant
  would again satisfy `environmentRestriction`) — `KillSwitchState`'s own `REQUESTED → ACKNOWLEDGED →
  STOPPED` lifecycle (FR-013) has no reverse transition, matching F01's own grant-revocation posture (a
  revoked grant is never un-revoked; a user creates a new grant instead, per F01 FR-016) and avoiding a
  flip-flopping stop/resume race against rapid reclassification.
- **FR-016a (duration-budget expiry is deliberately excluded from the kill-switch taxonomy — found during
  this spec's own independent adversarial review, which asked why `KillSwitchReason` has no `EXPIRED`
  value given FR-016 gives reclassification kill-switch-grade treatment)**: a grant's duration-budget
  expiry (F01's `expiresAt`) is **not** wired into `triggerStop`/`KillSwitchState` the way revocation and
  environment reclassification are, and this is a deliberate distinction, not an oversight. Revocation and
  reclassification are inherently unpredictable interrupts — an execution has no way to know in advance
  that they are about to happen, which is exactly why they need active propagation (Redis fan-out,
  escalation, a `STOP_REQUESTED`→`ACKNOWLEDGED`→`STOPPED` lifecycle). Duration-budget expiry is the
  opposite: `expiresAt` is fixed and known at grant-creation time, so every safety checkpoint (FR-018)
  already independently re-checks `isAuthorized`'s own `EXPIRED` outcome at the same 5-second cadence that
  would otherwise carry a kill-switch push signal — a well-behaved execution discovers impending expiry
  the same way it discovers everything else F01 checks, with no additional propagation mechanism needed.
  Wiring expiry into the kill-switch taxonomy as well would add a second path to the same outcome with no
  new guarantee it does not already have.

### Functional Requirements — Runtime Safety Policy / Checkpoint Contract

- **FR-017**: All of this spec's durable state (Admission Leases, budget-consumption counters, kill-switch
  stop-request records) MUST survive a platform restart (a deploy, a crash-and-restart of the API, worker,
  or underlying Redis/Postgres instance) without being silently forgotten: a lease in-flight at restart time
  is still subject to FR-006's bounded reclamation (never assumed still valid merely because nothing
  explicitly released it); a stop request in `REQUESTED` or `ACKNOWLEDGED` state at restart time MUST still
  be enforced against any execution unit that resumes or is redelivered after the restart (FR-015's
  no-resurrection guarantee applies across a restart, not only within one process's uptime).
- **FR-018**: This spec MUST define a single, reusable **safety checkpoint** contract — not a bespoke
  per-engine implementation — that any future execution engine calls at: (a) dispatch time, immediately
  before an execution unit starts; (b) before every subsequent safety-sensitive action within an
  already-running execution unit that a currently-defined execution class requires (per F01's FR-010/
  FR-024, applying to `CRAWLER`/`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`); and (c) at the
  FR-013 cooperative-polling cadence during any single long-running safety-sensitive action. A single
  checkpoint call MUST perform, in order: a pending-kill-switch-stop check (FR-013/FR-015), a fresh F01
  `isAuthorized` re-check for the specific destination/action (FR-001), and — only if both pass — budget
  consumption (FR-001/FR-002). No future engine may re-implement any piece of this sequence independently
  (Constitution Principle VIII: a new capability category MUST reuse an existing shared contract before
  inventing a parallel one).
- **FR-019**: This spec does not design any specific execution engine's own internal logic for *deciding*
  when a safety-sensitive action occurs (what counts as "one request" for `CRAWLER` vs. "one payload
  attempt" for `ACTIVE_SECURITY` vs. "one step" for `AUTHENTICATED_WORKFLOW` is each engine's own child
  spec's decision, per F01's own FR-015/unit-consumption-policy deferral) — it defines only the shared
  checkpoint contract (FR-018) every engine's decision ultimately calls into, and requires every future
  engine spec to declare its own unit-consumption policy explicitly (extending F01's own deferral, per
  Constitution Principle XIV) before that engine proceeds to `/speckit-tasks`. **Named limitation (found
  during this spec's own independent adversarial review, stated here with the same honesty FR-014 already
  applies to the hung-process limitation)**: this spec's checkpoint contract (FR-018) is structurally
  correct wherever it is actually called, but nothing in its type shape *forces* an engine to call it for
  every safety-sensitive action — an engine that simply omits a call site for some newly-discovered
  destination or workflow step bypasses every guarantee this spec provides for that one omitted action,
  undetected by this spec's own mechanisms. Compliance is enforced by Constitution Principle XIV's
  governance gate (FR-027, and the parent architecture's own `quickstart.md` checks 1/3) and by code
  review, not by anything this spec's contracts can check at runtime — the same category of limitation as
  FR-014's hung-process concession, named explicitly rather than implied to be solved.

### Functional Requirements — Execution Audit Trail

- **FR-020**: This spec MUST define `ExecutionAuditEvent` as a new, durable record distinct from the
  existing `AuditLogEntry` (`apps/api/prisma/schema.prisma` lines 853-867, confirmed by this session's audit
  to be an admin/control-plane log only — no `scanId`/execution linkage, no cost/timing fields, never
  written for scan-lifecycle, credit, or capability-execution events) — per `specs/006-scan-architecture-v2/
  data-model.md`'s own "Safety" context sketch, which already distinguishes the two for this exact reason.
  `ExecutionAuditEvent` MUST record, at minimum, for every safety-relevant event this spec's own operations
  produce: who initiated the execution (userId or `SYSTEM`), which Target, which `TargetAuthorization`
  grant, which `ScopeDefinition` (via the grant), which `TargetEnvironment` classification was in effect at
  the time, which Scan/execution unit, which execution class, the event type (admission granted/refused,
  budget reserved/consumed/released/exhausted, stop requested/acknowledged/stopped/escalated, safety
  violation), a timestamp, and an outcome.
- **FR-021**: Every write this spec's own operations make to durable safety state (an admission decision,
  a budget mutation, a kill-switch state transition) MUST fail closed when the underlying store is
  unavailable: an inability to write or read authoritative safety state MUST surface as a refusal for new
  admission (FR-005) and MUST NOT be interpreted as "no stop is pending" for an already-running execution's
  own checkpoint (FR-018) — uncertainty about kill-switch state is treated as "a stop might be pending,"
  never as "no stop is pending," at every checkpoint. **Concretely**: a checkpoint that cannot determine
  kill-switch state (its own `KillSwitchState` read fails) MUST take the same action as if a stop *were*
  found pending — abort the composed `AbortSignal` (research.md R6) and return `STOP` with a reason
  identifying the uncertainty (distinguishable from a genuine `KILL_SWITCH_PENDING` refusal) — never merely
  log/flag the uncertainty while allowing the caller's action to proceed.
- **FR-022**: Every kill-switch state transition (FR-013/FR-014) and every Safety Admission outcome
  (FR-001/FR-002, including refusals) MUST write a distinguishable `ExecutionAuditEvent`, using a bounded
  event-type taxonomy this spec's own `plan.md`/`data-model.md` enumerates — not an open-ended free-text
  action field reused without a defined vocabulary, because an unbounded vocabulary is not reconstructible
  by a future reviewer (User Story 3) the way a bounded one is.
- **FR-023**: An execution that is refused at admission (never actually started) MUST still produce an
  `ExecutionAuditEvent` recording the refusal and its reason — an attempt that was correctly blocked is
  exactly as auditable as one that ran, per User Story 3's own acceptance scenario; this spec does not
  condition audit-trail existence on an execution having actually been granted a `CapabilityExecution`-
  equivalent row.
- **FR-024 (redaction)**: Any `ExecutionAuditEvent` field that could carry request/response content,
  session tokens, cookies, authorization headers, API keys, or credential material (for example, an
  audited destination URL's query string, or a recorded outcome payload for an `ACTIVE_SECURITY`/
  `AUTHENTICATED_WORKFLOW` event) MUST pass through the existing `@webaudit/redaction` mechanism before
  being persisted, extending the parent architecture's own FR-027 (evidence redaction) to this spec's own
  audit records specifically — an audit trail that itself leaks a secret is the same class of data-exposure
  incident FR-027 already names for `Evidence`, applied here to `ExecutionAuditEvent`. **This applies to
  every free-text-shaped field this spec's own schema defines, not only `payload`**: `data-model.md`'s
  `outcome` column is a short, bounded string by this spec's own design (FR-022's taxonomy requirement) and
  MUST NOT be populated with unbounded free text that could itself carry request/response content — any
  engine wanting to record a detailed, potentially-sensitive outcome description does so in the (redacted)
  `payload` field, never by widening `outcome` into an unredacted escape hatch. **Per Clarifications
  2026-10-07, this spec fixes `ExecutionAuditEvent`'s retention policy**: it follows the same retention
  policy and timing as today's report/evidence data (consistent with the parent architecture's ADR-007
  default for large evidence artifacts) — no separate, longer, compliance-driven retention tier by default.
  A future spec that discovers a concrete compliance requirement for longer retention of execution-against-
  target audit records specifically (as distinct from report data generally) brings that as new evidence to
  amend this default, rather than this spec inventing a speculative longer tier now with no current
  requirement driving it.

### Functional Requirements — AI Is Not Safety

- **FR-025**: No AI/machine-learning judgment of any kind MAY decide, influence, or be consulted for: whether
  Safety Admission grants or refuses a reservation, whether a kill-switch stop is triggered or its scope,
  whether an escalation occurs, or what an `ExecutionAuditEvent` records as having happened. Every
  operation this spec defines MUST remain a pure, deterministic function of durable state — stated here as
  its own requirement, extending F01's identical FR-023 and the parent architecture's Constitution
  Principle III, so this spec's own package is self-contained on this point exactly as F01's is.

### Functional Requirements — Migration & Backward Compatibility

- **FR-026**: This spec's mechanisms apply only to execution classes that require a `TargetAuthorization`
  grant (F01's `ExecutionClass` enum: `BROWSER`, `CRAWLER`, `SOURCE_EXECUTION`, `ACTIVE_SECURITY`,
  `AUTHENTICATED_WORKFLOW`, `LOAD_CAPACITY`) — none of which are runnable engines yet (confirmed directly,
  not assumed — `research.md` R11). Today's existing
  `PASSIVE_HTTP`/`SOURCE_STATIC` capabilities and their existing cancellation (`apps/worker/src/
  orchestrator/cancellation.ts`), timeout (`apps/worker/src/orchestrator/timeout.ts`), and credit-debit
  (`apps/api/src/services/credits/debit.ts`) mechanisms are explicitly **out of scope for modification** by
  this spec — they MUST continue to behave exactly as today, unmodified, per the parent architecture's
  strict-parallel-run requirement (FR-024 of `specs/006-scan-architecture-v2/spec.md`). This spec defines a
  wholly new, additive safety layer that future engines opt into by being built against it; it does not
  retrofit, gate, or alter any existing passive capability's current execution path.
- **FR-027**: Any future engine spec (E13/E14/E15/E16) that wires a real enforcement point against this
  spec's Safety Admission and kill-switch contracts MUST implement the full checkpoint contract (FR-018),
  not a subset, before that engine's first production capability executes against any target — mirroring
  F01's own FR-022, per Constitution Principle XIV.

## Key Entities

- **SafetyAdmission** (operation, not a stored entity by itself): the atomic check-and-reserve function
  (FR-001/FR-002). Its durable side effects are the two entities below.
- **AdmissionLease**: NEW. Represents one held unit of concurrency budget against one `TargetAuthorization`
  grant, for one execution unit. Carries an identity, an owner (execution-unit id), the grant it is held
  against, `acquiredAt`, a bounded expiry/heartbeat (FR-004), and a release/expiry state (FR-006/FR-007).
  Tenant scope: inherited through its owning grant's `userId` (F01's `TargetAuthorization.userId`).
- **BudgetConsumptionRecord**: NEW. Represents one durable, idempotent consumption of one request-budget
  unit against one grant (FR-007/FR-008), keyed by the caller's idempotency identity. Distinct from
  `AdmissionLease` because request-budget consumption has no "held" duration — it is consumed once, point in
  time, never released.
- **KillSwitchState**: NEW. Represents the current stop-request lifecycle (FR-013) for one scope (execution
  unit, scan, grant, target, tenant, or platform). Carries the scope, the triggering actor, `requestedAt`,
  `acknowledgedAt`, `stoppedAt`, and (if escalation occurred) `escalatedAt`. Durable across restart (FR-017).
- **ExecutionAuditEvent**: NEW, per `specs/006-scan-architecture-v2/data-model.md`'s "Safety" context
  sketch, finalized here. Carries `targetAuthorizationId`, `executionId` (nullable, for a refused-at-
  admission event with no execution unit), `targetId`, `scopeId` (via the grant), the `TargetEnvironment`
  classification in effect, the execution class, a bounded `eventType` (FR-022), `actorId` (userId or
  `SYSTEM`), `timestamp`, `outcome`, and a redacted (FR-024) payload field. Distinct from the existing
  `AuditLogEntry` (admin/control-plane actions) exactly as `specs/006-scan-architecture-v2/data-model.md`
  already distinguishes them.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Safety Admission's concurrency guarantee (FR-002) is demonstrated by a concrete, reproducible
  test design in this spec's `plan.md`/`quickstart.md`: N concurrent callers against a budget with fewer
  than N remaining units always yields exactly the correct number of successes, zero oversell, across at
  least one implementation-level stress scenario description (the actual test is written at
  `/speckit-tasks`/implementation time; this spec's own completeness bar is that the scenario is fully
  specified, not that the test has been run, matching F01's own planning-artifact framing).
- **SC-002**: Every kill-switch scope (FR-010) and every triggering actor (FR-011) is enumerated with its
  own acceptance scenario — zero scope/actor combinations this spec names are left without a stated,
  checkable behavior.
- **SC-003**: The stop-latency bound (FR-013) and its escalation path (FR-014) are stated as concrete,
  checkable numbers/behaviors, not "promptly" or "as soon as possible" — verified by direct inspection of
  FR-013/FR-014's wording.
- **SC-004**: Every one of the 20+ adversarial scenarios named in this spec's own Edge Cases section and in
  the triggering session's adversarial-review list (two workers racing, a worker crash after reservation,
  a redelivered job, a stopped job retried, revocation mid-request, environment reclassification mid-run,
  a store-disagreement case, an operator killing another tenant's execution) maps to at least one
  Functional Requirement that resolves it — verified by direct cross-reference, zero orphaned scenarios.
- **SC-005**: This spec's own package produces zero changes to any file outside
  `specs/008-safety-killswitch-budget-audit/` and (if a genuine F01 contradiction is found and formally
  flagged) a clearly-marked proposed-amendment note inside F01's own package — verified by `git status`/
  `git diff --name-only` at the close of this planning pass, matching F01's own SC-004 pattern.
- **SC-006**: A future engine spec's author (E13/E14/E15/E16) can answer, from this spec alone and without
  a follow-up question: how to obtain admission, how budget is consumed/released, how to recognize a
  pending stop, what happens on crash/retry/redelivery, and what must be audited — verified by the
  Independent Test framing of all three User Stories taken together.

## Assumptions

- **Fail-closed under degraded (not fully down) Postgres is a known, accepted operational tradeoff, not an
  unexamined risk (found during this spec's own independent adversarial review)**: FR-005/FR-021's
  fail-closed rule means a Postgres instance that is slow or returning intermittent errors — short of being
  fully unreachable — could cause every checkpoint platform-wide to treat admission/kill-switch state as
  uncertain and refuse, a self-inflicted, safety-triggered disruption to every active-class execution
  running at that moment. This spec deliberately accepts that cost: Constitution Principle X's fail-closed
  requirement exists precisely because the alternative (treating uncertainty as permission) is the worse
  failure mode for an active/adversarial execution class. This spec does not design the operational
  alerting that would let an operator notice and respond to elevated refusal rates quickly — that is a
  cross-cutting observability concern outside this spec's own charter, not a gap this spec's own
  requirements need to additionally close.
- This spec's mechanisms are strictly additive safety constraints layered on top of F01's absolute
  production prohibition (FR-015a of `specs/007-foundation-target-authorization-scope/spec.md`, covering
  `ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`) — no requirement in this spec creates, nor
  could be read as creating, a path by which a kill-switch or budget-enforcement mechanism permits an
  otherwise-prohibited production execution. Where this spec's own mechanisms interact with environment
  classification (FR-016), the effect is always to add a stop trigger, never to relax F01's restriction.
- This spec's current-state baseline (BullMQ queue/worker configuration, the existing cancellation
  mechanism, credit debit/refund locking, `AuditLogEntry`/`CapabilityExecution` schemas, the sandbox-runner's
  unconditional-SIGKILL pattern, the `admission-gate.ts` Lua-script precedent, the `BillingEvent` idempotency
  pattern) was established by a dedicated, file-and-line-cited read-only audit performed in the same session
  that authored this spec, and is treated as the settled evidentiary baseline here, not re-derived a second
  time in `research.md` — the same posture F01 took toward its own current-state audit, and the parent
  architecture took toward `docs/reviews/scan-audit-2026-10-07/`.
- F01 (`specs/007-foundation-target-authorization-scope/`) is frozen and is consumed, not redesigned, by
  this spec; no change to F01's entities, contracts, or budget-ceiling values is proposed here.
- The specific implementation mechanism for Safety Admission's atomic reservation (a Redis Lua script
  modeled on `admission-gate.ts`, a Postgres advisory lock, or another justified primitive) is a `/speckit-
  plan` decision grounded in this spec's own current-infrastructure evidence, not decided by this spec's
  requirements, consistent with F01's own posture toward its budget-enforcement hooks ("no Redis script,
  database advisory lock, or specific concurrency algorithm is specified here; that is F07's `/speckit-plan`
  decision" — `specs/007-foundation-target-authorization-scope/spec.md` FR-015).
- F04 (Execution Runtime/Queue/Progress/Cancellation) does not exist yet and is not designed by this spec;
  this spec defines the contract (Safety Admission, the checkpoint contract, the kill-switch triggers) that
  F04's own future dispatch mechanics must call, the same division of responsibility F01 already established
  toward F04 for its own `isAuthorized` contract.
- No specific execution engine's own test/payload logic (what `ACTIVE_SECURITY` actually sends, what
  `AUTHENTICATED_WORKFLOW` actually does with a session) is designed by this spec — each engine's own child
  spec declares its unit-consumption policy and its own safety-sensitive-action boundaries against this
  spec's shared checkpoint contract (FR-018/FR-019).
- The exact event-type vocabulary for `ExecutionAuditEvent` (FR-022) and the exact mechanism/data-store split
  for `AdmissionLease`/`KillSwitchState` durability are finalized in this feature's own `data-model.md`/
  `contracts/`, not in this document — consistent with the spec/plan division of labor F01 already
  established for its own `AuthzResult`/lifecycle details.
