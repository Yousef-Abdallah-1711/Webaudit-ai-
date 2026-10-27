# Contract: Command Policy (Command Templates)

Per FR-070 through FR-072 and FR-076 (with FR-065, FR-073, FR-085, FR-087, FR-152). Reason codes only from the registry in `source-evidence-contract.md`. The only way a command reaches a Guest.
Consumers: untrusted-execution-contract (command plan), dependency-installation, build-typecheck, execution-fixture,
the E12 detection step (script recognition), the plan resolver for REVERIFY parameter re-validation.

## Signature (shape, not final TypeScript)

```text
CommandTemplate = {
  templateId, version(semver), toolchainKind, argv: ArgToken[],     // ArgToken = literal | {param: name}
  params: { name: { source: MANIFEST_PATH|DETECTED_CONFIG|ENUM, pattern|enum, maxLen }[] },
  cwdPolicy: WORKSPACE_ROOT | WORKSPACE_SUBDIR(validated),
  envPolicy: { allow[], synthetic{}, fixed{TZ:"UTC", LANG:"C.UTF-8", LC_ALL:"C.UTF-8", CI:"1"} },
  networkPolicy: NONE | LOCKFILE_PROXY, limits{wallMs,cpu,memMiB,scratchMiB,pids,outputBytes},
  outputParser: ParserId, artifactPolicy{kinds[],maxBytes}, rerunSafe: boolean, requiresImage{...} }
Step = { templateId, templateVersion, params: Record<string,string> }     // command plan entry
recognizeScripts(manifest) -> { scriptName, templateId|UNSUPPORTED_COMMAND, matchedPattern }[]
```

## Inputs

Static `package.json` scripts, detected toolchain/config evidence, snapshot manifest (paths and sizes), workspace path,
fixture spec. Never raw customer command strings.

## Outputs

A validated ordered `commandPlan` (template ids + parameter values) bound at lifecycle phase 2 from the verified manifest and recorded as `EXECUTION_STEP_RESULT` with `stepKind: "PLAN"` (the unit `configuration` carries only `requestedStepKinds`); a
`recognizeScripts` observation set (`TOOL_DIAGNOSTIC`/`SOURCE_MANIFEST` section) listing each script and its decision.

## Ownership

Templates are versioned code-level data in source control (FR-116), reviewed like code, owned by the platform team.
Customer repositories own only the data that parameters may be drawn from.

## Invariants

1. Argument vector only. No shell, no string evaluation, no glob expansion, no `sh -c`, no `npx`/`pnpm dlx`/`yarn dlx`
   resolution of arbitrary packages, and no interpreter that itself interprets customer text as commands (so `psql -f` over customer SQL is NOT used: its backslash meta-commands such as `!` run shell commands), in any trusted process or the Guest (FR-072). The Guest agent execs argv directly. Customer SQL is parsed only by the PostgreSQL server through the Fahes applier.
2. Every parameter is validated against the snapshot manifest or detected config: path params must be a normalized,
   workspace-relative, existing file/dir in the manifest, no `..`, no leading `-`, no NUL/newline, `<= 512` chars; enum
   params from the template's closed list. Failure is `TEMPLATE_PARAMETER_INVALID` and the step never starts.
3. Repository scripts are never executed by name (FR-071). They are read statically and matched to the table below.
4. Environment: only `envPolicy.allow` plus synthetic non-secret values chosen by the platform; `TZ=UTC`, fixed locale;
   no inherited environment; no real credential; `DATABASE_URL`-style values point only at the in-Guest fixture (FR-096).
5. Customer-supplied commands and customer-selected template parameters beyond manifest-derived ones are unsupported v1 (provisional).
6. Each template declares its structured-output parser; a result that cannot be parsed is `RUNNER_OUTPUT_UNPARSEABLE`, never PASS.
7. `rerunSafe` is true only for a `test.vitest`, `test.jest` or `test.nodetest` Step that starts NO fixtures (a fixture-less
   unit-test Step). Every integration Step, even one with a resettable fixture (`TRUNCATE_RESEED`/`RESTORE_TEMPLATE`), is
   `rerunSafe: false` and is never rerun in v1 (FR-086); false for install, build, db, backend and Fahes-tool templates.
8. A template version change changes `templateVersion` in evidence; fingerprints exclude tool versions (D21).
9. Snapshot-update and watch behavior is closed off by the template allowlist: no test template accepts `-u`, `--update`,
   `--updateSnapshot`, `--ci=false`, `--watch` or any flag-bearing parameter; argv shapes are fixed, so a snapshot test can
   never silently rewrite its expectations (`--ci` is always set for Jest; Vitest runs with `run`).
10. Tool provenance: where each executable comes from is part of the template. (a) From the signed Execution Image:
    Node (22 and 24 only; Node 20 is end-of-life), the package managers (FR-065), PostgreSQL 16 (server and `libpq` only; `psql` is NOT used on customer SQL), the baseline ESLint binary and the Fahes-authored in-Guest
    tools below (including the migration applier `db.apply.sql`). (b) From the customer's own frozen install (lockfile-pinned, executed by its resolved path under
    `node_modules/.bin`, never through `npx`/`dlx`): `tsc`, `vitest`, `jest`, `next`, `vite`, `nuxt` and a repository's
    own ESLint. Their versions are recorded per Step (`toolVersions`) and their drift is flagged, never fingerprinted.
    `UNSUPPORTED_VERSION` for a runner or framework means the lockfile-resolved major is outside the template's supported
    range (the image catalog `runners` lists supported majors, not binaries).
11. Baseline lint configuration: a Fahes-owned baseline ESLint config shipped in the image is used ONLY when the
    repository has no lint configuration. A repository's configuration, when present, is always run in the Guest (its
    plugins and executable config only after P1, network cut); the baseline is never merged into it. A repository with
    neither a config nor a runnable baseline target yields no lint Step (recorded `NOT_TESTED` evidence, not silence).

## Initial template catalog

| templateId | Toolchain | Argv shape | Allowed params | Net | Limits (wall) | Parser | rerunSafe |
|------------|-----------|-----------|----------------|-----|---------------|--------|-----------|
| `node.install.npm` | npm (image-pinned) | `npm ci --ignore-scripts --no-audit --no-fund` | none | LOCKFILE_PROXY | 10 min, 1 GiB dl | exit + log | no |
| `node.install.pnpm` | pnpm | `pnpm install --frozen-lockfile --ignore-scripts --ignore-pnpmfile` | none | LOCKFILE_PROXY | 10 min | exit + log | no |
| `node.install.yarn` | yarn classic/berry | `yarn install --frozen-lockfile --ignore-scripts` (classic v1) / `yarn install --immutable --mode=skip-build` with `YARN_ENABLE_SCRIPTS=false` (berry; berry execution is not Tier 1 so this variant is analysis-only) | `flavor` enum | LOCKFILE_PROXY | 10 min | exit + log | no |
| `ts.typecheck.tsc` | tsc (workspace pin) | `tsc --noEmit --pretty false -p <tsconfig>` | `tsconfig` manifest path | NONE | 5 min | tsc diagnostics | no |
| `lint.eslint` (Guest only) | eslint (repo's, or the image baseline when the repo has no lint config, invariant 11) | `eslint -f json --no-error-on-unmatched-pattern [--config <baseline>] <target>...`; `--config` is added only by the platform for the baseline | `target` manifest paths | NONE | 5 min | eslint JSON | no |
| `build.tsc` | tsc | `tsc -p <tsconfig> --pretty false` | `tsconfig` | NONE | 10 min | tsc diagnostics | no |
| `build.next` | next | `next build` (telemetry off) | none | NONE | 10 min | log + exit | no |
| `build.vite` | vite | `vite build` | none | NONE | 10 min | log + exit | no |
| `build.nuxt` | nuxt | `nuxt build` | none | NONE | 10 min | log + exit | no |
| `test.vitest` | vitest | `vitest run --reporter=json --sequence.seed=<seed>` plus, when `coverage != off`, `--coverage --coverage.provider=<coverage>` | `files` manifest paths, `seed` int, `coverage` enum `off\|v8\|istanbul` | NONE | 10 min | vitest JSON | yes (only when it starts no fixture) |
| `test.jest` | jest | `jest --json --ci --runInBand` plus, when `coverage != off`, `--coverage --coverageProvider=<coverage>` | `files`, `seed` where supported, `coverage` enum `off\|v8\|istanbul` | NONE | 10 min | jest JSON | yes (only when it starts no fixture) |
| `test.nodetest` | node | `node --test --test-reporter=tap <files>` plus, when `coverage != off`, `--experimental-test-coverage` | `files`, `coverage` enum `off\|v8` | NONE | 10 min | TAP | yes (only when it starts no fixture) |
| `db.postgres.start` | postgres 16 | image-baked server on guest socket/loopback, tmpfs datadir | `fixtureSpecId` | NONE | 60 s | health probe | no |
| `db.migrate.sql` | `db.apply.sql` (Fahes-authored in-Guest applier over `libpq`) | `db.apply.sql --file <migration>` in order; each file is sent as ONE simple-query request (Prisma-like atomicity) as a non-superuser owner role; files containing a line that starts with a backslash meta-command (`!`, `o`, `i`, `connect`, ...) are refused statically with `SQL_META_COMMAND_REFUSED`; result carries `appliedVia: "fahes-applier"` | `migrationFiles` manifest paths | NONE | 10 min | SQLSTATE parser | no |
| `db.schema.introspect` | psql/catalog | fixed `pg_catalog` queries | none | NONE | 2 min | catalog JSON | yes |
| `backend.start.recognized` | node | recognized start pattern (below) | `entry` manifest path, `port` | NONE (loopback) | 2 min ready | readiness probe | no |
| `backend.probe.schema` (Fahes tool) | Fahes in-Guest probe runner | `fahes-backend-probe --plan <planFile>`; loopback only, budget 500 requests | `planRef` (platform-generated plan file, not customer text) | NONE (loopback) | within run envelope | probe-runner JSON | no |
| `db.seed.synthetic` (Fahes tool) | Fahes in-Guest seeder | `fahes-db-seed --schema <snapshotRef> --seed <int> --max-rows 1000` | `seed` int, `maxRows` (default and cap 1,000 per table) | NONE | 5 min | seeder JSON | no |
| `db.integrity.probes` (Fahes tool) | Fahes in-Guest probes | `fahes-db-integrity --fixture <fixtureId>` | `fixtureId` | NONE | 5 min | probe JSON | no |
| `db.drift.compare` (Fahes tool) | Fahes in-Guest comparator | `fahes-db-drift --expected <schemaSnapshotRef> --actual <catalogJson>` | none | NONE | 2 min | diff JSON | no |

Coverage is a PARAMETER of the test templates (`coverage`: `off|v8|istanbul`), not a set of separate templates. A runner or
version that cannot honor the requested provider yields `UNSUPPORTED_RUNNER`; no coverage flag runs and no metric is
reported (`COVERAGE_NOT_INSTRUMENTED`). Plan step kinds map to templates: `db.migrate` -> `db.migrate.sql`,
`db.integrity.probe` -> `db.integrity.probes`, `contract.probe` -> `backend.probe.schema`, `db.seed` -> `db.seed.synthetic`.

Fahes-authored in-Guest tools (`backend.probe.schema`, `db.seed.synthetic`, `db.integrity.probes`, `db.drift.compare`, `db.apply.sql`) ship
inside the signed Execution Image and their versions are listed in the image catalog `toolVersions`. Provenance: built by
Fahes CI, digest-pinned in the image, never fetched, installed or compiled at run time, and never taken from the customer's
repository. A tool version change changes `templateVersion` and is recorded in evidence, never fingerprinted.

Build templates (`build.*`) run only when the framework is detected; `next`/`vite`/`nuxt` config files are executable
(`EXECUTABLE_CONFIG_PRESENT`) and run only in the Guest after P3 network cut.

## package.json script recognition (static, FR-071)

| Pattern (normalized, anchored whole-string match; no `&&`, `;`, `|`, `$()`, backticks, redirects, env prefixes) | Template |
|------|----------|
| `tsc --noEmit`, `tsc -p <path> --noEmit` | `ts.typecheck.tsc` |
| `tsc`, `tsc -p <path>` | `build.tsc` |
| `next build`, `vite build`, `nuxt build` (nuxi build) | `build.next`/`build.vite`/`build.nuxt` |
| `vitest`, `vitest run`, `vitest --run` | `test.vitest` |
| `jest`, `jest --ci` | `test.jest` |
| `node --test`, `node --test <paths>` | `test.nodetest` |
| `eslint .`, `eslint <paths>`, `eslint --ext ...` | `lint.eslint` |
| `node <entry>`, `node dist/<entry>`, `nest start`, `next start`, `fastify start` | `backend.start.recognized` (only with a detected framework) |
| `prisma migrate deploy`, `prisma generate` (generation needs lifecycle scripts and a downloaded engine, so a missing generated client is classified `GENERATED_CODE_MISSING`, `NOT_TESTED`, never a customer defect), `prisma db push`, any `&&` chain, `curl`, `sh`, `rm`, shell builtins, unknown binaries | `UNSUPPORTED_COMMAND`; runs nothing |

Pre/post hooks (`prebuild`, `posttest`, `postinstall`, `prepare`) are never run and are recorded as observations.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|-----------|-------------|--------------|---------|
| Script matches no pattern | `UNSUPPORTED_COMMAND` | none | `UNSUPPORTED` (never PASS) |
| Parameter fails validation | `TEMPLATE_PARAMETER_INVALID` | `INVALID_CONFIGURATION` | `BLOCKED` |
| Required toolchain not in image | `UNSUPPORTED_VERSION` | none | `UNSUPPORTED` |
| Required env var cannot be synthesized | `MISSING_ENV_VAR` | none | `NOT_TESTED` (environment limitation) |
| Required input file absent from snapshot | `MISSING_BUILD_INPUT` | none | `NOT_TESTED` |
| Output unparseable (structured output missing or malformed, exit status irrelevant) | `RUNNER_OUTPUT_UNPARSEABLE` | none (`ENGINE_DEFECT` only if the parser itself threw; the check is then `BLOCKED`) | `INCONCLUSIVE` |
| Run envelope exhausted before the Step starts | `RUN_BUDGET_EXHAUSTED` | none | `INCONCLUSIVE` |

## Safety

Templates cannot widen network or limits at plan time; only a grant-level policy flag defined by a future additive
spec could. Reading `package.json` is parsing, never evaluation (E12 child, scrubbed env).

## Idempotency

Plan construction is a pure function of snapshot digest + detection evidence + template catalog version; the same inputs
yield the same `commandPlan` and the same step idempotency keys `H(executionUnitId, attempt, stepIndex)`.

## Consumers

untrusted-execution-contract, dependency-installation-contract, build-typecheck-contract, execution-fixture-contract.

## Non-negotiable boundary rules

1. No customer-controlled string is ever interpreted by a shell, in a trusted process or in the Guest.
2. A script is never "recognized" by prefix or fuzzy match; recognition is exact-pattern or `UNSUPPORTED_COMMAND`.
3. Adding a template or pattern requires a versioned code change and its own hostile-fixture case; zero edits to dispatch.
4. Parameter values never come from environment, AI output, or customer-provided free text.
5. No template may take a URL, registry, git ref, or host as a parameter.
