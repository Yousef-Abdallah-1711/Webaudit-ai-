# Quickstart / Verification Scenarios — Production Hardening

This is the testing master plan (Spec Kit Phase 9) plus the payment and email E2E test matrices
(Phases "PAYMENT E2E TEST MATRIX" / "EMAIL E2E TEST MATRIX"). Nothing here is executed by this
planning pass — every row becomes a real test written under a task in `tasks.md`.

## Testing layers, mapped to this repository's existing conventions

```text
Unit          — pnpm exec vitest run --project unit <file> --no-file-parallelism
Contract      — same runner; apps/*/tests/contract/
Integration   — same runner; apps/*/tests/integration/ (real DB/Redis, per AGENTS.md)
Adverse       — pnpm exec vitest run --project adverse <file> --no-file-parallelism
Security      — a subset of "adverse", specifically the forged/replayed/tampered cases below
E2E           — pnpm --filter @webaudit/web test:e2e (Playwright, real browser)
Load          — load-testing/scripts (k6), per specs/004-load-testing-harness
Failure injection — provider/DB/Redis failures, folded into "adverse" per this repo's convention
                     (e.g. provider-exhaustion.test.ts already does this for the AI executor)
Production smoke — manual, staging-first, per the rollout plan in plan.md
```

**Governing rule, unchanged from every other test suite in this repository (AGENTS.md):** provider
calls are always stubbed (`AI_MODE=fixtures` for AI; the stub `PaymentProvider` for payments; a
local SMTP test double or Resend's sandbox mode for email). A suite requiring live spend or a real
external send is a broken suite.

---

## Payment E2E / adversarial test matrix

### Success

| # | Scenario | Assertion |
| - | -------- | --------- |
| 1 | New customer buys credits | exactly one `CreditLot`, one `Receipt`, balance increases by the purchased amount |
| 2 | Existing customer with an active subscription buys additional credits | subscription untouched; credits still granted correctly (kind isolation) |
| 3 | Correct amount charged | the amount Paymob is asked to charge equals `BillingPriceCatalog`'s server-computed amount, never a client-supplied one |
| 4 | Correct product/plan | the `PendingPayment.metadata` (planId or credits count) matches what is ultimately granted |
| 5 | Successful webhook applies exactly once | re-delivering the same webhook a second time produces no second grant (already covered generically by `billing-webhook` tests — extend for the real Paymob event shape) |
| 6 | Confirmation email sent | exactly one payment-confirmation email queued/sent per completed payment |

### Failure

| # | Scenario | Assertion |
| - | -------- | --------- |
| 7 | Declined payment | `PendingPayment` reaches `FAILED`; no credits granted; no confirmation email |
| 8 | Cancelled at checkout | `PendingPayment` reaches `CANCELLED`; no credits granted |
| 9 | Checkout abandoned, never returns | the expiry sweep (state-machines.md §1) eventually marks it `EXPIRED`; no credits granted |
| 10 | Paymob unavailable at checkout-initiation | no `PendingPayment` row is created; user sees a clear, retryable error |
| 11 | Paymob returns malformed webhook data | rejected before any DB write, logged as an anomaly, `500` or `400` as appropriate — never silently accepted as success |

### Security

| # | Scenario | Assertion |
| - | -------- | --------- |
| 12 | Forged webhook (no/invalid signature) | `401`, nothing written |
| 13 | Replayed webhook (same event id, valid signature) | `200`, no second effect (idempotency) |
| 14 | Webhook claims a different amount than the matching `PendingPayment` | rejected, nothing granted (`eventMatchesPending` equivalent for the real provider) |
| 15 | Webhook claims a different currency than expected | rejected — **confirm at implementation time that currency is validated at all today**; if not, this is a gap this feature must close |
| 16 | Webhook references a different user than the `PendingPayment`'s owner | rejected |
| 17 | Webhook references a product/plan/credit-count that doesn't match | rejected |
| 18 | Duplicate `PendingPayment` for the same intent (double-click "Buy") | either deduplicated at creation or both resolve to at most one grant — **decide the exact mechanism in `plan.md`, do not leave ambiguous** |
| 19 | Client attempts to directly call the credit-grant path (bypassing checkout/webhook entirely) | refused — no route exists that grants credits without a verified `BillingEvent` |

### Concurrency

| # | Scenario | Assertion |
| - | -------- | --------- |
| 20 | Simultaneous checkout-initiation for the same user (double-click) | at most one `PendingPayment` proceeds to a real Paymob order per intent, or both proceed and only one converts to a grant — must not double-grant |
| 21 | Duplicate webhook delivered concurrently (two requests racing) | exactly one wins the `BillingEvent` unique-insert race; the loser sees the duplicate short-circuit, not a second effect |
| 22 | Webhook arrives while the user's redirect-back request is also being processed | the webhook (not the redirect) is authoritative for granting; the redirect never itself grants anything (confirm: does any redirect-handling code currently touch credits at all? It should not — verify, don't assume) |

---

## Email E2E test matrix

| # | Scenario | Assertion |
| - | -------- | --------- |
| 1 | Registration | verification email sent; link verifies the account exactly once |
| 2 | Resend verification | previous token invalidated (already implemented — `supersedeEmailTokens`); new one works |
| 3 | Password reset request (registered email) | reset email sent |
| 4 | Password reset request (unregistered email) | identical response, no email sent (enumeration protection — already implemented, re-verify under the real transport) |
| 5 | Reset token expired | rejected, no password change |
| 6 | Reset token reused | rejected on second use — already implemented via the atomic `usedAt` claim gate; re-verify under real load |
| 7 | Payment confirmation | sent exactly once per completed payment |
| 8 | Payment failure (if a failure email is decided in scope) | sent exactly once per failed payment, only if `plan.md` decides this notification is in scope |
| 9 | Mail transport unavailable/times out | the underlying operation (registration/reset/webhook) still succeeds; failure is logged/alerted, never silently swallowed and never blocking |
| 10 | Retry on transient SMTP/API failure | at most the configured retry count, with backoff, before giving up and alerting — decide the exact retry policy in `plan.md` (FR-E05 says do not over-build this) |
| 11 | Duplicate send prevention | a webhook retry (idempotent per `BillingEvent`) must not re-send a confirmation email on its short-circuited duplicate path — verify the email send is inside the "apply effect" branch, not the "acknowledge" branch |

---

## Monitoring verification scenarios (staging)

1. Force a burst of 5xx responses in staging; confirm an alert fires within the configured window.
2. Force a single test account's `AiInvocation` cost past the configured per-user threshold in a
   staging DB; confirm a `CostAlertEvent` is created and an alert fires exactly once for that
   window (re-forcing it within the same window must not re-alert).
3. Fill the `scanPhase` queue past its configured depth in staging; confirm new scan requests
   receive the structured `QUEUE_AT_CAPACITY` refusal and that a priority-tier request still jumps
   ahead of free-tier requests already queued.
4. Kill the staging worker process mid-scan; confirm (a) the existing T312 stalled-job protection
   prevents duplicate AI spend, and (b) the timeout sweep refunds the user within its configured
   window, and (c) this is visible in monitoring as a worker-death event, not silently absorbed.

## Production smoke checklist (executed only after every gate in `plan.md`'s launch-gates section
passes)

- [ ] One real (or sandbox) Paymob payment completes end-to-end in production/staging with real
      credentials, exactly once, correct amount, correct grant, confirmation email received.
- [ ] One real verification email, one real reset email, and one real payment-confirmation email
      are each delivered to a real inbox.
- [ ] The monitoring dashboard shows the smoke-tested payment and email events.
- [ ] A deliberately-forced synthetic error is visible in the error tracker within the expected
      delay.
