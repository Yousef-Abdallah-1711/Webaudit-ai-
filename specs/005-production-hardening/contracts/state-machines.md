# State Machines — Production Hardening

Every state machine below is reconstructed from real, currently-committed code (cited), not
invented. Where this feature adds a state, it is marked **NEW**.

---

## 1. `PendingPayment.status`

**Current (string column, values observed in code):**

```
PENDING ──(webhook: payment.succeeded, matched)──> COMPLETED
```

That is the only transition implemented today (`webhooks.routes.ts`'s `applyProviderPaymentEvent`:
`if (pending.status !== 'PENDING') return;` then sets `'COMPLETED'`). No `FAILED`/`CANCELLED`/
`EXPIRED` terminal state exists yet — FR-P07 requires them.

**Target (promoted to enum per `data-model.md` §1.1):**

```
PENDING ──(payment.succeeded, event matches)────────> SUCCEEDED
PENDING ──(payment.failed, event matches)───────────> FAILED        [NEW]
PENDING ──(subscription/checkout explicitly cancelled by user)──> CANCELLED  [NEW]
PENDING ──(no terminal webhook within a configured window)──────> EXPIRED    [NEW]
```

**Invalid transitions (MUST be refused, matching the existing `if (pending.status !== 'PENDING')
return;` guard's spirit):** any transition out of `SUCCEEDED`, `FAILED`, `CANCELLED`, or `EXPIRED`.
A terminal state is terminal — a second webhook claiming a different outcome for an already-
terminal `PendingPayment` MUST be logged as an anomaly (possible provider bug or fraud attempt)
and MUST NOT overwrite the recorded outcome.

**Who moves `PENDING` → `EXPIRED`:** a scheduled sweep (same shape as `sweepTimedOutScans` for
scans — matching this repository's own established pattern for "nothing else will ever resolve
this, so a sweep must") over `PendingPayment` rows older than a configured checkout-abandonment
window with no terminal webhook received.

---

## 2. `BillingEvent` (idempotency gate, not itself a business state machine)

```
(row does not exist) ──(webhook delivered, signature valid)──> exists, appliedAt = null
exists, appliedAt = null ──(effect applied successfully)──────> appliedAt = <timestamp>
exists, appliedAt = null ──(delivery retried before effect finished)──> retried (no new row, effect re-attempted)
exists, appliedAt != null ──(delivery retried)─────────────────> short-circuit, 200, no re-application
```

Already fully correct (`webhooks.routes.ts`, `createOrRetryBillingEvent`). This feature's Paymob
work MUST reuse this exact mechanism unchanged.

---

## 3. `Scan.state` (existing — reproduced here only to show it is NOT touched by this feature)

Unchanged by anything in this feature. `PENDING → RUNNING_* → COMPLETED | FAILED | CANCELLED |
TIMED_OUT`, per `packages/types/src/domain.ts` and `apps/worker/src/orchestrator/state-machine.ts`,
already audited in `docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md` Part 9.6. Referenced
here only because the queue-backpressure work (FR-B01-B03) touches the same queue a scan uses and
must not alter its state semantics.

---

## 4. Email delivery state — **decision: do not build one**

Neither the existing Resend mailer nor a new SMTP mailer is asked to persist a delivery
state machine (sent/delivered/bounced/complained) in this system's own database. Reasoning: a
delivery/bounce/complaint state machine is exactly what a transactional email provider's own
dashboard already gives an operator (Resend's dashboard already does this per
`PRODUCTION-READINESS-MASTER-PLAN.md` Phase 5's rollout checklist: "Confirm provider-side
delivery, bounce, and rejection events in the Resend dashboard"). Building a parallel one here
would duplicate the provider's own system of record for no benefit this product currently needs.
**If** the chosen transport is instead raw SMTP (see `research.md`'s email-provider decision),
Hostinger's mailbox does not offer an equivalent dashboard — in that case, a minimal
`EmailSendAttempt` log (send attempted, succeeded/failed, provider error if any) becomes justified
specifically to compensate for the missing provider-side visibility, and MUST be added to
`data-model.md` as an explicit amendment if that path is chosen, not assumed here.

---

## 5. Cost-alert state (`CostAlertEvent`, `data-model.md` §3.3)

```
(no row for this scope+window) ──(threshold crossed)──> row created, notifiedAt = now()
(row exists for this scope+window)──(threshold crossed again, same window)──> no new row (dedup)
(window ends)──(new window begins)──> a new row may be created independently
```

This is a write-once-per-breach-window log, not a stateful machine with transitions — intentionally
simple, per FR-C02's requirement and the non-goal in `data-model.md` §3.3 of not building a second
ledger.

---

## 6. Queue job states — BullMQ's own, unmodified

`waiting → active → completed | failed` (with `failed` further subject to this repository's own
existing `attempts`/`maxStalledCount` semantics, already audited in
`docs/reviews/AI-ENGINEERING-TASKS.md` T312). This feature's backpressure work (FR-B01) adds a
**pre-`waiting` rejection decision** (refuse to enqueue at all once a configured depth is exceeded)
— it does not add a new BullMQ job state, it adds an admission-control check before a job is
created.
