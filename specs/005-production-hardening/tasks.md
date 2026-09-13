# Tasks: Production Hardening — Payments, Email, and Operational Readiness

**Input**: `spec.md`, `research.md`, `data-model.md`, `plan.md`, `contracts/`, `quickstart.md`,
**`ENGINEERING-STANDARDS.md`**

**MANDATORY: read `ENGINEERING-STANDARDS.md` in full before starting any task below.** It is not
optional background reading — it defines the exact code-structure limits, error/response
conventions, security rules, migration conventions, exact test commands, and (critically) the four
**Definition of Done** templates (`DoD-A`/`DoD-B`/`DoD-C`/`DoD-D`) that every task below references
by name instead of repeating in full. A task is not complete when its own "Verify" command block
passes — it is complete when the DoD template(s) it references are satisfied in full, including
the manual-verification step from that document's §7. Reporting a task done without having read
and applied that document is not acceptable under this initiative's own standard.

**Task numbering**: this feature restarts at **T001**, scoped to this feature directory — separate
from the cross-cutting `T00x` space used in `docs/reviews/` (which reached T312 as of this
initiative's AI-engineering work). Do not confuse the two numbering spaces.

**Status (updated 2026-09-13, independent review + fix pass):** Phase 1 (T001-T003) DONE, verified
by direct code re-read plus a real-test re-run. Phase 2: T005/T007/T009 DONE; **T008 DONE** (a
real gap — `refund()` had no caller and no DB-backed authorization anywhere — was found and fixed:
`refund-payment.ts`, 6 new passing tests); T010 PARTIALLY DONE (forged-signature, amount-tampering,
and duplicate-delivery rows now covered against the *real* provider, in
`apps/api/tests/integration/paymob-webhook-and-redirect.test.ts`; currency/wrong-user/wrong-product/
direct-bypass rows remain open — see T010's own section); T006 remains externally blocked. Phase 3:
**T011 DONE** — a real bug was found (the redirect route bypassed the `BillingEvent` audit gate
entirely) and fixed by extracting a shared `applyVerifiedPaymentEvent` function now used by both
the webhook and redirect routes, proven by a new regression test plus a real concurrent
webhook-vs-redirect race test (both passing); T012's full E2E matrix remains open. This document is
a plan; do not mark a task complete without the recorded gates and evidence below. Phase 4 update
(2026-09-13): T013 is resolved to Hostinger SMTP using the provisioned `ai-audit` mailbox; T014
SMTP mailer and T015 send-attempt persistence are implemented with mocked-transport unit coverage,
but migration application and real staging inbox verification remain open. T016-T017 are still
operational tasks requiring DNS/credential/inbox evidence.
implemented. Tasks marked **[DECISION]** are not code tasks — they are the point where an external
or product decision must be obtained before the code tasks that depend on them can start; they
have no Definition of Done because there is no code to hold to one.
Tasks marked **[BLOCKED]** cannot start at all until a named external dependency is resolved.
Tasks marked **[CONDITIONAL]** only exist if a named decision resolves in a specific direction.

Every task follows the same field template, per the planning brief's own requirement:
Objective / Why / Current state / Files / Dependencies / DB changes / API changes / Security
requirements / Testing requirements / Acceptance criteria / **Definition of Done** / Verification /
Rollback / Production considerations.

---

## Phase 1 — Architecture and Foundations

### T001 — Promote `PendingPayment.status` to a real enum

- **Objective**: replace the free-text `status` column with a Prisma enum
  (`PENDING | SUCCEEDED | FAILED | CANCELLED | EXPIRED`) and an atomic `updateMany`-gated
  transition helper.
- **Why**: `research.md` C.1's second decision — the current read-then-conditional-proceed pattern
  is safe only in the absence of a second concurrent completion path, which T011 (redirect
  fallback) is about to introduce.
- **Current state**: `PendingPayment.status String @default("PENDING")`, values `"PENDING"`/
  `"COMPLETED"` observed only in `webhooks.routes.ts`.
- **Files**: `apps/api/prisma/schema.prisma` (enum + column type change), new migration under
  `apps/api/prisma/migrations/`, `apps/api/src/services/billing/pending-payment.ts` (new — the
  atomic-transition helper, extracted so both the webhook path and the new redirect path in T011
  share one implementation), `apps/api/src/routes/webhooks.routes.ts` (update to use the new enum
  values and the new helper instead of the raw-SQL `UPDATE` currently inline).
- **Dependencies**: none.
- **DB changes**: additive enum type + column-type migration; backfill existing `"PENDING"`/
  `"COMPLETED"` string rows into the new enum's `PENDING`/`SUCCEEDED` values in the same migration
  (a one-time `UPDATE` in the migration SQL, not application code).
- **API changes**: none (internal state only; not exposed on any existing response shape yet —
  T009's admin endpoint is the first consumer).
- **Security requirements**: the atomic transition helper must use `updateMany` with a `WHERE
  status = 'PENDING'` guard, never a plain `update`, so two racing writers cannot both "win."
- **Testing requirements**: unit test proving a second transition attempt after the first succeeds
  is a no-op (0 rows affected); unit test proving the existing webhook flow's behavior is
  unchanged for the success path.
- **Acceptance criteria**: existing webhook tests pass unmodified in outcome (their assertions may
  need updating for the new enum values' spelling, not their behavior); the new atomic helper is
  the only writer of `PendingPayment.status` anywhere in the codebase.
- **Definition of Done**: `DoD-B` (migration) **and** `DoD-A` (the new helper module and the
  `webhooks.routes.ts` change) — both apply, satisfy both in full. Manual step (§7 "Payments"
  step 5, adapted): after migrating, open Prisma Studio and confirm the two existing
  `"PENDING"`/`"COMPLETED"` string values, if any exist in your local dev DB, actually landed as
  `PENDING`/`SUCCEEDED` in the new enum column — don't just trust the migration ran without error.
- **Verification**: `pnpm exec vitest run --project unit apps/api --no-file-parallelism`;
  `pnpm --filter @webaudit/api exec prisma migrate dev --name pending_payment_status_enum`.
- **Rollback**: standard migration revert; the enum's value set matches the prior string values
  exactly for the two rows that exist today, so no data loss on rollback.
- **Production considerations**: run during a low-traffic window given it touches every in-flight
  `PendingPayment` row (there should be very few, since none exist yet in production — this is
  low-risk specifically because real payments don't exist yet).

### T002 — Build a real checkout concurrency lock

- **Objective**: a Redis-backed lock (`checkout:{userId}`, short TTL) preventing two concurrent
  checkout-initiation requests from the same user from both proceeding.
- **Why**: `research.md` B.3 item 1 — EduFlow documents this control but never builds it; this
  product has the identical gap today and must not repeat the omission.
- **Current state**: no lock of any kind exists; `checkout.service.ts` has no concurrency guard.
- **Files**: `apps/api/src/services/billing/checkout-lock.ts` (new), `checkout.service.ts`
  (modified: acquire before creating a `PendingPayment`, release on any terminal outcome of the
  initiation call itself).
- **Dependencies**: none.
- **DB changes**: none (Redis-only state, matching this repo's existing convention that
  Redis holds queue/cache/lock state, never a system of record).
- **API changes**: `POST /billing/subscribe` and `POST /billing/credits/purchase` gain a new
  possible response: `409 { error: { code: 'CHECKOUT_IN_PROGRESS' } }`.
- **Security requirements**: lock key must be scoped per-user (not global), TTL must be short
  enough that a crashed request cannot permanently lock a user out of ever checking out again
  (recommend: a few seconds past the expected P99 of the three-Paymob-call sequence).
- **Testing requirements**: adverse test firing two concurrent checkout-initiation requests for
  the same user, asserting exactly one proceeds and the other receives `409`.
- **Acceptance criteria**: the specific TOCTOU window `research.md` B.3 item 1 describes is closed
  and proven closed by a real concurrent test, not just reasoned about.
- **Definition of Done**: `DoD-A`, in full. Manual step: follow §7 "Payments" step 3 exactly — two
  terminal windows, two near-simultaneous real HTTP requests against your locally running API, and
  confirm with your own eyes that exactly one succeeds and the other gets `409` — the automated
  test proves this too, but this initiative requires both, not one standing in for the other.
- **Verification**: `pnpm exec vitest run --project adverse apps/api --no-file-parallelism`.
- **Rollback**: removing the lock acquisition call reverts to today's (unsafe but currently
  low-risk, since no real payments exist yet) behavior; trivial.
- **Production considerations**: none beyond standard Redis-dependency handling already present
  elsewhere in this codebase (`redisConnection`'s existing fail-loud-if-unconfigured pattern).

### T003 — Build the payment-abandonment expiry sweep

- **Objective**: a repeatable job (same shape as `sweepTimedOutScans`) that transitions
  long-`PENDING` `PendingPayment` rows to `EXPIRED`.
- **Why**: FR-P07; without it, an abandoned checkout has no terminal state and the "which state is
  a customer's payment in" question (FR-P09) can never be fully answered.
- **Current state**: no sweep exists; nothing ever resolves a stuck `PENDING` row today.
- **Files**: `apps/api/src/services/billing/payment-expiry-sweep.ts` (new, mirrors
  `apps/worker/src/orchestrator/timeout.ts`'s shape), `apps/worker/src/orchestrator/
  payment-expiry-scheduler.ts` (new, mirrors `timeout-scheduler.ts`), wiring into
  `apps/worker/src/index.ts`'s existing repeatable-job registration block.
- **Dependencies**: T001 (needs the `EXPIRED` enum value).
- **DB changes**: none beyond T001's.
- **API changes**: none.
- **Security requirements**: none beyond using the same atomic transition helper as T001 (idempotent,
  race-safe against a webhook completing the same row concurrently — the sweep's `updateMany`
  guard on `status = 'PENDING'` means a payment that completes in the race window is simply not
  affected, matching `timeout.ts`'s own "a scan that completed in the meantime loses nothing"
  precedent exactly).
- **Testing requirements**: unit test for the sweep's query boundary (correctly selects only
  `PENDING` rows past the configured window); adverse test proving a payment that completes
  concurrently with the sweep's read is not incorrectly expired.
- **Acceptance criteria**: a `PendingPayment` abandoned past the configured window reaches
  `EXPIRED` on the next sweep tick and never earlier.
- **Definition of Done**: `DoD-C`, in full — this is a scheduled job, held to the same bar as
  `timeout.ts`'s own precedent (idempotent re-run, concurrent-mutation-safe, proven by adverse
  test, not asserted). Manual step: per §7 "Payments" step 4 — create a real `PendingPayment` row
  locally, temporarily lower the sweep's window via its env var, trigger it, and watch it actually
  flip to `EXPIRED` in Prisma Studio.
- **Verification**: `pnpm exec vitest run --project unit apps/worker --no-file-parallelism`.
- **Rollback**: unschedule the repeatable job; `PendingPayment` rows simply stop being swept
  (reverts to today's behavior).
- **Production considerations**: default abandonment window recommendation: 60 minutes (generous
  relative to Paymob's own iframe-token expiry of ~1 hour observed in `research.md`'s EduFlow
  audit) — confirm against the real Paymob integration's actual token TTL once T005/T006 land.

### T004 — [DECISION] Confirm whether a connection pooler is launch-blocking

- **Objective**: obtain a real expected-concurrent-user projection from the business and resolve
  `plan.md`'s conditional recommendation on T295 (connection pooler) into a firm yes/no for this
  launch.
- **Why**: this planning pass cannot forecast real user counts; the existing code is explicitly
  sized for ~1,000 users without one, which may or may not be adequate for the actual launch.
- **Current state**: no pooler configured (`apps/api/src/db/client.ts`'s own comment already notes
  one is "planned but not yet installed").
- **Dependencies**: none — this is the first task that should be resolved, since it gates whether
  any Phase-12 pooler task is scheduled before or after launch.
- **Acceptance criteria**: a written decision (pooler before launch: yes/no, and if yes, which —
  PgBouncer is the natural default given Postgres) exists before Phase 16 (production rollout)
  begins.
- **Definition of Done**: not applicable — decision task, no code.
- **Production considerations**: if "yes," this becomes a real T046-equivalent task scheduled into
  Phase 1/12; if "no," it is explicitly deferred with the reasoning recorded in this document's
  revision history, not silently dropped.

---

## Phase 2 — Paymob Payment Integration **[BLOCKED — see T006]**

### T005 — Build `paymob-hmac.ts`, isolated and independently testable

- **Objective**: implement Paymob's real documented HMAC verification (SHA-512 over Paymob's
  fixed field-concatenation order, timing-safe compare, malformed-format short-circuit) as its own
  small module, mirroring EduFlow's `hmac.ts` shape but written fresh against Paymob's public
  documentation (not copied — EduFlow's version is the proof this approach works, not the source).
- **Why**: `research.md` B.2 item 3 and B.3 item 2 — this must be a real, independently-tested
  module so a future security test can import and exercise the *actual* verifier, closing the
  exact gap EduFlow's own `webhook-hmac.test.ts` fell into (testing a fictional stand-in instead).
- **Current state**: does not exist. Nothing in this codebase implements Paymob's specific HMAC
  scheme (the existing generic `webhooks.routes.ts` HMAC is a simple raw-body SHA-256, which is
  the right shape for the *generic* provider path but not Paymob's actual documented scheme).
- **Files**: `apps/api/src/services/billing/paymob-hmac.ts` (new), `apps/api/tests/unit/
  paymob-hmac.test.ts` (new).
- **Dependencies**: none (does not require real Paymob credentials to build or test — the
  algorithm is public documentation, testable with synthetic fixtures).
- **DB changes**: none. **API changes**: none (internal module).
- **Security requirements**: MUST reject malformed-format signatures before the timing-safe
  compare (matching EduFlow's own precedent, avoiding a length/format-driven timing signal);
  MUST use `crypto.timingSafeEqual`, never `===`, for the final comparison — per
  `ENGINEERING-STANDARDS.md` §3, verbatim.
- **Testing requirements**: a real test importing this exact module (not a local re-implementation
  — this is the explicit, binding acceptance criterion below) with known-good and known-tampered
  fixture payloads (constructed from Paymob's public field-order documentation, not from a real
  secret).
- **Acceptance criteria**: the test file for T010 (adversarial HMAC suite) imports this module by
  name; a code-review check confirms no test anywhere defines its own parallel HMAC
  implementation to test against — this is the direct, binding lesson from `research.md` B.3
  item 2, and violating it is a task failure regardless of whether the test file passes.
- **Definition of Done**: `DoD-A`, in full, **plus** the explicit "prove the test tests the real
  thing" step from `ENGINEERING-STANDARDS.md` §3: temporarily swap the real compare for a
  deliberately-broken one, confirm the test goes red, revert, confirm green — report having done
  this, not just that the test passes.
- **Verification**: `pnpm exec vitest run --project unit apps/api/tests/unit/paymob-hmac.test.ts --no-file-parallelism`.
- **Rollback**: delete the file; nothing depends on it yet until T007.
- **Production considerations**: none — no credentials needed for this task.

### T006 — [BLOCKED] Obtain real Paymob merchant credentials / sandbox access

- **Objective**: the external dependency every other Phase-2/3 code task needs to be exercised for
  real (though T005, T007's structure, and T008-T010's test-writing can all proceed against
  synthetic fixtures without it).
- **Why**: unchanged from the existing master plan's T267 — real payment processing requires a
  real merchant account.
- **Blocked on**: Paymob merchant onboarding (business-side action, not an engineering task).
- **Acceptance criteria**: a sandbox (or production) `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`,
  `PAYMOB_INTEGRATION_ID` exist in a secret store, never committed to source.
- **Definition of Done**: not applicable — external/business task, no code.
- **Production considerations**: until this resolves, every payment code task in this phase can be
  built and unit/adverse-tested against synthetic fixtures (matching this repo's own
  fixture-provider convention for the AI executor) but cannot be exercised end-to-end against the
  real Paymob API — that exercise is Phase 15 (staging validation), explicitly gated on this task.

### T007 — Build `PaymobPaymentProvider.initCheckout`

- **Objective**: implement the auth-token exchange → order creation → payment-key generation
  sequence against Paymob's real API, satisfying `PaymentProvider.initCheckout`.
- **Why**: FR-P01/FR-P02 — this is the actual missing capability (T267).
- **Current state**: does not exist; only the interface (`payment-provider.ts`) and the stub
  (`stub-payment-provider.ts`) exist.
- **Files**: `apps/api/src/services/billing/paymob-payment-provider.ts` (new).
- **Dependencies**: T006 (to exercise for real); can be written and unit-tested against a mocked
  `fetch` before T006 resolves.
- **DB changes**: none (this function returns data; the caller, `checkout.service.ts`, already
  persists `PendingPayment`).
- **API changes**: none (behind the existing seam).
- **Security requirements**: FR-P02 — construction MUST throw immediately if
  `PAYMOB_API_KEY`/`PAYMOB_HMAC_SECRET`/`PAYMOB_INTEGRATION_ID` are absent, matching this repo's
  established fail-closed convention (`apps/api/src/config/env.ts`, `pricing.ts`); every Paymob
  HTTP call MUST have an explicit timeout (recommend matching EduFlow's proven 10s) and a typed
  error outcome (auth-failed/rate-limited/server-error/timeout), never an unhandled throw reaching
  the caller as an opaque 500.
- **Testing requirements**: unit tests mocking each of the three Paymob calls, asserting the
  correct request shape (amount in the correct unit — confirm Paymob's actual expected unit,
  piasters-equivalent, against this system's integer-micros convention and convert explicitly,
  documented inline) and correct typed-error mapping for 401/429/5xx/timeout responses.
- **Acceptance criteria**: `initCheckout` returns `{ checkoutUrl, providerReference }` satisfying
  the existing interface with zero change to any caller.
- **Definition of Done**: `DoD-A`, in full — pay particular attention to the "fails closed at
  construction" bullet, since this is the exact property EduFlow's own code got right and this
  task must too. No manual step beyond the local mocked-`fetch` test run is possible until T006
  resolves; note this explicitly in your report rather than skipping verification silently.
- **Verification**: `pnpm exec vitest run --project unit apps/api --no-file-parallelism`.
- **Rollback**: the file is additive; removing it and its wiring (T009) reverts to the stub
  provider being used everywhere, exactly as today.
- **Production considerations**: log every call's outcome (status, latency, no secret material)
  for the monitoring dashboards in Phase 7.

### T008 — Build `PaymobPaymentProvider.verifyWebhook` and `.refund` — **DONE** (2026-09-13, review pass)

- **Status:** `verifyWebhook` and `refund` were both already implemented in
  `paymob-payment-provider.ts`. The independent review that landed this status found the real gap
  the earlier status report flagged ("database-backed refund authorization is missing") was
  literal: `provider.refund()` had **zero callers anywhere in the codebase** (confirmed by a
  repo-wide grep), so nothing ever checked that a refund request corresponded to a payment this
  system actually recorded as `SUCCEEDED` before calling Paymob. Fixed by adding
  `apps/api/src/services/billing/refund-payment.ts` (`refundPayment`,
  `RefundNotAuthorizedError`): looks up the `PendingPayment` by `providerReference`, refuses unless
  `status === SUCCEEDED`, refuses if the requested amount exceeds what was actually charged, and
  only then calls `provider.refund(...)`. Deliberately does **not** wire an admin HTTP endpoint or
  decide the credit-clawback question (see the module's own note) — that remains explicitly
  deferred, not silently assumed. New test: `apps/api/tests/unit/refund-payment.test.ts` (6 tests,
  all passing — authorized refund, refused for PENDING/FAILED status, refused for no matching
  payment, refused for over-amount, refused for non-positive amount before touching the DB).
- **Objective**: real webhook verification (using T005's `paymob-hmac.ts`) mapping Paymob's event
  shape into this system's `PaymentEvent`, and a real refund call.
- **Why**: FR-P04, FR-P08.
- **Files**: same file as T007 (`paymob-payment-provider.ts`).
- **Dependencies**: T005, T006 (for real exercise), T007.
- **Security requirements**: FR-P04 — a webhook that fails HMAC verification MUST return
  `{ valid: false, events: [] }`, never a partially-parsed event; currency validation (the gap
  flagged in `research.md` A.1) MUST be added here explicitly if Paymob settlement is confirmed
  multi-currency-capable for this account (confirm per `research.md` Part D item 3 before
  finalizing this task's scope).
- **Testing requirements**: reuses T010's adversarial suite; additionally, unit tests for the
  event-shape mapping (Paymob's raw webhook fields → this system's `PaymentEvent`).
- **Acceptance criteria**: `verifyWebhook` satisfies the existing interface with zero change to
  `webhooks.routes.ts`; `refund` only ever acts on a `PendingPayment`/`BillingEvent` this system
  already recorded as succeeded.
- **Definition of Done**: `DoD-A`, in full, same emphasis as T007.
- **Verification/Rollback/Production considerations**: as T007.

### T009 — Wire the Paymob provider into environment-based configuration

- **Objective**: an `AI_CHAIN`-style `from-env.ts` equivalent for payments — construct
  `PaymobPaymentProvider` from env vars when configured, falling back to the stub otherwise,
  matching this repo's existing pattern exactly (`packages/ai-executor/src/from-env.ts`).
- **Files**: `apps/api/src/services/billing/from-env.ts` (new, or extend wherever the API
  currently constructs its `PaymentProvider` instance — confirm the real current wiring location
  before assuming a new file is needed).
- **Dependencies**: T007, T008.
- **Acceptance criteria**: setting the Paymob env vars in a real (non-test) environment causes the
  real provider to be used; their absence causes the stub to be used in dev/test exactly as today,
  with no behavior change to existing tests.
- **Definition of Done**: `DoD-A`. Manual step: with the Paymob env vars deliberately left unset in
  your local `.env`, start the API and confirm it boots using the stub provider exactly as today
  (no behavior change) — this is the one part of this task you can fully manually verify before
  T006 resolves.
- **Verification**: full existing billing test suite passes unmodified.

### T010 — Adversarial HMAC and webhook-security test suite for the real Paymob provider — **PARTIALLY DONE** (2026-09-13, review pass)

- **Status:** the originally-planned dedicated file (`apps/api/tests/adverse/
  paymob-webhook-security.test.ts`) was not created; instead, the equivalent coverage landed in
  `apps/api/tests/integration/paymob-webhook-and-redirect.test.ts` (created during the same review
  pass, alongside the T011 bug fix below — the two were built together because the race/regression
  test needed the same real-provider signing harness this matrix needed). **Confirmed covered**,
  against the real `paymob-payment-provider.ts`/`paymob-hmac.ts` (not a stand-in — verified by
  reading the test file directly): forged/tampered signature rejection (matrix row 12), duplicate
  webhook delivery idempotency (row 13), amount-tampering rejection via a *validly-signed* payload
  for a wrong amount (row 14). **Still open, not yet covered**: currency-mismatch (row 15 — this
  system has no currency field on `PendingPayment`/`PaymentEvent` at all yet, see `research.md`
  A.1's flagged gap; needs that gap resolved first), wrong-user/wrong-product rejection (rows
  16-17 — `eventMatchesPending` already checks these generically and is exercised by the existing
  generic-path tests, but not yet with a *real, validly-signed Paymob payload* specifically),
  duplicate-`PendingPayment`-for-same-intent (row 18), and direct-bypass-attempt (row 19). A future
  session should extend the existing `paymob-webhook-and-redirect.test.ts` file with these
  remaining rows rather than starting a second, separate file.
- **Objective**: implement every row of `quickstart.md`'s payment security matrix (rows 12-19)
  against the real `paymob-payment-provider.ts` and `paymob-hmac.ts`.
- **Why**: FR-P04/FR-P06's binding requirement, and the explicit EduFlow lesson (must import the
  real verifier, never a stand-in).
- **Files**: `apps/api/tests/adverse/paymob-webhook-security.test.ts` (new).
- **Dependencies**: T005, T007, T008.
- **Acceptance criteria**: every matrix row 12-19 has a corresponding passing test; a code
  reviewer can confirm each test imports `paymob-hmac.ts`/`paymob-payment-provider.ts` directly.
- **Definition of Done**: `DoD-A`. This task's entire purpose is the "prove the test proves it"
  discipline in `ENGINEERING-STANDARDS.md` §3 — for at least the HMAC-forgery and duplicate-webhook
  rows, actually break the real code, confirm red, revert, confirm green, and say so in your
  report.
- **Verification**: `pnpm exec vitest run --project adverse apps/api/tests/adverse/paymob-webhook-security.test.ts --no-file-parallelism`.

---

## Phase 3 — Payment → Billing → Credits Fulfillment

### T011 — Build the redirect-completion fallback (`GET /billing/payment-return`) — **DONE** (2026-09-13, review pass — one real bug found and fixed)

- **Status:** the route existed and correctly reused `applyProviderPaymentEvent` for HMAC
  verification and effect application — **but that shared function was never wrapped in the
  `BillingEvent` idempotency gate that `webhooks.routes.ts`'s POST route applied around it**. A
  payment completed *only* through this redirect fallback (the exact scenario T011 exists to
  handle — the webhook never arrives) landed no `BillingEvent` audit row at all, breaking
  reconciliation (FR-P09) for exactly that case. Concretely: `payment-return.routes.ts` called
  `applyProviderPaymentEvent` directly; `webhooks.routes.ts`'s POST route called
  `createOrRetryBillingEvent` → `applyProviderPaymentEvent` → `billingEvent.update({appliedAt})`
  around it, and the redirect route skipped all three of the surrounding steps. **Fixed** by
  extracting the whole sequence into one new shared function,
  `apps/api/src/services/billing/apply-payment-event.ts`'s `applyVerifiedPaymentEvent`, and
  updating both routes to call it instead of duplicating the sequence. Real double-application of
  the underlying *credit grant* was never actually possible even with the old bug (the deeper
  `CreditTransaction.billingEventId` uniqueness in `grant.ts` already caught that), but the missing
  audit trail was real. Also added error handling around the redirect route's call (previously an
  unhandled throw would have hit Express's default handler as an unstructured error, violating
  `ENGINEERING-STANDARDS.md` §2's structured-error requirement).
- **New coverage added and passing** (`apps/api/tests/integration/
  paymob-webhook-and-redirect.test.ts`, 5/5 passing): a regression test proving a redirect-only
  completion now creates a real `BillingEvent` row (the exact bug above, proven fixed — this test
  would have failed against the old code); a real concurrency test firing the POST webhook and the
  GET redirect simultaneously (`Promise.all`) for the same transaction, proving the grant applies
  exactly once regardless of which path wins the race — this is the DB race/manual proof this
  task's Definition of Done required and the earlier status report flagged as pending.
- **Objective**: independently verify Paymob's signed browser-return querystring and, if valid,
  invoke the same webhook-application logic the POST webhook uses.
- **Why**: `plan.md`'s dual-path decision, informed by `research.md` B.2 item 4.
- **Files**: `apps/api/src/routes/billing.routes.ts` (new route) or a new
  `payment-return.routes.ts` if `billing.routes.ts` is already near its size cap (check first,
  matching this repo's established size-cap-driven-splitting convention — see
  `ENGINEERING-STANDARDS.md` §1).
- **Dependencies**: T001 (enum), T007-T009 (real provider), extraction of `webhooks.routes.ts`'s
  `applyProviderPaymentEvent` into a function both the POST webhook and this new GET route can
  call (a small refactor of the existing file, not a rewrite).
- **DB changes**: none beyond T001's.
- **API changes**: new route, **NEW** per `contracts/api-endpoints.md`.
- **Security requirements**: MUST use the exact same HMAC verification as the POST webhook
  (`paymob-hmac.ts`) reconstructed from the querystring's fields — never a weaker check "because
  it's just a redirect."
- **Testing requirements**: adverse test proving (a) a validly-signed redirect alone completes a
  payment when the POST webhook is never simulated, (b) an invalidly-signed redirect does nothing,
  (c) both the POST and this GET route racing for the same payment results in exactly one
  application of the effect (reuses T001's atomic guard).
- **Acceptance criteria**: quickstart.md matrix row 22 passes.
- **Definition of Done**: `DoD-A`, in full. Manual step: per §7 "Payments" step 5, but drive it
  through this new redirect route instead of the POST webhook — construct a validly-signed
  redirect querystring by hand (or a small script) and confirm hitting it completes a payment with
  no POST webhook ever having been sent.
- **Verification**: `pnpm exec vitest run --project adverse apps/api --no-file-parallelism`.
- **Rollback**: remove the route; the POST webhook remains fully sufficient on its own (this is a
  resilience addition, not a required dependency for basic function).

### T012 — Full payment E2E integration test suite

- **Objective**: implement `quickstart.md`'s matrix rows 1-11, 20-21 end-to-end against the real
  provider (using T006's sandbox credentials once available) or a high-fidelity mock if T006 is
  still pending.
- **Files**: `apps/api/tests/integration/paymob-checkout-flow.test.ts` (new).
- **Dependencies**: T001-T003, T007-T011.
- **Acceptance criteria**: every matrix row has a corresponding passing test.
- **Definition of Done**: `DoD-A`.
- **Verification**: `pnpm exec vitest run --project unit apps/api/tests/integration/paymob-checkout-flow.test.ts --no-file-parallelism`.

---

## Phase 4 — Email Transport Decision + Rollout

### T013 — [DECISION] Resolve the email transport choice

- **Objective**: obtain a real decision between Resend (finish the existing rollout) and Hostinger
  SMTP (build new), per `research.md` C.1's three options.
- **Why**: this planning pass explicitly declines to make this business decision silently.
- **Dependencies**: none — this gates T014-T018.
- **Acceptance criteria**: a written decision exists, naming the chosen option and, if SMTP or
  hybrid, confirming the operator's intent to use the specific Hostinger mailbox given at the
  start of this planning pass for production sending.
- **Definition of Done**: not applicable — decision task, no code.

### T014 — [CONDITIONAL: SMTP chosen] Build `smtp-mailer.ts`

- **Objective**: a `nodemailer`-based `Mailer` implementation targeting the Hostinger mailbox.
- **Files**: `apps/api/src/services/email/smtp-mailer.ts` (new).
- **Dependencies**: T013 (must resolve to SMTP or hybrid).
- **DB changes**: add `EmailSendAttempt` (state-machines.md §4) only under this path.
- **Security requirements**: TLS required (port 465 implies implicit TLS — verify `secure: true`
  is set **explicitly**, not derived incorrectly from a port-number check the way EduFlow's own
  code was observed doing (`research.md` B §10) — set it as a literal, explicit option).
- **Testing requirements**: unit tests against a local SMTP test double (e.g., a fake SMTP server
  in-process, or mocking `nodemailer`'s transport) — never a real send in automated tests.
- **Acceptance criteria**: satisfies `Mailer` with zero change to any calling code.
- **Definition of Done**: `DoD-A`, in full.
- **Verification**: `pnpm exec vitest run --project unit apps/api --no-file-parallelism`.
- **Rollback**: unset the SMTP env vars; the system falls back to whichever transport `from-env`
  wiring defaults to (mirror the AI-executor's own fallback-chain convention for this decision).

### T015 — [CONDITIONAL: SMTP chosen] Build `EmailSendAttempt` logging

- **Objective**: compensate for Hostinger's lack of a delivery/bounce dashboard (unlike Resend).
- **Files**: schema addition + `smtp-mailer.ts` wiring.
- **Dependencies**: T014.
- **Acceptance criteria**: every send attempt (success/failure, provider error if any) is queryable
  by an operator.
- **Definition of Done**: `DoD-B` (the schema addition) and `DoD-A` (the wiring), both in full.

### T016 — Complete the Resend production rollout (if T013 selects Resend or hybrid)

- **Objective**: the operational checklist already written in `PRODUCTION-READINESS-MASTER-PLAN.md`
  Phase 5 — real `RESEND_API_KEY`, verified sending domain, staging test, smoke test.
- **Dependencies**: T013.
- **Definition of Done**: not applicable — this is an operational/ops task (obtaining credentials,
  verifying DNS records), not a code task; its completion bar is the checklist itself, already
  written in that document.
- **Production considerations**: this is largely an ops task, not a code task — the code
  (`resend-mailer.ts`) is already DONE per that document.

### T017 — Auth email staging verification (whichever transport was chosen)

- **Objective**: `quickstart.md`'s email E2E matrix rows 1-6, run for real in staging.
- **Dependencies**: T013 and whichever of T014/T016 applies.
- **Acceptance criteria**: a real verification email and a real reset email are received at a real
  staging inbox, links work, single-use/expiry/enumeration protections hold under the real
  transport (they are already proven at the logic level — this task proves the transport doesn't
  break them).
- **Definition of Done**: not applicable as a DoD template (no new code) — the acceptance criteria
  above **are** the definition of done for this task; follow `ENGINEERING-STANDARDS.md` §7
  "Email" steps 1-2 exactly and report the real inbox result, not an assumption that it worked.

---

## Phase 6 — Payment/Customer Emails

### T018 — Add `sendPaymentConfirmation` to the `Mailer` interface and both implementations

- **Objective**: FR-P (payment emails); wire a confirmation email into the applied-effect branch.
- **Files**: `apps/api/src/services/email/mailer.ts` (interface), `resend-mailer.ts` and/or
  `smtp-mailer.ts` (implementation), `webhooks.routes.ts` (call site, in
  `applyProviderPaymentEvent`'s success branch, after the receipt is created).
- **Dependencies**: T013 (transport decided), T011 (redirect path also needs to trigger this — the
  shared applied-effect function from T011's refactor is the single call site both paths use).
- **Security requirements**: FR-E03 — a send failure here MUST NOT roll back the credit grant or
  receipt already committed; log loudly, never silently (the explicit, deliberate opposite of
  EduFlow's silent-catch pattern, `research.md` B.3/§8).
- **Testing requirements**: test proving a webhook retry (already-applied `BillingEvent`) does
  **not** re-send the confirmation email — the send must live inside the "newly applied" branch,
  not the "acknowledge duplicate" branch.
- **Acceptance criteria**: quickstart.md email matrix row 7 and 11 pass.
- **Definition of Done**: `DoD-A`, in full. Manual step: per `ENGINEERING-STANDARDS.md` §7
  "Email" step 3 — drive a real (stub-provider-backed) webhook POST twice and confirm, by watching
  the console mailer's log line (or a real inbox if a real transport is already wired), that
  exactly one confirmation email fires, not two.
- **Verification**: `pnpm exec vitest run --project unit apps/api --no-file-parallelism`.

### T019 — [DECISION] Confirm whether a payment-failure notification email is in scope

- **Objective**: resolve `plan.md`'s stated default ("success only unless product input says
  otherwise").
- **Acceptance criteria**: a written decision; if "yes," a follow-up task (`sendPaymentFailed`,
  mirroring T018's shape) is added to this document before implementation proceeds.
- **Definition of Done**: not applicable — decision task, no code.

---

## Phase 7 — Monitoring and Observability

### T020 — Integrate an APM/error-tracking SDK into `apps/api`

- **Objective**: FR-M01. Default recommendation: Sentry (per `plan.md`'s reasoning) — confirm or
  override before starting.
- **Files**: `apps/api/src/index.ts` (init at boot), new `apps/api/src/config/monitoring.ts`.
- **Dependencies**: none.
- **Security requirements**: ensure the SDK's own request-capture does not defeat this repo's
  existing redaction discipline (`packages/config/src/logger.ts`) — configure any request/error
  scrubbing the SDK offers to match, and confirm no credential/PII leaks through unredacted SDK
  breadcrumbs (test this explicitly, do not assume the SDK's defaults are sufficient).
- **Testing requirements**: a forced synthetic error in a test/staging environment is confirmed to
  appear in the tracker.
- **Acceptance criteria**: FR-M01 satisfied; **Monitoring Gate**'s first checkbox passes.
- **Definition of Done**: `DoD-A`, in full. Manual step, mandatory (this cannot be meaningfully
  automated-test-only): per `ENGINEERING-STANDARDS.md` §7 "Monitoring / APM" step 1 — add a
  temporary scratch route that throws, hit it, confirm the error shows up in the real dashboard,
  then remove the scratch route. Report the dashboard event you actually saw.
- **Verification**: package-level typecheck/lint/test pass; no automated command substitutes for
  the manual dashboard check above.

### T021 — Integrate the same SDK into `apps/worker`

- Same shape, requirements, and Definition of Done as T020, applied to the worker's own entrypoint
  (`apps/worker/src/index.ts`). Do not skip the manual dashboard check on the grounds that T020
  already proved the SDK works — the worker is a separate process with its own init.

### T022 — Build a worker liveness heartbeat check

- **Objective**: FR-M02 for the worker specifically (`contracts/api-endpoints.md`'s recommended
  option (b) — no new HTTP listener, a heartbeat job + external staleness check instead).
- **Files**: a new lightweight repeatable job (worker side) writing a heartbeat timestamp
  (Redis or Postgres — Redis is the natural fit, matching this system's existing use of Redis for
  ephemeral operational state) + a monitoring check (external, e.g. the APM's own
  scheduled-check/cron-monitor feature if it has one, or a small external check) that alerts if
  the heartbeat goes stale.
- **Dependencies**: T020/T021 (the alert needs a destination).
- **Acceptance criteria**: killing the worker process in staging produces an alert within the
  configured staleness window.
- **Definition of Done**: `DoD-C`. Manual step, mandatory: per `ENGINEERING-STANDARDS.md` §7
  "Monitoring / APM" step 2 — actually kill your local worker process mid-scan and watch the
  staleness alert fire; do not consider this task done on code review alone.

### T023 — Wire alert rules for FR-M03's full list

- **Objective**: configure alert conditions for every metric in `plan.md`'s monitoring table.
- **Dependencies**: T020-T022, and the metrics' underlying data existing (most already do:
  `AiInvocation`, existing lockout/attempt tracking, BullMQ's own `failed` events).
- **Acceptance criteria**: **Monitoring Gate**'s "alerts live" checkbox passes; at least one alert
  (recommend: the cost-runaway one, since Phase 8 builds its trigger condition anyway) is tested
  end-to-end with a forced synthetic breach.
- **Definition of Done**: `DoD-A` (this is configuration-as-code where applicable; treat it with
  the same rigor). At least one alert (per the acceptance criteria) must be manually,
  end-to-end fired and observed — not merely configured and assumed correct.

### T024 — Build the 8 monitoring dashboards

- **Objective**: `plan.md`'s dashboard list, built in whatever tool the chosen APM/monitoring
  stack provides natively (avoid building a bespoke dashboard framework — reuse the SDK's own
  dashboarding if it has one, matching this repo's stated preference for managed tooling).
- **Dependencies**: T020-T023, Phase 8/9's data existing for the AI-cost/queue dashboards
  specifically.
- **Definition of Done**: no code-quality DoD applies (this is largely third-party-tool
  configuration) — but every dashboard must be manually opened and confirmed to show real,
  non-empty data before this task is reported done; a dashboard panel showing "no data" is not a
  completed dashboard.

### T025 — Confirm/build `apps/sandbox-runner` and `apps/probe-pool` health signals

- **Objective**: close the "NOT VERIFIED"/"MISSING" findings in `research.md` A.5.
- **Acceptance criteria**: `sandbox-runner`'s existing HTTP host is confirmed to have (or gains) a
  real `/health`-equivalent; `probe-pool`'s lack of any entrypoint is either resolved here or
  explicitly deferred to Phase 11 (it overlaps with T304's cross-process-transport work — do not
  duplicate that task, cross-reference it).
- **Definition of Done**: `DoD-A` for any code added. Manual step: `curl` the real endpoint against
  a locally running `sandbox-runner` instance and paste/report the real response, not an assumed
  one.

---

## Phase 8 — AI Cost-Runaway Protection

### T026 — Add `CostAlertThreshold` and `CostAlertEvent` models

- **Files**: `apps/api/prisma/schema.prisma`, new migration.
- **Dependencies**: none.
- **DB changes**: two new tables, per `data-model.md` §3.2-3.3.
- **Acceptance criteria**: migration applies cleanly; seed rows created for at least one
  `PER_USER` and one `GLOBAL` threshold (placeholder values, pending T027's real numbers).
- **Definition of Done**: `DoD-B`, in full. Manual step: `pnpm db:studio` and confirm the seed rows
  are actually visible with the expected placeholder values.

### T027 — [DECISION] Real threshold values

- **Objective**: obtain real `windowMinutes`/`thresholdMicros` numbers from product/finance.
- **Acceptance criteria**: a written decision recorded before T028 is considered launch-ready
  (the mechanism can be built and tested with placeholder values in the meantime).
- **Definition of Done**: not applicable — decision task, no code.

### T028 — Build the cost-alert computation job and admin endpoints

- **Objective**: FR-C01-C04; `GET /admin/cost-alerts`, `PATCH /admin/cost-alerts/thresholds`.
- **Files**: `apps/api/src/services/monitoring/cost-alerts.ts` (new), a repeatable job (same shape
  as T003/T022), `apps/api/src/routes/admin/cost-alerts.routes.ts` (new).
- **Dependencies**: T026.
- **Security requirements**: FR-C03 — the computation job MUST NOT write to any
  `CreditLot`/`CreditTransaction`/`CreditAllocation` table; a code-review check on this task's diff
  is itself an acceptance criterion.
- **Testing requirements**: unit test for FR-C04's windowing behavior (one large legitimate scan
  does not, alone, cross a global threshold sized for sustained-pattern detection — construct a
  concrete synthetic scenario proving this, not just an assertion in prose).
- **Acceptance criteria**: **Monitoring Gate**'s cost-alert test passes (quickstart.md scenario 2).
- **Definition of Done**: `DoD-A` (endpoints) **and** `DoD-C` (the computation job), both in full —
  the FR-C03 boundary check above is non-negotiable and must be explicitly confirmed, not assumed,
  in your final report (state which files you checked to confirm no credit-table write exists).
  Manual step: per `ENGINEERING-STANDARDS.md` §7 "Monitoring / APM" step 3, adapted — manually
  drive a test account's recorded `AiInvocation` spend past a locally-configured low threshold and
  confirm a `CostAlertEvent` row actually appears, exactly once, not on every subsequent check
  within the same window.
- **Verification**: package-level unit test suite for the new files.

---

## Phase 9 — Queue Backpressure

### T029 — Add queue-depth check and refusal to the scan-creation path

- **Files**: `apps/api/src/services/intake/create-scan.ts` (modified).
- **Dependencies**: none.
- **Security requirements**: FR-B02 — verify by test that the depth check and any refusal happens
  **after** priority is resolved, never in a way that a lower-tier request's presence in the queue
  changes a higher-tier request's admission decision.
- **Testing requirements**: quickstart.md monitoring scenario 3.
- **Acceptance criteria**: FR-B01/B02 satisfied.
- **Definition of Done**: `DoD-A`, in full. Manual step: per `ENGINEERING-STANDARDS.md` §7
  "Monitoring / APM" step 3 — script a real burst of scan-creation requests against your local
  stack until the configured limit is hit, confirm the real `QUEUE_AT_CAPACITY` response appears,
  and confirm a priority-tier request submitted mid-burst still lands ahead of already-queued
  free-tier requests.
- **Verification**: package-level adverse test suite for `create-scan.ts`.

### T030 — Add `queuePosition` to the scan-status response and build the UI

- **Files**: `apps/api/src/routes/scans.routes.ts` (extend), `apps/web/components/scan/
  ScanProgress.tsx` (extend, matching the design-system porting rules already in force for this
  repo's frontend work).
- **Dependencies**: T029.
- **Acceptance criteria**: FR-B03 satisfied; a queued (not yet running) scan shows a real position,
  not "Preparing" with no information.
- **Definition of Done**: `DoD-A` (the API extension) **and** `DoD-D` (the frontend change), both
  in full — `DoD-D` specifically requires actually opening the running `apps/web` app in a browser
  and watching a real queued scan show its real position, not just a component unit test passing
  in jsdom.

---

## Phase 10 — Data Archival

### T031 — Partition `AiInvocation`/`CapabilityExecution` by `createdAt`

- **Objective**: `data-model.md` §5.2 — a raw-SQL migration converting these tables to native
  Postgres partitioning (monthly).
- **Files**: a raw-SQL migration under `apps/api/prisma/migrations/`, explicitly flagged in its
  own migration comment as hand-written raw SQL (matching this repo's existing precedent for the
  credit-debit `FOR UPDATE` query being raw SQL for a similar "Prisma cannot express this" reason).
- **Security requirements**: FR-A02 — this task's diff MUST NOT touch `CreditTransaction`,
  `CreditAllocation`, `BillingEvent`, or `Receipt` in any way; this is a hard boundary, verified by
  a reviewer reading the migration file.
- **Testing requirements**: a test proving `margin.service.ts`'s existing reports still run
  correctly against a partitioned table (partitioning must be transparent to existing queries).
- **Acceptance criteria**: partitioning is in place with zero behavior change to any existing
  query.
- **Definition of Done**: `DoD-B`, in full, with special attention to its own explicit bullet about
  re-running `margin.service.ts`'s real reports and confirming identical results — do this as an
  actual manual query/API call against your local dev DB pre- and post-migration, not as an
  assumption that "nullable/structural changes are safe."
- **Verification**: package-level test suite plus a manual `margin.service.ts` report comparison.

### T032 — Build the detach-and-archive-to-R2 job

- **Objective**: `data-model.md` §5.2/§5.3 — detach old partitions past the retention window,
  export to R2 (reusing the existing object-storage integration), never delete outright.
- **Dependencies**: T031, and resolution of `research.md` Part D item 5 (any confirmed legal
  retention requirement) before a real retention window is finalized.
- **Acceptance criteria**: FR-A01/A03 satisfied; a dry-run mode exists and is used first in
  staging before any real detach runs in production.
- **Definition of Done**: `DoD-C`, in full. Manual step: run the job's dry-run mode against real
  local test data and manually confirm (Prisma Studio or a direct query) that only rows past the
  retention window would be touched, and that zero rows in any financial/audit table appear in the
  dry-run's report.

---

## Phase 11 — `probe-pool` / `sandbox-runner` Multi-Instance Readiness

### T033 — [DECISION] Confirm launch-blocking status from real concurrency projections

- Mirrors T004's shape, applied to T304/T305 instead of the connection pooler.
- **Definition of Done**: not applicable — decision task, no code.

### T034 — [CONDITIONAL] `probe-pool` cross-process transport + deploy entrypoint

- Unchanged in scope from the existing master plan's T304; only newly gated here on T033's
  decision rather than assumed mandatory.
- **Definition of Done**: `DoD-A`, in full, once unblocked.

### T035 — [CONDITIONAL] `sandbox-runner` multi-replica deployment proof

- Unchanged in scope from the existing master plan's T305; same gating as T034.
- **Definition of Done**: `DoD-A`, in full, once unblocked, plus a manual multi-instance run
  actually proving isolation/coordination works as designed — a design document alone does not
  satisfy this.

---

## Phase 12 — Infrastructure Scaling

### T036 — [CONDITIONAL on T004] Install and configure a connection pooler

- Unchanged in scope from the existing master plan's T295.
- **Definition of Done**: `DoD-A` for any application-side connection-string changes; manually
  confirm the API still connects and functions correctly through the pooler locally before calling
  this done.

### T037 — Read replica for reporting queries (deferred by default, per `plan.md`'s table)

- Not scheduled for this launch unless reporting-query load is measured as a real problem;
  recorded here so it is not forgotten, not so it is built by default.
- **Definition of Done**: not applicable while deferred.

### T038 — Isolated cache layer (deferred by default)

- Same framing as T037.
- **Definition of Done**: not applicable while deferred.

### T039 — [CONDITIONAL] Signed URLs + CDN for report/export downloads

- Gated on the business's expected report/export volume at launch (`plan.md`'s scaling table);
  unchanged in technical scope from the existing master plan's T298.
- **Definition of Done**: `DoD-A`, in full, once unblocked, plus manually downloading a real report
  through the new signed-URL path and confirming it no longer proxies through the API process.

---

## Phase 13 — Load Testing

### T040 — Build a multi-source-IP load-testing rig

- **Objective**: close T306's own honestly-flagged gap — prove the 20/40/60-concurrent tiers
  against real multi-source traffic, not single-machine-generated traffic.
- **Dependencies**: benefits from Phases 9 (backpressure) and 12 (scaling) being in place, but is
  not strictly blocked by them — it can also be used to *measure* whether they're needed.
- **Acceptance criteria**: **Load Gate** passes.
- **Definition of Done**: `DoD-A` for any new rig code; the manual step **is** the task —
  actually execute the load test against a real multi-source-IP setup and report real, measured
  numbers (requests/sec, error rate, latency percentiles under each tier), not a design for how
  one would theoretically run it.

---

## Phase 14 — Security Hardening

### T041 — Full adversarial test-matrix completion pass

- **Objective**: confirm every row across `quickstart.md`'s payment and email matrices has a real,
  passing, non-tautological test (re-applying the same "does this test actually exercise the real
  code" discipline this initiative's own T311/T309 work already established).
- **Dependencies**: Phases 2, 3, 4-6 complete.
- **Acceptance criteria**: **Security Gate** passes.
- **Definition of Done**: `DoD-A` across every test file touched. For a sample of at least three
  matrix rows spanning different mechanisms (e.g. one HMAC-forgery row, one idempotency row, one
  amount-tampering row), perform the explicit break-it/red/revert/green proof from
  `ENGINEERING-STANDARDS.md` §3 and report which three you chose and what you observed.

---

## Phase 15 — Staging Validation

### T042 — Sandbox Paymob end-to-end staging test

- **Dependencies**: T006 (sandbox credentials), T007-T012.
- **Acceptance criteria**: **Payment Gate** passes.
- **Definition of Done**: not a code DoD — this task's completion bar is the **Payment Gate**
  checklist in `plan.md` itself, executed for real with evidence (a real sandbox transaction id,
  a real webhook payload received and applied) attached to the report, not asserted from memory.

### T043 — Real-transport email staging test

- **Dependencies**: T013-T019.
- **Acceptance criteria**: **Email Gate** passes.
- **Definition of Done**: not a code DoD — same framing as T042, against the **Email Gate**
  checklist, with real received-email evidence attached.

---

## Phase 16 — Production Rollout

### T044 — Execute the full Launch Gate checklist

- **Dependencies**: every task above relevant to a gate that has not been explicitly deferred.
- **Acceptance criteria**: every checkbox in `plan.md`'s five Launch Gates is checked, with
  evidence linked (a passing test run, a screenshot of a real delivered email, a dashboard
  showing real data) — not asserted from memory.
- **Definition of Done**: the Launch Gates themselves are the definition of done for this task —
  do not mark it complete with any gate item unchecked or unevidenced.

---

## Phase 17 — Post-Launch Verification

### T045 — Production smoke checklist

- **Objective**: `quickstart.md`'s production smoke checklist, executed for real against
  production credentials, immediately after go-live.
- **Acceptance criteria**: one real payment, one real email of each type, one visible monitoring
  event — all confirmed working in production, not staging.
- **Definition of Done**: the smoke checklist itself, executed for real, with evidence, in
  production — the highest-stakes manual verification in this entire initiative; do not delegate
  this to an assumption that "staging passed, so production will too."

---

## Summary table

| Task range | Phase | Blocked/Conditional on |
| --- | --- | --- |
| T001-T004 | Foundations | T004 is a decision task |
| T005-T012 | Paymob | T005/T007/T009 implementation and focused unit checks completed; T008 lacks its DB-backed refund-authorisation gate; T010 remains open; T011 implementation is mounted but its DB race test is pending; T012 remains open; T006 blocks real-world exercise (not unit/adverse testing). |
| T013-T017 | Email transport | T013 is a decision task gating T014-T017 |
| T018-T019 | Payment emails | T019 is a decision task |
| T020-T025 | Monitoring | none blocking |
| T026-T028 | Cost protection | T027 is a decision task |
| T029-T030 | Backpressure | none blocking |
| T031-T032 | Archival | T032 partly gated on a legal/retention decision |
| T033-T035 | probe-pool/sandbox-runner | T033 is a decision task |
| T036-T039 | Infra scaling | T036 gated on T004; T037/T038 deferred by default |
| T040 | Load testing | none blocking |
| T041 | Security hardening | depends on Phases 2-6 |
| T042-T043 | Staging | depends on nearly everything above |
| T044 | Production rollout | depends on all Launch Gates |
| T045 | Post-launch | depends on T044 |
