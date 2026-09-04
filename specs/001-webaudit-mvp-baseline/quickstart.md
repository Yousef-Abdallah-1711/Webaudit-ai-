# Quickstart & Validation Guide: WebAudit AI — MVP Baseline

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Date**: 2026-08-23

How to bring the system up locally and prove it satisfies the specification. Scenarios map to
success criteria; each states what to run and what must be observed.

> **Corrected T235 (Session 9, 2026-09-04): the commands below were never literally runnable.**
> `pnpm test:adverse -- --suite <name>` looked like a suite-selection flag but isn't one —
> `test:adverse` (`vitest run --project adverse --passWithNoTests --no-file-parallelism`) has no
> `--suite` option; confirmed live, the flag is silently ignored or misinterpreted as a name filter,
> never a suite selector. `pnpm demo:scan`/`demo:trace`/`demo:readiness` (Scenarios 1 and 3) were never
> built — no such scripts exist in `package.json` or `scripts/`. Every scenario below now names the
> real file path(s) that actually exercise its claim, run for real during T235's validation pass — see
> PROGRESS.md's "Phase 11 (polish)" section for the recorded results.

---

## Prerequisites

- Node 22 LTS (the sandbox depends on the permission model — see [research.md](./research.md) R1)
- pnpm 9+
- Docker, for local PostgreSQL and Redis only
- A provider key for at least two AI vendors, or the recorded-fixture mode below

## Setup

```bash
pnpm install
cp .env.example .env                  # fill DATABASE_URL, REDIS_URL, provider keys, ENCRYPTION_KEY
docker compose -f infrastructure/docker-compose.yml up -d    # postgres + redis
pnpm db:migrate
pnpm db:seed                          # plans from the spec tier table + vendored capabilities
pnpm dev                              # web, api, worker, sandbox-runner — 5 units total; probe-pool
                                       # has no real dev process yet (infrastructure/deploy.md), so
                                       # `turbo run dev` runs its placeholder script harmlessly
```

Two vendors must be configured or the AI executor **refuses to start** — Principle IV's two-vendor
minimum is a startup check, not a runtime surprise (see
[contracts/realtime-and-internal.md](./contracts/realtime-and-internal.md)).

To run without provider spend, use `AI_MODE=fixtures`. Every test suite runs this way; a suite
needing live spend is a broken suite.

## Verify the install

```bash
pnpm test          # unit + contract
pnpm test:adverse  # every hostile suite — 11 named adversarial gates total (PROGRESS.md's scoreboard,
                   # 11/11 green as of Phase 10); Scenarios 2, 4-10 below walk 9 of them by name —
                   # SC-006 (attribution) and SC-008 (never billed for a platform failure) don't have
                   # their own numbered scenario here, but are exercised by the same full run
pnpm lint && pnpm typecheck
```

---

## Scenario 1 — First audit end to end (US1, SC-001, SC-002)

No `demo:scan` CLI ever existed to run this against a live provider by hand. The real, running proof is
`apps/web/tests/e2e/first-audit.spec.ts`, which drives the actual API (register → verify → target →
quote → accept → create scan → poll to `COMPLETED` → fetch report) against a real, in-process
`startApi`/`startWorker` boot and a local fixture site — the same claims this scenario states, proven
end to end rather than by hand:

```bash
pnpm --filter @webaudit/web exec playwright test tests/e2e/first-audit.spec.ts
```

Must observe, in order: a quote before any charge; a refusal to start until the quote is accepted;
per-area events arriving independently rather than all at once; a report carrying an overall score,
an executive summary, and issues ordered by severity; and every issue carrying a self-contained
remediation prompt.

Then confirm the two-layer ordering held (Principle III, FR-030) — the real, permanent assertion for
this is `apps/worker/tests/integration/layer-ordering.test.ts`:

```bash
pnpm test apps/worker/tests/integration/layer-ordering.test.ts
```

Every `CapabilityExecution` of a `CODE` layer capability must show `costMicros = 0`, and every code
layer execution must precede the module's first `AiInvocation`. A non-zero cost on a code-layer
capability is a Principle III violation.

## Scenario 2 — Nothing turns green unearned (US2, SC-007)

```bash
pnpm test:adverse apps/api/tests/adverse/verification.test.ts
```

Three assertions, each of which must leave the issue unresolved: assert fixed with the target
unchanged; bulk-assert every issue at once; and assert fixed where the check itself throws. Then, for
the positive case, fix the fixture target and confirm the issue reaches `RESOLVED` with a recorded
verification time and a `PASSED` attempt.

Confirm cost discipline (SC-005): the re-check charges 3 credits against the audit's 80.

## Scenario 3 — Readiness verdict and regressions (US3, FR-067, FR-069)

No `demo:readiness` CLI ever existed. The real, permanent proof:

```bash
pnpm test apps/worker/tests/integration/readiness.fresh.test.ts apps/worker/tests/integration/readiness.regression.test.ts apps/worker/tests/unit/readiness-diff.test.ts apps/worker/tests/unit/readiness-verdict.test.ts
```

Every area must be audited fresh — no `ModuleResult` may be copied from the baseline. Degrade one
fixture area deliberately before running, and confirm the decline is reported as a **named**
regression, not merely a lower score, and that the verdict is no-go with that blocker listed.

## Scenario 4 — Source is never retained (US4, SC-015)

```bash
pnpm test:adverse apps/worker/tests/adverse/workspace.test.ts
```

Four exit paths, four assertions: normal completion, mid-audit failure, timeout, and user
cancellation. After each, `Scan.workspacePath` must not exist on disk. This suite fails if any path
leaves a directory behind.

## Scenario 5 — Secrets never reach a provider (SC-016)

```bash
pnpm test:adverse packages/redaction/tests/adverse/redaction.test.ts
```

Fixture source and markup carry planted credentials. The provider client is intercepted, and no
planted value may appear in any outbound payload — while the credential must still appear as a
finding to the user. Both halves are required: silence is not a pass.

## Scenario 6 — The sandbox holds (SC-017)

```bash
pnpm test:adverse apps/sandbox-runner/tests/adverse/sandbox-escape.test.ts
```

A hostile fixture capability attempts filesystem read, filesystem write, outbound connection,
environment read, process spawn, and an allocation bomb. Each must return `FORBIDDEN_ACCESS` or
`MEMORY_EXCEEDED`; the host must survive all six.

**As of Phase 10 (Session 7/8), `sandbox-runner` exists, is deployed, and real dispatch replaces the
`503`** — see `infrastructure/sandbox-runner.md` and `infrastructure/deploy.md`. Before it existed,
`POST /admin/capabilities/upload` correctly returned `503 SANDBOX_UNAVAILABLE`; a fallback to
unsandboxed execution was, and remains, the one failure mode this project treats as unshippable.

## Scenario 7 — SSRF is refused (SC-018)

```bash
pnpm test:adverse packages/safe-net/tests/adverse/ssrf.forms.test.ts packages/safe-net/tests/adverse/ssrf.rebinding.test.ts packages/safe-net/tests/adverse/ipv6-classifier-gaps.test.ts
```

Table-driven across private, loopback, link-local, and metadata addresses in decimal, octal, hex,
and IPv6 forms; redirect chains whose final hop is private; and a rebinding server that answers
public during validation and private at connect. The rebinding case is the one a resolve-time-only
check fails.

## Scenario 8 — Control gate holds (SC-021)

```bash
pnpm test:adverse apps/api/tests/adverse/control-gate.test.ts apps/api/tests/adverse/verification-proof.test.ts
pnpm test apps/worker/tests/integration/orchestrator-control-gate.test.ts
```

A load-generating check must be refused against an attested-only target, a target whose token was
removed after issue, and a target verified by a different account. Separately, confirm US1 scenario
8: an audit including a gated check on an unverified target still completes every other check, and
does not charge for the gated one.

## Scenario 9 — Credit integrity (SC-022)

```bash
pnpm test:adverse apps/api/tests/adverse/credits.property.test.ts apps/api/tests/adverse/credits.expiry-race.test.ts apps/api/tests/adverse/credits.refund-to-lot.test.ts
```

Property test over random grant / debit / refund / renewal sequences. Two invariants must never
break: no purchased credit is lost at renewal, and no purchased credit is drawn while plan credits
remain. Also assert a refund returns to the lot it came from — the case a two-column balance cannot
get right (see [data-model.md](./data-model.md)).

## Scenario 10 — Degradation, not failure (SC-011, SC-012)

```bash
pnpm test:adverse apps/worker/tests/adverse/capability-disable.test.ts apps/worker/tests/adverse/capability-failure.test.ts apps/worker/tests/adverse/provider-exhaustion.test.ts
```

Disable each capability in turn: every audit must still complete. Then make all providers fail:
measured findings must still be delivered, the area marked `DEGRADED` with a reason, and the report
must say so rather than presenting a thinner audit as a complete one.

---

## Scenario 11 - Design fidelity (constitution v1.1.0)

```bash
pnpm lint          # adherence: tokens, props, fonts
pnpm test:visual   # fidelity: 1440 and 390 against design-system/reference-pages/
```

The adherence pass must reject a raw hex colour, a raw px value, an undeclared font family, and an
invalid component prop. Verify by introducing each of the four deliberately and confirming four
distinct failures.

The visual pass must diff every ported surface at both viewports. Confirm the mobile scale actually
applies: the display size must measure 24px at 390px wide, not 48px. That is the single easiest
thing to get wrong, because the tokens exist but the reference never wired them.

Then confirm no page issues a runtime request to a font CDN, an icon CDN, or any third-party asset
host.

## Definition of done for this feature

- All ten scenarios pass, `pnpm test:adverse` green.
- No `NEEDS CLARIFICATION` anywhere in the spec or plan.
- Every `Issue` row carries a non-null `attribution` (SC-006).
- Margin queryable per scan, per area, and per capability (FR-085, SC-009).
- Enabling a capability requires no deploy (SC-010).
- `WebAuditAI_ARCHITECTURE.md` corrected on the three points in [research.md](./research.md) "Open
  items", per Constitution Governance.
- `pnpm lint` clean with the design-system adherence rules active (constitution v1.1.0).
- `pnpm test:visual` green at 1440 and 390 for every surface in `design/screen-map.md`.
- Zero runtime requests to font, icon, or asset CDNs from any page we serve.
- No surface shipped that has no row in `design/screen-map.md`.
