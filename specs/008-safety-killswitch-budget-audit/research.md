# Phase 0 Research: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail

No `NEEDS CLARIFICATION` markers remained in `spec.md`'s Technical Context after this session's own
`/speckit-clarify` pass (3 product questions asked/answered during `/speckit-specify` itself — stop
latency, audit retention, operator stop scope — all three recorded in `spec.md`'s Clarifications
section). This document records the design research that grounds `plan.md`'s and `data-model.md`'s
decisions, not open unknowns. All current-state evidence cited below was gathered by a dedicated,
file-and-line-cited read-only audit performed earlier in this same session and is treated as the settled
baseline — not re-derived a second time here, the same posture F01's own `research.md` R1 took.

## R1: What store is authoritative for the admission/budget decision — Redis, Postgres, or both?

- **Decision**: PostgreSQL alone is authoritative. Every Safety Admission decision (reservation,
  consumption, release) is a single Postgres transaction using row-level locking
  (`SELECT ... FOR UPDATE` or a guarded conditional `UPDATE ... WHERE ... RETURNING`), the same
  mechanism `apps/api/src/services/credits/debit.ts` already proves correct in production for the
  structurally identical "many concurrent consumers, one finite resource, must never oversell" problem.
  Redis MAY be used to *accelerate* kill-switch propagation (R4) but MUST NOT be the system a checkpoint
  trusts for the admission/budget verdict itself.
- **Rationale**: the constitution's Technology Constraints state plainly: "Redis is cache, queue, and
  rate-limit state only, never a system of record." A `TargetAuthorization` grant's `requestBudget`/
  `concurrencyBudget` are consumed "cumulatively across the grant's entire lifetime, not reset per scan"
  (F01 spec.md FR-011) — this is ledger semantics (a permanent, auditable, never-reset running total),
  not transient rate-limit semantics (a short window that naturally expires). The existing codebase
  already draws exactly this distinction: `apps/api/src/middleware/ratelimit.middleware.ts`'s per-IP
  login throttle is Redis-backed (genuinely a rate limit — resets on its own TTL, no durable audit need),
  while every genuinely ledger-shaped resource in this codebase (`CreditLot`/`CreditTransaction`,
  `BillingEvent`) is Postgres-authoritative with row-level locking, never Redis. A grant's budget belongs
  in the second category.
- **Alternatives considered**: reusing `apps/api/src/services/queue/admission-gate.ts`'s single-Lua-script
  ZSET pattern as the sole authority (rejected — that mechanism is a deliberately ephemeral, self-expiring
  admission gate for a transient resource-contention problem it was built for, and making it the *sole*
  record of a grant's lifetime budget would violate the constitution's Technology Constraints, which is a
  constitutional amendment away, not a plan-level choice available to this spec); a dual-write with no
  declared authority (rejected — this is exactly the "DB succeeds, Redis fails, or vice versa" adversarial
  scenario this spec's own Edge Cases name, and leaving both as equally authoritative makes that case
  unresolvable by definition).

## R2: What is the concrete atomic admission mechanism, mapped onto existing schema/patterns?

- **Decision**: generalize the credit-ledger's two-table shape (`CreditLot` holds the mutable remaining
  balance under row-level lock; `CreditTransaction`/`CreditAllocation` hold the immutable, idempotency-
  keyed ledger of what was actually consumed) onto budgets: a new `BudgetCounter` row (one per
  `TargetAuthorization`, lazily created on first admission) holds the current `consumedRequests` and
  `activeConcurrency` counts under `SELECT ... FOR UPDATE`; a new `BudgetConsumption` row records each
  individual consumption event, unique on `(targetAuthorizationId, idempotencyKey)` — the same shape
  `BillingEvent`'s external-id-as-primary-key pattern already proves correct for "this exact event was
  already applied, do not apply it twice" (`apps/api/prisma/schema.prisma` lines 869-893). One admission
  transaction: lock the `BudgetCounter` row, re-run F01's `isAuthorized` fresh (FR-001), check the counter
  against the grant's ceiling, and — only if both pass — insert the `BudgetConsumption` row and increment
  the counter, all inside one `$transaction` (mirroring `debit.ts`'s own `$transaction` + `withRetry`
  wrapper). A duplicate call with the same `idempotencyKey` hits the unique constraint and returns the
  prior outcome rather than double-consuming (FR-008).
- **Rationale**: this is the minimum-novelty design that satisfies FR-002's atomicity requirement using a
  pattern this codebase has already battle-tested (per `apps/api/tests/adverse/credits-debit-refund-race.
  test.ts`'s "a 10-way concurrent debit race never oversells" proof) — Constitution Principle VIII's
  "reuse an existing shared contract before inventing a parallel one," applied to the mechanism level.
- **Alternatives considered**: a single mutable counter column with no separate ledger row (rejected —
  loses FR-008's idempotency-key dedup, the exact gap that let a prior incident class exist before
  `BillingEvent`'s received-vs-applied pattern was introduced); an advisory lock (`pg_advisory_xact_lock`,
  per `apps/api/src/services/admin/providers.service.ts`) instead of a row lock (rejected — an advisory
  lock is the right tool when there is no single row to lock (a whole-table replace); here there is
  exactly one row per grant to lock, so a row lock is the more precise, more conventional choice,
  consistent with `debit.ts`'s own reasoning for locking specific `CreditLot` rows rather than a
  table-wide advisory lock).

## R3: What is the Admission Lease's concurrency-slot duration/heartbeat, and why that value?

- **Decision**: a concurrency lease (one `AdmissionLease` row representing one held slot) has a 30-second
  bounded lifetime, renewed implicitly every time the holding execution unit passes a safety checkpoint
  (FR-018) — and FR-013 already requires a checkpoint at least every 5 seconds. A lease that is not
  renewed within 30 seconds (six missed checkpoints) is reclaimed by the same sweep pattern this codebase
  already uses for `sweepTimedOutScans`/`sweepOrphanedWorkspaces` (a periodic maintenance-queue job, per
  `apps/worker/src/orchestrator/timeout.ts`/`apps/worker/src/workspace/teardown.ts`).
- **Rationale**: 30 seconds is six times the 5-second checkpoint cadence FR-013 already fixes — enough
  margin that one slow checkpoint (a loaded worker, a slow Postgres round-trip) does not falsely reclaim a
  live execution's lease, while still being an order of magnitude tighter than the existing
  `QUEUE_LOCK_DURATION_MS` (5 minutes, `packages/config/src/queues.ts` line 129) that governs today's
  short-job BullMQ lock — deliberately tighter, because a concurrency lease is a safety-critical scarce
  resource (bounding how many simultaneous active/adversarial requests a grant permits), not a
  job-processing mutual-exclusion lock, and should be reclaimed far sooner than a generic stalled-job
  window would allow.
- **Alternatives considered**: tying lease duration directly to the existing `QUEUE_LOCK_DURATION_MS` (5
  min) (rejected — five minutes of a dead worker silently holding a concurrency slot against, e.g., a
  10-slot `concurrencyBudget` is a materially worse safety posture than this spec's own 5-second stop-
  latency promise would suggest, and nothing about the existing constant's value was chosen with this
  spec's concerns in mind); an unbounded lease reclaimed only by explicit release (rejected — this is
  exactly the "worker reserves then crashes, reservation leaks forever" failure mode this spec's own Edge
  Cases name).
- **Reclamation sweep cadence (closing a gap found during this spec's own checklist review)**: the
  maintenance-queue sweep that reclaims expired `AdmissionLease` rows (and corrects any drift in
  `BudgetCounter.activeConcurrency`) runs on the same cadence as the existing `timeout-scheduler.ts`
  maintenance sweep family — a 60-second default interval (`DEFAULT_INTERVAL_MS`,
  `apps/worker/src/orchestrator/timeout-scheduler.ts` line 23), registered via the same `upsertJobScheduler`
  pattern. A 60-second sweep interval against a 30-second lease expiry means a reclaimable lease is
  reclaimed within, at most, one sweep cycle after it expires (worst case ~90 seconds end-to-end: up to 30s
  to expire, up to 60s to be swept) — this bounds *resource reclamation* latency, which is a distinct,
  looser concern from FR-013's own 5-second *stop-latency* bound (a live, cooperating execution learns of a
  kill-switch stop at its own checkpoint cadence; a lease held by a worker that is no longer cooperating
  at all, i.e. dead, is reclaimed on this slower sweep cadence instead, since no checkpoint is running to
  notice anything).

## R4: How does a kill-switch stop reach a running execution unit, given no existing cross-process/scan-spanning mechanism exists?

- **Decision**: generalize `packages/config/src/cancellation.ts`'s existing one-channel-per-scan Redis
  pub/sub accelerant pattern from a single `scan:cancel:<scanId>` channel to a small, fixed set of
  scope-keyed channels this spec defines: `safety:stop:execution:<executionId>`,
  `safety:stop:scan:<scanId>`, `safety:stop:grant:<targetAuthorizationId>`,
  `safety:stop:target:<targetId>`, `safety:stop:tenant:<userId>`, and a single `safety:stop:platform`
  channel. A running execution unit subscribes to every channel matching its own identity (its execution
  id, its scan id, the grant(s) it runs under, its target id, its owning tenant id) plus the platform
  channel, exactly mirroring `apps/worker/src/orchestrator/cancellation.ts`'s existing
  `subscribe(scanId, onCancel)`/unsubscribe shape, generalized to multiple keys per execution unit instead
  of one. The authoritative write is always to Postgres `KillSwitchState` first (mirroring
  `scans.routes.ts`'s existing "guarded DB write commits, *then* publish" ordering, line 350's comment);
  the Redis publish is the best-effort accelerant that lets a cooperating execution learn sooner than its
  own next 5-second poll of `KillSwitchState` would.
- **Rationale**: this is the direct generalization of a pattern this codebase has already built,
  documented, and (per `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`'s own prior
  finding) specifically fixed a real "no cancellation signal reaches the worker at all" incident for —
  reusing it rather than inventing a second propagation mechanism satisfies Constitution Principle VIII
  directly, and the "DB authoritative, Redis accelerant, never the reverse" discipline is the same
  discipline R1 already establishes for the admission decision itself.
- **Alternatives considered**: a single global stop-events channel every worker subscribes to
  unconditionally (rejected — makes every worker process receive and filter every stop event
  platform-wide, needless fan-out at scale with no corresponding benefit over scope-keyed channels);
  polling Postgres alone with no pub/sub accelerant (rejected — would force every execution unit's
  checkpoint cadence down to whatever polling interval is acceptable, likely slower than this spec's own
  5-second bound, and discards a working, proven accelerant pattern for no reason).

## R5: Does `KillSwitchState` need its own table, or can it be derived from `ExecutionAuditEvent`?

- **Decision**: a separate, small `KillSwitchState` table, one current-state row per (scope, scopeId) pair,
  upserted in place on each transition — current state is the fast-read projection a checkpoint needs
  (FR-018 requires this check at least every 5 seconds, for potentially six scope dimensions
  simultaneously); `ExecutionAuditEvent` separately and durably records the full event history
  (`requested`/`acknowledged`/`stopped`/`escalated` as distinct audit events, FR-022), exactly the same
  split F01 already uses for `TargetEnvironment` (current-state row, no history) paired with
  `AuditLogEntry` (full history of classification changes) — a precedent this spec reuses rather than
  reinvents.
- **Rationale**: deriving "is there a pending stop for any of my six scope keys" by aggregating/scanning
  an event-sourced log on every checkpoint (potentially thousands of checkpoints per long-running
  execution, per FR-013's cadence) would be needless read amplification against an append-only table, for
  a question a single small upserted-row table answers in one indexed read per scope key.
- **Alternatives considered**: event-sourcing `KillSwitchState` purely from `ExecutionAuditEvent` with no
  separate current-state table (rejected for the performance reason above); a single `KillSwitchState` row
  per execution unit only, requiring every scope-level stop (grant/target/tenant/platform) to fan out and
  write one row per currently-running execution under that scope at trigger time (rejected — this
  requires enumerating every currently-running execution at trigger time, which is slower and racier than
  simply writing one row for the broader scope and having every execution's checkpoint check all of its
  own applicable scope keys, the design this spec actually adopts).

## R6: How is the 5-second stop-latency bound actually enforced inside a long-running safety-sensitive action, given today's cancellation flag is checked only at two coarse orchestrator checkpoints?

- **Decision**: reuse this codebase's existing `AbortSignal`-composition idiom
  (`AbortSignal.any([options.signal, deadline])`, already used in `packages/ai-executor/src/executor.ts`
  and `packages/safe-net/src/safe-fetch.ts` for per-call timeouts) by requiring every future execution
  engine to obtain a scope-bound `AbortController` from this spec's checkpoint contract at execution-unit
  start, and to compose that controller's signal into **every** outbound call the execution unit makes
  (every HTTP request, every AI call, every browser action) via the same `AbortSignal.any([...])` pattern
  those call sites already use for their own per-call timeout — rather than only checking a boolean flag
  between discrete steps the way today's scan-level cancellation does. The kill-switch subscriber (R4)
  calls `.abort()` on this controller the moment a relevant stop is observed; a 5-second fallback timer
  independently calls `.abort()` if neither Redis delivery nor a cooperative poll has already done so,
  guaranteeing the bound holds even if the pub/sub message is lost (matching `cancellation.ts`'s own
  documented posture: "a message that fails validation, or never arrives at all, must never be treated as
  a cancellation... discarded... the worker falls back to discovering the cancellation at its next natural
  boundary" — generalized here so that "natural boundary" is at most 5 seconds away, not the next phase
  transition).
- **Rationale**: this directly closes the gap this session's own infrastructure audit flagged as the key
  net finding: "AbortController/AbortSignal is used exclusively for single-call timeout/cancellation...
  never for scan-level or cross-process cancellation propagation... a future kill-switch spanning multiple
  phases/processes would need to compose these per-call AbortControllers under a longer-lived scan-scoped
  controller" — this spec adopts exactly that composition, rather than only extending the existing
  boolean-flag approach, because the boolean flag was explicitly designed and documented to not interrupt
  in-flight calls (`orchestrator.ts`'s own Checkpoint A/B comments), which is precisely the property a
  kill switch (as opposed to ordinary user cancellation) cannot accept.
- **Alternatives considered**: keeping only the existing coarse two-checkpoint boolean-flag model and
  accepting that in-flight calls are never interrupted (rejected — explicitly contradicts Constitution
  Principle X's "a working emergency stop" requirement for active/adversarial classes specifically, even
  though it remains perfectly adequate for today's passive classes, which this spec does not touch per
  FR-026).

## R7: How does escalation (FR-014) actually force-terminate work this platform does not directly control at the process level?

- **Decision**: for work running inside a process Fahes directly controls (a sandboxed capability
  invocation), escalation reuses the existing sandbox-runner precedent exactly: an unconditional, parent-
  side `SIGKILL` (`apps/sandbox-runner/src/host/server.ts`'s `finish()`, already proven to close a real
  orphaned-process incident) — this spec generalizes that pattern's *reach* (triggered by a kill-switch
  escalation event, not only by the sandbox's own wall-clock timeout) without changing the mechanism
  itself. For an execution unit's own in-process async work that is not inside a sandboxed subprocess (the
  more common case for `BROWSER`/`CRAWLER`/`ACTIVE_SECURITY`/`AUTHENTICATED_WORKFLOW`/`LOAD_CAPACITY`,
  none of which run inside the existing capability sandbox), this spec can only guarantee, by itself: (a)
  the composed `AbortSignal` (R6) aborts every outbound call the execution unit's own code respects, and
  (b) no further budget is consumed and no further result is trusted once `STOPPED` is recorded (FR-014's
  own stated floor). Forcibly terminating a worker **process** that ignores its own abort signal (a true
  hung event loop, not merely a slow one) is explicitly **out of this spec's own reach** — it requires
  F04 (Execution Runtime, not yet planned) to own worker-process-level supervision (e.g., running each
  long-running execution unit in its own Node `worker_threads` instance or child process specifically so
  it *can* be force-terminated independent of the main worker event loop), which this spec names as a
  dependency it hands to F04 rather than silently assumes solved.
- **Rationale**: this spec's own charter (per `specs/006-scan-architecture-v2/roadmap.md`'s F07 row) is
  the safety *mechanisms and hooks*, not the execution runtime's own process topology — F04 is explicitly
  named as the spec that owns "the new dedicated queues" and dispatch mechanics per Constitution Principle
  XII's long-running-work requirements; a true hung-process force-kill is a process-topology concern F04
  must provide the seam for, not something this spec can manufacture without redesigning how/where
  execution units run.
- **Alternatives considered**: silently assuming every execution engine will naturally run inside its own
  killable subprocess without stating this as a dependency (rejected — this is exactly the kind of
  unstated assumption Constitution Principle XIV exists to force into the open; naming it as an explicit
  F04 dependency, rather than asserting this spec solves it, is the honest position the evidence supports).

## R9: Do this spec's new entities need a Prisma `@relation` back to `TargetAuthorization`/`Target`/`Scan` (requiring a structural back-relation field amendment to those models, per F01's own proven Prisma constraint), or can they reference them without one?

- **Decision**: no `@relation` declaration from any of this spec's new models back to `TargetAuthorization`,
  `Target`, `Scan`, or `CapabilityExecution` — every cross-entity reference (`targetAuthorizationId`,
  `targetId`, `scanId`, `executionId`) is a plain, unconstrained scalar string column, not a Prisma relation
  field. This is the existing, direct precedent `AuditLogEntry.actorId` already sets in this exact schema:
  its own schema comment states it is "intentionally unconstrained, not a relation field" specifically so
  writes to it never require a reciprocal field on `User`. This spec applies the identical reasoning to
  every one of its own cross-entity references.
- **Rationale**: this closes a real risk this research pass checked for rather than assumed away — F01's
  own closure pass *proved* (via an actual `prisma validate` run) that a `@relation` field forces a
  reciprocal back-relation field on the referenced model, which is exactly why F01 had to add two lines to
  `Target` despite its own "zero changes" goal. This spec's mission brief is explicit that F01 must not be
  modified absent a genuine contradiction, and the parent architecture's own Constitution Principle XIII
  requires every new entity to be tenant-scoped at creation, not that it hold a referential-integrity
  foreign key — a scalar id column plus an index (matching `AuditLogEntry`'s own
  `@@index([subjectType, subjectId])` pattern) satisfies every query/tenant-scoping need this spec actually
  has (every lookup already goes through a service-layer function that re-derives the owning grant's
  `userId`, never a bare Prisma `.include()` across the relation) without ever requiring a single line of
  change to `TargetAuthorization`, `Target`, `Scan`, or any other existing/frozen model. This is a better,
  more evidence-grounded design than mechanically repeating F01's back-relation pattern — it was available
  to F01 too (F01 could have used an unconstrained scalar for its two `Target` references and avoided
  touching `Target` entirely), but F01 reasonably chose real referential integrity for its own
  core safety entities; this spec chooses the lighter-weight option specifically because it has a stronger
  reason to (avoiding any edit to a frozen parent spec's package) and a working precedent
  (`AuditLogEntry.actorId`) that proves the lighter-weight option is already an accepted pattern in this
  codebase, not a novel risk.
- **Alternatives considered**: a real Prisma `@relation` to `TargetAuthorization` (rejected — would require
  a two-line structural amendment to F01's `TargetAuthorization` model, which this spec's own mission brief
  says to avoid absent a genuine contradiction; this is not one, since a working alternative exists); a
  real Prisma `@relation` to `Target`/`Scan`/`CapabilityExecution` (rejected for the same reason, applied to
  the core schema instead of F01's package — Constitution Principle XIII's tenant-scoping requirement does
  not actually require a declared relation, only that scoping is enforced, which the service layer already
  does for every comparable existing lookup in this codebase, e.g. `TargetAuthorization`'s own
  `findFirst({ where: { id, userId } })` pattern re-derives ownership without ever needing Prisma's
  `.include()` graph-traversal feature).

## R10: Does a future engine's own tighter stop-latency bound (FR-013's "MAY commit to a tighter bound") need cross-engine coordination?

- **Decision**: no. Each future execution-class child spec's own tighter bound (if any) applies only to
  that execution class's own checkpoints — FR-013's platform-wide 5-second value is a ceiling every class
  shares, not a single shared cadence value two engines must agree on. Two engines choosing different,
  independently tighter bounds (e.g. `LOAD_CAPACITY` committing to 2 seconds while `ACTIVE_SECURITY` keeps
  the 5-second default) creates no conflict, because a checkpoint's cadence is a property of the execution
  unit calling it, not a shared resource two engines contend over.
- **Rationale**: this falls directly out of the checkpoint contract's own design (`safety-checkpoint-
  contract.md`) — each execution unit owns its own polling loop and its own composed `AbortSignal`; nothing
  about one execution class's cadence choice is visible to or constrains another's.
- **Alternatives considered**: a shared, centrally-coordinated cadence registry (rejected — no evidence any
  future engine's own cadence choice could conflict with another's, since checkpoints are per-execution-
  unit, not a shared global resource; inventing coordination machinery for a conflict that cannot occur
  would be exactly the "unjustified complexity" the constitution's Development Workflow section forbids).

## R11 (backward-compatibility evidence, closing a gap found during this spec's own checklist review): is there any existing production call site that would be affected by introducing `BudgetCounter`/`AdmissionLease`/`KillSwitchState`/`ExecutionAuditEvent`?

- **Decision**: none exists, confirmed directly rather than assumed — none of these four tables exist in
  the current schema, and no execution class requiring F01's `TargetAuthorization` (the only classes this
  spec's mechanisms apply to, per FR-026) is a runnable engine today. This is the same finding F01's own
  `research.md` R2 made for `assertLoadGenerationAllowed` ("a defined-but-uncalled function proves nothing
  about runtime behavior... there is nothing to grandfather or re-gate"), applied here to entities that do
  not exist yet at all rather than to a function that exists but is uncalled — an even stronger form of the
  same absence-of-conflict finding.
- **Rationale**: FR-026's "strict parallel-run, additive-only" claim should be evidence-backed the same way
  F01 insisted its own equivalent claim be, per Constitution Principle VIII/the parent architecture's
  FR-024/FR-025.
- **Alternatives considered**: asserting backward compatibility without this check (rejected — exactly the
  posture F01's own checklist (CHK036) flagged as insufficient for its sibling claim).

## R8: Does redaction integration require a new mechanism, or does `@webaudit/redaction` already fit?

- **Decision**: reuse `@webaudit/redaction` as-is, the same mechanism the parent architecture's FR-027
  already requires for `Evidence` records — this spec's `ExecutionAuditEvent.payload` field is redacted
  through the identical call path before the `$transaction` that writes the row commits, never after.
- **Rationale**: Constitution Principle VIII; no distinguishing requirement was found that
  `@webaudit/redaction` cannot serve for audit-event payloads the same way it already serves AI-prompt
  assembly and (per the parent spec's FR-027) will serve `Evidence`.
- **Alternatives considered**: a second, audit-specific redaction pass (rejected — no evidence found that
  audit-event content has a materially different secret-shape than evidence content; both are "a response
  body that might contain a session cookie/API key/credential," the exact case `@webaudit/redaction`
  already exists to catch).
