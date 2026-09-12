# Production Hardening — Phase Kickoff Prompts

Each block is a **complete, self-contained prompt** for a fresh session with no memory of the
planning conversation that produced `specs/005-production-hardening/`. Copy one block verbatim to
start that task.

**Paymob (T005-T012, T042) is deliberately excluded from this file for now** — it's blocked on
real merchant credentials (T006) and paused by explicit instruction. Do not start it from this
file; when it's unblocked, write its prompts the same way these were written, following the same
task sections in `tasks.md`.

**Before using any prompt below**: confirm `tasks.md`'s status for that task still says
`NOT STARTED` — if someone already did it, skip to the next one.

**Every prompt below now mandates reading `ENGINEERING-STANDARDS.md` first.** That file defines
the exact code-structure limits, error/response conventions, security rules, migration
conventions, exact test commands, and the four Definition-of-Done templates (`DoD-A`/`DoD-B`/
`DoD-C`/`DoD-D`) every task in `tasks.md` now references. A session that skips it will guess at
conventions instead of following them — that is precisely the rework this file exists to prevent.
A task is not done when its own automated "Verify" command passes; it is done when its referenced
DoD template is satisfied in full, **including the manual-verification step** from that
document's §7. Every prompt below has been updated to say this explicitly and to require a real
manual verification, not just a passing automated suite.

---

## Decision requests (not code — hand these to whoever owns the call, don't send to a coding session)

These five tasks block real work downstream of them. Nothing else in this list depends on them
except where noted, so they can be resolved in parallel with everything below.

**T004 — Connection pooler before launch?**
> Read `specs/005-production-hardening/plan.md`'s "Architecture — Infrastructure Scaling" table,
> the T295 row specifically. The current code is sized for ~1,000 concurrent users with no
> connection pooler installed (`apps/api/src/db/client.ts`'s own comment already flags this as
> planned-but-not-done). Question: given our actual expected concurrent-user count at launch, do
> we need a pooler (recommend PgBouncer) before going live, or can it wait until we see real load?
> Answer needed before T036 can be scheduled into or after the launch window.

**T013 — Email transport: finish Resend, or build Hostinger SMTP?**
> Read `specs/005-production-hardening/research.md`, section "C.1 Email transport." The codebase
> already has a fully-built, tested Resend HTTP-API mailer (`apps/api/src/services/email/
> resend-mailer.ts`) needing only a real API key + verified sending domain to go live. Separately,
> a real Hostinger mailbox (`ai-audit@youesf-abdallah.online`, `smtp.hostinger.com:465`) was
> provided as "existing infrastructure." Question: finish the Resend rollout (least new code,
> gives a real delivery/bounce dashboard for free), build a new SMTP mailer for the Hostinger
> mailbox (uses infrastructure we already pay for, no third-party dependency, but no
> delivery-tracking dashboard — we'd need to build our own send-log), or SMTP-primary with Resend
> as fallback? Recommendation on file: option 1 (finish Resend) unless there's a specific reason
> to prefer the Hostinger mailbox. Answer needed before T014/T016/T017 can start.

**T019 — Does a payment-failure notification email belong in scope?**
> Read `specs/005-production-hardening/plan.md`'s "Architecture — Email" section. Default on file:
> send a confirmation email on successful payment only; do not email on a declined/cancelled
> payment unless there's a specific reason to. Question: do we want a failure-notification email
> too? If yes, it's a small follow-up task mirroring T018's shape (`sendPaymentFailed`).

**T027 — Real AI cost-alert threshold numbers**
> Read `specs/005-production-hardening/data-model.md` section 3.2. The mechanism (`CostAlertThreshold`,
> per-user and global, window + threshold in micros) can be built and tested with placeholder
> values right now (see T026 below, which is unblocked). But real production numbers — how much
> spend per user per hour/day is "normal," and what's the global daily budget we want to be
> alerted about — are a product/finance call, not an engineering one. Answer needed before this
> goes live with real thresholds (placeholders are fine for building/testing in the meantime).

**T033 — Does `probe-pool`/`sandbox-runner` need multi-instance support for this launch?**
> Read `specs/005-production-hardening/plan.md`'s infrastructure-scaling table, rows for T304/T305.
> Both currently run as a single instance each — correctness isn't at risk, only how much
> concurrent audit throughput one instance can sustain. Question: what's our expected concurrent-
> scan volume at launch, and does a single instance of each comfortably clear that bar? If yes,
> T034/T035 can be deferred past launch; if no, they need to be scheduled before it.

---

## Ready-now implementation prompts (no blockers, can start immediately)

### T001 — Promote `PendingPayment.status` to a real enum

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel (pnpm/Turborepo monorepo). This is WebAudit AI.

Read, in order: AGENTS.md; specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (this
defines the exact code-structure/security/testing conventions and the Definition-of-Done templates
every task references — do not skip it); specs/005-production-hardening/research.md (Part C.1's
second decision, explaining why); specs/005-production-hardening/data-model.md section 1.1; then
specs/005-production-hardening/tasks.md's full "T001" section — that is your complete
implementation spec (current schema, target enum, migration approach, files, tests, acceptance
criteria, Definition of Done, verification commands).

Implement exactly T001 as specified: promote PendingPayment.status from a free-text column to a
real Prisma enum (PENDING | SUCCEEDED | FAILED | CANCELLED | EXPIRED), with a one-time backfill of
existing "PENDING"/"COMPLETED" string values into the new enum in the same migration, and extract
the status-transition logic into a small new shared helper (apps/api/src/services/billing/
pending-payment.ts) that uses an atomic updateMany gated on `status = 'PENDING'` — this helper
must become the only writer of this column anywhere in the codebase. Update
apps/api/src/routes/webhooks.routes.ts to use the new enum values and the new helper instead of
its current raw-SQL UPDATE.

Do not touch anything Paymob-specific (T005-T012) — those are explicitly paused. Do not touch
T002/T003 — separate tasks, separate sessions.

Run `pnpm --filter @webaudit/api exec prisma migrate dev --name pending_payment_status_enum`
against the local dev Postgres (confirm it's running first). Follow this repo's test-first
convention.

This task's Definition of Done is DoD-B (migration) AND DoD-A (the new helper module and the
webhooks.routes.ts change) from ENGINEERING-STANDARDS.md §6 — satisfy both in full, not just the
narrow automated Verify commands. That includes the manual step T001 specifies: after migrating,
open Prisma Studio (`pnpm db:studio`) and confirm with your own eyes that any existing
"PENDING"/"COMPLETED" string rows actually landed as PENDING/SUCCEEDED in the new enum column.

When done, run the verification commands from T001's own section, report real pass/fail counts,
report exactly what you saw in the manual Prisma Studio check, and update tasks.md's status for
T001 to DONE with a note on how it was verified (matching the style of already-completed tasks
elsewhere in this repo's planning docs, e.g. docs/reviews/AI-ENGINEERING-TASKS.md).
```

### T002 — Build a real checkout concurrency lock

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md, then specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (defines the
code/security/testing conventions and the DoD-A template this task is held to — do not skip),
then specs/005-production-hardening/research.md section B.3 item 1 (why this matters — a reference
project, EduFlow-LMS, documents this exact control but never actually built it, leaving a real
concurrency gap this product currently shares), then specs/005-production-hardening/tasks.md's
full "T002" section for the implementation spec.

Build a Redis-backed lock (key: checkout:{userId}, short TTL) that apps/api/src/services/billing/
checkout.service.ts acquires before creating a PendingPayment and releases on any terminal outcome
of the checkout-initiation call itself (not the whole payment lifecycle — a long-pending payment
must not lock a user out of ever trying again). A user hitting the lock gets a 409
CHECKOUT_IN_PROGRESS response.

Write the adverse test T002 specifies: fire two concurrent checkout-initiation requests for the
same user and assert exactly one proceeds. This is the single most important acceptance criterion
— a lock that isn't proven under real concurrency isn't proven at all.

Do not touch Paymob-specific files (T005-T012, paused).

This task's Definition of Done is DoD-A (ENGINEERING-STANDARDS.md §6) in full. The manual
verification is not optional and is not the same as the automated test: open two real terminal
windows, fire two near-simultaneous real HTTP requests against your locally running API for the
same user, and confirm with your own eyes that exactly one succeeds and the other gets 409 — per
ENGINEERING-STANDARDS.md §7 "Payments" step 3.

When done, run the verification command from T002's section, report real results, report exactly
what the manual two-terminal test showed, and update tasks.md's status for T002 to DONE.
```

### T003 — Build the payment-abandonment expiry sweep

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md, specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (this task is held
to the DoD-C template — a scheduled job, proven idempotent and concurrent-mutation-safe by test,
not by comment), specs/005-production-hardening/contracts/state-machines.md section 1, and
specs/005-production-hardening/tasks.md's full "T003" section.

This depends on T001 (the PENDING/EXPIRED enum) — confirm T001 is done (check tasks.md's status
table) before starting; if it isn't, stop and say so rather than building against the old string
column.

Build a repeatable job that transitions PendingPayment rows stuck in PENDING past a configured
abandonment window to EXPIRED — mirror apps/worker/src/orchestrator/timeout.ts's exact shape
(sweepTimedOutScans) and apps/worker/src/orchestrator/timeout-scheduler.ts's scheduling pattern;
these are the direct precedent to pattern-match, not to reinvent. Use the same atomic
updateMany-gated transition helper T001 built (apps/api/src/services/billing/pending-payment.ts)
so a payment that completes concurrently with the sweep's read is correctly left alone — write the
adverse test proving this specifically (mirror timeout.ts's own "a scan that completed in the
meantime loses nothing" test if one exists as a pattern to follow).

Default abandonment window: 60 minutes (documented rationale in tasks.md — revisit once the real
Paymob integration's iframe-token expiry is confirmed, later, not now).

Manual verification (mandatory, not a substitute for the automated adverse test, in addition to
it): per ENGINEERING-STANDARDS.md §7 "Payments" step 4 — create a real PendingPayment row locally,
temporarily lower the sweep's configured window via its env var, trigger it, and watch it actually
flip to EXPIRED in Prisma Studio (`pnpm db:studio`).

When done, run the verification command from T003's section, report real results, report what the
manual Prisma Studio check showed, update tasks.md's status for T003 to DONE.
```

### T026 — Add `CostAlertThreshold` and `CostAlertEvent` models

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md, specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (this is a DoD-B
schema task — migration must be real and generated, additive, confirmed applied), specs/
005-production-hardening/data-model.md sections 3.2-3.3, and
specs/005-production-hardening/tasks.md's full "T026" section.

Add the two new Prisma models exactly as specified in data-model.md (CostAlertThreshold:
scope/windowMinutes/thresholdMicros/isEnabled, unique on scope; CostAlertEvent:
scope/userId/windowStart/windowEnd/observedMicros/thresholdMicros/notifiedAt, indexed on
scope+userId+windowEnd). Create the migration. Seed one PER_USER and one GLOBAL threshold row with
placeholder values — the real numbers are a separate, pending decision (T027, not yours to
resolve) — mark the seed values clearly as placeholders in a code comment.

This task is schema-only; do not build the computation job or admin endpoints yet (that's T028,
a separate task/session).

Run `pnpm --filter @webaudit/api exec prisma migrate dev --name cost_alert_thresholds` against the
local dev Postgres. Manual verification (mandatory): open Prisma Studio (`pnpm db:studio`) and
confirm the two seed rows are actually visible with the expected placeholder values — do not
assume the migration succeeded just because the CLI didn't error.

When done, report results, report what you saw in Prisma Studio, and update tasks.md's status for
T026 to DONE.
```

### T029 — Add queue-depth check and refusal to scan creation

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md, specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (DoD-A applies —
structured error shape, size caps, real tests), specs/005-production-hardening/data-model.md
section 4 (why no new table is needed — BullMQ's own introspection is the source of truth), and
specs/005-production-hardening/tasks.md's full "T029" section.

Modify apps/api/src/services/intake/create-scan.ts to check the scanPhase queue's depth (BullMQ
introspection, e.g. Queue.getWaitingCount()) before enqueueing: under a configurable soft limit,
proceed as today; over a hard limit, refuse with a structured
{ error: { code: 'QUEUE_AT_CAPACITY', ... } } response (matching this repo's existing structured-
error convention — look at InsufficientCreditsError's shape for the pattern to follow).

Critical acceptance criterion, write the test for this explicitly: existing priority ordering
(packages/config/src/queues.ts's PRIORITY/priorityForPlan) must still determine position within
whichever branch is taken — a paying tier's priority must not be defeated by this new check. Do
not implement T030 (the queuePosition response field / UI) in this same task — separate task.

Manual verification (mandatory): script a real burst of scan-creation requests against your local
running stack until the configured limit is hit, confirm the real QUEUE_AT_CAPACITY response
actually appears, and confirm a priority-tier request submitted mid-burst still lands ahead of
already-queued free-tier requests — per ENGINEERING-STANDARDS.md §7 "Monitoring / APM" step 3.

When done, run the verification, report results, report what the manual burst test showed, update
tasks.md's status for T029 to DONE.
```

### T031 — Partition `AiInvocation`/`CapabilityExecution` by `createdAt`

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md and specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (§4's migration
conventions and DoD-B apply directly — additive, real-migration, confirmed-applied), then
specs/005-production-hardening/data-model.md section 5.2 carefully, then
specs/005-production-hardening/tasks.md's full "T031" section.

This is a raw-SQL migration (Prisma cannot model native Postgres partitioning) — write it by hand
under apps/api/prisma/migrations/, with an explicit comment at the top of the migration file
stating it is hand-written raw SQL and why (mirroring this repo's existing precedent: the
credit-debit FOR UPDATE query in apps/api/src/services/credits/debit.ts is raw SQL for the same
class of reason — Prisma cannot express it). Convert AiInvocation and CapabilityExecution to
monthly-partitioned tables by createdAt.

Hard boundary, treat as non-negotiable: this migration must not touch CreditTransaction,
CreditAllocation, BillingEvent, or Receipt in any way. Before writing anything, re-read this
constraint from tasks.md's T031 section and design the migration so it's structurally impossible
to violate (i.e., don't even open those tables' definitions in the same migration file).

Write the test T031 specifies: confirm apps/api/src/services/admin/margin.service.ts's existing
reports still run correctly and return the same results against the now-partitioned tables —
partitioning must be completely transparent to every existing query.

Do NOT build the detach-and-archive-to-R2 job yet (that's T032, gated partly on a legal/retention
decision — separate task).

Manual verification (mandatory, do not skip): after migrating, actually run
apps/api/src/services/admin/margin.service.ts's real report (via its route, or a direct call)
against your local dev DB and confirm it returns the identical result shape it did before the
migration — partitioning must be completely invisible to a caller. Report the before/after
comparison you performed, not an assumption that "nullable/structural changes are safe."

When done, run the verification, report real results, report the margin-report comparison, update
tasks.md's status for T031 to DONE.
```

---

## Ready-now, but larger/needs an SDK choice first

### T020/T021 — Integrate APM/error-tracking into `apps/api` and `apps/worker`

```
Work in C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

Read AGENTS.md, specs/005-production-hardening/ENGINEERING-STANDARDS.md IN FULL (this task's
manual dashboard check in §7 "Monitoring / APM" is mandatory, not optional — an automated test
alone does not satisfy this task's Definition of Done), specs/005-production-hardening/plan.md's
"Architecture — Monitoring & Observability" section in full (it names Sentry as the default
recommendation and explains why — first-class Node/Express SDK, hosted option, combines
error-tracking and basic tracing in one tool — but flags this as overridable, not mandated), and
specs/005-production-hardening/tasks.md's "T020" and "T021" sections.

Confirm with whoever assigned this task whether Sentry (the default) is acceptable, or whether a
different APM/error-tracker has already been chosen — do not silently proceed on the default if
someone has told you otherwise.

Integrate the chosen SDK into apps/api/src/index.ts and apps/worker/src/index.ts (separate init in
each, matching this repo's five-separate-deployable-units architecture — do not create a shared
"monitoring" package unless the SDK's own docs specifically require one for a monorepo). Critical
requirement, verify explicitly with a test: the SDK's own error/breadcrumb capture must not defeat
this repo's existing redaction discipline (packages/config/src/logger.ts already redacts
everything that goes through it) — configure the SDK's own scrubbing to match, and write a test
proving a redacted-in-our-logs value (e.g. a secret-shaped string) does not leak through
unredacted via the SDK's own error capture.

Manual verification (mandatory, this is the actual completion bar for this task, not a
nice-to-have): add a temporary scratch route that throws, hit it, confirm the error shows up in
the real dashboard, then remove the scratch route. Do this separately for both apps/api and
apps/worker — do not skip the worker check on the assumption that proving it for the API is
sufficient, they are separate process inits.

When done, report the real dashboard event you saw for each process, and update tasks.md's status
for T020 and T021 to DONE.
```

---

## Not included in this file (do not start from here)

- **T005-T012, T042 (Paymob)** — explicitly paused; blocked on T006 (real merchant credentials)
  regardless.
- **T004, T013, T019, T027, T033** — decision requests above, not code tasks.
- **T014-T018** — depend on T013's decision.
- **T022-T025, T028, T030** — buildable, but each depends on a task above landing first (T022 on
  T020/T021 having a destination to alert to; T028 on T026; T030 on T029) — write their own
  prompts once their dependency's status in `tasks.md` says done.
- **T032, T034-T041, T043-T045** — later phases, each with their own stated dependency in
  `tasks.md`; not ready yet.
