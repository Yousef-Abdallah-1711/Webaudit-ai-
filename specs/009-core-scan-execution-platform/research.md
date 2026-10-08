# Phase 0 Research: Core Scan & Execution Platform (F02 + F03 + F04 consolidated)

All current-state evidence cited below was gathered by this session's own direct reads
(`apps/api/prisma/schema.prisma`, `packages/capability-sdk/src/contract.ts`,
`apps/worker/src/orchestrator/orchestrator.ts`, `apps/worker/src/workspace/teardown.ts`,
`apps/api/src/services/storage/{uploads,retention}.ts`) plus `docs/reviews/scan-audit-2026-10-07/`
and the frozen F01/F07 packages, treated as the settled baseline — not re-derived a second time
here, the posture 006/F01/F07 each took toward their own baselines.

## R1: Does `ExecutionUnit` extend `CapabilityExecution`, or is it a new table?

- **Decision**: new table. See `spec.md`'s own Clarifications for the full Prisma-feasibility
  finding: `CapabilityExecution.capabilityId` is a required (non-nullable) FK to `Capability`
  (`apps/api/prisma/schema.prisma:683-707`), which a generic cross-engine execution record (most of
  which are not vendored-capability dispatches at all) cannot satisfy without either weakening a
  working required column or inventing placeholder `Capability` rows for non-capabilities.
- **Alternatives considered**: making `capabilityId` nullable on `CapabilityExecution` itself
  (rejected — a semantic loosening of an existing, working table's own invariant, which this plan's
  migration posture treats with the same caution F01 applied to touching `Target`: avoid unless
  proven necessary, and a working alternative — a new table — exists); a placeholder `Capability`
  row per future engine (rejected — pollutes the existing `Capability` registry, which Constitution
  Principle I's own discovery/trust model treats as meaningful, with rows that are not actually
  discoverable, trust-leveled capabilities).
- **Rationale**: Constitution Principle VIII's own "rewrite requires evidence extension is
  insufficient" bar is satisfied in the *opposite* direction here — extension is what would be
  unjustified (forcing an incompatible shape through a working table), and a new, additive table is
  the evidence-grounded default.

## R2: Do any of this spec's eight new tables need a Prisma `@relation` back to `Scan`/`Target`/
`Issue`/`TargetAuthorization`/`CapabilityExecution` (requiring a structural back-relation field
amendment to those models, per F01's own proven Prisma constraint)?

- **Decision**: no. Every cross-entity reference (`scanId`, `targetId`, `executionUnitId`,
  `targetAuthorizationId`, `planId`) across all eight new tables is a plain, unconstrained scalar
  string column with an index — directly reusing F07's own `research.md` R9 reasoning and its
  proven precedent (`AuditLogEntry.actorId`), applied here across a wider set of new entities than
  F07 itself needed to.
- **Rationale**: this spec's own mission brief (master-prompt §42/§25) requires proving unrelated
  work and frozen specs stay untouched; a scalar-id-no-relation design achieves **zero** structural
  change to `Scan`, `Target`, `Issue`, `TargetAuthorization`, or `CapabilityExecution` — a *stronger*
  non-modification guarantee than even F01 achieved for `Target` (which needed two back-relation
  fields) or F07 achieved for its own four entities (which needed zero, the same pattern this spec
  reuses). Every lookup this spec's own contracts define re-derives tenant ownership through a
  service-layer function (never a bare Prisma `.include()` traversal), exactly as F01/F07 already
  do for their own entities — so the lighter-weight scalar reference loses no tenant-scoping
  guarantee it would otherwise have gained from a declared relation.
- **Alternatives considered**: a real `@relation` to `Scan` for `ScanPlan`/`ExecutionUnit`
  specifically, since every one of them conceptually belongs to exactly one scan (rejected — would
  require a `Scan.executionPlan`/`Scan.executionUnits` back-relation field, a structural edit to an
  existing, working, frequently-touched model; the scalar-reference alternative costs nothing in
  practice since every actual lookup already goes through a tenant-scoped service function, not a
  Prisma `.include()`).

## R3: What is the queue-placement rule for a new execution class, and does `BROWSER` get its own
queue or share the existing `webaudit-scan-phase` queue once E10 deploys it?

- **Decision**: every execution class requiring `TargetAuthorization` gets its own dedicated queue,
  `BROWSER` included — a deliberate refinement of 006's own `plan.md`, which tentatively placed
  `BROWSER` on the existing scan-phase queue "once deployed" (`specs/006-scan-architecture-v2/
  plan.md`'s Execution-Class Matrix, `BROWSER` row, "Queue placement" column).
- **Rationale**: Constitution Principle XII states the governing rule plainly — "a long-running
  execution class SHOULD run in its own queue rather than sharing a queue whose other jobs are
  short and latency-sensitive." `BROWSER` is rendering-dependent (seconds-to-minutes per page, per
  006's own Execution-Class Matrix) and will, once E10 deploys it, sit beside today's
  `PASSIVE_HTTP`/`SOURCE_STATIC` jobs on the scan-phase queue if co-located — exactly the "short,
  latency-sensitive jobs starved by a longer one" risk this principle exists to prevent. 006's own
  placement was explicitly tentative ("once deployed," not a settled design); this plan applies the
  uniform rule 006 itself states elsewhere (the `webaudit-reverify`-own-queue precedent) rather than
  carrying forward an unexamined exception for one specific class.
- **Alternatives considered**: keeping 006's tentative placement unchanged (rejected — no new
  evidence supports treating `BROWSER` differently from `CRAWLER`, which 006's own matrix already
  gives a dedicated queue for the identical duration/statefulness reasons); a single shared
  "long-running" queue for all five non-passive classes (rejected — mixes classes with materially
  different safety/duration/statefulness profiles behind one concurrency/priority configuration,
  the same "one BullMQ job shape is not appropriate for all of them" mistake Constitution Principle
  XII explicitly warns against).

## R4: How does `ExecutionUnit`'s process-isolation mechanism (FR-019) differ from, and avoid
conflating with, Constitution Principle XI's untrusted-code isolation bar?

- **Decision**: a dedicated child OS process per long-running `ExecutionUnit`, with a parent-armed,
  unconditional `SIGKILL` deadline — directly generalizing `apps/sandbox-runner/src/limits/
  timeout.ts:armTimeout`'s already-proven mechanism — is sufficient for this spec's own threat
  model (a liveness/correctness guarantee against *Fahes's own* engine code hanging), and is
  explicitly **not** asserted to satisfy Principle XI's container/VM-grade bar (which exists for
  *customer-supplied, untrusted* code specifically).
- **Rationale**: these are two different threat models with two different required strengths. A
  hung event loop in Fahes's own reviewed `ACTIVE_SECURITY` engine code is a bug, not an attack —
  the failure mode is "this code forgot to check an abort signal," not "this code is actively trying
  to escape its sandbox." A plain child process with an unconditional parent-side `SIGKILL` closes
  that failure mode completely (the OS, not the child's own cooperation, terminates it) without the
  overhead/complexity of container or VM-grade isolation, which exists to resist a *hostile* process
  trying to escape, read host memory, or pivot to the network — a concern this spec's own engines
  (Fahes's own code) do not present. Conflating the two would mean E13 (Untrusted Source Execution)
  could point at this spec's lighter mechanism as "already solved," which would be a genuine safety
  regression this spec must not create.
- **Alternatives considered**: Node `worker_threads` instead of a child process (rejected — a
  `Worker.terminate()` call is not proven, in this codebase or generally, to interrupt a worker
  thread blocked in a native/blocking syscall as reliably as a process-level `SIGKILL`; the
  sandbox-runner precedent this spec generalizes is process-based, not thread-based, and this spec
  prefers the mechanism with an actual working precedent over an untested alternative); container-
  per-execution-unit (rejected as unjustified complexity for this spec's own threat model — that
  bar is reserved for E13's genuinely different problem, per Constitution Principle XI's own
  "equivalent proven containment" framing, which this spec's threat model does not require).

## R5: How is `ExecutionUnit` progress persisted without one database write per tick?

- **Decision**: `ExecutionUnit.progressSnapshot` (a bounded-size `Json?` column) is written at a
  throttled cadence (at most once per a short, fixed interval, or on a status transition — never on
  every individual progress tick an engine's own internal loop produces) — directly mirroring the
  existing pattern where `ModuleResult`'s own persisted fields are written at phase/module
  boundaries, not per-check. Fine-grained, high-frequency ticks are published over the existing
  Redis-backed WebSocket delivery path (`apps/worker/src/orchestrator/emit.ts`), generalized from
  per-scan to per-`ExecutionUnit` channel granularity, and are never individually persisted.
- **Rationale**: master-prompt §30's own explicit bound ("no DB transaction per progress tick");
  the constitution's Technology Constraints ("Redis is cache, queue, and rate-limit state only,
  never a system of record") already forbids treating the ephemeral tick stream as durable truth,
  which is exactly why a bounded, throttled durable snapshot (not the full tick stream) is what
  Postgres stores.
- **Alternatives considered**: persisting every tick (rejected — directly violates the stated
  bound and would make a long `CRAWLER`/`LOAD_CAPACITY` run generate an unbounded number of rows or
  an unboundedly-growing JSON column); persisting nothing durable at all, relying solely on Redis
  (rejected — loses progress state entirely across a worker/Redis restart, and the constitution
  forbids treating Redis as the system of record for anything this spec considers durable truth).

## R6: How does `ExecutionUnit` finalization achieve the idempotency F07's own `requestAdmission`/
checkpoint contracts assume of their callers?

- **Decision**: `ExecutionUnit.idempotencyKey` is derived deterministically from
  `(executionUnitId, attempt)` — stable across a BullMQ redelivery of the *same* attempt, and
  distinct for a genuinely new attempt (FR-024's idempotence-must-be-proven gate decides whether a
  new attempt is even permitted). Finalization (recording `COMPLETED`/`FAILED`/etc., releasing any
  held F07 lease, writing the final `progressSnapshot`) is one Postgres transaction, guarded by this
  key exactly the way F07's own `BudgetConsumption`/`AdmissionLease` tables are guarded by theirs
  (`@@unique` on the idempotency key) — a redelivered finalization call observes "already applied"
  and returns the same recorded outcome, never re-finalizing or double-releasing.
- **Rationale**: this is the identical discipline F07's own FR-008 already requires of every
  caller; this spec's own `ExecutionUnit` finalization is exactly such a caller, so it inherits the
  same pattern rather than inventing a different one (Constitution Principle VIII).
- **Alternatives considered**: relying on F07's own idempotency guarantee alone, with no
  `ExecutionUnit`-level finalization guard (rejected — F07's guarantee covers *budget*
  consumption/lease state specifically; it says nothing about whether this spec's own
  `ExecutionUnit.status` row-write is itself idempotent, which is a separate, this-spec-owned
  concern F07 never claimed to solve on this spec's behalf).

## R7: What is the Evidence/Artifact storage split, concretely?

- **Decision**: `Evidence.inlinePayload` (small, structured JSON) for anything that fits comfortably
  in a database row (an HTTP status/header summary, a short code-flow note); `Evidence.artifactId`
  (FK-by-scalar-id to `Artifact`) for anything whose natural size would make the row itself
  unboundedly large (a screenshot, a video, a HAR file, a browser trace, a load-test time-series
  dump) — the same split 006's own `contracts/shared-platform-contracts.md` boundary rule 4 already
  states, finalized here with a concrete size discipline: `Artifact` is used whenever a single
  evidence payload would exceed a small, fixed inline-size ceiling (this spec names the mechanism —
  "there is a ceiling, and exceeding it means `Artifact`" — not the specific byte number, which is
  an implementation-time tuning decision against FR-033's own write-time-enforced budgets).
- **Rationale**: master-prompt §19's own explicit instruction ("do not make all evidence a giant
  database JSON blob") and §30's "large content belongs in artifact/object storage" bound.
- **Alternatives considered**: a single blob-or-reference union with no explicit ceiling, left to
  each engine's own judgment (rejected — directly contradicts FR-033's own requirement that a
  *budget*, not vibes, decides inline-vs-artifact; an unenforced "use your judgment" rule is not a
  budget).

## R8: What does `Artifact`'s R2 key scheme look like, and how does it avoid the existing staged-
upload retention gap's shape?

- **Decision**: `artifacts/<scanId>/<executionUnitId>/<sha256-or-cuid>` — tenant-scoped indirectly
  through `scanId` (itself tenant-scoped via `Scan.userId`, unchanged) and content-addressed where
  the content is naturally hashable (most binary evidence), falling back to a fresh `cuid` where
  content-addressing does not apply (e.g. a live load-test time-series stream written incrementally,
  which has no single final hash until it is already complete). Every `Artifact` row's creation and
  every scan's retention-boundary crossing (FR-034) both run inside the service-layer code this
  spec's own `contracts/artifact-contract.md` defines — there is no "write the R2 object, maybe
  write the row later" gap the way `uploads.ts`'s own `remove` method today has zero call sites;
  FR-035's orphan sweep exists specifically to catch the one case that *can* still diverge (the row
  write failing after the R2 write succeeded), closing exactly the shape of gap the existing
  staged-ZIP-upload question represents, proactively rather than retroactively.
- **Rationale**: distinct prefix from both existing R2 prefixes (`uploads/<userId>/...` for staged
  pre-scan uploads, `scans/<scanId>/<key>` for existing report artifacts) so this spec's new
  retention-sweep extension (FR-034) can enumerate exactly its own objects without touching either
  existing prefix's own (separately-owned) cleanup behavior.
- **Alternatives considered**: reusing the existing `scans/<scanId>/<key>` prefix directly
  (rejected — would make this spec's new per-execution-unit objects indistinguishable from today's
  existing report-artifact objects at the storage-key level, complicating a future audit of "what
  does this prefix actually contain" the same way a single undifferentiated evidence blob field
  would at the database level).

## R9: How is `FailureClass` (FR-023) actually derived at the point an `ExecutionUnit` fails, and
who assigns it?

- **Decision**: the owning worker's finalization code (never the engine's own code — mirroring the
  existing rule that a capability cannot declare its own `attribution`, Constitution Principle III)
  classifies the failure based on what actually happened: an uncaught exception inside the child
  process's own engine code -> `ENGINE_DEFECT`; the child process's own `SIGKILL` deadline firing
  with no prior result -> `TIMEOUT`; F07's checkpoint returning `STOP` -> `SAFETY_REFUSED`; a thrown
  network/database error with no engine-code frame involved -> `TRANSIENT_INFRASTRUCTURE`; a
  `SOURCE_EXECUTION` unit's own build/test exit code being nonzero (a legitimate, measured result)
  -> `CUSTOMER_CODE_FAILURE`, never `FAILED`-as-infrastructure-fault; and so on per `spec.md`
  FR-023's own enumeration. This classification function is itself a pure, deterministic mapping
  from (what component raised the error, what F07/the checkpoint said, what the engine's own
  declared result shape says) to one `FailureClass` value — never a guess, never an engine's own
  self-report accepted uncritically.
- **Rationale**: master-prompt §16's explicit requirement that this distinction be "architectural,"
  not left to each engine to self-report inconsistently; the existing platform's own precedent
  (attribution assigned by the runner, not the capability) is the direct template.
- **Alternatives considered**: letting each engine's own child spec define its own failure
  taxonomy independently (rejected — directly produces the "one generic retry policy... never use
  it for every failure" anti-pattern the master prompt explicitly forbids, applied inconsistently
  per engine instead of once, correctly, here).

## R9a (found during this spec's own checklist review): is `DETERMINISTIC_FINDING` ever actually
persisted as `ExecutionUnit.failureClass`?

- **Decision**: no. `DETERMINISTIC_FINDING` exists in the `FailureClass` enum purely as an explicit,
  self-documenting case R9's classification function must consider and *reject into a `COMPLETED`
  outcome* — a unit whose engine measured something and reported a result (even a negative-looking
  one, like "the target returned HTTP 500" or "the injection probe succeeded") is classified
  `COMPLETED`, never `FAILED`, and `ExecutionUnit.failureClass` stays `null`. An earlier draft of
  this document left it ambiguous whether `DETERMINISTIC_FINDING` could appear as a stored
  `failureClass` value, which would have directly contradicted `data-model.md`'s own validation
  rule ("`failureClass` populated only when `status = FAILED`") since a deterministic finding is,
  by this spec's own definition, not a failure at all.
- **Rationale**: master-prompt §16's own example ("A security finding is NOT a failed job") is
  stated as a requirement on the *classification function's output*, not merely as prose
  explaining intent — the enum value's role is to make the classification function's own internal
  decision table complete and auditable (every possible raw outcome has a named bucket, including
  the "this is not a failure" bucket), not to introduce a fourth persisted failure state alongside
  `TIMEOUT`/`ENGINE_DEFECT`/etc.
- **Alternatives considered**: removing `DETERMINISTIC_FINDING` from the enum entirely, relying on
  prose alone to say "a measured finding is not a failure" (rejected — an enum value the
  classification function must explicitly route to `COMPLETED` is a stronger, checkable contract
  than a prose reminder with no corresponding code path a test can assert against).

## R10: How does a reverify for a new-execution-class Finding avoid reusing a stale authorization
snapshot?

- **Decision**: FR-029's "always resolve a new, minimal, single-unit `ScanPlan`" design means a
  reverify literally re-runs the same Plan Resolver (FR-005) a fresh scan would, with a
  `ScanConfiguration` of exactly one domain/execution-class (the one the Finding being reverified
  belongs to) and no profile — this is not a special-cased "reverify mode" with its own authorization
  logic, it is the *same* resolver, called with a smaller input, which automatically inherits every
  one of FR-007's existing guarantees (fresh F01 check, refusal before any work is queued) with zero
  new code path to get wrong.
- **Rationale**: Constitution Principle VIII ("reuse an existing shared contract before inventing a
  parallel one"), applied here to this spec's *own* mechanism rather than only to F01/F07's.
- **Alternatives considered**: a bespoke "reverify authorization check" bypassing the full Plan
  Resolver for efficiency (rejected — the efficiency gain is negligible for a single-unit plan, and
  a bespoke path is exactly the kind of parallel mechanism this spec exists to prevent other specs
  from inventing; it should not invent one itself).

## R11: Backward-compatibility evidence — does any existing production call site reference any of
this spec's eight new tables or the new per-class queues?

- **Decision**: none exists, confirmed directly. None of `ScanProfile`/`ScanProfileVersion`/
  `ScanPlan`/`ExecutionUnit`/`ExecutionDependency`/`Evidence`/`IssueEvidenceLink`/`Artifact` exist in
  the current schema; none of the six new per-execution-class queue names exist in
  `packages/config/src/queues.ts`'s current `QUEUE_NAMES`; no execution class requiring
  `TargetAuthorization` is a runnable engine today (the identical finding F01's own `research.md` R2
  and F07's own `research.md` R11 each already made for their own entities, extended here to a wider
  set that also does not exist yet).
- **Rationale**: FR-040's "zero behavior change" claim should be evidence-backed the same way F01
  and F07 each insisted their own equivalent claims be.
- **Alternatives considered**: asserting backward compatibility without this check (rejected — the
  same posture F01's own checklist CHK036 and F07's own `research.md` R11 both flagged as
  insufficient for their sibling claims).

## R12: Does moving `BROWSER` to its own dedicated queue (R3) constitute an amendment to 006's frozen
master plan, and if so, how is that handled?

- **Decision**: it is recorded as an explicit, evidence-grounded refinement, not a silent
  divergence — 006's own Edge Cases section (`specs/006-scan-architecture-v2/spec.md`) states
  exactly this mechanism for exactly this situation: "What happens when a future child spec
  discovers that an assumption this master spec made about the current architecture is wrong...
  The child spec MUST surface this back to this master spec as a proposed amendment rather than
  silently diverging from it." This research entry, `plan.md`'s Runtime/Queue Topology section, and
  this spec's own Clarifications are that surfacing — 006's own `plan.md` is not edited by this
  spec (it remains frozen, per this spec's own non-goal of amending a sibling frozen package
  without a genuine contradiction), but the refinement and its rationale are documented here for
  006's own future maintainer to fold back if they choose.
- **Rationale**: 006's own governance model explicitly anticipates and welcomes exactly this kind
  of downstream correction; silently keeping 006's tentative wording unchanged while this spec
  designs against a different rule would create the inconsistency 006's Edge Cases section exists
  to prevent.
- **Alternatives considered**: editing 006's `plan.md` directly (rejected — out of this spec's own
  scope per the triggering master prompt's explicit "do not reopen frozen architecture casually"
  instruction; this is not the "genuine proven contradiction that makes this spec impossible" bar
  the master prompt reserves for actually stopping and escalating — it is a minor, net-positive
  refinement this spec can adopt for its own design while leaving 006's document itself alone).

## Independent Adversarial Review (master-prompt §40, 31 named scenarios plus this spec's own
Edge Cases)

For every scenario: whether already fully resolved by F01/F07 (this spec changes nothing, only
calls their contract correctly) or resolved by a specific FR of this spec's own.

| # | Scenario | Disposition |
|---|---|---|
| 1 | Authorization revoked after plan creation | Already resolved by F01 FR-014 + F07 FR-012; this spec's FR-015/FR-022a ensure the plan's own immutability never masks the live re-check. |
| 2 | Authorization revoked between queueing and dispatch | Already resolved by F07's dispatch-time checkpoint (FR-022); this spec's FR-018 ensures dispatch re-reads live state, never trusting the queued-at-time snapshot. |
| 3 | Scope changed before execution | F01's ScopeDefinition is immutable once referenced (F01 FR-009); a *grant* change requires a new grant (F01 FR-016), which this spec's FR-007/FR-022 re-check fresh at every mandatory point — no stale scope can be used. |
| 4 | Kill switch during active work | Already resolved by F07's KillSwitchState/checkpoint cadence; this spec's FR-021 carries the resulting `KILLED` status onto `ExecutionUnit` without collapsing it into `CANCELLED`/`FAILED`. |
| 5 | Kill switch while worker is hung | FR-019's parent-armed SIGKILL deadline fires independent of whether the hung child ever observes the kill-switch signal — resolved by this spec specifically (this is F07's own named R7 dependency). |
| 6 | Duplicate BullMQ delivery | Already resolved by F07's idempotency (FR-008) for budget/lease state; this spec's own FR-025/R6 provide the matching guarantee for `ExecutionUnit.status` finalization itself. |
| 7 | Worker completes after its lease is fenced | Already resolved by F07's `holderToken` fencing (F07 FR-006a); this spec's checkpoint-integration (FR-022) requires treating a failed renewal exactly as F07 specifies — an immediate stop, never "log and continue." |
| 8 | Redis unavailable | Already resolved by F07 (Postgres-authoritative, Redis best-effort accelerant, R1/R4); this spec's own progress model (FR-027/R5) applies the identical discipline — a lost ephemeral tick never corrupts the durable snapshot. |
| 9 | Postgres temporarily unavailable | Already resolved by F07's fail-closed rule (FR-005/FR-021), inherited unchanged; this spec's own writes (ExecutionUnit finalization, Evidence/Artifact rows) fail closed identically — never a default-success outcome on a write failure. |
| 10 | API crashes during plan creation | The Plan Resolver (FR-005) is a single, bounded, idempotent-at-the-database-level operation (no partial plan is ever marked RESOLVED — a crash mid-resolution leaves the plan absent or REFUSED, never half-populated); a retried `createScan`-equivalent call re-resolves cleanly, matching today's existing `create-scan.ts` crash-safety posture. |
| 11 | Orchestrator crashes after dispatch | The queued job (FR-018, id-only payload) survives the crash in BullMQ/Redis; a redelivery re-reads live Postgres state and proceeds exactly per the Crash/Recovery flow diagram in `plan.md`. |
| 12 | Worker crashes after evidence write | Evidence writes are their own committed transaction (R7); a crash after that commit but before `ExecutionUnit` finalization leaves the unit `RUNNING` until a stale-lease/redelivery recovery path (F07's lease reclamation, reused) resolves it — the already-written Evidence is never lost or duplicated, since finalization is idempotent (R6) and does not re-write Evidence on a retried attempt that recognizes prior partial progress via its own idempotency key. |
| 13 | Artifact upload succeeds but DB transaction fails | FR-035's orphan sweep; the dangling R2 object is never referenced by any Evidence row (since that row's own insert is what failed) and is reclaimed on the existing maintenance-sweep cadence. |
| 14 | DB row exists but artifact upload failed | The `Artifact` row insert and the R2 `PutObject` call are ordered upload-first-then-row (R8) specifically so this direction of mismatch cannot occur structurally — a failed upload never reaches the row-insert step at all. |
| 15 | Late worker tries to overwrite a newer result | FR-027a (progress) and F07's lease-fencing (reused, for the execution's own safety-sensitive actions) together close this: a superseded worker's lease renewal fails first (F07), which this spec's checkpoint-integration treats as an immediate stop before any further write — including a finalization write — can occur. |
| 16 | Scan cancelled during fan-out | Every not-yet-dispatched sibling unit observes the cancellation at its own next checkpoint (FR-022) before admission; an already-running sibling is signaled per F07's existing kill-switch propagation, unchanged. |
| 17 | Dependency fails during fan-in | FR-010's deterministic `BLOCKED` propagation, naming the specific failed predecessor. |
| 18 | Partial scan completion | FR-038/FR-039 — Evidence/Findings from COMPLETED units always reach the report; non-COMPLETED units are named with their specific reason, never silently absent. |
| 19 | Reverify against a stale plan | FR-029 — a reverify never reuses the original plan at all; it resolves its own fresh, minimal plan every time. |
| 20 | Profile definition changes after historical scan | FR-003 — `ScanPlan.profileVersion` is an immutable snapshot of the exact version resolved against. |
| 21 | Queue payload replay | FR-018 — the payload carries only an id; replaying it re-reads live, current Postgres state, which the idempotency/lease/kill-switch mechanisms (R6, F07) govern identically to any other redelivery. |
| 22 | Cross-tenant execution id guessed | FR-026/FR-041 — every lookup is tenant-scoped; a guessed id belonging to another tenant is indistinguishable from a nonexistent one, matching F01's own `reconfirmControl`/`TargetAuthorization` precedent. |
| 23 | Artifact object key manipulated | R8's validated-key pattern (mirroring `assertUploadKey`) — a key that does not match the expected `artifacts/<scanId>/<executionUnitId>/...` shape, or whose `scanId` segment does not match the caller's own tenant-scoped scan, is refused before any R2 operation. |
| 24 | Progress emitted after terminal state | FR-027a — rejected and logged as an anomaly, never applied. |
| 25 | Finding references deleted evidence | FR-034's single-transaction, per-scan removal (never partial) means a Finding and its linked Evidence are removed together, in the same retention-sweep transaction — a Finding can never outlive the Evidence `IssueEvidenceLink` rows it depends on being independently swept on a different schedule. |
| 26 | Cleanup races with report viewing | Inherits the existing `enforceRetention`/`reportRemovedAt` ordering (FR-034's extension) — a reader observes either the full report or the already-removed response, never a half-removed intermediate state, per the existing mechanism's own proven atomicity. |
| 27 | Very long execution | FR-017's dedicated queue + FR-019's own-process isolation are specifically sized for this (hours-scale, per 006's own Execution-Class Matrix duration column for `LOAD_CAPACITY`/`SOURCE_EXECUTION`); the SIGKILL deadline is set from the unit's own declared `timeoutPolicy`, which a long-running class's own engine spec sets appropriately long, not inherited from today's short-job defaults (Constitution Principle XII). |
| 28 | Execution that never reports progress | FR-027's `indeterminate: true` honesty rule covers "progress is genuinely unknown"; an execution that never reports *anything* (durable or ephemeral) for longer than its own declared checkpoint cadence is caught by F07's own 5-second checkpoint requirement (FR-022) — silence at the safety-checkpoint layer is itself treated as a stop-eligible condition per F07's existing fail-closed rule, independent of whether progress specifically is being reported. |
| 29 | Execution that ignores `AbortSignal` | FR-019's SIGKILL deadline does not depend on the child process cooperating with any signal at all — this is the entire reason FR-019 exists rather than relying solely on F07's cooperative `AbortSignal` composition (F07's own R6). |
| 30 | Budget exhausted before new admission | Already fully resolved by F07 (FR-002/FR-005a); this spec's own FR-022 simply calls `requestAdmission` and respects its `BUDGET_EXHAUSTED_*` refusal, classified `SAFETY_REFUSED` (FR-023) at this spec's own layer. |
| 31 | Budget reaches limit while already-admitted work exists | Already resolved by F07 — admission is a one-time atomic check-and-reserve (F07 FR-001); already-admitted work is not retroactively revoked by a later caller's budget exhaustion (F07's own design), and this spec introduces no mechanism that would contradict that. |
