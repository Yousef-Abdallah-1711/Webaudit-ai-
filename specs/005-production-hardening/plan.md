# Implementation Plan: Production Hardening — Payments, Email, and Operational Readiness

**Branch**: `005-production-hardening` | **Date**: 2026-09-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-production-hardening/spec.md`, informed by
`research.md` (current-project verification + EduFlow-LMS reference audit).

**This document is a plan. Nothing under this feature has been implemented.** Every architectural
decision below is paired with tasks in `tasks.md`.

## Summary

Real Paymob payment processing (T267), production email rollout (T292-294 code is done; the
rollout is not), AI cost-runaway detection (T300), monitoring/observability (T299), queue
backpressure (T302), data archival (T303), and the remaining infrastructure-scaling items
(T295-298, T304-306) — the full set of items the existing
`docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md` still carries as open, brought to a complete,
implementation-ready design. The payment design is directly informed by a full architectural
audit of a working reference implementation (EduFlow-LMS), adapted (never copied) to this
product's credit-ledger billing model.

## Technical Context

**Language/Version**: TypeScript, Node.js ≥22 (unchanged — this feature adds no new runtime).

**Primary Dependencies**: existing stack unchanged (Express, Prisma/Postgres, BullMQ/Redis,
Next.js). New, additive dependencies proposed: a Paymob HTTP client (thin, hand-written against
the documented REST API — matching this repo's existing "no heavy SDK for a simple REST API"
convention seen in `resend-mailer.ts`'s own hand-written `fetch` client); `nodemailer` **only if**
Decision C.1 (research.md) selects the SMTP path; one APM/error-tracking SDK (see §"Monitoring
architecture" below for the specific candidate and why); no new queueing library (BullMQ already
present covers every new queueing need here).

**Storage**: PostgreSQL (unchanged), two small new tables (`CostAlertThreshold`,
`CostAlertEvent` — see `data-model.md`), one enum promotion (`PendingPayment.status`), optional
`EmailSendAttempt` only if the SMTP path is chosen.

**Testing**: this repository's existing Vitest unit/contract/integration/adverse convention,
extended with a payment-security-focused adverse suite (per `quickstart.md`'s matrix) and a
staging-only production-smoke checklist — no new test framework introduced.

**Target Platform**: unchanged (existing five-deployable-unit architecture: `apps/api`,
`apps/worker`, `apps/web`, `apps/probe-pool`, `apps/sandbox-runner`).

**Performance Goals**: no new hard target beyond what already exists; the backpressure work
(FR-B01) exists specifically because no target currently protects the `scanPhase` queue at all.

**Constraints**: money remains integer micros throughout (unchanged, non-negotiable per
`CLAUDE.md`); no new capability may bypass the existing credit ledger, AI executor, or capability
registry (per the constitution and this repo's own explicit instruction for this planning pass).

**Scale/Scope**: unchanged product scale; this feature does not itself change expected user
counts, it prepares the system to safely accept real payment at whatever scale the business
achieves.

## Constitution Check

*Read against `.specify/memory/constitution.md`'s seven principles.*

- **I. Skills Are Plugins** — not implicated; this feature touches no capability/audit-skill code.
- **II. Vendored Forever** — not implicated.
- **III. Deterministic Before Probabilistic** — not implicated (no AI-layer change).
- **IV. No Single Point of AI Failure** — not implicated (no AI-executor change); the *pattern* of
  "everything financially or externally risky goes through one seam" is explicitly extended by
  analogy to payments (`PaymentProvider`, already the seam) and is a **pass**, not a violation.
- **V. Untrusted Code Runs Isolated** — not implicated.
- **VI. Every Operation Carries a Metered, Reconciled Cost** — **directly extended, not violated**:
  this feature's cost-runaway work (FR-C01-C04) is a new *consumer* of the metering this principle
  already mandates exists (`AiInvocation`); it adds no new spend path and reconciles nothing
  differently than today.
- **VII. Verify Narrowly, Rescan Rarely** — not implicated.

**Gate result: PASS.** No constitutional amendment is required. The one place this plan
introduces genuinely new financial-state machinery (`PendingPayment.status` enum promotion,
`CostAlertThreshold`/`CostAlertEvent`) is additive and auditable, consistent with the
constitution's existing security/auditability requirements rather than in tension with them.

## Project Structure

### Documentation (this feature)

```text
specs/005-production-hardening/
├── spec.md              # Product specification
├── research.md          # Phase 0 (current-state) + Phase 1-2 (EduFlow audit) + decisions
├── data-model.md         # Schema changes (specified, not migrated)
├── plan.md               # This file
├── contracts/
│   ├── state-machines.md
│   └── api-endpoints.md
├── quickstart.md          # Testing master plan + E2E/security test matrices
└── tasks.md               # Atomic implementation tasks (T001+, scoped to this feature)
```

### Source code (repository — additions only, existing structure unchanged)

```text
apps/api/src/services/billing/
├── payment-provider.ts          # EXISTS, unchanged
├── stub-payment-provider.ts     # EXISTS, unchanged
├── paymob-payment-provider.ts   # NEW — the real provider (T267)
├── paymob-hmac.ts               # NEW — Paymob's documented field-concatenation + SHA-512 (isolated for its own focused test, mirroring EduFlow's own hmac.ts as a separate, independently-testable module)
├── checkout.service.ts          # EXISTS — minor extension: acquire/release the new checkout lock
├── payment-expiry-sweep.ts      # NEW — the abandoned-checkout sweep (state-machines.md §1)
└── ...

apps/api/src/services/email/
├── mailer.ts                    # EXISTS, unchanged interface
├── resend-mailer.ts             # EXISTS, unchanged (Option 1 path)
├── smtp-mailer.ts                # NEW, only if Option 2/3 (research.md C.1) is chosen
└── payment-mail.ts               # NEW — the payment-confirmation/failure email content, added to the Mailer interface

apps/api/src/services/monitoring/
├── cost-alerts.ts                 # NEW — FR-C01-C04
└── (APM SDK init lives in each process's own entrypoint, not a shared service — see below)

apps/worker/src/orchestrator/
└── payment-expiry-sweep-handler.ts  # NEW — same repeatable-job shape as timeout-scheduler.ts

apps/api/src/routes/
├── webhooks.routes.ts             # EXISTS — zero route-shape change (contracts/api-endpoints.md)
└── admin/payments.routes.ts       # NEW — FR-P09

apps/api/src/routes/admin/
└── cost-alerts.routes.ts          # NEW — FR-C02 admin visibility
```

**Structure Decision**: every new file is additive, placed alongside its existing sibling
services, following this repository's existing per-domain-folder convention exactly
(`services/billing/`, `services/email/`) — no new top-level module or package is introduced,
because nothing here needs a boundary any existing package boundary doesn't already provide.

## Complexity Tracking

No constitution-check violation exists, so no complexity justification is required. One
complexity note worth recording anyway: the optional `smtp-mailer.ts` + `EmailSendAttempt` combo
(only built if research.md's C.1 decision selects it) is real, non-trivial added surface — its
necessity is gated entirely on that decision being made in favor of SMTP, and `tasks.md` marks
every task under it as conditional.

---

## Architecture — Paymob Payment Integration

### Flow (target state, informed by `research.md` Part B)

```text
User clicks "Buy credits" / "Subscribe"
        │
        ▼
POST /billing/credits/purchase or /billing/subscribe   [EXISTS, unchanged route]
        │
        ├─ acquire checkout lock (Redis, key: checkout:{userId}, short TTL)  [NEW]
        │     └─ lock held? → 409 CHECKOUT_IN_PROGRESS (the control EduFlow documented but never built)
        │
        ├─ server resolves price from BillingPriceCatalog                    [EXISTS]
        ├─ create PendingPayment (status=PENDING)                            [EXISTS, enum-promoted]
        ├─ PaymobPaymentProvider.initCheckout():
        │     ├─ POST /auth/tokens          (Paymob auth-token exchange)     [NEW]
        │     ├─ POST /ecommerce/orders     (merchant_order_id = PendingPayment.id) [NEW]
        │     └─ POST /acceptance/payment_keys (iframe token, short expiry)  [NEW]
        │     — all three calls wrapped in the same typed-outcome/circuit-breaker
        │       discipline this repo's ai-executor already uses for a different
        │       external dependency (timeout, typed error, no silent retry)
        │
        └─ release checkout lock on any terminal outcome of THIS initiation call
              (lock protects against concurrent *initiation*, not the whole payment lifecycle —
               a long-pending payment must not permanently block a user's next checkout attempt;
               see the expiry sweep below for how a stuck PENDING is eventually resolved)
        │
        ▼
respond { checkoutUrl, providerReference }             [EXISTS route shape, unchanged]
        │
        ▼
User completes (or abandons) checkout at Paymob
        │
        ├──(A) POST /webhooks/billing  [EXISTS route, unchanged]
        │        → PaymobPaymentProvider.verifyWebhook(rawBody, headers):
        │            paymob-hmac.ts: reconstruct Paymob's documented field string, SHA-512,
        │            timing-safe compare, reject malformed format first             [NEW]
        │        → existing BillingEvent idempotency + eventMatchesPending          [EXISTS, unchanged]
        │        → existing grantLot/purchaseCredits/subscribe path                  [EXISTS, unchanged]
        │        → NEW: send payment-confirmation email (inline, from the applied-effect
        │          branch, log-not-block on failure per FR-E03)                     [NEW]
        │
        └──(B) GET /billing/payment-return  [NEW — the redirect-completion fallback,
                 modeled on EduFlow's dual-path design, research.md B.2 item 4]
                   → verify Paymob's signed return querystring using the SAME paymob-hmac.ts
                   → if valid, call the SAME webhook-application function as (A)
                     (whichever of A/B arrives first wins under the existing idempotency guard;
                      the other becomes a no-op duplicate — no new race condition introduced)
                   → redirect the browser to the existing success/failure UI page

Meanwhile, a repeatable sweep (matching sweepTimedOutScans' own shape):
        payment-expiry-sweep: PendingPayment rows PENDING past a configured abandonment
        window → EXPIRED (data-model.md §1.1, state-machines.md §1)
```

### Why this shape and not another (per the mega-prompt's required WHY/PROBLEM/SOLUTION/
ALTERNATIVES/WHY-WINS format, applied to the two decisions with real alternatives)

**Decision: adopt the dual-path (webhook + signed redirect) completion, not webhook-only.**
- **Current problem**: a webhook-only design has a single point of failure — if Paymob's webhook
  delivery infrastructure has a connectivity issue reaching this system specifically (firewall,
  DNS, a transient outage), a real, paid transaction can never complete locally even though the
  money moved.
- **Proposed solution**: the redirect handler independently verifies Paymob's own signed return
  parameters and, if valid, invokes the same completion logic the webhook uses.
- **Alternatives considered**: webhook-only with a manual-reconciliation admin tool for the rare
  stuck case (simpler, but leaves a real customer's money in limbo until an operator notices and
  intervenes — worse customer experience for a scenario EduFlow's own production code shows is
  worth solving automatically); polling Paymob's own transaction-status API from the redirect
  handler instead of trusting a signed redirect (adds a fourth external HTTP call to every
  checkout's happy path for a case that is otherwise free).
- **Why this wins**: it costs one new, well-isolated HMAC-verification code path reusing the exact
  module (`paymob-hmac.ts`) the webhook already needs, and it is a proven pattern (EduFlow's own
  production code demonstrates it working), not a novel design risk.

**Decision: promote `PendingPayment.status` to a real enum with an atomic `updateMany`-gated
transition, rather than keep the current string+read-then-write pattern.**
- **Current problem**: today's `if (pending.status !== 'PENDING') return;` is safe only because
  nothing else currently mutates `PendingPayment.status` concurrently — a true guarantee, not an
  accident, but one this feature's redirect-fallback path (which introduces a second call site
  that can reach the same completion logic) would put real pressure on for the first time.
- **Proposed solution**: `data-model.md` §1.1's enum, transitioned via an atomic
  `updateMany({ where: { id, status: 'PENDING' }, data: { status: nextStatus } })` — matching
  EduFlow's own proven concurrency-safe pattern (`research.md` B.2 item 2) and this repository's
  own established idiom for the identical problem (`reset.service.ts`'s `usedAt`-gated
  `updateMany`, and `timeout.ts`'s state-machine `transition()` guard).
- **Alternatives considered**: a database row lock (`SELECT ... FOR UPDATE`, matching
  `debit.ts`'s pattern) — workable, but heavier than necessary for a single-row conditional update
  with no multi-row invariant to protect, unlike credit debiting's multi-lot consumption order.
- **Why this wins**: it is the minimum mechanism that actually closes the race the new
  dual-path completion design introduces, using a pattern this codebase has already validated
  twice elsewhere rather than a new one.

---

## Architecture — Billing/Credits/Payment Integration (Phase 4 of the original brief)

**Finding, stated plainly: no redesign of the credit ledger is needed or proposed.** Paymob
integrates entirely through the seam that already exists:

```
Paymob (real money) → PaymentProvider.verifyWebhook → PaymentEvent
    → BillingEvent idempotency gate (EXISTS)
    → eventMatchesPending cross-validation (EXISTS)
    → purchaseCredits/subscribe (EXISTS) → grantLot (EXISTS)
        → DuplicateBillingEventGrantError on any re-delivery (EXISTS)
    → createReceiptForPaymentEvent (EXISTS)
    → NEW: payment-confirmation email
```

Every box marked EXISTS above is unchanged by this feature. This is precisely the point of the
seam-based architecture already in place — Paymob is "just another provider" behind an interface
designed for exactly this before Paymob credentials existed.

---

## Architecture — Email

Pending Decision C.1 (research.md). Both branches share this shape:

```
Registration / Reset / Webhook-applied-effect
        │
        ▼
   Mailer interface (EXISTS, unchanged)
        │
   ┌────┴────┐
   ▼         ▼
Resend    SMTP (nodemailer, Hostinger mailbox) [conditional on C.1]
API       │
   │      └─ EmailSendAttempt log (conditional — only if SMTP chosen, compensates
   │          for the missing provider dashboard, state-machines.md §4)
   ▼
Recipient
```

**Auth email flows (registration, reset) require zero new design** — both are already fully
specified and implemented (`research.md` Part A.3); this feature's only work item for them is
making the chosen transport production-live (credentials, domain verification) and, if SMTP is
chosen, building `smtp-mailer.ts` behind the unchanged `Mailer` interface.

**New: payment emails.** Two new `Mailer` methods, `sendPaymentConfirmation`/`sendPaymentFailed`
(the latter only if `plan.md`'s scope confirms a failure-notification email is wanted — a
customer who abandoned checkout arguably does not need an email at all; a customer whose card was
declined by Paymob arguably does — **decision needed at implementation time**, defaulting to
"send on success only" unless product input says otherwise, matching the narrower, safer default).
Both are sent inline from the webhook's applied-effect branch (EduFlow's proven "synchronous,
log-loudly-not-silently on failure" pattern, `research.md` B.2/B.3 item 4's lesson applied
deliberately) — **no new queue is built for this**, per FR-E05 and the explicit lesson from
EduFlow's inert `EmailQueue`.

---

## Architecture — Monitoring & Observability

### What gets logged (extending, not replacing, `packages/config/src/logger.ts`)

Already redacted-by-construction; nothing new is required of the logger itself. New log sites:
every Paymob API call (with `paymobOrderId`, never the API key, matching EduFlow's own
last-4-characters-only precedent for anything credential-adjacent it does log), every webhook
verification failure (reason, never the payload's sensitive fields), every cost-alert firing,
every backpressure rejection.

### What must never be logged

Paymob API key/HMAC secret (any part beyond, at most, a last-4-characters hint, matching
`research.md` B's noted EduFlow precedent); raw card data (never touches this system at all — the
iframe/redirect design means card details never reach this backend, matching EduFlow's own
architecture); SMTP password if the SMTP path is chosen; any user's full email/PII beyond what
already appears in existing redacted logs today.

### Metrics (minimum set, FR-M03)

| Metric | Source | Alert condition |
| --- | --- | --- |
| API 5xx rate | APM/error tracker | rolling-window threshold crossed |
| Auth failure rate | existing lockout/attempt system (already tracked — confirm at implementation time whether it already emits a metric or needs one added) | spike beyond baseline |
| Payment webhook failure rate | `webhooks.routes.ts`'s existing 500-response path | any sustained non-zero rate |
| Email send failure rate | new: counted at the `Mailer` call sites | any sustained non-zero rate |
| Queue failure/stall rate | BullMQ `failed` events, already logged (`workers.ts`) | any sustained non-zero rate |
| AI provider chain-exhaustion rate | `AiInvocation.outcome = 'CHAIN_EXHAUSTED'`, already recorded | rate above historical baseline |
| DB connectivity failures | Prisma connection errors, APM-captured | any occurrence |
| Redis connectivity failures | existing `.on('error', ...)` handlers (already present per T260) | any occurrence |
| Per-user / global AI spend | `AiInvocation`, via `CostAlertThreshold` (data-model.md §3.2) | threshold crossed (FR-C02) |
| Queue depth | BullMQ introspection | backpressure threshold approached/crossed |

### Candidate APM/error-tracking service

**Decision needed at implementation time, not made here** — but narrowed: Sentry is the natural
default given (a) it has first-class Node.js/Express SDKs requiring minimal wiring, (b) it needs
no new infrastructure to self-host (hosted-SaaS option available, matching this repo's existing
preference for managed services over self-hosted ones — Resend, R2), and (c) it captures both
error-tracking and basic performance/tracing in one SDK, covering FR-M01/FR-M03 without a second
tool. Alternatives (Datadog, New Relic) are heavier/more expensive for this product's current
scale and were not chosen as the default recommendation; the task in `tasks.md` names Sentry as
the default to implement against but flags this as overridable by a stakeholder preference.

### Dashboards (FR-M-adjacent, matching Phase 8's requested list)

1. Production health (uptime/error-rate/latency, API + worker).
2. Payments (checkout volume, success/failure/expiry rate, webhook failure rate).
3. Email (send volume, failure rate).
4. Authentication (login failures, lockouts, bans).
5. Credits (grants, debits, refunds, balance trends — largely already answerable via existing
   admin margin/credit reports; this dashboard is a visualization of existing data, not new data).
6. AI cost (spend by provider/model/prompt-version, cost-alert history).
7. Infrastructure (DB/Redis/queue health).
8. Security (webhook rejections, HMAC failures, lockouts/bans, cost-alert firings).

---

## Architecture — AI Cost-Runaway Protection

Already specified in `data-model.md` §3 and `research.md` C.3. Flow:

```
AiInvocation (EXISTS, real-time recorded)
        │
        ▼
Scheduled check (repeatable job, same shape as timeout-scheduler.ts):
   groupBy user/global over CostAlertThreshold.windowMinutes
        │
        ├─ under threshold → no-op
        └─ over threshold → CostAlertEvent created (deduped per window) → alert fired
                                    │
                                    └─ optional protective action (throttle new scans for
                                       the account) — NEVER touches CreditLot/CreditTransaction
```

---

## Architecture — Queue Backpressure

```
POST /scans (create-scan.ts, EXISTS)
        │
        ├─ NEW: check scanPhase queue depth (BullMQ introspection, data-model.md §4)
        │     ├─ under soft limit → enqueue as today, respond with queuePosition if > 0
        │     ├─ over soft limit, under hard limit → enqueue, respond with an honest
        │     │   queuePosition and estimated wait
        │     └─ over hard limit → refuse: { error: { code: 'QUEUE_AT_CAPACITY' } }
        │
        └─ priority ordering (PRIORITY/priorityForPlan, EXISTS) determines actual position
          within whichever of the above branches is taken — unaffected by this feature
```

---

## Architecture — Data Archival

Already specified in `data-model.md` §5. No further architecture beyond: a scheduled job (again,
same repeatable-job shape as the existing timeout/billing sweeps) that detaches old
`AiInvocation`/`CapabilityExecution` partitions past the retention window and moves them to R2
(reusing the existing object-storage integration rather than introducing a new one) — financial/
audit tables are explicitly untouched by any automated job (FR-A02).

---

## Architecture — Infrastructure Scaling (T295-298, T304-306) — evidence-gated recommendations

| Item | Launch-blocking? | Evidence |
| --- | --- | --- |
| Connection pooler (T295) | **Recommend: launch-blocking if real concurrent user count is unknown/could exceed low hundreds** | The existing code already sizes for ~1,000 users without one (per the master plan's own citation) — a pooler is cheap insurance and low-risk to add before real traffic exists; recommend doing it in Phase 1 of the rollout below rather than deferring. |
| Read replica (T296) | **Not launch-blocking** | Needed "well before sharding," per the master plan's own words — that is a scale-stage trigger, not a launch one; defer until reporting-query load is actually measured as a problem. |
| Isolated cache layer (T297) | **Not launch-blocking** | No caching layer exists at all today and the product functions; this is a performance optimization with no correctness gap behind it. Defer. |
| CDN/signed URLs (T298) | **Recommend: launch-blocking if report/export volume is expected to be non-trivial from day one** | Currently proxies all downloads through the API process — fine at low volume, a real cost/latency problem at real volume; the risk is proportional to expected traffic, which this planning pass cannot forecast — flagged as a launch-readiness judgment call for the business, not resolved here. |
| `probe-pool` multi-instance (T304) | **Not launch-blocking at low concurrency; blocking above a threshold to be confirmed** | Single-instance is a real ceiling, not a correctness bug — it degrades to "can't scale audits past what one instance's browser pool handles," which may be entirely acceptable for an initial launch. |
| `sandbox-runner` multi-instance (T305) | Same reasoning as `probe-pool`. | |
| Multi-source-IP load testing (T306) | **Recommend: launch-blocking** — not because the infrastructure needs to change, but because the business needs an honest answer to "what is our real capacity" before, not after, committing to a launch date; this is a testing task, not an infrastructure one, and is comparatively cheap to close. | |

---

## Implementation Phases

```text
Phase 0  — Discovery and verification                          [THIS DOCUMENT — DONE]
Phase 1  — Architecture and foundations                        (PendingPayment enum, checkout lock,
                                                                  connection pooler if confirmed needed)
Phase 2  — Paymob payment integration                           (real provider, HMAC, order/checkout)
Phase 3  — Payment → billing → credits fulfillment               (webhook wiring, redirect fallback,
                                                                  expiry sweep — reuses existing credit path)
Phase 4  — Email transport decision + rollout                   (research.md C.1's decision, then build)
Phase 5  — Auth email flows production rollout                  (verification, reset — code exists,
                                                                  this phase is credentials/domain/smoke-test)
Phase 6  — Payment/customer emails                              (confirmation, optionally failure)
Phase 7  — Monitoring and observability                         (APM, dashboards, alert wiring)
Phase 8  — AI cost protection                                   (CostAlertThreshold/Event, sweep, alerts)
Phase 9  — Queue/backpressure                                   (depth check, position UX, refusal)
Phase 10 — Archival and data lifecycle                          (partitioning, R2 export, sweep job)
Phase 11 — probe-pool / sandbox-runner multi-instance readiness  (evidence-gated, may be deferred)
Phase 12 — Infrastructure scaling (pooler/replica/cache/CDN)     (evidence-gated per table above)
Phase 13 — Load testing                                          (multi-source-IP rig, T306)
Phase 14 — Security hardening / adversarial test pass            (quickstart.md's full matrix)
Phase 15 — Staging validation                                    (sandbox Paymob, real SMTP/Resend test)
Phase 16 — Production rollout                                    (see launch gates below)
Phase 17 — Post-launch verification                              (smoke checklist, first real payment)
```

## Dependency Graph

```text
PendingPayment enum + checkout lock (Phase 1)
        │
        ▼
Paymob provider + HMAC module (Phase 2) ──depends on── real/sandbox Paymob credentials (external)
        │
        ▼
Webhook wiring + redirect fallback + expiry sweep (Phase 3)
        │
        ├──────────────────────────────┐
        ▼                              ▼
Email transport decision (Phase 4)   Payment emails (Phase 6, depends on Phase 3's
        │                              applied-effect branch existing to hook into)
        ▼
Auth email rollout (Phase 5)
        │
        ▼
Monitoring (Phase 7) ── independent of payments/email, can start anytime, but its
        │                dashboards for payments/email are only meaningful once
        │                Phases 2-6 exist
        ▼
AI cost protection (Phase 8) ── independent, no dependency on payments/email
        │
        ▼
Backpressure (Phase 9) ── independent
        │
        ▼
Archival (Phase 10) ── independent
        │
        ▼
probe-pool/sandbox-runner + infra scaling (Phases 11-12) ── independent, evidence-gated
        │
        ▼
Load testing (Phase 13) ── benefits from Phases 9/11/12 existing, not strictly blocked by them
        │
        ▼
Security hardening pass (Phase 14) ── depends on Phases 2-3 (payments) existing to test against
        │
        ▼
Staging validation (Phase 15) ── depends on everything above being implemented
        │
        ▼
Production rollout (Phase 16) ── depends on every Launch Gate below passing
        │
        ▼
Post-launch verification (Phase 17)
```

Phases 4-13 have no dependency on each other and may be built in parallel by independent sessions/
teams; only Phase 2→3→(4,6) and the terminal 14→15→16→17 sequence are genuinely ordered.

## Launch Gates

**The project MUST NOT be considered production-ready until every gate below passes.**

### Payment Gate

- [ ] Real merchant credentials configured (external dependency — currently blocking).
- [ ] Successful payment verified end-to-end (sandbox or production).
- [ ] Failed/cancelled/expired payment verified.
- [ ] Webhook HMAC verified against the real Paymob-documented scheme (not a stand-in — per
      `research.md` B.3 item 2's explicit lesson).
- [ ] Duplicate webhook verified idempotent.
- [ ] Redirect-fallback path verified (completes a payment when the webhook is simulated as
      undelivered).
- [ ] Entitlement (credit grant) verified.
- [ ] Payment monitoring dashboard live and showing real data.

### Email Gate

- [ ] Transport decided (research.md C.1) and credentials configured for the chosen path.
- [ ] Sending domain verified (SPF/DKIM/DMARC as applicable).
- [ ] Staging email delivered for each of: verification, reset, payment confirmation.
- [ ] Password reset verified end-to-end in staging.
- [ ] Registration verification verified end-to-end in staging.
- [ ] Production smoke test sent and received.

### Monitoring Gate

- [ ] Error tracking live and receiving real events.
- [ ] Alerts live for every item in FR-M03's list.
- [ ] At least one alert tested end-to-end (a forced synthetic condition actually pages).

### Load Gate

- [ ] Multi-source-IP load test executed (not single-machine) against defined targets.
- [ ] Concurrency targets for the expected initial launch scale passed.
- [ ] Failure behavior under load (queue backpressure, DB saturation) is acceptable, not merely
      "did not crash."

### Security Gate

- [ ] Every row in `quickstart.md`'s payment security/concurrency matrix passes.
- [ ] Credit-bypass attempts (direct route access, tampered webhook) all fail.
- [ ] Authentication-abuse tests (already largely covered by the existing lockout system) pass.

---

## Final Gap Report

| Area | Current State | Verified? | Gap | Required Work | Blocking? | Phase |
| --- | --- | --- | --- | --- | --- | --- |
| Real Paymob provider | Missing | Yes (this session) | No real provider implementation | Build `paymob-payment-provider.ts` + `paymob-hmac.ts` | Yes | 2 |
| Paymob credentials | Not available | N/A | External dependency | Obtain merchant account/credentials | Yes | 2 (blocks it) |
| Checkout concurrency lock | Missing | Yes | No lock exists (same gap EduFlow has, undocumented-as-fixed there too) | Build a real Redis lock | Yes | 1 |
| `PendingPayment` terminal states | Partial (only PENDING/COMPLETED observed) | Yes | No FAILED/CANCELLED/EXPIRED | Enum promotion + expiry sweep | Yes | 1, 3 |
| Redirect-completion fallback | Missing | Yes | Single point of failure on webhook delivery | Build the redirect handler | Recommended, not launch-blocking on its own | 3 |
| Payment confirmation email | Missing | Yes | No email sent on payment success | Add `sendPaymentConfirmation` | Yes | 6 |
| Email transport production rollout | Code done, ops not done | Yes | No real credentials/domain verification | Complete rollout checklist (either transport) | Yes | 4, 5 |
| SMTP mailer (Hostinger) | Missing | Yes | Only if research.md C.1 selects it | Build `smtp-mailer.ts` | Conditional | 4 |
| AI cost-runaway detection | Missing | Yes (confirmed again this session) | No alerting on spend | Build `CostAlertThreshold`/`Event` + sweep | Recommended, not strictly launch-blocking | 8 |
| APM/error tracking | Missing | Yes (confirmed again this session) | No visibility into production errors | Wire Sentry (or equivalent) | Yes | 7 |
| Worker liveness signal | Missing | Yes | No HTTP surface, no heartbeat check | Build heartbeat-staleness check (contracts/api-endpoints.md) | Recommended | 7 |
| Queue backpressure | Missing | Yes (confirmed T301 is done, T302 is not) | Unbounded backlog, no position UX | Build depth check + position field | Recommended | 9 |
| Archival | Missing | Yes | Unbounded table growth | Partitioning + R2 export job | Not launch-blocking (a scale-stage concern until tables are actually large) | 10 |
| Connection pooler | Missing | Yes | Sized for ~1,000 users, no pooler | Add one | Conditionally blocking (see scaling table above) | 12 |
| Read replica | Missing | Yes | None | Add if reporting load demands it | No | 12 |
| Isolated cache | Missing | Yes | None | Add if measured need | No | 12 |
| CDN/signed URLs | Missing | Yes | Proxied downloads | Add if volume warrants | Conditionally blocking | 12 |
| `probe-pool` multi-instance | Missing | Yes | Single instance | Cross-process transport + deploy entrypoint | Conditionally blocking (concurrency-dependent) | 11 |
| `sandbox-runner` multi-instance | Missing | Yes | Single instance | Multi-replica deployment proof | Conditionally blocking | 11 |
| Multi-source-IP load testing | Missing | Yes (T306's own honest admission, re-confirmed) | Single-machine-only evidence | Build a real multi-source rig | Recommended, launch-blocking as a testing gate | 13 |
| Credit ledger | Complete | Yes | None | None — do not redesign | No | — |
| AI executor/gateway | Complete | Yes | None | None | No | — |
| Auth email flows (code) | Complete | Yes | None (operational rollout only) | See Email Gate | Partially (ops only) | 5 |

**No item above is hidden or silently assumed resolved.** Every `Yes` in the Blocking column has
a corresponding gate in the Launch Gates section; every conditional item states its condition
explicitly rather than defaulting to "must build."
