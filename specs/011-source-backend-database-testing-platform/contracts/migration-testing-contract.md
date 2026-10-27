# Contract: Migration and Data-Integrity Testing on a Disposable Database

Per FR-104 through FR-107 (plus FR-082, FR-083, FR-100, FR-106, FR-109, FR-149). Check ids use the prefix `db.*` (R2). Consumers: Database domain
(`ModuleType DATABASE`) Source Checks, `database-schema-contract.md`, `coverage-contract.md`,
`source-reverify-contract.md`. Reason codes only from the registry owned by `source-evidence-contract.md`.

## Signature (shape, not final TypeScript)

```text
// Guest Steps, trusted Command Templates: db.postgres.start, db.migrate.sql, db.schema.introspect
runMigrationScenarios(plan: MigrationPlan) -> MigrationResult[]
MigrationPlan = { fixtureId, postgresVersion: "16", migrations: {id, order, path}[],
  scenarios: MigrationScenario[], fixtureSpec: { seed: number, maxRowsPerTable: number /* default and cap 1,000 */ } }
MigrationScenario = "FRESH_DB"|"SEQUENTIAL"|"ORDERING"|"MISSING_OR_GAP"|"REPEATED_APPLY"
  |"CONSTRAINT_COMPATIBILITY"|"TRANSACTIONAL_FAILURE"|"DRIFT"|"DOWN_MIGRATION"|"DATA_PRESERVATION"|"INTEGRITY_PROBES"
MigrationResult = { scenario, status: "APPLIED"|"FAILED"|"PARTIAL"|"NOT_RUN", appliedVia: "fahes-applier", migrationIdentity?, sqlState?,
  objects?, orderObserved?, driftDiff?, probeOutcomes? }   // no STOPPED: a destroyed Guest cannot emit a result (invariant 7)
```

## Inputs

- Snapshot migrations (SQL files and Prisma `migration.sql` directories) in their declared order; the
  `SCHEMA_SNAPSHOT` from `database-schema-contract.md` as the expected-object source.
- A PostgreSQL 16 instance started inside the Guest from the signed image (unix socket or Guest loopback,
  data directory on Guest scratch). Execution requires a `SOURCE_EXECUTION` grant (REPOSITORY scope) and
  F07 admission; one fixture per run (FR-124).
- Down migrations only when explicit down files exist; none are synthesized. With no explicit down files the `DOWN_MIGRATION`
  scenario is not planned (no scenario evidence, no check, counted only in `migrationsExercised.declared`), not a verdict.
- No dependency install is required: migrations are applied by the Fahes in-Guest applier `db.apply.sql` (libpq; each file sent as ONE simple-query request as a non-superuser owner role, matching Prisma's atomicity; NOT `psql`, whose backslash meta-commands such as `!` run shell commands) from snapshot files, so `NO_LOCKFILE`,
  `REQUIRES_LIFECYCLE_SCRIPTS` and the Prisma engines are irrelevant to every scenario here.
- Any prior-evidence lookup (toolchain-drift flag, reverify comparison) is filtered by tenant and target and never crosses tenants (FR-149).

## Outputs

- `MIGRATION_RESULT` Evidence per scenario (redacted) plus a migration log Artifact (redacted, bounded).
  Payload essentials: `scenario`, `status`, `migrationIdentity {id, order, fileDigest}`, `sqlState`,
  `errorMessage` (redacted), `objects {kind, qualifiedName, action}[]`, `orderObserved[]`, `partialState`
  description when `status = PARTIAL`, (the `status` enum is `APPLIED|FAILED|PARTIAL|NOT_RUN`; `data-model.md` MUST carry this exact enum and the 11 scenarios, so "PARTIAL is never presented as APPLIED" is checkable against one enum) `postgresVersion`, `fixtureId`, `imageId`, `seed`, `snapshotDigest`.
- Migration fingerprint: `[migrationId, failureClass, SQLSTATE + objectName signature]` (no line numbers).

## Ownership

Database domain owns scenarios, probes and checks; E13 runs them as Steps. The comparator is Fahes-owned
code (not the Prisma engine, FR-104). The fixture is not a Target (007 untouched).

## Invariants

1. Disposable only: the sole database is the in-Guest PostgreSQL 16. Any `DATABASE_URL`, host or
   credential found in source or env is ignored for connection, never echoed, and recorded as
   the FLAG `NON_DISPOSABLE_DATABASE_REFERENCE` (path only; observation, never a verdict, never used to connect; the DB checks proceed
   on the in-Guest fixture). A connection attempt outside the Guest is impossible by network policy (`NETWORK_BLOCKED_BY_POLICY`);
   if it is a tamper signal it is flagged `SANDBOX_POLICY_VIOLATION` and aborts as `CONTAINMENT_ABORT`.
2. Scenario catalog: fresh-DB apply; sequential history; ordering (lexicographic vs declared); missing
   files and gaps; repeated apply (idempotency of re-run); constraint compatibility (existing rows vs new
   constraints on fixtures); transactional failure behavior (does a mid-migration error roll back);
   drift; down migration (only if explicit); data preservation; integrity probes.
3. Drift: expected objects from the parsed declared schema (tables, columns, types, nullability, uniques,
   foreign keys, indexes only) compared with `pg_catalog` introspection after a fresh apply, by the in-Guest tool
   `db.drift.compare`. Objects outside that list are not compared. Unparseable declared objects, or introspection that cannot be
   compared, yield `DRIFT_UNTESTABLE` (`NOT_TESTED`: the precondition for comparing is absent).
4. Data preservation uses deterministic synthetic fixtures: seeded PRNG, FK-ordered inserts, bounded rows
   per table (provisional, default and cap 1,000, generated by `db.seed.synthetic`), no production data, no customer rows (FR-083, FR-106). If introspection
   cannot support generation for a table, that table is `NOT_TESTED`, reason `FIXTURE_GENERATION_UNSUPPORTED`.
5. Integrity probes executed in the fixture: foreign-key violation attempt, duplicate unique value, NOT NULL
   violation, cascade behavior, orphan prevention, transaction consistency. Probes separate schema
   guarantees from application assumptions; a probe that unexpectedly succeeds is a `FINDING` with the
   object and SQLSTATE absent.
6. Partial-apply honesty: if a migration fails midway, evidence records the failing migration identity,
   SQLSTATE and the observed catalog state; `status = PARTIAL` is never presented as `APPLIED`; later
   migrations are `NOT_RUN`, not failed.
7. Kill or timeout during a migration test: the Guest is destroyed and the database disappears with it.
   NO `MIGRATION_RESULT` is written for the interrupted scenario (a destroyed Guest cannot emit one); the unit is `KILLED`/`CANCELLED` per F07 and the coverage summary shows the scenario as `NOT_RUN` (stopped), never as a pass or fail of the migration, and any in-progress partial state is not published as a result (FR-107). F07 `STOPPED` follows after destruction confirmation (FR-051).
8. Destructive operations (drops, truncates, data rewrites) are permitted only inside the disposable
   fixture (provisional product default, FR-106); no migration may run against any non-disposable
   database; a future capability would need separate authorization and is out of scope.
9. Prisma engines are irrelevant to SQL migration application: Prisma-style `migration.sql` directories and plain `*.sql` files
   are both applied by the Fahes applier `db.apply.sql`, never by `psql` or the Prisma schema/migration engine. A file containing a line that starts with a backslash meta-command is refused statically with `SQL_META_COMMAND_REFUSED` (`NOT_TESTED`). `appliedVia: "fahes-applier"` is recorded, and a `PASS` means "the SQL applied under the Fahes applier on PostgreSQL 16", not equivalence with the customer's own migration tool or database version (stated limitation). `CREATE INDEX CONCURRENTLY` cannot run inside a single request; such a file yields `INCONCLUSIVE` with an explicit note. `PRISMA_ENGINE_UNAVAILABLE` affects only Prisma client
   generation (type-check and backend runs) and never makes a migration scenario `NOT_TESTED`. Missing prerequisites that DO
   apply (fixture cannot start, unsupported column type for seeding) follow the failure table, never `PASS`.
10. Query plans (`EXPLAIN`) are collected only on the synthetic fixture and are advisory evidence; no load.

## Failure behavior

| Reason code | FailureClass / status | Verdict |
|---|---|---|
| Migration SQL error | none (measured), unit `COMPLETED` | `FINDING` (`DETERMINISTIC_DEFECT`) |
| `FIXTURE_STARTUP_FAILED` | none | `BLOCKED` |
| `DRIFT_UNTESTABLE` | none | `NOT_TESTED` |
| `FIXTURE_GENERATION_UNSUPPORTED` (a table) | none | `NOT_TESTED` (that table) |
| `RUN_BUDGET_EXHAUSTED` (scenario not started) | none | `INCONCLUSIVE` |
| `UNSUPPORTED_DATABASE` / `UNSUPPORTED_ORM` | none | `UNSUPPORTED` |
| `NON_DISPOSABLE_DATABASE_REFERENCE` (FLAG) | observation | no verdict alone; connection refused by design |
| Kill-switch, cancel or timeout mid-migration | `KILLED` / `CANCELLED` / `TIMEOUT` (F07 reason from `KillSwitchState`) | Guest destroyed; no `MIGRATION_RESULT`; coverage shows `NOT_RUN`; no verdict; partial state not published (invariant 7) |
| Migration file with a backslash meta-command | `SQL_META_COMMAND_REFUSED` | none | `NOT_TESTED` |
| Guest or provider fault | `TRANSIENT_INFRASTRUCTURE` | `BLOCKED`, no auto-retry after customer step started (FR-054) |

## Safety

Migrations are customer SQL and execute only in the Guest (FR-035). The Postgres instance has no network
listener beyond Guest loopback or unix socket; the P3/P4 network cut applies. Logs are untrusted, byte-capped
and redacted. No customer secret reaches the Guest (FR-045).

## Idempotency

Run identity is `H(executionUnitId, attempt)`; the fixture is created fresh per run and destroyed with the
Guest. Scenario evidence keys derive from `(executionUnitId, scenario, migrationId)` as the `naturalKey` of the `evidence-write` claim
(`{scanPlanId}:{executionUnitId}:{attempt}:MIGRATION_RESULT:{scenario}:{migrationId}`). Reinterpreting
committed evidence is deterministic. No cross-attempt retry once a migration has started.

## Consumers

`coverage-contract.md` (`migrationsExercised`), `source-reverify-contract.md` (migration failure),
SPEC 013 (query-plan evidence only), SPEC 014 (input only).

## Non-negotiable boundary rules

1. Migrations MUST NEVER run against production, staging or any non-disposable database.
2. Customer connection strings MUST NEVER be used or echoed.
3. A partial or stopped migration MUST NEVER be reported as an applied or completed migration.
4. Destructive operations MUST NEVER occur outside the in-Guest fixture.
5. Fixture data MUST be synthetic, seeded and bounded; production data is never copied.
6. Drift MUST be computed by the Fahes-owned comparator, never by the Prisma engine.
7. Missing prerequisites MUST yield `NOT_TESTED`/`UNSUPPORTED`/`BLOCKED`, never `PASS`.
