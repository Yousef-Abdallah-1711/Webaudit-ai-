# Execution Plan Contract

Per `spec.md` FR-005/FR-006/FR-007/FR-011/FR-029. The Plan Resolver — the one function every scan
creation (and every reverify) calls to turn a `ScanConfiguration` into an immutable `ScanPlan`.

## `resolvePlan`

```text
resolvePlan(
  config: ScanConfiguration,
  kind: "INITIAL" | "REVERIFY",
  now: DateTime,
) -> ScanPlan  // state: RESOLVED | REFUSED, always returned, never throws for a refusal
```

## Required internal sequence (deterministic — FR-005; every step pure except the F01 calls, which
are themselves pure per F01's own FR-023)

1. Resolve the effective domain list and per-domain execution-class requirement: from the named
   `ScanProfileVersion` (`scan-profile-contract.md`) or from `config.profile.domains` directly for
   a `CUSTOM` configuration (FR-004).
2. For each resolved execution class:
   - If `PASSIVE_HTTP`/`SOURCE_STATIC`/`TELEMETRY`: no F01 call; Ownership Verification is checked
     exactly as today's existing platform already checks it (unchanged, FR-040) — not this
     contract's own concern.
   - Otherwise: call F01's `isAuthorized(targetId, userId, executionClass, destination, now)`
     fresh (FR-007). For an `INITIAL`-kind plan with no destination known yet at resolution time
     (e.g. `AUTHENTICATED_WORKFLOW`'s eventual target routes), `destination` is the Target's own
     canonical origin, used as a representative check — the *real*, per-destination check still
     happens again at every dispatch/checkpoint (FR-022a); this resolution-time check exists only
     to refuse early, before any credit is charged, when no grant could possibly satisfy the class
     at all. For a `REVERIFY`-kind plan (step 3 below), `destination` is instead the reverified
     `Issue.location` itself (found during this spec's own checklist review — a reverify already
     knows exactly which destination it is re-checking, and using the Target's canonical origin
     instead would check the wrong thing whenever the Finding's own location is not the origin
     itself, e.g. a specific route an `ACTIVE_SECURITY` probe found a problem on).
3. If any required class's check returns `REFUSED`: the entire plan resolves to `state: REFUSED`,
   `refusalReason` citing the specific F01 reason and the class it applied to — **no partial plan**
   (a plan is never `RESOLVED` for some classes and silently missing others; refusing one required
   class refuses the whole configuration, matching today's existing "refuse before any debit"
   precedent).
4. If every required class's check passes (or needs none): generate the `ExecutionGraph`
   (`execution-unit-contract.md`'s own generation rules) — one or more `ExecutionUnit`s per class,
   with `ExecutionDependency` edges per the engine's own declared shape (this contract does not
   itself know what depends on what for a specific engine; that is each engine's own declared
   dependency template, supplied via `config`/the profile's `domainExecutionClasses` mapping).
5. Validate the generated graph is acyclic and every dependency is intra-plan
   (`data-model.md`'s validation rules). A violation refuses the plan with `refusalReason: "cyclic
   dependency graph"` — this is a this-spec-internal defect class, never surfaced as an F01/F07
   reason.
6. Snapshot: `scanProfileVersionId` (if any), every referenced `TargetAuthorization.id` (by
   reference, never by copying grant content, per F01's own FR-014 pattern), and persist the whole
   graph in one transaction. Mark `state: RESOLVED`.

## Non-negotiable boundary rules

1. This function MUST NOT cache or reuse an `isAuthorized` result across two different
   `resolvePlan` calls, even for the same `(targetId, executionClass)` pair — every resolution
   calls F01 fresh (F01's own FR-024).
2. A `RESOLVED` plan's graph membership is never edited after this function returns — not by this
   contract, not by any other code path (FR-006/FR-015; the one named exception is a frontier-
   driven class's own bounded runtime child-unit creation, which is additive-only and governed by
   `execution-unit-contract.md`, not by this contract being called again).
3. A `REVERIFY`-kind call always builds a `config` with exactly one domain/execution-class (the one
   the reverified Finding belongs to) and no named profile — this contract applies the identical
   sequence above with no special-cased authorization logic (`research.md` R10).
4. No AI judgment may decide step 2's refuse/admit outcome, step 4's graph shape, or step 5's
   acyclicity verdict (FR-046) — every step is a pure, deterministic function of its inputs.
5. This function MUST fail closed: an internal error at any step (a database failure, F01's own
   `isAuthorized` throwing) surfaces as `state: REFUSED` with a reason identifying the internal
   error — never as a default-`RESOLVED` outcome.
