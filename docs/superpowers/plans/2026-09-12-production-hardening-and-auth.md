# Production Hardening and Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make WebAudit AI’s authentication flow, payment lifecycle, lifecycle email, operational controls, and release process verifiably safe for a production launch.

**Architecture:** The existing API remains the sole authorization, payment, ledger, and entitlement authority. The frontend uses its centralized `AuthProvider` only to render truthful state and redirect users; all financial/provider effects run through existing API seams (`PaymentProvider`, `BillingEvent`, credit ledger). Delivery is ordered so pre-existing local work is reconciled first, unblocked code follows, then external staging and production gates supply the evidence local tests cannot.

**Tech Stack:** Next.js 15/React 19, Express, Prisma/PostgreSQL, BullMQ/Redis, Vitest, Playwright, Paymob REST API, selected transactional-email transport, selected APM provider.

**Spec:** [production-hardening execution design](../specs/2026-09-12-production-hardening-execution-design.md), [feature specification](../../../specs/005-production-hardening/spec.md), and [task catalogue](../../../specs/005-production-hardening/tasks.md).

## Global Constraints

- Preserve Constitution Principles III, IV, V, and VI; no client-controlled financial decisions or direct provider bypasses.
- Read `specs/005-production-hardening/ENGINEERING-STANDARDS.md` fully before every task under this initiative.
- Validate HTTP inputs with Zod; use `{ error: { code, message } }` responses; all money stays integer micros.
- New provider clients fail closed at construction; credentials never enter source, logs, tests, or documentation.
- Use `AI_MODE=fixtures`; serialize DB/Redis suites; do not run them against a development worker.
- No completion claim without task tests, applicable type/lint/format gates, and the named manual verification evidence.
- Preserve the existing dirty worktree. Reconcile existing changes; do not overwrite or duplicate them.

---

## Release 0 — Authentication and Current-Work Reconciliation

### Task A01: Reconcile centralized frontend authentication

**Files:**
- Inspect: `apps/web/components/auth/AuthProvider.tsx`, `apps/web/components/auth/RouteGuard.tsx`, `apps/web/lib/api.ts`
- Inspect: `apps/web/app/layout.tsx`, `apps/web/app/(dashboard)/layout.tsx`, `apps/web/app/(admin)/admin/layout.tsx`
- Test: `apps/web/tests/unit/auth-route-protection.test.ts`, `apps/web/tests/unit/api-auth-client.test.ts`, `apps/web/tests/e2e/admin/access-gate.spec.ts`

**Produces:** a recorded baseline for `loading | anonymous | authenticated`, safe internal `next` redirects, 401 token cleanup, dashboard protection, and operator-only admin protection.

- [ ] Run the auth unit tests and confirm anonymous users never see protected shells while identity is loading.
- [ ] Run the browser route-access suite with one worker: anonymous dashboard/admin deep links go to login; customers reach `/scan` but not `/admin`; operators reach `/admin`.
- [ ] In a browser, create or use a verified local user; sign in, refresh `/scan`, sign out, and confirm a refresh of `/scan` redirects to login.
- [ ] Record the exact test counts and manual observations in `PROGRESS.md`; do not mark this complete if the browser uses mocked identity.

### Task A02: Correct local web/API origin configuration

**Files:**
- Inspect/modify only if needed: `.env.example`, local environment setup documentation, `apps/api/src/app.ts`, `apps/api/src/config/env.ts`
- Test: existing API CORS/auth contract tests and browser sign-up/sign-in flow

**Produces:** one documented local web URL that the API explicitly permits, without broad wildcard CORS or weakening production origin checks.

- [ ] Reproduce the browser preflight against the actual API and record the web origin and `Access-Control-Allow-Origin` result.
- [ ] If configuration differs from the documented dev URL, change only the local configuration/documentation; do not add `*` CORS access.
- [ ] Confirm registration, login, `GET /auth/me`, plans, and issue-count requests succeed from the configured web origin.
- [ ] Add or update a contract test only if source behavior changes; run the focused auth/API test suite.

### Task A03: Reconcile payment foundations already present locally

**Files:**
- Inspect: `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/20260912142326_pending_payment_status_enum/migration.sql`
- Inspect: `apps/api/src/services/billing/{pending-payment,checkout-lock,checkout.service,payment-expiry-sweep}.ts`
- Inspect: `apps/worker/src/orchestrator/payment-expiry-scheduler.ts`, `apps/worker/src/index.ts`
- Test: `apps/api/tests/unit/{pending-payment,payment-expiry-sweep}.test.ts`, `apps/api/tests/adverse/checkout-lock.test.ts`

**Produces:** verified T001–T003 implementation without duplicate migrations or conflicting state transitions.

- [ ] Check the migration history and `prisma migrate status` against the local development database.
- [ ] Run focused unit/adverse tests, then the broader API billing and worker queue suites serially.
- [ ] Manually issue concurrent local checkout starts and observe exactly one `201` and one `409 CHECKOUT_IN_PROGRESS`.
- [ ] Manually verify an abandoned row becomes `EXPIRED` and a duplicate signed stub webhook creates only one billing event, ledger effect, and receipt.

### Task A04: Resolve conditional launch decisions

**Files:**
- Modify: `specs/005-production-hardening/tasks.md` and `PROGRESS.md` only after decisions are supplied

**Produces:** named owner, decision, and evidence for the connection-pooler threshold, Paymob account, email transport, APM vendor, retention policy, and capacity projection.

- [ ] Obtain the business/operator answers listed in the dependency table of the approved design.
- [ ] Record each decision with date, owner, selected option, and affected task IDs.
- [ ] Leave dependent tasks explicitly blocked when an external answer or credential is absent; never fabricate credentials or mark the gate complete.

## Release 1 — Real Payment Provider (synthetic tests first)

### Task P01: Implement and test Paymob HMAC verification (T005)

**Files:**
- Create: `apps/api/src/services/billing/paymob-hmac.ts`
- Create: `apps/api/tests/unit/paymob-hmac.test.ts`

**Produces:** `verifyPaymobHmac(payload, signature, secret): boolean`, using Paymob’s documented SHA-512 field order, format validation, and `timingSafeEqual`.

- [ ] Write failing vectors for valid, forged, malformed, reordered, and missing-field signatures.
- [ ] Implement the single production verifier; tests import that module directly.
- [ ] Deliberately break the real comparison once, observe a failing security test, revert, and record the evidence.
- [ ] Run focused unit tests plus API type/lint/format checks.

### Task P02: Build Paymob checkout provider and configuration (T007–T009)

**Files:**
- Create: `apps/api/src/services/billing/paymob-payment-provider.ts`
- Create: `apps/api/src/services/billing/from-env.ts`
- Modify: billing composition root and `.env.example`
- Test: `apps/api/tests/unit/paymob-payment-provider.test.ts`

**Produces:** a configured `PaymentProvider` that creates Paymob authentication, order, and payment-key requests with explicit timeout/error mapping, and a stub fallback only for development/test.

- [ ] Write failing mocked-fetch tests for all three checkout calls, timeout, 401, 429, and 5xx outcomes.
- [ ] Implement fail-closed configuration when Paymob is selected; use server-computed integer-micro prices with an explicit provider-unit conversion.
- [ ] Wire environment selection so an absent Paymob selection retains the stub in local/test mode, while a selected incomplete configuration prevents boot.
- [ ] Run the full existing billing suite serially and manually boot the API once in stub mode.

### Task P03: Implement Paymob webhook, refund, and adversarial suite (T008, T010)

**Files:**
- Modify: `apps/api/src/services/billing/paymob-payment-provider.ts`
- Create: `apps/api/tests/adverse/paymob-webhook-security.test.ts`

**Produces:** `verifyWebhook()` returning only verified, normalized `PaymentEvent`s and `refund()` with typed failures; forged or malformed input returns `{ valid: false, events: [] }` without a write.

- [ ] Write failing adverse tests for bad HMAC, bad currency/amount, malformed payload, replay, duplicate delivery, and refund error outcomes.
- [ ] Implement normalization through `paymob-hmac.ts`; reuse the existing `BillingEvent`/`appliedAt` idempotency path rather than adding another gate.
- [ ] Break the real verifier and one idempotency guard separately to prove the adverse tests go red, then restore them.
- [ ] Run focused adverse tests and the complete billing webhook suite.

### Task P04: Add signed payment-return fallback and full integration coverage (T011–T012)

**Files:**
- Modify/split if size requires: `apps/api/src/routes/billing.routes.ts`, `apps/api/src/routes/webhooks.routes.ts`
- Create: `apps/api/tests/integration/paymob-checkout-flow.test.ts`
- Create/modify: redirect-route adverse test

**Produces:** a signed browser return route that shares the exact webhook effect application; webhook and redirect racing can apply an effect exactly once.

- [ ] Write failing tests for valid redirect-only completion, invalid redirect no-op, and webhook/redirect race.
- [ ] Extract one internal payment-application function used by both routes; do not let browser return data grant credits without the same signature validation.
- [ ] Run integration and adverse payment suites serially.
- [ ] Keep staging execution blocked until Paymob sandbox credentials are supplied.

## Release 2 — Auth Email and Transactional Delivery

### Task E01: Choose and configure production email (T013, T016, or T014–T015)

**Files:**
- Inspect/modify based on decision: `apps/api/src/services/email/{mailer,resend-mailer,smtp-mailer}.ts`, `.env.example`
- Test: selected-mailer unit tests

**Produces:** exactly one configured production mailer (or documented hybrid) that fails closed when selected but missing required credentials, while local test mode retains a safe console/fake transport.

- [ ] Record the selected transport, sending domain, DNS owner, staging inbox, and secret-store owner.
- [ ] If SMTP is selected, write failing TLS-required and credential-missing tests before adding `smtp-mailer.ts`; add send-attempt persistence only when required by that path.
- [ ] If Resend is selected, validate its construction and configuration path without exposing its API key.
- [ ] Verify all existing registration/reset tests still pass and no mail failure rolls back auth or billing state.

### Task E02: Add payment confirmation notification (T018–T019)

**Files:**
- Modify: `apps/api/src/services/email/mailer.ts`, selected mailer, shared payment effect service
- Test: billing/email duplicate-event tests

**Produces:** `sendPaymentConfirmation()` called once after a successful, idempotently applied payment; delivery failure is observable but never reverses a receipt or credit grant.

- [ ] Resolve whether failed-payment notifications are product scope.
- [ ] Write failing tests for one confirmation on success, none on duplicate event, and no ledger rollback on mail failure.
- [ ] Implement the call in the shared payment effect, not separately in webhook and redirect routes.
- [ ] Run payment and email suites serially.

### Task E03: Execute real email staging gate (T017, T043)

**External dependencies:** selected provider credentials, verified SPF/DKIM/DMARC domain, staging inbox.

- [ ] Send real verification and reset emails to a controlled staging inbox; exercise working, expired, and single-use links.
- [ ] Complete a sandbox payment and confirm exactly one confirmation email arrives.
- [ ] Capture delivery evidence without recording secret values; leave this task blocked until prerequisites exist.

## Release 3 — Monitoring, Cost, and Queue Safety

### Task O01: Select and integrate APM/error tracking (T020–T025)

**Files:**
- Modify: `apps/api/src/index.ts`, `apps/worker/src/index.ts`, deployment configuration
- Create/modify: health/heartbeat integration and focused tests

**Produces:** a selected managed APM initialized independently in API and worker; health/readiness and worker-staleness signals reach a real operator destination.

- [ ] Record the vendor/account owner and alert destination.
- [ ] Add fail-safe initialization that never logs DSNs or secrets and does not hide application startup failure.
- [ ] Verify API/worker health surfaces plus sandbox-runner/probe-pool health strategy.
- [ ] In staging, force a controlled API error and worker stop; confirm both are visible/alerted.

### Task O02: Add cost-runaway controls (T026–T028)

**Files:**
- Create: `apps/api/src/services/monitoring/cost-alerts.ts`
- Modify: Prisma schema/migration, admin routes/services, worker scheduling
- Test: unit/adverse cost-threshold tests

**Produces:** configurable per-user/global AI cost thresholds based on recorded `AiInvocation` data; protective actions never mutate credit balances.

- [ ] Write failing tests for threshold crossing, idempotent alert emission, and a guard that credit lots/transactions remain unchanged.
- [ ] Add additive migration and admin visibility with operator authorization.
- [ ] Trigger a synthetic threshold crossing in staging and confirm a real alert.
- [ ] Run migration status, relevant margin tests, API/worker tests, and operational checks.

### Task O03: Implement queue admission and position (T029–T030)

**Files:**
- Modify: scan intake/queue producer, `apps/api/src/routes/scans.routes.ts`, `apps/web/components/scan/`
- Test: queue backpressure API, worker, and UI tests

**Produces:** bounded queue admission with structured overload responses and a truthful queue position in scan status/UI.

- [ ] Write failing tests for soft/hard capacity, priority behavior, and queue-position response shape.
- [ ] Implement limits at the producer boundary; preserve existing authorization, credits, and refund behavior.
- [ ] Add UI rendering through `apps/web/lib/api.ts` only and test loading/error states.
- [ ] Manually burst local requests and observe refusal/position behavior without disrupting another worker.

## Release 4 — Retention, Capacity, and Infrastructure Decisions

### Task I01: Data retention and archival (T031–T032)

**Files:**
- Modify: schema/migrations, storage/retention service, worker schedule, operator documentation
- Test: archival and immutable-financial-record adverse tests

**Produces:** a legally approved, dry-run-capable archive/detach process that never removes ledger, billing-event, receipt, or audit history.

- [ ] Obtain the retention/legal decision before destructive behavior is designed.
- [ ] Write tests proving only eligible records are selected and protected financial/audit tables are excluded.
- [ ] Add additive migration/scheduling with dry-run verification first.
- [ ] Run manual local dry run and record exact affected record classes.

### Task I02: Capacity decisions and conditional scaling (T004, T033–T039)

**Files:**
- Modify only after thresholds are approved: infrastructure/deploy configuration and relevant process entrypoints

**Produces:** evidence-based connection pooling, probe-pool/sandbox replicas, Redis strategy, and autoscaling rather than speculative infrastructure.

- [ ] Obtain expected concurrency and deployment topology.
- [ ] Select/validate pooler only if the connection projection exceeds current safe limits.
- [ ] Prove probe-pool and sandbox health/deployment boundaries before adding replicas.
- [ ] Document every conditional item as blocked rather than treating it as a source-code task.

### Task I03: Load testing (T040)

**Files:**
- Modify: `load-testing/` scripts and runbook
- Test: controlled multi-source load tiers

**Produces:** measured capacity evidence for 20/40/60 concurrent users and documented bottlenecks.

- [ ] Extend the rig without live AI-provider spend; use fixtures/staging-safe dependencies.
- [ ] Run each tier separately, capture error rate/latency/queue depth, and compare to defined acceptance bounds.
- [ ] Feed the measured projection back into I02; do not infer capacity from a passing unit suite.

## Release 5 — Launch Evidence

### Task L01: Complete adversarial matrix and staging gates (T041–T044)

**Files:**
- Modify: `specs/005-production-hardening/quickstart.md`, `tasks.md`, `PROGRESS.md` with evidence only

**Produces:** a release decision based on real payment, email, monitoring, queue, and security evidence.

- [ ] Execute every payment/email/security matrix case against real production code paths.
- [ ] Run sandbox Paymob checkout, real email staging, APM alert, and queue-capacity manual checks.
- [ ] Run required whole-repo type/lint/format and serialized test projects; distinguish existing failures from regressions.
- [ ] Do not deploy until each launch gate has an owner, dated evidence, and explicit pass decision.

### Task L02: Post-launch smoke verification (T045)

**External dependencies:** production deployment, production provider credentials, real controlled payment/email recipient, monitoring access.

- [ ] Complete one real payment, receipt/credit reconciliation, verification/reset email, and monitoring event in production.
- [ ] Confirm rollback/on-call ownership and record the result without exposing credentials or customer data.
- [ ] Mark production-ready only after this evidence exists.

## Plan self-review

- [x] Authentication route protection, CORS origin configuration, and real auth-email delivery are covered by A01–A02 and E01–E03.
- [x] All production-hardening task ranges T001–T045 are represented by A03–A04, P01–P04, E01–E03, O01–O03, I01–I03, and L01–L02.
- [x] External credentials and operational decisions are explicit launch gates rather than fabricated implementation work.
- [x] The plan introduces no second financial ledger, provider route, queueing system, or monitoring framework.
