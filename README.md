# WebAudit AI

WebAudit AI audits websites, uploaded archives, and connected repositories across performance,
security, SEO, testing, and UI quality. It runs deterministic checks first, uses AI only for
optional redacted interpretation, persists findings and scores, and supports narrow fix
re-verification before an issue is considered resolved.

## Current Status

The repository contains the completed engineering work for the temporary production release
defined by the production-without-Paymob-or-AI master plan. Phases 0–12 are documented as complete
and have been exercised through real containerized deployment, smoke, reliability, security, and
browser workflows.

This release intentionally runs with:

- AI_MODE=disabled: deterministic audit results remain available without external AI provider
  keys; AI_MODE=fixtures remains test-only.
- Paymob absent: payment checkout and webhook paths fail closed rather than exposing a fake
  production payment flow.
- SMTP or Resend configured for production email: the API refuses to boot without a real email
  transport and sender configuration.

The software and infrastructure are ready for operator deployment. Public launch still requires
the external domain/TLS setup and a real outbound email credential/inbox delivery check described
in Remaining External Launch Requirements. These are deployment dependencies, not unfinished
application phases.

Authoritative release evidence is in:

- [Production-without-Paymob-or-AI master plan](docs/PRODUCTION-WITHOUT-EXTERNAL-AI-OR-PAYMOB-MASTER-PLAN.md)
- [Current-system discovery audit](docs/CURRENT-SYSTEM-PRODUCTION-WITHOUT-EXTERNAL-AI-OR-PAYMOB.md)
- [Production deployment runbook](infrastructure/deploy.md)
- [Project map](PROJECT_MAP.md)

## Architecture

The system is a TypeScript monorepo managed with pnpm and Turbo:

1. The Next.js web application collects targets, displays progress and reports, and exposes the
   customer and operator consoles.
2. The Express API validates requests, enforces authentication/authorization and billing gates,
   persists state through Prisma/PostgreSQL, and publishes BullMQ jobs through Redis.
3. The worker consumes scan, re-verification, readiness, maintenance, and cleanup jobs. It runs
   deterministic capabilities, records progress before publishing it, and optionally adds
   redacted AI interpretation.
4. The sandbox runner is a separate HTTP service for untrusted installed capability code. It has
   its own process and resource boundaries and does not receive application credentials.
5. Nginx is the production reverse proxy for the web app, API routes, health checks, and realtime
   WebSocket upgrades.

PostgreSQL is authoritative for users, scans, findings, credits, billing state, capabilities,
and audit records. Redis carries queues, locks, rate limits, and realtime notifications. R2/object
storage is used by the storage abstractions for staged archives and retained artifacts when
configured.

## Repository Structure

| Path | Responsibility |
| --- | --- |
| apps/web/ | Next.js frontend, port 3000 |
| apps/api/ | Express API, Prisma schema/migrations, port 3001 |
| apps/worker/ | BullMQ consumers and scan orchestration |
| apps/probe-pool/ | Chromium provisioning library; no deployable transport yet |
| apps/sandbox-runner/ | Isolated host for untrusted installed capabilities, port 3003 |
| packages/types/ | Shared domain types and events |
| packages/config/ | Plans, pricing, queues, cancellation, logging, and configuration |
| packages/capability-sdk/ | Capability contracts, manifests, discovery, and conformance |
| packages/capabilities-vendored/ | Locally shipped deterministic capability implementations |
| packages/ai-executor/ | Provider chains, disabled/fixture/live modes, pricing, and metering |
| packages/redaction/ | Secret detection and redacted prompt assembly |
| packages/safe-net/ | SSRF-safe fetches, DNS/socket checks, and browser proxying |
| packages/safe-archive/ | Archive path, ratio, and byte-limit guards |
| packages/scoring/ | Finding fingerprints, scores, and severity aggregation |
| infrastructure/ | Local services, production Compose, Nginx, and deployment runbooks |
| scripts/ | Seed, admin bootstrap, load, and ledger-integrity tooling |
| specs/ | Requirements, contracts, plans, and verification records |
| docs/ | Architecture, reviews, runbooks, and release evidence |

## Core Capabilities

- Audit intake from public URLs, repositories, and ZIP archives.
- Deterministic checks for performance, security, SEO, testing, and UI quality.
- Design-intent questionnaire for UI-focused audits.
- Persisted scan progress over WebSockets and durable BullMQ jobs.
- Credit lots, quotes, debit/refund integrity, plan entitlements, and audit-logged operator grants.
- Fix prompts and narrow re-verification with recurrence tracking.
- Readiness verdicts and report/export views.
- Operator views for users, plans, credits, capabilities, providers, queue state, and audit logs.
- Capability discovery and lifecycle controls, including isolated execution for untrusted uploads.
- Redaction, SSRF protection, archive guards, rate limits, secure cookies, and structured errors.

## Production Architecture

The production topology in infrastructure/docker-compose.production.yml contains only services
present in this repository:

    Internet
       │
       ▼
    Nginx :80/:443 (TLS volume, WebSocket upgrade)
       ├── Next.js web :3000
       └── Express API :3001 ── PostgreSQL :5432
                              └─ Redis/BullMQ :6379

    Worker ── Redis/BullMQ + PostgreSQL
       └── guarded outbound access to audit targets

    Sandbox runner ── API-controlled isolated execution boundary

The Compose file also defines an optional PgBouncer profile. PostgreSQL and Redis are not exposed
directly to the public host in the default topology. The worker has no inbound port; it receives
work from BullMQ and uses the dedicated egress network for target retrieval.

## Production Readiness

The completed release work covers architecture review, deterministic capabilities, authentication
and sessions, credits and entitlements, admin workflows, worker durability, capability registry
reconciliation, Docker images, production Compose, Nginx routing, migrations, first-admin bootstrap,
adverse/security tests, browser E2E journeys, load/reliability checks, worker outage recovery,
rollback rehearsal, and production smoke testing.

Important defects found and corrected during that work included missing operational scripts and
vendored capability data in the API image, secure-cookie behavior behind the proxy, incorrect
wrong-password session handling, E2E identity leakage/order dependence, production build issues,
maintenance wiring gaps, and capability-locality/security-test coverage gaps.

## Testing and Verification

Run checks from the repository root. DB-backed suites must use the separate test database and Redis
configuration; serialize them with --no-file-parallelism.

    pnpm format:check
    pnpm lint
    pnpm typecheck
    pnpm test
    pnpm test:adverse
    pnpm test:visual
    pnpm --filter @webaudit/web exec playwright test
    pnpm build

Automated tests use AI_MODE=fixtures or injected providers and never require live AI spend. The
production-safe AI_MODE=disabled path has dedicated executor and worker-boot coverage. The
release evidence in the master plan records the latest isolated suite results, including API,
worker, shared-capability, adverse, visual, browser, deployment, and reliability checks.

Known verification boundaries are reported explicitly rather than hidden: real Paymob checkout,
real inbox delivery, and final real-domain/TLS browser smoke require external credentials or
infrastructure. Some visual surfaces retain documented pre-existing it.todo coverage, and
apps/probe-pool remains a library without a deployable transport entrypoint.

Release-pass snapshot from this checkout (2026-09-28):

- PASS: root typecheck, 30/30 Turbo tasks.
- PASS: targeted ESLint and UI adherence lint; adherence reported 0 warnings and 0 errors.
- PASS: targeted changed-surface tests, 99 assertions; the additional disabled-AI/capability
  suites passed 67/67.
- PASS: targeted adverse security suites, 305 passed and 1 legitimate skip.
- PASS: visual suite, 8 passed and 17 documented TODO cases.
- PASS: apps/web production build, including type validation and 28 generated routes.
- BLOCKED: full DB-backed unit/integration/E2E verification on this machine because Docker was not
  running and PostgreSQL at localhost:5442 was unavailable. Eight selected DB-backed tests failed
  during database setup for that environmental reason, not from assertion failures.
- PARTIAL: the root build completed the core web build but stopped when the unrelated
  showcase-esaalnybot target timed out during its external browser capture.

## Reliability and Recovery

- BullMQ jobs use durable Redis state, bounded retries, cancellation, timeout, heartbeat, and
  recovery handling.
- Queue admission and priority behavior are tested against real Redis/BullMQ behavior, including
  prioritized jobs that are not represented by the plain waiting count.
- Worker outage/restart behavior and heartbeat expiry were exercised against real local services.
- Credit and admin mutation concurrency was tested for ledger integrity and idempotency.
- Production image rollback is documented and was dry-run using a real capability-registry image
  regression; application images can be retagged and restarted without reversing additive migrations.

## Security

Security guarantees are enforced in code and tested adversarially:

- SSRF checks are applied across URL validation, redirects, DNS rebinding, sockets, forms, and the
  browser forward proxy.
- ZIP extraction has path traversal, absolute-byte, compression-ratio, and archive-limit guards.
- Untrusted installed capabilities run only through the separate bounded sandbox runner.
- Authentication, operator authorization, rate limits, secure cookies, CORS, realtime upgrade
  checks, structured errors, and timing-safe signature checks are covered by targeted tests.
- AI prompts are redacted before provider execution, and provider/credit costs are recorded in
  integer micros.
- Secrets are supplied through environment or deployment secret management; they are not stored in
  this repository.

## Local Development

Requirements: Node.js 22+, pnpm 9+, and Docker for PostgreSQL/Redis-backed development.

    pnpm install
    cp .env.example .env
    pnpm services:up
    pnpm db:generate
    pnpm db:migrate
    pnpm db:seed
    pnpm dev

Local PostgreSQL uses port 5442 and Redis uses 6389. Use .env.example, the relevant config
modules, and the test documentation for environment details. Never commit .env or real secrets.

## Production Deployment

The complete operator runbook is [infrastructure/deploy.md](infrastructure/deploy.md). The short
sequence is:

    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production build
    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production up -d
    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production ps -a

The Compose dependency order is PostgreSQL/Redis → migrations → API/worker → web → proxy. Verify
migrate exits with code 0 and services report healthy. Through the proxy, check /healthz, /health,
and /. The production Nginx file currently runs HTTP; its HTTPS block is prepared but requires
operator-provisioned certificates before it can be enabled.

## First-Time Production Bootstrap

After the first migration on a fresh database, seed plans and promote a real, already-registered
account to operator. Both scripts are copied into the API image and are idempotent where applicable:

    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production run --rm --entrypoint "" api node --import tsx scripts/seed.ts

    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production run --rm --entrypoint "" api node --import tsx scripts/bootstrap-admin.ts <email>

    docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production run --rm --entrypoint "" api node --import tsx scripts/credits-integrity-check.ts

PostgreSQL has no published port in this topology, so operational scripts run through the API
image and its internal network rather than connecting directly from the operator workstation.

## Environment Variables

Use [.env.example](.env.example) for local development and
[.env.production.example](.env.production.example) as the production configuration template.
Important categories include:

- PostgreSQL, Redis, connection limits, and optional PgBouncer settings.
- JWT and encryption secrets.
- AI_MODE, provider chain, models, and integer pricing when AI is enabled.
- SMTP or Resend transport and sender identity.
- Public API/web URLs and reverse-proxy hop count.
- Workspace, archive, scan-timeout, heartbeat, and monitoring settings.

The example files contain placeholders only. Do not commit filled-in environment files, tokens,
passwords, private keys, certificates, or provider credentials.

## Operational Tools

Available root scripts include:

    pnpm db:deploy
    pnpm db:seed
    pnpm admin:bootstrap -- <email>
    pnpm credits:check
    pnpm load:test
    pnpm services:up
    pnpm services:down

The production equivalents for one-off scripts are documented in
[infrastructure/deploy.md](infrastructure/deploy.md). credits:check is read-only and exits
non-zero only when it finds a ledger inconsistency.

## Known and Deferred Items

These are deliberately scoped or future items, not silently omitted work:

- Account deletion has a real workspace-path purge boundary, but the final R2 object purger for
  retained reports/source is still injectable and not wired because the object-key scheme belongs
  to the retention/storage implementation.
- apps/probe-pool is still a browser provisioning library rather than a separately deployable
  service/transport.
- Read replicas, isolated cache/CDN infrastructure, and higher-scale multi-source load rigs remain
  conditional on measured volume or external infrastructure.
- Real Paymob integration remains preserved architecturally but is intentionally disabled for this
  release.
- External monitoring dashboard configuration and real credential-backed checks require the
  operator's infrastructure and secrets.

## Remaining External Launch Requirements

Before a public launch, an operator must provide and verify:

1. A real domain and HTTPS/TLS certificate, then the final real-HTTPS cookie, CORS, login, and
   WebSocket smoke checks.
2. A real SMTP or Resend credential and sender domain, then inbox delivery checks for registration,
   password reset, lifecycle, and payment-related transactional email.

## Final Launch Checklist

- [x] Deterministic audit, scoring, reports, fixes, readiness, credits, admin, worker, sandbox,
      registry, and security boundaries implemented.
- [x] Production Dockerfiles, Compose topology, migrations, bootstrap scripts, health checks,
      Nginx routing, and rollback procedure documented and exercised.
- [x] Automated unit, contract, integration, adverse, visual, and browser checks recorded in the
      release evidence.
- [ ] Configure the real domain and TLS certificates.
- [ ] Configure a real outbound email provider and verify inbox delivery.
- [ ] Re-run final HTTPS and email smoke tests, then record the evidence.

## Documentation Map

Start with [AGENTS.md](AGENTS.md) for project rules and [PROJECT_MAP.md](PROJECT_MAP.md) for source
navigation. Generated endpoint, middleware, data-model, page, component, environment, and
architecture references are indexed below; they are supporting documentation, not a substitute
for the release master plan or source/tests.

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
