# Feature Specification: Production Hardening — Payments, Email, and Operational Readiness

**Feature Branch**: `005-production-hardening`

**Created**: 2026-09-12

**Status**: Draft — planning artifact only. No implementation has occurred under this feature.

**Input**: A full production-readiness planning pass covering real Paymob payment processing,
production email (registration/OTP/password-reset/payment notifications), AI cost-runaway
protection, monitoring/observability, queue backpressure, data archival, and the remaining
infrastructure-scaling items already tracked as open in `docs/reviews/
PRODUCTION-READINESS-MASTER-PLAN.md` (T267, T292-T306). Informed by a reference audit of a
separate, working payment/email implementation (`EduFlow-LMS`) — see `research.md` for that
audit's findings and how they were or were not adapted.

**Governing scope rule, carried over from every planning session in this repository:** this
document specifies what must exist. It does not implement anything. Every requirement below is
paired with a task in `tasks.md` before it is built.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A customer buys credits with a real card (Priority: P1)

A signed-in user with insufficient credits for the audit they want clicks "Buy credits," is
redirected to a real Paymob checkout page, pays with a card, and is redirected back to the
product having received the credits they paid for — once, correctly, and with a receipt.

**Why this priority**: this is the one capability that currently does not exist for real money at
all (T267, `BLOCKED`). Every other production-readiness gap is a hardening or scaling concern on
top of a product that already works; this one is a product that cannot yet take a real payment.

**Independent Test**: with real (or sandbox) Paymob merchant credentials configured, a tester can
complete one real checkout end-to-end and observe (a) exactly one credit lot granted, (b) exactly
one receipt created, (c) the credit balance increased by the purchased amount, and (d) a
confirmation email received.

**Acceptance Scenarios**:

1. **Given** a signed-in user with a valid session, **When** they initiate a credit purchase for
   an amount priced entirely server-side, **Then** a `PendingPayment` row is created and they are
   redirected to a real Paymob-hosted checkout page carrying that exact amount.
2. **Given** a pending credit purchase, **When** Paymob sends a verified `payment.succeeded`
   webhook for it, **Then** exactly one credit lot is granted, exactly one receipt is created, the
   `PendingPayment` is marked completed, and a payment-confirmation email is sent.
3. **Given** the same webhook delivered a second time (provider retry), **When** it is processed,
   **Then** nothing is granted or emailed a second time, and the response is still a success so the
   provider stops retrying.
4. **Given** a pending credit purchase, **When** the user abandons checkout or Paymob reports
   failure/cancellation, **Then** no credits are granted, the `PendingPayment` reflects the real
   outcome, and no confirmation email is sent.

---

### User Story 2 — A user completes the full auth-email lifecycle in production (Priority: P1)

A new user registers, receives a real verification email at a real inbox, verifies their address,
later requests a password reset, receives a real reset email, and resets their password — all
through the product's own configured mail sender, not a console log.

**Why this priority**: registration verification and password reset are already fully coded
(`EmailToken`, `reset.service.ts`, `registration.service.ts`) but the production mail transport is
not yet operationally live (no real API key/SMTP credentials configured, no verified sending
domain, `docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md` Phase 5's rollout checklist is
unchecked). Nothing in this codebase's own logic is blocking this story; the blocker is
operational configuration, which this spec turns into concrete, closeable tasks.

**Independent Test**: with a real mail transport configured and a verified sending domain, send
one real message of each type to a real mailbox and confirm delivery, correct branding, and a
working link.

**Acceptance Scenarios**:

1. **Given** a new registration, **When** the account is created, **Then** a real verification
   email is delivered to the user's real inbox with a working, single-use, time-limited link.
2. **Given** a password-reset request for a registered email, **When** the request is submitted,
   **Then** a real reset email is delivered, and requesting again invalidates the first link
   (already implemented behavior — this story only requires it to run over a real transport).
3. **Given** a password-reset request for an email that is not registered, **When** the request is
   submitted, **Then** the response is identical to the registered case (already implemented
   enumeration protection) and no email is sent.

---

### User Story 3 — An operator is paged before a customer notices something is wrong (Priority: P2)

An operator running the product in production receives an automated alert when the API's error
rate spikes, a payment webhook starts failing, the AI spend rate on a single account or globally
exceeds a defined threshold, or a queue backs up — instead of finding out from a support ticket.

**Why this priority**: none of this exists today (confirmed: no APM/error-tracking package is
installed anywhere in the monorepo, and `AiInvocation`'s rich per-call data has no automated
consumer). This is the single highest-leverage gap for operating safely at any real scale, and it
is independent of the payment work above — it can be built in parallel.

**Independent Test**: force a synthetic error-rate spike, a synthetic AI-cost spike on one test
account, and a synthetic queue backlog in a staging environment, and confirm each produces a real
alert within a defined time bound.

**Acceptance Scenarios**:

1. **Given** the API's 5xx rate exceeds a configured threshold over a rolling window, **When** the
   threshold is crossed, **Then** an alert fires to a defined destination within a bounded time.
2. **Given** a single user's AI spend within a rolling window exceeds a configured budget, **When**
   the threshold is crossed, **Then** the account is flagged (and, per the design decided in
   `research.md`/`plan.md`, potentially throttled) and an operator is notified — the credit ledger
   remains the sole source of truth for what the user was actually charged.
3. **Given** the `scanPhase` queue's depth exceeds a configured bound, **When** a new scan is
   requested, **Then** the user sees an honest "queued, position N" state rather than an
   indefinite, unexplained "Preparing."

---

### User Story 4 — A payment cannot be silently duplicated or forged (Priority: P1, cross-cutting security story)

An attacker who can observe or replay a webhook payload, or who controls the client making a
checkout request, cannot cause credits to be granted without a real, verified payment having
occurred, cannot cause the same real payment to be granted twice, and cannot alter the amount,
product, or recipient of a payment after the fact.

**Why this priority**: this is not a separate feature so much as a correctness property every
other payment story depends on; it is called out as its own story because it has its own
independent test and its own dedicated adversarial test suite (see the Payment E2E/security test
matrix in `quickstart.md`).

**Independent Test**: a security-focused adverse test suite attempts each attack in the list below
against a running instance (or an integration-test harness standing in for one) and asserts each
attempt is refused or has no effect.

**Acceptance Scenarios**:

1. **Given** a webhook payload with an invalid or missing signature, **When** it is delivered,
   **Then** it is rejected (401) and no data is written.
2. **Given** a validly-signed webhook whose claimed amount/user/product does not match the
   `PendingPayment` it references, **When** it is processed, **Then** it is rejected and nothing is
   granted (already implemented — `eventMatchesPending` in `webhooks.routes.ts` — this scenario
   exists to keep it that way under new provider code).
3. **Given** a validly-signed webhook for an event id already fully applied, **When** it is
   delivered again, **Then** it is acknowledged with no second effect (already implemented via
   `BillingEvent`'s unique id + `appliedAt` gate and `CreditTransaction.billingEventId`'s unique
   constraint — this scenario exists to keep it that way).
4. **Given** a client request that supplies its own amount/price for a checkout, **When** it is
   processed, **Then** the client-supplied amount is never used for anything financial — price is
   always looked up server-side from the product/plan/credit-count the client selected (already
   implemented in `checkout.service.ts` — this scenario exists to keep it that way for the real
   Paymob provider).

---

### Edge Cases

- What happens when Paymob is unreachable at checkout-initiation time? (Must not create a
  `PendingPayment` with no real checkout behind it, and must surface a clear, retryable error to
  the user — never a silent "success.")
- What happens when a webhook arrives for a `PendingPayment` that does not exist locally (e.g., a
  stale/foreign event, or a `PendingPayment` row lost to an aborted transaction)? (Must not throw
  in a way that returns 200 — a permanently-lost event must not look "handled"; but must also not
  create a phantom grant.)
- What happens when the webhook's effect (grant + receipt) partially fails after the `BillingEvent`
  row is inserted but before `appliedAt` is set? (Already correctly handled by the existing
  received-but-not-applied retry design — this spec must not regress it.)
- What happens when a user closes the checkout tab after paying but before being redirected back?
  (The webhook, not the redirect, must be what grants credits — the redirect is UX only.)
- What happens when the real mail transport is down or rate-limited at the moment a
  verification/reset/payment email needs to send? (Must not block or fail the underlying
  operation — registration/checkout must succeed even if the confirmation email temporarily
  fails — and the failure must be observable, not silent.)
- What happens when a single account's AI spend spikes because of a legitimately large audit
  target (many pages, many findings) rather than abuse? (Cost-protection thresholds must
  distinguish "unusually expensive but legitimate" from "runaway/abusive" — see the design
  decision required in `plan.md`; a false-positive throttle on a paying customer's real audit is
  itself a production incident.)
- What happens when the `scanPhase` queue is at its configured backpressure limit and a Business
  or Pro-tier user (who already pays for priority) tries to start a scan? (Priority ordering,
  already implemented via `PRIORITY`, must still be honored inside whatever backpressure/rejection
  policy is added — a paying tier must not queue behind free-tier backlog even under
  backpressure.)
- What happens when an archival/retention job runs against a table that a concurrent transaction
  (a debit, a refund, a webhook application) is actively writing to? (Must never archive or delete
  a financial/audit record that is still reachable from an active reconciliation path; see the
  explicit "never delete financial/audit records to reduce size" constraint below.)

---

## Requirements *(mandatory)*

### Functional Requirements — Payments (Paymob)

- **FR-P01**: The system MUST implement a real `PaymentProvider` for Paymob satisfying the
  existing `PaymentProvider` interface (`apps/api/src/services/billing/payment-provider.ts`)
  without requiring any change to `checkout.service.ts`, `webhooks.routes.ts`, or any credit/billing
  code that already depends on that interface.
- **FR-P02**: The Paymob provider MUST authenticate to Paymob using credentials read only from
  environment configuration, MUST fail loudly at construction (not at first call) if required
  credentials are absent, matching this repository's existing fail-closed configuration
  convention (`apps/api/src/config/env.ts`, `packages/ai-executor/src/pricing.ts`).
- **FR-P03**: The system MUST NEVER trust a client-supplied amount, price, product identifier, or
  "payment succeeded" claim for anything that grants credits, activates a subscription, or creates
  a receipt. The amount charged MUST always be computed server-side from the selected plan/credit
  quantity via the existing `BillingPriceCatalog` (`checkout-pricing.ts`), exactly as today.
- **FR-P04**: The system MUST verify every webhook's authenticity via Paymob's real HMAC
  mechanism before processing any event, and MUST reject (with no data written) any event that
  fails verification — this already exists structurally (`PaymentProvider.verifyWebhook`) and
  MUST be satisfied for real by the Paymob implementation, not merely for the stub.
- **FR-P05**: The system MUST process each distinct webhook event's effect (grant/receipt) at
  most once, regardless of how many times the provider delivers it, using the existing
  `BillingEvent` idempotency mechanism (unique event id + `appliedAt` gate) and the existing
  `CreditTransaction.billingEventId` uniqueness constraint — both already implemented and MUST
  NOT be re-implemented or bypassed by the Paymob-specific code path.
- **FR-P06**: The system MUST cross-validate every applied webhook event against its
  `PendingPayment` row (user, amount, product/plan/credit-count) before applying its effect,
  exactly as `eventMatchesPending` already does for the generic path — a Paymob event that does
  not match its pending payment MUST be rejected, not applied.
- **FR-P07**: The system MUST record every payment attempt's terminal outcome (succeeded, failed,
  cancelled, expired) on its `PendingPayment` row, so a customer-support or reconciliation query
  never needs to ask Paymob what happened to a specific local payment.
- **FR-P08**: The system MUST support Paymob-initiated refunds through the existing
  `PaymentProvider.refund` seam, only for payments this system already recorded as completed, and
  MUST NOT allow a refund to grant negative credits below zero (existing credit-ledger invariant,
  unaffected by this feature).
- **FR-P09**: The system MUST expose, to an operator, the real state of any specific payment
  (pending/succeeded/failed/refunded) and its associated `BillingEvent`/`Receipt` rows, for support
  and reconciliation — via the existing admin surface pattern (`apps/api/src/routes/admin/`), not
  a new one-off tool.
- **FR-P10**: A checkout MUST NOT be initiated for an amount of zero, a negative amount, or an
  unpriced/inactive plan — already enforced (`PlanNotSubscribableError`, `InvalidPurchaseAmountError`)
  and MUST continue to be enforced identically for the real provider.

### Functional Requirements — Production Email

- **FR-E01**: The system MUST send every transactional email (verification, password reset,
  payment confirmation, payment failure where applicable, readiness-achieved, renewal-warning,
  retention-warning) through a single, real, production-configured mail transport rather than the
  development console mailer, with the decision of *which* transport (the already-built Resend
  HTTP-API mailer vs. a new SMTP-based mailer using the operator's Hostinger mailbox) made
  explicitly in `research.md`/`plan.md` and not silently defaulted.
- **FR-E02**: The chosen mail transport MUST be configured behind the existing `Mailer` interface
  (`apps/api/src/services/email/mailer.ts`) with zero changes required to any calling code
  (registration, reset, billing webhook, readiness, renewal, retention) — matching this
  repository's existing seam pattern exactly.
- **FR-E03**: A transactional email send failure MUST NOT fail the underlying operation it is
  attached to (registration must succeed even if the verification email temporarily fails to
  send) and MUST be observable (logged/alerted), not silent.
- **FR-E04**: The sending domain MUST be verified with the mail transport (SPF/DKIM/DMARC as
  applicable to the chosen transport) before any production email is sent, and this MUST be a
  gated, checked step in the rollout plan, not an assumption.
- **FR-E05**: The system MUST NOT introduce a queueing/retry layer for email beyond what the
  chosen transport already provides unless the discovery phase (`research.md`) demonstrates a real
  need (e.g., a demonstrated rate limit that requires backoff) — do not build unneeded
  infrastructure.
- **FR-E06**: Whether the product requires an OTP (one-time-passcode) flow at all MUST be
  answered explicitly as a product decision in `research.md` before any OTP work is specified as a
  task — this repository currently has no OTP model, flow, or requirement anywhere in its spec
  baseline, and EduFlow's use of OTP MUST NOT be assumed to imply this product needs one.

### Functional Requirements — AI Cost-Runaway Protection

- **FR-C01**: The system MUST be able to compute, from existing `AiInvocation` data, a rolling
  spend figure per user and globally, without requiring any new instrumentation at the AI-executor
  layer (the data already exists — see `docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md`).
- **FR-C02**: The system MUST alert an operator when spend (per-user or global) crosses a
  configured threshold within a configured window.
- **FR-C03**: The credit ledger MUST remain the sole authoritative record of what a user was
  actually charged; any automatic protective action (throttling, pausing new scans for an
  account) triggered by cost-runaway detection MUST NOT itself alter a credit balance — it is an
  operational safeguard, not a billing mechanism.
- **FR-C04**: The system MUST distinguish, to the extent the data allows, a legitimately expensive
  single operation (a large audit target) from a sustained anomalous pattern (many operations in
  a short window) — a single expensive scan must not, by itself, trip a global "runaway" alert.

### Functional Requirements — Monitoring & Observability

- **FR-M01**: The system MUST have a real error-tracking/APM service receiving unhandled
  exceptions and significant error conditions from the API and worker processes.
- **FR-M02**: The system MUST expose a health-check endpoint per deployable process suitable for
  an orchestrator's liveness/readiness probes.
- **FR-M03**: The system MUST alert on, at minimum: API error-rate spikes, authentication-failure
  spikes (possible credential-stuffing), payment-webhook failures, email-send failures,
  queue-processing failures, AI-provider chain exhaustion rate, database connectivity failures,
  Redis connectivity failures, and the cost-runaway condition in FR-C02.
- **FR-M04**: Every alert MUST have a documented destination and a documented runbook reference
  (even a minimal one) — an alert with no defined response is not a complete requirement.
- **FR-M05**: Structured logs (already implemented centrally — `packages/config/src/logger.ts`)
  MUST remain the redacted-by-construction source of truth; the monitoring layer MUST consume
  them (or the errors/metrics derived from them) rather than introduce a second, differently-
  redacted logging path.

### Functional Requirements — Queue Backpressure

- **FR-B01**: The `scanPhase` queue MUST have a configured maximum depth (or maximum wait-time
  proxy) beyond which a new scan request is either honestly queued with a visible position or
  explicitly refused with a clear, actionable message — never silently accepted into an
  effectively-unbounded backlog.
- **FR-B02**: Existing priority ordering (`PRIORITY`/`priorityForPlan`, `packages/config/src/
  queues.ts`) MUST continue to determine a request's position under any backpressure policy — a
  paying tier's priority must not be defeated by a policy that treats the queue as first-in-first-
  out once it is "full."
- **FR-B03**: A user with a queued (not yet running) scan MUST see real position/estimated-wait
  information in the UI, replacing an indefinite "Preparing" state with no information.

### Functional Requirements — Data Archival

- **FR-A01**: The system MUST define a retention/archival policy for `AiInvocation`,
  `CapabilityExecution`, and `CreditTransaction`/`CreditAllocation` — the tables already identified
  as unbounded-growth risks (`PRODUCTION-READINESS-MASTER-PLAN.md` T303).
- **FR-A02**: The archival mechanism MUST NOT delete a financial or audit record
  (`CreditTransaction`, `CreditAllocation`, `BillingEvent`, `Receipt`) — these MUST only ever be
  archived (moved to cheaper storage) if at all, never destroyed, for as long as any applicable
  legal/operational retention requirement exists; if no such requirement is confirmed, they MUST
  default to indefinite retention rather than being deleted "to be safe."
- **FR-A03**: `AiInvocation`/`CapabilityExecution` rows (operational telemetry, not financial
  records) MAY be archived or deleted after a defined retention window, provided doing so does not
  break `docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md`'s cost-drift detection or
  `apps/api/src/services/admin/margin.service.ts`'s reporting for any window still within
  retention.

### Functional Requirements — Infrastructure Scaling (evidence-gated, not launch-default)

- **FR-S01**: For each of connection pooling, a read replica, an isolated cache layer, and
  signed-URL/CDN delivery (`PRODUCTION-READINESS-MASTER-PLAN.md` T295-T298), the plan MUST state,
  with evidence, whether it is required before the first real customer or is a scale-stage
  improvement that can follow — none of these MUST be assumed mandatory for launch by default.
- **FR-S02**: `probe-pool` and `sandbox-runner` MUST have a documented, evidence-based
  determination of whether their current single-instance deployment is acceptable for initial
  production traffic, or whether multi-instance support is a launch requirement — derived from
  actual expected concurrency, not assumed.
- **FR-S03**: Load testing MUST be extended beyond what a single machine can generate before any
  claim of "verified for N concurrent users" is made for a number the existing single-source rig
  has not actually produced (`PRODUCTION-READINESS-MASTER-PLAN.md` T306's own honest admission).

### Key Entities *(include if feature involves data)*

- **PendingPayment** *(exists today)*: a checkout that has been initiated but not yet confirmed.
  Identifies the user, the kind (subscription/credits), the provider's own reference, the
  server-computed amount, and a status. The real Paymob provider MUST populate this exactly as the
  stub provider does today.
- **BillingEvent** *(exists today)*: the provider's own event id as primary key, used as the sole
  idempotency gate for applying a webhook's effect exactly once.
- **Receipt** *(exists today)*: one per applied `BillingEvent`, a self-contained HTML artifact.
- **CreditLot / CreditTransaction / CreditAllocation** *(exist today, out of scope to redesign)*:
  the ledger a successful payment ultimately grants into, via the existing `grantLot`/
  `DuplicateBillingEventGrantError` idempotency mechanism.
- **CostAlert / SpendThreshold** *(new, see `data-model.md`)*: the configuration and/or derived-
  state needed for AI cost-runaway detection, if the design in `plan.md` concludes a persisted
  entity (versus a purely computed, unpersisted alert) is the right shape.
- **QueuePolicy state** *(new or extended, see `data-model.md`)*: whatever minimal state
  backpressure/queue-position reporting requires — to be sized to what BullMQ's own queue
  introspection can already answer before assuming a new table is needed.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-P01**: A real payment (sandbox or production Paymob credentials) can be completed
  end-to-end, exactly once, with the correct credit grant, in under the time a normal Paymob
  checkout takes (no added latency from this system's own processing).
- **SC-P02**: Every payment-security adversarial test in `quickstart.md`'s test matrix passes
  before this feature is considered launch-ready.
- **SC-E01**: A real verification, reset, and payment-confirmation email each arrive at a real
  inbox, correctly branded, with a working link, within a reasonable delivery window (provider-
  dependent, but not silently failing).
- **SC-M01**: A synthetic error-rate spike, cost-runaway condition, and queue backlog each produce
  a real alert within a defined time bound in a staging environment, before this feature is
  considered launch-ready.
- **SC-G01**: Every item in the Phase 17 gap matrix (see `plan.md`) is resolved to either DONE,
  explicitly deferred as scale-stage (with reasoning), or explicitly blocked on a named external
  dependency (with what is needed to unblock it) — none MUST remain silently unresolved.

## Assumptions

- Paymob is the confirmed payment processor for this market (Egypt-facing, matching
  `PAYMOB-BLOCKED` framing already present in the existing master plan) — this spec does not
  reopen that choice.
- Real Paymob merchant credentials and a signed contract remain an external dependency this
  planning pass cannot resolve; every payment task that needs them is explicitly marked blocked,
  not silently assumed available.
- The Hostinger SMTP mailbox given for this planning pass (`ai-audit@youesf-abdallah.online` via
  `smtp.hostinger.com:465`) is a real, already-provisioned resource whose actual credential value
  is never read, printed, or stored by this planning session — only its existence and shape
  (host/port/TLS/mailbox) inform the design.
- EduFlow-LMS is used strictly as a reference architecture for proven patterns (webhook
  idempotency, HMAC verification, state-machine design, token lifecycle design) — its
  course/enrollment-specific domain logic is explicitly out of scope to port.
- No new payment provider evaluation (Stripe, PayPal, etc.) is in scope; Paymob is the target.
- This spec does not redesign the existing credit ledger, AI executor, or capability registry —
  each is treated as a stable foundation this feature builds on top of, per the existing audits
  already on file confirming their maturity.
