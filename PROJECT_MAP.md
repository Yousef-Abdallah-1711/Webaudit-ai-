# Project map - WebAudit AI

Compact navigation, checked against the working tree on 2026-09-11. Read the whole map once;
open detailed docs **only for the current task/domain**. Rules: [AGENTS.md](AGENTS.md).
This is a source map, not a production-readiness certification or task scoreboard.

## Architecture and source roots

URL / GitHub zipball / ZIP -> API validation + quote + credit debit -> BullMQ phase jobs ->
worker deterministic capabilities -> redacted AI interpretation -> persisted report ->
WebSocket progress. Fix assertions enqueue narrow re-verification; readiness runs a fresh audit
and compares the baseline. PostgreSQL is the record; Redis carries queues, notifications and limits;
R2 holds staged archives and artifacts.

Node >=22, pnpm 9, TypeScript, Turbo; Next.js 15/React 19, Express, Prisma/Postgres, BullMQ/Redis.
Exact versions/scripts: [package.json](package.json) and each workspace package.json.

| Root | Entry / responsibility | Detail when needed |
| --- | --- | --- |
| `apps/web/` | `apps/web/app/layout.tsx`; frontend, port 3000 | UI and testing rows below |
| `apps/api/` | `apps/api/src/index.ts` boots; `apps/api/src/app.ts` mounts HTTP middleware/routes; port 3001 | API domains below |
| `apps/worker/` | `apps/worker/src/index.ts`; queue consumers, audit/fix/readiness execution; no public HTTP port | Orchestration below |
| `apps/probe-pool/` | `apps/probe-pool/src/browser/pool.ts`; isolated Chromium provisioning | Browser SSRF spec; intended service, **no runnable server/transport yet** |
| `apps/sandbox-runner/` | `apps/sandbox-runner/src/serve.ts`; HTTP host, child harness and external limits; port 3003 | Sandbox runbook below |

The design calls for five separate units; browser provisioning is currently a library. The worker
shares Prisma and explicit service subpath exports from the API package: inspect both package
manifests before changing that dependency boundary. Turbo package cycles are a known risk.

**Path shorthand below** (expand before using): `API = apps/api/src`,
`WORKER = apps/worker/src`, `WEB = apps/web`,
`BASE = specs/001-webaudit-mvp-baseline`. All other paths are repository-relative.

## Shared packages

| Path | Owns |
| --- | --- |
| `packages/types/` | Domain enums/contracts, events; shared domain type source |
| `packages/config/` | Pricing, plans, queues, phase mapping, refunds, cancellation schema, logging |
| `packages/capability-sdk/` | Contract, manifests/discovery, confined context, containment, conformance |
| `packages/capabilities-vendored/` | Individual locally vendored audit implementations/manifests; shared conformance/unit tests |
| `packages/ai-executor/` | Provider adapters, chain validation/fallback, pricing and invocation metering |
| `packages/redaction/` | Secret detection and branded RedactedPrompt assembly |
| `packages/safe-net/` | SSRF-safe fetch, DNS/socket checks, browser forward proxy |
| `packages/safe-archive/` | ZIP inspection/extraction with path, ratio and absolute byte limits |
| `packages/scoring/` | Scores, severity weighting, fingerprints |

## Domain routing - read only the matching row's docs

API route filenames below live under `API/routes/`; HTTP mount order in `API/app.ts` is authoritative.
There is no separate credits route directory: the customer credit API is in billing.routes.ts.
For DB changes, use the schema section below and the row's named models.

| Area | Source / API / UI | DB and test locator | Detailed reading only for this area |
| --- | --- | --- | --- |
| Auth, sessions, OAuth, authorization | `API/services/auth/`, `API/middleware/auth.middleware.ts`; `API/routes/auth.routes.ts`, `API/routes/oauth.routes.ts`; `WEB/app/(auth)/`, `WEB/components/auth/` | User, OAuthIdentity, EmailToken, RefreshToken; API tests: auth/session/oauth/reset; E2E auth | BASE spec FR-001-009; `AUTH-SECURITY-AUDIT.md`; auth-related PROGRESS sections |
| Targets, control proof | `API/services/control-gate/`, `API/routes/targets.routes.ts`; `API/services/registry/resolve-required-control-level.ts` | Target, TargetVerification; adverse control-gate tests | BASE research R6/R11; `docs/superpowers/plans/2026-08-27-control-gate-enforcement.md` |
| Intake: URL/repo/ZIP | `API/services/intake/`, `API/routes/intake.routes.ts`, `WORKER/intake/`, `packages/safe-archive/`; `WEB/components/scan/InputTabs.tsx` | Target/Scan; upload, extraction, source-materialisation, repo-revoked tests | BASE spec FR-010-021/research R6; source/archive bullets in domain safeguards |
| Quotes, credits, refunds | `API/services/credits/`, `API/services/intake/create-scan.ts`, `API/routes/billing.routes.ts`; `packages/config/src/pricing.ts`, `packages/config/src/refund.ts` | CreditLot, CreditTransaction, CreditAllocation; credits, refund, enqueue-failure tests; `scripts/credits-integrity-check.ts` | `PLAN.md` + `TASKS.md` are **credit hardening only**; `docs/superpowers/plans/2026-08-27-credit-refund-integrity.md`; cancellation spec below |
| Plans, payments, retention | `API/services/billing/`, `API/routes/billing.routes.ts`, `API/routes/webhooks.routes.ts`, `API/services/storage/retention.ts`; `WEB/app/(dashboard)/billing/` | Plan, Subscription, BillingEvent + credit models; billing, renewal, entitlement, retention tests | BASE spec FR-073-082/FR-092; credit PLAN; production-readiness plan for payment gaps |
| Scan phases, cancellation, timeout | `WORKER/orchestrator/`, `WORKER/module-runner/`, `WORKER/queue/`, `API/services/queue/`, `API/routes/scans.routes.ts`; `packages/config/src/queues.ts`, `packages/config/src/cancellation.ts` | Scan, ModuleResult, CapabilityExecution; worker integration/adverse: phase, cancel, timeout, layer-ordering | BASE plan/realtime contract; `specs/002-fix-cancel-timeout-refunds/` |
| Design-intent questionnaire | `API/services/scans/questionnaire.service.ts`, `WORKER/orchestrator/questionnaire-timeout-handler.ts`, `WEB/components/scan/UIQuestionnaire.tsx` | DesignIntent/Scan; questionnaire integration/race tests | BASE spec FR-040-047, research R4/R19; domain safeguards |
| Realtime progress | `API/services/realtime/`, `WORKER/orchestrator/emit.ts`, `WEB/lib/realtime.ts`, `WEB/components/scan/ScanProgress.tsx` | Persisted Scan/ModuleResult; progress-streaming, realtime-upgrade-limits tests | `BASE/contracts/realtime-and-internal.md`; realtime safeguards |
| Registry, vendored/installed capabilities | `API/services/registry/`, `API/services/admin/capability-upload.service.ts`, `WORKER/orchestrator/capability-loader.ts`, `packages/capability-sdk/` | Capability, CapabilityPlan, CapabilityExecution; conformance, installed-capability, capability-lifecycle tests | `BASE/contracts/capability-contract.md`; `docs/superpowers/plans/2026-09-09-t253-installed-capability-dispatch.md`; BASE tasks T249-255 |
| Sandbox isolation | `apps/sandbox-runner/src/host/`, `apps/sandbox-runner/src/child-harness/`, `apps/sandbox-runner/src/limits/`, `apps/sandbox-runner/src/protocol.ts` | Sandbox adverse escape/limits/deployment suites | `infrastructure/sandbox-runner.md`; `docs/superpowers/plans/2026-09-04-sandbox-runner-adversarial-review.md` |
| Browser / SSRF | `packages/safe-net/src/`, `apps/probe-pool/src/browser/pool.ts` | safe-net and probe-pool adverse tests | `specs/003-fix-browser-pool-ssrf/`; BASE research R6, spec FR-025a |
| AI, redaction, metering | `packages/ai-executor/src/`, `packages/redaction/src/`, `WORKER/prompts/`, `WORKER/module-runner/ai-layer.ts` | AiInvocation/CapabilityExecution; chain, exhaustion, redaction, attribution tests | BASE research R8/R9; capability + realtime contracts; AI safeguards |
| Reports, scores, artifacts | `API/routes/reports.routes.ts`, `API/services/storage/`, `WORKER/orchestrator/master-report.ts`, `packages/scoring/`; `WEB/app/(dashboard)/reports/`, `WEB/components/report/` | Scan, ModuleResult, Issue; report/export/scoring tests | BASE spec FR-048-057/FR-093, research R3/R17; scoring safeguards |
| Fix loop / recurrence | `API/services/issues/`, `API/routes/issues.routes.ts`, `WORKER/reverify/`; `WEB/components/fixes/`, `WEB/app/(dashboard)/fixes/` | Issue, VerificationAttempt; verification, reverify, recurrence tests; E2E fixes-board | BASE spec FR-058-065; `docs/superpowers/plans/2026-09-02-phases-4-7-engineering-review.md` |
| Readiness / certificate | `API/services/readiness/`, `API/routes/readiness.routes.ts`, `WORKER/readiness/`; `WEB/app/(dashboard)/readiness/` | ReadinessVerdict + baseline Scan; readiness/certificate/email-guard tests | BASE spec FR-066-072; phases-4-7 engineering review |
| Operator console | `API/routes/admin/index.ts`, `API/routes/admin/`, `API/services/admin/`; `WEB/app/(admin)/admin/`, `WEB/components/admin/` | AuditLogEntry, ProviderChainEntry, users/plans/capabilities; admin API/adverse + E2E admin | BASE spec FR-083-089; `docs/superpowers/plans/2026-09-04-us7-admin-adversarial-review.md` |
| Email and lifecycle cleanup | `API/services/email/`, `API/services/auth/cleanup.service.ts`, `WORKER/workspace/`, `API/services/storage/` | Tokens, subscriptions, scan artifacts; workspace/retention/email tests | BASE spec FR-090-095; deploy runbook; production-readiness plan |

**Test locator convention:** API -> `apps/api/tests/`; worker -> `apps/worker/tests/`;
package -> its `tests/` directory. Use `rg --files <test-root>` filtered by the row's terms;
terms are search hints, not claimed filenames. E2E paths are below.

## Frontend and design

`WEB/app/(public)/`: home/pricing. `WEB/app/(auth)/`: five auth pages.
`WEB/app/(dashboard)/`: scan/new + scan/[id], reports/[id], fixes, readiness, billing,
usage, settings (also report/progress entry routes). `WEB/app/(admin)/admin/`: operator pages.
Route groups are filesystem organization, not URL prefixes.

Shared shells/widgets: `WEB/components/`; HTTP/session client: `WEB/lib/api.ts`;
theme: `WEB/app/theme.tsx`; strings: `WEB/lib/strings.ts`; CSS tokens: `WEB/app/tokens/`.
Before UI work read [DESIGN.md](DESIGN.md), [screen map](design/screen-map.md), and only the
matching component contracts/prompts in `design-system/`; detailed rules:
[UI safeguards](docs/agent-domain-rules.md#ui-work).
`specs/ui-reference-siteaudits/` is competitor reference evidence, not the approved design authority.

## Database, configuration and operations

- Schema source: `apps/api/prisma/schema.prisma`; reviewed migrations:
  `apps/api/prisma/migrations/`; Prisma singleton: `API/db/client.ts`; seed: `scripts/seed.ts`.
  Read `BASE/data-model.md` for the touched models; migration SQL carries constraints/indexes
  not fully expressed by Prisma. Worker DB entry: `WORKER/db.ts`.
- Configuration definitions: `.env.example` (names/default guidance only), `API/config/env.ts`,
  `API/config/sandbox.ts`, `packages/ai-executor/src/from-env.ts`, each service entry point.
  Key families: DB/Redis, auth/encryption, AI chain/models/pricing, R2, OAuth/email,
  workspace/installed roots and sandbox URL. Do not copy real environment values into docs.
- Local services: `infrastructure/docker-compose.yml` (Postgres host 5442, Redis 6389).
  Setup commands: [README.md](README.md). Production:
  [deployment](infrastructure/deploy.md), [sandbox isolation](infrastructure/sandbox-runner.md).
  Verify runbook claims against entry points: API **does** have /health; sandbox dispatch **is**
  used by installed-capability scans, despite older runbook wording.
- Workspace/build gates: `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`,
  `eslint.config.js`, `.prettierrc`, `vitest.workspace.ts`, `WEB/playwright.config.ts`.
  No `.github/` CI workflow is present in this checkout; old setup claims are not proof of CI.
- `var/`: ignored runtime workspaces/installed bundles, not project context to read.
  `showcase-eink/`, `showcase-trimora/`, `showcase-esaalnybot/`: separate showcase workspaces
  included by the workspace glob; inspect only for tasks affecting them or root-tooling failures.
  `apps/early-access/` is explicitly excluded from workspaces, separate parked work.
  Dependency/build outputs and `.playwright-mcp/` are not source documentation.

## Verification entry points

| Check | Command / source | Read when working here |
| --- | --- | --- |
| Unit + contract + integration | `pnpm test`; targeted: `pnpm exec vitest run --project unit <test-file> --no-file-parallelism` | `vitest.workspace.ts`; tests beside affected app/package |
| Hostile guarantees | `pnpm test:adverse`; target similarly with `--project adverse` | Relevant adverse tests; `BASE/quickstart.md` |
| Types / lint / format | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; inspect package scripts on Turbo-cycle failure | Root package.json; distinguish existing failures from regressions |
| UI fidelity / CSS | `pnpm test:visual`; `WEB/tests/visual/`, `WEB/tests/unit/css-adherence-lint.test.ts` | Actual assertions/todos plus design references |
| Real browser E2E | `pnpm --filter @webaudit/web test:e2e`; `WEB/tests/e2e/` (auth, onboarding, dashboard, admin, support) | `WEB/tests/README.md` **before running**; isolated DB/Redis, workers=1 |
| External/manual | `WEB/tests/manual/CHECKLIST.md` | Real OAuth/email and visual judgment; not fixture proof |
| Load / capacity | `load-testing/scripts/golden-path.js`, `load-testing/seed-test-user.ts` | `load-testing/RUNBOOK.md`, `load-testing/REPORT.md`, `specs/004-load-testing-harness/` |

DB-backed suites must use TEST_DATABASE_URL, not the development database. Serialize shared
DB/Redis runs; E2E workers compete with a live dev worker if they share queues.
Fixture-provider load evidence currently covers up to 10 concurrent audits; it does not prove
real-provider latency, higher concurrency or production capacity.

## Documentation and risk routing

- Governance: [.specify/memory/constitution.md](.specify/memory/constitution.md).
  Its older "skill" terminology maps to capability-sdk/capabilities-vendored in current code;
  preserve its guarantees rather than recreating the old directory names.
- Requirements/design decisions: `BASE/spec.md`, `BASE/plan.md`, `BASE/research.md`,
  `BASE/data-model.md`, `BASE/contracts/`. Read relevant sections, not the entire baseline.
  Product judgment: [PRODUCT.md](PRODUCT.md).
- Task/handoff state: relevant `specs/` feature's tasks.md and targeted
  [PROGRESS.md](PROGRESS.md) sections. Root PLAN/TASKS cover credits, not the whole project.
- Production/scale/UI gap work: [master plan](docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md),
  [scale/UI re-audit](docs/reviews/PRODUCTION-READINESS-REAUDIT-SCALE-AND-DECORATIVE-UI.md),
  [auth/scale audit](AUTH_AND_SCALE_AUDIT.md).
  Payment collection and console email remain gaps; some UI is still placeholder-only.
  Provider pricing/configuration and composed timeouts need task-specific validation.
- Real Paymob payments, production email, monitoring, AI cost protection, queue backpressure,
  archival, and remaining scaling items: `specs/005-production-hardening/` (spec.md, research.md —
  includes a full EduFlow-LMS payment/email reference audit and mapping, data-model.md, plan.md,
  contracts/, quickstart.md, tasks.md T001-T045, ENGINEERING-STANDARDS.md, PHASE-PROMPTS.md).
  Planning only as of 2026-09-12; nothing under it is implemented yet.
  **`ENGINEERING-STANDARDS.md` is mandatory reading before any task under this initiative** — it
  is the concrete code-structure/security/testing rulebook and the Definition-of-Done templates
  every task in `tasks.md` references; skipping it is what produces the "cheaper model wrote it,
  now it needs a lot of fixing" outcome this file exists to prevent. Read `research.md` before
  touching `apps/api/src/services/billing/` or `services/email/` for this work — it carries the
  design reasoning `tasks.md` assumes.
- Financial/security history:
  [workflow review](docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md).
  Especially inspect cancellation/refund races, upload/registry deletion with execution history,
  sandbox trust and SSRF before modifying those boundaries.
- AI engineering (gateway/prompts/context/credits/cost/evaluation):
  [current-vs-target audit](docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md) and its
  [tasks](docs/reviews/AI-ENGINEERING-TASKS.md) (T307-T312; T310/T311 done, T307/T308/T309/T312
  fully specified but not yet implemented) plus [ready-to-use kickoff prompts per
  phase](docs/reviews/AI-ENGINEERING-PHASE-PROMPTS.md) for a fresh session to execute one. Confirms
  the AI surface (`packages/ai-executor`, `packages/redaction`, `packages/capability-sdk`,
  `apps/worker/src/prompts`) is centralized and mature; no Model Router, MCP, RAG, agent
  tool-calling, or evaluation harness exists today, and the audit explains which of those are
  gaps versus deliberately unneeded for this product.
- `docs/superpowers/plans/` contains dated implementation/review history; follow a specific
  plan only when assigned. `WebAuditAI_ARCHITECTURE.md` is a historical sketch, not current code.
  Reviews, tasks and runbooks have known stale statements; verify claims against source/tests.
- Agent tooling: `.agents/skills/`, `.claude/skills/` (parallel tool integrations);
  `.specify/` contains governance, templates, scripts and integrations. Load only the invoked or
  relevant skill. Do not change installed/global permissions to implement project navigation.
