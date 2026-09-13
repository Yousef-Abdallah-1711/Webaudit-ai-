# Phase 7 Monitoring and Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver redaction-safe error monitoring, worker liveness, actionable alert configuration, dashboards, and verified health signals for the deployable services.

**Architecture:** Initialize Sentry before either Node process loads application code, with a single shared sanitizer that removes secrets and request bodies before events leave the process. The worker writes a short-lived Redis heartbeat; an API health dependency check exposes its freshness to the deployment monitor without adding a public worker port. Third-party monitors, alert routing, and dashboards are configuration-backed and cannot be asserted complete without real Sentry organization access and observed events.

**Tech Stack:** Node 22 ESM, TypeScript, Express 5, BullMQ, ioredis, `@sentry/node`, Vitest, Sentry monitors/alerts/dashboards.

**Spec:** `specs/005-production-hardening/spec.md`; `specs/005-production-hardening/tasks.md` T020-T025.

## Global Constraints

- Load Sentry with Node's `--import` preloader so instrumentation precedes app imports.
- `SENTRY_DSN` is optional in local/test environments and required in production; no DSN is logged.
- Event, breadcrumb, user, URL, request body, header, and extra data sanitization must use the repository's existing `redactText` behavior and must not send authorization/cookie headers or request bodies.
- The worker remains portless; heartbeat state is ephemeral Redis data with a TTL and no credentials.
- No alert condition may mutate the credit ledger.
- Tests run with `AI_MODE=fixtures` and must never call Sentry or another external service.

---

### Task 1: T020 — API Sentry initialization and redaction

**Files:**
- Create: `packages/config/src/monitoring.ts`
- Create: `apps/api/src/instrumentation.ts`
- Modify: `apps/api/package.json`
- Modify: `.env.example`
- Test: `packages/config/tests/monitoring.test.ts`

**Interfaces:**
- Produces `initMonitoring({ service, environment, dsn? })` and `sanitizeMonitoringEvent(event)`.
- `apps/api/src/instrumentation.ts` calls `initMonitoring` before `apps/api/src/index.ts` loads.

- [ ] Write a unit test that passes an event containing a bearer token, cookie, password field, and query secret to `sanitizeMonitoringEvent`, expecting no original secret in its serialised result.
- [ ] Run the unit test and confirm it fails because the monitoring module does not exist.
- [ ] Implement the sanitizer with the existing redaction package, strip request bodies and sensitive headers, and initialize Sentry only when a DSN is configured.
- [ ] Add the Sentry dependency and API `--import ./src/instrumentation.ts` start/dev preload; add documented `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, and release-name environment keys without values.
- [ ] Run the unit test again and confirm it passes; run API package typecheck, lint, and format checks.
- [ ] In a real Sentry project, add then remove a temporary throwing route, invoke it, and record the observed API event ID and timestamp.

### Task 2: T021 — Worker Sentry initialization

**Files:**
- Create: `apps/worker/src/instrumentation.ts`
- Modify: `apps/worker/package.json`
- Test: `packages/config/tests/monitoring.test.ts`

**Interfaces:**
- Consumes the shared `initMonitoring` interface from Task 1.
- Produces worker process event capture using service tag `@webaudit/worker`.

- [ ] Add a failing test that checks an initialized event receives the worker service tag and does not retain secrets.
- [ ] Run it and confirm failure before worker preload wiring exists.
- [ ] Add the worker ESM preload and initialize the shared module with the worker service identity.
- [ ] Run the test, worker typecheck, lint, and format checks until green.
- [ ] Deliberately throw from a local worker-only test path, remove it after use, and record the separate worker event observed in the configured Sentry project.

### Task 3: T022 — Redis worker heartbeat and staleness signal

**Files:**
- Create: `apps/worker/src/monitoring/heartbeat.ts`
- Modify: `apps/worker/src/index.ts`
- Modify: `apps/api/src/app.ts`
- Test: `apps/worker/tests/unit/heartbeat.test.ts`
- Test: `apps/api/tests/unit/health.test.ts`

**Interfaces:**
- Produces `startWorkerHeartbeat(redis, { key, intervalMs, ttlMs }): { stop(): Promise<void> }`.
- API health includes only `{ worker: 'ok' | 'stale' }`, derived from the Redis key; it never returns the heartbeat value.

- [ ] Write a failing unit test for heartbeat refresh, TTL expiry, idempotent stop, and an API health test for the stale condition.
- [ ] Run the tests and confirm they fail for missing heartbeat behavior.
- [ ] Implement a dedicated Redis connection and an unref'd interval that uses `SET key timestamp PX ttl`; stop clears the interval and closes only its owned connection.
- [ ] Wire startup and shutdown in the worker entrypoint; add an API health dependency check that fails closed only for the health response, never crash-loops the API.
- [ ] Run the focused tests, then worker/API package suites, typecheck, lint, and format checks.
- [ ] With local Redis and worker running, stop the worker and observe the configured monitor alert after the TTL; record the elapsed time and restore the worker.

### Task 4: T023 — Alert rules and response runbooks

**Files:**
- Create: `infrastructure/monitoring/sentry-alerts.md`
- Create: `docs/runbooks/monitoring-alert-response.md`
- Test: `apps/api/tests/unit/monitoring-alert-contract.test.ts`

**Interfaces:**
- Documents exactly one monitor/rule and destination for API 5xx, authentication failures, payment webhooks, email sends, queue failures, AI-chain exhaustion, Postgres, Redis, worker heartbeat, and cost alerts.
- No credentials, webhook URLs, or destination identifiers are committed.

- [ ] Write a failing contract test asserting each FR-M03 condition has a named event/metric key and runbook anchor.
- [ ] Run it and confirm failure before the configuration inventory exists.
- [ ] Create the alert inventory and response runbook; configure the matching rules and destination inside Sentry using the inventory as the source of truth.
- [ ] Run the contract test and documentation link check.
- [ ] Force one synthetic, non-production alert condition and record the delivered alert timestamp and response destination.

### Task 5: T024 — Eight monitoring dashboards

**Files:**
- Create: `infrastructure/monitoring/sentry-dashboards.md`

**Interfaces:**
- Defines dashboard names and panels for API reliability, worker reliability, authentication abuse, payments, email, queues, AI-provider/cost, and infrastructure dependencies.

- [ ] Create the dashboard manifest with each panel's event/metric source, time range, owner, and linked runbook.
- [ ] Create the eight matching dashboards in Sentry.
- [ ] Open every dashboard with real non-production telemetry and record the viewing date, project, and populated panels in the manifest.

### Task 6: T025 — Sandbox-runner and probe-pool health evidence

**Files:**
- Test: `apps/sandbox-runner/tests/host/server.test.ts`
- Modify: `specs/005-production-hardening/tasks.md`

**Interfaces:**
- Confirms `GET /health` on sandbox-runner returns `200 { status: 'ok' }`.
- Records probe-pool as deferred: it has no deployable entrypoint and must be resolved by the separately gated Phase 11 transport work.

- [ ] Add a failing integration test for the sandbox-runner health endpoint if equivalent coverage is absent.
- [ ] Run it and confirm it fails for the intended missing behavior; otherwise document the existing passing equivalent instead of duplicating it.
- [ ] Implement only missing sandbox-runner health behavior, preserving the no-auth lightweight probe contract.
- [ ] Run the sandbox-runner test suite, typecheck, lint, and format checks.
- [ ] Curl a locally running sandbox-runner and record its actual response; update T025 only with that evidence and the explicit Phase 11 deferral for probe-pool.

## Required Completion Evidence

- [ ] Focused unit/adverse tests pass and each new security/redaction test was proven red before implementation.
- [ ] `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` pass with fresh output.
- [ ] API and worker events appear in the real Sentry project.
- [ ] Worker staleness and at least one FR-M03 alert are received at a real configured destination.
- [ ] All eight dashboards show real data.
- [ ] Tasks T020-T025 are marked `[X]` only when their matching evidence is present; external-account blockers remain unchecked and documented.
