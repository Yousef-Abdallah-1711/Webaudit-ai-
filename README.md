# WebAudit AI

WebAudit AI audits a website, uploaded archive, or connected repository across performance,
security, design, testing, and search visibility. It runs deterministic checks first, uses AI only
for redacted interpretation, records the results, and verifies fixes with narrow re-checks before an
issue can turn green.

For agent context, start here:

1. [AGENTS.md](AGENTS.md) for project rules shared by Claude Code, Codex, and other coding agents.
2. [PROJECT_MAP.md](PROJECT_MAP.md) for the compact source and documentation map.
3. [PROGRESS.md](PROGRESS.md) and the relevant `specs/*/tasks.md` only when you need current task
   state.

Do not treat this README as the live implementation scoreboard. The project changes often; the map
and targeted progress sections are the safer starting points.

## Layout

| Path | Purpose |
| --- | --- |
| `apps/web/` | Next.js frontend on port 3000 |
| `apps/api/` | Express API on port 3001, Prisma schema, service layer and route mounts |
| `apps/worker/` | BullMQ consumers for scans, re-verification and readiness |
| `apps/probe-pool/` | Chromium provisioning library for browser-backed checks |
| `apps/sandbox-runner/` | Separate sandbox host for untrusted installed capability code |
| `packages/` | Shared contracts, config, capability SDK, vendored capabilities, AI, redaction, safe-net, archive and scoring code |
| `specs/` | Spec Kit requirements, plans, tasks, contracts and focused follow-up specs |
| `docs/` | Runbooks, reviews, agent domain notes and implementation history |
| `design-system/`, `design/` | Read-only design reference and screen map |
| `infrastructure/` | Local Docker services and deployment notes |

## Local Setup

Requires Node 22 or newer, pnpm 9 or newer, and Docker.

```bash
pnpm install
cp .env.example .env
pnpm services:up
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

Local service ports are intentionally non-default: PostgreSQL uses `5442`, Redis uses `6389`.
Use `.env.example` and `infrastructure/docker-compose.yml` as the source for local connection
names and ports. Do not commit real secrets or generated environment values.

## Verification

Use targeted checks for the area you changed. Common entry points:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:adverse
pnpm test:visual
pnpm --filter @webaudit/web test:e2e
```

Read [PROJECT_MAP.md](PROJECT_MAP.md) before choosing a test path. DB-backed suites need the test
database/Redis setup described in the relevant test docs, and automated tests should use fixture AI
mode rather than live provider spend.

## Governing Documents

The highest project authority is [.specify/memory/constitution.md](.specify/memory/constitution.md).
For requirements, read only the relevant sections of the baseline spec and focused feature specs:

- `specs/001-webaudit-mvp-baseline/`
- `specs/002-fix-cancel-timeout-refunds/`
- `specs/003-fix-browser-pool-ssrf/`
- `specs/004-load-testing-harness/`

Use [PROJECT_MAP.md](PROJECT_MAP.md) to find the source files, tests, and documentation for the
current domain without loading the entire repository at startup.

<!-- gen:docs-map:start hash=da74179f9fdb -->
| Document | Contents |
| --- | --- |
| [Endpoints](docs/reference/endpoints.md) | every route, its auth and source |
| [Middleware](docs/reference/middleware.md) | the request chain in order |
| [Data model](docs/reference/data-model.md) | models, fields, relations |
| [Pages](docs/reference/pages.md) | routes and what renders them |
| [Components](docs/reference/components.md) | component inventory and props |
| [Environment](docs/reference/env-vars.md) | configuration keys |
| [Architecture](docs/architecture/overview.md) | how the system fits together |
| [Features](docs/features/) | per-feature walkthroughs |
<!-- gen:docs-map:end -->

<!-- gen:docs-summary:start hash=cdebdd61f528 -->
73 endpoints, 28 pages, 68 components, 45 models, 28 features.
<!-- gen:docs-summary:end -->
