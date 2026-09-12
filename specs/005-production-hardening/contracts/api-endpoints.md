# API Specification — Production Hardening

Endpoints already implemented are documented as-is (no change required unless stated). New
endpoints are marked **NEW**. Nothing in this file is implemented by this planning pass.

---

## Payments

### `POST /billing/subscribe` — EXISTS, no route-shape change

- **Auth**: required (session).
- **Request**: `{ planId: string }`.
- **Response today**: `{ checkoutUrl: string }` once a `PaymentProvider` is configured (T264,
  already implemented) — returns a real checkout URL, never an immediate grant.
- **Change required for Paymob**: none at the route level. `initiateSubscriptionCheckout` already
  calls `paymentProvider.initCheckout(...)` through the seam; swapping the stub for the real
  Paymob provider (a config/wiring change, task-level, see `tasks.md`) requires zero changes here.

### `POST /billing/credits/purchase` — EXISTS, no route-shape change

- Same shape and same "no route change" conclusion as above, backed by
  `initiateCreditPurchaseCheckout`.

### `POST /billing/change-plan` — EXISTS, currently production-gated (T261)

- Out of scope for this feature beyond noting (per the existing master plan) that it needs
  revisiting once a real payment-delta rule exists — not part of this feature's payment work,
  flagged only so it is not silently forgotten.

### `POST /webhooks/billing` — EXISTS, provider-agnostic path already implemented

- **Auth**: HMAC signature in a configurable header (`x-webhook-signature` default), verified
  against the raw body — either via the injected `PaymentProvider.verifyWebhook` (the path this
  feature's Paymob provider MUST satisfy) or the legacy shared-secret path (kept for the generic/
  dev fallback, unaffected by this feature).
- **Idempotency**: `BillingEvent.id` (provider event id) unique + `appliedAt` gate — already
  correct, MUST NOT be changed.
- **Response codes**: `401` invalid signature (nothing written); `400` unparseable payload (legacy
  path only); `200` accepted (whether newly applied or a genuine duplicate); `500` signature valid
  but effect failed to apply (so the provider retries — MUST remain a real retry signal, not
  silently swallowed).
- **Change required for Paymob**: none to this route. The Paymob `PaymentProvider.verifyWebhook`
  implementation is where all Paymob-specific parsing/HMAC/event-mapping logic lives, matching
  `stub-payment-provider.ts`'s own shape exactly.

### `GET /admin/payments/:pendingPaymentId` — **NEW**

- **Auth**: operator/admin only (existing admin-authorization middleware pattern,
  `apps/api/src/routes/admin/`).
- **Purpose**: FR-P09 — let an operator look up the real state of one payment for support/
  reconciliation without a database console.
- **Response**: the `PendingPayment` row, its resolved `BillingEvent` (if any), and its `Receipt`
  (if any) — a read-only join, no mutation.
- **Rate limits**: standard admin-route limits, nothing payment-specific.

### `GET /admin/payments?userId=&status=` — **NEW**

- **Auth**: operator/admin only.
- **Purpose**: the list view backing the detail route above — matches the existing admin-list
  pattern (`GET /admin/users`, `GET /admin/scans`) rather than inventing a new list convention.

---

## Email

No new endpoint. Email sending remains entirely internal (triggered by registration/reset/
webhook-effect code calling the `Mailer` interface) — there is deliberately no "send test email"
HTTP endpoint in production; that verification happens via the rollout checklist's manual staging
step (`plan.md`'s rollout phase), not a permanent production surface.

---

## Monitoring

### `GET /health` — EXISTS on `apps/api` only

- Already implemented, deliberately ahead of rate limiters (`app.ts`).
- **Gap**: `apps/worker` has no HTTP server at all (confirmed: no public port, per
  `PROJECT_MAP.md`) and therefore no equivalent endpoint. `apps/sandbox-runner` has an HTTP host
  (`host/server.ts`) but its `/health`-equivalent status was not confirmed in this pass — verify
  at implementation time. `apps/probe-pool` has no runnable server at all yet (confirmed:
  `package.json`'s `dev` script is still a placeholder).
- **FR-M02 requirement**: the worker's liveness MUST be observable some way — options to evaluate
  at implementation time: (a) a minimal internal HTTP listener added solely for a liveness probe
  (smallest change, but adds a port to a process the architecture deliberately kept portless), or
  (b) a liveness signal derived externally from BullMQ (e.g., an external check that the worker's
  queue(s) are being drained, or a periodic heartbeat job the worker enqueues to itself and a
  monitor watches for staleness). **Decision needed at implementation time** — recommend (b),
  since it needs no new listening port on a process this architecture intentionally never exposed
  one on, and a heartbeat-staleness check is a strictly better liveness signal than "the process
  answers HTTP" anyway (a wedged event loop can still answer a trivial HTTP handler).

### `GET /admin/cost-alerts` — **NEW**

- **Auth**: operator/admin only.
- **Purpose**: FR-C02's admin visibility — list recent `CostAlertEvent` rows, matching the
  existing admin-list convention.

### `PATCH /admin/cost-alerts/thresholds` — **NEW**

- **Auth**: operator/admin only.
- **Purpose**: edit `CostAlertThreshold` rows (per-user/global window+threshold), matching the
  existing admin-editable-config convention already used for `ProviderChainEntry`/`Plan`.
- **Validation**: `windowMinutes > 0`, `thresholdMicros > 0` — mirrors this repo's existing
  fail-closed validation style on every admin-editable numeric config.

---

## Queue Backpressure

### `GET /scans/:id` (existing) — response extended, **not** a new route

- **Change**: when a scan's underlying job is queued (not yet running), the existing response gains
  a `queuePosition: number | null` field (null once running/complete) — reusing the existing
  polymorphic scan-status response shape rather than adding a parallel endpoint.
- **Source of the number**: BullMQ queue introspection at request time (`data-model.md` §4), not a
  new persisted field.

### `POST /scans` (existing, via `create-scan.ts`) — response extended on refusal

- **Change**: when the `scanPhase` queue is at its configured backpressure limit, this existing
  route returns a clear, structured refusal (`{ error: { code: 'QUEUE_AT_CAPACITY', ... } }`)
  instead of accepting into an unbounded backlog — matching this repo's existing structured-error
  convention (`InsufficientCreditsError` et al.), not a bare 500.
