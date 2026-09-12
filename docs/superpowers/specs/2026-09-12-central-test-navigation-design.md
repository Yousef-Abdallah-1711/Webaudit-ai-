# Central Test Navigation Design

## Goal

Make WebAudit AI's distributed test suite discoverable from one project-level entry point without breaking package, application, database, Redis, Playwright, snapshot, or visual-reference boundaries.

## Current state

Executable tests are intentionally colocated with their owners: API, worker, web, sandbox-runner, probe-pool, and shared packages. Vitest discovers unit, adverse, and visual projects from `vitest.workspace.ts`; Playwright discovers browser E2E tests from `apps/web/tests/e2e/` through `apps/web/playwright.config.ts`; load tooling is in `load-testing/`. Root scripts run the Vitest projects, while the web package owns `test:e2e`.

## Decision

Create a root `tests/` directory as the canonical navigation, inventory, topology, and shared-support layer. Do not blindly relocate executable tests. Package- and application-local tests remain in place whenever they depend on local module resolution, snapshots, framework configuration, an application boot harness, or a restricted runtime boundary.

## Target layout

```text
tests/
  README.md
  inventory.md
  topology.md
  database-and-redis.md
  e2e-and-visual.md
  adverse-and-security.md
  load-testing.md
  fixtures/     # root-only shared fixtures, initially empty if none are safe to centralize
  helpers/      # root-only shared helpers, initially empty if none are safe to centralize
```

`docs/testing/` provides the longer architecture/reference material and `docs/architecture/testing.md` explains execution topology. `docs/reference/tests.md` remains extractor-owned.

## Ownership and execution

| Category | Executable location | Runner | Constraint |
| --- | --- | --- | --- |
| Unit/contract/integration | `apps/*/tests`, `packages/*/tests` | Vitest `unit` | Local imports and test helpers remain local. |
| Adverse/security | app/package `tests/adverse` | Vitest `adverse` | Shared DB/Redis tests run serially. |
| Visual | `apps/web/tests/visual` | Vitest `visual` | Uses the read-only design-system references. |
| Browser E2E | `apps/web/tests/e2e` | Playwright | Single worker; boots isolated services as required. |
| Load/capacity | `load-testing/` | dedicated scripts | Not part of the standard Vitest projects. |
| Manual | `apps/web/tests/manual` | operator checklist | Requires credentials/judgment and is not automated proof. |

## Documentation responsibilities

- `README.md`: concise human onboarding and links.
- `AGENTS.md`: authoritative engineering, safety, and verification rules.
- `CLAUDE.md` and `CODEX.md`: thin navigation adapters.
- `PROJECT_MAP.md`: compact targeted navigation from source to tests and documentation.
- `tests/README.md`: test command and topology entry point.
- `PROGRESS.md`: active work/handoffs only.

## Safety requirements

Automated AI uses `AI_MODE=fixtures`; DB-backed suites use `TEST_DATABASE_URL`; shared DB/Redis/queue work is serialized and never shares a live development worker. No migration may weaken discovery, remove an adverse guarantee, copy secrets, or change production behavior.

## Verification

Verify every documented path and command, Vitest project include, Playwright `testDir`, generated documentation ownership, Markdown links, and relevant targeted tests. Run `docs_check.py`, then typecheck/lint/format and relevant test projects subject to isolated infrastructure availability.

## Scope exclusions

This change does not move generated Prisma output, runtime workspaces, dependency output, showcase tests, or design-system references. It does not turn package-specific fixtures/helpers into global code without a verified consumer and import-boundary review.
