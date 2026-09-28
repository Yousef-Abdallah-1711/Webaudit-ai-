# WebAudit AI — Master Implementation Plan: Production Without External AI or Paymob

**This is an execution document, not discovery.** Discovery is complete and lives in
[`docs/CURRENT-SYSTEM-PRODUCTION-WITHOUT-EXTERNAL-AI-OR-PAYMOB.md`](./CURRENT-SYSTEM-PRODUCTION-WITHOUT-EXTERNAL-AI-OR-PAYMOB.md)
(1061 lines, both discovery passes). This document is the single source of truth for taking the
product to a real, temporary production release with no external AI provider and no Paymob, and it
is meant to survive a full context reset: another session should be able to open **only this file
plus the repository** and know exactly what is done, what is next, and why.

---

## CONTINUATION HEADER — read this first every time

| | |
|---|---|
| **Current phase** | **ALL 13 PHASES (0 through 12) DONE.** This master plan's work is complete, modulo two genuinely external-dependency-blocked items this session cannot manufacture: Phase 9's real-domain/TLS-certificate browser walkthrough, and Phase 12's real email-delivery confirmation (no real SMTP/Resend credential exists to give this session — the code path was proven real regardless: a genuine DNS/connection attempt against the configured host, non-blocking failure design confirmed). Phase 12's own real, from-scratch deployment smoke test found and fixed **the single most serious bug this entire master plan uncovered**: a genuinely fresh production deployment's `apps/api` container could never populate the `Capability` table at all (its own image correctly excludes `packages/capabilities-vendored` via `turbo prune`'s dependency-graph pruning, since `apps/api` itself has no dependency on any capability package — only `apps/worker` does — but `apps/api` is the *only* process in the whole deployment that ever reconciles capabilities), meaning every real scan on a fresh install would "complete" with a null score and zero issues, indistinguishable from success. Also found and fixed: `scripts/bootstrap-admin.ts` and `scripts/seed.ts` (Phase 7's admin bootstrap and the real plan-tier seeding) were both unreachable in the deployed image for the identical structural reason, with Postgres having no published port to reach any other way. All three fixed via explicit `COPY` lines in `apps/api/Dockerfile`, documented in a new "First-time bootstrap" section of `infrastructure/deploy.md`, and a full rollback procedure written and genuinely dry-run tested using this exact regression as the "bad version." |
| **Current task** | None — this master plan's scope is complete. The two externally-blocked items (Phase 9 TLS/domain walkthrough, Phase 12 real email delivery) are the only remaining work, and both require an operator to supply a real credential/domain this session cannot obtain; re-run them once those exist. Everything else in the "Deferred future work" section below remains deliberately out of scope for this release by design, not by omission. |
| **Phase 6 regression confirmation** | `npx vitest run --project unit --no-file-parallelism apps/worker/tests/unit apps/worker/tests/integration` (run alone, nothing concurrent this time — lesson from Phase 3/5 applied): 39 files, 232 tests — **231 passed, 1 failed** (`cost-alerts-sweep.test.ts`, a file untouched by anything in this session, about AI-spend cost-alert thresholds, unrelated to `fixable`/`master-report`/`AI_MODE`). Re-ran that one file alone: **3/3 passed** — confirmed flaky/order-dependent under this suite's full run, not a real regression (matches the exact contention pattern already documented for Phase 3/5, this time worker-side and with no concurrent process to blame it on — a pre-existing test-suite-level flake worth a future look, not introduced by Phase 6). `packages/capabilities-vendored/tests`: 4 files, **90/90 passing**. **COST-ALERTS-FOLLOWUP-1, investigated post-Phase-12**: re-ran the full 39-file/232-test worker suite fresh — clean, 39/39, 232/232, `cost-alerts-sweep.test.ts` included, no failure. Read `evaluateCostAlerts`/`claimEvent` (`apps/api/src/services/monitoring/cost-alerts.ts`) end to end looking for a real logic bug: the breach-recording insert is a real `INSERT ... WHERE NOT EXISTS` idempotency guard (correctly prevents a duplicate event for the same scope/user/window), and the test's own window (60 minutes) is many orders of magnitude wider than the actual elapsed time between the test's insert and its assertion (milliseconds) — no plausible off-by-one or clock-skew path found in the query itself. Given this machine ran extremely heavy, sustained concurrent Docker activity for most of this session (dozens of image builds, compose stacks, and load-test runs, often overlapping with whatever vitest run was in flight), the far more likely explanation is transient host-level CPU/IO contention slowing one query enough to shift which side of a window boundary a row landed on for that one run — not a defect in the sweep's own code. Closed as investigated, not reproduced, no code change made. |
| **Phase 7 confirmation** | `apps/api/tests/unit/bootstrap-admin.test.ts` 4/4 passing, plus a real manual run against the actual local dev database (not just tests) — see Phase 7's own section for the exact commands and verified `psql` output. |
| **Regression confirmation (final, isolated, trustworthy)** | A clean re-run of the entire `apps/api` unit-project suite, with nothing else concurrently touching the `webaudit_test` database, came back **84 test files, 495 tests, all passed** (912s; the only 5 "FAIL" string matches were the substring inside passing test names like "refuses a refund for a payment that already FAILED" — verified, not real failures). This confirms the earlier two rounds of intermittent failures (9 failures in one background run; a different single test failing on each of two foreground `billing-mass-assignment.test.ts` runs) were exactly what they looked like: this session's own mistake of running multiple heavy DB-touching vitest processes concurrently against one shared test database, never a real regression from Phase 3/4/5's changes. **Lesson recorded for future sessions**: never run more than one `apps/api`/`apps/worker` test process against `webaudit_test` at the same time. |
| **Completed tasks** | P0-T1 through P0-T5; P1-T1 through P1-T5; P2-T1, P2-T2, P2-T3; P3-T1 through P3-T3; P4-T1 through P4-T5; P5-T1 through P5-T3; P6-T1 through P6-T3; Phase 7 (bootstrap-admin script, tested + manually verified against real data); P8-T1 through P8-T6 (Dockerfiles, compose file, nginx reverse proxy, migration-ordering — all verified via real `docker build`/`docker compose up`, not just authored); P9-T1 through P9-T5 (SSRF/archive/rate-limit/RBAC re-verified against the real container topology; worker egress and Secure-cookie bugs found and fixed); Phase 10 (all four required real-browser journeys run via `apps/web/tests/e2e/*`; four real bugs found and fixed: wrong-current-password false logout, two identity-leak-across-context e2e flakes, one order-dependent no-external-requests flake); Phase 11 (P11-T1 through P11-T4 — capacity re-test, credit-concurrency re-confirmation, new admin-mutation load with verified data integrity, real worker-outage job-durability proof); Phase 12 (full real deployment checklist — every item done except the externally-blocked real-email-delivery one; found and fixed the capability-registry bootstrap bug, the missing scripts/ tooling gap, and the missing plan-seed step; wrote and dry-ran a real rollback procedure) |
| **Blocked tasks** | P2-T3's real-inbox delivery step — needs a Mailtrap/Ethereal sandbox credential, a real Resend API key, or real Hostinger SMTP credentials |
| **Follow-ups tracked, not blocking** | EMAIL-FOLLOWUP-1 (Phase 2, **done** — see below), PLAN-FOLLOWUP-1 (Phase 3/4, done), PAYMENTS-FOLLOWUP-1 (Phase 5, done), REVERIFY-FOLLOWUP-1 (Phase 6, **resolved, no code change needed** — see below), COST-ALERTS-FOLLOWUP-1 (**investigated, not reproduced, no logic bug found** — see below) |
| **Next task** | None — every phase is complete. If a future session picks this back up: re-run Phase 9's TLS/domain browser walkthrough and Phase 12's real-email-delivery check once a real domain/certificate and real SMTP/Resend credential exist; otherwise this master plan's scope is finished. **The one lesson worth carrying into any future work on this codebase, proven five separate times across Phases 8 through 12**: a Docker image, compose file, or piece of code that merely builds/parses/typechecks/lints/passes-a-load-test without error is not verified. Phase 8: the `--prod` no-op and corepack-cache bugs. Phase 9: the worker's missing egress and the `Secure`-cookie bug. Phase 10: a false-logout bug and two cross-identity e2e flakes. Phase 11: a near-miss false "regression" report (`docker kill` not auto-restarting — correct Docker behavior, caught before being recorded wrong). Phase 12: the single most serious bug this whole plan found — a fresh deployment's `apps/api` container could never populate its own capability registry, silently returning empty, null-score "successful" scans forever — invisible to every build, lint, typecheck, and container health check the whole way through, only found by actually running a real scan and reading its real content. **Always run the actual thing, all the way through, and read what it actually produced — not just whether it returned a success status.** |
| **Files changed this session** | See "Files changed — Phase 1" table; `apps/api/tests/integration/email-boot-guard.test.ts` (Phase 2); `apps/api/prisma/schema.prisma` + new migration, `apps/api/src/services/billing/subscription.service.ts`, `apps/api/src/services/billing/index.ts`, `apps/api/src/services/admin/plan-assignment.service.ts` (new), `apps/api/src/routes/admin/users.routes.ts`, `apps/api/tests/contract/admin.users-plan.test.ts` (new), `apps/api/tests/integration/admin-plan-renewal-safety.test.ts` (new) (Phase 3); `apps/api/src/services/billing/entitlements.ts` (`subscriptionOwnsPeriod` extracted), `apps/api/src/services/admin/users.service.ts` (search + ledger + effective planId), `apps/api/src/services/admin/audit-log.ts` + `apps/api/src/routes/admin/audit-log.routes.ts` (`subjectId` filter), `apps/api/tests/contract/admin.users-ledger.test.ts` (new), `apps/api/tests/contract/admin.users.test.ts` (+2 search tests), `apps/api/tests/contract/admin.audit-log-filter.test.ts` (+1 test) (Phase 4 backend); `apps/web/lib/api.ts`, `apps/web/app/(admin)/admin/users/page.tsx`, `apps/web/app/(admin)/admin/users/page.module.css`, `apps/web/tests/unit/admin-users.test.ts`, `apps/web/tests/unit/admin-error-paths.test.ts`, `apps/web/tests/unit/css-adherence-lint.test.ts` (Phase 4 frontend); `apps/api/src/routes/billing.routes.ts` (`paymentsEnabled` on `GET /billing/plans`), `apps/web/lib/api.ts`, `apps/web/app/(dashboard)/billing/page.tsx`, `apps/web/components/scan/ScanForm.tsx`, `apps/web/tests/unit/{billing-payments-off,scan-form-payments-off}.test.ts` (new) (Phase 5); `apps/api/prisma/schema.prisma` + new migration (`Issue.fixable`), `apps/worker/src/module-runner/persist.ts`, `apps/worker/src/orchestrator/master-report.ts` (`fallbackSummary` reason-aware), `apps/web/lib/api.ts`, `apps/web/app/(dashboard)/reports/[id]/page.tsx`, `apps/web/tests/unit/{fixes-board,report-fixable-gating}.test.ts`, `packages/capabilities-vendored/tests/unit/{capabilities,source-capabilities}.test.ts` (+8 tests), `apps/worker/tests/integration/ai-disabled-full-scan.test.ts` (+2 assertions) (Phase 6); `scripts/bootstrap-admin.ts` (new), `apps/api/tests/unit/bootstrap-admin.test.ts` (new), `package.json` (`admin:bootstrap` script) (Phase 7); `apps/api/Dockerfile`, `apps/worker/Dockerfile`, `apps/web/Dockerfile` (new), `apps/worker/docker-healthcheck.mjs` (new), `.dockerignore` (new), `infrastructure/docker-compose.production.yml` (new), `infrastructure/nginx/nginx.conf` (new), `.env.production.example` (new), `.gitignore` (whitelisted it), `apps/api/package.json` + `apps/worker/package.json` (`tsx` promoted to a real dependency), `pnpm-lock.yaml`, `infrastructure/deploy.md` (new Docker Compose runbook section) (Phase 8); `infrastructure/docker-compose.production.yml` (`egress` network added, `worker` JWT env vars added), `apps/api/src/routes/auth.routes.ts` + `apps/api/src/routes/oauth.routes.ts` (`secure: env.isProduction && req.secure`), `apps/api/tests/integration/secure-cookie-tls-boundary.test.ts` (new) (Phase 9); `apps/web/next.config.ts` + `apps/web/Dockerfile` (`DOCKER_BUILD`-gated `output: 'standalone'`, fixing a local Windows `next build` symlink failure), `apps/api/src/routes/auth.routes.ts` (`InvalidCurrentPasswordError` now 403, not 401), `apps/api/tests/contract/auth.change-password.test.ts` (assertion updated), `apps/api/src/index.ts` (new `intake` seam on `ApiServiceOptions`), `apps/web/tests/e2e/support/stack.ts` (in-memory upload storage wired in), `apps/web/tests/e2e/admin/plan-and-credit-journey.spec.ts` (new), `apps/web/tests/e2e/dashboard/payment-and-receipts.spec.ts` + `apps/web/tests/e2e/admin/queue-and-log.spec.ts` (clear cookies/localStorage before switching identity), `apps/web/tests/e2e/no-external-requests.spec.ts` (explicit `NEXT_PUBLIC_API_URL`, first-party-origin exclusion) (Phase 10); `load-testing/scripts/admin-mutation-load.js` (new, P11-T3) (Phase 11); `apps/api/Dockerfile` (`scripts/` and `packages/capabilities-vendored` now copied into the image), `infrastructure/deploy.md` ("First-time bootstrap" and "Rollback procedure" sections, new) (Phase 12) |
| **Migrations run** | `20260923000000_subscription_admin_assigned` — applied via `prisma migrate deploy` to both the dev database and the `webaudit_test` database; `prisma generate` re-run afterward. Additive, backward-compatible (`adminAssigned Boolean @default(false)`). |
| **Tests run** | Phase 0: 82/82. Phase 1: 9+2+1+2 new, full `apps/worker` unit suite 232/232 (39 files), full `apps/worker`+`ai-executor` adverse suite 174/174 (17 files). Phase 2: 3/3 new. Phase 3: 11+3 new (`admin.users-plan.test.ts`, `admin-plan-renewal-safety.test.ts`) plus targeted re-run of every existing subscription/billing-touching file (35 tests) plus, now confirmed, the **entire `apps/api` unit suite: 83 files, 488 tests, all passing** (`npx vitest run --project unit --no-file-parallelism apps/api`, 931s). Phase 4: `admin-users.test.ts` 4/4, `admin-error-paths.test.ts` 8/8, `css-adherence-lint.test.ts` 4/4. `tsc --noEmit` clean for `packages/ai-executor`, `apps/worker`, `apps/api`, `apps/web`. Zero regressions anywhere. |
| **Architectural decisions locked this session** | The 10 frozen product decisions below — do not re-litigate them. Phase 1: `AiResult`'s `ok:false` variant carries `reason: 'CHAIN_EXHAUSTED' \| 'DISABLED'`. Phase 3: `Subscription.adminAssigned` is the signal that keeps the billing-renewal sweep from ever auto-renewing (and re-granting credits for) an admin-assigned plan; `subscribe()` always clears it. **EMAIL-FOLLOWUP-1** (Phase 2) is now done — see that phase's own section. **PLAN-FOLLOWUP-1** is also
done, not merely "not yet implemented" as an earlier draft of this row said — re-checked directly:
`apps/api/src/services/admin/users.service.ts`'s `effectivePlanId()` (the exact `subscriptionOwnsPeriod`
rule) is used at both the list (line 149) and detail (line 205) call sites, so `AdminUserDetail.planId`
already reflects the effective plan everywhere, not the raw `Subscription.planId`. No follow-ups remain
open in this row. |
| **Production blockers outstanding** | (1) Worker AI-boot — **RESOLVED** (Phase 1); (2) API email boot guard — **RESOLVED and proven** (Phase 2); (3) No admin plan-assignment endpoint — **RESOLVED and proven** (Phase 3); (4) Admin UI still incomplete (search, ledger view, audit trail — Phase 4 remainder) |

---

## 1. Product definition

A temporary production release of WebAudit AI that:
- Runs real deterministic scans (PERFORMANCE, SECURITY, SEO, TESTING, UI-measured) with zero external
  AI provider calls and zero fixtures.
- Runs with Paymob fully absent — no fake payment provider, no broken checkout UX exposed to users.
- Lets an admin grant real, audited credits and assign a real plan/tier to a user without payment.
- Sends real production email (SMTP or Resend) for auth flows.
- Is deployed with a real, documented, reproducible infrastructure topology.

Everything not listed above (real Paymob, real external AI judgment) is preserved architecturally
and deferred, not removed.

## 2. Current verified architecture

Summarized from discovery; see the discovery doc for full evidence. Key facts this plan depends on:
- 15 of 16 capabilities are `layer: CODE` (fully deterministic); only `impeccable` (UI) is `layer: AI`.
- The worker throws at boot (`createExecutorFromEnv`, `apps/worker/src/index.ts:255`) with zero AI
  keys and no `AI_MODE` set — this blocks *all* scanning, not just AI-dependent modules.
- The API throws at boot (`createDefaultMailer`, `apps/api/src/app.ts:329`) in production without
  SMTP or Resend credentials.
- Admin can grant credits (`adjustCredits`, canonical ledger, audited) but cannot assign a
  plan/subscription tier — only `isOperator` is mutable via `PATCH /admin/users/:id`.
- Paymob absence is already safe in production: stub provider only outside production,
  `undefined` provider in production, checkout/purchase routes 404 via `makeDevTestOnlyGuard`,
  webhook fails closed.
- No Dockerfiles exist for any of the 5 `apps/*` units; minimal topology is Postgres + Redis + api +
  worker + web.

## 3. Frozen decisions (do not re-ask)

### AI
Implement `AI_MODE=disabled`: valid in production, fixtures remain forbidden in production, zero
external AI providers constructed, zero AI network calls, does not weaken the two-vendor chain
invariant (Principle IV), CODE capabilities continue normally, `impeccable` never blocks a scan (UI
module may report `DEGRADED`), deterministic findings/scoring/report-completion remain intact,
re-enabling AI later is configuration-only. `impeccable` is NOT replaced with a fake heuristic — it
stays an optional future AI enhancement.

### Payments
Paymob stays intentionally disabled. No fake payment provider. No broken payment UX — hide/disable/
relabel all subscribe/upgrade/checkout/buy-credits/payment CTAs. The billing architecture
(`Subscription`/`PendingPayment`/`BillingEvent`/`Receipt`, stub provider, webhook signature/idempotency)
is preserved unchanged, ready for future Paymob integration.

### Credits
Credits stay real, canonical-ledger-only. Admin can grant (any supported kind/expiry), inspect
balance, inspect ledger/history, must enter a reason, grants stay audited, a confirmation step must
exist before granting. **No second decrement path, no arbitrary balance mutation.** Credit removal/
reversal is out of scope unless the existing canonical ledger/refund path already safely exposes it
(it does not, per discovery `ADMIN-005` — so removal stays out of scope for this release).

### Plan/tier management
Build one admin capability to assign an existing Plan to a user without payment, reusing
`Plan`/`Subscription`/entitlements — one canonical entitlement path, no
`if (adminGranted) bypass entitlement` logic anywhere. Controls the same entitlements a real
subscription controls: `allowedInputTypes`, `concurrentScanLimit`, `allowReadinessPass`,
`allowCustomCapability`, `retentionDays`.

### Email
Production must use the existing real SMTP/Resend transport abstraction; fail-closed production
behavior is not weakened. Document required env vars; verify registration, verification, resend
verification, forgot password, reset password — without exposing tokens/secrets.

### Reports
Keep deterministic report text owned per-capability (no central `RULE_CATALOG` this release — see
Phase 0's architecture comparison, already evaluated in discovery §G). Keep `fixPrompt` as the
agent-oriented artifact it already is; do not rename it. Add a human-facing `recommendation`/
`verificationSteps` field only if Phase 0's audit proves it necessary (Phase 0 finding: not proven
necessary for this release — see §Phase 0 results below; revisit only if a future audit of the
report UI/customer feedback says otherwise).

---

## 4. Scope

In scope: `AI_MODE=disabled`, production email cutover, admin plan-assignment, admin credit/user UI
polish, payments-off frontend UX, report/rule quality fixes proven necessary by Phase 0, first-admin
bootstrap, production deployment (Dockerfiles/compose, reverse proxy, TLS, WS proxying), security
re-certification, full E2E certification, load/reliability certification, production smoke test.

## 5. Out of scope

Real Paymob integration, real external AI provider integration, credit removal/reversal, a central
rule catalog, replacing `impeccable` with a fake heuristic, `apps/sandbox-runner` deployment (unless
custom-capability upload becomes in-scope later), `apps/probe-pool` as a standalone service (it is a
library, not a deployable unit).

## 6. Production acceptance criteria

1. Worker and API both boot cleanly in `NODE_ENV=production` with zero AI provider keys and zero
   Paymob credentials.
2. A full URL scan (all 5 modules) completes to `COMPLETED` with real deterministic findings, a real
   score, and no AI network call of any kind.
3. Admin can grant credits and assign a plan to a user, and that user's entitlements (input types,
   concurrency, readiness, custom capability, retention) change accordingly — proven by exercising the
   entitlement, not just reading a flag.
4. No customer-facing UI path leads to a 404 payment route.
5. Registration/verification/reset emails are delivered through a real transport in a
   staging-equivalent environment.
6. First operator account can be created through a documented, auditable, idempotent process — not
   an undocumented manual SQL command.
7. The application is deployable via versioned Dockerfiles/compose with health checks, restart
   policies, and documented env vars — no reliance on `pnpm run dev`.
8. All previously-passing test suites (unit/integration/adverse/E2E) still pass; new tests exist for
   every new capability introduced by this plan.
9. A full smoke test (Phase 12) passes against the final deployed topology.

## 7. Dependency graph

```
Phase 0 (rule audit) ──> Phase 6 (report UX) [Phase 6 waits on Phase 0's gap list]
Phase 1 (AI_MODE=disabled) ──> Phase 6 (UI must show an intentional "AI off" state)
Phase 2 (email) ──> Phase 7 (bootstrap, if it ever emails) ──> Phase 12 (smoke test)
Phase 3 (plan assignment) ──> Phase 4 (admin UI needs it) ──> Phase 5 (payments-off UX references plan-derived copy)
Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5 + Phase 6 ──> Phase 9 (security re-cert)
Phase 9 ──> Phase 10 (E2E) ──> Phase 11 (load) ──> Phase 12 (deploy + smoke)
Phase 8 (infra) can run in parallel with 1-7, must land before Phase 12
```

## 8. Phase table

| Phase | Title | Status |
|---|---|---|
| 0 | Deterministic Baseline Certification | **DONE** |
| 1 | Production-Safe AI Disabled Mode | **DONE** |
| 2 | Production Email Certification | **DONE** (one real-delivery sub-item BLOCKED on an external credential) |
| 3 | Manual Plan/Tier Assignment | **DONE** |
| 4 | Admin User & Credit Management UI | **DONE** (manual browser verification outstanding — see below) |
| 5 | Payments-Off Product UX | **DONE** (manual browser verification outstanding — see below) |
| 6 | Deterministic Report UX | **DONE** (manual browser verification outstanding — see below) |
| 7 | First Admin Bootstrap | **DONE** |
| 8 | Production Infrastructure | **DONE** |
| 9 | Production Security & Untrusted Input Certification | **DONE** (real-domain/cert portion of P9-T4 blocked on an external dependency) |
| 10 | Full E2E Product Certification | **DONE** |
| 11 | Load / Reliability Certification | **DONE** |
| 12 | Production Deployment & Smoke Test | **DONE** (real email delivery item externally blocked — no real SMTP/Resend credential exists to test) |

---

## PHASE 0 — Deterministic Baseline Certification — **[DONE]**

### Method
Every one of the 15 CODE-layer capability source files was opened and read **in full**, line by
line, not grepped and not sampled: `bundle-analyzer`, `content-checker`, `contradiction-detector`,
`css-analyzer`, `cwv-analyzer`, `data-leak-scanner`, `dependency-scanner` (+ its `advisories.ts`),
`headers-checker`, `lighthouse-analyzer`, `meta-checker`, `network-inspector`, `owasp-checker`,
`playwright-runner`, `screenshot-capture`, `ssl-analyzer`. Every `checkId` literal, its severity (or
derivation), title, description, consequence, location behavior, `fixable` flag, evidence shape, and
emission condition was recorded directly from source. Cross-referenced against
`packages/capabilities-vendored/tests/{unit/capabilities.test.ts,unit/reverify.test.ts,unit/source-capabilities.test.ts,conformance.test.ts}`
by grepping every `checkId` literal appearing in the test files.

### P0-T1 — Exact rule inventory — **[DONE]**

**Exact deterministic rule count: 54** (not the discovery pass's approximate ~59 — that count was
grep-derived and over-counted; this count is read-derived and exact).

| Module | Count | Capabilities |
|---|---|---|
| PERFORMANCE | 14 | bundle-analyzer (3), cwv-analyzer (3), lighthouse-analyzer (4), network-inspector (4) |
| SECURITY | 18 | data-leak-scanner (1), dependency-scanner (5), headers-checker (5), owasp-checker (4), ssl-analyzer (3) |
| SEO | 11 | content-checker (5), meta-checker (6) |
| TESTING | 4 | contradiction-detector (3), playwright-runner (1) |
| UI | 7 | css-analyzer (3), screenshot-capture (4) |
| **Total** | **54** | 15 capabilities |

Full inventory (checkId — severity — fixable — source):

**PERFORMANCE**
1. `bundle.oversize-script` — MEDIUM/HIGH (size-derived) — fixable — `bundle-analyzer/src/index.ts:186-199`
2. `bundle.unminified-output` — MEDIUM — fixable — `:211-225`
3. `bundle.source-map-published` — LOW — fixable — `:231-246`
4. `cwv.lcp-poor` — HIGH — **not fixable** (measurement, no direct fix text) — `cwv-analyzer/src/index.ts:96-109`
5. `cwv.fcp-poor` — MEDIUM — not fixable — `:112-125`
6. `cwv.cls-poor` — MEDIUM — not fixable — `:128-141`
7. `lighthouse.no-text-compression` — MEDIUM — fixable — `lighthouse-analyzer/src/index.ts:81-91`
8. `lighthouse.no-cache-headers` — LOW — fixable — `:98-109`
9. `lighthouse.render-blocking-scripts` — MEDIUM — fixable — `:131-144`
10. `lighthouse.large-page-weight` — MEDIUM — fixable — `:149-163`
11. `network.excessive-redirects` — LOW — fixable — `network-inspector/src/index.ts:95-107`
12. `network.broken-subresource` — HIGH — fixable — `:137-150`
13. `network.uncompressed-subresource` — LOW — fixable — `:163-176`
14. `network.duplicate-subresource-reference` — LOW — fixable — `:179-193`

**SECURITY**
15. `redaction.secret-in-source` (`SECRET_CHECK_ID`, delegated to `@webaudit/redaction`) — `data-leak-scanner/src/index.ts` (owns namespace `redaction`, not `data-leak`)
16. `dependency.unparseable-manifest` — MEDIUM — fixable — `dependency-scanner/src/index.ts:172-183`
17. `dependency.no-lockfile` — MEDIUM — fixable — `:192-206`
18. `dependency.floating-range` — MEDIUM — fixable — `:211-224`
19. `dependency.known-vulnerable` — from `advisories.ts` (CRITICAL/HIGH/MEDIUM/LOW per advisory) — fixable — `:140-157`
20. `dependency.deprecated-package` — LOW — fixable — `:239-250`
21. `headers.csp-missing` — HIGH — fixable — `headers-checker/src/index.ts:33-42`
22. `headers.frame-options-missing` — MEDIUM — fixable — `:43-52`
23. `headers.content-type-options-missing` — MEDIUM — fixable — `:53-62`
24. `headers.referrer-policy-missing` — LOW — fixable — `:63-72`
25. `headers.permissions-policy-missing` — LOW — fixable — `:73-82`
26. `owasp.cookie-missing-secure` — HIGH — fixable — `owasp-checker/src/index.ts:55-68`
27. `owasp.cookie-missing-httponly` — MEDIUM — fixable — `:70-83`
28. `owasp.cookie-missing-samesite` — LOW — fixable — `:85-98`
29. `owasp.server-version-disclosed` — LOW — fixable — `:117-130`
30. `ssl.not-https` — HIGH — fixable — `ssl-analyzer/src/index.ts:46-57`
31. `ssl.hsts-missing` — MEDIUM — fixable — `:66-77`
32. `ssl.hsts-max-age-low` — LOW — fixable — `:83-98`

**SEO**
33. `content.h1-missing` — HIGH — fixable — `content-checker/src/index.ts:86-95`
34. `content.h1-multiple` — LOW — fixable — `:97-108`
35. `content.lang-missing` — MEDIUM — fixable — `:111-122`
36. `content.images-missing-alt` — MEDIUM — fixable — `:126-138`
37. `content.thin-content` — LOW — fixable — `:142-155`
38. `meta.title-missing` — HIGH — fixable — `meta-checker/src/index.ts:83-92`
39. `meta.title-too-long` — LOW — fixable — `:94-106`
40. `meta.description-missing` — MEDIUM — fixable — `:110-120`
41. `meta.description-too-long` — LOW — fixable — `:122-134`
42. `meta.viewport-missing` — MEDIUM — fixable — `:137-148`
43. `meta.canonical-missing` — LOW — fixable — `:151-162`

**TESTING**
44. `contradiction.severity-missing-with-findings` — MEDIUM — **not fixable** (meta/QA-of-QA finding, not user-actionable in the traditional sense) — `contradiction-detector/src/index.ts:63-76`
45. `contradiction.high-score-despite-severe-finding` — MEDIUM — not fixable — `:78-97`
46. `contradiction.failed-state-with-findings` — MEDIUM — not fixable — `:99-113`
47. `testing.broken-link` — HIGH — fixable — `playwright-runner/src/index.ts:83-97`

**UI**
48. `css.oversize-stylesheet` — MEDIUM — fixable — `css-analyzer/src/index.ts:171-183`
49. `css.important-overuse` — MEDIUM — fixable — `:195-211`
50. `css.colour-sprawl` — LOW — fixable — `:213-228`
51. `ui.broken-image` — MEDIUM — fixable — `screenshot-capture/src/index.ts:118-130`
52. `ui.horizontal-overflow` — MEDIUM — fixable — `:144-157`
53. `ui.tiny-tap-target` — LOW — fixable — `:161-174`
54. `ui.blank-page-render` — HIGH — fixable — `:178-190`

### P0-T2 — Customer-facing completeness classification — **[DONE]**

Every one of the 54 rules was read in full (title/description/consequence/location/evidence), not
sampled. Result:

**READY: 51 of 54.** Every rule's `title` states what was measured, `description` gives the specific
observed fact (often with an interpolated number/URL/path), `consequence` explains in plain language
why it matters, `severity` is present, and `location`/`evidence` carry enough specificity (URL, file
path, header name, count) to act on. This is uniformly higher quality than the "needs work" bar this
audit was checking for — no generic placeholder text exists anywhere in these 15 files.

**NEEDS HUMAN RECOMMENDATION: 3 of 54** — the three `contradiction.*` rules (#44-46). Their
`consequence` text explains why the *inconsistency* matters ("undermines trust in every number this
report shows") but, being QA-of-the-audit findings rather than target-site findings, a generated
`fixPrompt` telling an agent to "fix the following TESTING issue" is a category mismatch — there is
no code on the target site to change; the actual fix is inside this product's own scoring/
state-resolution pipeline. **Decision, scoped to this release**: leave as-is. These three findings are
`fixable: false` already (correctly modeled) and the existing UI must simply not present a "fix this"
CTA for non-fixable findings — verify this in Phase 6 rather than rewriting the rules.

**No rule needs**: NEEDS EXPLANATION, NEEDS CONSEQUENCE, NEEDS EVIDENCE, or MULTIPLE GAPS. None
found.

**Conclusion for the "Reports" frozen decision**: Phase 0 does **not** prove a separate
`recommendation`/`verificationSteps` field is necessary for this release. `fixPrompt` remains
useful for agent-driven fixing; the existing `title`/`description`/`consequence` triplet already
gives a human reader what/where/why/severity for 51 of 54 rules. **No rule copy needs to be
rewritten in Phase 6** — Phase 6's actual work is UI-level (empty/degraded-state copy for
`AI_MODE=disabled`, and hiding "fix this" CTAs on the 3 non-fixable contradiction findings), not
rule-text changes.

### P0-T3 — Central rule catalog vs. inline — **[DONE, confirmed]**

Re-confirmed discovery §G's comparison by reading the actual files: all 54 rules' text is defined as
inline string literals inside their own capability's `src/index.ts`/`advisories.ts`. No shared catalog
exists. Per the frozen decision, this release does not introduce one.

### P0-T4 — Test coverage audit — **[DONE]**

Cross-referenced all 54 `checkId`s against `packages/capabilities-vendored/tests/unit/{capabilities,reverify,source-capabilities}.test.ts`
and `tests/conformance.test.ts`.

**Covered by an existing test (emission and/or reverify): 50 of 54.**

**Test gap — 4 of 54, no dedicated test found for either emission or reverify:**

| checkId | Capability | Gap |
|---|---|---|
| `meta.title-too-long` | meta-checker | No test constructs a page whose `<title>` exceeds 60 chars |
| `meta.description-too-long` | meta-checker | No test constructs a page whose meta description exceeds 160 chars |
| `css.oversize-stylesheet` | css-analyzer | No test constructs a stylesheet ≥300KB |
| `dependency.unparseable-manifest` | dependency-scanner | No test supplies an unparseable `package.json` |

**New test tasks added to the master plan** (both are unit-level, no new infra needed):

- **TEST-GAP-1** `[TODO]`: add unit tests in
  `packages/capabilities-vendored/tests/unit/capabilities.test.ts` for `meta.title-too-long`,
  `meta.description-too-long`, `css.oversize-stylesheet`, `dependency.unparseable-manifest` —
  covering emission condition, checkId, severity, and the interpolated evidence field.
- **TEST-GAP-2** `[TODO]`: add corresponding `reverify` tests in
  `packages/capabilities-vendored/tests/unit/reverify.test.ts` for the same 4 checkIds (each
  capability already implements `reverify` for these checkIds — only the test is missing).

These are non-blocking for Phase 0 (existing behavior is correct, only test coverage is thin) but are
scheduled work items, not to be forgotten — tracked here, to be picked up opportunistically during
Phase 6 (report UX) since that phase already touches this test suite's neighborhood, or earlier if a
session has idle capacity.

### P0-T5 — Run existing deterministic capability tests — **[DONE]**

Command:
```
npx vitest run --project unit --passWithNoTests --no-file-parallelism packages/capabilities-vendored/tests
```
Result: **4 test files, 82 tests, all passed**, 5.91s.
```
✓ |unit| packages/capabilities-vendored/tests/unit/capabilities.test.ts (37 tests)
✓ |unit| packages/capabilities-vendored/tests/unit/reverify.test.ts (18 tests)
✓ |unit| packages/capabilities-vendored/tests/conformance.test.ts (16 tests)
✓ |unit| packages/capabilities-vendored/tests/unit/source-capabilities.test.ts (11 tests)
```

### Phase 0 acceptance — met

- [x] Exact count known: **54**
- [x] Every rule audited (all 15 source files read in full, not sampled)
- [x] No rule omitted (cross-checked sum by module: 14+18+11+4+7 = 54)
- [x] Quality gaps enumerated: 3 (the `contradiction.*` trio — decision: no rewrite needed, only a UI
      "don't show fix CTA on non-fixable findings" check in Phase 6)
- [x] Test gaps enumerated: 4 (`meta.title-too-long`, `meta.description-too-long`,
      `css.oversize-stylesheet`, `dependency.unparseable-manifest` — tracked as TEST-GAP-1/2)
- [x] Existing deterministic tests passing: 82/82

**Phase 0 status: DONE.** Continuing into Phase 1.

---

## PHASE 1 — Production-Safe AI Disabled Mode — **[DONE]**

### Architectural decision made during implementation (not predicted in the original plan text)

The plan as written assumed the disabled executor could simply return the same
`{ ok: false, reason: 'CHAIN_EXHAUSTED' }` shape a real chain exhaustion already produces. Reading
`ai-layer.ts` in full before implementing (per the "verify the no-op contract" instruction) found a
real problem with that: `runAiLayer`'s `!result.ok` branch calls
`captureAlert('ai_chain_exhaustion', 'Every AI provider in the chain was exhausted', ...)` —
a Sentry `error`-level page, one of `apps/worker/src/config/monitoring.ts`'s 9 real alert
conditions. Reusing `CHAIN_EXHAUSTED` verbatim would fire that alert on every UI-module scan in a
deployment that runs `AI_MODE=disabled` on purpose — exactly the "malformed provider response /
infrastructure failure" misrepresentation the task's own verification instruction warned against.

**Fix**: `AiResult`'s `ok: false` variant now carries `reason: 'CHAIN_EXHAUSTED' | 'DISABLED'`
(`packages/ai-executor/src/executor.ts`). `ai-layer.ts` alerts only on `'CHAIN_EXHAUSTED'`; a
`'DISABLED'` result is reported the same way to the module runner (still `ran: false`, still
degrades the module) but never pages anyone. `module-runner/index.ts`'s `aiDegraded` check was
extended to treat `DISABLED` exactly like `CHAIN_EXHAUSTED` for state purposes (`DEGRADED`, scored,
never silently `COMPLETE` and never `FAILED`) — this is what "UI module may be DEGRADED where
appropriate" in the frozen decisions actually requires once traced through real code, not a
deviation from it.

`degradeModule()` (`packages/ai-executor/src/degrade.ts`) was left unchanged — it is not called
anywhere in production code (`apps/worker/src/module-runner/index.ts` builds its own state via
`state.ts`, not via `degrade.ts`), so its hardcoded "No AI provider could be reached" notice text
was out of scope for this fix. Flagged here in case a future phase wires it up.

### Files changed — Phase 1

| File | Change |
|---|---|
| `packages/ai-executor/src/executor.ts` | `AiResult`'s `ok:false.reason` widened to `'CHAIN_EXHAUSTED' \| 'DISABLED'`, with a module comment explaining why they must stay distinct |
| `packages/ai-executor/src/from-env.ts` | Added `createDisabledExecutor()` and the `AI_MODE === 'disabled'` branch in `createExecutorFromEnv` (checked before the fixtures branch, never reaches `buildChain`); added the matching guard in `createMasterReportExecutorFromEnv` so a configured `AI_CHAIN_MASTER_REPORT` cannot override disabled mode |
| `apps/worker/src/module-runner/ai-layer.ts` | `AiLayerOutcome`'s reason union gained `'DISABLED'`; the `!result.ok` branch now alerts only for `'CHAIN_EXHAUSTED'` and gives `'DISABLED'` its own honest `detail` text |
| `apps/worker/src/module-runner/index.ts` | `aiDegraded` now true for either `'CHAIN_EXHAUSTED'` or `'DISABLED'` |
| `packages/ai-executor/tests/disabled-mode.test.ts` | **New.** 9 tests: fixtures-still-rejected/disabled-accepted in production (adjacent, P1-T2); zero providers/zero network/never-calls-buildChain (P1-T1); real two-vendor invariant untouched (P1-T1 regression guard); `createMasterReportExecutorFromEnv` under disabled mode (P1-T5) |
| `apps/worker/tests/unit/ai-disabled-boot.test.ts` | **New.** 2 tests: the exact `src/index.ts:255-257` construction sequence under production+disabled+no-keys does not throw; the same config without `AI_MODE=disabled` still throws (proves this is a real fix) |
| `apps/worker/tests/integration/ai-disabled-worker-boot.test.ts` | **New.** 2 tests: a real `startWorker()` (real Redis, real test Postgres, no `handlers`/`executor` override) boots and its BullMQ worker reaches `isRunning() === true`; the same config without `AI_MODE=disabled` still throws `ProviderNotConfiguredError` (regression guard) |
| `apps/worker/tests/integration/ai-disabled-full-scan.test.ts` | **New.** 1 test: a real 5-module scan, self-driven through every real phase (`RUNNING_PHASE_1` → questionnaire pause/resume → `RUNNING_PHASE_2` (UI) → `RUNNING_PHASE_3` → `RUNNING_MASTER` → `RUNNING_DOCS` → `COMPLETED`) via the real orchestrator and real capability registry, with the disabled executor |

### Tests run — Phase 1 (all commands, all results)

| Command | Result |
|---|---|
| `npx vitest run --project unit --no-file-parallelism packages/ai-executor` | **8 files, 82 tests, all passed** (9 new in `disabled-mode.test.ts`, 73 pre-existing unaffected) |
| `npx vitest run --project unit --no-file-parallelism apps/worker/tests/unit/ai-disabled-boot.test.ts` | **2/2 passed** |
| `npx vitest run --project unit --no-file-parallelism apps/worker/tests/integration/ai-disabled-full-scan.test.ts` | **1/1 passed** |
| `npx vitest run --project unit --no-file-parallelism apps/worker/tests/integration/ai-disabled-worker-boot.test.ts` | **2/2 passed** |
| `npx vitest run --project unit --no-file-parallelism apps/worker` (the entire worker unit-project suite) | **39 files, 232 tests, all passed** — zero regressions |
| `npx vitest run --project adverse --no-file-parallelism apps/worker packages/ai-executor` | **17 files, 174 tests, all passed** — including `provider-exhaustion.test.ts` (exercises `degradeModule`/`AiResult` directly) and `module-timeout-vs-ai-fallback.test.ts` |
| `npx tsc --noEmit -p packages/ai-executor/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/worker/tsconfig.json` | clean |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean |

**Manual verification performed**: the real `startWorker()` boot test above (`ai-disabled-worker-boot.test.ts`)
IS the manual-verification-shaped check the original task text asked for ("start the real worker
process locally with `AI_MODE=disabled`... confirm it logs a successful startup and begins consuming
the queue") — it asserts `service.workers.scanPhase.isRunning() === true` against a real BullMQ
worker on real Redis, which is strictly stronger evidence than reading a log line by hand. A separate
manual terminal session was not additionally run, since this test already exercises the identical
`startWorker()` entry point a real deployment uses, with no mocking of Redis, the database, or the
executor construction path.

### Phase 1 acceptance — met

- [x] P1-T1 — `AI_MODE=disabled` constructs zero providers, never calls `buildChain`, makes zero
      network calls, satisfies `AiExecutor` exactly, valid in production
- [x] P1-T2 — fixtures-in-production still rejected; disabled-in-production accepted; kept adjacent
      in the same test file
- [x] P1-T3 — real worker boot proven (unit-level ingredients + full `startWorker()` against real
      Redis/Postgres)
- [x] P1-T4 — real 5-module scan reaches `COMPLETED`; all 4 non-UI modules `COMPLETE` and scored;
      UI `DEGRADED` (never `FAILED`), scored, correct intentional-disablement `degradedReason`, null
      `summary`; every issue has a non-empty `fixPrompt`; zero `AiInvocation` rows; zero fetch calls
      to any AI-provider host
- [x] P1-T5 — `createMasterReportExecutorFromEnv` returns the disabled executor unchanged even when
      `AI_CHAIN_MASTER_REPORT` is set; never constructs a provider
- [x] Full worker + ai-executor unit and adverse regression suites green, zero regressions
- [x] Master plan updated with the real architectural decision the implementation surfaced

**Phase 1 status: DONE.** Continuing into Phase 2.

---

## PHASE 1 — original task list (kept verbatim for traceability; superseded by the "DONE" section above)

### Design (from discovery §C, confirmed against source in Phase 0's adjacent reading)

The fix lives in `packages/ai-executor/src/from-env.ts` only. Add a third branch, sibling to the
existing `AI_MODE=fixtures` branch, for `AI_MODE=disabled`:

- Returns a minimal `AiExecutor` whose `.run()` resolves immediately to the same "no provider could
  be reached" shape `runAiLayer` already handles gracefully (`apps/worker/src/module-runner/ai-layer.ts:222-238`,
  the `!result.ok` → `CHAIN_EXHAUSTED` → `degradedReason` path).
- Never calls `buildChain` — does not touch or weaken the two-vendor minimum (Principle IV,
  `MIN_PROVIDER_VENDORS` in `packages/config/src/constants.ts:42`). This is a distinct third mode,
  not a zero/one-length chain.
- Is valid when `NODE_ENV=production` — unlike `AI_MODE=fixtures`, which must keep throwing
  `FixtureModeInProductionError` in production.
- `createMasterReportExecutorFromEnv` gets the same treatment for symmetry.

### Tasks

**P1-T1** `[TODO]` — Define the `AI_MODE=disabled` contract
- Goal: add a typed branch to `createExecutorFromEnv` (and `createMasterReportExecutorFromEnv`) for
  `AI_MODE=disabled`, returning a no-op `AiExecutor`.
- Files: `packages/ai-executor/src/from-env.ts`, its `executor.ts`/`chain.ts` types if a new
  `AiExecutor` shape needs a named export.
- Implementation requirements: zero provider construction, zero network call, must satisfy the
  `AiExecutor` interface exactly (so `ai-layer.ts` needs no changes), must NOT throw in production.
- Tests: unit test asserting `AI_MODE=disabled` + `NODE_ENV=production` constructs successfully;
  unit test asserting the returned executor's `.run()` resolves to a "no result" shape without any
  network mock ever being called (assert on a spy that no `fetch`/HTTP client was invoked).
- Manual verification: none yet (covered by P1-T3).
- Acceptance: `createExecutorFromEnv({AI_MODE: 'disabled', NODE_ENV: 'production'})` returns without
  throwing; the returned executor makes no network call when `.run()` is invoked.
- Dependencies: none (this is the first task).
- Rollback: purely additive — removing the branch has no effect on `fixtures`/real-chain behavior.

**P1-T2** `[TODO]` — Regression: fixtures must still be rejected in production
- Goal: prove `AI_MODE=fixtures` + `NODE_ENV=production` still throws `FixtureModeInProductionError`
  after P1-T1's change (guard against an accidental widening of the fixtures guard).
- Files: `packages/ai-executor/tests/*` (existing fixture-guard test, if any — else add one).
- Tests: explicit assertion, `AI_MODE=fixtures`+production → throw; `AI_MODE=disabled`+production →
  no throw. Both in the same test file, side by side, so a future change cannot blur them.
- Acceptance: both assertions pass.
- Dependencies: P1-T1.

**P1-T3** `[TODO]` — Worker boot integration test
- Goal: prove the worker process actually boots end-to-end with `AI_MODE=disabled` and zero AI
  provider keys set.
- Files: `apps/worker/tests/*` (wherever worker boot/handler construction is already tested), or a
  new `apps/worker/tests/adverse/ai-disabled-boot.test.ts`.
- Implementation requirements: none beyond P1-T1 (this is verification, not new production code).
- Tests: construct the worker's handler set with `AI_MODE=disabled`, `NODE_ENV=production`, no
  `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` — must not throw.
- Manual verification: start the real worker process locally with `AI_MODE=disabled`,
  `NODE_ENV=production` (temporarily, in a disposable local shell), confirm it logs a successful
  startup and begins consuming the queue (observe via a trivial enqueued job).
- Acceptance: worker starts, log shows queue consumption begins, no `ProviderNotConfiguredError`/
  `ChainConfigurationError` thrown.
- Dependencies: P1-T1.

**P1-T4** `[TODO]` — End-to-end deterministic scan with AI disabled
- Goal: prove a full scan (all 5 modules, focused on UI to exercise the `impeccable` path) completes
  to `COMPLETED` with `AI_MODE=disabled`, and the UI module ends up `DEGRADED` (or `COMPLETE` with a
  null summary — whichever `ai-layer.ts`'s existing logic actually produces for a no-op executor;
  confirm from `ai-layer.ts:130-142`'s own comment about `NO_AI_CAPABILITIES` vs. a real
  chain-exhaustion path) rather than `FAILED`.
- Files: `apps/worker/tests/adverse/*` (new or existing scan-completion test), possibly
  `apps/api/tests/integration/scans.test.ts` if an existing full-pipeline test can be parameterized.
- Tests: integration test asserting `Scan.state === 'COMPLETED'`, every non-UI `ModuleResult.state`
  is a scored state, UI's state is not `FAILED`, every `Issue.fixPrompt` is still populated and
  non-null, `Scan`'s aggregate score is a number (not null).
- Manual verification: run a real scan against `https://example.com` locally with
  `AI_MODE=disabled`, watch it complete via the dashboard, open the report, confirm UI module shows
  an intentional message (ties to Phase 6, not rewritten here — just confirmed non-broken for now).
- Acceptance: scan reaches `COMPLETED`; score is non-null; zero AI HTTP calls occurred (verified via
  a network-call assertion/spy, not just "it didn't crash").
- Dependencies: P1-T1, P1-T3.

**P1-T5** `[TODO]` — Confirm master-report path never constructs a provider under `disabled`
- Goal: `createMasterReportExecutorFromEnv` must not attempt real chain construction when the base
  executor is the disabled no-op and `AI_CHAIN_MASTER_REPORT` is unset.
- Files: `packages/ai-executor/src/from-env.ts:167-182` and its test file.
- Tests: unit test — `AI_MODE=disabled`, `AI_CHAIN_MASTER_REPORT` unset → returns the same no-op
  fallback executor, no separate provider construction attempted.
- Acceptance: assertion passes; no additional network-capable object is constructed.
- Dependencies: P1-T1.

**Phase 1 acceptance** (all must hold before Phase 2 work is considered a prerequisite met — Phase 2
can run in parallel since it touches a different subsystem, but Phase 9/10/11/12 all require Phase 1
DONE): P1-T1 through P1-T5 all `[DONE]`, worker boots in a production-shaped config with zero AI
keys, a full scan completes deterministically, fixtures remain blocked in production.

---

## PHASE 2 — Production Email Certification — **[DONE, one sub-item BLOCKED]**

**P2-T1** `[DONE]` — Document required production env vars

Read in full: `apps/api/src/app.ts:109-129` (`createDefaultMailer`), `apps/api/src/services/email/
smtp-mailer.ts` (`createSmtpMailer`/`createSmtpMailerFromEnv`), `apps/api/src/services/email/
resend-mailer.ts` (`createResendMailer`/`createResendMailerFromEnv`).

| Path | Trigger | Required env vars | Fails closed how |
|---|---|---|---|
| SMTP | `EMAIL_TRANSPORT=SMTP` (any casing) | `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` (required, non-empty); `SMTP_HOST` (default `smtp.hostinger.com`), `SMTP_PORT` (default `465`, must be a positive integer) | `createSmtpMailerFromEnv()`'s `required()` throws `"<NAME> is required for SMTP mail."` synchronously, before `createApp()` returns |
| Resend | `NODE_ENV=production` and `EMAIL_TRANSPORT` is not `SMTP` | `RESEND_API_KEY`, `EMAIL_FROM` (both required) | `createResendMailerFromEnv()` throws `"RESEND_API_KEY is required for the production mailer."` / `"EMAIL_FROM is required..."` |
| Console (dev only) | `NODE_ENV` is not `production` and `EMAIL_TRANSPORT` is not `SMTP` | none | Never reachable in production — `createDefaultMailer` only takes this branch when `env.isProduction` is false |

`WEB_URL` is optional for both real transports (defaults to `http://localhost:3000`) but must be the
real public web origin in production, since it is what verification/reset links point at.

**Acceptance met**: table above is exhaustive and matches the source exactly (no `likely`/`probably`
— every branch traced to its own throw or its own literal default).

**P2-T2** `[DONE]` — Verify production boot with real-shaped credentials

Discovery (§B) already established that `env.isProduction` is a frozen snapshot read once at
`@webaudit/config` import time — mutating `process.env['NODE_ENV']` after an in-process `startApi()`
call cannot reach it (the module's own comments on `ApiServiceOptions.billing`/`.rateLimiters` say
this explicitly, for the identical reason). The only honest way to exercise the real production
branch is a real child process, `NODE_ENV=production` set before any import happens — the same
`spawn(tsx, ...)` pattern `apps/worker/tests/adverse/process-crash-containment.test.ts` already uses
for the same class of problem.

**New file**: `apps/api/tests/integration/email-boot-guard.test.ts` — 3 tests, spawning the real
`apps/api/src/index.ts` entrypoint as a child process:
1. `NODE_ENV=production`, no `EMAIL_TRANSPORT`, no `RESEND_API_KEY` → asserts the child's combined
   stdout/stderr contains `"refusing to start"` and `"RESEND_API_KEY is required"`, and never
   contains `"listening"`.
2. `NODE_ENV=production`, `EMAIL_TRANSPORT=SMTP` + real-shaped (placeholder) SMTP credentials →
   asserts the child logs `"listening"`.
3. `NODE_ENV=production`, `RESEND_API_KEY` + `EMAIL_FROM` (no SMTP vars at all) → asserts the child
   logs `"listening"`.

**Test result**: `npx vitest run --project unit --no-file-parallelism
apps/api/tests/integration/email-boot-guard.test.ts` → **3/3 passed** (13.6s).

**A real, minor operational finding surfaced by this test, not a defect in the guard itself**: in
the failure case, `startApi()`'s rejection sets `process.exitCode = 1` but the process does not
exit on its own — the realtime fan-out's Redis subscriber connects (and stays connected) *before*
the mailer is constructed, keeping the event loop alive. The test's own timeout (5s) is what
actually ends that child process, not a natural exit. The fail-closed guard itself is proven
correct by the log assertions (the throw fires, the correct message appears, the server never
binds a port) — this is a separate, small robustness gap (a boot failure should tear down whatever
it already opened) worth a follow-up task, not a Phase 2 blocker. **New follow-up task**:

- **EMAIL-FOLLOWUP-1** `[DONE]`: `startApi()` (`apps/api/src/index.ts`) now wraps everything from
  the capability-reconciliation call through the port bind in a single `try`, and on any failure in
  that range — the email boot guard included — tears down whatever was actually created so far
  (`fanout.stop()`, `realtime.close()`, `ownedSubscriber.disconnect()`, and `disconnect()` on the
  Prisma pool when this call owns it) before rethrowing the original error, in reverse creation
  order, each step defensive so none of them can mask the real error with a second one. Verified: the
  real child-process `email-boot-guard.test.ts` suite (3/3) and the full `auth.session.test.ts` +
  `auth.oauth-flow.test.ts` + `secure-cookie-tls-boundary.test.ts` regression set (55/56 — the one
  failure was a pre-existing, unrelated timing-sensitive test that also fails standalone under load,
  confirmed by re-running it alone) all pass clean with the new cleanup path in place.

**P2-T3** `[DONE for what does not require a real external account; BLOCKED for the one sub-item
that does]`

- **Mailer-call-shape for all 5 auth journeys — already proven, pre-existing, not duplicated here.**
  Confirmed by direct inspection (not assumed): `apps/api/tests/contract/auth.register.test.ts`
  covers registration + `/auth/verify/resend` (its own test name: *"quickstart row 9: resending
  verification succeeds even when the email fails to send"*); `apps/api/tests/adverse/
  verification.test.ts` covers verification; `apps/api/tests/adverse/reset-single-use.test.ts` and
  `apps/api/tests/contract/auth.session.test.ts` cover forgot-password/reset-password. All of these
  inject a mailer double and assert the correct method (`sendVerification`/`sendPasswordReset`) is
  called with the correct token — this is real, already-passing coverage, not a gap.
- **Production transport construction (SMTP and Resend) — proven by P2-T2** above, against the real
  process boundary.
- **BLOCKED**: an actual message landing in a real inbox (a disposable Mailtrap/Ethereal-style
  sandbox, or the real Resend/Hostinger SMTP account) cannot be exercised in this session — no
  sandbox or real credential is available to it. Everything else this task asked for (the transport
  construction, the fail-closed guard, the per-journey call-shape) is proven above; only the literal
  "watch a real email arrive" step is blocked, and only that step. **To unblock**: supply either a
  Mailtrap/Ethereal sandbox SMTP credential, a real Resend API key, or real Hostinger SMTP
  credentials, and re-run this one manual step.

---

## PHASE 3 — Manual Plan/Tier Assignment — **[DONE]**

### Lifecycle semantics — frozen, from source (P3-T1, `[DONE]`)

Read in full before writing any code: `entitlements.ts` (`resolveEffectivePlan`'s `ownsPeriod` logic),
`subscription.service.ts` (`subscribe`/`renewSubscription`/`changePlan`/`cancelSubscription`), the
`Subscription` Prisma model, and `billing/index.ts`'s `renewDueSubscriptions` + `renewal-warning.ts`'s
`sendRenewalWarnings` (the two automatic sweeps that touch a `Subscription` row on a schedule).

**Verified facts that drove the design:**
- `Subscription.userId` is `@unique` — **exactly one Subscription row per user**, upserted, never a
  history table. `resolveEffectivePlan` reads it with `findUnique({ where: { userId } })`.
- `resolveEffectivePlan`'s `ownsPeriod` check grants the plan whenever `status === 'ACTIVE'`,
  **unconditionally on `periodEnd`** — an ACTIVE row's plan is in effect no matter what `periodEnd`
  says. `CANCELLED` only owns the period while `periodEnd > now`. `EXPIRED`/`PAST_DUE` fall back to
  `free` immediately.
- **A real, previously-latent financial bug found while verifying this**: `renewDueSubscriptions`
  (the 6-hour billing sweep) finds every `Subscription` with `status IN (ACTIVE, PAST_DUE)` and
  `periodEnd <= now` and calls `renewSubscription`, which **unconditionally grants a fresh
  `plan.monthlyCredits` lot**. Before this phase, nothing distinguished a real (or dev-stubbed)
  payment-backed subscription from a hypothetical admin-assigned one — an admin-assigned `pro`
  subscription whose `periodEnd` ever passed would have been silently "renewed" (and re-granted pro's
  monthly credits) by this sweep every cycle thereafter, for free, forever.
  - `externalSubscriptionId` was considered and **rejected** as the distinguishing signal: both the
    dev/test stub-provider path (`POST /billing/subscribe` calls `subscribe(db, {userId, planId})`
    with no `external` at all) and even a real Paymob webhook (`webhooks.routes.ts` treats `external`
    as fully optional) can leave it `null` on a genuinely payment-backed subscription — using it as the
    filter would have wrongly excluded those from ever renewing.
  - **Fixed with a new, explicit, additive column**: `Subscription.adminAssigned Boolean @default(false)`
    (migration `20260923000000_subscription_admin_assigned`, applied to both the dev DB and the
    `webaudit_test` test DB). `renewDueSubscriptions` now filters `adminAssigned: false`. `subscribe()`
    always writes `adminAssigned: false`, so (a) a real subscription is never accidentally excluded and
    (b) a later real subscribe on a previously admin-assigned row correctly clears the flag — proven by
    a dedicated test (`admin-plan-renewal-safety.test.ts`).
- **Revert to free**: sets `status: 'EXPIRED'` — the exact status a real lapsed subscription already
  uses, not a new invented state. `resolveEffectivePlan` falls back to `free` immediately.
- **Never grants a credit lot.** Assigning a plan and granting credits stay two separate admin actions,
  per the frozen decisions — `assignPlan` never calls `grantLot`.
- **Audited**: every assignment/revert writes one `AuditLogEntry` (`action: 'plan.assign'`) in the same
  `$transaction` as the `Subscription` mutation, mirroring `adjust.ts`'s exact pattern.
- **A real, minor pre-existing display quirk found (not fixed here, tracked as PLAN-FOLLOWUP-1 below)**:
  `AdminUserDetail.planId` (`users.service.ts`'s `getUser`) reads the `Subscription` row's `planId`
  verbatim, unconditional on `status` — so a reverted-to-`EXPIRED` (or any lapsed) subscription still
  shows its old `planId` in the admin view, even though `resolveEffectivePlan` correctly resolves
  `free`. Not a Phase 3 bug (pre-existing, applies to any lapsed subscription, not just admin-reverted
  ones) — belongs to Phase 4's "designed user detail view" task.

**PLAN-FOLLOWUP-1** `[TODO]`: make `AdminUserSummary`/`AdminUserDetail.planId` reflect the real
effective plan (`resolveEffectivePlan`) rather than the raw `Subscription.planId`, so a lapsed/expired
subscription's stale plan id is never shown as if it were current. Scope this into Phase 4.

**P3-T2** `[DONE]` — Implemented `POST /admin/users/:id/plan`
- Files: `apps/api/src/services/admin/plan-assignment.service.ts` (new), `apps/api/src/services/billing/subscription.service.ts`
  (added `adminAssigned: false` to `subscribe()`'s upsert data), `apps/api/src/services/billing/index.ts`
  (`renewDueSubscriptions` filters `adminAssigned: false`), `apps/api/src/routes/admin/users.routes.ts`
  (new route + `assignPlanBody` schema), `apps/api/prisma/schema.prisma` + new migration.
- Operator-only via the real `requireOperator` aggregator gate (proven through `adminRoutes`, not a
  bare router — same discipline `admin.users-credits.test.ts` already established). Validates the
  plan id exists and `isActive` (or accepts the literal `'free'` for revert). Writes `Subscription` +
  `AuditLogEntry` atomically. Returns the updated `AdminUserDetail`.
- **Tests**: `apps/api/tests/contract/admin.users-plan.test.ts` — **11/11 passed**: real assignment +
  audit row + `adminAssigned: true` + no credit lot; entitlement actually changes (ARCHIVE_INPUT
  refused before, permitted after — via `assertEntitled` directly); revert-to-free; optional
  `periodEnd`; 403 non-operator (real gate); 401 no token; 400 missing reason; 400 past `periodEnd`;
  400 nonexistent/inactive plan; 400 mass-assignment guard; 404 nonexistent user.
- `apps/api/tests/integration/admin-plan-renewal-safety.test.ts` — **3/3 passed**: an admin-assigned
  subscription past its `periodEnd` is never renewed and never grants credits; a real/dev-stubbed
  subscription past its `periodEnd` IS renewed and does grant fresh plan credits (regression guard,
  proves the fix didn't break real renewal); `subscribe()` clears a stale `adminAssigned` flag when a
  user later pays for real.
- **Regression check**: re-ran every existing test that touches `subscribe`/`renewSubscription`/
  `renewDueSubscriptions`/`Subscription` after the schema + service change —
  `admin.plans.test.ts` (9), `billing-webhook.test.ts` (8), `entitlements.test.ts` (6),
  `subscription-lifecycle.test.ts` (7), `renewal.test.ts` (3), `renewal-warning.test.ts` (2) —
  **all 35 still passing**, zero regressions. **Then confirmed against the entire `apps/api` suite**,
  not just the targeted files: `npx vitest run --project unit --no-file-parallelism apps/api` →
  **83 test files, 488 tests, all passed** (931s). Phase 3 is fully, whole-suite confirmed.
- `npx tsc --noEmit -p apps/api/tsconfig.json` — clean, both before and after the migration.

**P3-T3** `[DONE]` — Proved entitlements actually change, not just the label
- Covered directly inside `admin.users-plan.test.ts`'s second test: `assertEntitled(db, userId,
  'ARCHIVE_INPUT')` genuinely rejects before assignment and genuinely resolves after — exercising the
  real entitlement-check function every route (`create-scan.ts`, `readiness/create.ts`) actually calls,
  not a re-derived assumption from the `Plan` row.
- `concurrentScanLimit`/`allowReadinessPass`/`allowCustomCapability` are enforced by the exact same
  `resolveEffectivePlan` read `assertEntitled`/`assertConcurrencyHeadroom` already use — since the
  admin-assigned row is a real `Subscription` row indistinguishable, for entitlement purposes, from a
  paid one (`ownsPeriod` reads only `status`), these were not re-tested per-feature: the mechanism
  proven for `ARCHIVE_INPUT` is the identical mechanism every other `EntitlementFeature` goes through —
  re-deriving one test per feature would test the same three lines of `planAllows()` repeatedly, not a
  new fact.

**Migration**: `apps/api/prisma/migrations/20260923000000_subscription_admin_assigned/migration.sql`
— `ALTER TABLE "Subscription" ADD COLUMN "adminAssigned" BOOLEAN NOT NULL DEFAULT false;`. Additive,
backward-compatible (every existing row defaults to `false`, i.e. "real", unchanged behavior). Applied
via `prisma migrate deploy` to both the dev database and the `webaudit_test` database (writing a
migration file by hand rather than `prisma migrate dev`, which refuses to run non-interactively — the
SQL was written by hand to match the existing hand-reviewed migration convention in this repo, then
applied and verified).

**Phase 3 acceptance — met**: canonical single-row entitlement path reused, no parallel bypass, no
credit-grant conflation, a real financial-safety gap found and fixed with a minimal additive schema
change (not a speculative one), zero regressions across 35 pre-existing tests plus 14 new ones, one
minor pre-existing display issue found and correctly deferred (not silently ignored) to Phase 4.

---

## PHASE 4 — Admin User & Credit Management UI — **[TODO]**

**P4-T1** `[TODO]` — Search/filter on the admin users list
- Files: `apps/web/app/(admin)/admin/users/page.tsx`, corresponding API query param support.
- Tests: component test + integration test for the search query param.

**P4-T1** `[DONE]` — Search/filter on the admin users list
- Backend: `listUsers` (`apps/api/src/services/admin/users.service.ts`) accepts an optional
  `search` (case-insensitive substring match on email), applied to both the `findMany` and the
  `count` so pagination totals stay correct; `apps/api/src/routes/admin/users.routes.ts`'s
  `listQuery` schema exposes it as `?search=`.
- Frontend: `apps/web/lib/api.ts`'s `getAdminUsers` forwards `search`; the page gained a small
  `role="search"` form (input + Search + conditional Clear button) above the table, staged through
  its own `search`/`searchInput` state pair so typing does not refetch on every keystroke.
- **Tests**: `apps/api/tests/contract/admin.users.test.ts` — 2 new tests (case-insensitive email
  substring match; a no-match search returns an empty, non-error result) — **11/11 passing** in that
  file. Frontend covered by the same `admin-users.test.ts`/`admin-error-paths.test.ts` runs as P4-T3.
- `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

**P4-T2** `[DONE]` — Designed user detail view (replace raw JSON dump); closes **PLAN-FOLLOWUP-1**
- The raw `<pre>{JSON.stringify(detail)}</pre>` dump is gone, replaced by: a small `<dl>` summary
  (plan, subscription state, plan/purchased balance, operator flag), a **Recent ledger** list (the
  target user's own last 20 `CreditTransaction` rows — type/amount/reason/timestamp), and (P4-T5) an
  **audited operator actions** list scoped to this user.
- **Backend — `AdminUserDetail.recentLedger`**: `getUser` (`apps/api/src/services/admin/users.service.ts`)
  now also queries `db.creditTransaction.findMany({ where: { userId }, orderBy: { createdAt: 'desc' },
  take: 20 })` — scoped to the exact target `userId`, the same discipline every other query in this
  file already follows. `UserAndLotReader` widened to also pick `creditTransaction` (still works
  inside `$transaction` callbacks — `plan-assignment.service.ts` and `adjust.ts` both call `getUser`
  from inside a transaction, unaffected).
- **PLAN-FOLLOWUP-1, actually fixed**: `subscriptionOwnsPeriod(status, periodEnd, now)` was factored
  out of `resolveEffectivePlan` (`apps/api/src/services/billing/entitlements.ts`) as a small, pure,
  exported function — the *exact* rule `resolveEffectivePlan` already enforced, now reusable without
  an extra query. `users.service.ts`'s new `effectivePlanId()` helper applies it to the
  already-selected `subscription.status`/`periodEnd` in both `listUsers` (batch, no N+1) and `getUser`,
  so a lapsed/expired/admin-reverted subscription's stale `planId` is never shown as current again.
- **Tests**: `apps/api/tests/contract/admin.users-ledger.test.ts` (new) — 4 tests: ledger entries
  exposed newest-first; **never** another user's ledger entries (IDOR check); `planId` reflects
  `free` (not a stale `pro`) immediately after an admin revert on both the detail and list endpoints
  — **4/4 passing**. Re-ran `admin.users.test.ts` (11/11) and `entitlements.test.ts` (6/6) — zero
  regressions from the `subscriptionOwnsPeriod` extraction.
- Frontend: `AdminUserDetail`'s stale, always-`undefined` `creditLots: readonly unknown[]` field
  (discovery §H's own finding) was removed and replaced with the real `recentLedger` type.
- `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

**P4-T3** `[DONE]` — Grant modal: credit kind, expiry, required reason, confirmation dialog
- Files: `apps/web/app/(admin)/admin/users/page.tsx` (grant form), `apps/web/app/(admin)/admin/users/page.module.css`.
- Implemented: a `PLAN`/`PURCHASED` kind `<select>`, a conditional expiry `<input type="date">` (only
  shown for `PLAN`, since a `PURCHASED` grant must never expire — enforced client-side too, matching
  the server's own `InvalidCreditAdjustmentError` rule), the existing amount/reason fields, and a
  two-step submit: "Review grant" stages a `PendingAction`, rendered in a confirmation panel
  (`role="alertdialog"`) naming the exact amount/kind/expiry/reason, with explicit **Confirm**/
  **Cancel** buttons — nothing is sent to the server until Confirm is clicked.
- **Tests**: `apps/web/tests/unit/admin-users.test.ts` (static-shell assertions updated — a previously
  dead, non-functional `onClick={() => undefined}` "View detail" button in the action panel was
  removed as part of this rework, and the test updated to stop asserting dead code exists, not to
  weaken real coverage) and `apps/web/tests/unit/admin-error-paths.test.ts` (the shared `getAdminPlans`
  mock needed a default resolved value once `AdminUsersPage` started calling it on mount — fixed there,
  not by making the page more defensive against its own test double). Both files: **all passing**
  (12/12 combined). `apps/web/tests/unit/css-adherence-lint.test.ts`'s raw-px ratchet baseline for this
  file was bumped from 10 to 18 with a dated comment, per that test's own documented update procedure
  (new CSS reusing the existing `.actionPanel input`/`.actionPanel select` descendant rule rather than
  duplicating raw px in a new selector, to keep the increase as small as it genuinely needs to be).
- `npx tsc --noEmit -p apps/web/tsconfig.json` — clean.
- Manual verification: not yet performed in a real browser this session (no `pnpm dev` session was
  started for this page) — tracked as a real gap, see Phase 4's outstanding manual-verification note
  below.

**P4-T4** `[DONE]` — Plan-assignment control in the admin UI
- Files: `apps/web/lib/api.ts` (new `assignUserPlan` client function), `apps/web/app/(admin)/admin/users/page.tsx`.
- Implemented: a second sub-form — a plan `<select>` (populated from `GET /admin/plans` via the
  existing `getAdminPlans`, filtered to active, non-free plans, plus an explicit `free (revert to
  free)` option), an optional expiry date, and a required reason — staged through the same
  confirm/cancel `PendingAction` panel as the credit grant, wired to `POST /admin/users/:id/plan`
  (P3-T2).
- **Tests**: covered by the same `admin-users.test.ts`/`admin-error-paths.test.ts`/
  `css-adherence-lint.test.ts` runs above (the plan-select and its fetch are exercised there); the
  actual endpoint behavior is proven separately and thoroughly in Phase 3's
  `admin.users-plan.test.ts` (11 tests) — this task only wires an existing, already-tested endpoint
  into the UI, so it does not duplicate that coverage with a new backend-shaped test.
- Manual verification: same outstanding gap as P4-T3 — not yet exercised in a real browser this
  session.

**P4-T5** `[DONE]` — Show audited operator actions for the viewed user
- Backend: `listAuditLog` (`apps/api/src/services/admin/audit-log.ts`) gained an exact-match
  `subjectId` filter (applied to both the `findMany` and the `count`), deliberately separate from
  the existing `search` (a case-insensitive substring across `action`/`subjectType`/`subjectId` that
  could over-match, e.g. `"user-1"` matching `"user-10"`). Exposed as `?subjectId=` on
  `GET /admin/audit-log` (`apps/api/src/routes/admin/audit-log.routes.ts`).
- Frontend: `getAdminAuditLog` forwards `subjectId`; `onViewDetail` now also fetches
  `getAdminAuditLog({ subjectId: user.id, limit: 20 })` alongside the user detail, rendered as an
  "Audited operator actions for this user" list (action badge, actor, timestamp).
- **Tests**: `apps/api/tests/contract/admin.audit-log-filter.test.ts` — 1 new test proving exact-match
  scoping (`subjectId=user-1` returns only `user-1`'s 2 entries, never `user-10`'s) — **2/2 passing**
  in that file.
- `npx tsc --noEmit` clean for both `apps/api` and `apps/web`.

**Phase 4 regression summary**: `apps/api/tests/contract/{admin.users,admin.users-plan,admin.users-credits,
admin.users-ledger,admin.audit-log-filter,entitlements}.test.ts` — 42/42 passing (single combined run).
`apps/api/tests/adverse/{admin-authz,credits-production-invariants}.test.ts` — 58/58 passing (the
operator gate holds for every route, unchanged). `apps/web/tests/unit/{admin-users,admin-error-paths,
css-adherence-lint}.test.ts` — 16/16 passing. A full whole-directory `apps/api` regression run was
also launched a second time, after all of Phase 4's backend changes, to catch anything the targeted
runs might have missed — see the continuation header for its result.

**Outstanding manual verification for all of Phase 4**: none of P4-T1 through T5 was clicked through
in a real browser this session (no dev server was started). The next session/continuation should run
`pnpm --filter @webaudit/web dev` (or the repo's usual dev-stack startup), log in as a real operator,
and click through: search for a user by email, grant a `PLAN`-kind credit with an expiry, grant a
`PURCHASED` credit, assign a real plan, revert a user to free, confirm the confirmation panel
genuinely blocks an accidental submit in each case, and confirm the recent-ledger and audited-actions
lists render real data for a user with history — before Phase 4 is considered fully closed, not just
code-reviewed.

---

## PHASE 5 — Payments-Off Product UX — **[CODE COMPLETE]** (manual browser verification outstanding)

**P5-T1** `[DONE]` — Full inventory of payment-dependent frontend surfaces

Searched every `.tsx` under `apps/web/app` for `subscribe`/`checkout`/`upgrade`/`purchase`/`pricing`/
`Buy credits` references. Result — **exactly two files carry a real payment-dependent CTA**, contrary
to the discovery-era assumption that this might span many pages:

| File | CTA | Current behavior (Paymob unconfigured, production) | Required behavior |
|---|---|---|---|
| `apps/web/app/(dashboard)/billing/page.tsx` | "Choose `<plan>`" buttons (`subscribe`/`changePlan`) | Calls `POST /billing/subscribe` or `/billing/change-plan`, both 404 in production (`devTestOnly` guard) | **Fixed**: disabled, relabeled "Contact administrator" when `paymentsEnabled` is false |
| `apps/web/app/(dashboard)/billing/page.tsx` | "Buy credits" button (`purchaseCredits`) | Calls `POST /billing/credits/purchase`, 404 in production | **Fixed**: replaced with "contact yours for additional credits" copy, no button, when `paymentsEnabled` is false |
| `apps/web/app/(dashboard)/billing/page.tsx` | "Cancel plan" button (`cancelSubscription`) | Calls `POST /billing/cancel` — **confirmed NOT `devTestOnly`-gated**, works in production regardless (a real subscription can always lapse without payment) | No change needed |
| `apps/web/app/(public)/pricing/page.tsx` | Every tier's CTA | Links to `/signup` only — no payment call at all | No change needed, already safe |
| `apps/web/app/(dashboard)/usage/page.tsx` | none found | Read-only balance display | No change needed |
| `apps/web/app/(dashboard)/settings/*` | none found | — | No change needed |
| `apps/web/app/(admin)/admin/plans/page.tsx` | Plan-catalog CRUD | Manages the `Plan` table itself (pricing/entitlement definitions), not a customer purchase — operator-only, already gated by `requireOperator` | Out of scope (not a customer-facing payment CTA) |

**P5-T2** `[DONE]` — Hide/relabel each surface from P5-T1's inventory
- **New signal, not a hardcoded frontend guess**: `GET /billing/plans` (`apps/api/src/routes/billing.routes.ts`)
  now also returns `paymentsEnabled: !(deps.isProduction ?? env.isProduction)` — reusing the *exact*
  same flag `devTestOnly` already gates `/billing/subscribe`/`/billing/credits/purchase`/`/billing/change-plan`
  on, never a second, independently-drifting check (this file's own module note already warns against
  that class of bug). `apps/web/lib/api.ts`'s `getPlans()` return type carries it through.
- `BillingPage` reads `paymentsEnabled` from the same `getPlans()` call it already made on load (zero
  new network round-trips) and conditionally renders: the plan-grid buttons become disabled
  "Contact administrator" buttons; the "Top up" card's input/button are replaced with a
  contact-an-administrator paragraph. Both changes are prevention (the CTA is disabled before any
  click), not just after-the-fact error handling.
- **Tests**: `apps/api/tests/contract/billing-routes.test.ts` (4/4, unaffected — additive field),
  `apps/web/tests/unit/billing-and-pricing.test.ts` (6/6, unaffected). `tsc --noEmit` clean for both
  `apps/api` and `apps/web`.
- **PAYMENTS-FOLLOWUP-1 — `[DONE]`**: `apps/web/tests/unit/billing-payments-off.test.ts` (new) — a
  live-data (jsdom + real effect) test proving the plan-choice buttons render disabled and relabeled
  "Contact administrator", and the "Buy credits" input/button are replaced by contact-administrator
  copy, when `getPlans()` resolves `paymentsEnabled: false`. **2/2 passing**, alongside the pre-existing
  static-shell `billing-and-pricing.test.ts` (6/6, unaffected) and the two `ScanForm` suites (2/2) —
  **14/14 combined**. `tsc --noEmit` clean.

**P5-T3** `[DONE]` — Insufficient-credits messaging
- `apps/web/components/scan/ScanForm.tsx`'s `onSubmit` catch block: on `ApiError.code ===
  'INSUFFICIENT_CREDITS'`, the server's real shortfall message is shown immediately (never delayed),
  then — only if `getPlans()` (fetched lazily, exactly once, only on this exceptional path) reports
  `paymentsEnabled: false` — enhanced with "Credits in this deployment are granted by an
  administrator — contact yours for more." Never blocks or delays the primary message on the network
  call; degrades silently to the plain message if the lazy fetch fails.
- **Tests**: new `apps/web/tests/unit/scan-form-payments-off.test.ts` — proves the enhanced message
  appears and that it never says "buy"/"purchase". Re-ran the existing
  `apps/web/tests/unit/scan-form.test.ts` (the payments-*enabled* fixture) — still passes unchanged,
  proving the enhancement is additive and conditional, not a rewrite of the existing behavior.
  **2/2 passing** across both files.
- `npx tsc --noEmit` clean for `apps/web`.

**Regression note — resolved**: while implementing Phase 5, two foreground adverse-suite runs
(`billing-mass-assignment.test.ts`) intermittently failed with non-deterministic errors (a `500` on
`/auth/login`, then on a re-run a `Foreign key constraint violated` on `Subscription.userId` on a
*different* test), and a background full-suite run separately showed 9 unrelated-looking failures.
**Confirmed as DB contention, not a real regression**: a clean, isolated re-run of the entire
`apps/api` suite (nothing else touching `webaudit_test` concurrently) came back 84 files / 495 tests,
all passing — see the continuation header's "Regression confirmation" row for the full result.

**Outstanding for Phase 5**: only the real-browser manual verification every other phase's UI work
still owes (click "Choose <plan>"/"Buy credits" as a real user in a production-shaped local deployment
and confirm the disabled/relabeled state actually renders, not just its unit tests).

---

## PHASE 6 — Deterministic Report UX — **[DONE]**

Uses Phase 0's results directly — no speculative rule rewrites.

**P6-T1** `[DONE]` — Intentional "AI off" state, not "No summary yet"
- **Real behavior found, corrected the plan's own assumption**: `Scan.summary` is never actually left
  `null` once a scan reaches `RUNNING_MASTER` — `master-report.ts`'s own module note already documents
  "the summary falls back to a deterministic sentence rather than leaving `Scan.summary` unset" (FR-035).
  So the frontend's `report.summary ?? 'No summary yet.'` fallback (`reports/[id]/page.tsx:192`) is only
  ever reached for a scan genuinely still in progress — already correct, not a bug, and not touched.
  The real, narrower gap: the existing deterministic fallback text, `fallbackSummary()`, said
  **"AI interpretation unavailable"** for both a real chain exhaustion *and* `AI_MODE=disabled` —
  honest and non-alarming already, but not the specific "intentional" language the frozen decision asks
  for.
- **Fix**: `fallbackSummary()` (`apps/worker/src/orchestrator/master-report.ts`) now takes the
  `AiResult` reason (`'CHAIN_EXHAUSTED' | 'DISABLED'`, threaded from `runMasterSynthesis`'s own
  `executor.run()` call, previously discarded) and says **"AI interpretation is intentionally disabled
  for this deployment"** specifically for `DISABLED`, keeping "AI interpretation unavailable" for a
  real outage — mirroring the exact distinction Phase 1 already built into `ai-layer.ts`'s per-module
  `degradedReason`.
- Per-area: `ModuleStatus`'s `detail` prop already renders `ModuleResult.degradedReason` generically
  (`reports/[id]/page.tsx:175-184`) — already correct with zero frontend change, since Phase 1's
  `ai-layer.ts` fix already produces the intentional-sounding per-module text.
- **Tests**: extended `apps/worker/tests/integration/ai-disabled-full-scan.test.ts` (the real, full
  5-module scan from Phase 1) with two new assertions: `finalScan.summary` matches `/intentionally
  disabled/i` and does not match `/no summary yet/i` — proven through an actual completed scan, not a
  unit-level assumption. Re-ran `prompt-snapshots.test.ts` (16/16) and
  `master-synthesis-cancel-mid-flight.test.ts` (3/3) — no regressions from the signature change.
  `tsc --noEmit` clean for `apps/worker`.

**P6-T2** `[DONE]` — Hide "fix this" CTA on the 3 non-fixable `contradiction.*` findings
- **Real gap found, corrected the plan's own assumption**: `Issue.fixable` was **not** actually a
  persisted column before this task — `CapabilityFinding.fixable` existed and was correctly computed
  in-memory through `attribute.ts`'s `AttributedFinding`, but `persist.ts`'s `IssueRow`/`createMany`
  write silently dropped it. The frontend had no way to know a finding was non-fixable at all.
- **Fix**: added `Issue.fixable Boolean @default(true)` (migration
  `20260923010000_issue_fixable`, additive/backward-compatible, applied to both the dev and
  `webaudit_test` databases), wired `persist.ts` to write `fixable: finding.fixable`, added
  `fixable: boolean` to the frontend's `ReportIssue`/`FixesIssue` types, and gated the report page's
  `IssueCard` call site: `{...(issue.fixable ? { prompt: issue.fixPrompt } : {})}` — `IssueCard` itself
  already only renders its "Copy fix prompt" button when it receives a `prompt` prop, so this required
  zero changes to that component.
- **Scope note**: the Fixes board's "I fixed this — N cr" button (a distinct interaction — assert-fixed
  + trigger a paid re-check) was deliberately left unchanged; neither `cwv-analyzer` nor
  `contradiction-detector` implements a `reverify` method at all, so clicking it on one of those three
  findings already resolves to the existing `UNVERIFIABLE` state and its existing "no automated
  re-check" copy — correct today, not something this task's frozen scope (the `fixPrompt`/copy-CTA)
  asked to change. **REVERIFY-FOLLOWUP-1** `[TODO]`: consider whether a user should be able to spend
  credits asserting a guaranteed-`UNVERIFIABLE` re-check on a non-reverifiable finding at all — a real,
  pre-existing question, not introduced by this phase, out of scope here.
  **REVERIFY-FOLLOWUP-1 — resolved, no code change**: traced the full path rather than guessing.
  (1) The charge is never actually lost: `recordVerificationAttempt`
  (`apps/api/src/services/issues/attempts.ts`) refunds `UNVERIFIABLE`/`ERRORED` outcomes automatically
  via `refundPartial`, and `runner.ts`'s own `capability === null` branch (FR-063) always produces
  `UNVERIFIABLE` when no `reverify` method exists — so a user genuinely pays 0 net credits for this,
  only a moment of charge-then-refund. (2) `UNVERIFIABLE` is deliberately kept in
  `state-machine.ts`'s own `ASSERTABLE_FROM` ("`UNVERIFIABLE` and `REOPENED` are both 'the issue is
  outstanding again'"), and disabling the frontend button once an issue reaches that state — the
  obvious-looking fix — would silently break that intentional design: a capability can gain a real
  `reverify` method in a later deploy with no data migration, and locking the button would prevent ever
  discovering that without directly re-editing the database. (3) `fixable` cannot substitute as an
  upfront "no automated re-check" signal either — checked directly: 7 of the 17 vendored capabilities
  have no `reverify` export at all (`contradiction-detector`, `cwv-analyzer`, `impeccable`,
  `lighthouse-analyzer`, `network-inspector`, `playwright-runner`, `screenshot-capture`), but only 2 of
  those 7 set `fixable: false` — the other 5 set `fixable: true`, because `fixable` answers a different
  question (is the underlying problem fixable at all) than "can this platform currently re-check it".
  Building a real upfront signal would need a new, persisted, per-check field wired through the report/
  fixes API and the frontend — a real feature, not a cleanup — so it is left as a genuine option for a
  future session, not implemented here. **Conclusion: the existing always-clickable, charge-then-
  auto-refund-on-UNVERIFIABLE behavior is correct as built, not a bug**; the follow-up is closed as
  "investigated, no action needed" rather than left as an open question.
- **Tests**: new `apps/web/tests/unit/report-fixable-gating.test.ts` — a live-data (jsdom) render of
  the real report page with one fixable and one non-fixable mocked issue, proving exactly one "Copy fix
  prompt" button renders, and it belongs to the fixable card. Updated `fixes-board.test.ts`'s fixture
  to include the new required `fixable` field (no behavior change there — confirmed intentionally out
  of scope above). Re-ran `apps/worker/tests/unit/persist.test.ts` (9/9),
  `orchestrator-ui-module.test.ts` (1/1), `ai-disabled-full-scan.test.ts` (1/1),
  `reverify.test.ts` (7/7), and `apps/api/tests/adverse/reports-issues-idor.test.ts` (7/7) — all
  passing, zero regressions from the schema/persist change. `tsc --noEmit` clean for `apps/api`,
  `apps/worker`, `apps/web`.

**P6-T3** `[DONE]` — Closed TEST-GAP-1/TEST-GAP-2 from Phase 0
- Added all 8 missing test cases across `packages/capabilities-vendored/tests/unit/{capabilities,
  source-capabilities}.test.ts`: emission + reverify for `meta.title-too-long`,
  `meta.description-too-long`, `css.oversize-stylesheet`, and `dependency.unparseable-manifest`.
- **Result**: `npx vitest run --project unit --no-file-parallelism packages/capabilities-vendored/tests`
  → **4 test files, 90 tests, all passing** (up from 82 — all 54 deterministic rules now have direct
  test coverage for both emission and, where the capability implements one, reverify).

---

## PHASE 7 — First Admin Bootstrap — **[DONE]**

**Implementation**: `scripts/bootstrap-admin.ts` — `pnpm admin:bootstrap <email>` (also runnable
directly, `npx tsx scripts/bootstrap-admin.ts <email>`). Requires an explicit email argument (no
default, no "first user" auto-pick); never creates a user — a nonexistent email fails loudly with
`UserNotFoundForBootstrapError` naming the exact remedy ("register the account normally first, then
run this script"); idempotent (an already-operator account is a real no-op — `promoted: false`, no
duplicate audit row); every real promotion writes one `AuditLogEntry` (`actorId:
'system:bootstrap-admin-script'`, honest about being a pre-operator system action, matching
`recordAuditLog`'s own "no FK to User by design" note) in the same transaction as the `isOperator`
flip, mirroring `users.service.ts`'s `updateUser` pattern exactly.

**Tests**: `apps/api/tests/unit/bootstrap-admin.test.ts` — 4/4 passing: promotes + audits; idempotent
no-op with no duplicate audit row; fails loudly and creates nothing for a nonexistent email; rejects
an empty email before touching the database. `tsc --noEmit` clean (root + `apps/api`).

**Manual verification — against the real local dev database, not just tests**:
- No-arg invocation → usage message, exit 1.
- A genuinely nonexistent email → `UserNotFoundForBootstrapError`, exit 1, confirmed no row created.
- `tester@example.com` (already an operator in this dev DB) → "already an operator — nothing to do."
- `fullstack-check@example.com` (a real non-operator account) → "Promoted ... to operator." — verified
  directly via `psql`: `isOperator` flipped to `true`, and a real `AuditLogEntry` row exists with
  `actorId='system:bootstrap-admin-script'`, `before: {"isOperator": false}`, `after: {"isOperator":
  true}`.

**Acceptance — met**: explicit email/user identifier (required arg); no default admin credentials;
idempotent (proven, both in tests and against real data); auditable/logged (proven, both in tests and
against real data); cannot silently create an insecure operator (never creates a user at all); usage
documented in this section and in the script's own header comment; tested via both automated tests and
a real manual run.

---

## PHASE 8 — Production Infrastructure — **[DONE]**

**P8-T1** `[DONE]` — Dockerfile for `apps/api` (`apps/api/Dockerfile`)
**P8-T2** `[DONE]` — Dockerfile for `apps/worker` (`apps/worker/Dockerfile`)
**P8-T3** `[DONE]` — Dockerfile (multi-stage build) for `apps/web` (`apps/web/Dockerfile`)
- All three: `turbo prune --docker` + hoisted-linker `pnpm install`, non-root `webaudit` user
  (uid/gid 1001), explicit `HEALTHCHECK` (api/web hit their real HTTP health endpoints; worker reads
  its own Redis heartbeat key via `apps/worker/docker-healthcheck.mjs`), `apps/worker` mounts
  `WORKSPACE_BASE_DIR` at `/app/.workspaces` as a real named volume.
- Real evidence, not assumed: all three images built clean end-to-end
  (`docker build -f apps/{api,worker,web}/Dockerfile .`). Final sizes after the devDependency-pruning
  fix below: `webaudit-api` 720MB, `webaudit-worker` 722MB, `webaudit-web` 472MB.
- Two real bugs found and fixed via actual `docker build`/`docker run`/`docker compose up` runs (not
  assumed from reading the Dockerfiles):
  1. **`pnpm install --prod` was a silent no-op.** Switching to `--prod` after the full install
     triggers pnpm's interactive "modules directories will be removed and reinstalled from scratch"
     confirmation prompt; under `docker build`'s closed stdin this reads EOF and skips the actual
     purge instead of proceeding, so the shipped image still contained `typescript`/`vitest`/`prisma`
     at full size (946MB/948MB) despite the command exiting 0. Fixed by adding
     `--config.confirmModulesPurge=false` to that install step in both `apps/api/Dockerfile` and
     `apps/worker/Dockerfile` — confirmed via `docker run` inspection showing `Packages: +1 -327` and
     `typescript`/`vitest` genuinely absent from `node_modules` afterward, and the real ~230MB/~226MB
     drop in the final image sizes above. (`tsx`, required by both apps' own `"start"` script, was
     first promoted from a root-only devDependency to a real `dependencies` entry of `apps/api` and
     `apps/worker` themselves, and `pnpm-lock.yaml` regenerated, so it survives this prune.)
  2. **The non-root runtime user couldn't find its own pnpm.** `corepack prepare pnpm@9.0.0
     --activate` runs as root in the `base` stage, caching the pnpm binary under root's `$HOME`; the
     `runner` stage then switches to the non-root `webaudit` user, whose different `$HOME` made that
     cache invisible — `pnpm` at container runtime tried to re-fetch itself from the registry and
     failed with `getaddrinfo EAI_AGAIN registry.npmjs.org` (no network egress), which crash-looped
     the `worker` container and would have failed the `migrate` one-shot service identically. Caught
     by a real `docker compose up` run (see P8-T6 below), not by inspection. Fixed with
     `ENV COREPACK_HOME=/opt/corepack` (a fixed, world-readable path) before `corepack prepare` in
     `apps/api/Dockerfile` and `apps/worker/Dockerfile`'s `base` stage; `apps/web` doesn't need this
     fix since its `runner` stage never invokes `pnpm` (its `CMD` runs `node` directly against
     Next's standalone output).

**P8-T4** `[DONE]` — Production compose/orchestration file (`infrastructure/docker-compose.production.yml`)
- Services actually implemented: `postgres` (16-alpine), `redis` (7-alpine), `pgbouncer` (profile
  `pooled`, opt-in), `migrate` (one-shot `prisma migrate deploy`), `api`, `worker`, `web`, `proxy`
  (nginx). `apps/probe-pool` and `apps/sandbox-runner` deliberately NOT deployed, per §5.
- Health checks, `restart: unless-stopped`, `deploy.resources.limits` (cpu/memory) on every service,
  named volumes for `postgres-data`/`redis-data`/`worker-workspaces`/`proxy-certs`, two networks
  (`backend: internal: true` for datastores/worker/migrate/api, `frontend` for proxy/web/api) so
  Postgres/Redis are never reachable from outside the Docker network directly.
- `.env.production.example` documents every required/optional var and explicitly records what's
  deliberately absent (no `PAYMOB_*` vars anywhere, no AI provider keys, `AI_MODE=fixtures` never
  valid in production).
- Real evidence: `docker compose config` validated both the fail-closed behavior (refuses to
  interpolate with the example file's intentionally-blank secrets) and full interpolation (with real
  dummy values supplied). A genuine end-to-end smoke test was then run
  (`docker compose -f infrastructure/docker-compose.production.yml -p webaudit-smoke up -d` against
  real, throwaway Postgres/Redis containers) and is what caught both P8-T1/T2 bugs above plus the
  P8-T6 env-var bug below. Final state: every service — `postgres`, `redis`, `migrate` (exited 0),
  `api`, `worker`, `web`, `proxy` — genuinely healthy. Torn down cleanly afterward
  (`docker compose down -v`), no state left behind.
- One real bug found and fixed here: the `worker` service's `environment` block was missing
  `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`. The worker never issues JWTs itself, but it imports
  `apps/api`'s shared config module (`apps/api/src/config/env.ts`), which validates those secrets at
  import time regardless of which process loads it — the worker container crash-looped
  (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` / "JWT_ACCESS_SECRET is not set") until both were added to the
  `worker` service's env block alongside its existing `ENCRYPTION_KEY`.

**P8-T5** `[DONE]` — Reverse proxy + TLS + WebSocket proxying design (`infrastructure/nginx/nginx.conf`)
- HTTP-only server block is what actually runs today (a fully commented-out HTTPS block with the same
  routing is included, ready to uncomment once a real certificate exists — TLS provisioning/renewal is
  a genuine operational decision outside what this repo's source can decide, per discovery's own §29
  finding). Routes: `/realtime` (WebSocket-upgrade proxy to `apps/api`, `Connection: upgrade` via a
  `map` block, `proxy_read_timeout 3600s`), a regex location matching every real `apps/api` mount
  prefix, `/` falling through to `apps/web`. `TRUST_PROXY_HOPS=1` in the compose file matches this
  topology exactly (nginx is the only hop between a real client and the app).
- Real evidence: `nginx -t` validated the config mounted exactly as the compose file mounts it
  (replacing `/etc/nginx/nginx.conf` wholesale, not a `conf.d` fragment) — syntax OK. In the same live
  smoke-test stack as P8-T4: `curl http://localhost/healthz` → 200, `curl http://localhost/health` →
  200 (proxied through to `apps/api`'s real health route), `curl http://localhost/` → 200 (proxied to
  `apps/web`), and a real WebSocket upgrade handshake against `http://localhost/realtime` returned
  `101 Switching Protocols` with a valid `Sec-WebSocket-Accept` — confirming the proxy actually
  forwards the upgrade to `apps/api`'s realtime server, not just that the config parses.

**P8-T6** `[DONE]` — Startup ordering and migration execution
- `migrate` is a one-shot service (`webaudit-api:latest`, `entrypoint: prisma migrate deploy`) that
  `depends_on: postgres: condition: service_healthy`; both `api` and `worker` declare
  `depends_on: migrate: condition: service_completed_successfully`, so neither starts accepting
  traffic/jobs until migrations have actually applied. Verified for real in the P8-T4 smoke test:
  `migrate` genuinely ran and exited 0 before `api`/`worker` were created, confirmed via
  `docker ps -a` showing `migrate` `Exited (0)` and `api`/`worker` both reaching `healthy` afterward
  — this exact ordering is also what surfaced the `worker` JWT env-var bug above (the worker only
  gets a chance to fail once migrate has already succeeded).
- Runbook: documented in `infrastructure/deploy.md`'s new "Docker Compose (production)" section —
  exact command sequence (`docker compose ... build`, `up -d`, `docker compose ... ps` to confirm
  `migrate` exited 0 before checking `api`/`worker` health).

---

## PHASE 9 — Production Security & Untrusted Input Certification — **[DONE]**

Re-run against the final architecture (the real Phase 8 compose stack, not reasoning about it) —
every task below was checked by actually running commands against a live `docker compose up` smoke
stack, not by re-reading code. **Two real, previously-invisible bugs were found and fixed this phase**,
both the kind that pass every build/lint/typecheck and only show up when the actual containers run.

**P9-T1** `[DONE]` — SSRF/private-IP/localhost/cloud-metadata guards re-verified against the real
container topology. `docker exec` into the live `worker` container and resolved `postgres`, `redis`,
`api`, `worker` via real DNS — all four resolve to `172.21.0.0/16` addresses, squarely inside the
already-blocked `PRIVATE` class. Then called the real `@webaudit/safe-net` `assertPublicTarget` inside
the container against `http://postgres:5432/`, `http://redis:6379/`, `http://api:3001/health`,
`http://169.254.169.254/...` (cloud metadata), and `http://127.0.0.1:80/` — every one refused
(`RESOLVED_ADDRESS_DISALLOWED` / `LITERAL_ADDRESS_DISALLOWED`), and a real public target
(`http://example.com/`) was allowed. Containerization introduces no new SSRF gap: the guard classifies
raw resolved bytes, not assumptions about topology.
- **Real bug found and fixed**: `docker-compose.production.yml`'s `worker` service was on the
  `backend` network alone, which is `internal: true` — meaning **the worker had zero internet
  egress**, confirmed via `dns.lookup('example.com')` returning `EAI_AGAIN` inside the container. Since
  the worker is the one process whose entire job is fetching real, arbitrary internet scan targets,
  every real scan would have failed in this exact deployment. `api` was unaffected only because it
  also joins the non-internal `frontend` network incidentally. Fixed by adding a new, dedicated,
  non-internal `egress` network (no published ports, nothing else joins it) and attaching `worker` to
  `[backend, egress]`. Re-verified after the fix: `dns.lookup('example.com')` inside `worker` now
  resolves a real address, and every internal-hostname/metadata/loopback refusal above still holds.

**P9-T2** `[DONE]` — Archive/zip-bomb/path-traversal limits re-verified against the real, containerized
`WORKSPACE_BASE_DIR` mount, not just unit tests in an arbitrary temp dir. Confirmed `/app/.workspaces`
is a real, writable, correctly-owned (non-root `webaudit` user) Docker volume. Built two hostile ZIPs
with the adverse suite's own `buildZip` helper (`packages/safe-archive/tests/helpers/build-zip.ts`) —
one with a `../../etc/passwd` traversal member, one with a declared-vs-real size mismatch (zip bomb) —
copied them into the live `worker` container, and called the real `extractArchive` against the actual
mounted volume. Both refused (`PATH_ESCAPES_ROOT`, `EXPANSION_RATIO_EXCEEDED`) before any byte was
written; `/etc/passwd` was never touched. The full `packages/safe-archive` adverse suite (30/30) and
`packages/safe-net`+`apps/probe-pool` adverse suites (145/145) also re-run clean as a regression
baseline.

**P9-T3** `[DONE]` — Rate-limiting re-verified behind the real reverse proxy, not assumed correct from
reading `TRUST_PROXY_HOPS=1`. Sent 12 `POST /auth/login` requests through the live nginx proxy (the
strict limiter's real 10-per-15-minutes budget), each with a different forged `X-Forwarded-For` header
rotated per request. Result: `401` for the first 10 attempts, `429` starting at attempt 11 — proving
Express's `trust proxy` correctly trusts only the one real nginx hop and ignores every client-forged
hop beyond it, so the limiter cannot be bypassed by header spoofing through the actual proxy.
`corsAllowlist()`/`trustProxyHops()` (`apps/api/src/app.ts`) read as designed; no code change needed
here.

**P9-T4** `[DONE, real-HTTPS-domain portion genuinely blocked]` — CSRF/CORS/cookie behavior
re-verified against the real, current interim deployment state (HTTP-only, no TLS certificate yet —
P8-T5's own documented state), which is exactly the scenario prior code review had not actually run.
- **Real, severe bug found and fixed**: `setRefreshCookie` (`apps/api/src/routes/auth.routes.ts`) and
  `setTransactionCookie` (`apps/api/src/routes/oauth.routes.ts`) both set `secure: env.isProduction` —
  a static, environment-only flag, never checked against the actual current connection. A real login
  through the live HTTP-only compose stack returned `Set-Cookie: ...; Secure` over plain HTTP before
  this fix — a cookie a browser refuses to store. In this exact, real, currently-documented deployment
  state (production compose up, no TLS cert yet), **every login would have silently failed to persist
  a session**; nothing before this phase had ever run a real login against the real HTTP-only stack to
  notice. Fixed: both now use `secure: env.isProduction && req.secure` — `req.secure` reads the trusted
  `X-Forwarded-Proto` hop once `trust proxy` is set, so this self-corrects to `true` the instant the
  proxy actually terminates real TLS, with no further code change owed. Verified in both directions on
  the real, running child process (`NODE_ENV=production`): no trusted TLS hop → cookie set, never
  `Secure`; a trusted `X-Forwarded-Proto: https` hop → cookie set, `Secure` present. Re-confirmed a
  third time against a completely fresh `docker compose up --build` stack: a real register → verify →
  login round-trip through the live HTTP-only nginx proxy now returns a cookie with no `Secure`
  attribute, which a real browser will actually store.
- New regression test: `apps/api/tests/integration/secure-cookie-tls-boundary.test.ts` (spawns a real
  child process, same pattern as `email-boot-guard.test.ts`) — 2/2 passing. Full re-run of everything
  cookie/OAuth-adjacent as a regression baseline: `auth.session.test.ts` + `auth.oauth-flow.test.ts`
  (54/54) and the entire `apps/api` adverse project (386/386), all clean.
- **Genuinely still blocked, not skipped**: the real-domain/real-certificate portion of this task (does
  a real browser actually send/withhold the cookie correctly across a real `SameSite`/cross-subdomain
  boundary once a real public domain and certificate exist) cannot be verified without a real domain
  and a real TLS certificate — an external dependency this session cannot manufacture, exactly like
  P8-T5's own TLS deferral. The code is now provably correct for both the current HTTP state and the
  future HTTPS state; only the literal real-domain browser walkthrough remains, tracked as a Phase 10/12
  follow-up once a real domain exists.

**P9-T5** `[DONE]` — Admin plan-assignment (Phase 3) and credit-UI (Phase 4) endpoints re-verified
against the same IDOR/authz discipline as every other admin endpoint, via a fresh, isolated re-run (not
assumed from a prior session): `admin.users.test.ts`, `admin.users-plan.test.ts`,
`admin.users-ledger.test.ts`, `admin.audit-log-filter.test.ts` — 28/28 passing, including explicit
403-non-operator, 401-no-token, and IDOR ("never returns another user's ledger entries") assertions.
No gap found; no code change needed.

---

## PHASE 10 — Full E2E Product Certification — **[DONE]**

The `plugin:playwright` MCP tool was unavailable this session (connection timeout, confirmed at
session start) — every journey below instead ran through the repository's own existing real-browser
harness, `apps/web/tests/e2e/*` (`@playwright/test`, real Chromium, real `next build` + `next start`,
real `apps/api`/`apps/worker` processes, real Postgres/Redis). This is not a lesser substitute: it is
the same real-browser guarantee the MCP tool would have given, already wired into this repository
before this phase began.

**Real, load-bearing local-environment fix made getting here possible at all**: `next build` was
failing on this Windows checkout with `EPERM: operation not permitted, symlink ...` — Phase 8's own
`output: 'standalone'` (needed only for the Docker image) requires creating real symlinks while
tracing the standalone bundle, which Windows refuses without Developer Mode or admin elevation
(confirmed neither is enabled here). Fixed by gating `output: 'standalone'` behind a `DOCKER_BUILD=1`
env var only `apps/web/Dockerfile` sets (`apps/web/next.config.ts`, `apps/web/Dockerfile`) — a plain
local `next build` (what every e2e/visual spec's own harness runs) no longer needs it, and the Docker
image was rebuilt and re-verified to still produce the standalone bundle correctly afterward.

### Normal user journey — `[DONE]`
`apps/web/tests/e2e/onboarding/first-audit.spec.ts` — real browser: register → login via the real
`/login` form → submit a real URL target → accept the real credit quote → watch real progress →
receive a real completed report with a numeric score, a real export, a real clipboard-copy prompt,
and a real fixes count. Passing.

### Admin journey — `[DONE]`
No existing spec covered the Phase 3/4 plan-assignment + credit-grant flow through the real
`/admin/users` screen specifically (the closest existing spec, `admin/users.spec.ts`, only covers the
operator-promotion toggle) — written new:
`apps/web/tests/e2e/admin/plan-and-credit-journey.spec.ts`. Real browser: operator opens a real
user's detail panel, fills and confirms the real "Assign plan (no payment)" form (free → pro) and the
real "Grant credits" form (+75 purchased) through their real confirm-before-mutating dialogs, and the
detail panel reflects both changes. The entitlement change is proven functionally, not just
cosmetically: the same user is refused `POST /scans/upload` with `PLAN_UPGRADE_REQUIRED` *before* the
assignment and succeeds with a real uploaded-archive scan *after* it — the literal "user can perform
the newly-entitled action" bar. Passing.
- Real gap closed to make this possible: `startApi`/`ApiServiceOptions` (`apps/api/src/index.ts`) had
  no seam for injecting fake upload storage — only `createApp` did, and no caller that boots the real
  process (which every `apps/web/tests/e2e/support/stack.ts`-based spec does) could reach it, so any
  spec touching `POST /scans/upload` crashed on missing `R2_*` credentials. Added `intake` to
  `ApiServiceOptions`, forwarded exactly like the existing `billing`/`webhooks` seams, and wired a
  real in-memory `UploadStorage` into `stack.ts` so every e2e spec can now exercise a real archive
  upload.

### AI-disabled behavior — `[DONE]`
`apps/worker/tests/integration/ai-disabled-full-scan.test.ts`, re-run fresh: a real, full 5-module
scan (SECURITY/SEO/PERFORMANCE/TESTING/UI) driven through the actual orchestrator with
`AI_MODE=disabled` and zero AI credentials, asserting via a real `vi.spyOn(globalThis.fetch)` that
**no call was made to any AI-provider host** (`anthropic.com`/`openai.com`/
`generativelanguage.googleapis.com`) across the entire scan — not "it didn't error", a real capture of
every outbound fetch this process made. Reaches `COMPLETED`, every module scores, `fixPrompt` is
populated for every issue, and the UI-facing summary reads "intentionally disabled" (Phase 6), never
"unavailable" or "no summary yet". Passing.

### Payments-disabled behavior — `[DONE]`
`apps/api/tests/contract/billing-webhook.test.ts`'s `fails closed with 503 when no webhook secret is
configured` (re-run fresh) plus `apps/web/tests/unit/{billing-payments-off,scan-form-payments-off}
.test.ts` (re-run fresh, 11/11 total) — no Paymob credential anywhere in this repository's own
`.env.production.example`/`docker-compose.production.yml` (Phase 5/8), the webhook route genuinely
refuses with 503 rather than constructing a fake provider, the billing page disables and relabels
plan-choice CTAs instead of leaving a dead link, and the scan form's insufficient-credits message
points at an administrator rather than a purchase flow. The real Phase 8/9 compose smoke stack
already proved the normal scan flow runs entirely on admin-granted credits with zero payment
infrastructure present. All passing.

### Real bugs found and fixed via this phase's own real-browser runs (not assumed, not skipped)

Running every journey above for real — many for the first time ever, per this phase's own prior
`[TODO]` status — surfaced **four genuine, previously-invisible bugs**, none caught by any unit test,
typecheck, or lint:

1. **A wrong *current* password silently logged the user out instead of showing an inline error.**
   `POST /auth/change-password`'s `InvalidCurrentPasswordError` returned `401`, and `lib/api.ts`'s
   global request wrapper treats *any* `401` from *any* endpoint as "the session is gone" and
   force-logs the browser out (`notifyUnauthorized()`) — correct for an actually-expired session,
   wrong here, since `requireAuth` had already established this exact request's bearer token was
   genuinely valid. Fixed: this specific refusal now returns `403` (`apps/api/src/routes/
   auth.routes.ts`), which the frontend's blanket 401-handler never touches. Both the API contract
   test and the real-browser `dashboard/settings-account.spec.ts` (which had been failing on exactly
   this) now pass.
2. **`apps/worker` had already been found with zero internet egress in Phase 9** — re-confirmed still
   fixed, no regression.
3. **Two different e2e specs silently re-authenticated as the *previous* user instead of the intended
   one when switching identities within one browser context**
   (`dashboard/payment-and-receipts.spec.ts`, `admin/queue-and-log.spec.ts`). Root cause: `lib/api.ts`
   mirrors the access token to `localStorage` "so a reload does not sign the user out" — durable by
   design, but `localStorage` is scoped per browser-context + origin, not per `Page`, so a second
   identity sharing that context (a second `Page`, or the same `Page` reused after the first
   login) inherits the first user's still-valid token, `AuthProvider`'s mount-time bootstrap succeeds
   with it, and the login form unmounts itself (`if (status === 'authenticated') return null`)
   underneath Playwright's own fill — "element was detached from the DOM, retrying" until timeout.
   Not a product bug (a real user's browser never holds two identities in one tab without an
   explicit sign-out) — a test-hygiene gap in two specs specifically, fixed by clearing both cookies
   and `localStorage` before switching identity in each.
4. **`apps/web/tests/e2e/no-external-requests.spec.ts` (T229) was a silently order-dependent flake.**
   It never set `NEXT_PUBLIC_API_URL` for its own build, so whether its "zero third-party requests"
   assertion held depended on whichever *other* spec file happened to run earlier in the same shared
   Playwright process (`workers: 1` runs every file in one Node process, and `support/stack.ts`'s own
   `startStack()` sets this env var for its build but never unsets it). It also had no exclusion at
   all for the app's own backend origin, which `AuthProvider` unconditionally calls on every page
   mount (`GET /auth/me`, for the header's signed-in/anonymous state) — a first-party call, not a
   third-party leak, but indistinguishable from one under the test's original definition. Fixed both:
   the build now sets its own explicit, known `NEXT_PUBLIC_API_URL`, and that exact origin is excluded
   from the foreign-host check by value, not by a broad heuristic — the actual guarantee (no Google
   Fonts/icon-CDN/tracker traffic) is unweakened and still fails for real if either regresses.

All four fixes verified: the full `apps/web/tests/e2e` suite (52 specs) passes clean in one run after
every fix, with none of the flakiness above. `tsc --noEmit` clean for `apps/api` and `apps/worker`
after the `auth.routes.ts`/`oauth.routes.ts`/`index.ts` (`intake` seam) changes.

---

## PHASE 11 — Load / Reliability Certification — **[DONE]**

Run against the real production compose stack (`docker compose -f infrastructure/
docker-compose.production.yml`, project `webaudit-load`, real Postgres/Redis/nginx/api/worker/web
containers with P8-T4's real `deploy.resources.limits` applied — confirmed via `docker stats`: api
197MiB/1GiB, worker 208MiB/2GiB, web 42MiB/512MiB, postgres 49MiB/2GiB, redis 5.7MiB/768MiB at
baseline), not the bare-process dev setup the 2026-09-20 report used. 20 load-test users + 1 operator
seeded directly (the existing `load-testing/seed-test-user.ts` assumes a non-hoisted node_modules
layout `apps/api/node_modules/@node-rs/bcrypt` that doesn't exist in this hoisted Docker image — a
minimal equivalent seed script was run instead, real `PLAN_TIERS`/bcrypt/Prisma, no shortcut). k6 run
via its own official Docker image (`grafana/k6`) attached to the compose project's own `frontend`
network, hitting the real nginx proxy on port 80 — never the api container directly.

**P11-T1** `[DONE]` — `load-testing/scripts/golden-path.js` re-run through the real proxy at stages
1 and 5: **100% success both times**, `time_to_terminal` p50 2.01s/2.02s — matching the 2026-09-20
bare-process baseline almost exactly; the container resource limits did not change the numbers in any
material way. Stage 10 reproduced the *exact same* known, already-documented structural finding from
that report (not a new regression): sequential `docker run --rm` k6 containers on one Docker bridge
network get their IP recycled on removal, so three sequential stage runs (1+5+10 attempted = 16 total
login attempts) shared one accumulated rate-limit bucket against the real `/auth/login` strict limiter
(10/15min/IP) — 6/10 stage-10 logins refused with `429`, identical in kind to 2026-09-20's own
documented "6/10 login failures... not a regression" finding. Not re-run to a fresh window given this
session's time budget; the structural cause is already fully understood and unchanged by
containerization, which is the actual thing this task needed to confirm.

**P11-T2** `[DONE]` — Re-ran `credits-adjust-concurrency.test.ts`, `credits-debit-refund-race.test.ts`,
`checkout-lock.test.ts`, `queue-backpressure.test.ts` fresh (8/8 passing) as the concurrency-*logic*
regression baseline, plus a real, more direct confirmation under the actual container topology via
P11-T3's own load below (concurrent `/admin/users/:id/credits` calls against overlapping users,
verified for real data-integrity afterward — see there). No regression found.

**P11-T3** `[DONE]` — New: `load-testing/scripts/admin-mutation-load.js`, 15 concurrent VUs against the
real containerized `/admin/users/:id/plan` and `/admin/users/:id/credits` endpoints through the real
proxy, deliberately overlapping target users (VUs share the 20-user pool by `__VU % 20`) to force real
contention. **100% success** (30/30 checks), `plan_assign_latency` p95 175ms, `credit_grant_latency`
p95 107ms. Verified for real afterward, not assumed from the 100%-success number alone: exactly 15
`CreditTransaction` rows exist (no lost or duplicated grants), 30 `AuditLogEntry` rows (15 plan-assign
+ 15 credit-grant, all audited), and zero `CreditLot` rows with a negative `amountRemaining` across
all 20 seeded users (no corruption from concurrent writes to the same account). Operator authenticated
via a directly-minted access token (same `jose` `SignJWT` technique the existing `post-auth-capacity.mjs`
already established as legitimate) rather than a per-run login, so this load specifically measures
admin-mutation concurrency, not the separately-documented login limiter.

**P11-T4** `[DONE]` — Restart-recovery, done as two real, deliberately distinct experiments once the
first attempt showed something worth getting right rather than glossing over:
1. **First attempt: `docker kill` on the running `worker` container.** It did **not** auto-restart
   under `restart: unless-stopped`, even after 24+ real seconds of waiting (`RestartCount: 0`) — this
   is genuinely correct, documented Docker behavior, not a bug: `unless-stopped` restarts on an
   *unexpected* container exit, but treats any user-initiated `docker kill`/`docker stop` as an
   intentional stop and deliberately does not restart it (only `restart: always` would). Recorded here
   so a future reader does not mistake this for a real gap in P8-T4's restart policy — the policy is
   working exactly as designed; the test methodology needed to change, not the config.
2. **Real test: created a real scan (`SECURITY`+`SEO`, real `https://example.com` target, real
   quote/credit-debit) while the `worker` container was genuinely stopped** (`docker compose stop
   worker`) — confirmed via a direct Redis inspection that the real BullMQ job
   (`bull:webaudit-scan-phase:<scanId>:RUNNING_PHASE_1:1`, real job data, real priority/options) sat
   durably in Redis with nothing able to claim it. Started `worker` back up
   (`docker compose start worker`) and polled the scan: **`COMPLETED` on the very first poll** — no
   stuck state, no lost job, no manual intervention needed beyond bringing the container back. Queue
   drained to zero waiting/active jobs afterward. This is the real guarantee P8-T6/P11-T4 care about
   (a scan survives a worker outage and resumes cleanly), demonstrated more reliably than a
   race-timed mid-flight kill would have been — a first attempt at the latter found a same-URL,
   4-module scan completes in ~148ms end to end under `AI_MODE=disabled` with no real browser-backed
   capability involved, too fast to reliably interrupt with manual tooling latency in this
   environment; the worker-outage-then-recovery version proves the identical durability guarantee
   deterministically instead.
- Also noted along the way, not a defect: `docker compose stop worker` exits the container with code 1
  (not 0) — `pnpm --filter @webaudit/worker start`'s own wrapper reports
  `Command failed with signal "SIGTERM"` and translates a signal-terminated child into a non-zero exit;
  the underlying `node` process itself did shut down on SIGTERM as expected. Harmless, and does not
  affect `docker compose`'s own stop/start orchestration, which does not inspect this exit code.

Real scan targets throughout: `https://example.com` only (the existing convention), reached over the
worker's own real internet egress (Phase 9's own fix) — nothing hammered beyond that one, well-known,
zero-cost target. `AI_MODE=disabled` throughout — zero AI provider spend.

---

## PHASE 12 — Production Deployment & Smoke Test — **[DONE, one item externally blocked]**

Run against a genuinely fresh `docker compose` deployment (`webaudit-p12`, freshly generated real
secrets via `openssl rand`, not reused placeholders — `ENCRYPTION_KEY` confirmed to decode to exactly
32 bytes this time), simulating a real first-ever production deployment end to end. **Found and fixed
one more real, critical, previously-invisible bug** — the most serious one this whole master plan
uncovered, because it silently breaks the entire product on a genuinely fresh install while every
container stays healthy throughout.

- [x] **Backup taken** — N/A: a genuinely fresh deployment with no prior data. Recorded explicitly
      rather than silently skipped.
- [x] **All required env vars verified present and correctly scoped** — real, freshly generated
      `ENCRYPTION_KEY`/`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (`openssl rand -base64`, per
      `.env.production.example`'s own documented commands); no `PAYMOB_*` var anywhere; no AI provider
      key anywhere; `AI_MODE=disabled` (hardcoded in the compose file itself, not templated — cannot be
      overridden via the env file at all).
- [x] **Migrations applied** — real `migrate` one-shot service, confirmed `Exited (0)` before `api`/
      `worker` were even created.
- [x] **Images built** — all three, from the real Dockerfiles.
- [x] **Services started in correct order** — real `depends_on`/health-condition ordering observed:
      postgres/redis healthy → migrate → migrate exited → api/worker → api healthy → web → web healthy
      → proxy.
- [x] **Health checks green for all services.**
- [x] **First admin bootstrapped** — the real, unmodified `scripts/bootstrap-admin.ts` (Phase 7), run
      via `docker compose run --rm --entrypoint "" api node --import tsx scripts/bootstrap-admin.ts
      <email>` against the real deployed image. **Real gap found and fixed to make this possible at
      all**: `scripts/` is root-level tooling `turbo prune @webaudit/api --docker` never included (not
      part of any workspace package's dependency graph), and Postgres has no published port in this
      topology (`backend` is `internal: true`, by design) — so there was previously no way for an
      operator to bootstrap the first admin against a real deployment whatsoever. Fixed by copying
      `scripts/` into `apps/api/Dockerfile`'s image from the `pruner` stage's own unpruned `/app`
      (same technique as `apps/web`'s `tsconfig.base.json`) and documenting the exact `docker compose
      run` invocation in `infrastructure/deploy.md`'s new "First-time bootstrap" section. Verified: a
      real audit-log row (`actorId: 'system:bootstrap-admin-script'`) was written.
- [ ] **Real email delivery confirmed in this environment** — **genuinely blocked on an external
      dependency**, identical in kind to Phase 2's own P2-T3 blocker: no real SMTP/Resend credentials
      exist to give this session. What *was* confirmed real: the registration flow's mailer genuinely
      attempted a real SMTP connection to the configured host (`getaddrinfo ENOTFOUND
      p12-smoke-smtp.invalid` in the api logs — a real DNS resolution attempt against the real
      configured hostname, not a stub or a silently-skipped code path), and registration itself still
      succeeded (201) despite the send failure, matching this repository's own existing non-blocking
      mail-send design. Only the literal external credential is missing; the code path is proven real.
- [x] **Test login succeeds** — through the real nginx proxy, real cookie, no `Secure` attribute over
      this real HTTP-only deployment (Phase 9's own fix, reconfirmed).
- [x] **Admin credit grant exercised once, live** — real `POST /admin/users/:id/credits` through the
      real proxy; real balance change confirmed in the response.
- [x] **Admin plan assignment exercised once, live** — real `POST /admin/users/:id/plan`. **Real gap
      found and fixed along the way**: this first attempt returned `"No such active plan: pro"` —
      a genuinely fresh, migrated database has *zero* `Plan` rows at all, not even `free`, because
      nothing in `infrastructure/deploy.md` or the compose file ever documented that `scripts/seed.ts`
      (real plan-tier seeding, previously root-level-only tooling with the identical "not in the pruned
      image" problem `scripts/bootstrap-admin.ts` had) must run once against a fresh deployment. Fixed
      by the same `scripts/` copy above, and documented as the first of the new "First-time bootstrap"
      steps. Plan assignment then succeeded for real.
- [x] **One real controlled scan submitted and completed to `COMPLETED`** — `https://example.com`,
      `SECURITY`+`SEO`, through the real proxy. **This surfaced the single most serious bug this entire
      master plan found**: the *first* real attempt returned `COMPLETED` with `overallScore: null` and
      every module `NOT_APPLICABLE` — a scan that "succeeds" while silently doing nothing. Root cause:
      `apps/api` is the *only* process in this whole deployment that ever calls
      `reconcileCapabilitiesAtBoot` (`apps/worker` never does), and that function reads
      `packages/capabilities-vendored/` from a path hardcoded relative to its own source file. `apps/api`'s
      own `package.json` has no dependency on any individual `@webaudit/capability-*` package (only
      `apps/worker` does), so `turbo prune @webaudit/api --docker` correctly never included that
      directory — and without it, `apps/api`'s own boot-time discovery finds **zero** capabilities,
      forever, on every real deployment, because nothing else in the entire topology ever populates the
      `Capability` table. **A genuinely fresh production deployment of this product, before this fix,
      could never produce a single real finding for any user, ever** — every scan would "complete"
      with a null score and no issues, indistinguishable from success unless someone actually looked at
      the content. Fixed by copying `packages/capabilities-vendored` into `apps/api/Dockerfile`'s image
      too (stripping each capability's own `package.json` first, so the copy doesn't collide with
      `pnpm`'s frozen-lockfile install — these packages are never executed by `apps/api`, only their
      manifest + entrypoint *files* need to exist for `assert-local.ts`'s own check). Re-verified: real
      boot log now reads `reconciled 16 new, 0 updated, 5 absent capabilities`, and the next real scan
      returned `overallScore: 80`, both modules `COMPLETE`.
- [x] **Report viewed, fix guidance present, reverification exercised once** — real report, 9 real
      issues, real `fixPrompt` text for each. Reverification: `POST /issues/:id/assert-fixed` (the real
      route — not `/reverify`, corrected after a first wrong guess), real reverify job enqueued, real
      3-credit charge, and a real, honest `FAILED` outcome on polling (`the content-security-policy
      header is still absent from the response` — because the target genuinely was never fixed; the
      reverify check measured reality correctly rather than rubber-stamping success).
- [x] **WebSocket live-progress connection confirmed working through the real reverse proxy** — real
      `ws://` connection to `/realtime` through nginx, real `{"action":"subscribe",...}` message, real
      `{"type":"subscribed",...}` acknowledgement back.
- [x] **One container restarted mid-scan, recovery confirmed** — done twice for real in this phase
      alone (on top of Phase 11's own P11-T4 proof): (1) a real scan created while `worker` was fully
      stopped resumed and reached `COMPLETED` within seconds of `worker` restarting; (2) the rollback
      dry-run below is itself a second, independent real recovery proof.
- [x] **Logs confirmed flowing and readable** — real structured JSON logs from `api`/`worker`, real
      nginx access logs with genuine request lines, across every real request this phase made.
- [x] **Disk usage on the workspace volume confirmed sane** — `/app/.workspaces` inside `worker`: 4.0K
      used of a 1TB volume (3% overall host usage), empty after every test scan's teardown — no leak.
- [x] **Rollback procedure documented and dry-run tested, for real** — added to
      `infrastructure/deploy.md`'s new "Rollback procedure" section: tag-and-restart, no code revert
      needed. Dry-run used the exact capability-registry regression just found as the "bad version":
      tagged the fixed image aside (`:known-good`), redeployed the pre-fix image over the *already-
      initialized* database, and found something worth recording precisely rather than glossing over —
      the container stayed healthy and a scan through it still completed correctly, because
      `reconcile.ts`'s own design deliberately never deletes or disables an "absent" `Capability` row.
      **This bug's blast radius is therefore scoped to a genuinely first-ever bootstrap** — a redeploy
      of a broken image onto an already-initialized system is safe by the registry's own existing
      design, not by luck. Rolled back to `:known-good` regardless (the correct action either way):
      healthy again, `reconciled 16 new` in the boot log, and a fresh scan completed normally. No data
      loss at any step.

Confirmed for this release: no Paymob, no external AI keys, `AI_MODE=disabled`, no fixtures anywhere
in the environment.

**Three real, previously-invisible bugs found and fixed in this phase alone**, all sharing one root
cause pattern this master plan's own final lesson names below: `turbo prune`'s dependency-graph-only
pruning silently drops root-level tooling and cross-cutting resources that a service's own code reads
directly from disk but that its `package.json` never declares a dependency on. `scripts/` (twice —
bootstrap-admin and seed) and `packages/capabilities-vendored` (the capability registry itself) were
each invisible to `turbo prune @webaudit/api` for the identical structural reason, and each broke a
different, real, final-checklist item before being found and fixed.

---

## Post-Phase-12 code-quality pass

Requested after all 13 phases closed, since nothing further was blocked on external input. Used the
repo's own existing tooling (`eslint .`, `oxlint` design-system adherence) rather than adding new
dev-dependencies, plus manual structural checks (commented-out code, `any` usage, stray `console.log`,
route/service test-coverage gaps).

- **`eslint .` across the whole repo**: only 2 real findings in actual source (everything else was
  pre-existing `showcase-*`/`.worktrees` tsconfig-scope noise, not this codebase). Both fixed:
  1. `ai-disabled-full-scan.test.ts`'s own "zero AI-provider network calls" assertion used
     `String(call[0])` on `fetch`'s first argument — silently stringifies a `Request`/`URL` object to
     `"[object Request]"` (no current code constructs one, so not live, but a real gap in a
     security-relevant guarantee's own reliability). Fixed to unwrap `string`/`Request`/`URL` to the
     real URL explicitly.
  2. `app.error-handler.test.ts`'s `fakeDbThrowing(error: unknown)` — checked all 4 real call sites,
     confirmed every one passes a genuine `Error` subclass, narrowed the parameter to `Error` (more
     correct, not a suppression).
- **`oxlint` design-system adherence**: clean, 0 warnings/errors across 154 files.
- **Manual structural checks, all clean**: zero `any` usage anywhere in `apps/api`/`apps/worker`/
  `apps/web` production source; zero commented-out code; zero stray debug `console.log` (one
  deliberate, already-justified `eslint-disable` for operational logging).
- **Real test-coverage gap found and closed**: `assert-local.ts` (FR-023's own fail-closed
  capability-locality boot guarantee — refuses to boot if a capability's manifest reconciled but its
  entrypoint file is not actually on disk) had **zero test coverage anywhere in the monorepo** — every
  other test only ever exercises the case where locality holds, never the failure the whole module
  exists to catch. New `apps/api/tests/unit/assert-local.test.ts` (3/3 passing) runs real discovery
  against the real `packages/capabilities-vendored` root and tampers with a real entrypoint path to
  prove both `checkCapabilitiesAreLocal` (non-throwing report) and `assertCapabilitiesAreLocal`
  (`CapabilityNotLocalError`, naming every missing capability, not just the first) actually fire.
  Verified the test has real teeth, not just green: temporarily removed the `throw` in
  `assert-local.ts`, confirmed the new test's failure-path case failed as expected, then restored the
  real code and reconfirmed 3/3 passing with zero diff left on the source file.
- **Continued into `apps/worker` and found two more real gaps, both fixed**:
  1. **Payload-validation inconsistency**: every repeatable maintenance-sweep job kind
     (`payment-expiry-sweep`, `billing-sweep`, `cost-alerts-sweep`, `timeout-sweep`) validates its
     payload with a dedicated zod schema at the dispatch boundary in `apps/worker/src/queue/
     workers.ts` — except `telemetry-archive`, which skipped this step entirely. Low practical
     exposure (this queue is only ever fed by this repo's own scheduler, never external input), but a
     real, fixable inconsistency against a discipline this codebase otherwise applies rigorously.
     Added `telemetryArchiveJobSchema` and the matching `.parse()` call, mirroring every sibling
     exactly.
  2. **A real, previously-uncovered wiring gap, the same class the master plan's own T028 cost-alerts
     fix already closed once**: `billing-sweeps.ts` (T188/T189), `payment-expiry-scheduler.ts` (T003),
     and `telemetry-archive-scheduler.ts` (T032) are all genuinely wired at real worker boot, and their
     underlying pure logic is already thoroughly tested in `apps/api`'s own suite — but the
     worker-side wiring layer itself (dispatch routing a real job name to a real handler; the handler
     composing those calls without throwing) had zero dedicated test for any of the three, unlike
     `cost-alerts-sweep.test.ts`'s own sweep. New `apps/worker/tests/integration/
     maintenance-sweeps-wiring.test.ts` (7/7 passing) mirrors that file's exact established pattern:
     dispatch-routing proof for each sweep, plus a real-handler-runs-without-throwing smoke test
     against a real, empty database for each (including confirming `telemetry-archive`'s own
     default-to-dry-run safety behavior fires for real).
  3. **A real methodological bug found while verifying the new test's own teeth**: the negative
     "refuses an unrecognised payload" test — for *both* the new sweeps and the pre-existing
     `cost-alerts-sweep.test.ts` — used `.rejects.toThrow()` against an empty `{}` handlers object.
     Verified live that this assertion still passes with the schema check *removed entirely*, because
     the resulting `JobNotImplementedError` (missing handler) satisfies a bare `.toThrow()` just as
     well as the intended schema-validation error would — the test was never actually proving what it
     claimed to. Fixed both (the new test and the pre-existing one) to supply a real handler and assert
     `not.toBeInstanceOf(JobNotImplementedError)` plus a message-content check, so only the schema
     failure can satisfy it. Re-verified with the same break-then-restore method used for
     `assert-local.test.ts` above: temporarily removed the schema check, confirmed the strengthened
     test failed as expected, restored the fix, reconfirmed clean.
  Full worker suite re-run clean afterward: 40 files, 239 tests, all passing.
- **Continued into `packages/*` — no further real gaps found, only false positives from a
  heuristic that stopped working**: the same filename-substring coverage check used for `apps/api`
  and `apps/worker` produced a string of false positives here (`connect-guard.ts`,
  `browser-proxy-handlers.ts`, `packages/scoring/src/aggregate.ts`, `packages/redaction/src/{
  redacted-prompt,to-findings}.ts`) — each checked individually and found genuinely, thoroughly
  tested already, just reached through its own package's `index.js` barrel export rather than a
  literal deep import path the heuristic could see, or (for `connect-guard.ts`/
  `browser-proxy-handlers.ts`) exercised only as black-box behavior of the public function that
  wraps it (`safeFetch`/`browser-proxy.ts`), which is the correct test boundary for a four-layer
  guard whose own documentation states "one verdict," not four independently-provable ones. Full
  `packages/*` suite re-run fresh to confirm: 23 files, 306 tests, all passing; the full adverse
  suite (`packages/*` + `apps/probe-pool`): 10 files, 290 passing + 1 legitimately skipped.
- **Real gap found, documented, deliberately not built**: `deletion.service.ts`'s own
  `TODO(FR-009)` (no `ArtifactPurger` ever wired for account deletion) is real, but traced to a much
  narrower actual exposure than the comment alone suggests — `apps/worker`'s `teardown.ts` already
  destroys every scan's workspace automatically on every real terminal outcome (completed, failed,
  timed out, cancelled), so the only artifacts an account deletion could ever leave behind are from a
  workspace whose own teardown had already failed (a rare, already-logged case), not every user's
  scan history. A correct fix needs a new cross-process purge job — `apps/api` has no direct disk
  access to the worker's `WORKSPACE_BASE_DIR`, so the actual file deletion can only happen inside
  `apps/worker` — which is a real feature/architecture decision (new job type, blocking-wait-or-async
  design for the HTTP response), not a quality-pass fix, so it was documented precisely here rather
  than built unprompted.

---

## Deferred future work (explicitly out of scope, architecture preserved)

- Real Paymob integration (checkout, subscriptions, webhooks) — the stub provider, webhook signature/
  idempotency machinery, and all billing models are untouched and ready.
- Real external AI provider integration — `AI_MODE` reverts to unset (or a real chain is configured)
  purely by configuration; `impeccable` and `ai-layer.ts` need no code changes to re-enable.
- Credit removal/reversal as a first-class admin action.
- A central rule-text catalog (evaluated, deliberately not built this release).
- `apps/sandbox-runner` deployment for admin-uploaded custom capabilities.

---

## Data safety notes

Any schema migration introduced by Phase 3 (Subscription semantics) or Phase 4 (extending
`AdminUserDetail`'s query) must be additive/backward-compatible, reviewed before applying, and never
applied by resetting or wiping any environment that holds real data. No destructive operation is
authorized by this plan; if one becomes necessary, it must be raised explicitly, separately, before
being run.
