# Research — Production Hardening

Phase 0 (current-project verification), Phase 1-2 (EduFlow-LMS reference audit), and the design
decisions that follow from both. This is the "why" document — `plan.md` states the resulting
architecture as decisions; this document is where each decision is justified.

---

## Part A — Phase 0: Current-project verification (2026-09-12)

Every claim below was re-verified against the real, current repository during this planning
session (not assumed from an older document). Classification scheme, per the requested rubric:
**COMPLETE / PARTIAL / IMPLEMENTED BUT NOT VERIFIED / BLOCKED BY EXTERNAL DEPENDENCY / MISSING /
OBSOLETE / NEEDS REDESIGN.**

### A.1 Payments

| Item | Classification | Evidence |
| --- | --- | --- |
| `PaymentProvider` seam | **COMPLETE** | `apps/api/src/services/billing/payment-provider.ts` — a real, minimal interface (`initCheckout`/`verifyWebhook`/`refund`), already what every other layer depends on. |
| Stub provider (dev/test) | **COMPLETE** | `stub-payment-provider.ts` — real HMAC-SHA256 verification against its own signed payloads, drivable end-to-end via real HTTP, not just an in-process fake. |
| Checkout initiation (subscription + credits) | **COMPLETE** | `checkout.service.ts` — server-side price lookup (`BillingPriceCatalog`), `PendingPayment` row created before redirect, client never supplies an amount. |
| Webhook receiver | **COMPLETE, provider-agnostic path already correct** | `webhooks.routes.ts` — HMAC verified via injected `PaymentProvider.verifyWebhook`; `BillingEvent` idempotency (unique id + `appliedAt` gate); `eventMatchesPending` cross-validates user/amount/product before applying; `500` (not `200`) on effect failure so the provider genuinely retries. |
| Credit-grant idempotency | **COMPLETE** | `grant.ts` — `CreditTransaction.billingEventId` unique constraint; `DuplicateBillingEventGrantError` thrown and caught specifically, converging to the already-committed state rather than erroring the whole webhook. |
| Receipts | **COMPLETE** | `Receipt` model, unique on `billingEventId`, generated on every applied payment event. |
| **Real Paymob provider implementation** | **MISSING, BLOCKED BY EXTERNAL DEPENDENCY** | No `paymob-payment-provider.ts` file exists (confirmed: only `payment-provider.ts` and `stub-payment-provider.ts` exist in `apps/api/src/services/billing/`). Blocked on real Paymob merchant credentials (T267 in the existing master plan). |
| Checkout-level concurrency lock (double-click protection) | **MISSING** | No equivalent of a `checkout:lock:{userId}` exists in this codebase either — same gap EduFlow's own code has (see Part B §6). Must be designed fresh, not copied from EduFlow (EduFlow doesn't actually have a working one to copy). |
| Payment-attempt terminal states beyond PENDING/COMPLETED | **PARTIAL** | `PendingPayment.status` is a free-text column observed only as `"PENDING"`/`"COMPLETED"` in code — no `FAILED`/`CANCELLED`/`EXPIRED` path exists yet. See `data-model.md` §1.1. |
| Currency validation on webhook | **NOT VERIFIED — flagged gap** | `eventMatchesPending` checks user/amount/kind/plan-or-credits; no currency field appears anywhere in `PaymentEvent`/`PendingPayment` at all (the whole system is implicitly single-currency, integer micros). If Paymob settlement is genuinely single-currency for this product, this is a non-issue; if not, this is a real gap to close (see `plan.md`'s Paymob architecture). |
| Payment-attempt expiry sweep | **MISSING** | No equivalent of EduFlow's `findExpiredWebhookPending`/abandon-sweep exists. Needed for FR-P07/the `EXPIRED` state. |

### A.2 Credits (ledger)

| Item | Classification | Evidence |
| --- | --- | --- |
| Lot-ordered debit, row-locked | **COMPLETE** | `debit.ts` — `SELECT ... FOR UPDATE`, expiry/kind/createdAt ordering, already audited in this session's prior work. |
| Grant idempotency | **COMPLETE** | See A.1. |
| Refund-to-originating-lot | **COMPLETE** | Already audited in this session's prior AI-engineering work (Part 2 §O of the AI audit). |
| **No redesign needed** | — | The mega-prompt's own instruction ("Do NOT redesign the credit system unless the audit proves it is necessary") is satisfied: nothing found here requires redesign. Paymob integrates through the existing `PaymentProvider`/webhook/grant seam with zero credit-engine changes. |

### A.3 Email

| Item | Classification | Evidence |
| --- | --- | --- |
| `Mailer` interface + console dev transport | **COMPLETE** | `mailer.ts`. |
| Resend HTTP-API transport | **COMPLETE, code-wise** | `resend-mailer.ts` — real Resend API calls, branded HTML template (`template.ts`), plain-text fallback (per the earlier master plan's T293). |
| Production rollout of the above | **BLOCKED BY EXTERNAL DEPENDENCY (operational, not code)** | No real `RESEND_API_KEY`/verified sending domain confirmed configured (per `PRODUCTION-READINESS-MASTER-PLAN.md` Phase 5's own unchecked rollout boxes). |
| Registration verification email flow | **COMPLETE** | `registration.service.ts`/`EmailToken` (purpose `"verify"`), hashed single-use token. |
| Password reset flow | **COMPLETE, and notably hardened** | `reset.service.ts` — atomic single-use claim via `updateMany({ usedAt: null })` guard (closes a documented prior race-condition class, "Finding C2"), session revocation on reset, enumeration-safe (`requestReset` always resolves). This is at least as strong as EduFlow's equivalent (see Part B §10) and in one respect stronger (EduFlow's reset uses a simple read-then-write; this codebase's uses an atomic conditional update as the actual gate). |
| Raw SMTP transport (Hostinger or otherwise) | **MISSING** | No `nodemailer`/SMTP client exists anywhere in this codebase — the only production mail transport built is Resend's HTTP API. See the Email Provider Decision below. |
| OTP flow | **MISSING, and — see decision below — likely correctly absent** | No OTP model, token, or endpoint exists anywhere; nothing in this product's own spec baseline (`specs/001-webaudit-mvp-baseline/spec.md`'s auth requirements, FR-001-009) calls for one. |
| Payment-confirmation email | **MISSING** | No email is currently sent when a payment/webhook completes — `applyProviderPaymentEvent` in `webhooks.routes.ts` grants credits and creates a receipt but does not call the mailer. This is a real gap FR-P (payment emails) must close. |

### A.4 AI cost / observability

Carried forward unchanged from `docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md` (verified
in a prior session on the same date, re-confirmed still current): AI Gateway/cost-recording —
**COMPLETE**; cost-runaway *detection/alerting* — **MISSING** (T300); any APM/error-tracking
package — **MISSING** (confirmed again this session: no `sentry`/`datadog`/`newrelic`/
`opentelemetry`/`prom-client` reference anywhere in any `package.json` in the monorepo).

### A.5 Queues / backpressure / archival / scaling

All carried forward from `docs/reviews/PRODUCTION-READINESS-MASTER-PLAN.md` T295-T306, each
**MISSING** except T301 (queue timeouts) which is **COMPLETE**, per that document's own Phase 6
status note and this session's earlier independent re-verification (see
`docs/reviews/AI-ENGINEERING-TASKS.md` T312's discussion of `QUEUE_LOCK_DURATION_MS`/
`QUEUE_STALLED_INTERVAL_MS`, both real and already wired).

Health endpoints: `apps/api` — **COMPLETE** (`GET /health`, ahead of rate limiters). `apps/worker`
— **MISSING** (no HTTP surface at all, by design — see `contracts/api-endpoints.md`).
`apps/sandbox-runner` — **NOT VERIFIED** (has an HTTP host; its `/health`-equivalent was not
confirmed this session). `apps/probe-pool` — **MISSING** (no runnable entrypoint at all, confirmed
in a prior session: `dev` script is a placeholder).

---

## Part B — Phase 1-2: EduFlow-LMS payment & email architecture audit

Full findings, with file:line evidence, were gathered by a dedicated research pass over
`C:\Users\Yousef\Desktop\Projects\-EduFlow-LMS`. The complete report is preserved as this planning
session's research transcript; the load-bearing findings are reproduced here so this document is
self-contained for a future reader who does not have that transcript.

### B.1 EduFlow's real payment flow (condensed)

```
Student clicks "Buy"
  → POST /api/v1/checkout (auth+role+rate-limited)
      → already enrolled? 409. Auto-fail any stale pending payment for this user (no lock, no age check — see §6).
      → price resolved server-side from CoursePackage/CourseSettings (client sends only packageId+couponCode)
      → 100%-off coupon → mark COMPLETED directly, skip Paymob entirely
      → else: Paymob auth-token exchange → create Paymob order (merchant_order_id = local Payment.id)
              → create payment_key (iframe token, 1h expiry) → respond {paymentKey, orderId, iframeId}
  → frontend opens Paymob iframe in a popup; popup-close is UX only, never grants anything
  → COMPLETION happens two independent ways, whichever arrives first wins:
      (A) POST /webhooks/paymob  — real server-to-server webhook, HMAC-SHA512 gated
      (B) GET  /webhooks/paymob  — Paymob's browser-redirect URL, HMAC re-verified inline,
                                    calls the *same* completion function as a fallback
  → completion function: duplicate-transaction check (DB) → 15-min timestamp/replay window →
    Redis SETNX nonce (24h, best-effort) → integration-id binding check → order lookup →
    currency+amount match against the stored Payment → atomic `updateMany` gated on
    `status NOT IN (terminal set)` (the actual concurrency-safety mechanism) →
    on success: enroll + send receipt/enrollment emails (inline, synchronous, silently swallowed on failure)
```

### B.2 What is genuinely strong and directly reusable

1. **Server-side price authority, always** — the client never supplies anything financially
   meaningful; only an opaque product/plan identifier. WebAudit AI's `checkout.service.ts` already
   does the equivalent (`BillingPriceCatalog`) — this is a confirming precedent, not new work.
2. **The three-layer webhook idempotency stack**: a DB unique-constraint check, an independent
   fast Redis-nonce check, and an atomic `updateMany` gated on "not already terminal" as the real
   concurrency-safety mechanism (the loser of a race gets zero affected rows and returns the
   winner's state without re-running any side effect). WebAudit AI's own webhook handler already
   implements the equivalent of layers 1 and 3 (`BillingEvent` unique id + `appliedAt`, and the
   fact that `pending.status !== 'PENDING'` is itself a guard) — **the one addition worth adopting
   is EduFlow's atomic `updateMany`-with-status-guard specifically at the `PendingPayment` level**,
   once `PendingPayment.status` is promoted to a real enum (`data-model.md` §1.1), rather than the
   current simple `if (pending.status !== 'PENDING') return;` read-then-conditional-proceed, which
   is safe today only because the surrounding code never mutates status from two different call
   sites concurrently — a `updateMany({ where: { status: 'PENDING' }, data: {...} })`-style guard
   is a strictly stronger, race-proof version of the same intent and should be adopted explicitly.
3. **HMAC verification shape**: reconstruct the provider-documented signed-field string exactly,
   timing-safe compare, reject malformed-format signatures before the compare, bind on
   integration/merchant ID as well as signature. WebAudit AI's generic HMAC path
   (`webhooks.routes.ts`'s `verify()`) already does the timing-safe-compare half; the Paymob
   provider implementation must add the exact field-concatenation-and-SHA512 half, matching
   Paymob's real documented scheme (which EduFlow's `hmac.ts` already demonstrates working against
   the real API).
4. **Dual-path completion (webhook + signed redirect fallback)** is a genuine resilience win worth
   adopting: if Paymob's webhook delivery has connectivity trouble, a validly-signed browser
   redirect can still complete the payment. This is new work for WebAudit AI (its current generic
   webhook path has no redirect-fallback equivalent) — see `plan.md`'s Paymob architecture.
5. **Circuit breaker + typed error codes** around the provider's HTTP calls (EduFlow uses
   `opossum`; WebAudit AI's AI-executor already has an equivalent typed-outcome philosophy for a
   *different* external dependency — this is the same shape applied to a payment gateway instead
   of an LLM provider, and should be built the same disciplined way).
6. **Admin override with mandatory reason + audit log + explicit terminal-state guard** — WebAudit
   AI already has the audit-log/admin pattern (`AuditLogEntry`, `apps/api/src/services/admin/
   audit-log.ts`); a payment override endpoint should reuse it rather than invent a parallel one.

### B.3 What EduFlow demonstrates as gaps to avoid replicating

1. **Documented-but-not-implemented checkout lock.** EduFlow's own task documentation describes a
   `checkout:lock:{userId}` Redis lock with a 15-minute TTL — **it does not exist in the code**.
   What exists instead (auto-cancel any prior pending payment, no lock, no age check) leaves a
   real TOCTOU window for two rapid concurrent checkout clicks. **WebAudit AI must design and
   actually build this lock**, not skip it the way EduFlow's documentation implies it should have
   but didn't.
2. **A security test that doesn't test the real code.** EduFlow's `webhook-hmac.test.ts` defines
   its own fictional SHA-256/JSON.stringify verifier and tests that instead of importing the real
   `isValidPaymobHmac`. This is a direct, concrete lesson for `tasks.md`'s test-writing tasks:
   every HMAC/security test for WebAudit AI's Paymob provider MUST import and exercise the actual
   production verification function, never a hand-rolled stand-in — this must be an explicit
   acceptance criterion on those tasks, not assumed.
3. **Test/implementation drift.** EduFlow has an integration test asserting a `CHECKOUT_IN_PROGRESS`
   409 that the service code never throws (dead/aspirational assertion). Lesson: `plan.md`'s
   testing tasks must verify each test actually exercises the real code path it claims to (matching
   this repository's own established discipline — e.g., the T311/T309 verification-by-breaking-it
   pattern already used earlier in this initiative), not just that the test file exists and passes.
4. **A retry/queue system built against a stub.** EduFlow's `EmailQueue`/Bull job has real
   exponential backoff and DLQ semantics, but is wired to a `sendEmail` stub that never contacts
   SMTP — every actual transactional email bypasses it entirely and sends synchronously,
   inline, with silently-swallowed failures. Lesson for WebAudit AI (FR-E05): do not build
   queueing/retry infrastructure for email speculatively; if it is built, it must be wired to the
   real send path from the start and proven end-to-end, or not built at all until a real,
   demonstrated need exists (a rate limit actually being hit, e.g.).
5. **Fail-open security state on Redis outage.** EduFlow's lockout system and webhook nonce-replay
   guard both silently degrade (not alert) when Redis is unreachable. WebAudit AI's own equivalent
   protections should either fail closed where the cost of a false negative is high (a replay
   guard failing open is a real risk) or, if fail-open is chosen for availability reasons, that
   choice MUST be a logged, alertable event — not silent, unlike EduFlow's.
6. **A course/enrollment-shaped entitlement model does not transfer.** `Enrollment.userId @unique`
   (one row, binary access) has no credit-ledger equivalent — WebAudit AI's `CreditLot`/
   `CreditTransaction` model (additive, decrementing, many rows per user) is already the correct
   shape for this product and EduFlow's model must not be forced onto it.
7. **No real OTP reference exists.** EduFlow's only OTP-adjacent code is a `.disabled` TOTP-2FA
   prototype (authenticator-app codes via `otplib`, not an emailed/SMS numeric OTP) — it is not a
   working reference for "OTP" in the sense the original planning prompt used the term, and per
   Part A.3/the OTP decision below, this product does not appear to need one anyway.

### B.4 EduFlow → Current Product Mapping

| EduFlow Capability | EduFlow Implementation | Current Product (WebAudit AI) | Reusable Pattern | Required Adaptation |
| --- | --- | --- | --- | --- |
| Price authority | Server resolves `CoursePackage`/`CourseSettings` price from `packageId` | `BillingPriceCatalog` resolves price from `planId`/credit count | Yes, directly — same principle, already implemented on both sides | None — confirming precedent only |
| Order creation | `payment.service.ts`'s `createPaymobOrder`: auth-token → order → payment_key, 3 sequential Paymob calls | Not yet built (T267) | Yes — the 3-call sequence and stored-id shape (order id, transaction id) is the real Paymob API contract, must be replicated for real | Wrap in this repo's `PaymentProvider.initCheckout` seam instead of a bespoke service; add this repo's own circuit-breaker/typed-error convention (matching `ai-executor`'s reliability philosophy) rather than copying `opossum` verbatim if a lighter equivalent suffices |
| Webhook idempotency | DB unique + Redis nonce + atomic `updateMany` guard | `BillingEvent` unique+`appliedAt`, `eventMatchesPending`, simple status check | Yes — adopt the atomic `updateMany`-with-status-guard specifically | Promote `PendingPayment.status` to an enum first (`data-model.md`); no Redis-nonce layer needed given `BillingEvent`'s primary-key-based idempotency is already the DB-level guarantee EduFlow uses Redis to *approximate* — this repo's mechanism is arguably already equivalent-or-stronger without Redis, so do not add a redundant nonce layer without a demonstrated need |
| HMAC verification | SHA-512 over Paymob's fixed 20-field concatenation, timing-safe compare, malformed-hex short-circuit | Generic SHA-256 HMAC over raw body (works for the stub provider) | Yes — the structural pattern (reject malformed format first, timing-safe compare, bind on merchant/integration id) | The real Paymob provider's `verifyWebhook` MUST implement Paymob's actual documented field-concatenation-and-SHA512 scheme, not the generic raw-body HMAC the stub uses — these are genuinely different per-provider and this is real, provider-specific work, not a config change |
| Dual completion path (webhook + redirect) | Both call the same completion function; whichever arrives first wins under the atomic guard | Only a webhook path exists; no redirect-completion fallback | Yes, worth adopting | New design work: the redirect handler must independently HMAC-verify Paymob's signed return querystring and call the same webhook-application logic, sharing the idempotency guard |
| Checkout concurrency lock | Documented, not implemented (real gap in EduFlow) | Does not exist either | No — nothing to copy; EduFlow's own gap | Design and build for real (Redis lock keyed on user+intent, short TTL, released on checkout-terminal state) |
| Entitlement/fulfillment | Binary `Enrollment` upsert-by-userId | Additive `CreditLot`/`CreditTransaction` ledger | No — different shape entirely | None needed from EduFlow; WebAudit AI's existing ledger is already the correct, more general mechanism |
| Payment emails | Synchronous, inline, silently-swallowed failures; sophisticated-but-inert queue exists in parallel | No payment email exists yet | Partially — "synchronous, inline, log-on-failure" is an honest, simple pattern worth adopting *deliberately*, not the unused-queue half | Send inline from the webhook's applied-effect branch (matching where credits are granted), log failures loudly (not silently, per FR-E03), do not build a parallel queue unless demonstrated necessary |
| Auth email token hygiene | Random 256-bit token, SHA-256 hash only persisted, short TTL, cleared/rolled back on failure | Equivalent already (`crypto.ts`/`hashToken`), plus a *stronger* atomic single-use claim gate | Yes, already present and arguably ahead | None — confirming precedent |
| Admin payment override | `overridePaymentStatus`, reason-mandatory, audit-logged, terminal-state guard | No payment-admin surface exists yet (new work, FR-P09) | Yes | Build using this repo's existing `AuditLogEntry`/admin-route conventions, not a new pattern |
| OTP | Not real (disabled TOTP-2FA prototype only) | Not present, not required by spec | N/A | Confirm as a product non-requirement (see decision below) rather than building against a non-existent reference |

---

## Part C — Design decisions

### C.1 Email transport: Resend (existing) vs. Hostinger SMTP (newly provided)

**The question, stated precisely**: this session was given real Hostinger SMTP details (host
`smtp.hostinger.com`, port 465, TLS, mailbox `ai-audit@youesf-abdallah.online`) as "existing email
infrastructure," while the codebase's actual, already-built production mailer targets Resend's
HTTP API (`resend-mailer.ts`), not SMTP. These are two different, currently-unreconciled signals
about production intent.

**Decision — do not silently pick one; carry both as explicit, evidence-gated options into
`plan.md`'s tasks, and resolve the ambiguity as a task-zero product decision rather than an
assumption made here:**

- **Option 1 — finish the Resend rollout (least new code).** The mailer, template, and provider
  wiring are already fully built and tested (T292-294, DONE). The only remaining work is
  operational: obtain a real `RESEND_API_KEY`, verify the sending domain (SPF/DKIM/DMARC) with
  Resend, and complete the already-written rollout checklist. Resend also solves FR-M-adjacent
  needs the raw-SMTP option does not: a delivery/bounce/complaint dashboard exists for free
  (state-machines.md §4), removing the need for this system to build its own delivery-tracking
  table.
- **Option 2 — add a raw-SMTP mailer using the Hostinger mailbox.** Requires a new
  `smtp-mailer.ts` (a `nodemailer`-based `Mailer` implementation, matching the `Mailer` interface
  exactly, zero changes to any calling code — FR-E02) plus, per `contracts/state-machines.md` §4,
  a new minimal `EmailSendAttempt` log to compensate for the missing provider-side dashboard
  Hostinger doesn't offer. This uses infrastructure the operator says is "existing" (a mailbox
  already provisioned), avoiding a new paid third-party dependency, but reintroduces exactly the
  kind of provider-side visibility gap Resend already solves, and (per EduFlow's own experience,
  Part B.3 item 4) raw-SMTP-plus-custom-retry is precisely the shape that produced EduFlow's
  worst, silently-broken pattern if built carelessly.
- **Option 3 — both, SMTP as the primary transport with Resend (or another API-based provider) as
  an automatic fallback** if SMTP delivery fails. Highest resilience, highest complexity; only
  justified if a real deliverability concern with Hostinger's shared-hosting mail infrastructure
  is confirmed (shared-IP hosting mailboxes commonly have weaker sender reputation than a
  dedicated transactional-email API) — do not build this speculatively.

**Recommendation, stated as a recommendation, not a silent default:** Option 1 (finish Resend)
unless the operator specifically wants to use the Hostinger mailbox for cost or ownership reasons
that outweigh the deliverability/observability trade-off — this is a business decision, not an
engineering one, and `tasks.md`'s first email task is explicitly to obtain this decision before
any email code is written, exactly as the original planning brief requires ("If SMTP is
sufficient, keep it... do not introduce unnecessary infrastructure" cuts both ways: it also means
do not abandon the already-built, already-tested Resend path without a stated reason).

### C.2 OTP: build it, or confirm it is not needed?

**Decision: do not build an OTP flow under this feature.** Evidence: (a) this product's own spec
baseline (`specs/001-webaudit-mvp-baseline/spec.md`, auth requirements FR-001 through FR-009, per
`PROJECT_MAP.md`'s routing table) never mentions OTP; (b) no OTP model, token, or endpoint exists
anywhere in the current codebase; (c) EduFlow's own OTP-adjacent code is an unshipped, `.disabled`
prototype using a different mechanism (TOTP/authenticator-app codes) than a typical emailed/SMS
OTP, so it is not even a usable reference if OTP were wanted. Building OTP here would be adding a
capability nobody has asked for against a product spec that doesn't call for it, purely because a
reference project happened to have a prototype for something adjacent. **If a product stakeholder
does want OTP for a specific reason (e.g., a future 2FA requirement), that is a new, separate
Spec Kit feature with its own spec.md — not silently folded into this production-hardening pass.**

### C.3 Cost-runaway protection philosophy

Per FR-C03/FR-C04 and the existing `AI-ENGINEERING` audit's own established design language:
protection is **advisory and operational**, never a second billing mechanism. The credit ledger
already prevents unlimited spend by a single user in the way that matters most (a user literally
cannot consume more than their credit balance allows — `debit.ts` already refuses insufficient
balance before work starts). What cost-runaway detection adds on top is **operator visibility into
a spend *pattern* that is unusual even though every individual operation was properly paid for** —
e.g., a compromised account rapidly buying and burning credits, or a legitimate customer's
unusually large audit target producing a real but surprising bill. The distinction in FR-C04
(a single expensive operation vs. a sustained anomalous pattern) is resolved by windowing:
`CostAlertThreshold`'s `windowMinutes` must be wide enough that one large-but-legitimate scan does
not, by itself, cross a *global* threshold tuned for detecting sustained abuse — this is a tuning
question for the admin-editable thresholds (`data-model.md` §3.2), not a hard-coded judgment call
this planning pass makes.

### C.4 Backpressure: reject vs. queue-with-visible-position

**Decision: queue-with-visible-position, with rejection only past a second, harder ceiling.**
Rationale: this product already prices and reserves work via credits at request time — a user who
was quoted and charged (or about to be) has already committed real value to this request, so an
outright rejection under moderate load is a worse experience than an honest queue position, given
this repository's own existing priority-queue mechanism already exists to keep paying tiers moving
even under load (FR-B02). A hard rejection ceiling still exists (FR-B01) for the genuinely
pathological case (the queue is so deep that even an honest wait estimate would be unacceptably
long) — but that ceiling should be set generously above where "give a position" already keeps the
experience honest, not used as the primary mechanism.

---

## Part D — Open questions requiring input this planning pass cannot resolve

1. **Real Paymob merchant credentials/sandbox access** — external dependency, unresolved (T267,
   unchanged).
2. **Email transport choice** (C.1) — a business/ops decision, not resolved here by design.
3. **Currency scope** — is this product genuinely single-currency (as the current schema implies)
   for Paymob settlement, or does Paymob need to settle in a currency this system has never had to
   represent before? Confirm before finalizing the Paymob webhook's field validation (Part A.1's
   flagged gap).
4. **Cost-runaway threshold values** — real numbers (`windowMinutes`, `thresholdMicros`) are a
   product/finance decision; this document specifies the mechanism, not the numbers.
5. **Legal/compliance retention requirement for financial records** — `data-model.md` §5.1 assumes
   indefinite retention absent a confirmed requirement; if a specific regulatory retention period
   applies (tax law, payment-processor contractual requirement), it must be supplied before the
   archival task is finalized.
6. **Whether `probe-pool`/`sandbox-runner` multi-instance support is a launch requirement** — this
   depends on expected initial concurrent-user count, a business projection this planning pass
   does not have visibility into; `plan.md`'s scaling section frames the decision but does not make
   it.
