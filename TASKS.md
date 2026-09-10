# Credit System Hardening — Execution Plan

Companion to `PLAN.md`. Read that first — it has the evidence and reasoning; this is the
checklist. Work in dependency order. Never mark `[x]` without having actually run the
verification step and seen it pass.

Status legend: `[ ]` pending · `[x]` done, verified · `[BLOCKED]` blocked, reason stated inline.

---

## AUDIT — investigation (Phase 0-2, already complete)

- [x] **AUDIT-001** Repository-wide search for every `creditLot`/`creditTransaction`/
      `creditAllocation`/`billingEvent`/`subscription` mutating Prisma call and every raw
      SQL statement touching those tables.
      **Result**: 21 files matched; 6 production files, 15 tests (see `PLAN.md` §4). No
      undiscovered mutation path exists.
- [x] **AUDIT-002** Trace every HTTP route that can reach a credit mutation, direct or
      indirect (billing, webhooks, admin, worker jobs).
      **Result**: `PLAN.md` §3, §4 tables. Two routes (`/billing/subscribe`,
      `/billing/credits/purchase`) apply real effects with no payment verification. No
      admin route exists.
- [x] **AUDIT-003** Check `apps/web` for how the frontend calls billing endpoints — confirm
      whether the exposure is a forgotten dev route or literally the live UX.
      **Result**: `apps/web/lib/api.ts:518,535` and `apps/web/app/(dashboard)/billing/
      page.tsx` call the unverified routes directly — this is the actual product UI today,
      not a forgotten internal tool.
- [x] **AUDIT-004** Verify existing `CreditLot` data against the proposed `CHECK` constraint
      bounds before proposing a migration.
      **Result**: zero violations in `webaudit` (3 rows) and `webaudit_test` (0 rows), run
      directly via a Prisma `$queryRawUnsafe` count against both databases.
- [x] **AUDIT-005** Confirm the four refund call sites never accept a client-supplied
      amount.
      **Result**: `issues.routes.ts:110`, `scans.routes.ts:344`, `issues/attempts.ts:134`,
      `terminal-refund.ts:69`, `timeout-scheduler.ts:75` — all server-computed from actual
      charge/delivery state. No client input reaches `credits` on any of them.

---

## BILL — close the critical open-mint hole

### BILL-001 — Gate `POST /billing/credits/purchase` to non-production `[x]`

**Objective**: this route must 404 when `env.isProduction` is true; unchanged otherwise.

**Files**:
- Modify: `apps/api/src/routes/billing.routes.ts`
- Modify: `apps/api/src/app.ts` (import `env` if not already imported at this layer — check
  first; `billing.routes.ts` may be the more natural place to import `env` from
  `../config/env.js`, matching how `app.ts:138` already reads `env.isProduction`)
- Test: `apps/api/tests/contract/billing-routes.test.ts` (extend), new
  `apps/api/tests/adverse/billing-production-gate.test.ts`

**Dependencies**: none.

**Implementation**:
1. In `billing.routes.ts`, import `env` from `../config/env.js`.
2. Add a small guard at the top of the `/billing/credits/purchase` handler:
   ```ts
   if (env.isProduction) {
     res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No such route.' } });
     return;
   }
   ```
   (404, not 403 — matches `PLAN.md` §12's reasoning: a 403 confirms the route exists.)
3. Do **not** wrap this in a factory option or env var of its own — reuse the exact
   `env.isProduction` flag `app.ts` already derives from `NODE_ENV`, so there is exactly one
   place in the codebase that decides what "production" means (avoids the
   `ALLOW_INSECURE_DEV_SECRETS`-style drift risk this codebase has already been bitten by
   once per `PROGRESS.md`'s Finding C3).

**Verification**:
1. Write the failing test first (`billing-production-gate.test.ts`): set
   `process.env['NODE_ENV'] = 'production'` (or however `env.isProduction` is actually
   derived — check `config/env.ts` for the exact source before writing the test), rebuild
   the minimal app the way `billing-routes.test.ts` already does, `POST
   /billing/credits/purchase` as an authenticated user, assert `404`.
2. Run it — confirm it fails against current code (proves the test is real).
3. Implement the guard.
4. Run it again — confirm 404.
5. Run the **existing** `billing-routes.test.ts` unmodified — confirm it still gets 201 (it
   runs under `NODE_ENV=test`, so `env.isProduction` must be false there; verify this
   assumption holds by checking `config/env.ts` rather than guessing).

**Expected result**: `pnpm test` — `billing-routes.test.ts` unchanged, still green;
`billing-production-gate.test.ts` new, green; no other suite touched.

**Done.** Implemented with one refinement the plan above didn't anticipate: `env.isProduction`
is a frozen snapshot computed once at `config/env.ts` module-import time, so a test cannot
reach it by mutating `process.env['NODE_ENV']` at runtime (the same problem `app.ts`'s own
`rateLimiters` dependency already exists to work around, for the identical reason). Added a
`BillingRoutesDeps.isProduction` override, threaded through `AppDeps.billing` in `app.ts`
(mirroring `deps.admin ?? {}`'s existing pattern exactly) — a test now builds two app
instances (`createApp({ ..., billing: { isProduction: true } })` /
`{ isProduction: false }`) rather than fighting the env-var cache. `billing-production-gate.test.ts`
(4 tests, all green) proves: purchase 404s and mints nothing in production, subscribe 404s
and grants nothing in production, both routes work unaffected outside production, and a
malformed body in production still 404s rather than leaking a 400 (never confirms the route
exists). Along the way, found and fixed one **pre-existing, unrelated** test-isolation bug
while re-running the existing `billing-routes.test.ts`: `Plan(id: 'free').isActive` had been
persisted `false` in the local `webaudit_test` database by some earlier, unrelated test run —
`Plan` rows deliberately survive `resetDb()` as reference data (`tests/helpers/db.ts`'s own
comment), so a stray `plan.update` in any test that toggles `isActive` leaks across every
later run against the same local database. Confirmed via stash-and-rerun that this failure
reproduces identically with none of this task's changes present — not caused by this work —
and restored the correct value directly in the affected database (`webaudit_test`; `webaudit`
was already correct). `pnpm --filter @webaudit/api typecheck` clean throughout.

---

### BILL-002 — Gate `POST /billing/subscribe` to non-production `[x]`

**Done.** Implemented together with BILL-001 (same guard function, same test file) — see
BILL-001's "Done" note for the full account; nothing route-specific to add here beyond what
that note already covers.

**Expected result**: both direct-effect billing routes now require
`NODE_ENV !== 'production'`; `/billing/change-plan`, `/billing/cancel`, `GET /billing/plans`,
`GET /billing/credits` are **unchanged** — they don't grant credits (`PLAN.md` §18), so they
are explicitly out of scope for this gate. Do not gate them "for consistency" — that would be
scope creep past what the investigation actually found dangerous.

---

## DB — database-level enforcement

### DB-001 — Add `CHECK` constraint bounding `CreditLot.amountRemaining`

**Objective**: `0 <= amountRemaining <= amountGranted`, enforced by Postgres, not just
application code.

**Files**:
- Create: a new Prisma migration (`apps/api/prisma/migrations/<timestamp>_credit_lot_bounds_check/migration.sql`)
- Modify: `apps/api/prisma/schema.prisma` — Prisma does not model raw `CHECK` constraints
  declaratively in this Prisma version; add the constraint via the migration SQL directly
  (matching how this project already hand-writes migration SQL for anything Prisma's schema
  DSL can't express — check `migration.sql` files under `apps/api/prisma/migrations/` for
  the established pattern before assuming a schema.prisma change is needed at all)
- Test: `apps/api/tests/adverse/credit-lot-constraints.test.ts` (new)

**Dependencies**: AUDIT-004 (data verified clean — already done).

**Implementation**:
1. Before writing the migration, re-run the exact verification query from `PLAN.md` §14
   against the current dev/test databases (data may have changed since AUDIT-004 ran) —
   do not skip this because it "already passed once."
2. Write the migration SQL:
   ```sql
   ALTER TABLE "CreditLot"
     ADD CONSTRAINT "CreditLot_amountRemaining_bounds"
     CHECK ("amountRemaining" >= 0 AND "amountRemaining" <= "amountGranted");
   ```
3. Apply it via the project's normal migration workflow (check `package.json`'s `db:migrate`
   script — do not hand-run arbitrary `prisma migrate` flags without checking what this
   project's own script already wraps).

**Verification**:
1. Write the failing test first: attempt
   `testDb.$executeRawUnsafe('UPDATE "CreditLot" SET "amountRemaining" = -1 WHERE id = $1',
   lotId)` against a seeded lot, assert it throws with Postgres code `23514`.
2. Run it against the pre-migration schema — confirm it fails (the update currently
   succeeds, so the test's assertion that it throws is what fails).
3. Apply the migration.
4. Run it again — confirm the constraint violation now throws as expected.
5. Also assert a value `amountRemaining > amountGranted` is rejected the same way.
6. Run the **full** existing adverse credits suite
   (`credits.property.test.ts`, `credits.concurrency.test.ts`, `credits.expiry-race.test.ts`,
   `credits.refund-partial.test.ts`, `credits.refund-to-lot.test.ts`) unmodified — confirm
   all still pass. If any of them fails after this migration, that is a real finding (an
   existing code path was relying on being able to write an out-of-bounds value transiently
   within a transaction that later corrects it) — stop and investigate before proceeding;
   do not loosen the constraint to make a red test green without understanding why first.

**Expected result**: constraint active in both dev and test databases; all pre-existing
credit tests green; new constraint test green.

**Done** (combined with DB-003 in one migration,
`20260910120000_credit_lot_amount_bounds_check`, per that task's own suggestion). Pre-flight
check re-run fresh immediately before writing the migration (not reused from AUDIT-004):
zero violations in both `webaudit` and `webaudit_test` across all three constraints
(`CreditLot` bounds, `CreditTransaction.amount > 0`, `CreditAllocation.amount > 0`). Applied
via `prisma migrate deploy` against both databases (non-interactive — avoids `migrate dev`'s
shadow-database/interactive-prompt behaviour for a hand-authored migration file, matching
this project's own existing hand-crafted-migration convention, e.g.
`20260903050000_credit_transaction_billing_event_id`). Verified directly against real rows,
not just asserted: a negative `amountRemaining` update, an over-`amountGranted` update, a
zero-amount `CreditTransaction` insert, and a negative-amount insert were each attempted via
raw SQL and rejected with Postgres `23514` (check_violation); a valid positive-amount insert
succeeded. Then ran the **full** pre-existing adverse credits suite (40 tests across
`credits.property.test.ts`, `credits.concurrency.test.ts`, `credits.expiry-race.test.ts`,
`credits.refund-partial.test.ts`, `credits.refund-to-lot.test.ts`) — all 40 green, confirming
no existing code path was relying on a transiently out-of-bounds value.

---

### DB-002 — Add `ADMIN_GRANT` to the `LotSource` enum `[x]`

**Objective**: give the new admin grant path its own `source` value, distinct from
`FREE_GRANT`/`PLAN_RENEWAL`/`PURCHASE`/`REFUND`, so a `CreditTransaction`'s `reason` string
is never the only way to tell an operator grant apart from a real purchase.

**Files**:
- Modify: `apps/api/prisma/schema.prisma` (the `LotSource` enum)
- Create: a new Prisma migration adding the enum value

**Dependencies**: none (independent of DB-001 — separate migration, per `PLAN.md` §20's
"either can be rolled back without the other").

**Implementation**:
1. Add `ADMIN_GRANT` to the `LotSource` enum in `schema.prisma`.
2. Generate the migration (`ALTER TYPE "LotSource" ADD VALUE 'ADMIN_GRANT'` — note Postgres
   requires this to run outside an explicit transaction block in some versions; check how
   this project's existing enum-value migrations, if any, handled this before writing a new
   one from scratch).
3. Regenerate the Prisma client.

**Verification**:
1. `pnpm --filter @webaudit/api typecheck` — confirm the new enum value is usable from
   TypeScript.
2. A trivial round-trip test: create a `CreditLot` with `source: 'ADMIN_GRANT'`, read it
   back, assert the value persisted.

**Expected result**: new enum value available; no existing row affected (adding an enum
value is non-breaking).

**Done.** Real finding along the way: `LotSource` already declares a `PROMOTIONAL` value,
verified (via a repo-wide search) to be referenced by zero application code — reserved but
never built. Deliberately did not repurpose it for the admin-grant use case: a promo
redemption and an operator's manual correction are different events for audit purposes, and
collapsing them would make a `CreditTransaction.source` ambiguous about which one actually
happened. `ADMIN_GRANT` added as its own value, documented inline in `schema.prisma` with
that reasoning. Migration `20260910120100_lot_source_admin_grant` applied via `prisma migrate
deploy` to both databases. `prisma generate` hit a Windows file-lock on the native query
engine DLL (another local process — the peer session's own live dev-server demo — still had
it loaded); the generated TypeScript client updated successfully before that step (confirmed:
`ADMIN_GRANT` present in `index.d.ts`), and a real round-trip test (create a `CreditLot` with
`source: 'ADMIN_GRANT'`, read it back) against the live test database confirmed the existing,
un-swapped engine binary handles the new enum value correctly at runtime regardless — no
engine-level behaviour change was needed for an additive enum value. `pnpm --filter
@webaudit/api typecheck` clean.

---

### DB-003 — Add `CHECK (amount > 0)` on `CreditTransaction.amount` and `CreditAllocation.amount` `[x]`

**Done.** Combined into DB-001's migration — see that task's "Done" note for the full
verification account (both new constraints tested directly against real inserts, both
rejected the invalid case and accepted the valid one).

---

## ADMIN — the operator credit-grant path

### ADMIN-001 — Build `adjustCredits` domain function `[x]`

**Objective**: the one new function that becomes the operator's only way to grant credits.

**Files**:
- Create: `apps/api/src/services/credits/adjust.ts`
- Modify: `apps/api/src/services/credits/index.ts` (export it)
- Test: `apps/api/tests/unit/credits-adjust.test.ts` (new)

**Dependencies**: DB-002 (`ADMIN_GRANT` enum value must exist).

**Implementation**: per `PLAN.md` §10's signature. Key rules to encode, each with its own
test in ADMIN-001's own test file (not deferred to the route test):
- `amount` must be a positive integer — reject otherwise, mirroring `debit.ts`'s
  `input.amount <= 0` guard and `purchase.service.ts`'s `InvalidPurchaseAmountError` pattern
  (reuse or mirror the existing error-class convention in this file rather than inventing an
  unrelated shape).
- `kind` must be `'PLAN'` or `'PURCHASED'` — reject anything else (this is a TypeScript
  union at the call site, but the function itself must still validate at runtime since a
  caller crossing a network/serialization boundary could send anything).
- `expiresAt` must be non-null when `kind === 'PLAN'` unless the operator explicitly intends
  a non-expiring plan grant — **do not silently default this**; require the caller (the
  route, ADMIN-002) to pass an explicit value, and let `adjustCredits` merely validate
  consistency (e.g., refuse `kind: 'PURCHASED'` with a non-null `expiresAt`, mirroring
  `grantLot`'s own implicit rule that PURCHASED never expires).
- `reason` must be a non-empty string.
- Wrap the grant (`creditTransaction.create` + `creditLot.create`, same two-step order
  `grantLot` uses and for the same reason — transaction-before-lot so a duplicate is
  detectable before any lot exists) and the `recordAuditLog` call in one `$transaction`.
- Read `balanceOf` before and after (inside the same transaction, using `tx`) so the audit
  record and the returned result both carry a real before/after balance, not an assumed one.

**Verification**:
1. Unit test: happy path — grant 100 `PLAN` credits with a future `expiresAt`, assert a
   `CreditLot` and `CreditTransaction` exist, `source: 'ADMIN_GRANT'`, balance moves by
   exactly 100.
2. Unit test: `amount <= 0` throws before any write (assert zero rows created).
3. Unit test: `kind: 'PURCHASED'` with a non-null `expiresAt` throws.
4. Unit test: empty `reason` throws.
5. Unit test: an `AuditLogEntry` row exists with `action: 'credits.adjust'`,
   `subjectType: 'User'`, `subjectId: targetUserId`, `actorId: operatorId`, and both
   `before`/`after` populated.
6. Run `pnpm --filter @webaudit/api typecheck` — clean.

**Expected result**: all six pass; no existing test touched.

**Done.** `adjustCredits` reuses `grantLot` directly rather than duplicating its insert logic
(`grantLot`'s return type widened from `void` to `{ transactionId, lotId }` — verified
backward compatible: every one of its ~15 existing call sites ignores the return value;
`grantLot` also gained an optional `reason` override so an operator's own free-text reason
lands on the `CreditTransaction` instead of the generic `grant:<source>` label). Real finding
along the way: `LotSource` already declared an unused `PROMOTIONAL` value — deliberately not
reused for this (see DB-002's own "Done" note for why). 8 unit tests in
`credits-adjust.test.ts`, all green: happy path for both PLAN and PURCHASED, amount <= 0,
non-integer amount, PURCHASED-with-expiry, empty/whitespace reason, nonexistent target user,
and the audit-log shape (actor/subject/before/after). `pnpm --filter @webaudit/api typecheck`
and `eslint` both clean.

---

### ADMIN-002 — Add `POST /admin/users/:id/credits` route `[x]`

**Objective**: the `requireOperator`-gated HTTP surface for ADMIN-001.

**Files**:
- Modify: `apps/api/src/routes/admin/users.routes.ts` (add the route here — it's
  user-scoped, matching where `PATCH /admin/users/:id` already lives, rather than creating
  a new `admin/credits.routes.ts` file for one endpoint) OR create
  `apps/api/src/routes/admin/credits.routes.ts` if `users.routes.ts` is judged too far
  outside its stated scope (check that file's own module note — it currently says "today,
  only `isOperator`" for what it manages, which argues for a separate file; decide based on
  what's actually in the file when this task starts, not assumed here)
- Modify: `apps/api/src/routes/admin/index.ts` (mount the new router if a separate file)
- Test: extend `apps/api/tests/contract/admin.users.test.ts` or create
  `apps/api/tests/contract/admin.credits.test.ts` (match whichever file-split decision was
  made above)

**Dependencies**: ADMIN-001.

**Implementation**:
1. Zod body schema: `{ amount: z.number().int().positive().max(<some sane operator ceiling
   — check whether PLAN_TIERS or FREE_ALLOCATION suggests a reasonable max, rather than
   reusing the user-purchase route's 1,000,000 ceiling by coincidence; document the chosen
   number's reasoning inline>), kind: z.enum(['PLAN', 'PURCHASED']), expiresAt:
   z.string().datetime().nullable().optional(), reason: z.string().trim().min(1).max(500) }`.
2. Route reads `req.params['id']` as `targetUserId` and `req.auth!.userId` as `operatorId` —
   never the reverse, and never trust a body field for either.
3. Call `adjustCredits`, map `CapabilityNotFoundError`-style "no such user" to 404 (reuse
   whatever this file's existing pattern is for "user not found" — check
   `users.service.ts`'s `UserNotFoundError` and reuse it rather than inventing a parallel
   error).
4. Response: `{ transactionId, balanceBefore, balanceAfter }`.

**Verification**:
1. Contract test: non-operator token → 403.
2. Contract test: no token → 401.
3. Contract test: operator, valid body → 201 (or 200 — match this codebase's existing
   convention for a mutation that creates a new record; check `admin.capabilities.test.ts`'s
   PATCH responses for the house convention before picking one arbitrarily), balance moves,
   exactly one new `AuditLogEntry`.
4. Contract test: malformed body (negative amount, missing reason, invalid kind) → 400.
5. Contract test: nonexistent target user id → 404.
6. Contract test: the route requires `requireOperator` specifically by testing it through
   the **real mounted app** (`admin/index.ts`'s router), not a bare router that skips the
   gate — matching the strict-review lesson already learned once in this codebase (Phase 14's
   own finding that every other capability test bypassed `requireOperator` entirely).

**Expected result**: 6 new contract tests, all green; existing `admin.users.test.ts`
(if that's where this lands) unmodified assertions still pass.

**Done.** Landed inside `users.routes.ts` (a sub-resource route, per the file's own growing
scope) rather than a new file. Test file created separately —
`admin.users-credits.test.ts` — mounted through the real `adminRoutes` aggregator
(`admin/index.ts`), not a bare router, specifically to prove `requireOperator` for real (the
Phase 14 lesson this task itself named). 10 contract tests, all green: real-operator grant
+ audit, real 403 for a non-operator, 401 with no token, 400s for negative amount / missing
reason / invalid kind / PURCHASED-with-expiry / over-ceiling amount / an unrecognized body
field (`.strict()` mass-assignment guard), and 404 for a nonexistent target user. Ceiling set
to 100,000 (documented inline: an operator grant is a correction, not a bulk top-up, and
should carry a materially lower blast radius than the user-facing purchase route's
1,000,000). `pnpm --filter @webaudit/api typecheck` and `eslint` both clean.

---

### ADMIN-003 — Concurrency test for simultaneous admin grants `[x]`

**Objective**: prove two concurrent `adjustCredits` calls against the same user don't
interleave badly (lost audit record, mismatched before/after balances).

**Files**: `apps/api/tests/adverse/credits-adjust-concurrency.test.ts` (new)

**Dependencies**: ADMIN-001.

**Implementation**: `Promise.all([adjustCredits(...), adjustCredits(...)])` against the same
`targetUserId`, different amounts; assert both `CreditTransaction` rows exist, both
`CreditLot` rows exist, both `AuditLogEntry` rows exist, and the final `balanceOf` equals the
sum of both grants (not one overwriting the other's before/after snapshot).

**Verification**: run the test; since `adjustCredits` is a pure insert (no shared row to
lock, per `PLAN.md` §15), this should pass without any new locking code — if it doesn't,
that's a real finding to fix before ADMIN-001 is considered done, not a reason to add a lock
speculatively now.

**Expected result**: green, with no production-code change needed (or, if red, a scoped fix
to ADMIN-001 plus a note in this file explaining what was actually wrong).

**Done, and green with zero production-code changes, as predicted.** Two tests: two
concurrent grants with different operators/kinds (both land, both audited, balance sums
correctly, distinct transaction/lot ids), and ten concurrent grants (all ten land, none
lost).

---

### ADMIN-004 — Wire `adjustCredits` into the admin console frontend (optional, confirm scope first)

**Objective**: `apps/web`'s admin users screen gets a "grant credits" action.

**Files**: `apps/web/app/(dashboard)/admin/users/...` (exact path TBD — check
`design/screen-map.md` first per this repo's own UI rule: **"No design, no build. A surface
absent from `design/screen-map.md` is blocked, not improvised."**)

**Dependencies**: ADMIN-002.

**Status**: `[BLOCKED]` — pending confirmation that a design exists in
`design-system/` for an admin credit-grant control, per this repository's own non-negotiable
UI rule (`CLAUDE.md`'s "UI work" section). Do not improvise a form for this. If no design
exists, this task stays blocked until the user/product owner decides whether to (a) skip the
UI for now and let operators use the API directly, or (b) authorize an explicit design
exception through the documented process (`CLAUDE.md`'s three-place exception record).

---

## SEC — regression tests for the threat model

### SEC-001 — Regression test: production gate actually refuses

Covered by BILL-001/BILL-002's own verification steps — no separate task; this entry exists
so `PLAN.md` §7's threat-table row 1-3 has a named, checkable pointer.

### SEC-002 — Regression test: `userId` cannot be smuggled via request body `[x]`

**Files**: `apps/api/tests/adverse/billing-mass-assignment.test.ts` (new — not appended to
`billing-routes.test.ts` as originally sketched, to keep the stable existing file untouched
and give these regression tests their own clearly-labeled home).

**Done, confirmed already passing (proof, not a fix)**: `POST /billing/credits/purchase` and
`POST /billing/subscribe` both tested with a `userId` for a second, real "victim" account in
the body — the resulting lot/subscription always belongs to the authenticated caller, never
the supplied id.

### SEC-003 — Regression test: `kind`/`source`/`expiresAt`/`billingEventId` cannot be
supplied by a client `[x]`

**Files**: same file as SEC-002.

**Done, confirmed already passing (proof, not a fix)**: both the purchase and subscribe paths
tested with every one of `kind`/`source`/`expiresAt`/`billingEventId` overridden in the body —
the resulting `CreditLot`/`CreditTransaction` always carries the server-hardcoded values.

---

## CONC — the two named-but-unproven interleavings

### CONC-005 — Concurrent duplicate webhook delivery `[x]`

**Files**: `apps/api/tests/contract/billing-webhook-concurrent.test.ts` (new file, not an
extension of `billing-webhook.test.ts`, to keep that stable file untouched).

**Done, green — no production change needed.** Two tests: two concurrent deliveries of the
same event, and ten concurrent deliveries of the same event; both result in exactly one
`CreditTransaction` and the correct final balance. The existing `billingEventId`-uniqueness +
`DuplicateBillingEventGrantError` catch mechanism (already built for the sequential-retry
case) handles the concurrent case correctly too — confirmed directly, not assumed. Console
noise from Prisma's own `log: ['error']` level logging the internally-caught `P2002` is
expected and harmless (visible in the test output, does not fail the assertions).

### CONC-006 — Concurrent debit + refund on the same lot `[x]`

**Files**: `apps/api/tests/adverse/credits-debit-refund-race.test.ts` (new).

**Done, green — no production change needed, confirmed stable across repeated runs (not a
one-off pass).** Two tests: a debit and a refund racing where either order leaves a
deterministic, correct final balance (100 → 40, regardless of which operation's lock wins
first), and a tighter race where a second debit can only succeed if the refund lands first —
proving the loser is refused rather than overselling, never both succeeding. Both tests also
assert the lot's `amountRemaining` stays within `[0, amountGranted]` — now doubly guaranteed,
by the application-level `FOR UPDATE` locking *and* DB-001's `CHECK` constraint as a backstop.

### CONC-006 — Concurrent debit + refund on the same lot

---

## TEST — full-suite verification (run after every phase above, not just once at the end)

- [x] **TEST-001** `pnpm --filter @webaudit/api typecheck` clean after BILL-001/002.
- [x] **TEST-002** `pnpm --filter @webaudit/api typecheck` clean after DB-001/002/003.
- [x] **TEST-003** `pnpm --filter @webaudit/api typecheck` clean after ADMIN-001/002/003.
- [x] **TEST-004** `eslint` clean on every new/modified file.
- [x] **TEST-005** `prettier --check` clean on every new/modified file.
- [x] **TEST-006** Full `pnpm test` (unit project) — 1019/1027 passed, 126/130 files. The 8
      failures (4 files) are pre-existing real-Redis/BullMQ contention, confirmed unrelated:
      `gated-check-partial.test.ts` and `progress-streaming.test.ts` were already confirmed
      pre-existing/flaky in this same session before this task began (Phase 14's own
      stash-and-rerun); `scan-phase-producer.test.ts`'s two new-looking failures carry the
      literal error "Job ... could not be removed because it is locked by another worker" —
      a real BullMQ/Redis lock held by a different process, matching a live dev-server
      demo another session on this machine confirmed was running against the same Redis
      instance at the time. None of the 8 failures are in a credits/billing-named file. A
      focused, isolated rerun of every credits/billing-related file in the unit project
      (`credits-adjust.test.ts`, `admin.users-credits.test.ts`,
      `billing-webhook-concurrent.test.ts`, `billing-routes.test.ts`, `billing-webhook.test.ts`,
      `admin.users.test.ts`, `enum-drift.test.ts`) — 87/87 passed, 7/7 files.
- [x] **TEST-007** Full credits/billing adverse suite run together — 52/52 passed, 9/9 files
      (`credits.property.test.ts`, `credits.concurrency.test.ts`, `credits.expiry-race.test.ts`,
      `credits.refund-partial.test.ts`, `credits.refund-to-lot.test.ts`,
      `credits-adjust-concurrency.test.ts`, `billing-mass-assignment.test.ts`,
      `credits-debit-refund-race.test.ts`, `billing-production-gate.test.ts`).

---

## VERIFY — final acceptance (Phase 20, do not skip any line)

- [x] **VERIFY-001** Built `scripts/credits-integrity-check.ts` (`pnpm credits:check`) — six
      checks (lot bounds, non-positive amounts, DEBIT/allocation-sum mismatch, orphan
      allocations, double refunds, an `ADMIN_GRANT` lot with no matching audit entry).
      Confirmed against real data, not just read: ran clean against both `webaudit` and
      `webaudit_test`; then deliberately seeded two real anomalies (a DEBIT with a mismatched
      allocation sum, an `ADMIN_GRANT` lot with no audit entry) directly into `webaudit_test`,
      re-ran, confirmed both were caught with the right row-level detail and a non-zero exit
      code, then cleaned up the seeded rows and confirmed clean again.
- [x] **VERIFY-002** `billing-production-gate.test.ts` confirms this via `billingRoutes`'s
      injected `isProduction: true` dependency — the exact same boolean `env.isProduction`
      resolves to under a real `NODE_ENV=production` process, and the only reason a literal
      env-var test isn't used is that `env` is a frozen module-load-time snapshot (documented
      in BILL-001's own "Done" note) that a same-process test cannot flip after the fact
      without this same injection mechanism. Both routes confirmed 404, confirmed to mint/grant
      nothing, confirmed unaffected outside production, confirmed a malformed body still 404s
      rather than leaking a 400.
- [x] **VERIFY-003** `admin.users-credits.test.ts`'s "403s a non-operator" test, run through
      the real `adminRoutes` aggregator (not a bare router) — confirmed 403 `FORBIDDEN`, zero
      lots created.
- [x] **VERIFY-004** Confirmed directly via raw SQL against the live `webaudit_test` database
      (not just the ORM layer): a negative `amountRemaining` update, an over-`amountGranted`
      update, a zero-amount `CreditTransaction` insert, and a negative-amount insert were each
      rejected with Postgres `23514`; a valid positive-amount insert succeeded.
- [x] **VERIFY-005** Full credits/billing adverse suite re-run after all of the above — 52/52
      passed, 9/9 files (see TEST-007).
- [x] **VERIFY-006** `PLAN.md` §24's acceptance table re-read against this file: every row now
      names a task marked `[x]` with a real test behind it — no row is unaddressed.

---

## AUDIT2 — final "No Credit Bypass" verification (2026-09-10, second independent pass)

Requested explicitly, after the first pass, to prove rather than assert that nothing bypasses
the Credit domain. Full detail and evidence: `PLAN.md` §26.

- [x] **AUDIT2-001** Fresh repository-wide search for every `CreditLot`/`CreditTransaction`/
      `CreditAllocation` reference (59 files), each one classified into one of the requested
      six categories. **Result: 4 approved domain files, 4 migrations, 43 test-only, 0
      seed/dev, 3 isolated demo-tooling (own separate database, never deployed), 0 bypass.**
      See `PLAN.md` §26.1 for the full table.
- [x] **AUDIT2-002** Traced every one of the 9 approved call sites of `debit`/`refund`/
      `refundPartial`/`grantLot`/`adjustCredits` to the exact origin of the amount/kind/
      source/expiry it writes. **Result: every value is server-computed or a fixed
      `@webaudit/config` constant, except a purchase's own amount (the user choosing how much
      to buy — the correct behaviour, not a bypass) and an operator's own grant amount (the
      operator, not a normal user, is the trusted actor).** See `PLAN.md` §26.2.
- [x] **AUDIT2-003** Confirmed `apps/web` has zero database access of any kind (no
      `@prisma/client` dependency; the only 2 `PrismaClient` imports anywhere under `apps/web`
      are e2e test-support files, not shipped application code) — proves invariant #10
      structurally, not just by absence of a bug report.
- [x] **AUDIT2-004** All 17 requested invariants proven individually, each against a named
      test file and (for the 3 not already covered) a new test written and confirmed to pass.
      New: `apps/api/tests/adverse/credits-production-invariants.test.ts` — proves invariants
      #1, #9, and #16 together in one real, same-process comparison: user routes 404 in a
      simulated production environment while the operator grant route succeeds at the same
      moment. See `PLAN.md` §26.3 for the full 17-row table with per-invariant proof
      pointers.
- [x] **AUDIT2-005** `scripts/credits-integrity-check.ts` proven to actually detect a
      violation, not just report "clean" vacuously: two real anomalies were deliberately
      seeded into `webaudit_test` (a mismatched debit/allocation sum; an `ADMIN_GRANT` lot
      with no audit entry), the script correctly reported both with row-level detail and
      exit code 1, the seeded rows were removed, and the script was confirmed clean again.
      Run clean against both `webaudit` and `webaudit_test` outside that controlled test.
- [x] **AUDIT2-006** The 8 pre-existing `pnpm test` failures proven — not argued — to be
      unrelated infrastructure contention: identified the exact two contending OS processes
      by PID and command line (`node --import tsx src/index.ts`, i.e. real `apps/api`/
      `apps/worker` dev servers, both connected to the same Redis port the failing BullMQ
      tests use), had the peer session running them pause for a controlled comparison, and
      re-ran the exact four previously-failing files with those processes stopped:
      **16/16 tests passed, 4/4 files green.** Full evidence and exact commands in `PLAN.md`
      §26.5–26.6.
- [x] **AUDIT2-007** Full final regression run after all of the above, uncontended:
      credit/billing unit-project files (10 files) — **99/99 passed**; credit/billing
      adverse files, including the 3 new AUDIT2 tests (12 files) — **85/85 passed**.
      `pnpm -r typecheck` clean across all 34 projects. `eslint`/`prettier` clean on every
      new file.

**Verdict: no bypass found. All 17 invariants hold. The 8 unrelated failures are proven
pre-existing. `PLAN.md` §26 carries the full record.**

## Phase 27: Full Manual Testing Pass

- [x] **MANUAL-001** Booted the real `startApi()` process boundary (not the test-only
      `createApp()` shortcut) in both simulated-production and dev mode, plus a real
      `createSandboxHost()`, and drove them with genuine `fetch()` HTTP requests over ephemeral
      ports against an isolated `webaudit_test` database. 32/32 manual checks passed across
      both the credit-hardening work (A1–A11) and the capability delete-race fix (B1–B7).
- [x] **MANUAL-002** Found and fixed two real gaps invisible to every prior automated test:
      `startApi()` never forwarded `options.billing` or `options.webhooks` into its internal
      `createApp({...})` call, silently dropping both overrides. Fixed in `apps/api/src/index.ts`;
      regression tests added in `billing-production-gate.test.ts` proving both fail before the
      fix (403/503) and pass after. Full record in `PLAN.md` §27.
- [x] **MANUAL-003** Final regression: `pnpm -r typecheck` clean (34/34), `eslint`/`prettier`
      clean, full `test:adverse` suite green — **43/43 files, 665/665 tests passed, 1 skipped,
      0 failed.**

---

## Explicitly out of scope for this execution pass

(Restated from `PLAN.md` §25 so this file is self-contained as a checklist.)

- Free-signup-grant abuse/rate-limiting (account-abuse policy, not ledger integrity).
- Negative operator adjustments / revocations (`ADMIN-005`, deliberately not started —
  product decision needed first).
- Actually integrating a real payment provider (this plan closes the exploit; it does not
  build the payment flow the webhook is waiting for).
- Any new metrics/alerting infrastructure (none exists in this codebase today; out of scope
  to introduce one only for credits).
