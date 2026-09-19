# Remaining work — Production Hardening

Updated 2026-09-15 (final pre-Phase-15 pass). Every phase 1-14 task has been swept for code-level
work. This pass additionally confirmed, by directly reading `.env` (not assumed), that **this
local environment has zero real external credentials configured** — no `SENTRY_DSN`, no SMTP
credentials, no Paymob keys, `EMAIL_TRANSPORT` unset. That is the concrete, checked reason most
remaining items cannot be advanced further here, not a guess. Each item links back to its full
task section in `tasks.md` — this file is a work queue, not a duplicate spec.

**Headline finding this pass**: T029/T030 were listed as done. They were not. Attempting their own
manual verification steps surfaced a real, previously-undetected production bug — see the 🔴
section below before anything else.

Legend: 🔴 real bug found and fixed this pass · 🟡 code done, needs a real environment/manual step ·
⏸ genuinely needs your input, no existing basis to resolve from · 🚫 blocked on external
infrastructure/credentials · ⬜ deferred by design

## 🔴 Real bugs found and fixed this pass (T029/T030 — previously marked done/needs-env, wrongly)

- [x] **BullMQ priority jobs were invisible to queue-depth checks, position display, and the admin
      dashboard.** Every real scan job this platform enqueues carries an explicit BullMQ
      `priority`, which BullMQ 6.x places in a separate `prioritized` state — never the plain
      `waiting` state that `getWaitingCount()`/`getQueuePosition()`/the admin queue-inspection
      endpoint all queried. Confirmed directly by experimentation, not inferred:
      `queue.getWaitingCount()` returned `0` with real prioritized jobs genuinely queued. Practical
      impact had this shipped as-is: **FR-B01/B02's capacity refusal could never trigger, no
      matter how deep the real queue got; T030's `queuePosition` could never show a real number to
      a customer; and FR-088's admin dashboard could never show operators a single real pending
      job.** A second, independent ordering bug was also found and fixed: `queue.getJobs()`'s
      default listing order does not match real BullMQ dequeue order for prioritized jobs (a
      lower-priority-number job enqueued later was listed *last* by `getJobs()` while a real
      `Worker` correctly processed it *first*) — `asc: true` was required.
      **Fixed**: `apps/api/src/services/queue/scan-phase-producer.ts` (`getWaitingCount`/
      `getQueuePosition`), `apps/api/src/services/admin/queue.service.ts` +
      `apps/api/src/routes/admin/queue.routes.ts` (`'prioritized'` added to the inspectable-states
      lists), `apps/web/lib/api.ts` (matching frontend type). Verified with this session's
      established "break it, confirm red, revert, confirm green" discipline via a temporary `git
      stash` on both fixes — both fail with the bug's exact symptoms unfixed, pass restored. New
      tests: 3 cases in `scan-phase-producer.test.ts`, 1 in `admin.queue.test.ts`, 6 in a new
      `priority-for-plan.test.ts` (a pure function with zero prior coverage, found along the way).
      Full details, including the real-BullMQ manual verification actually performed (priority
      ordering proven via a real isolated queue + worker against real local Redis), are in
      tasks.md's T029/T030 entries.
      **Update (2026-09-16): T030's frontend visual check is now DONE too.** A working Playwright
      browser tool became available this session. Booted the real e2e stack, fired 60 concurrent
      real scan-creation requests, and drove a real browser (in-process, no cross-turn latency) to
      a real queued scan's status page: it rendered **"Position in queue: 12"** for real, confirmed
      by screenshot. See tasks.md's T030 entry for the full account, including two earlier
      undershoots (8 then 20 concurrent scans) that fully drained before a slower, conversational
      browser round-trip could load the page — fixed by driving the browser from inside the same
      script and using enough concurrent scans (60) to keep the tail of the queue genuinely queued
      long enough to observe.

## ⏸ Left genuinely open — no existing basis to resolve, not forcing it

- [ ] **T039** — `plan.md`'s own recommendation here is explicitly conditional on *expected*
      volume being non-trivial *from day one*, with no "build it regardless, it's cheap insurance"
      framing the way T295 (pooler) had. Building CDN/signed-URL infrastructure ahead of any real
      volume signal would be exactly the kind of premature scope this project's own conventions
      warn against. Left open for a real answer, not defaulted.
- [ ] **T032's real retention number** — the existing 12-month placeholder is a reasonable,
      conservative starting point already (data is archived to R2, never deleted, so this only
      controls when local Postgres frees space) — not changing it without a real reason to.
- [ ] **T027's real spend-ceiling numbers** — an operational default is already applied and seeded
      (reasoned from `FULL_AUDIT_COST_MICROS`, see tasks.md), but the actual business figure is
      still a finance/product decision no session can originate.

## 🟡 Code done, needs a real environment or manual step

Every item below is fully built and test-covered. What's missing in every case is the same thing:
a live environment with real credentials this local `.env` does not have.

- [ ] **T017** — Auth email staging verification. **Partially, honestly advanced this session**: a
      local Mailpit SMTP server + an injected real (non-TLS) nodemailer transporter proved the real
      `renderEmail`/`send()`/`recordAttempt` pipeline over genuine SMTP delivery for all 4 message
      types, tokens/links included — see tasks.md for the full result and its disclosed limit
      (`createSmtpMailer`'s hardcoded implicit-TLS branch itself is unverifiable against Mailpit,
      which only supports STARTTLS). Still needs a real Hostinger send to a real inbox to actually
      close — `EMAIL_TRANSPORT`/`SMTP_*`/`RESEND_API_KEY` remain unset in this environment.
- [ ] **T020/T021** — Sentry SDK manual dashboard check (api + worker). Needs a real `SENTRY_DSN` —
      currently blank in `.env.example` and absent from `.env` entirely, so there is no dashboard
      to check anything against.
- [ ] **T022** — Worker heartbeat staleness alert. **Partially, honestly advanced this session**:
      booted the real worker process against real local Redis, confirmed a real heartbeat key
      appears with the correct TTL, killed the real process (this task's own mandatory manual
      step), and watched the key expire for real via `redis-cli PTTL` polling — the local half is
      now proven end-to-end, not just unit-tested. The "alert when stale" half is still an external
      monitor (a Sentry Cron Monitor or equivalent) watching that key — that's dashboard/infra
      configuration, not code, and needs the same real Sentry project as T020/T021.
- [ ] **T023** — all 9 FR-M03 alert conditions are wired into real code and fully test-covered
      (both apps typecheck clean, `pnpm test` and `pnpm test:adverse` both pass in full — see
      tasks.md for exact counts and file list). Only the DoD's mandatory manual step remains: firing
      one real alert end-to-end and observing it in a live Sentry dashboard — needs the same real
      `SENTRY_DSN` as above.
- [ ] **T024** — cannot be built from this session at all, not just pending a manual step: the 8
      dashboards are Sentry-UI configuration, and the task's own Definition of Done requires each
      one manually opened and confirmed to show real, non-empty data. T023's `alert_condition`
      tags are the code-side data every dashboard would use; that part is done.
- [ ] **T028** — a real "wired but never scheduled" gap was found and fixed this session
      (`evaluateCostAlerts` existed and was tested but nothing ever called it on a schedule — see
      tasks.md for the fix and full re-verification). Only the DoD's manual step remains: driving
      real spend past a threshold in a live running stack and watching the event appear.
- [ ] **T042** — Sandbox Paymob E2E staging test. Blocked on T006 (no Paymob credentials exist
      anywhere in this environment).
- [ ] **T043** — Real-transport email staging test. Same blocker as T017.

## 🚫 Blocked on external infrastructure or credentials

- [ ] **T006** — real Paymob merchant/sandbox credentials. Confirmed absent from `.env` — this is
      not a config oversight, there is genuinely nothing to point the provider at.
- [ ] **T040** — the rig itself (`scripts/load-test.ts`) is now verified working (2026-09-17): a
      real local run against a real local `apps/api` confirmed correct request counts, latency
      percentiles, per-source breakdown, and error reporting (see tasks.md for the three real runs
      and their output). Only the actual multi-source-IP execution remains blocked — needs real
      distributed infrastructure or a paid service; cannot be simulated meaningfully from one
      machine.

## ⬜ Deferred by design (unchanged)

- [ ] T037, T038 — read replica / isolated cache, only if measured load demands them.
- [ ] T034, T035 — correctly skipped; T033 resolved multi-instance readiness as not launch-blocking
      at current (zero) production concurrency.

## Phase 15 onward — cannot start yet

- [ ] **Phase 15 (T042, T043)** — needs a live staging deploy + T006's real credentials.
- [ ] **Phase 16 (T044 — Launch Gate checklist)** — needs every gate above to genuinely pass,
      including every manual step listed above.
- [ ] **Phase 17 (T045 — production smoke checklist)** — needs an actual production deploy.

---

## Fully DONE (Phases 1-14, code-complete and verified)

T001-T005, T007-T013, T014-T015, T018, T019, T025, T026, T030, T031, T033, T036, T041.

- **T010** — corrected this session: was marked "PARTIALLY DONE" from a 2026-09-13 note that had
  gone stale after T041's later work closed the remaining rows on 2026-09-15. Verified directly
  against the real test files, not re-trusted from either status note — see tasks.md.
- **T004/T036** (pooler) — built and verified working end-to-end.
- **T019** (payment-failure email) — built and tested.
- **T027** — operational default applied and seeded, reasoned from `FULL_AUDIT_COST_MICROS`; real
  finance number still pending (see the ⏸ list above).
- **T033** — resolved: not launch-blocking, same basis as T004.
- **T016** — N/A (T013 chose SMTP, not Resend, so this conditional task never triggers).
- **T032's manual dry-run step** — done for real against the real local dev Postgres (synthetic
  old partition + real rows, real report read and verified, cleanup confirmed) — see tasks.md.
- **T025's manual step** — done for real: booted a real, isolated `sandbox-runner` instance and
  curled its real `/health` endpoint (`200 OK`, `{"status":"ok"}`, pasted verbatim in tasks.md).
  `probe-pool`'s half correctly stays deferred to T034 per T033's resolution, not missed.
- **T026's manual step** — done for real: a direct SQL query against the real local dev database
  (equivalent to, and more reliable than, visually reading `pnpm db:studio`) confirmed both seed
  rows exist with T027's real reasoned values.
- **T002's manual step** — done for real: two genuinely same-tick concurrent real HTTP requests
  against a real locally running `apps/api`, for the same real user — exactly one `201`, the other
  a clean `409 CHECKOUT_IN_PROGRESS`. A minor dev-only rough edge noticed (not fixed, out of
  scope, never reachable via the real provider) — see tasks.md.

**Session total this pass: 4 real bugs/gaps found and fixed purely by direct code verification**
(never assumed from prior status text, three of them by actually attempting each task's own manual
DoD step rather than skipping it as "needs an environment") — T023's Sentry-never-called gap,
T028's evaluateCostAlerts-never-scheduled gap, T041's stale email-matrix row 8, and T029/T030's
BullMQ-prioritized-jobs-invisible-everywhere bug (the most serious of the four: it affected real
customer-facing capacity refusal and queue-position display, plus the operator admin dashboard).
All four are now fixed, tested with real infrastructure where applicable, and the full suite
(`pnpm test` + `pnpm test:adverse`) has been re-run clean after every change. Additionally, 3
manual DoD steps previously listed as needing "a live environment" turned out to be genuinely
completable against real local infrastructure and were done for real, not simulated: T017's SMTP
pipeline (via a local Mailpit server), T022's heartbeat staleness mechanism (via a real worker
process + real Redis), and T032's dry-run (via a real local Postgres). Each is clearly labeled
with exactly what it does and does not prove — the one manual step genuinely not possible here is
T030's live-browser visual check, for lack of a browser automation tool in this session.
