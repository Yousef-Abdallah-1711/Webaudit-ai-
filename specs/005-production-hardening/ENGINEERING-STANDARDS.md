# Engineering Standards & Verification Playbook — Production Hardening

**Read this file in full before writing any code under `specs/005-production-hardening/`.** Every
task in `tasks.md` and every prompt in `PHASE-PROMPTS.md` assumes you have read this document —
they say "follow this repo's conventions" and this is where those conventions are made concrete,
not left for you to infer from scattered examples. This exists specifically because a plan that
only says "match the existing style" produces inconsistent results from a model that hasn't
internalized what that style actually is — this document removes that ambiguity.

This document does not replace `AGENTS.md`, `CLAUDE.md`, or `.specify/memory/constitution.md` —
it distills the parts of them that are load-bearing for *this specific initiative* into one place,
with the exact commands and exact numbers, so you don't have to reconstruct them from four
different files while under task pressure. If anything here appears to conflict with those files,
those files win — say so and stop rather than silently picking one.

---

## 1. Code structure rules (non-negotiable size/shape limits)

- **Route handlers ≤150 lines.** **Service functions ≤200 lines.** **React components ≤200
  lines.** These are real, already-enforced norms in this codebase (e.g.
  `apps/api/src/services/credits/debit.ts` and `refund.ts` are split by concern rather than
  merged specifically to respect this). If your natural implementation would exceed a limit,
  **split into a private helper module in the same directory** — do not write one oversized file,
  and do not "flatten" the split by cramming logic into an unrelated existing file just to avoid
  creating a new one.
- **Every new HTTP input is validated with Zod before it touches the database.** No exception,
  no "it's just an admin route." Match the exact pattern already used in every file under
  `apps/api/src/routes/`.
- **Every new frontend API call goes through `apps/web/lib/api.ts`.** Never a raw `fetch()` call
  inside a component. That file already exports `ApiError`, `getAccessToken`, and a shared
  `request()` helper — every new function you add must use that same helper.
- **Money is always an integer, in micros, never a float.** This is a hard, non-negotiable rule
  (`CLAUDE.md`). Any arithmetic on a monetary value must be integer arithmetic; if you find
  yourself writing `* 1.0` or dividing without an explicit rounding rule, stop and re-derive the
  computation as integers (see `packages/ai-executor/src/pricing.ts`'s
  `dollarsPerMillionToMicros` for the established pattern of avoiding float error entirely by
  digit-shuffling rather than floating-point multiplication, when the domain allows it).
- **No new abstraction, helper, or config layer without a demonstrated need.** If a task's spec
  says "do not build X speculatively," that is binding — do not build it "while you're in there,"
  even if it looks like an obvious improvement. Note it in your final report instead.

## 2. Error-handling and API-response conventions

- **Structured error bodies.** Every refusal/error response follows the shape already established
  throughout this codebase: `{ error: { code: 'SOME_CODE', message: '...' } }` — see
  `InsufficientCreditsError`'s HTTP mapping, or `PaymentProviderNotConfiguredError` for the pattern
  to match. Never a bare string, never an unstructured 500 with no code.
- **Fail closed on missing configuration.** Every example already in this codebase
  (`apps/api/src/config/env.ts`'s `requireSecret`, `packages/ai-executor/src/pricing.ts`'s
  `PricingNotConfiguredError`, `packages/ai-executor/src/chain.ts`'s two-vendor check) throws at
  **construction/boot time**, not at first real call, when required configuration is absent. Any
  new provider/service you build (a real Paymob provider, an SMTP mailer, an APM SDK init) must
  follow this exact pattern — if it can boot successfully with missing secrets and only fail
  later, that is a defect, not an edge case to accept.
- **Never trust client-supplied data for anything financial.** Price, amount, "payment succeeded,"
  and entitlement/credit-grant decisions are always computed or verified server-side. This is
  already the pattern everywhere in this codebase's billing code (`checkout-pricing.ts`) — any new
  code must preserve it without exception.
- **Idempotency by construction, not by convention.** Where a task's spec says to reuse an
  existing idempotency mechanism (`BillingEvent`'s unique-id + `appliedAt` gate, the atomic
  `updateMany`-gated state transition pattern), reuse the literal mechanism — do not build a
  parallel, differently-shaped idempotency check "because it's simpler for this one case." A
  second idempotency mechanism next to an existing one is itself a source of the exact
  double-processing bugs idempotency exists to prevent.

## 3. Security rules specific to this initiative

- **Timing-safe comparison for every signature/HMAC check.** `crypto.timingSafeEqual`, never
  `===`, matching `webhooks.routes.ts`'s existing `verify()` function and the pattern any new
  Paymob HMAC module must follow.
- **Reject malformed-format signatures before the expensive/timing-sensitive compare.** A
  signature that isn't even the right length or format should be refused immediately, not padded
  or coerced into a comparable shape — this avoids a length/format-driven timing signal.
- **Never log a secret, even partially, beyond a last-few-characters hint if truly necessary for
  support correlation** (and only if a task's spec explicitly calls for this — do not add secret
  logging on your own initiative).
- **Never test a security mechanism by re-implementing a stand-in of it.** If a task asks you to
  write a test for an HMAC/signature check, that test **must import and call the real production
  verification function** — never define a local, parallel "equivalent" implementation to test
  against. (This is not a hypothetical concern: a reference project this initiative studied has
  exactly this defect in one of its own security tests, and it is called out in `research.md` as
  the single most important lesson to avoid repeating.)
- **Prove a test actually tests what it claims** by breaking the real code on purpose, confirming
  the test fails, then reverting — matching the verification discipline already used earlier in
  this repo's own planning history (`docs/reviews/AI-ENGINEERING-TASKS.md`'s T309/T311 entries are
  the concrete precedent: each was verified by deliberately breaking the property it claims to
  protect, observing red, then reverting to green). Do this for any new adverse/security test you
  write under this initiative, and say explicitly in your final report that you did it.

## 4. Database & migration conventions

- **Every schema change is a real, generated Prisma migration** (`prisma migrate dev --name
  <descriptive_name>`), never a hand-edited production schema. The one exception is a change
  Prisma cannot express (e.g., native table partitioning) — in that case, write raw SQL by hand
  **inside** a normal migration file, with an explicit comment at the top stating it is hand-written
  raw SQL and why (the exact precedent: `apps/api/src/services/credits/debit.ts`'s `FOR UPDATE`
  query is raw SQL for the same class of "Prisma cannot express this" reason).
- **Additive, nullable, backward-compatible by default.** A new column is nullable unless the
  task's spec explicitly calls for a backfill + non-null constraint in the same migration. Never
  drop a column or table as part of a feature migration unless the task explicitly says to.
- **Confirm the migration applies cleanly to the real local dev database** before considering a
  schema task done — `pnpm --filter @webaudit/api exec prisma migrate status` should report
  "Database schema is up to date!" afterward (confirm `DATABASE_URL` is set in your shell — it is
  usually only loaded via the app's own `.env` handling, not your raw shell environment; export it
  explicitly if a bare `prisma` CLI invocation complains it's missing).

## 5. Testing — pyramid, exact commands, and isolation rules

```
Unit / Contract / Integration → pnpm exec vitest run --project unit <path> --no-file-parallelism
Adverse (adversarial/security/failure) → pnpm exec vitest run --project adverse <path> --no-file-parallelism
Whole-repo pass (only when a task's own section calls for it) →
  pnpm exec vitest run --project unit --no-file-parallelism
  pnpm exec vitest run --project adverse --no-file-parallelism
Typecheck → pnpm typecheck   (must show N/N successful, not just "no errors printed")
Lint → pnpm lint            (must show 0 warnings, 0 errors from both lint:code and lint:adherence)
Format → pnpm format:check  (must pass; if it doesn't, run pnpm format and re-check, don't hand-fix whitespace)
```

- **`AI_MODE=fixtures` always in tests.** No test may require real LLM provider spend or a real
  API key. A test that would need one is a broken test, full stop.
- **Provider calls are always stubbed.** The stub `PaymentProvider`, a mocked `fetch`, or an
  in-process fake SMTP transport — never a real external call in an automated test. Real-transport
  exercise happens only in the staging/production-smoke phases, which are manual, deliberate, and
  never part of an automated suite.
- **DB-backed tests use the real local test database**, not a mock ORM — this repo's own
  convention (confirmed throughout this session: `apps/worker` integration tests genuinely hit
  Postgres). Confirm the local Postgres/Redis containers are running before a DB-backed test
  session (`docker ps` should show `webaudit-postgres`; if it's not running, say so rather than
  silently skipping DB-backed tests).
- **Serialize shared DB/Redis test runs** — do not run two DB-backed suites concurrently against
  the same database/queue names; use `--no-file-parallelism` as shown above (already the
  established convention, not new for this initiative).
- **Test-first, where a task's spec implies new business logic**: write the test, confirm it fails
  for the reason you expect, then implement. For a pure schema/config task with no new logic
  (e.g., a migration alone), this doesn't apply literally — use judgment, but default to writing
  the test first whenever there's real behavior to get wrong.

## 6. Definition of Done — the four templates

Every task in `tasks.md` references one of these by name in its own "Definition of Done" line.
Satisfy the referenced template in full before reporting a task complete — do not report "done"
having only run the task's own narrow "Verify" command block; the DoD is the actual completion
bar, the Verify block is the minimum smoke check.

### DoD-A — Backend service / API code (routes, services, providers)

- [ ] Code respects the size limits in §1; if a natural split was needed, it was done, not
      shoehorned into an oversized file.
- [ ] Every new HTTP input is Zod-validated; every error response is the structured
      `{ error: { code, message } }` shape.
- [ ] Any new external-service client (Paymob, SMTP, an APM SDK) fails closed at construction time
      per §2, with a test proving it.
- [ ] `pnpm typecheck` — N/N successful, reported with the real number.
- [ ] `pnpm lint` — 0 warnings, 0 errors, reported.
- [ ] `pnpm format:check` — passes, reported.
- [ ] The task's own unit/adverse tests pass, reported with real counts (files + tests, not "all
      passed").
- [ ] The broader existing suite touching the same files/module still passes unmodified — run at
      least the package/app-level suite (e.g. `apps/api`'s full unit project), not just the new
      file.
- [ ] Manual verification performed per §7 below for this task's domain, and the exact steps taken
      are reported (not just "verified manually").

### DoD-B — Database schema / migration

- [ ] Migration generated via the real `prisma migrate dev` command (or hand-written raw SQL with
      the required top-of-file comment for anything Prisma cannot express), never hand-edited
      after generation.
- [ ] `prisma migrate status` reports "up to date" after applying.
- [ ] Confirmed additive/backward-compatible (§4) unless the task explicitly calls for a breaking
      change.
- [ ] Any existing query/report touching the changed table (e.g. `margin.service.ts` for anything
      near `AiInvocation`/`CapabilityExecution`) was re-run and confirmed unaffected — not assumed
      safe because the column is nullable.
- [ ] DoD-A's typecheck/lint/format/test bars also apply to any application code the migration's
      task also touches.

### DoD-C — Scheduled job / worker-side background process

- [ ] Follows the exact existing precedent named in the task (usually `timeout.ts`/
      `timeout-scheduler.ts`'s shape) rather than a novel design — deviations from the precedent
      must be justified explicitly in the final report, not silent.
- [ ] Idempotent under the sweep's own re-run (running it twice in a row produces no double
      effect) — proven by a test, not asserted in a comment.
- [ ] A concurrent-mutation race (the row being changed by something else between the sweep's read
      and its write) is proven safe by an adverse test, matching `timeout.ts`'s own precedent for
      this exact class of test.
- [ ] DoD-A's typecheck/lint/format/test bars apply.
- [ ] Manually triggered once against the real local worker + DB/Redis stack (not only unit-tested
      in isolation) — see §7.

### DoD-D — Frontend (React/Next.js) change

- [ ] Component ≤200 lines; extracted a hook if wiring logic grew large, matching this repo's
      existing pattern (`apps/web/app/(dashboard)/billing/page.tsx`'s own `refresh()`/`run()`
      separation).
- [ ] Every new API call goes through `apps/web/lib/api.ts`'s shared `request()` helper.
- [ ] Uses design-system tokens (`var(--token)`) — no raw hex color or pixel value introduced;
      `pnpm run lint:adherence` passes.
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm format:check` all pass, reported.
- [ ] Manually opened in a browser against the real dev stack and exercised — not just
      unit-tested with a jsdom render. See §7.

---

## 7. Manual verification playbook (per domain area)

Automated tests prove a specific claim under controlled conditions. Manual verification proves
the thing actually works when you drive it like an operator or a user would — both are required;
neither substitutes for the other. Below is the concrete "how" for each area this initiative
touches, so "verify manually" is never a vague instruction.

### Prerequisites (do this once per session before any manual verification)

```
pnpm services:up        # starts local Postgres (5442) + Redis (6389) via docker compose
pnpm db:migrate          # applies any pending migrations to the local dev DB
pnpm dev                 # starts every app (api, worker, web) via turbo
```

Confirm the API answers: `curl http://localhost:3001/health` should return a healthy response
before doing anything else. Confirm the containers are actually running:
`docker ps` should list `webaudit-postgres` and the Redis container.

### Payments (PendingPayment/checkout lock/expiry sweep/webhook — everything except the real
Paymob provider itself, which needs real credentials to exercise beyond this)

1. Register/log in a real test user through the running `apps/web` app at `http://localhost:3000`.
2. Use `curl` (or the running web UI, if the feature has a UI hook yet) to hit
   `POST /billing/credits/purchase` with a real access token and a small credit amount; confirm a
   `PendingPayment` row appears (`pnpm db:studio` — Prisma Studio — is the fastest way to look,
   or a direct `psql` query against the local dev DB).
3. For the checkout-lock task specifically: open two terminal windows, fire the same purchase
   request from both within milliseconds of each other (a small script or two backgrounded `curl`
   calls), and confirm exactly one succeeds and the other receives `409 CHECKOUT_IN_PROGRESS` —
   this is the manual equivalent of the automated concurrency test and should agree with it.
4. For the expiry-sweep task: manually create (or let one sit from step 2) a `PendingPayment` row,
   temporarily point the sweep's configured window very low via its env var, trigger the sweep job
   manually if it has a direct invocation path, and confirm the row transitions to `EXPIRED` in
   Prisma Studio.
5. For the webhook path (against the **stub** provider, since real Paymob isn't available yet):
   use the stub provider's existing signed-payload capability (see
   `stub-payment-provider.ts`) to construct a real signed webhook body with `curl`, POST it to
   `/webhooks/billing`, and confirm in Prisma Studio that exactly one `BillingEvent`,
   `CreditTransaction`, and `Receipt` row appears — then POST the identical body again and confirm
   nothing new is created (real, hands-on proof of idempotency, not just trusting the automated
   test).

### Email

1. With the console mailer active (default in dev), trigger a real registration and watch the
   process's stdout for the `[mail] verify ...` line — confirm the token in that line actually
   works against `POST /auth/verify-email`.
2. Once a real transport (Resend or SMTP, per whichever decision was made) is wired in a
   **non-production** environment with real (non-production) credentials, trigger the same flow
   and confirm a real email arrives at a real test inbox you control — check subject, branding,
   and that the link works end-to-end.
3. For the payment-confirmation email specifically: repeat the webhook manual test above and
   confirm an email is actually sent (console log line in dev, or a real inbox once a real
   transport is wired) — and confirm a second, duplicate webhook POST does **not** send a second
   email.

### Monitoring / APM

1. After wiring the APM SDK, deliberately throw an unhandled error from a scratch/test route (add
   one temporarily, remove it after) and confirm it appears in the tracker's dashboard within a
   reasonable delay.
2. Kill the worker process (`Ctrl+C` or `kill`) mid-scan in a local run and confirm the heartbeat
   staleness check (once built) actually fires — don't just trust the code path was written
   correctly; watch it happen.
3. Manually fill the `scanPhase` queue past its configured soft/hard limits (script a burst of
   scan-creation requests) and confirm the structured `QUEUE_AT_CAPACITY` refusal actually appears
   in a real response, and that a higher-priority request submitted during the same burst still
   gets a better position than the free-tier requests already queued.

### Archival / partitioning

1. After the partitioning migration, manually run one of `margin.service.ts`'s existing real
   queries (via its route, or directly) against the local dev DB and confirm it returns the same
   shape of result it did before — partitioning must be invisible to a caller.
2. For the detach-and-archive job: run it once in a dry-run mode (per its own task spec) against
   local test data and manually confirm (Prisma Studio, or a direct query) that only rows past the
   retention window were touched, and that no row in `CreditTransaction`/`CreditAllocation`/
   `BillingEvent`/`Receipt` was affected at all.

### After any manual pass

Stop the local stack cleanly (`pnpm services:down` if you started it, or leave it running if
another task in the same session needs it) and note in your final report exactly which manual
steps you performed and what you observed — "manually verified" with no detail is not acceptable
evidence under this initiative's own stated standard (`AGENTS.md`: "Report actual checks, failures
and unverified scope").
