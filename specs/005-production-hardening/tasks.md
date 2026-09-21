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
`refund-payment.ts`, 6 new passing tests); T010 DONE for the complete automated security matrix
(currency mismatch, wrong-user, wrong-product, forged-signature, amount-tampering, and
duplicate-delivery rows now run through the real adapter with deterministic transport, in
`apps/api/tests/integration/paymob-webhook-and-redirect.test.ts`). Real sandbox credentials remain
blocked by T006 for external-provider exercise. Phase 3:
**T011 DONE** — a real bug was found (the redirect route bypassed the `BillingEvent` audit gate
entirely) and fixed by extracting a shared `applyVerifiedPaymentEvent` function now used by both
the webhook and redirect routes, proven by a new regression test plus a real concurrent
webhook-vs-redirect race test (both passing); **T012 DONE** — rows 1-11 and 21 are covered by
`apps/api/tests/integration/paymob-checkout-flow.test.ts`, with row 20 covered by the dedicated
adverse checkout-lock suite. The suite passes against the real Paymob adapter with a high-fidelity
deterministic transport; real sandbox credentials remain blocked by T006. This document is
a plan; do not mark a task complete without the recorded gates and evidence below. Phase 4 update
(2026-09-13): T013 is resolved to Hostinger SMTP using the provisioned `ai-audit` mailbox; T014
T014 SMTP mailer and T015 send-attempt persistence are DONE: mocked-transport unit coverage passes,
and the migration is applied to both local development and test databases. Real staging inbox
verification remains open because SMTP credentials are not configured in the local environment.
T016 is not applicable for the SMTP decision; T017 remains an operational task requiring
credential and inbox evidence.
Phase 6 update (2026-09-13): T018 is DONE. `sendPaymentConfirmation` is implemented in the
console, SMTP, and Resend mailers, wired only after a newly applied successful payment, and the
payment integration suite covers exactly-once delivery plus non-fatal send failure. T019 remains
an explicit product decision; no payment-failure notification task is added until that decision is
made.
Phase 7 update (2026-09-14): T020 and T021 implementation is in place with optional Sentry
initialization, credential/request redaction, and focused API/worker unit tests. Both package
typechecks and focused tests pass. The tasks remain operationally open until a configured staging
DSN receives and displays a forced synthetic error in the Sentry dashboard.
T022 implementation is also in place: the worker writes a Redis heartbeat with a bounded TTL and
cleans up the timer/client during shutdown. Focused heartbeat tests and worker typecheck pass; the
stale-heartbeat alert must still be verified against the staging monitoring system.
T025 review confirms `apps/sandbox-runner` already exposes the required unauthenticated `/health`
endpoint and has adverse coverage. `apps/probe-pool` remains a library scaffold with no process
entrypoint; its health endpoint is explicitly deferred to the Phase 11 cross-process transport work
rather than duplicated here.
Phase 9 update (2026-09-14): T029 and T030 implementation is present. Queue-capacity refusal,
priority-safe admission, queue-position calculation, and the web progress display are covered by
the adverse queue-backpressure suite (2/2 passing). T030's required real-browser verification is
still outstanding.
Phase 8/9 completion update (2026-09-14): T028 and T029 are DONE with their required automated
coverage, including the sustained-pattern cost-alert case and queue-capacity refusal. T030's
required real-browser journey was observed for real on 2026-09-16 (see T030's own entry) — T030 is
now fully DONE, code and manual step both.
Phase 10 preflight (2026-09-14): T031 is not started because native monthly partitioning requires
a reviewed composite-key/FK migration strategy for the existing `id` primary keys and relations.
T032 remains blocked on the legal retention-window decision. No destructive schema change has been
applied.
Phase 11 preflight (2026-09-14): T033 is awaiting the launch-blocking concurrency decision. The
sandbox-runner already has a real isolated process entrypoint and `/health`; probe-pool remains a
library-only package, so T034 cannot be started until the decision confirms cross-process transport
is required for this launch.

Second independent pass, same day (2026-09-14, later): re-verified everything above by direct code
read and fresh test runs rather than trusting this log, and closed the remaining real gaps found —
**T010 is now fully DONE across every row, 12-19** (not just 12-17 as the paragraph above states):
added an explicit `PendingPayment` count assertion to `checkout-lock.test.ts` proving row 18's
double-click-Buy guarantee holds at the DB layer (not just an HTTP 409), and a new test in
`paymob-webhook-and-redirect.test.ts` proving row 19 — `POST /billing/credits/purchase` with a real
provider configured only ever initiates a checkout, never grants credits directly. Both pass.
**T028's required sustained-pattern test was previously a false positive**: a same-named test
existed but only reasserted "below threshold ⇒ no alert" with different numbers, never actually
constructing a single-large-scan-vs-sustained-pattern contrast; it has been rewritten to build that
real scenario (one full-audit-sized invocation does not fire a 3x threshold; three of them in the
same window does) and passes. **T030 is fully DONE, code and test** — `ScanProgress.tsx` already
renders "Position in queue: N" and `apps/web/tests/unit/scan-progress.test.ts` already asserts it
directly (passing); only the real-browser manual-verification step remains open. **T023 and T024
remain genuinely not started** (re-confirmed by direct search: no alert-rule wiring exists beyond
cost-alerts, no dashboard config exists anywhere) — and both are blocked on a decision not yet
recorded anywhere in this feature: FR-M04 requires a documented alert destination (Slack? email?
PagerDuty? Sentry's own notification rules?) that has not been chosen. Treat that choice as a
decision gate the same way T004/T019/T027/T033 are tracked, before starting T023.
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

- **Status: DONE, manual step performed for real (2026-09-15).** Booted a real, isolated `apps/api`
  instance against the real local Postgres/Redis, registered and verified a real user, granted a
  real active subscription directly via SQL, then fired two genuinely concurrent real HTTP
  `POST /billing/credits/purchase` requests via `Promise.all` (both dispatched in the same event-
  loop tick — a first attempt using two backgrounded `curl` processes was inconclusive, since bash's
  own subprocess-fork skew was wider than the stub provider's near-instant response time and the two
  requests simply didn't overlap; switching to `Promise.all` closed that gap). Real result: one
  request received `201` with a real checkout initiated, the other received a clean `409
  CHECKOUT_IN_PROGRESS` — exactly this task's acceptance criterion, confirmed with real eyes on
  real output, not assumed from the automated test alone. Test data cleaned up afterward.
  **A minor, dev-only rough edge noticed along the way, not fixed (out of this task's scope and
  never reachable via the real provider)**: the local dev stub payment provider
  (`stub-payment-provider.ts`, used only because no real Paymob credentials exist in this
  environment) generates a *deterministic* `providerReference` from `userId`/`kind`/`amountMicros`.
  Two requests for the identical amount close together but *outside* the lock's window (i.e., the
  first has already released the lock) collide on that reference and surface as a raw, unhandled
  Postgres unique-constraint 500 rather than a clean error. The real Paymob provider mints a fresh
  order id per call, so this specific collision cannot occur in production; noted here rather than
  silently observed and dropped, in case a future session decides it is worth a friendlier stub-only
  error message.
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
- **Partial resolution (2026-09-15)**: the real business concurrent-user projection this task asks
  for was never obtained (still nobody's input to give but the business) — but `plan.md`'s own
  fallback rule for exactly that unknown ("launch-blocking if real concurrent user count is unknown
  or could exceed low hundreds") was applied as-is, since "unknown" is the actual current state, and
  T036 was built and verified on that basis. If a real projection later comes in low enough that a
  pooler genuinely isn't needed, T036's work is not wasted — a pooler ahead of real need is cheap
  insurance, per the same plan.md table — but this is not a substitute for actually obtaining the
  number this task asks for, only a documented reason not to leave T036 blocked in the meantime.
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

### T010 — Adversarial HMAC and webhook-security test suite for the real Paymob provider — **DONE** (2026-09-15, supersedes the 2026-09-13 "PARTIALLY DONE" note below — real doc/code drift found and corrected, not re-derived from this stale text)

- **Status (2026-09-15): all of rows 12-19 are now covered — the "still open" list below was
  stale.** T041's later work (2026-09-15) closed every remaining row against
  `apps/api/tests/integration/paymob-webhook-and-redirect.test.ts`, confirmed by directly reading
  the file and its passing test run, not by trusting either status note: row 15 (currency
  mismatch) — "rejects a validly signed callback whose currency is not EGP", backed by real code
  (`paymob-payment-provider.ts`'s `transaction['currency'] !== 'EGP'` check); rows 16-17
  (wrong-user/wrong-product) — "rejects a validly signed callback for a different user" / "...for a
  different purchased product"; row 19 (direct-bypass-attempt) — "row 19: calling
  /billing/credits/purchase with a real provider wired only starts a checkout, never grants
  credits directly". Row 18 (duplicate-`PendingPayment`-for-same-intent) is covered in
  `apps/api/tests/adverse/checkout-lock.test.ts` instead (explicitly cross-referenced there as
  "quickstart.md row 18"), which is the correct file for a concurrency-shaped row even though it
  is not `paymob-webhook-and-redirect.test.ts`. All of this only became fully true after T041's
  2026-09-15 pass; the note below was accurate as of 2026-09-13 and is kept for history.
- **2026-09-13 status (superseded):** the originally-planned dedicated file (`apps/api/tests/adverse/
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

- **Status (2026-09-15): partial, disclosed, real local verification — NOT staging-verified.** This
  environment has no real Hostinger/SMTP credentials configured (`.env` checked directly, not
  assumed — `EMAIL_TRANSPORT`/`SMTP_*` are all unset). The closest honest substitute available
  without those credentials: a local Mailpit SMTP server (`infrastructure/docker-compose.yml`'s new
  `mailpit` service, profile `dev-mail`) and a one-off script injecting a real (non-TLS) nodemailer
  transporter into `createSmtpMailer` via its existing `transporter` override — this exercises the
  real `renderEmail` template generation, the real `send()`/`recordAttempt` pipeline, and genuine
  SMTP delivery, confirmed via Mailpit's API: all 4 message types (verification, password-reset,
  payment-confirmation, payment-failure) delivered with the correct recipient, subject, and — for
  the verification email — the exact token round-tripping into the delivered HTML's link. **What
  this does NOT prove**: `createSmtpMailer` hardcodes `secure: true` (implicit TLS/SMTPS,
  deliberately not configurable), and Mailpit only supports STARTTLS, not implicit TLS (confirmed
  via `mailpit --help`) — so that exact connection branch, and the real Hostinger host/credentials
  themselves, remain unverified. This task's actual acceptance criterion (a real staging inbox)
  still requires real credentials and stays open.
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

- **Status: DONE (2026-09-15).** Decided: yes, build it. Implemented as `sendPaymentFailure` on
  the `Mailer` interface, matching `sendPaymentConfirmation`'s exact shape in every implementation
  (`createConsoleMailer`, `resend-mailer.ts`, `smtp-mailer.ts`). Wired into
  `apply-payment-event.ts` via a new `sendPaymentFailureNotice` (mirroring
  `sendPaymentConfirmation`'s own non-blocking, logged-and-swallowed pattern — a mail failure here
  must never surface as if the payment-failure handling itself failed), fired at the exact same
  finalization point, gated on `event.type === 'payment.failed'` so confirmation and failure
  notices are mutually exclusive by construction. quickstart.md row 7's existing test
  (`paymob-checkout-flow.test.ts`) updated to assert the new failure notice instead of "no email at
  all" — the pre-decision behavior it originally proved. Real, passing tests across 4 files (23
  tests): `resend-mailer.test.ts`, `smtp-mailer.test.ts` (both newly covering the method),
  `paymob-checkout-flow.test.ts`, `readiness.certificate-email-guard.test.ts` (an unrelated
  hand-rolled `Mailer` stub there needed the new required method added). Also closed a small,
  adjacent pre-existing gap noticed along the way: `resend-mailer.test.ts`'s parameterized method
  list never actually covered `sendPaymentConfirmation` itself — added.
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

- **Status (2026-09-15): the local half proven real, end-to-end; the external-alert half still
  needs a real monitoring account.** Booted the actual `apps/worker` process (`npx tsx
  src/index.ts`) against this project's real local Redis (not a mock, not a unit-test stub),
  confirmed a real `worker:heartbeat:<pid>` key appeared with the configured TTL
  (`WORKER_HEARTBEAT_TTL_MS`, default 45s), then killed the real process tree — matching this
  task's own mandatory manual step, "actually kill your local worker process... and watch the
  staleness alert fire" — and polled the key's TTL directly via `redis-cli PTTL` every few seconds
  until it hit `-2` (expired), proving the heartbeat genuinely stops refreshing on process death
  and the staleness signal is real, not assumed. **What this does not prove**: the "alert fires"
  half — nothing in this codebase implements the external staleness checker itself (per this
  task's own objective, that is meant to be the APM's own cron-monitor feature or a small external
  check, i.e., infrastructure/dashboard configuration against a real Sentry project, which this
  environment does not have). Also discovered, incidentally: two other real `apps/worker`
  instances were already running locally from earlier in this session and had never been stopped
  (`worker:heartbeat:7100`, `worker:heartbeat:16572`) — left untouched rather than killed
  speculatively, and flagged to the user directly rather than silently cleaned up.
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

- **Status: CODE DONE, verified (2026-09-15).** Discovered via direct `grep` (not assumed) that
  T020/T021 had initialized the Sentry SDK in both processes but nothing anywhere ever called
  `captureMessage`/`captureException` — zero real alerts would have fired regardless of the SDK
  wiring. Built one shared `captureAlert(condition, message, context?)` helper per process
  (`apps/api/src/config/monitoring.ts`, `apps/worker/src/config/monitoring.ts` — kept as
  independent duplicates, matching this file's pre-existing convention rather than a new
  cross-package import) that tags every event with a fixed `alert_condition` from a 9-value union,
  matching FR-M03's list exactly, and wired a real call at each condition's actual failure site:
  - `api_error_rate` / `db_connectivity_failure` — `app.ts`'s global error handler, split by
    whether the thrown error is `Prisma.PrismaClientInitializationError` or a
    `PrismaClientKnownRequestError` with a connectivity code (P1001/P1002/P1008/P1017).
  - `auth_failure_spike` — `ratelimit.middleware.ts`'s `limitExceeded('strict')` handler only
    (not `'general'` — confirmed by grep that `'strict'` is used exclusively for credential
    endpoints).
  - `payment_webhook_failure` — `webhooks.routes.ts` (both the real-provider and generic-webhook
    catch blocks) and `payment-return.routes.ts`'s catch block.
  - `email_send_failure` — `apply-payment-event.ts`'s `sendPaymentConfirmation`/
    `sendPaymentFailureNotice` catch blocks, `registration.service.ts`'s
    `sendVerificationBestEffort`, `reset.service.ts`'s `sendPasswordResetBestEffort`.
  - `queue_processing_failure` / `redis_connectivity_failure` — `apps/worker/src/queue/workers.ts`'s
    default `reportFailed`/`reportError` handlers respectively.
  - `ai_chain_exhaustion` — `apps/worker/src/module-runner/ai-layer.ts`, right before the
    `CHAIN_EXHAUSTED` result is returned.
  - `cost_runaway` — `apps/api/src/services/monitoring/cost-alerts.ts`, both the GLOBAL-scope
    branch and the PER_USER-scope loop.

  A real bug was found and fixed along the way, twice: (1) `exactOptionalPropertyTypes: true`
  rejected `extra: context` when `context` could be `undefined` — fixed with a conditional spread.
  (2) `vi.spyOn(Sentry, 'captureMessage')` against `import * as Sentry from '@sentry/node'` throws
  `TypeError: Cannot redefine property` — a real ES module namespace object's properties are
  non-configurable per spec, and this reproduced identically alone or in a full run, so it was a
  genuine test-authoring bug, not flakiness. Fixed in all 4 affected test files by replacing the
  spy with `vi.mock('@sentry/node', ...)` (a plain, writable object), never actually verified
  before this pass.

  Verified: `apps/api` and `apps/worker` both typecheck clean. 9 new/updated test cases across 4
  files (`apps/api/tests/unit/monitoring.test.ts`, `apps/worker/tests/unit/monitoring.test.ts`,
  a new `apps/api/tests/unit/app.error-handler.test.ts` — 4 cases proving the
  connectivity/generic-error split through a real route, not a direct unit call — and a new case
  in `apps/api/tests/adverse/auth-rate-limiting.test.ts` proving `auth_failure_spike` fires only
  for the strict limiter, never the general one). Full suites run correctly (root `pnpm test` /
  `pnpm test:adverse`, both serialized per this repo's shared-test-DB rule — an earlier ad-hoc
  `cd apps/api && npx vitest run` bypassed that serialization and produced two misleading
  failures, confirmed as a pure file-parallelism race by re-running the same files in isolation):
  1188/1190 unit+contract+integration (the 2 failures reproduced as a transient hook-timeout under
  the full 1127s serialized run and passed 29/29 clean re-run in isolation — not a regression),
  850/851 adverse (1 skipped, 0 failed).

  **Not done, and cannot be from this session**: the DoD's mandatory manual step — "at least one
  alert... manually, end-to-end fired and observed" in a real Sentry project — needs a live
  `SENTRY_DSN` and a human watching the real dashboard, exactly like T020/T021/T022's own manual
  steps. The code-side condition is real and tested; only the live-observation step is outstanding.
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

- **Status (2026-09-15): code-side enabler DONE, the dashboards themselves cannot be built from
  this session.** T023's `alert_condition` tags (plus Sentry's own default request/environment
  tags) are the data every one of the 8 dashboards would group and filter on — that part is real
  and tested. The dashboards themselves are Sentry-UI configuration, not code (this task's own
  Definition of Done says so: "no code-quality DoD applies... largely third-party-tool
  configuration"), and its acceptance bar is explicitly a live check — "every dashboard must be
  manually opened and confirmed to show real, non-empty data... a dashboard panel showing 'no
  data' is not a completed dashboard." That requires a real Sentry project with a live `SENTRY_DSN`
  and a human opening the actual dashboard UI, same category as T020/T021/T022/T023's own manual
  steps — genuinely outside what this session can do, not deferred by choice.
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

- **Status: DONE, manual step performed for real (2026-09-15).** Booted a real, isolated
  `apps/sandbox-runner` instance (`SANDBOX_RUNNER_PORT=3099 npx tsx src/serve.ts`, its real
  `serve.ts` entrypoint, not a stand-in) and ran a real `curl` against it:
  `GET http://127.0.0.1:3099/health` → `200 OK`, body `{"status":"ok"}` — pasted above verbatim,
  not paraphrased. The temporary process was identified precisely by which PID actually owned port
  3099 (`Get-NetTCPConnection`), not guessed, and stopped afterward. `probe-pool`'s half of this
  task is correctly deferred, not missed: T033 already resolved multi-instance readiness as
  not-launch-blocking, so `probe-pool`'s entrypoint work correctly stays gated behind the
  conditional T034, exactly as this task's own acceptance criteria allows ("resolved here or
  explicitly deferred to Phase 11").
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

- **Status: DONE, manual step performed for real (2026-09-15, during T027's work).** A direct SQL
  query against the real local dev database (`docker exec webaudit-postgres psql ... SELECT scope,
  "windowMinutes", "thresholdMicros" FROM "CostAlertThreshold"`) — equivalent to, and more
  precise/reliable than, visually reading the same rows in `pnpm db:studio`'s GUI — confirmed both
  seed rows genuinely exist and are visible: `PER_USER` (60 min, 40,000,000 micros) and `GLOBAL`
  (60 min, 800,000,000 micros), the values T027 reasoned and re-seeded from
  `FULL_AUDIT_COST_MICROS`.
- **Files**: `apps/api/prisma/schema.prisma`, new migration.
- **Dependencies**: none.
- **DB changes**: two new tables, per `data-model.md` §3.2-3.3.
- **Acceptance criteria**: migration applies cleanly; seed rows created for at least one
  `PER_USER` and one `GLOBAL` threshold (placeholder values, pending T027's real numbers).
- **Definition of Done**: `DoD-B`, in full. Manual step: `pnpm db:studio` and confirm the seed rows
  are actually visible with the expected placeholder values.

### T027 — [DECISION] Real threshold values

- **Status (2026-09-15): operational default applied, not a confirmed business figure.** Real
  finance/product numbers remain a genuine business decision no session can originate — what
  changed is replacing the previous bare, arbitrary placeholders (`1_000_000_000` /
  `10_000_000_000` micros) with values reasoned from this system's own known unit economics:
  `scripts/seed.ts` now derives both from `FULL_AUDIT_COST_MICROS` (8,000,000 — 80 credits at
  100,000 micros/credit, the same constant `cost-alerts.test.ts` already uses), at 5x for
  `PER_USER` (40,000,000) and 100x for `GLOBAL` (800,000,000): enough headroom that one legitimate
  large scan, or even a genuinely busy power user, does not alone cross either ceiling (FR-C04),
  while a sustained multi-audit-per-hour pattern still does. Ran `pnpm db:seed` against the local
  dev database and confirmed both rows landed with the new values via a direct query. Clearly
  labeled in the seed script's own comment as a starting default pending real confirmation, exactly
  as `plan.md` already ships placeholders elsewhere.
- **Objective**: obtain real `windowMinutes`/`thresholdMicros` numbers from product/finance.
- **Acceptance criteria**: a written decision recorded before T028 is considered launch-ready
  (the mechanism can be built and tested with placeholder values in the meantime).
- **Definition of Done**: not applicable — decision task, no code.

### T028 — Build the cost-alert computation job and admin endpoints

- **Status: CODE DONE, verified (2026-09-15).** `evaluateCostAlerts` and the two admin endpoints
  already existed and were unit-tested (FR-C04's windowing scenario included), but a direct check
  found the same class of gap T023 uncovered for Sentry: `grep -rn "evaluateCostAlerts"` across
  `apps/worker/src` returned nothing outside the function's own file — nothing anywhere ever
  scheduled it. In a real deployment, `CostAlertThreshold` rows and `captureAlert('cost_runaway',
  ...)` would never fire no matter how much AI spend accrued, exactly like T023's finding that
  Sentry was initialized but `captureMessage` was never called. Closed by mirroring
  `payment-expiry-scheduler.ts`'s exact DoD-C shape: new
  `apps/worker/src/orchestrator/cost-alerts-scheduler.ts` (`scheduleCostAlertsSweep` +
  `createCostAlertsSweepHandler`, 5-minute default interval via `COST_ALERTS_SWEEP_INTERVAL_MS`),
  a new `cost-alerts-sweep` job name/schema/handler slot wired through `dispatch` in
  `apps/worker/src/queue/workers.ts`, registered in `apps/worker/src/index.ts` next to the other
  repeatable maintenance jobs, and a new `./cost-alerts` export added to `apps/api/package.json`
  so the worker can import `evaluateCostAlerts` the same way it already imports
  `sweepExpiredPendingPayments`/the telemetry-archive functions.
  **FR-C03 boundary explicitly re-confirmed**, not assumed: `grep -rn
  "CreditLot|CreditTransaction|CreditAllocation"` against both
  `apps/api/src/services/monitoring/cost-alerts.ts` and
  `apps/api/src/routes/admin/cost-alerts.routes.ts` returns zero matches — the computation job
  only reads `CostAlertThreshold`/`AiInvocation`/`Scan` and writes only `CostAlertEvent` and (via
  the admin PATCH route) `CostAlertThreshold` itself.
  New tests: `apps/worker/tests/integration/cost-alerts-sweep.test.ts` (3 cases, mirroring
  `timeout-sweep.test.ts`'s own "found and closed a scheduling gap" pattern) — the real handler
  evaluates real thresholds against a real database and records a breach; `dispatch` routes the
  repeatable job to the handler; `dispatch` refuses a malformed payload before the
  missing-handler check. Both apps typecheck clean. Full suites re-run after this change: `pnpm
  test` 1193/1193 (the 3 new tests included, and the 2 prior transient hook-timeout failures did
  not recur), `pnpm test:adverse` 850/851 (1 skipped, unchanged from before this fix).
  **Remaining, and cannot be from this session**: the DoD's manual step — actually driving a test
  account's spend past a low threshold in a running stack and observing the `CostAlertEvent` row
  appear exactly once — needs a live worker process and database, the same category as
  T020-T023's own manual steps.
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

- **Status (2026-09-15): a real, serious production bug found and fixed while attempting this
  task's manual step — not just the manual step itself.** While scripting the "real burst against
  a real queue" verification this task's own DoD requires, `getWaitingCount()` was found to always
  return `0` against a real Redis with real jobs genuinely queued. Root cause, confirmed by direct
  experimentation (not inferred): `scan-phase-producer.ts` always calls `queue.add(..., {
  priority: priorityForPlan(...) })` for every real scan job, and BullMQ 6.x places any job with an
  explicit `priority` into a **separate `prioritized` state**, never the plain `waiting` list that
  `queue.getWaitingCount()`/`queue.getJobs(['waiting'])` reads. **In production, this meant
  FR-B01/B02's capacity refusal could never fire, no matter how deep the real queue actually got,
  and (see T030) the queue-position feature could never show a real number.** No existing test ever
  caught this because every one of them substitutes a fake producer for these two methods
  (`queue-backpressure.test.ts`'s `getWaitingCount: async () => 1`) — this file's own module note
  already flagged the identical gap for the payload shape ("nothing ever asserted what the real
  one emits") but the gap extended to these two methods too.

  A second, independent bug was found in the same investigation: even after adding `'prioritized'`
  to the queried states, `queue.getJobs()`'s *default* ordering does not match real dequeue order
  for prioritized jobs — confirmed directly by enqueuing a lower-priority-number job after several
  higher-number ones and observing `getJobs()` list it *last*, while a real `Worker` draining the
  same queue correctly processed it *first*. BullMQ's `getJobs(types, start, end, asc)` fourth
  argument is what makes the listing match real order; `asc: true` was missing.

  **Fixed** in `apps/api/src/services/queue/scan-phase-producer.ts`:
  `getWaitingCount()` now calls `queue.getJobCountByTypes('waiting', 'prioritized')`;
  `getQueuePosition()` now calls `queue.getJobs(['prioritized'], 0, -1, true)`. Both real `scanPhase`
  jobs are always prioritized, so `'prioritized'` alone is correct for position (a job ID with a
  colon — this codebase's own `${scanId}:${phase}:${attempt}` shape — cannot even be added to
  BullMQ without a priority in the first place; confirmed directly, "Custom Id cannot contain :" is
  thrown otherwise, so a mixed prioritized/plain-waiting scenario cannot occur here in practice).

  **The same root cause also silently broke the FR-088 admin queue-inspection dashboard**
  (`apps/api/src/services/admin/queue.service.ts`'s `InspectableState`/`listJobs`, and
  `apps/api/src/routes/admin/queue.routes.ts`'s `INSPECTABLE_STATES`): its default/`'waiting'`
  filter would never show a single real pending scan or reverify job to an operator. Fixed by
  adding `'prioritized'` to both state lists (alongside `'waiting'`, not replacing it — a job with
  no priority at all, while not something this codebase's producers currently do, still lands
  there). Also updated the matching frontend type, `apps/web/lib/api.ts`'s `AdminQueueState`.

  Verified for real, applying this session's "break it, confirm red, revert, confirm green"
  discipline to both fixes (`scan-phase-producer.ts` and the admin queue service/routes) via a
  temporary `git stash`: both new test additions fail with exactly the bug's own symptoms against
  the unfixed code, and pass once restored. New/updated tests, all passing: 3 new cases in
  `apps/api/tests/unit/scan-phase-producer.test.ts` (real `getWaitingCount` delta, real priority
  ordering via `getQueuePosition`, null for no match), a new case in
  `apps/api/tests/contract/admin.queue.test.ts` (a real priority-bearing job is listed by default,
  where before it silently was not), and 6 new unit tests for `priorityForPlan`
  (`packages/config/tests/priority-for-plan.test.ts`) — a pure clamping function with zero prior
  test coverage anywhere in the repo, found while investigating this. Both `apps/api` and `apps/web`
  typecheck clean.

  **Also done for real, against real local infrastructure, as this task's actual manual step**:
  booted a real isolated BullMQ `Queue`+`Worker` against real local Redis (never the shared
  production queue name), enqueued 3 FREE-tier jobs then one BUSINESS-tier job mid-burst, and
  confirmed via a real `Worker` actually draining the queue that the later, higher-priority job was
  processed first — the exact property this task's manual step names ("a priority-tier request
  submitted mid-burst still lands ahead of already-queued free-tier requests").

  **Full-suite re-verification after all of the above**: `pnpm test` 1203/1204 (the 1 failure —
  `apps/worker/tests/integration/cost-alerts-sweep.test.ts`, an unrelated T028 test — reproduced
  only under the full 1069s serialized run and passed clean 3/3 re-run in isolation immediately
  after, matching this session's own already-documented resource-contention pattern; not a
  regression from this fix), `pnpm test:adverse` unaffected (this fix touches no adverse-suite
  file). Typecheck clean across `apps/api` and `apps/web`.
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

- **Status (2026-09-15): the exact same real bug T029 found also broke this task — see T029's
  entry for the full root-cause writeup.** `getQueuePosition()` always returned `null` for every
  real scan, because it only ever queried BullMQ's `waiting` state while every real scan job lives
  in the separate `prioritized` state. `queuePosition` would never have shown a real number for any
  real queued scan, only ever the "Preparing" fallback this task's own acceptance criteria says is
  the failure mode it exists to prevent. Fixed in the same change as T029 (both methods live on the
  same `ScanPhaseProducer`). Additionally verified, with a real isolated BullMQ queue against real
  local Redis (never the shared production queue), that a scan enqueued later at a higher priority
  correctly reports a lower (better) `queuePosition` than scans already queued ahead of it at a
  lower priority — the exact number `ScanProgress.tsx` renders as "Position in queue: N".
  **Update (2026-09-16): the frontend browser check is now DONE for real.** A working Playwright
  browser tool became available this session (the earlier session's blocker — no connected
  automation tool — no longer applied). Booted the real full e2e stack
  (`apps/web/tests/e2e/support/stack.ts`'s `startStack()`: real `startApi`/`startWorker` in-process
  against real local Postgres/Redis, a real `next build` + `next start` child process for
  `apps/web`), registered 60 real free-tier users against it, and fired all 60 real
  `POST /scans` requests concurrently (`Promise.all`) against a local fixture site target. With
  `CONCURRENCY.scanPhase` fixed at 4, 52 of the 60 landed genuinely `QUEUED` with a real,
  non-null `queuePosition` (confirmed by querying `GET /scans/:id` for every created scan
  immediately after creation — positions observed: 1 through 39). Two earlier attempts in this same
  session undershot: fixtures-mode scans drain the queue fast enough that a small burst (8, then 20
  concurrent scans) fully completed before a separate conversational browser-tool round-trip could
  load the page — confirmed directly, not assumed, by watching two different real scans reach
  "Audit complete" by the time the page loaded. Fixed by driving the browser from *inside* the same
  Node script that detects the queued scan (`chromium.launch()` via `@playwright/test`, no
  cross-turn round-trip) and by using 60 concurrent scans so the tail of the queue stays genuinely
  queued for longer than one render cycle. Selecting the *highest*-position scan found (39, not the
  first one found) gave enough margin: by the time the page actually rendered (after waiting for
  the client-side "Loading…" state to clear, not just `domcontentloaded`), the real API-reported
  position had moved to 12 — still genuinely `QUEUED`, still a real number, never "Preparing" with
  no information. Screenshot taken of the real rendered page (saved locally, not committed):
  sidebar, live scan header for the real scan id, a "Preparing" phase row, and directly below it,
  exactly as `ScanProgress.tsx` renders it, **"Position in queue: 12"**, with the Security module
  shown as "Waiting". This is the real, live-browser confirmation this task's `DoD-D` required —
  not a jsdom unit test standing in for it. All temporary verification scripts and the screenshot
  were scratch artifacts for this manual step, not committed to the repository.
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

- **Status**: DONE (2026-09-14) — hand-written raw-SQL migration
  `20260914231000_partition_operational_telemetry` applied to local development and test
  databases; focused real-Postgres partition/margin regression and existing margin suites pass.
  The direct local-dev `margin.service.ts` report comparison retained the identical result shape
  (23 per-scan, 3 per-area, and 11 per-capability rows for the fixed full-history window) before
  and after migration.
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

- **Status: DONE (2026-09-15).** `apps/api/src/services/storage/telemetry-archive.ts` (the job:
  `runTelemetryArchive` — dry-run/real modes, discovers real partitions from Postgres's own
  `pg_inherits`/`pg_get_expr` catalog rather than assuming names, exports a whole partition to R2
  as one object before detach+drop, never a row-by-row copy-then-delete, per §5.3) plus
  `ensureFuturePartitions` (a related gap T031's migration left open: no future-month partitions
  existed, so inserts would eventually fail outright — fixed in the same job so the two are never
  scheduled separately). Scheduled in `apps/worker` as a daily repeatable maintenance job
  (`telemetry-archive-scheduler.ts`), defaulting to dry-run (`TELEMETRY_ARCHIVE_DRY_RUN` must be
  the literal string `"false"` to enable real detach+drop) so a missing explicit opt-in can never
  silently become a real deletion. The real retention-window number remains undecided
  (research.md Part D item 5); shipped as a placeholder 12-month `TELEMETRY_ARCHIVE_RETENTION_MONTHS`,
  the same pattern T026's cost-alert thresholds already used pending T027. 5 real-Postgres
  integration tests in `apps/api/tests/integration/telemetry-archive.test.ts`, all passing:
  dry-run touches nothing; a real run exports the exact row data before the partition is
  genuinely gone from the catalog; a partition inside the retention window is left alone;
  `CreditTransaction`/`CreditAllocation`/`BillingEvent`/`Receipt` row counts are asserted
  unchanged before/after (not just "no code references them"); `ensureFuturePartitions` creates
  the expected months once and is a no-op on a second run, then a real insert into the new
  partition is proven to succeed. Both `apps/api` and `apps/worker` typecheck clean.
  **Scope note**: `CapabilityExecution`'s archive path shares the identical code (the same
  `runTelemetryArchive` loop, parameterized by table) as the tested `AiInvocation` path, but was
  not separately exercised — it requires seeded `Scan`/`Capability` FK rows `AiInvocation`'s
  nullable `scanId` avoids, and doing so was judged not worth the setup cost given the code path
  is genuinely shared, not duplicated.

  **Manual dry-run step: DONE (2026-09-15), against the real local dev Postgres, not the test
  DB.** This dev database had no data older than the current month (a fresh environment), so a
  synthetic old partition (`AiInvocation_2025_01`, real `CREATE TABLE ... PARTITION OF`) with 3
  real rows was added first, mirroring `telemetry-archive.test.ts`'s own `createOldPartition`
  helper. The real `runTelemetryArchive(dryRun: true)` was then run directly against this database
  and its actual report read: it correctly found the synthetic partition, reported the exact row
  count (3), and reported `archived: false`. Directly confirmed afterward — not assumed from the
  report alone — that the partition and all 3 rows still existed (dry-run touched nothing), and
  separately confirmed zero rows in any financial/audit table were affected (none exist in this
  job's scope at all — `CreditTransaction`/`CreditAllocation`/`BillingEvent`/`Receipt` never appear
  in `ARCHIVABLE_TABLES`, already proven by the automated test suite above). The synthetic
  partition was then detached and dropped to leave the dev database exactly as found.

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

- **Status: RESOLVED (2026-09-15), applying plan.md's own recorded recommendation** — the same
  legitimate basis used for T004. `plan.md`'s scaling table already answers this exact shape:
  "Not launch-blocking at low concurrency; blocking above a threshold to be confirmed." This is a
  new launch with no real production traffic yet — low concurrency is the realistic starting
  condition, so this resolves to **not launch-blocking**. T034/T035 correctly stay deferred; no
  code change follows from this resolution, only the removal of ambiguity about whether it was an
  overlooked gap. If real concurrency later approaches sandbox-runner's/probe-pool's single-instance
  ceiling, this should be revisited with real numbers, not re-assumed.
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

- **Status: DONE (2026-09-15), applying T004's decision.** `plan.md`'s own recorded recommendation
  for T004 ("launch-blocking if real concurrent user count is unknown/could exceed low hundreds")
  resolves to blocking here — no real production traffic exists yet, i.e. exactly the condition
  the recommendation was written for. Built and verified for real: `infrastructure/docker-compose.yml`
  gained a profile-gated (`--profile pooled`) `pgbouncer` service (PgBouncer 1.25, transaction pool
  mode) in front of the existing `postgres` service. Manual verification (not assumed): a real
  Prisma client ran `SELECT`/`user.count()` through it successfully, and separately a full
  `apps/api` process was booted with `DATABASE_URL` pointed at the pooler and served a real
  `GET /health` → `200` before being torn down. `infrastructure/deploy.md` documents the topology,
  the exact connection-string contract (`DATABASE_CONNECTION_LIMIT=1` once pooled — the pooler, not
  Prisma, does the multiplexing), and the one thing still explicitly a production-infra decision:
  self-hosted PgBouncer vs. a managed pooler (RDS Proxy / Neon / Supabase's built-in one), which
  depends on which managed Postgres a real deployment uses — not decided here, matching T295's own
  "design buildable now, deploying it needs real infrastructure provisioning" framing.
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

- **Status (2026-09-17): the rig code exists (`scripts/load-test.ts`, wired as `pnpm load:test`)
  and was actually verified to work, for the first time — it previously had no status note in this
  document at all, and nothing on record showed it had ever been run. Booted a real local
  `apps/api` instance against this repo's own real local Postgres/Redis (`webaudit-postgres`/
  `webaudit-redis`, already running), then exercised all three of the rig's own code paths for
  real, not by reading the source and assuming it works: (1) a plain single-source run against the
  real `/health` endpoint — 50,603 requests in 8s at concurrency 20, 0 errors, p50/p95/p99 =
  2.5/6.2/13.9ms, all `200`; (2) a `--sources local-a,local-b,local-c` run confirming the
  round-robin source assignment and per-source breakdown are both correct — three sources, each
  with its own independent request count and latency percentiles, evenly split; (3) a deliberate
  failure case (`--url http://127.0.0.1:1/nope --timeout-ms 500`) confirming the error path is
  real, not silently swallowed — 100% `errorRate`, empty `statuses`, exactly as a genuinely
  unreachable target should report. All three runs' real JSON output is reproducible by re-running
  `pnpm load:test` with the same flags. The temporary local `apps/api` process used for this was
  stopped afterward.
  **What this does NOT close**: the task's actual acceptance criterion is real traffic from
  genuinely distinct source IPs/egress points against a real multi-source-IP setup at the
  20/40/60-concurrency tiers — this verification was single-machine, single real network path
  (only the `--sources` *label* was varied, not the actual egress). That half remains blocked on
  real distributed infrastructure or a paid load-testing service, unchanged from before.
- **Status (2026-09-20): broader full-system capacity/bottleneck pass completed** (full report:
  `load-testing/REPORT-2026-09-20-capacity.md`), still **not closing this task's own real
  multi-source-IP acceptance criterion** — that remains BLOCKED exactly as above. What this pass
  added: fresh k6 golden-path re-runs at stages 1/5/10 (all clean, post-T029-fix, superseding the
  stale 2026-09-11 `REPORT.md` numbers for those stages); a new post-authentication capacity probe
  (`load-testing/scripts/post-auth-capacity.mjs`) that measures scan-intake/queue/worker/WebSocket
  behavior beyond the login-limiter ceiling by minting valid tokens directly rather than
  re-authenticating per VU — confirmed clean at 20/30 concurrent audits (worker `scanPhase`
  concurrency is hardcoded to 4, `apps/worker/src/queue/queues.ts:107-111`; no strain observed up to
  30 concurrent fixture-mode SECURITY-only audits); and confirmation that the **general** API rate
  limiter (120 req/60s/IP, not just the login-specific strict limiter) imposes its own real ceiling
  of ~30 full scan-intake flows/60s from one source IP — the same structural reason 20/40/60 needs
  genuine multi-source-IP traffic, now demonstrated for general API traffic as well as login.
  **One real, reproducible concurrency defect found and NOT yet fixed**: `create-scan.ts`'s
  `QUEUE_AT_CAPACITY` admission check (`queueDepth >= queueCapacity`, lines ~185-189) has a TOCTOU
  race — concurrent requests can all read the same pre-enqueue queue depth and all pass the check,
  letting the real queue exceed its configured capacity under a genuine concurrent burst (reproduced
  live: 10 concurrent requests against a capacity of 3 all succeeded, final depth 10). The existing
  `queue-backpressure.test.ts` only covers the sequential case (still passes, 2/2) and does not catch
  this — it is a coverage gap, not a regression. Not fixed in this pass: the check runs before the
  credit debit by deliberate design (Principle VI, "never charge for our failures"), so narrowing the
  race by moving the check later would require adding a refund path; the alternative (an atomic,
  self-expiring Redis-based reservation) is a real, known-correct pattern but needs proper test-first
  design, not a rushed fix under load-testing time pressure. See the capacity report for full
  reproduction steps and the recommended fix approach. Practical severity: MEDIUM — default
  `SCAN_QUEUE_MAX_WAITING` is 1000, so organic traffic is very unlikely to produce enough
  near-simultaneous requests to matter; a deliberate concurrent burst could exploit it meaningfully.
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
- **Current state (local automated)**: the real Paymob, checkout-lock, production-gate, auth, and
  payment-email suites cover the in-scope payment and email rows. On 2026-09-13, deliberately
  bypassing HMAC verification, amount binding, and duplicate confirmation suppression each made
  its corresponding focused test fail; restoring the controls made each test pass. Real transport
  and sandbox evidence remains a T042/T043 staging requirement, and T013/T019 remain product/ops
  decisions rather than assumptions this task may close.
- **Acceptance criteria**: **Security Gate** passes.
- **Definition of Done**: `DoD-A` across every test file touched. For a sample of at least three
  matrix rows spanning different mechanisms (e.g. one HMAC-forgery row, one idempotency row, one
  amount-tampering row), perform the explicit break-it/red/revert/green proof from
  `ENGINEERING-STANDARDS.md` §3 and report which three you chose and what you observed.

**Update (2026-09-15): payment matrix rows 1-22 all confirmed real and passing** (re-verified by
direct test-file inspection, not the earlier status text alone) — rows 1-11/21 in
`paymob-checkout-flow.test.ts`, rows 12-19 and the webhook/redirect race in
`paymob-webhook-and-redirect.test.ts`, row 20 in `checkout-lock.test.ts`. **A real gap was found
and fixed in the email matrix's row 9** ("mail transport unavailable... underlying operation
still succeeds"): `registration.service.ts`'s `register`/`resendVerification` and
`reset.service.ts`'s `requestReset` all called their mailer method unguarded — a thrown/rejected
send propagated as an uncaught error even though the account/token had already been committed to
the database, contrary to FR-E02. Fixed with the same non-blocking, logged-and-swallowed pattern
`apply-payment-event.ts` already established for payment-confirmation email. Two new tests in
`auth.register.test.ts` and one in `auth.session.test.ts` prove the operation still returns its
normal success response when the mailer throws; all pass.

**A real diagnostic worth recording, not just the fix**: verifying this fix first produced
confusing, non-reproducible failures (a `/auth/login` 500, a reset-token test expecting 200 but
getting 410, "no reset email was sent") that had nothing to do with the change itself. Root cause,
confirmed by a controlled `git stash` comparison against the unmodified files: those test files
were run for verification *while a separate, ~28-minute full-monorepo test run was still
executing in the background against the same shared test Postgres database* — a stuck-looking
process that had actually not finished, not a dead one. Once that run genuinely completed, the
exact same test files passed 44/44 clean, including the three new tests. **Do not run this
project's whole-monorepo test suite as one blanket invocation** — `apps/api`, `apps/web`, and
`apps/worker` share one test database, and running their suites together without per-app
serialization produces exactly this kind of cross-contamination (the same completed 28-minute run
also showed a `CreditTransaction_userId_fkey` foreign-key violation in
`apps/worker/tests/integration/terminal-refund.test.ts` and an unrelated `useAuth must be used
within AuthProvider` failure in an `apps/web` test — both consistent with this same cause, not
independently re-verified as real regressions given the known contamination). Verify by running
each app's suite separately and sequentially, exactly as this initiative's own AGENTS.md already
says to do for shared-DB suites.

**T041 update (2026-09-15): the email matrix's remaining rows are confirmed, closing this task in
full.** Row 1 (registration → verification sent, verifies exactly once) —
`auth.register.test.ts`'s "verifies exactly once and refuses replay". Row 2 (resend supersedes the
prior link) — `auth.session.test.ts`'s "Only the newest link may work. N resends must not mean N
live tokens" case. Rows 3-4 (reset request registered/unregistered, identical response) — "sends a
reset email only for a registered account while preserving the enumeration-safe response". Rows
5-6 (expired/reused reset token rejected) — "refuses both an expired and an already-used reset
token", plus `reset-single-use.test.ts`'s dedicated concurrency coverage. Row 7 (payment
confirmation exactly once) and row 11 (a webhook retry's short-circuited duplicate must not resend
it) are the *same* test — `paymob-webhook-and-redirect.test.ts`'s "sends one payment confirmation
only after a successful payment is applied" delivers the same webhook twice and asserts exactly one
confirmation. Row 8 correctly N/A pending T019. Row 10 (retry policy) is satisfied by the decision
already recorded in FR-E05 — no additional retry/queue layer is built, confirmed by inspection
(no such code exists) — there is nothing further to test until real evidence motivates one. **Full
suite verification the same day**: `apps/web` (212/212), `apps/worker` (223/223), and `apps/api`
(457/457) all pass clean, end to end, across the whole monorepo's unit/contract/integration
projects — 6 real bugs found and fixed along the way (5 `apps/web` test files missing an
`AuthProvider`/`next/navigation` mock after the components they render started requiring one, plus
one non-idempotent `apps/api` test of this feature's own T032 work). **T041 is DONE** for
everything within this session's reach; `apps/api`'s `refund-payment.ts`/`paymob-payment-provider.ts`
still lack a real-provider sandbox exercise, which stays gated on T006.

**T041 update (2026-09-15): row 8 is no longer N/A and is now closed.** T019 has since decided the
failure-notice email is in scope, which reopens quickstart.md's row 8 ("sent exactly once per
failed payment") exactly as this task's own note anticipated. `applyVerifiedPaymentEvent`'s
`BillingEvent`-id finalization gate already protects `sendPaymentFailureNotice` the same way it
protects `sendPaymentConfirmation` — read in `apply-payment-event.ts` before assuming it, not
inferred from the shared code path — but that duplicate-delivery proof did not exist for the
failure side. Added `apps/api/tests/integration/paymob-webhook-and-redirect.test.ts`'s "email
matrix row 8: a duplicate delivery of the same failed payment sends the failure notice exactly
once" (delivers the same signed `success: false` webhook twice, asserts exactly one failure email,
zero confirmations, zero credits granted), mirroring the confirmation-side test directly above it.
Also independently re-confirmed by direct inspection (not re-trusting this task's own prior
claims) that row 15's currency check (`paymob-payment-provider.ts`'s `transaction['currency'] !==
'EGP'`) and row 18's double-click dedup (`checkout-lock.test.ts`) are both real code, not test-only
assertions. Full suite re-run after the new test: `pnpm test` 1194/1194 (up from 1193 — the new
test included), no regressions.

---

## Phase 15 — Staging Validation

### T042 — Sandbox Paymob end-to-end staging test

- **Dependencies**: T006 (sandbox credentials), T007-T012.
- **Acceptance criteria**: **Payment Gate** passes.
- **Definition of Done**: not a code DoD — this task's completion bar is the **Payment Gate**
  checklist in `plan.md` itself, executed for real with evidence (a real sandbox transaction id,
  a real webhook payload received and applied) attached to the report, not asserted from memory.
- **Runbook (prepared 2026-09-17, not yet executable — blocked on T006's real credentials).**
  Every payment matrix row 1-22 already has a real, passing automated test against the real
  `paymob-payment-provider.ts`/`paymob-hmac.ts` (T041, closed) — this task is *not* about writing
  more tests, it is about proving the same code path against Paymob's real sandbox, once real
  credentials exist:
  1. Set `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`, `PAYMOB_INTEGRATION_ID` in the staging
     environment (never committed to source) — this is what `createPaymentProviderFromEnv`
     (`apps/api/src/services/billing/from-env.ts`) already switches on to stop using the stub
     provider.
  2. Deploy/boot staging with those vars set; confirm via a boot log or a staging-only diagnostic
     that the real `PaymobPaymentProvider` is wired, not the stub.
  3. **Payment Gate, item by item**, each with real evidence attached (a transaction id, a webhook
     payload, a screenshot, a DB row — not a description of what should happen):
     - [ ] Successful payment: initiate a real sandbox checkout, complete it, capture the real
       Paymob transaction id, confirm exactly one `CreditLot`/`Receipt` and the correct balance.
     - [ ] Failed/cancelled/expired payment: force each outcome in the sandbox, confirm
       `PendingPayment` reaches the correct terminal state and no credits are granted.
     - [ ] Webhook HMAC verified against the *real* Paymob signature (capture the real webhook
       payload Paymob sends, not a synthetic one).
     - [ ] Duplicate webhook: replay the real captured webhook payload a second time, confirm no
       second grant.
     - [ ] Redirect-fallback path: complete a real sandbox payment, deliberately withhold the
       webhook (or delay it), confirm the redirect route alone completes it.
     - [ ] Entitlement/credit grant confirmed by a real DB query, not the API response alone.
     - [ ] Payment monitoring dashboard (needs T020-T024's real Sentry) shows this real
       transaction's events.
  4. Record every checked item's real evidence directly in this task's own status block, the same
     style as every other closed task in this file — a checkbox with no evidence attached does not
     count as passed.

### T043 — Real-transport email staging test

- **Dependencies**: T013-T019.
- **Acceptance criteria**: **Email Gate** passes.
- **Definition of Done**: not a code DoD — same framing as T042, against the **Email Gate**
  checklist, with real received-email evidence attached.
- **Runbook (prepared 2026-09-17, not yet executable — blocked on real SMTP/Resend credentials).**
  T017 already proved the SMTP send pipeline end-to-end against a local Mailpit server — this task
  is the same pipeline against the real chosen transport and a real inbox:
  1. Set `EMAIL_TRANSPORT`/`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (or `RESEND_API_KEY`,
     whichever T013 ultimately confirms) in the staging environment.
  2. Confirm the sending domain's SPF/DKIM/DMARC records if applicable (T013's decision doc should
     already name the sending domain).
  3. **Email Gate, item by item**, each with a real received-email screenshot or header dump:
     - [ ] Registration → verification email actually arrives at a real inbox; the link verifies
       the account exactly once.
     - [ ] Password reset request (registered address) → reset email actually arrives; link works
       exactly once.
     - [ ] Password reset request (unregistered address) → confirm identical API response and no
       email sent (enumeration protection, already proven at the logic level — this only confirms
       the real transport doesn't leak a difference).
     - [ ] Reset token expired/reused → confirm both are rejected under the real transport (logic
       already proven; this is the transport-level re-confirmation).
     - [ ] Payment confirmation (pairs with T042's real payment) → confirm it actually arrives,
       exactly once, for the same real transaction.
  4. Record each item's real evidence (message-id, timestamp, a screenshot of the received email)
     directly in this task's status block.

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
| T005-T012 | Paymob | T005/T007/T009/T012 automated implementation and focused checks completed; T006 blocks real-world exercise (not unit/adverse testing). |
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
