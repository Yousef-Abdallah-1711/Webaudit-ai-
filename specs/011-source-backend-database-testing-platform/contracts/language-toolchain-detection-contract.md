# Contract: Language and Toolchain Detection

Per FR-013, FR-014, FR-015, FR-016, FR-034, FR-064, FR-136, FR-149, FR-152. Consumers: E12 (adapter selection), Source Checks (`supportTier` precondition), Execution Supervisor (image and template selection), `scanSourceCoverageSummary`, SPEC 012/013/014.

## Signature (shape, not final TypeScript)

```text
detectToolchain(snapshotRef: { artifactId, contentDigest }) -> ToolchainDetection
ToolchainDetection = { matrixVersion, workspaces: WorkspaceProfile[], confidence, evidenceFiles: string[] }
WorkspaceProfile   = { workspacePath, languages[], frameworks[], packageManager?: { name, version?, lockfile?, lockfileVersion? },
                       declaredRuntime?: { source, range }, testRunners[], dbEcosystem?, supportDecisions: SupportDecision[], confidence }
SupportDecision    = { capability, tier: 1|2|3, verdict: "SUPPORTED" | "UNSUPPORTED" | "INCONCLUSIVE", reasonCode?, toolchainSubstitution? }
```

Pure and static: reads only the snapshot manifest and parsed declarative files; executes nothing, spawns nothing, evaluates no config.

## Inputs

1. A verified Source Snapshot (`source-snapshot-contract.md`).
2. The code-level capability matrix (versioned, source-controlled) and the Execution Image catalog identities (FR-047) for version-compatibility checks.

## Outputs

1. One `ToolchainDetection` embedded in `SOURCE_MANIFEST` (`toolchainEvidenceRef` points to it), with the file paths that justified each decision (FR-016).
2. Per (workspace, capability) support decision with matrix version.

## Ownership

Contexts A and B (shared). Owning spec: 011. The matrix is code-level data, never persisted (FR-116).

## Invariants

1. Detection is per workspace partition, never root-only (FR-013). Workspace boundaries come from: `package.json` `workspaces`, `pnpm-workspace.yaml`, `lerna.json`, `nx.json`, `turbo.json`, `rush.json`, and each nested `package.json` with its own lockfile or name. A workspace path is workspace-relative, `/`-separated, `.` for root.
2. Package manager: lockfile first (`package-lock.json` npm; `pnpm-lock.yaml` pnpm; `yarn.lock` yarn classic when `# yarn lockfile v1`, berry when `__metadata`), then `packageManager` field; a conflict between them lowers confidence and is recorded.
3. Declared runtime version: `engines.node`, `.nvmrc`, `.node-version`, `.tool-versions`; first match by that order wins, all recorded.
4. Framework detection is by dependency name plus structural marker (for example `next` plus `app/` or `pages/`); a dependency alone is a weak signal and yields `confidence: LOW`.
5. Capability tiers (code-level matrix, FR-014, D7):
   - Tier 1 (analysis plus execution): TypeScript/JavaScript on Node LTS >= 22 (Node 20 is end-of-life; execution images carry Node 22 and 24; a project declaring an older Node yields `UNSUPPORTED_VERSION`); execution for npm (lockfileVersion 3), pnpm (lockfileVersion 9.0) and yarn classic v1 — the formats verified against real lockfiles; other lockfile versions are `UNSUPPORTED_VERSION` for execution (`dependency-installation-contract.md`); yarn berry (node-modules linker, no `yarnPath`, no plugins) is Tier 1 for static analysis only and `UNSUPPORTED` for execution in v1 because its checksum covers Yarn's repacked archive, not the registry tarball (exact-URL and integrity enforcement are impossible, `dependency-installation-contract.md`); frameworks React, Next.js, Vue, Nuxt, Express, Fastify, NestJS, Koa, Hono; runners Vitest, Jest, `node:test`; database Prisma schema plus SQL migrations on PostgreSQL 16.
   - Tier 2 (static analysis only, no execution): Python (parse, imports, subset of rules), pytest discovery only, Alembic and Django migration detection only.
   - Tier 3 (detect and report only): everything else.
6. Anything unsupported or unknown yields verdict `UNSUPPORTED`, never `PASS` (FR-014, FR-113).
7. Version compatibility: a declared Node, package-manager or runner version outside the image catalog yields `UNSUPPORTED_VERSION`. Substitution of a nearby supported version is allowed only when explicit: `toolchainSubstitution: { declared, used, reasonCode: "TOOLCHAIN_SUBSTITUTED" }` appears in evidence and coverage; it is never silent (FR-015). Substitution never crosses a Node major boundary.
8. Confidence is `HIGH | MEDIUM | LOW`. `LOW` degrades every dependent check to `INCONCLUSIVE` with `LOW_DETECTION_CONFIDENCE` (FR-016).
9. Workspace selection (FR-152, provisional, config): the executed workspaces are the scan configuration's `executionWorkspaces` list (at most 4, default `["."]`), fixed at plan resolution BEFORE detection; one SOURCE_EXECUTION unit each, chained by plan-level `ExecutionDependency` edges (no data dependency) so at most one runs at a time (nothing relies on a refused lease being redelivered); detection still profiles every partition, validates the selection (`WORKSPACE_NOT_FOUND`, `BLOCKED`, for a selected path that is not a Tier-1 workspace) and marks detected Tier-1 workspaces that were not selected `WORKSPACE_CAP_EXCEEDED` (`NOT_TESTED`). Static analysis is unaffected.
10. Toolchain flags: `TOOLCHAIN_SUBSTITUTED` (FLAG) records a declared-versus-used substitution; `TOOLCHAIN_CHANGED` (FLAG) records that toolchain/image identity differs from prior evidence of the same tenant and target (prior-evidence lookups never cross tenants or targets, FR-149). Both are annotations: they never set a verdict and never become Findings. `DISCOVERY_CAPPED` (test-file discovery cap of 5,000 hit) is emitted by test discovery, not detection, and degrades test checks to `INCONCLUSIVE`.
11. Detection is deterministic: same snapshot digest plus same matrix version gives identical output.

## Failure behavior

| Condition | Reason code | FailureClass | Verdict |
|---|---|---|---|
| Language not in Tier 1/2 | `UNSUPPORTED_LANGUAGE` | none | `UNSUPPORTED` |
| Framework detected but not supported | `UNSUPPORTED_FRAMEWORK` | none | `UNSUPPORTED` |
| Declared version outside catalog | `UNSUPPORTED_VERSION` | none | `UNSUPPORTED` |
| Test runner not Vitest/Jest/`node:test` | `UNSUPPORTED_RUNNER` | none | `UNSUPPORTED` |
| Database or ORM outside Prisma/SQL on Postgres | `UNSUPPORTED_DATABASE`, `UNSUPPORTED_ORM` | none | `UNSUPPORTED` |
| No lockfile in an execution-tier workspace | `NO_LOCKFILE` | none | `NOT_TESTED` for install and dependents |
| Conflicting or weak signals | `LOW_DETECTION_CONFIDENCE` | none | `INCONCLUSIVE` |
| More than 4 Tier-1 workspaces | `WORKSPACE_CAP_EXCEEDED` | none | `NOT_TESTED` for the extra partitions |
| Version substituted | `TOOLCHAIN_SUBSTITUTED` (FLAG) | none | annotation only; recorded in evidence and coverage |
| Toolchain differs from prior evidence | `TOOLCHAIN_CHANGED` (FLAG) | none | annotation only |
| Detector throws | (none; class only) | `ENGINE_DEFECT` | dependent checks `BLOCKED` |

## Safety

1. No file is executed or imported; `package.json` is parsed as JSON only; scripts are read, never run (FR-071).
2. Executable configs (for example `jest.config.js`, `vite.config.ts`, `.pnpmfile.cjs`) are recognized by filename only, not read for decisions beyond presence (`EXECUTABLE_CONFIG_PRESENT` is recorded by E12).
3. Output contains paths and enumerated tokens only, no file excerpts from credential-denylist files.

## Idempotency

Pure function of `(contentDigest, matrixVersion)`; recorded once under the acquisition claim; replay returns the same result. A matrix version bump yields a distinct result and is flagged as drift in coverage.

## Consumers

E12 (picks adapters, skips unsupported languages with `UNSUPPORTED_LANGUAGE`); `SourceCheckDefinition.supportTier`; Execution Supervisor (selects Execution Image, Command Templates); reverify (`UNVERIFIABLE`-style `INCONCLUSIVE` when support changed); coverage summary.

## Non-negotiable boundary rules

1. Detection MUST execute nothing and evaluate no configuration.
2. Unsupported or unknown MUST NEVER become `PASS`.
3. Tier membership comes only from the versioned matrix; no check or adapter may hard-code a tier.
4. A toolchain substitution MUST be explicit in evidence; silent substitution is forbidden.
5. A low-confidence detection MUST degrade dependent checks to `INCONCLUSIVE`, never to `PASS` or `FINDING`.
6. Nothing outside Tier 1 is promised for execution; Python execution is not v1.
7. Detection reason codes MUST be drawn from `source-evidence-contract.md`'s registry.
