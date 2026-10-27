# Contract: Database Schema Static Analysis

Per FR-100 through FR-103, FR-108, FR-109 (plus FR-018, FR-101, FR-117). Consumers: Database domain
(`ModuleType DATABASE`) Source Checks, `migration-testing-contract.md`, `backend-contract-testing-contract.md`,
`coverage-contract.md`, `source-reverify-contract.md`. Reason codes only from the registry owned by
`source-evidence-contract.md`. Check ids use the prefix `db.*` (R2).

## Signature (shape, not final TypeScript)

```text
analyzeSchema(snapshot, workspace) -> SchemaSnapshot                // SOURCE_STATIC, E12 observer, no DB, no engine binary
SchemaSnapshot = { dialect: "postgresql", ecosystem: "prisma"|"sql-migrations", relationMode: "foreignKeys"|"prisma",
  models/tables[], columns[], constraints[], indexes[], enums[], relations[],
  migrations: { id, order, path, statementsDigest }[], declaredIntegrity?: FahesDatabaseConfig,
  querySites: { path, symbol, kind }[] }
FahesDatabaseConfig = { integrityElsewhere: { object: qualifiedName, reason }[] }   // declarative fahes.database.json
```

## Inputs

- Snapshot files: `schema.prisma` parsed with the wasm schema parser (no Prisma query/migration engine);
  `*.sql` migrations parsed with a PostgreSQL SQL parser; optional declarative `fahes.database.json`
  (JSON only, never evaluated as code, FR-019).
- Application code evidence (`SOURCE_SURFACE` `dbAccessSites`) for contradiction checks and provable
  query patterns (Prisma client calls).
- Ecosystems: Prisma + SQL migrations on PostgreSQL (Tier 1). Alembic and Django migrations are detect-only.

## Outputs

- `SCHEMA_SNAPSHOT` Evidence (redacted; excerpts only) and a schema diagram/summary Artifact (Mermaid or
  SVG text plus JSON summary) via `createArtifact`, never raw customer data (FR-109).
- `SOURCE_CHECK_RESULT` rows and Findings. Schema-object fingerprint `[objectKind, qualifiedName, checkId]`.
- `SCHEMA_SNAPSHOT` payload essentials: `dialect`, `ecosystem`, `parserId`, `parserVersion`, `relationMode`,
  object lists with `{objectKind, qualifiedName, sourceLocation}`, `migrationOrder`, `declaredIntegrityRef?`,
  `counts` per object kind, `unparsedFiles[]` (never silently skipped), `snapshotDigest`.

## Ownership

E12 owns parsing and emits `SCHEMA_SNAPSHOT`. The Database domain owns the check families and applicability
rules. No database is contacted; migrations and drift are owned by `migration-testing-contract.md`.

## Invariants

1. Check families (FR-102): relationships, foreign keys, unique constraints, nullability, defaults, indexes,
   cascading behavior (`onDelete`, `onUpdate`), referential integrity, type compatibility (FK column types
   vs referenced), naming consistency, migration history and ordering, and statically provable query
   patterns (unbounded `findMany`, provable N+1 in a loop). Each is a registered Source Check with
   version, rule class and severity cap (FR-023).
2. Scope limit: any database other than PostgreSQL yields `UNSUPPORTED_DATABASE`; any ORM other than Prisma
   (schema-level) or raw SQL migrations yields `UNSUPPORTED_ORM`. Both are `UNSUPPORTED`, never `PASS`.
   No claim of complete support for any ORM or dialect (FR-101).
3. Foreign-key applicability rule (FR-103). A "missing foreign key" check never reports a universal defect. Outcomes are
   exactly these three, decided by the evidence available:
   - `relationMode = prisma` declared, or an `integrityElsewhere` marker for the object in `fahes.database.json` (the one
     marker name; `research.md` R20 conforms): `NOT_TESTED`, reason `INTEGRITY_ENFORCED_ELSEWHERE` (declared integrity-elsewhere,
     not a defect).
   - Application code assumes referential integrity (for example relation includes, cascade reliance) while the schema omits
     the constraint and no marker or `relationMode = prisma` exists: schema contradicts the app-code assumption, `FINDING`
     `DETERMINISTIC_DEFECT` carrying both evidences (schema location and code location).
   - Applicability undeclared and unprovable (no `relationMode = prisma`, no marker, no contradiction): `INCONCLUSIVE`, reason
     `FK_APPLICABILITY_UNKNOWN`. Never `NOT_TESTED` for this case and never a Finding. (`RULE_APPLICABILITY_UNPROVEN` is the
     generic rules-engine code and is not used for FK applicability; quickstart fixtures MUST expect `INTEGRITY_ENFORCED_ELSEWHERE`
     for `relationMode = prisma`.)
4. Unparseable schema or migration files are recorded per file as `PARSE_FAILED` (FR-021); the dependent
   check is `INCONCLUSIVE`; unparsed files are counted as not analyzed in coverage.
5. Declared connection strings in source (for example `DATABASE_URL` literals) are never used or echoed;
   they yield the FLAG `NON_DISPOSABLE_DATABASE_REFERENCE` (an observation, never a verdict, never used to connect) with path only (FR-100).
6. Performance boundary (FR-108): static indicators only (missing index on FK/filter column where provable,
   unbounded query, provable N+1) plus, via the migration contract, `EXPLAIN` plans on synthetic fixtures.
   No load, capacity, production profiling or long-running monitoring (SPEC 013).
7. Redaction and excerpt rules apply to schema text and SQL (FR-117/118); enum values and default
   expressions that look like secrets are redacted.
8. Support decision is per workspace and recorded with evidence paths and confidence; low confidence
   degrades dependent checks to `INCONCLUSIVE` (FR-016).
9. Output ordering and the diagram are deterministic (sorted object names) so reanalysis is byte-stable.

## Failure behavior

| Reason code | FailureClass / status | Verdict |
|---|---|---|
| `UNSUPPORTED_DATABASE` | none | `UNSUPPORTED` |
| `UNSUPPORTED_ORM` | none | `UNSUPPORTED` |
| `INTEGRITY_ENFORCED_ELSEWHERE` | none | `NOT_TESTED` |
| `FK_APPLICABILITY_UNKNOWN` | none | `INCONCLUSIVE` |
| schema contradicts an app-code integrity assumption | none (measured) | `FINDING` (`DETERMINISTIC_DEFECT`) |
| `PARSE_FAILED` (observation) | none | `INCONCLUSIVE` for dependent checks |
| `NON_DISPOSABLE_DATABASE_REFERENCE` (FLAG) | observation only | no verdict by itself; DB checks proceed on the in-Guest fixture |
| Parser crash or timeout in E12 child | `ENGINE_DEFECT` / `TIMEOUT` | `BLOCKED` |
| Analysis budget exhausted | none | `INCONCLUSIVE`, partial, never complete (FR-027) |

## Safety

Parsing only; nothing from the customer executes. The wasm parser runs in the E12 forked child with
scrubbed environment, read-only snapshot, no network and a kill deadline (FR-026). `fahes.database.json`
is data and cannot widen scope, suppress checks outside its declared object list, or inject commands.

## Idempotency

Idempotent over `(snapshotDigest, parserVersion, ruleVersion)`; same input yields identical
`SCHEMA_SNAPSHOT` and fingerprints. Check execution claimed via `IdempotentClaim` scope
`source-check-execution` (claimKey begins with `scanPlanId`, FR-135); `SCHEMA_SNAPSHOT` writes claim `evidence-write`
(`{scanPlanId}:{executionUnitId}:{attempt}:SCHEMA_SNAPSHOT:{naturalKey}`). Schema parsing needs no Prisma engine of any kind.

## Consumers

Migration testing (expected objects for the drift comparator), backend contract testing (`dbAccessSites`),
coverage (`schemaObjectsAnalyzed`), reverify (static schema issue), SPEC 013 (indicators only).

## Non-negotiable boundary rules

1. Missing foreign keys MUST NEVER be reported as a universal defect without applicability evidence.
2. No database connection MUST be made by static analysis; no customer connection string is ever used.
3. Unsupported databases or ORMs MUST NEVER be reported as `PASS`.
4. No load, capacity or production-profiling claim MUST be produced here.
5. Raw customer data and unredacted SQL secrets MUST NEVER enter evidence or artifacts.
6. Declarative config (`fahes.database.json`) MUST NEVER be executed or treated as authorization.
