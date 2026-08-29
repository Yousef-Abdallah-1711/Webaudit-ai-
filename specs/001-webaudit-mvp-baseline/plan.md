# Implementation Plan: WebAudit AI — MVP Baseline

**Branch**: `001-webaudit-mvp-baseline` | **Date**: 2026-08-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-webaudit-mvp-baseline/spec.md`

## Summary

Build a credit-metered auditing platform that measures a website across five areas, explains the
findings with AI, and drives the owner through a verified fix loop to a production-readiness verdict.

The technical approach is set by three constitutional constraints more than by the feature list.
**Capabilities are plugins** — the core never names one, so audit coverage grows without touching
core code. **Measurement precedes interpretation** — a zero-token deterministic layer completes
before any AI call, and every finding is attributed to the layer that produced it. **Nothing
degrades into a weaker guarantee** — a failing capability degrades its area, an exhausted provider
chain still delivers measured findings, and an unavailable sandbox refuses uploads rather than
running them unprotected.

Two deferred decisions are resolved in [research.md](./research.md): untrusted capabilities run in a
**no-egress, no-credential service** behind three nested boundaries (R1), and credits use a
**lot-based ledger** because two credit lifetimes plus correct refunds cannot be modelled with a
balance column (R2).

## Technical Context

**Language/Version**: TypeScript 5.9.3 on Node >=22. The sandbox depends on the Node permission
model (R1), which 22 introduced and later majors keep — hence a floor, not a pin. Toolchain
versions are pinned exactly in the root `package.json` (`save-exact=true` in `.npmrc`): a caret
range would let the toolchain drift underneath 92 foundational tasks.

**Primary Dependencies**: Next.js 15 (App Router), Express 5, Prisma 6, BullMQ 5, `ws`, Playwright
(browser automation), `undici` (SSRF-guarded fetch via custom connector), Zod (schema validation at
every boundary), k6 (load generation), Vitest, Playwright Test, `oxlint` (design-adherence rules),
`pixelmatch` (visual comparison).

Pinned as of Phase 1: `typescript` 5.9.3, `vitest` 2.1.9, `turbo` 2.10.11, `eslint` 9.39.5,
`typescript-eslint` 8.67.0, `oxlint` 0.13.2, `prettier` 3.9.6, `tsx` 4.23.12,
`@types/node` 22.20.1. Runtime dependencies are added by the task that first needs them.

**Design System**: Vendored at `design-system/` — 15 components with prop contracts and usage rules,
26 screens across three UI kits, 97 tokens, and a machine-enforceable adherence lint config.
Authoritative for every user-facing surface per constitution v1.1.0 (Design Adherence). Screen and
component routing lives in [design/screen-map.md](../../design/screen-map.md). UI is **ported** from
this reference, never authored fresh.

**Storage**: PostgreSQL 16 as the only system of record. Redis 7 for queue, rate limiting, and
progress fan-out — never a record (Constitution). Cloudflare R2 for report artifacts, screenshots,
and upload staging.

**Testing**: Vitest for unit and contract; Playwright Test for end-to-end; `pnpm test:adverse` for
the eight hostile suites that make SC-006/007/015/016/017/018/021/022 executable (R15). Provider
calls are always stubbed.

**Target Platform**: Linux containers. Web on Vercel; API, worker, probe-pool, and sandbox-runner on
Railway.

**Project Type**: Web application — pnpm + Turborepo monorepo, five deployable units.

**Performance Goals**: Full audit within 5 minutes wall clock for a typical page. Targeted
re-verification verdict under 30 seconds (SC-004). Report delivered for 99% of audits (SC-003).

**Constraints**: Code layer consumes zero tokens (Principle III). Every AI call routed through one
executor spanning ≥2 vendors (Principle IV). Untrusted code reaches no data, credentials, network,
or filesystem (Principle V). No user charged for platform failure (Principle VI). Targeted
re-verification ≤5% of a full audit's cost (SC-005).

**Scale/Scope**: MVP target 1,000 users, ~60 concurrent audits, 6 queue priorities. Approximately 20
vendored capabilities across five areas at launch.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Principle | Design compliance | Verified by |
| --- | --- | --- |
| **I. Skills are plugins; core stays closed** | Registry resolves by module and layer only; no core module imports a capability. Discovery by directory root. Enablement is data (R10). | SC-010, SC-011; capability contract conformance suite |
| **II. Vendored forever, never fetched** | `packages/capabilities-vendored/` holds full copies with manifests. No runtime retrieval; a startup test asserts every registered capability resolves from local disk. | FR-023, FR-024 |
| **III. Deterministic before probabilistic** | Runner enforces phase ordering; `CODE` layer executions must record `costMicros = 0`; attribution assigned by the runner, not self-declared (R13). | SC-006; `demo:trace` |
| **IV. No single point of AI failure** | One executor holds all provider clients; ≥2 vendors validated at startup; exhaustion returns a typed degradation, never throws (R9). | SC-012, Scenario 10 |
| **V. Untrusted code runs isolated** | Three nested boundaries; sandbox service has no egress and no credentials; conformance runs inside the boundary (R1). | SC-017 |
| **VI. Metered, reconciled cost** | Lot-based ledger, no balance column; cost recorded per capability execution; refund to originating lot (R2). | SC-008, SC-009, SC-022 |
| **VII. Verify narrowly, rescan rarely** | Re-verification keyed to issue fingerprint, runs one check; `RESOLVED` has one inbound edge, triggered only by a passing check (R3, R14). | SC-004, SC-005, SC-007 |
| **Design Adherence** (v1.1.0) | Tokens consumed via `var()` only, enforced by `design-system/_adherence.oxlintrc.json` in `pnpm lint`; components ported from `design-system/components/`; undesigned surfaces refused rather than invented; fonts and icons served locally. | `pnpm lint`, `pnpm test:visual` |

**Security constraints**: SSRF defence in four layers including connect-time validation and manual
redirect re-validation (R6). Archive extraction guarded while streaming, before bytes land (R7).
Redaction is the only path to a provider, enforced by type (R8). Tokens encrypted with no plaintext
column in the schema.

**Workflow constraints**: Tests precede implementation. Every capability carries a contract test plus
a survives-throwing test. Provider calls stubbed throughout.

**Gate result: PASS.** One deviation from the source architecture document is recorded in Complexity
Tracking; it increases constitutional compliance rather than reducing it.

## Project Structure

### Documentation (this feature)

```text
specs/001-webaudit-mvp-baseline/
├── plan.md                              # This file
├── spec.md                              # Feature specification
├── research.md                          # Phase 0 — 18 decisions, R1/R2 resolve the deferred TODOs
├── data-model.md                        # Phase 1 — physical schema
├── quickstart.md                        # Phase 1 — 10 validation scenarios
├── contracts/
│   ├── capability-contract.md           # The plugin boundary (Principle I)
│   ├── http-api.md                      # External API
│   └── realtime-and-internal.md         # Events, AI executor, sandbox protocol
├── checklists/
│   └── requirements.md                  # 16/16 passing
└── tasks.md                             # Phase 2 — created by /speckit-tasks, not here
```

### Source Code (repository root)

```text
apps/
├── web/                                 # Next.js — Vercel
│   ├── app/
│   │   ├── (public)/                    # landing, pricing
│   │   ├── (auth)/                      # login, signup, verify, reset
│   │   ├── (dashboard)/                 # scans, reports, fixes board, billing, settings
│   │   └── (admin)/                     # users, plans, margin, capabilities, providers, queue
│   ├── components/{scan,report,fixes,admin,ui}/
│   └── lib/{api-client,realtime,auth}.ts
│
├── api/                                 # Express — Railway
│   └── src/
│       ├── routes/                      # auth, targets, scans, issues, billing, admin, webhooks
│       ├── middleware/                  # auth, operator, credits, rate-limit, idempotency
│       ├── services/
│       │   ├── credits/                 # R2 — lot ledger; the only writer of CreditLot
│       │   ├── control-gate/            # R11 — attest, verify, re-confirm
│       │   ├── intake/                  # R6 SSRF validation, R7 archive guard
│       │   └── realtime/                # R5 — persist-then-publish
│       └── db/
│
├── worker/                              # BullMQ consumer — Railway
│   └── src/
│       ├── orchestrator/                # 5 phases, resumable; R4 questionnaire without holding a slot
│       ├── module-runner/               # R13 — two layers, partial-failure containment
│       ├── reverify/                    # R14 — fingerprint to check
│       └── readiness/                   # fresh re-audit, regression diff
│
├── probe-pool/                          # Browser + load generation — Railway, no platform creds
│   └── src/{browser,lighthouse,loadgen}/
│
└── sandbox-runner/                      # R1 — NO egress, NO credentials
    └── src/{host,child-harness,limits}/

packages/
├── types/                               # shared contracts; the only cross-app coupling
├── capability-sdk/                      # AuditCapability contract + conformance suite
├── ai-executor/                         # R9 — sole holder of provider clients
├── redaction/                           # R8 — constructs RedactedPrompt; nothing else can
├── safe-net/                            # R6 — SSRF-guarded fetch
├── safe-archive/                        # R7 — streaming extraction guard
├── scoring/                             # score + severity + fingerprint helpers
├── capabilities-vendored/               # Principle II — full local copies, trusted root
└── config/

design-system/                           # VENDORED design reference — read-only
├── tokens/                              # 8 files, 97 tokens (source of every var())
├── components/{core,report}/             # 15 components: .jsx + .d.ts + .prompt.md
├── ui_kits/{marketing,app,admin}/        # 26 screens
├── guidelines/                          # 17 foundation specimen cards
├── reference-pages/                     # runnable exports = visual-diff baselines
└── _adherence.oxlintrc.json             # the lint gate

design/
└── screen-map.md                         # screen -> route -> task, plus the gaps list

infrastructure/    docker-compose.yml, k6/
scripts/           capability-vendor.ts, capability-update.ts, seed.ts
```

**Structure Decision**: pnpm + Turborepo monorepo with **five** deployable units, not the three in
`WebAuditAI_ARCHITECTURE.md`. `sandbox-runner` and `probe-pool` exist because a security boundary is
only real if it is a separate deployment — the sandbox must hold no credentials and have no egress
(R1), and the auditing browser must be able to load whatever a page loads without sitting next to
platform secrets (R6). Collapsing either into `api` would make FR-027 and SC-017 unachievable.

Shared logic lives in packages chosen so that a guarantee is enforced by a type rather than by
discipline: only `redaction` can construct the `RedactedPrompt` that `ai-executor` accepts, and only
`safe-net` exposes fetch to a capability.

## Implementation Sequence

Ordered by dependency, with each stage independently demonstrable. Priorities are the spec's.

| Stage | Delivers | Spec |
| --- | --- | --- |
| 0 | Monorepo, migrations, seeds, CI, `packages/types` | — |
| 1 | Accounts, sessions, operator enforcement | US1 partial, FR-001–009 |
| 2 | Lot-based credit ledger + property suite | US5 core, R2, SC-022 |
| 3 | Intake: SSRF guard, archive guard, control gate | FR-010–018, SC-018, SC-021 |
| 4 | Capability SDK, registry, conformance suite | Principle I, SC-010, SC-011 |
| 5 | AI executor with fallback and cost recording | Principle IV, SC-012 |
| 6 | Module runner, two layers, attribution | Principle III, SC-006 |
| 7 | Orchestrator, queue, realtime, questionnaire pause | US1, US6, FR-030–047 |
| 7b | Design system port: tokens, 15 components, app + public shells | Design Adherence |
| 8 | Security + SEO areas end to end (first vertical slice) | US1 |
| 9 | Report, fixes board, targeted re-verification | US2, SC-004, SC-007 |
| 10 | Performance, UI, Testing areas | US1 full, US4 |
| 11 | Readiness pass and regression detection | US3 |
| 12 | Billing, plans, retention, export | US5 full |
| 13 | Admin: margin, capabilities, providers, queue | US7 |
| 14 | `sandbox-runner` + upload path | FR-027–029, SC-017 |

Stage 8 is the first stage that produces a sellable artifact — a real audit of a real site.
Stage 14 is last because until it exists the upload endpoint returns `503`, which is correct
behaviour rather than a gap.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Five deployable units instead of three | The sandbox must have no egress and no credentials (FR-027); the auditing browser must load arbitrary third-party subresources (R6). Both are deployment properties, not code properties. | Running untrusted code or a browser inside `api` puts provider keys and the database in the same process as hostile input. SC-017 could not pass. |
| Three tables for one conceptual credit entity | Two credit lifetimes, consumption ordering, and refund-to-origin (FR-078, SC-022). | A single balance, or two columns, cannot say which credits a refund belongs to once operations interleave. Verified by the property suite. |
| Scan split into resumable jobs | The questionnaire waits up to ten minutes for a human (FR-040). | Awaiting in-job — the architecture document's approach — lets a handful of pending questionnaires starve the queue at published concurrency limits (R4). |
| `capabilitySnapshot` denormalised onto `Scan` | An operator toggling a capability mid-scan must not produce a half-configured audit (FR-086). | Reading live enablement makes a scan's composition nondeterministic and its cost unexplainable. |

## Post-Design Constitution Re-Check

Re-evaluated after Phase 1. **PASS** — no principle is violated by the design, and three are now
enforced structurally rather than procedurally:

- Principle III: attribution is set by the runner, so a capability cannot present a guess as a
  measurement.
- Principle V and SC-016: `RedactedPrompt` is constructible only by the redaction pass, so an
  unredacted prompt cannot reach a provider.
- Principle VII and SC-007: `RESOLVED` has one inbound edge whose only trigger is a passing check, so
  no user action can turn an issue green.

Two items are carried forward as documentation corrections rather than design changes, per
Constitution Governance:

1. **FR-025 needs amending** to distinguish platform egress (allowlisted) from auditing-browser
   egress (must follow the page). As written it is unsatisfiable without measuring a page no visitor
   sees (R6).
2. **`WebAuditAI_ARCHITECTURE.md` conflicts** on three points — it names `vm2` (R1), awaits the
   questionnaire in-job (R4), and lists three deployable units (R16). Governance requires the
   architecture document be corrected to match.
