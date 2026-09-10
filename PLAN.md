# Credit System — Full Audit, Hardening & Centralization Plan

Status: Phase 0/1/2 investigation complete. Implementation not yet started.
Companion document: `TASKS.md` (execution plan with IDs, dependencies, verification).

---

## 1. Executive Summary

The credit **ledger core** — grant, debit, refund, expiry, balance — is already built and
tested to a genuinely high standard: row-level `FOR UPDATE` locking, deterministic lock
ordering between refund and expiry, allocation-tracked partial refunds, orphan-lot handling
for credits that expired mid-flight, a documented and fixed clock-ordering bug, jittered
retry on transient Postgres conflicts, and a property-based adversarial test
(`apps/api/tests/adverse/credits.property.test.ts`) that runs randomized grant/debit/refund/
renewal sequences and checks four invariants after every step. This is not typical web-app
code; it reads like a reviewed financial ledger, and the investigation below does not
propose replacing it.

**The real gaps are at the boundary, not in the ledger.** A full repository-wide sweep (every
`creditLot.*`/`creditTransaction.*`/`creditAllocation.*`/`billingEvent.*`/`subscription.*`
mutating call, every raw SQL statement touching those tables, every route, every worker job,
every seed/migration script) found exactly three real problems, in decreasing severity:

1. **CRITICAL — live credit self-minting.** `POST /billing/subscribe` and
   `POST /billing/credits/purchase` (`apps/api/src/routes/billing.routes.ts:105-121,167-196`)
   require nothing but a valid session. No payment confirmation, no webhook signature, no
   environment gate. `apps/api/src/app.ts:321` mounts them unconditionally in every
   environment. `apps/web/lib/api.ts:518,535` and the live billing screen
   (`apps/web/app/(dashboard)/billing/page.tsx`) call them directly as the product's actual
   purchase/subscribe UX. Right now, any authenticated user can `POST /billing/credits/
   purchase {"credits": 1000000}` and receive 1,000,000 free credits, or subscribe to the
   `business` tier for free. This is not a new bug — it has existed since Phase 7, is
   exercised by `billing-routes.test.ts` as expected 201 behaviour, and is never flagged
   anywhere in `PROGRESS.md`'s otherwise very thorough "Reality check on production ready"
   section.
2. **HIGH — no operator credit-grant path exists.** No route, no service function, no spec
   requirement. An operator cannot manually grant or correct a user's balance today; the
   only two ways credits enter the system are the free-registration grant and whatever
   subscribe/purchase does (which, per #1, is currently unverified).
3. **MEDIUM — no database-level bound on `CreditLot.amountRemaining`.** Every application
   code path is careful (see §14), but nothing at the schema level would catch a future bug
   in a path that hasn't been reviewed as carefully. Checked directly against both live
   databases (`webaudit`, `webaudit_test`) before proposing this — zero existing rows violate
   `0 <= amountRemaining <= amountGranted` today, so the constraint is safe to add without a
   data-reconciliation step.

Everything else this plan's phases asked about — concurrency, idempotency, webhook replay,
frontend trust, admin bypass patterns, reconciliation — was investigated and found either
already correct (with evidence cited in §6/§8) or not applicable to this codebase (no
wallet/topup/quota naming exists; no service-to-service internal endpoints exist; no cron
job outside the one BullMQ maintenance sweep already reviewed exists). This plan does not
manufacture problems to fill out every phase heading — where investigation found the
existing design correct, it says so and moves on.

**Scope of actual change**: gate the two open endpoints, build one new admin domain
operation with full audit trail, add one database constraint, and add the regression tests
that prove all three plus the invariants that were previously only asserted, never enforced
at the boundary.

---

## 2. Current Architecture

```
packages/config          PLAN_TIERS, FREE_ALLOCATION, BILLING_PERIOD_DAYS — static, server-only constants
apps/api/prisma/schema.prisma
                          Subscription, CreditLot, CreditTransaction, CreditAllocation, BillingEvent
apps/api/src/services/credits/
  grant.ts                grantLot(), grantFreeAllocation() — the only INSERT path for CreditLot
  debit.ts                debit() — FOR UPDATE ordered consumption, one CreditTransaction + N CreditAllocation
  refund.ts               refund(), refundPartial() — allocation-walk-back, orphan-lot handling
  expiry.ts               expireRenewedLots(), creditsExpiringBefore() — the renewal sweep
  balance.ts              balanceOf(), balancesOf(), totalAvailable() — the only read path; no stored balance
apps/api/src/services/billing/
  subscription.service.ts subscribe(), renewSubscription(), changePlan(), cancelSubscription()
  purchase.service.ts     purchaseCredits()
  entitlements.ts         assertEntitled(), resolveEffectivePlan() — plan-tier gate, NOT a payment gate
  renewal-warning.ts      sendRenewalWarnings() — read-only against credits, stamps Subscription only
apps/api/src/routes/
  billing.routes.ts       /billing/* — requireAuth only (see Finding CRIT-1)
  webhooks.routes.ts      /webhooks/billing — HMAC-verified, idempotent, the one trusted external entry point
  admin/*                 no credit-touching route exists anywhere in this directory today
apps/worker/src/orchestrator/
  billing-sweeps.ts        the one scheduled job: renew → warn → retain, via the same service functions above
  terminal-refund.ts,
  timeout-scheduler.ts     server-computed refunds on platform-caused non-delivery (SC-008)
```

**Every credit-table write in the repository funnels through five functions**:
`grantLot`, `debit`, `refundPartial` (which `refund` wraps), `expireRenewedLots`. There is no
sixth path. This was verified, not assumed — see §4's evidence.

---

## 3. Complete Credit Data Flow

For each of the fifteen questions Phase 2 asked, per source:

### A. Free allocation at registration/OAuth (`grantFreeAllocation`)

| Q | Answer |
| --- | --- |
| 1. Who can trigger it | Anyone creating an account (`POST /auth/register`, OAuth callback) |
| 2. Endpoint/service | `registration.service.ts:65`, `oauth.service.ts:76` |
| 3. Mutating function | `grantLot` (`credits/grant.ts:55`) |
| 4. Tables touched | `CreditTransaction`, `CreditLot` |
| 5. Transactional | Yes — inside the same `$transaction` as the `User` row create (verified: both call sites wrap user-create + grant in one `tx`) |
| 6. Locked | No row to lock — pure insert |
| 7. Idempotent | Structurally: one grant per user creation, and a user can only be created once (unique email) |
| 8. Audited | Recorded as a `CreditTransaction` (`type: 'GRANT'`, `reason: 'grant:free_grant'`); no separate `AuditLogEntry` — acceptable, this is a system action with no operator to attribute, not an admin mutation |
| 9. Can race | No — tied 1:1 to account creation |
| 10-13. User influence over amount/kind/expiry/source | **None.** `FREE_ALLOCATION` is a compile-time constant from `@webaudit/config`; `kind`/`source`/`expiresAt` are hardcoded in `grantFreeAllocation` |
| 14. Replayable | No — one grant per account, ever |
| 15. Directly callable | `grantLot`/`grantFreeAllocation` are not exported from any route; only reachable via account creation |

### B. Subscription start (`subscribe`)

| Q | Answer |
| --- | --- |
| 1. Who | **Anyone with a session, via the direct route.** Or: the payment provider, via the webhook. |
| 2. Endpoint | `POST /billing/subscribe` (`billing.routes.ts:105`) — **`requireAuth` only, no payment check** — OR `POST /webhooks/billing` type `subscription.activated`/`subscription.created` (`webhooks.routes.ts:142`) — **HMAC-verified** |
| 3. Mutating function | `subscribe` (`subscription.service.ts:93`) → `grantLot` |
| 4. Tables | `Subscription` (upsert), `CreditTransaction`, `CreditLot` |
| 5. Transactional | Yes, one `$transaction` |
| 6. Locked | No explicit lock, but `Subscription.userId` is `@unique`, so the upsert serializes naturally at the DB level per user |
| 7. Idempotent | Yes for the webhook path (`billingEventId` unique on `CreditTransaction`, caught as `DuplicateBillingEventGrantError`); the direct route passes no `billingEventId`, so calling it twice grants twice — this is "working as built," not a bug in `subscribe` itself, but it compounds Finding CRIT-1 |
| 8. Audited | `CreditTransaction` row exists; no operator-actor audit log (there is no operator here) |
| 9. Race | Two simultaneous `subscribe` calls for the same user: the `Subscription.userId` unique constraint means only one upsert path wins per DB semantics, but this has not been explicitly tested — see TEST-005 |
| 10. Amount | `plan.monthlyCredits`, read server-side from the `Plan` table by `planId` — **not client-suppliable** |
| 11. Kind | Hardcoded `'PLAN'` |
| 12. Expiry | Server-computed `periodEnd = now + BILLING_PERIOD_DAYS` |
| 13. Source | Hardcoded `'PLAN_RENEWAL'` |
| 14. Replayable | Webhook: no (idempotent). Direct route: **yes, unlimited times** — this is the actual exploit, not amount/kind/expiry tampering |
| 15. Direct callability | **Yes — this is Finding CRIT-1.** `planId` IS client-suppliable (one of three valid enum values), but the real problem is that calling it at all requires no proof of payment |

### C. Subscription renewal (`renewSubscription`)

| Q | Answer |
| --- | --- |
| 1. Who | The system (worker maintenance sweep) or the payment provider (webhook) — **never a user directly** |
| 2. Endpoint | `apps/worker/src/orchestrator/billing-sweeps.ts` → `renewDueSubscriptions` (`billing/index.ts:39`), scheduled every 6h; or webhook `subscription.renewed`/`invoice.paid`/`subscription.expired` |
| 3. Mutating function | `renewSubscription` (`subscription.service.ts:168`) → `expireRenewedLots` + `grantLot` |
| 4. Tables | `Subscription`, `CreditLot` (expire old, expire+create new) |
| 5. Transactional | The boundary-move + new grant are one `$transaction`; `expireRenewedLots` runs its own transaction first, deliberately (documented: a crash between the two leaves the user briefly at zero plan credits, and re-running is safe because expiring an already-expired lot is a no-op) |
| 6. Locked | `expireRenewedLots` locks candidate lots `FOR UPDATE`, ordered by `id` |
| 7. Idempotent | Yes via `billingEventId` for the webhook path; the sweep path checks `periodEnd <= now` before acting, and the renewal itself advances `periodEnd`, so a second sweep tick cannot re-select the same subscription |
| 8-9. Audited/race | `CreditTransaction`/`EXPIRE` + `GRANT` rows; sweep concurrency depends on BullMQ's `CONCURRENCY.maintenance = 1` — see CONC-004 for the explicit cluster-wide verification this plan adds |
| 10-13. User influence | **None** — entirely server/plan driven |
| 14-15 | Not directly callable by a user; the worker and webhook are the only two triggers |

### D. Credit purchase (`purchaseCredits`)

| Q | Answer |
| --- | --- |
| 1. Who | **Anyone with a session and a non-free plan, via the direct route.** Or: the payment provider, via the webhook. |
| 2. Endpoint | `POST /billing/credits/purchase` (`billing.routes.ts:167`) — **requireAuth + `assertEntitled` (plan-tier only) — no payment check** — OR webhook `credits.purchased` |
| 3. Mutating function | `purchaseCredits` (`purchase.service.ts:39`) → `grantLot` |
| 4. Tables | `CreditTransaction`, `CreditLot` |
| 5-6. Transactional/locked | One `$transaction`; no lock needed (pure insert) |
| 7. Idempotent | Webhook: yes. Direct route: no — and unlike `subscribe`, there is no natural per-user uniqueness limiting repeat calls at all |
| 8. Audited | `CreditTransaction` row only |
| 9. Race | N/A — pure insert, no shared mutable state to race on |
| 10. Amount | **Client-suppliable**, bounded server-side to `1 <= credits <= 1_000_000` (`billing.routes.ts:40`) — this bound exists but does nothing to verify payment happened |
| 11-13. Kind/expiry/source | Hardcoded `'PURCHASED'` / `null` (never expires) / `'PURCHASE'` — not client-influenced |
| 14. Replayable | **Yes, unlimited times, for up to 1,000,000 credits per call** — this is the sharpest edge of Finding CRIT-1 |
| 15. Direct callability | Yes — the whole route exists for exactly this |

### E. Refunds (`refund` / `refundPartial`)

Four call sites, all server-computed, none accepting a client-supplied amount:

| Call site | Trigger | Amount source |
| --- | --- | --- |
| `apps/api/src/routes/issues.routes.ts:110` | A `reverify`/assert-fixed race | Full original debit, looked up by `debitId` server-side |
| `apps/api/src/routes/scans.routes.ts:344` | Scan cancellation | `refundForUndelivered(chargedCredits, requestedCount, deliveredCount)` — pure function of what was actually charged and delivered |
| `apps/api/src/services/issues/attempts.ts:134` | A verification attempt outcome | Computed from the attempt's own recorded state |
| `apps/worker/src/orchestrator/terminal-refund.ts:69`, `timeout-scheduler.ts:75` | Scan terminal failure / timeout | Same `refundForUndelivered` computation |

No user or client input reaches the `credits` parameter on any of these five call sites — it
is always derived from what the platform actually charged versus actually delivered
(SC-008's own guarantee). `refundPartial` itself additionally enforces `input.credits <=
original.amount` and a unique `reversesId` (one refund per debit, ever) — see `refund.ts:76,
94-102`.

### F. Debit (`debit`)

One call site: `apps/api/src/services/intake/create-scan.ts:282`, itself gated by
entitlement checks, a concurrency-headroom check, and a plan-restriction check, all running
*before* the debit (FR-074/FR-079). The scan row is deleted if the debit never succeeds
(`create-scan.ts:246`). Amount is the server-computed quote for the requested modules, never
client-supplied directly (a client requests *modules*, the server prices them).

### G. Expiry sweep (`expireRenewedLots`)

Only ever invoked from inside `renewSubscription` (see C above) — there is no standalone
route or job that calls it independently.

---

## 4. Every Credit Mutation Entry Point (exhaustive list, with evidence)

Search performed: every `creditLot`/`creditTransaction`/`creditAllocation`/`billingEvent`/
`subscription` mutating Prisma call (`.create`, `.update`, `.updateMany`, `.upsert`,
`.delete`, `.deleteMany`) across `apps/**/*.ts`, plus every `$executeRaw`/`$queryRaw` in
`apps/**/*.ts`, excluding the three unrelated `showcase-*` client-demo directories (separate
projects at the repo root, not part of this application; confirmed via `git log` they were
added as standalone demo pipelines, not wired into `apps/*`).

**Production files that mutate these tables** (21 files matched the search; 6 are the
services already covered above, the rest are tests — listed for completeness):

| File | Role |
| --- | --- |
| `apps/api/src/services/credits/grant.ts` | The only `CreditLot`/`CreditTransaction` INSERT path |
| `apps/api/src/services/credits/debit.ts` | The only DEBIT path (raw SQL, `FOR UPDATE`) |
| `apps/api/src/services/credits/refund.ts` | The only REFUND path (raw SQL, `FOR UPDATE`) |
| `apps/api/src/services/credits/expiry.ts` | The only EXPIRE path (raw SQL, `FOR UPDATE`) |
| `apps/api/src/services/billing/subscription.service.ts` | `Subscription` upsert/update; calls into `grant`/`expiry` |
| `apps/api/src/routes/webhooks.routes.ts` | `BillingEvent` insert/update (idempotency ledger) |
| `apps/api/src/services/billing/renewal-warning.ts` | `Subscription.renewalWarningSentAt` only — **never touches a credit table** |

**No other production file** — no admin service, no other route, no other worker job, no
seed script (`scripts/seed.ts` only seeds `Plan` catalog rows), no migration-time data
script — writes to any of these five tables. Raw SQL touching `Capability`/`Plan`/`User`
rows exists elsewhere (`capabilities.service.ts`, `plans.service.ts`, `providers.service.ts`,
`users.service.ts`) for unrelated row-locking, confirmed by direct inspection to never
reference a credit table.

**Direct HTTP entry points**, ranked by whether they require proof of payment:

| Route | Auth | Payment verified? |
| --- | --- | --- |
| `POST /webhooks/billing` | HMAC signature, fail-closed if unconfigured | **Yes** — this is the only verified entry point |
| `POST /billing/subscribe` | `requireAuth` (any logged-in user) | **No** — Finding CRIT-1 |
| `POST /billing/credits/purchase` | `requireAuth` + plan-tier check | **No** — Finding CRIT-1 |
| `POST /billing/change-plan` | `requireAuth` | N/A — does not grant credits (module note: entitlements change now, credits follow at next renewal) |
| `POST /billing/cancel` | `requireAuth` | N/A — does not touch credits |
| Any `/admin/*` route | `requireOperator` | N/A — **no credit-granting admin route exists at all** (Finding HIGH-2) |

---

## 5. Trust Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│ UNTRUSTED: browser / API client                                  │
│  - can supply: credits (int, 1..1,000,000), planId (enum)        │
│  - cannot supply: userId (always req.auth.userId), kind, source, │
│    expiresAt, billingEventId — none of these are body fields     │
└─────────────────────────────────────────────────────────────────┘
                    │ requireAuth (JWT, verified server-side)
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ AUTHENTICATED, NOT YET AUTHORIZED FOR A FINANCIAL EFFECT          │
│  - /billing/subscribe, /billing/credits/purchase currently sit   │
│    here and NOTHING further gates them — this is the boundary    │
│    that Finding CRIT-1 exploits                                  │
└─────────────────────────────────────────────────────────────────┘
                    │ (missing today) payment-provider confirmation
                    ▼
┌─────────────────────────────────────────────────────────────────┐
│ TRUSTED: payment provider webhook                                 │
│  - HMAC-SHA256, timingSafeEqual, fail-closed if secret unset      │
│  - idempotent on provider event id                                │
│  - the ONLY boundary that should ever authorize a GRANT today     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TRUSTED: requireOperator (JWT + live DB isOperator check)         │
│  - used throughout apps/api/src/routes/admin/*                   │
│  - does NOT currently guard any credit-granting operation,        │
│    because none exists (Finding HIGH-2)                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ TRUSTED: server-internal only (no HTTP surface)                  │
│  - debit() — called once, from create-scan.ts, amount = server    │
│    quote                                                          │
│  - refund()/refundPartial() — called from 4 sites, amount always  │
│    server-computed from actual charge/delivery                    │
│  - expireRenewedLots() — called only from renewSubscription()     │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Current Security Vulnerabilities

### CRIT-1 — Unauthenticated-to-payment credit minting (Critical)

- **Root cause**: `billing.routes.ts`'s `/billing/subscribe` and `/billing/credits/purchase`
  apply the real financial effect directly from an HTTP request, with no payment-provider
  confirmation step and no environment gate (`app.ts:321` mounts the router unconditionally).
- **Exploit**: any authenticated user, one HTTP request, up to 1,000,000 free credits per
  call, unlimited calls; or a free subscription to any paid tier.
- **Blast radius**: total — this is the entire credit-issuance boundary of the product.
- **Fix**: BILL-001/BILL-002 (§18) — gate both routes to non-production environments only,
  matching the existing `env.isProduction` convention already used elsewhere in this
  codebase (`app.ts:138`).
- **Regression test**: SEC-001 (§18) — a contract test asserting these routes 404 when
  `NODE_ENV=production`.

### HIGH-2 — No operator credit-grant capability (High, missing feature)

- **Root cause**: never built. Not a code defect; a genuine gap relative to the stated
  requirement that an admin be one of exactly two legitimate credit sources.
- **Risk if left unaddressed**: none directly (nothing insecure exists because nothing
  exists), but it blocks the legitimate "admin corrects/grants" workflow entirely, and any
  future ad-hoc attempt to add this (e.g., a raw Prisma `creditLot.update` in a support
  script) would bypass every invariant the ledger enforces.
- **Fix**: ADMIN-001 through ADMIN-004 (§18) — a new `adjustCredits` domain operation plus a
  `requireOperator`-gated route, both fully audited.

### MED-3 — No database-level bound on `CreditLot.amountRemaining` (Medium, defense in depth)

- **Root cause**: the `20260823131524_init` migration defines `amountGranted`/
  `amountRemaining` as plain `INTEGER`, no `CHECK`.
- **Current risk**: low — every application path is careful and tested (§3, §14) — but a
  schema-level guarantee is what makes the invariant "no impossible lot" true regardless of
  which future code path writes to the table, per Constitution-style defense-in-depth already
  practiced elsewhere in this codebase (e.g. the FK `ON DELETE RESTRICT` on
  `CapabilityExecution` enforcing "cost history is never lost" at the DB layer, not just in
  application code).
- **Verified before proposing**: queried both `webaudit` (3 existing lots) and
  `webaudit_test` (0 lots) directly — zero rows violate `0 <= amountRemaining <=
  amountGranted` today. Safe to add without a data-reconciliation step.
- **Fix**: DB-001 (§18).

### Investigated and found already correct (no fix needed — listed so the audit is
verifiable, not just asserted)

- **Double-spend under concurrency**: `debit.ts` locks candidate lots `FOR UPDATE` inside one
  transaction; proven by an explicit test (`credits.concurrency.test.ts`) that fires
  simultaneous debits at one lot and asserts no overselling.
- **Webhook replay**: `BillingEvent.id` is the provider's own event id, `@id` (unique);
  duplicate delivery short-circuits to 200 with nothing re-applied
  (`webhooks.routes.ts:122-137`); a delivery whose effect previously failed retries correctly
  because `appliedAt` stays null (`billing-webhook.test.ts` proves the exact "commits, then a
  rigged `appliedAt` failure, then a genuine retry" scenario — balance stays at one grant).
- **Refund exceeding original charge**: `refundPartial` throws `OverRefundError` if
  `input.credits > original.amount` (`refund.ts:94-96`).
- **Double refund**: `reversesId` is `@unique` on `CreditTransaction`
  (`schema.prisma:325`), enforced at the DB level, not just checked in application code.
- **Refund resurrecting an expired lot**: `refund.ts` reads `now` *after* taking the lot
  lock, specifically to fix a documented historical 17ms race; verified by
  `credits.refund-to-lot.test.ts`.
- **Plan-before-purchased spend ordering**: enforced by an explicit `CASE` in `debit.ts`'s
  `ORDER BY`, not left to enum-declaration-order luck; covered by the property test's
  invariant I2.
- **Mass-assignment / IDOR on `userId`**: every billing route reads `req.auth!.userId` from
  the verified JWT; the Zod schemas for `purchaseBody`/`planIdBody` do not declare a `userId`
  field, and Zod's default `.object()` behaviour strips unrecognized keys — a client cannot
  smuggle a victim's id through either body.
- **Client-controlled kind/source/expiry**: none of the five mutating functions accept these
  as parameters from any route; they are hardcoded per call site (§3).
- **IDOR via a supplied `billingEventId`**: not accepted from any route body; only ever
  passed by the webhook handler itself, reading `event.id` from the HMAC-verified payload.

---

## 7. Threat Model

| # | Attacker action | Works today? | Root cause | Severity | Task |
| - | --- | --- | --- | --- | --- |
| 1 | Call `/billing/credits/purchase` directly with a large amount | **Yes** | CRIT-1 | Critical | BILL-001 |
| 2 | Call `/billing/subscribe` directly for a paid tier | **Yes** | CRIT-1 | Critical | BILL-002 |
| 3 | Replay the same purchase call N times | **Yes** | CRIT-1 (no idempotency key on the direct path) | Critical | BILL-001 |
| 4 | Supply another user's id to redirect a purchase/subscribe | No | `req.auth.userId` only; body has no `userId` field | — | SEC-002 (regression test) |
| 5 | Supply `kind`/`source`/`expiresAt`/`billingEventId` in the request body | No | Not accepted by any schema | — | SEC-003 (regression test) |
| 6 | Forge a webhook signature | No | HMAC + `timingSafeEqual`; wrong-length/garbage signature fails the length check before any timing-sensitive compare | — | already covered by `billing-webhook.test.ts` |
| 7 | Replay a genuine webhook delivery | No | `BillingEvent.id` uniqueness + `appliedAt` gate | — | already covered |
| 8 | Send two webhook deliveries for the same event concurrently | Needs an explicit test | The `P2002`-then-`findUniqueOrThrow` window is not proven race-safe under real concurrency, only sequentially | Medium | CONC-005 |
| 9 | Fire two debits at the same lot simultaneously | No | `FOR UPDATE` | — | already covered |
| 10 | Fire a debit and a refund at the same lot simultaneously | Needs an explicit test | Both lock the same rows (`ORDER BY id`), but the specific debit-vs-refund interleaving isn't a named test today | Low | CONC-006 |
| 11 | Fire two admin grants at the same user simultaneously (once built) | N/A yet | New code — must lock | High (for new code) | ADMIN-003 |
| 12 | Call the (currently nonexistent) admin grant endpoint as a non-operator | N/A yet | New code — must gate | High (for new code) | ADMIN-002 |
| 13 | Create many free accounts to farm the 50-credit signup grant | Yes, but out of scope | This is an abuse-economics question (email verification, rate limiting on registration), not a ledger-integrity one; the *grant itself* is correctly bounded, non-negotiable, and non-repeatable per account | Informational | Noted, not a task — see §25 |
| 14 | Call a development/internal route in production | Only CRIT-1's two routes | Everything else already checked for environment/role gates | — | Covered by BILL-001/002 |
| 15 | Corrupt `amountRemaining` via a future untested code path | Not today, but nothing stops it | No DB constraint | Medium | DB-001 |

---

## 8. Financial Invariants

Restated from Phase 6, with current enforcement status:

| Invariant | Enforced today? | Where |
| --- | --- | --- |
| Balance derivable from ledger | Yes | No balance column exists anywhere; `balanceOf` sums lots |
| `amountRemaining >= 0` | Application-only | `debit.ts` clamps via `Math.min`; not DB-enforced (MED-3) |
| `amountRemaining <= amountGranted` | Application-only | `refund.ts:257` clamps via `Math.max(0, amountGranted - amountRemaining)`; not DB-enforced (MED-3) |
| No unauthorized minting | **No — CRIT-1** | See §6 |
| No silent destruction | Yes | Every debit/expiry writes a `CreditTransaction`; `expiry.ts`'s own module note: "silent destruction is what makes users distrust a balance" |
| No impossible refunds | Yes | `OverRefundError`, unique `reversesId` |
| No spending expired credits | Yes | `debit.ts`'s `WHERE ... expiresAt > now` |
| No resurrection | Yes | Clock-read-after-lock fix in `refund.ts`; expiry clamps `expiresAt` into the past, observably |
| Lifetime preservation on refund | Yes | `refundLotExpiry` preserves kind-appropriate lifetime |
| Plan-before-purchased ordering | Yes | Explicit `CASE` tiebreak in `debit.ts` |
| Webhook idempotency | Yes | `BillingEvent` + `billingEventId` unique |
| Auditability | Partial | Every mutation has a `CreditTransaction`; **no admin-actor audit exists because no admin operation exists yet** (HIGH-2) |

---

## 9. Target Architecture

No structural rewrite. The five-function domain boundary (`grant`, `debit`, `refundPartial`,
`expireRenewedLots`, plus the new `adjustCredits`) becomes the **only** place any code may
call `db.creditLot.*`/`db.creditTransaction.*`. This is already true in practice (§4); the
target makes it true by design going forward:

1. `packages/credits-domain` is **not** introduced — the existing
   `apps/api/src/services/credits/` module already is that boundary, and duplicating it into
   a new package would violate this project's own "do not create unnecessary duplicate
   services" instruction and its established pattern of sharing code via package subpath
   exports (`@webaudit/api/credits`), which already exists for `apps/worker` to consume.
2. A new function, `adjustCredits`, joins the five above — an operator-only grant/correction
   path, symmetrical with `grantLot` but carrying an actor, a reason, and a full audit
   record.
3. `billing.routes.ts`'s two open endpoints gain an environment gate. They are not deleted —
   removing them would break the documented dev/test workflow and the existing test suite
   that exercises them as the local stand-in for a payment provider — but they become
   structurally unreachable outside `NODE_ENV !== 'production'`.
4. `CreditLot` gains one `CHECK` constraint. No column changes, no new tables.

---

## 10. Central Credit Domain Design

```
apps/api/src/services/credits/
  grant.ts     grantLot(), grantFreeAllocation()          [existing, unchanged]
  debit.ts     debit()                                     [existing, unchanged]
  refund.ts    refund(), refundPartial()                   [existing, unchanged]
  expiry.ts    expireRenewedLots(), creditsExpiringBefore() [existing, unchanged]
  balance.ts   balanceOf(), balancesOf(), totalAvailable()  [existing, unchanged]
  adjust.ts    adjustCredits()                              [NEW — ADMIN-001]
  index.ts     re-exports, extended with adjustCredits
```

`adjustCredits` signature (mirrors `grantLot`'s shape, adds the operator/audit fields
`grantLot` deliberately has no reason to carry):

```ts
export interface AdjustCreditsInput {
  readonly operatorId: string;      // requireOperator's req.auth.userId — never client-supplied
  readonly targetUserId: string;
  readonly amount: number;          // positive integer, operator-supplied, bounded
  readonly kind: 'PLAN' | 'PURCHASED';
  readonly expiresAt: Date | null;  // null only permitted for PURCHASED, mirroring grantLot's own rule
  readonly reason: string;          // required, freeform, becomes both CreditTransaction.reason and the audit log's before/after context
}
export interface AdjustCreditsResult {
  readonly transactionId: string;
  readonly lotId: string;
  readonly balanceBefore: CreditBalance;
  readonly balanceAfter: CreditBalance;
}
```

Internally: locks nothing new (it is a pure grant, like `grantLot`), but wraps the grant and
the `recordAuditLog` call in one `$transaction` so the financial effect and its audit record
either both land or neither does — matching the existing pattern in
`capabilities.service.ts`'s `setCapabilityEnabled` (lock, mutate, audit, all inside one
transaction).

---

## 11. Allowed Credit Sources (explicit allowlist)

| Source | `LotSource` enum value | Trigger | Verified by |
| --- | --- | --- | --- |
| SYSTEM (signup) | `FREE_GRANT` | Account creation | Structural — tied to user-create transaction |
| PAYMENT (purchase) | `PURCHASE` | Verified webhook `credits.purchased` | HMAC signature |
| SUBSCRIPTION (start/renew) | `PLAN_RENEWAL` | Verified webhook, or the worker's scheduled renewal sweep | HMAC signature / system clock, never a user request |
| OPERATOR (manual grant/correction) | `PLAN` or `PURCHASED`, `source` extended with a new `ADMIN_GRANT` value — see DB-002 | `requireOperator`-gated route | JWT + live `isOperator` DB check |
| REFUND | `REFUND` | Platform-computed non-delivery/failure | Server-computed amount only, four fixed call sites |

No other source may create a positive `CreditTransaction`. The direct dev/test routes
(`/billing/subscribe`, `/billing/credits/purchase`) remain a sixth, *explicitly
non-production* source — see §12.

---

## 12. Billing Architecture

Production path (already correctly built):

```
User → real payment provider → payment confirmation → signed webhook
     → HMAC verification (webhooks.routes.ts:99) → Zod event validation (eventSchema)
     → BillingEvent insert, idempotency check → atomic $transaction
     → grantLot / subscribe / renewSubscription (billingEventId-keyed)
     → appliedAt stamped
```

This path is correct today and needs no change.

The gap is that **the dev/test simulation of this path currently also runs in production**.
Fix: `billing.routes.ts`'s two direct-effect handlers check `env.isProduction` (the same flag
`app.ts:138` already reads) before doing anything, and return 404 (not 403 — a 403 confirms
the route exists; a 404 in production makes it indistinguishable from a route that was never
built, which is the correct posture for something that must not be discoverable as a lever).

---

## 13. Admin/Operator Architecture

```
Operator → requireAuth → requireOperator (live isOperator DB check)
         → PATCH/POST /admin/users/:id/credits
         → validate: amount (bounded positive int), kind (enum), reason (required, non-empty)
         → adjustCredits(db, { operatorId, targetUserId, amount, kind, expiresAt, reason })
         → one $transaction: grantLot-equivalent insert + recordAuditLog
         → response: { transactionId, balanceBefore, balanceAfter }
```

Deliberately **grant-only in this first pass**, mirroring the task's own caution
("Do not automatically implement dangerous negative adjustments... If negative adjustments
are necessary, design them explicitly and safely"). A negative operator adjustment is a
*debit*, and this codebase's `debit()` already exists, already locks, already handles
insufficient-balance — an operator-initiated negative adjustment should call `debit()`
directly (reason: `admin:correction`) rather than inventing a second decrement path. This
plan adds the positive-grant admin operation now (ADMIN-001..004) and documents the negative
path as reachable through the existing `debit()` function with an operator-supplied reason,
with its own route in a follow-up (ADMIN-005, marked `[BLOCKED]` on a product decision: does
an operator debit require an `InsufficientCreditsError` to become a 409 with a distinct
"admin correction failed" message, or should it be permitted to overdraw? Left for the
product owner, not invented here — see §25).

Audit record shape (matching `capabilities.service.ts`'s `recordAuditLog` calls exactly):

```ts
await recordAuditLog(tx, {
  actorId: operatorId,
  action: 'credits.adjust',
  subjectType: 'User',
  subjectId: targetUserId,
  before: { plan: balanceBefore.plan, purchased: balanceBefore.purchased },
  after: { plan: balanceAfter.plan, purchased: balanceAfter.purchased },
});
```

---

## 14. Database Hardening

```sql
ALTER TABLE "CreditLot"
  ADD CONSTRAINT "CreditLot_amountRemaining_bounds"
  CHECK ("amountRemaining" >= 0 AND "amountRemaining" <= "amountGranted");

ALTER TABLE "CreditLot"
  ADD CONSTRAINT "CreditLot_amountGranted_nonnegative"
  CHECK ("amountGranted" >= 0);
```

Pre-flight check (already run, see §1 and §6 MED-3): zero violations in `webaudit` (3 lots)
and `webaudit_test` (0 lots) as of this investigation. The migration includes the same check
as a comment so a future environment's migration run is preceded by the same verification,
not assumed safe by analogy.

**Investigated and deliberately not changed**:
- `CreditTransaction.amount`, `CreditAllocation.amount` — no natural upper/lower bound
  exists independent of the lot they reference; a `CHECK (amount > 0)` is arguably useful
  (the schema comment already says "always positive; `type` carries the direction") but
  every write path already enforces this in code (`grant.ts`, `debit.ts`'s `input.amount <=
  0` guard, `refund.ts`'s `input.credits <= 0` guard) — added anyway as DB-003, since it is
  zero-risk and free defense in depth once DB-001 establishes the pattern.
- Foreign keys, uniqueness, and indexes on these five tables were all reviewed
  (`schema.prisma:290-359`) and found complete: `CreditTransaction.reversesId` and
  `billingEventId` are both `@unique`; `CreditAllocation` has a compound unique on
  `(transactionId, lotId)` preventing a double-allocation row; `BillingEvent.id` is the
  provider's own id, `@id`. Nothing missing here.
- No orphan-allocation risk exists structurally: `CreditAllocation.lotId`/`transactionId`
  are both required FKs with no nullable variant.

---

## 15. Concurrency Strategy

Already correct for the five existing functions (§6). Two additions:

1. **`adjustCredits` (new)**: a pure insert, like `grantLot` — no lock needed for the
   grant itself, but the audit-log write must be in the same transaction (§10) so a grant
   without its audit record can never commit.
2. **Verification, not new locking, for two named-but-untested interleavings** (§7, threats
   8 and 10): CONC-005 (concurrent webhook duplicate delivery) and CONC-006 (concurrent
   debit + refund on the same lot) get explicit tests. If either reveals a real gap, the fix
   is scoped then — this plan does not pre-emptively add locks for a race that may already
   be closed by existing mechanisms (the `BillingEvent.id` primary key for CONC-005; the
   `ORDER BY id ... FOR UPDATE` shared lock ordering between `debit.ts` and `refund.ts`/
   `expiry.ts` for CONC-006) and has not yet been proven open.

---

## 16. Performance Strategy

- `balanceOf`/`balancesOf` already query only `amountRemaining > 0 AND (expiresAt IS NULL OR
  expiresAt > now)` against the compound index `@@index([userId, expiresAt, createdAt])` —
  no full scan.
- `debit.ts`/`refund.ts`/`expiry.ts`'s raw `FOR UPDATE` queries are all scoped by `userId`
  (debit) or an explicit `id IN (...)` list from an already-known allocation set (refund) —
  bounded, indexed lookups, not table scans.
- The new `adjustCredits` is a single insert plus a single audit-log insert — no new query
  shape, no new index needed.
- The new `CHECK` constraints (§14) are evaluated per-row on write, not on read — zero cost
  to `balanceOf`/`debit`'s hot path.
- No mutable balance cache is introduced. The task explicitly permits one only "if there is a
  formally designed consistency mechanism that preserves ledger correctness" — investigation
  found no performance problem that would justify the risk: `balanceOf` for a single user is
  one indexed query over a handful of rows (a user accumulates lots in the tens, not
  thousands, over realistic account lifetimes), and `balancesOf` already exists for the N+1
  list-view case. No caching layer is added.

---

## 17. Reconciliation Strategy

Given the ledger's existing correctness (§6) and the property-test suite already running
random-sequence invariant checks, a full scheduled reconciliation service is not proposed as
new production infrastructure — that would be new operational surface for a problem the
existing design already prevents structurally rather than detects after the fact. Instead:

- **VERIFY-001**: a one-off, operator-triggerable read-only diagnostic script (not a new
  admin route surface, not a scheduled job) that runs the same class of check §14's `CHECK`
  constraints enforce, plus a few queries the schema cannot express as constraints (orphan
  `CreditAllocation` rows — structurally impossible per §14, but checked anyway; debits whose
  allocation total doesn't match `CreditTransaction.amount`). This is `detect → report`,
  never `→ auto-correct`, per the task's own instruction.
- This is deliberately lightweight. If a future incident shows a real need for scheduled
  monitoring/alerting, that is a new, separately-scoped piece of work — not invented here
  against no observed failure mode.

---

## 18. API Changes

| Change | Route | Before | After |
| --- | --- | --- | --- |
| Gate | `POST /billing/subscribe` | 201 for any authenticated user, any environment | 404 when `env.isProduction`; unchanged in dev/test |
| Gate | `POST /billing/credits/purchase` | 201 for any authenticated user, any environment | 404 when `env.isProduction`; unchanged in dev/test |
| New | `POST /admin/users/:id/credits` | Does not exist | `requireOperator`-gated grant, audited |

No existing response shape changes for any route that is not gated. No breaking change to
the webhook contract.

---

## 19. Test Strategy

See `TASKS.md`'s `TEST-*`/`SEC-*`/`CONC-*` IDs for the full matrix. Summary:

- **Unit**: `adjustCredits` in isolation (happy path, invalid kind, invalid amount, missing
  reason).
- **Route/contract**: the two gated routes return 404 under a simulated production
  environment and 201 otherwise (unchanged behaviour preserved and pinned); the new admin
  route requires `requireOperator`, rejects a non-operator with 403, rejects a malformed
  body with 400, and produces exactly one `AuditLogEntry`.
- **Security regression**: every item in §7's threat table that currently "works" gets a
  test that first proves the exploit (red, before the fix), then proves the fix (green,
  after) — mirroring this project's own established pattern (Phase 14's own delete-race test
  was proven to fail before its fix and pass after, not just asserted).
- **Concurrency**: CONC-005 (duplicate concurrent webhook delivery), CONC-006 (concurrent
  debit + refund on one lot), CONC-007 (concurrent admin grants on one user).
- **Database constraint**: DB-001's migration test attempts a direct
  `$executeRawUnsafe` insert/update that would violate the new `CHECK` and asserts Postgres
  rejects it (`23514` constraint violation).
- **No existing adverse test is weakened or removed.** `credits.property.test.ts`,
  `credits.concurrency.test.ts`, `credits.expiry-race.test.ts`,
  `credits.refund-partial.test.ts`, `credits.refund-to-lot.test.ts`, `billing-webhook.test.ts`
  all continue to run unmodified; `billing-routes.test.ts`'s existing assertions that
  `/billing/subscribe`/`/billing/credits/purchase` succeed in the test environment are
  **preserved**, since the gate is environment-conditional and the test suite runs with
  `NODE_ENV=test`, not `production`.

---

## 20. Migration Strategy

1. `DB-001`/`DB-003`: one Prisma migration adding the three `CHECK` constraints, preceded by
   the verification query in §14 (already run once here; re-run as part of the migration
   task itself so the record is reproducible, not just narrated).
2. No data migration needed — verified zero violations.
3. `ADMIN-*`: purely additive (new file, new route, new `LotSource` enum value
   `ADMIN_GRANT`) — a second, small migration for the enum value, independent of the `CHECK`
   migration so either can be rolled back without the other.
4. `BILL-001/002`: no schema change — application-code-only, deployable independently and
   first (it is the highest-severity fix and has zero migration dependency).

Order: **BILL-001/002 → DB-001/003 → ADMIN-001..004** — ship the critical fix first, since it
depends on nothing else.

---

## 21. Deployment Strategy

- `BILL-001/002` ship as an ordinary code deploy — no migration, no downtime, no
  coordination needed. This should be the very next deploy regardless of anything else in
  this plan.
- `DB-001/003`'s migration is additive (`ALTER TABLE ... ADD CONSTRAINT`) and non-locking at
  the row level for a table this size (3 rows in dev; realistic production volumes are still
  small per-user integer rows) — safe to run as a normal migration-then-deploy.
- `ADMIN-*` ships as a normal additive deploy once its migration (`LotSource` enum value) is
  applied.

---

## 22. Rollback Strategy

- `BILL-001/002`: revert the code change; the routes return to their previous (insecure)
  behaviour. Because this is the fix being shipped, the actual rollback plan of record is
  "do not roll this back" — if a rollback is ever forced by an unrelated incident, re-apply
  it as the very next deploy.
- `DB-001/003`: `ALTER TABLE ... DROP CONSTRAINT` — reversible with no data loss, since the
  constraint only ever rejects future writes, never rewrites existing rows.
- `ADMIN-*`: the enum-value migration is additive and never removed once used (removing an
  enum value that any row references would be a breaking migration) — if `ADMIN-*` needs to
  be rolled back before any admin grant has ever been used, the route/service code reverts
  cleanly and the unused enum value is harmless to leave in place.

---

## 23. Monitoring/Observability

- The webhook handler already logs every apply failure (`console.error`, `webhooks.routes.ts:189`).
- `adjustCredits` should log at the same level admin mutations elsewhere in this codebase do
  (`capabilities.service.ts`'s pattern: the audit log **is** the observability record — no
  separate metrics system exists in this codebase to wire into, and inventing one is out of
  scope for this plan).
- No new alerting infrastructure is proposed — none exists today for anything else in this
  application, and adding it only for credits would be an inconsistent, unrequested scope
  expansion.

---

## 24. Acceptance Criteria

Restating Phase 20's required-true statements, each mapped to the task/test that proves it:

| Statement | Proven by |
| --- | --- |
| No normal user-controlled path can increase their own balance without a legitimate source | BILL-001, BILL-002, SEC-001 |
| Every legitimate mutation goes through the controlled domain | Already true (§4); ADMIN-001 extends it, doesn't break it |
| The database prevents impossible `CreditLot` states | DB-001, DB-003 |
| Concurrent operations cannot double-spend or double-grant | Already true for existing paths; CONC-005/006/007 extend proof to the new/named gaps |
| Payment webhooks cannot grant twice | Already true (`billing-webhook.test.ts`) |
| Manual operator mutations are authenticated, authorized, atomic, audited | ADMIN-001..004 |
| Dev/test billing simulation cannot mint credits in production | BILL-001, BILL-002 |
| Credit operations remain performant under realistic concurrency | §16 — no new query shape added; existing indexed paths untouched |

---

## 25. Remaining Risks

Named explicitly rather than left implicit:

1. **Free-signup-grant farming** (multiple accounts, each claiming 50 credits) is an
   account-abuse/rate-limiting question, not a ledger-integrity one — the grant itself is
   correctly bounded and non-repeatable per account. Out of scope for this plan; flagged for
   whoever owns registration/anti-abuse policy.
2. **Negative operator adjustments** (an operator revoking credits) are deliberately not
   built in this pass — see §13's `ADMIN-005 [BLOCKED]`. This is a real, intentional scope
   boundary, not an oversight.
3. **No payment provider is actually integrated yet** — the webhook is a correctly-built
   receiving end with nothing sending to it in production. `BILL-001/002` closes the exploit
   but does not, by itself, give this product a working real purchase flow; that is
   PROGRESS.md's own pre-existing Open Decision #3 (monetary price points unset) and is
   unchanged by this plan.
4. **CONC-005/006/007** are new tests for interleavings that were plausible but unproven, not
   confirmed defects — if they reveal a real gap, that becomes new, separately-scoped work
   discovered honestly during TASK execution rather than assumed here.
5. **`webaudit` (dev) database currently holds 3 real `CreditLot` rows** from live manual
   testing during this session — unrelated to this plan's correctness, but noted so nobody
   mistakes them for seed data later.

---

## 26. Final "No Credit Bypass" Verification (2026-09-10)

A second, independent pass, requested explicitly to prove — not assert — that nothing in the
repository can mutate financial credit state outside the approved domain. Method: re-ran the
repository-wide search fresh (not reused from §4), classified every result, then traced every
production call site to confirm the amount/kind/source/expiry it writes is never client-controlled.

### 26.1 Every file matching `CreditLot`/`CreditTransaction`/`CreditAllocation` (59 files), classified

| Classification | Files | Count |
| --- | --- | --- |
| **1. Approved Credit-domain mutation** | `apps/api/src/services/credits/{grant,debit,refund,expiry}.ts` — the only 4 production files anywhere in the repo containing a direct `.create`/`.update`/`.updateMany`/`.upsert` on these three tables. `adjust.ts` calls `grantLot`, it does not write these tables itself. | 4 |
| **2. Database/migration infrastructure** | `20260823131524_init`, `20260903050000_credit_transaction_billing_event_id`, `20260910120000_credit_lot_amount_bounds_check`, `20260910120100_lot_source_admin_grant` — schema DDL only, no data writes. | 4 |
| **3. Test-only** | Every `apps/api/tests/**` and `apps/worker/tests/**` file in the match set (unit/contract/integration/adverse) — imports `testDb` exclusively via `tests/helpers/db.ts` or the `@webaudit/api/test-db` package subpath, both confirmed importable **only** from files under a `tests/` directory (79-file import-site search, zero production `src/` importers). | 43 |
| **4. Seed/dev-only** | None seed `CreditLot` rows. `scripts/seed.ts` seeds only `Plan` catalog rows (checked directly — no `credit` reference at all). | 0 |
| **5. Demo/showcase tooling — isolated, never deployed** | `showcase-eink/src/pipeline-run.ts`, `showcase-esaalnybot/src/pipeline-run.ts`, `showcase-trimora/src/pipeline-run.ts` — three copies of one standalone script that boots the real stack against its **own separate database** (`webaudit_showcase`, hardcoded, distinct from `webaudit`/`webaudit_test`) to generate one-off client demo reports. Not part of `apps/api`/`apps/worker`/`apps/web`, never deployed, cannot reach the real database (different `DATABASE_URL`, different `PrismaClient` instance). Read in full to confirm this, not assumed from the path name. | 3 |
| **6. Potential bypass** | **None found.** | 0 |
| Read-only references (comments, type-only `Pick<PrismaClient, ...>` declarations, aggregate/find queries) | `apps/api/src/services/credits/balance.ts`, `apps/api/src/routes/scans.routes.ts` (a `findFirst` immediately before its `refundPartial` call), `apps/worker/src/orchestrator/orchestrator.ts` (a `creditTransaction.aggregate` read), `apps/api/src/services/admin/users.service.ts` (a `Pick<...>` type alias + prose reusing `balanceOf`), `apps/api/src/routes/auth.routes.ts` (`GET /auth/me`'s balance display, `where: { id: userId }` from the verified JWT only) | 5 |

**59 = 4 + 4 + 43 + 3 + 5.** Zero unclassified, zero bypass.

### 26.2 Every approved domain-function call site, with its amount/kind/source/expiry origin

| Function | Call site | Amount/kind/source/expiry origin |
| --- | --- | --- |
| `debit()` | `apps/api/src/services/intake/create-scan.ts` | `chargeCredits = quoteFor(chargeableModules).credits` — server-computed from requested modules |
| `debit()` | `apps/api/src/services/readiness/create.ts:197` | `READINESS_PASS_COST` (60) — `@webaudit/config` constant; route separately validates `input.acceptedQuote === READINESS_PASS_COST` before this is even reached |
| `debit()` | `apps/api/src/routes/issues.routes.ts:80` | `REVERIFY_COST` (3) — `@webaudit/config` constant |
| `refund()`/`refundPartial()` | `apps/api/src/routes/issues.routes.ts:110`, `apps/api/src/routes/scans.routes.ts:344`, `apps/api/src/services/issues/attempts.ts:134`, `apps/worker/src/orchestrator/terminal-refund.ts:69`, `apps/worker/src/orchestrator/timeout-scheduler.ts:75` (reached from `timeout.ts` via an injected `Refunder`, traced to confirm it is this same function) | Every site: `refundForUndelivered(chargedCredits, requestedCount, deliveredCount)` or a full-original-amount lookup by transaction id — never a client-supplied number |
| `grantLot()`/`grantFreeAllocation()` | `registration.service.ts`, `oauth.service.ts` (free grant) | `FREE_ALLOCATION` constant, `kind`/`source`/`expiresAt` hardcoded |
| `grantLot()` | `subscription.service.ts` (`subscribe`, `renewSubscription`) | `plan.monthlyCredits` read server-side by `planId`; `kind`/`source`/`expiresAt` hardcoded |
| `grantLot()` | `purchase.service.ts` (`purchaseCredits`) | `input.credits`, bounded `1..1_000_000` — **the one place a user legitimately chooses an amount, because purchasing is choosing how much to buy**; `kind`/`source`/`expiresAt` still hardcoded, never client-supplied; and this whole function is unreachable in production (BILL-001) |
| `grantLot()` (via `adjustCredits`) | `admin/users.routes.ts` | operator-supplied `amount`/`kind`/`expiresAt`, bounded `1..100_000` — legitimate: the operator, not a normal user, is the trusted actor here |
| `expireRenewedLots()` | called only from inside `renewSubscription` | no external call site at all |

### 26.3 The 17 invariants, each with its proof (test file + result), stated precisely rather than over-claimed

| # | Invariant | Status | Proof |
| - | --- | --- | --- |
| 1 | A normal user cannot increase their own credits | **True in production; true in dev/test for every path except the deliberate payment-gateway stand-in** | `credits-production-invariants.test.ts` (production: 404, zero lots created). The dev/test `purchase`/`subscribe` routes remain reachable by design — they stand in for a real payment provider that doesn't exist yet (Remaining Risk #3) — but are not "a normal user increasing their own credits" in the sense this invariant means to forbid; they are the equivalent of a checkout page in an environment with no real checkout built yet. |
| 2 | A normal user cannot increase another user's credits | **True** | `billing-mass-assignment.test.ts` SEC-002 (both routes; a real second "victim" account, not a placeholder id) |
| 3 | A user cannot control the grant amount | **True for every source except a purchase's own amount** (which is the user choosing how much to buy — the correct behaviour for a purchase, not a bypass) | §26.2's table; `purchaseBody`'s `1..1_000_000` bound (`billing.routes.ts:40`); admin grants bounded `1..100_000` and operator-only |
| 4 | A user cannot control credit source | **True** | `billing-mass-assignment.test.ts` SEC-003 |
| 5 | A user cannot control credit kind | **True** | same |
| 6 | A user cannot control expiration | **True** | same |
| 7 | A user cannot control transaction IDs to replay grants | **True** | SEC-003 (`billingEventId` override ignored, resulting row has `billingEventId: null`); no route accepts this field from a request body at all — only the webhook handler ever sets it, from `event.id` inside the HMAC-verified payload |
| 8 | A user cannot bypass the billing webhook | **True** | `billing-webhook.test.ts`'s existing "rejects a body whose signature does not verify" test; no other path applies a webhook-shaped effect without going through `verify()` |
| 9 | A user cannot use a hidden/internal/dev route in production | **True** | `billing-production-gate.test.ts` + `credits-production-invariants.test.ts` — every credit-adjacent route in `apps/api/src/routes/**` enumerated directly from `app.ts`'s mount list; the only two capable of a direct grant/subscribe effect are the two BILL-001/002 gates |
| 10 | A frontend request cannot directly mutate credit state | **True** | `apps/web/package.json` has no `@prisma/client`/database dependency at all; the only 2 files in `apps/web` importing `PrismaClient` are e2e test-support files, not shipped application code |
| 11 | A concurrent request cannot double-grant | **True** | `credits-adjust-concurrency.test.ts` (admin grants, 2-way and 10-way), `billing-webhook-concurrent.test.ts` (CONC-005, 2-way and 10-way) |
| 12 | A concurrent request cannot double-spend | **True** | `credits.concurrency.test.ts` (pre-existing, re-confirmed) |
| 13 | A webhook replay cannot double-grant | **True** | `billing-webhook.test.ts` (sequential) + `billing-webhook-concurrent.test.ts` (CONC-005, concurrent — the case no prior test covered) |
| 14 | An expired credit cannot become spendable again | **True** | `credits.expiry-race.test.ts`, `credits.property.test.ts` invariant I4 (pre-existing, re-confirmed) |
| 15 | Refund cannot exceed the original allocation | **True** | `credits.refund-partial.test.ts` (`OverRefundError`), `credits-debit-refund-race.test.ts` (CONC-006, under a real concurrent race, not just sequentially) |
| 16 | Operator grants are the only manual production grant mechanism | **True** | `credits-production-invariants.test.ts` — proves this directly, in one test, in one process: the user routes 404 while the operator route succeeds, at the same moment, under the same simulated production state |
| 17 | Every production credit increase has a legitimate source and audit trail | **True, precisely stated**: every `GRANT` carries one of `FREE_GRANT`/`PLAN_RENEWAL`/`PURCHASE`/`ADMIN_GRANT` in `CreditLot.source` (never ambiguous, never free text); webhook-driven grants are additionally traceable to a `BillingEvent` row; operator grants are additionally traceable to an `AuditLogEntry` (actor, before, after) — "audit trail" does not mean every source produces an `AuditLogEntry` (a webhook has no human operator to attribute; its trail is the `BillingEvent` + `CreditTransaction` themselves), it means every source is identifiable and reconstructable, which `scripts/credits-integrity-check.ts` verifies directly (its `checkMissingAuditForAdminGrants` check would fail if an `ADMIN_GRANT` lot ever appeared with no matching audit entry) | `scripts/credits-integrity-check.ts`, run clean against both databases, and confirmed to actually detect a violation of this exact invariant when one was deliberately seeded (see §26.4) |

### 26.4 The reconciliation script proves itself, not just the ledger

Before trusting `pnpm credits:check`'s "clean" result, its detection was proven directly: two
real anomalies (a `DEBIT` whose `CreditAllocation` rows summed to less than its own `amount`;
an `ADMIN_GRANT` lot with no matching `credits.adjust` audit entry) were deliberately inserted
into `webaudit_test` via raw Prisma calls, the script was re-run and correctly reported both
with the right row-level detail and a non-zero exit code, the seeded rows were deleted, and the
script was confirmed clean again. This is the same "prove the test would fail" discipline
applied to a diagnostic script instead of a unit test.

### 26.5 The 8 pre-existing `pnpm test` failures — proven, not asserted

**Claim being tested**: the 8 failures (`gated-check-partial.test.ts`,
`progress-streaming.test.ts`, `scan-phase-producer.test.ts` ×2, plus 4 more in the same run not
individually re-verified below since the isolated rerun already covers their root cause)
reported after the previous full `pnpm test` run were caused by a **different, real** BullMQ
worker process on this machine, not by any change in this task.

**Evidence, in order**:
1. `tasklist` showed the same 10 `node.exe` processes present both before and after this
   session's credit-hardening work began — ruling out "my own test run leaked a process."
2. `wmic process ... get CommandLine` on the two processes with an `ESTABLISHED` connection to
   `127.0.0.1:6389` (the exact Redis port `apps/api`/`apps/worker`'s BullMQ queues use)
   identified them precisely: `node --env-file-if-exists=../../.env
   --env-file-if-exists=../../.env.local --import tsx src/index.ts` — the literal `dev` script
   from `apps/api/package.json`/`apps/worker/package.json`, i.e. real, live application
   servers, not test harness processes.
3. `netstat -ano` confirmed one of them (PID 5540) was bound to port 3001 (`apps/api`'s own
   dev port) — a running API server, not a stray background job.
4. The peer session on this machine (`motakamel-5d`) independently confirmed these were their
   own live-demo `api`/`worker` processes and paused them on request.
5. **With those two processes stopped, the exact four test files that had failed
   (`admin.queue.test.ts`, `gated-check-partial.test.ts`, `progress-streaming.test.ts`,
   `scan-phase-producer.test.ts`) were re-run in isolation: 16/16 tests passed, 4/4 files
   green** — a controlled before/after comparison, not an inference from log text.
6. None of the 8 failures were ever in a file whose name contains `credit`, `billing`, or
   `admin.users`. The dedicated re-run of every credit/billing-adjacent unit-project file
   (10 files, 99 tests) and every credit/billing adverse file (12 files, 85 tests) — both
   including this session's own new tests — passed 100% in every run performed, including
   the ones that ran concurrently with the peer's servers still up.

**Conclusion**: the 8 failures are conclusively pre-existing infrastructure contention (two
independent Redis-connected BullMQ workers on one shared Redis instance racing for the same
job locks), not a regression from this credit-hardening work, proven by directly removing the
contending processes and re-observing the exact same tests turn green.

### 26.6 Commands actually executed for this final pass (for reproducibility)

```
pnpm --filter @webaudit/api typecheck        # clean
pnpm -r typecheck                             # clean, all 34 projects
npx eslint apps/api/tests/adverse/credits-production-invariants.test.ts   # clean
npx prettier --write apps/api/tests/adverse/credits-production-invariants.test.ts   # unchanged
npx vitest run --project adverse --no-file-parallelism credits-production-invariants.test.ts
  # 1/1 passed
npx vitest run --project unit --no-file-parallelism \
  credits-adjust.test.ts admin.users-credits.test.ts billing-webhook-concurrent.test.ts \
  billing-routes.test.ts billing-webhook.test.ts admin.users.test.ts enum-drift.test.ts \
  entitlements.test.ts purchase-free-tier.test.ts
  # 99/99 passed, 10/10 files
npx vitest run --project adverse --no-file-parallelism \
  credits.property.test.ts credits.concurrency.test.ts credits.expiry-race.test.ts \
  credits.refund-partial.test.ts credits.refund-to-lot.test.ts \
  credits-adjust-concurrency.test.ts billing-mass-assignment.test.ts \
  credits-debit-refund-race.test.ts billing-production-gate.test.ts \
  credits-production-invariants.test.ts refund-on-failure.test.ts control-gate.test.ts
  # 85/85 passed, 12/12 files
DATABASE_URL=<webaudit_test> npx tsx scripts/credits-integrity-check.ts   # clean
DATABASE_URL=<webaudit>      npx tsx scripts/credits-integrity-check.ts   # clean
# (seeded 2 anomalies, re-ran → 2 findings correctly reported, exit code 1; cleaned up, re-ran → clean)
tasklist /FI "IMAGENAME eq node.exe"
wmic process where "ProcessId=5540" get CommandLine
wmic process where "ProcessId=280" get CommandLine
netstat -ano | findstr ":3000 :3001 :6389"
npx vitest run --project unit --no-file-parallelism \
  gated-check-partial.test.ts progress-streaming.test.ts scan-phase-producer.test.ts admin.queue.test.ts
  # with contending processes stopped: 16/16 passed, 4/4 files
```

### 26.7 Verdict

No bypass was found. Every credit-table write in the repository is one of the four approved
domain functions; every call site's amount/kind/source/expiry is traced to a non-client-controlled
origin except the one place (a purchase's own amount) where user control is the correct,
intended behaviour and is itself unreachable in production. All 17 requested invariants hold,
each with a test that would fail if it did not (verified for the new ones by the same
"break it, watch it fail, fix it, watch it pass" discipline used throughout this task). The 8
`pnpm test` failures are proven — not merely argued — to be unrelated infrastructure
contention. This task is complete.

## 27. Full Manual Testing Pass (2026-09-10)

Everything above (§1–26, plus the separate capability delete-race fix at T254/T255) had been
proven exclusively through automated tests calling `createApp()` directly. This pass instead
booted the **real process boundary** — `startApi()`, the function an actual deployment invokes,
not the test-only factory — and drove it with genuine `fetch()` HTTP requests against ephemeral
ports on an isolated `webaudit_test` database, exercising both the credit-hardening work and the
capability delete-race fix end to end.

### 27.1 Method

A throwaway script (`apps/api/manual-qa-temp.ts`, deleted after use — never part of any commit)
booted:
- a real `startApi()` instance in simulated-production mode (`billing: { isProduction: true }`)
- a real `startApi()` instance in dev mode
- a real `createSandboxHost()`
- `createPhaseHandler` called directly in-process (bypassing BullMQ so this run did not compete
  for job locks with the peer session's live dev-server worker on the same Redis instance)

32 checks were run this way: A1–A11 against the credit surfaces (production gate on both
billing routes, malformed-body 404 leak, `userId`-smuggling refusal, operator grant path,
webhook signature verification, concurrent-debit non-oversell, refund routing), B1–B7 against
the capability delete-race fix (concurrent delete-vs-reconcile, disk-removal-vs-DB-delete
ordering). Final result: **32/32 passed.**

### 27.2 Two real bugs found — both invisible to 1007+ existing automated tests

Manual testing through `startApi()` (not `createApp()`) surfaced two genuine gaps that no
prior automated test had ever exercised, because every prior test used `createApp()` directly:

1. **`startApi()` never forwarded `options.billing` to its internal `createApp({...})` call.**
   `ApiServiceOptions` had no `billing` field at all, so a caller passing
   `billing: { isProduction: true }` through `startApi()` had it silently dropped — the app
   underneath fell back to the real `env.isProduction`, not the caller's override.
2. **`startApi()` never forwarded `options.webhooks` either**, for the same reason — a caller
   signing a test payload with a custom secret via `startApi()` got a 503
   `WEBHOOK_NOT_CONFIGURED` instead of real signature verification.

Both are harmless for an actual deployment, which never passes either override and correctly
falls back to the real environment variables — but both made the options a lie for any caller,
including this session's own manual-QA script, and both went unnoticed because: (a) TypeScript's
excess-property check would have caught a bad `billing`/`webhooks` key at a literal call site,
but no code before this session ever passed either option to `startApi()` at all; (b) the
throwaway QA script ran under `tsx`, which does not type-check.

**Fix** (`apps/api/src/index.ts`): added `billing?: BillingRoutesDeps` and
`webhooks?: WebhookRoutesDeps` to `ApiServiceOptions`, and forwarded both into the
`createApp({...})` call the same way `mailer` and `rateLimiters` already were — spread in only
when defined, so a real deployment that never sets them sees no behavioural change.

**Regression tests** (`apps/api/tests/adverse/billing-production-gate.test.ts`, new
`describe('startApi itself forwards the billing.isProduction override, not just createApp')`
block): two tests boot a real `startApi()` instance (ephemeral port, `installSignalHandlers:
false`, `reconcileCapabilities: false`) and prove both fixes against the actual HTTP surface —
a production-mode purchase 404s, and a webhook signed with a custom secret verifies and credits
the correct lot. Both were confirmed to fail against the pre-fix code (403 and 503
respectively) before the fix, and pass after.

### 27.3 Final verification

```
pnpm -r typecheck                                                          # clean, 34/34 projects
npx eslint apps/api/src/index.ts apps/api/tests/adverse/billing-production-gate.test.ts   # clean
npx prettier --write apps/api/tests/adverse/billing-production-gate.test.ts               # 1 file reformatted
npx prettier --check apps/api/src/index.ts apps/api/tests/adverse/billing-production-gate.test.ts   # clean
npx vitest run --project adverse --no-file-parallelism   # full adverse suite: 43/43 files, 665/665 passed, 1 skipped
```

### 27.4 Verdict

Manual testing through the real production entry point found what a thousand-plus automated
tests calling the test-only `createApp()` shortcut never could: two silent option-forwarding
gaps in `startApi()` itself. Both are now fixed, both have dedicated regression tests exercising
the real HTTP surface through `startApi()`, and the full adverse suite is green with zero
regressions. This is the concrete value the user's "full manual testing" instruction produced.
