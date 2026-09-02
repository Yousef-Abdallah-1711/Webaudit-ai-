# WebAudit AI

**Audits a website across five dimensions, then walks the owner from red to green — and verifies
every step.**

A user submits a URL, a connected repository, or an uploaded archive. The system measures
performance, security, design, testing, and search visibility — deterministically first, then with
AI explaining and prioritising what was measured. The user gets a health score, an executive
summary, and per-issue remediation prompts they can paste into their coding agent.

Then the part that is actually the product: as the user fixes things, the system **re-runs the
narrowest check that can confirm each specific fix** and turns an issue green only when that check
passes. No user action can mark something resolved. When no critical or high issues remain, a
production-readiness pass re-audits everything fresh, detects regressions against the previous scan,
and returns an explicit go or no-go.

> Everyone else in this category sells you a report. We sell you the walk from red to green, and we
> verify each step.

Positioning, competitive standing, and the commercial model are in [PRODUCT.md](PRODUCT.md).

---

## Status — read this before forming an opinion of the code

**209 of 250 tasks complete (84%). The core product loop works end to end, on source too, and it is
billable.** A real audit runs against a live URL, an uploaded `.zip`, or a connected GitHub
repository; a human drives it through the UI; issues turn green only when a re-check passes; a
production-readiness pass returns an explicit go/no-go; and the account can subscribe to a plan, buy
non-expiring credits, and is never charged for a platform failure.

Built and verified in dependency order:

| Phase | State | What it is |
| --- | --- | --- |
| 1 — Setup | ✅ done | Monorepo, pinned toolchain, CI, local services |
| 2 — Foundational spine | ✅ done | Persistence (22 models), accounts & sessions, credit ledger, SSRF-safe fetch, control gate, secret redaction, capability SDK + registry, AI executor, module runner, queue + realtime, workspace lifecycle |
| 2L — Design system port | ✅ done | 15 components + 4 app shells ported into `apps/web`; `pnpm lint` enforces tokens, `pnpm test:visual` enforces fidelity |
| 3 — US1: Audit a live site | ✅ done | Orchestrator, 13 vendored capabilities, real end-to-end audit (5 areas' `ctx.fetch` checks), report + live progress UI. **First sellable artifact.** |
| 4 — US2: The fix loop | ✅ done | assert-fixed → narrow re-verification queue → green only on a passing check (**SC-007**); `reverify()` on 6 capabilities; recurrence detection; fixes board |
| 5 — US3: Readiness verdict | ✅ done | Fresh full re-audit, fingerprint regression diff, go/no-go with named blockers, shareable certificate, `/readiness` UI |
| 6 — US4: Source audit | ✅ done | Archive upload + connected-repo input, streaming extraction guard (refused before extraction, before charging), dependency/bundle/css capabilities |
| 7 — US5: Billing | ✅ done | Subscription lifecycle, entitlements refused before charging, non-expiring purchased credits, signed idempotent webhook, retention + self-contained export (**SC-008**) |
| 8 — US6: Design-intent questionnaire | ⬜ not started | `AWAITING_QUESTIONNAIRE` without holding a worker slot |
| 9 — US7: Operator admin | ⬜ not started | Margin attribution, capability toggles, provider config, queue ops (**SC-009, SC-010**); first `requireOperator` routes |
| 10 — Sandbox runner | ⬜ not started | The no-egress, no-credential service for untrusted uploaded capabilities (**SC-017**). Until it exists the upload path returns `503`. |
| 11 — Polish | 🟡 1/10 | a11y assertions, dark-mode contrast, structured logging, deploy runbooks, doc corrections |

**10 of 11 adversarial gates green.** SC-017 lands with Phase 10.

[PROGRESS.md](PROGRESS.md) is the honest scoreboard — what is verified rather than merely written,
which adversarial gates are green, and what is still an open decision.
[tasks.md](specs/001-webaudit-mvp-baseline/tasks.md) is the authoritative task state.

## Layout

Five deployable units under `apps/`, shared code under `packages/`. The unit boundaries are load
bearing: `sandbox-runner` and `probe-pool` are separate deployments because a security boundary that
is only a module boundary is not a boundary. Do not collapse them.

| Unit | Port | Holds | Role |
| --- | --- | --- | --- |
| `apps/web` | 3000 | — | Next.js App Router frontend |
| `apps/api` | 3001 | Database + provider credentials | Express HTTP API |
| `apps/worker` | — | Database + provider credentials | BullMQ consumer: orchestrator, module runner, re-verification |
| `apps/probe-pool` | 3002 | No platform credentials | Browser automation and load generation |
| `apps/sandbox-runner` | 3003 | **Nothing.** No egress, no database | Executes untrusted capability code |

Shared packages: `packages/types` (the only cross-app coupling point — duplicating a type across
apps instead of importing it from here is a defect) and `packages/config`.

Also at the root: `apps/api/prisma/` (schema, migrations), `design-system/` (vendored, read-only —
never edit and never import at runtime), `design/screen-map.md` (screen → route → task join table),
`infrastructure/docker-compose.yml` (local Postgres and Redis), and `specs/` (the specification
tree).

## Running it locally

Requires **Node 22 or newer**, **pnpm 9 or newer**, and Docker. `engine-strict=true` means the
install refuses to run under anything else rather than half-working.

```bash
pnpm install

cp .env.example .env
# Secrets are required and there is no silent development fallback: the API
# refuses to start without them. For a local machine, either generate real
# values (openssl rand -base64 48) or set ALLOW_INSECURE_DEV_SECRETS=true, which
# substitutes loudly-labelled placeholders and prints a banner. Startup refuses
# outright if that flag is set while NODE_ENV=production.

pnpm services:up      # Postgres and Redis in Docker
pnpm db:generate      # Prisma client
pnpm db:migrate       # apply migrations
pnpm db:seed          # the four plan tiers and reference data
```

**The service ports are not the defaults.** Postgres is on **5442** and Redis on **6389**, because
other projects on the original development machine hold 5432 and 6379. `.env.example` and
`infrastructure/docker-compose.yml` already agree on this; if you copy a connection string from
anywhere else, change the port.

```
postgresql://webaudit:webaudit_dev@localhost:5442/webaudit?schema=public
redis://localhost:6389
```

`pnpm services:down` stops them. `pnpm db:studio` opens Prisma Studio; `pnpm db:reset` drops and
rebuilds the database.

`apps/api` and `apps/worker` have real `dev`/`start` scripts and boot end to end; `apps/web` runs
under `next dev` / `next build`. `apps/probe-pool` and `apps/sandbox-runner` are still scaffolds
(the sandbox is Phase 10, deliberately last). Most work is still exercised through the test suites
rather than a running stack.

## Verification gates

These run on every commit and in CI. All of them, not a chosen subset.

```bash
pnpm format:check     # prettier
pnpm lint:code        # eslint — also enforces Principle IV and FR-025 at lint time
pnpm lint:adherence   # oxlint, 64 design rules — enforces FR-032 and FR-053
pnpm typecheck        # tsc across the workspace
pnpm test             # unit, contract, integration
pnpm test:adverse     # the eight hostile suites
pnpm test:visual      # design fidelity at 1440 and 390
```

`pnpm test:adverse` is the interesting one. Eight of the success criteria are stated adversarially
and each has a dedicated hostile suite: attribution, verification-cannot-be-faked, workspace
destruction, secret redaction, sandbox escape, SSRF, the control gate, and credit integrity. **These
are the gates, not extras.** A suite that needs live LLM spend to pass is a broken suite — provider
calls are stubbed with `AI_MODE=fixtures`.

Contract tests run against a real PostgreSQL instance rather than a mock, because the credit
ledger's correctness depends on serializable transactions and `FOR UPDATE` ordering, and a mock
would prove nothing about either. Point them at a scratch database with `TEST_DATABASE_URL`.

## Governing documents

This project is spec-driven via [Spec Kit](https://github.com/github/spec-kit). Read down the table,
not across it — each row is subordinate to the one above.

| Document | Governs |
| --- | --- |
| [.specify/memory/constitution.md](.specify/memory/constitution.md) | **Highest authority.** Seven principles, security constraints, design adherence, quality gates. Supersedes everything else here. |
| [specs/001-webaudit-mvp-baseline/spec.md](specs/001-webaudit-mvp-baseline/spec.md) | 94 requirements, 22 success criteria — what the product must do |
| [specs/001-webaudit-mvp-baseline/plan.md](specs/001-webaudit-mvp-baseline/plan.md) | Architecture, structure, build sequence |
| [specs/001-webaudit-mvp-baseline/research.md](specs/001-webaudit-mvp-baseline/research.md) | 18 decisions with rationale and rejected alternatives |
| [specs/001-webaudit-mvp-baseline/data-model.md](specs/001-webaudit-mvp-baseline/data-model.md) | Physical schema |
| [specs/001-webaudit-mvp-baseline/contracts/](specs/001-webaudit-mvp-baseline/contracts/) | Capability contract, HTTP API, realtime, AI, sandbox |
| [DESIGN.md](DESIGN.md) · [design/screen-map.md](design/screen-map.md) | Design system and the screen → route → task table |
| [PRODUCT.md](PRODUCT.md) | Positioning and commercial model |
| [CLAUDE.md](CLAUDE.md) | Working agreement for coding agents; subordinate to the constitution |
| [PROGRESS.md](PROGRESS.md) | Current build state |
| `WebAuditAI_ARCHITECTURE.md` | **Historical.** The original sketch, wrong in three known places — do not implement from it |

The seven principles, in one line each: capabilities are plugins and the core never names one;
third-party code is vendored, never fetched at runtime; the deterministic layer runs first and costs
zero tokens; every LLM call goes through one executor over at least two vendors; untrusted code runs
in a separate, egress-free process; every operation is metered and reconciled and we never charge
for our own failures; and verification is narrow, objective, and cheap.

## Contributing

Tests come first: write the failing test, confirm it fails for the intended reason, then implement.
Every PR must state which principles it touches and how it complies — reviewers check compliance,
not merely correctness, and may block on a principle violation alone. Deviating from a principle
needs a documented exception in the PR and an issue to remove it; an undocumented deviation is a
defect even when the code works.

If a guarantee blocks a feature, say so and stop. The answer is almost always to defer the feature,
not the guarantee. This is a product whose entire value is telling people the truth about their
software.
