# Production Hardening — Execution Design

**Date:** 2026-09-12  
**Status:** Proposed; approved direction awaiting written-design review  
**Scope:** `specs/005-production-hardening/`

## Outcome

WebAudit AI becomes safe to operate as a real full-stack service: payment collection is
idempotent and reconciled, lifecycle email can use a real sender, operational failures are visible,
queues are bounded, and releases are validated with evidence. This does not claim real-world
readiness until the required third-party accounts, secrets, DNS, deployment environment, and
staging/production smoke checks exist.

## Current-state correction

The feature documents describe all production-hardening tasks as unimplemented. Direct source
inspection on 2026-09-12 found that the following Phase 1 changes already exist in the dirty
working tree and pass their focused automated checks:

- `PendingPayment.status` is a `PendingPaymentStatus` enum and terminal transitions are guarded
  by `updateMany(... status: PENDING)`.
- Checkout initiation uses a Redis token lock and maps contention to `409 CHECKOUT_IN_PROGRESS`.
- A BullMQ repeatable payment-expiry sweep moves abandoned pending payments to `EXPIRED`, using
  the same guarded transition to remain safe against a concurrent completion.

These are not marked complete until their migration, broad module checks, and local-stack manual
verification are recorded. They must be reconciled, not reimplemented or overwritten.

## Architecture

```text
Customer checkout
  -> authenticated billing route
  -> server-side price lookup + short Redis checkout lock
  -> PendingPayment(PENDING)
  -> configured PaymentProvider
  -> hosted provider checkout
  -> verified provider webhook and signed return path
  -> one guarded payment application
  -> credits/subscription + receipt + best-effort confirmation email

Operational safety
  -> structured logs and error tracker in API/worker
  -> heartbeat, queue-depth, webhook-failure and AI-cost alerts
  -> bounded admission/backpressure
  -> retention/archival jobs
  -> staging and production smoke gates
```

The API remains the authorization and financial authority. The browser never supplies an amount,
payment success state, entitlement, or credit grant. Payment effects continue through the existing
`BillingEvent` idempotency gate and credit ledger; no parallel ledger or retry mechanism is added.

## Delivery sequence

### 1. Reconcile foundations

Validate the existing T001–T003 work against its definition of done: generated migration status,
API/worker type/lint/format gates, broader billing tests, and the documented manual local-stack
checkout/expiry/webhook checks. T004 remains a business capacity decision; a connection pooler is
not installed until a concurrency projection justifies it.

### 2. Build payment integration behind the existing seam

Implement Paymob HMAC verification, checkout creation, webhook parsing, refund behavior and
environment selection through the existing `PaymentProvider` interface. Automated tests use
synthetic fixtures or mocked requests only. Provider construction fails closed when selected but
its required configuration is missing. A signed browser-return path shares the same guarded effect
application as webhook delivery.

### 3. Introduce payment/email launch gates

Real Paymob end-to-end validation cannot occur without merchant sandbox or production credentials.
Real email validation cannot occur without a chosen transport, credentials, a verified domain/DNS,
and a staging inbox. These are explicit external gates, not gaps code may simulate away.

### 4. Operate safely at launch

Choose one managed APM/error tracker, initialize it independently in API and worker entrypoints,
and configure alerts for worker health, webhook failures, queue capacity, and AI spend. Build only
the minimal data consumers needed for cost thresholds and queue admission; do not introduce a
second queue, monitoring framework, or payment state model.

### 5. Scale from measured demand

Queue backpressure, data archival, connection pooling, probe-pool replicas, sandbox replicas, and
load testing are delivered in the task order only where their stated decision or capacity gate is
satisfied. Existing 10-concurrent fixture evidence is not evidence of real-provider production
capacity.

### 6. Validate release

Run the prescribed adversarial matrix, migration checks, staging payment/email/alert checks, and
post-launch smoke checklist. A production-readiness claim is permitted only after these gates have
evidence, not merely passing local unit tests.

## Non-goals

- No direct provider SDK calls from web routes or audit capabilities.
- No browser-owned money calculations or credit grants.
- No live credentials in source, test output, or documentation.
- No speculative generic router, queueing system, custom observability platform, or new ledger.
- No claim that the product is production-ready before external launch gates are completed.

## Dependencies and decisions

| Item | Owner/input required | Effect if unresolved |
| --- | --- | --- |
| Paymob merchant/sandbox account and secrets | Business/operator | Payment code can be unit-tested but not exercised end-to-end. |
| Email transport decision and credentials/DNS | Business/operator | Existing console/dev mail remains non-production only. |
| APM vendor/account | Operator | Alert implementation cannot be verified in a real dashboard. |
| Capacity/concurrency projection | Business/operator | Pooler and replica work remain conditional. |
| Retention/legal requirements | Product/legal owner | Destructive archival behavior remains blocked. |

## Verification standard

Every task follows `ENGINEERING-STANDARDS.md`: real Prisma migrations, serialized test DB suites,
fixture-only AI tests, targeted plus broader tests, type/lint/format gates, and named manual steps.
Security tests must call the real production verifier and be proven to fail when the protected
property is deliberately broken.

