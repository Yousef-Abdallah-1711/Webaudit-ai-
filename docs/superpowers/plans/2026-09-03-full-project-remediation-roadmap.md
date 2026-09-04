# WebAudit AI — Full Remediation & Completion Roadmap

**Written**: 2026-09-03
**Purpose**: This file is split into self-contained **Sessions**. Open a new agent session, tell it
"read this file, Session N, and start" — that agent needs nothing else from prior conversations. Each
session recaps its own context, lists its exact tasks, names its files, and states how to verify it's
actually done.

**Do not start any session without being asked.** This file is a plan, not a standing instruction to
execute.

---

## Session index

| # | Title | Depends on | Size |
| --- | --- | --- | --- |
| 1 | Land the finished Phases 4–7 remediation | none | small — merge + verify only |
| 2 | Close the `grantLot` billing idempotency gap | Session 1 merged | small |
| 3 | US6 — mid-audit brand-intent questionnaire (spec-kit Phase 8) | none, but see ordering note | medium — 8 tasks |
| 4 | US7 admin — backend services & routes (spec-kit Phase 9a) | none, but see ordering note | medium — 10 tasks |
| 5 | US7 admin — frontend screens (spec-kit Phase 9b) | Session 4 | medium — 4 tasks |
| 6 | US7 admin — adversarial review & fix wave (spec-kit Phase 9c) | Sessions 4 + 5 | medium — review-driven |
| 7 | Sandbox runner — core isolation (spec-kit Phase 10a) | none, but see ordering note | large — 9 tasks, security-critical |
| 8 | Sandbox runner — deploy & real dispatch (spec-kit Phase 10b) | Session 7 | small — 2 tasks, finishes the phase |
| 9 | Polish & cross-cutting concerns (spec-kit Phase 11) | best last, not strictly blocked | medium — 9 tasks |

**Ordering note**: Sessions 3, 4, and 7 touch disjoint areas of the codebase (worker/questionnaire,
api+web/admin, sandbox-runner) and have no code dependency on each other — they can run in parallel
in separate sessions or worktrees. All of them build on top of whatever `main` looks like after
**Session 1** merges. If you start one of them before Session 1 lands, expect a rebase later — flag
that explicitly rather than silently basing new work on a branch that's about to move.

---

## 0. Shared orientation — every session reads this first

| Question | Answer |
| --- | --- |
| Where does the finished Phases 4–7 remediation work live? | Branch `worktree-phases-4-7-remediation`, checked out at `.claude/worktrees/phases-4-7-remediation`, currently at commit `c31139a`. **Not yet merged into `main`** — that's Session 1. |
| What's on local `main` right now? | Commit `d519cb2`, plus uncommitted work-in-progress: a modified `schema.prisma` and `readiness.routes.ts`, and four untracked files (a migration, a test, and the two planning docs this roadmap builds on). |
| Which document governs what? | [CLAUDE.md](../../CLAUDE.md) → constitution → spec → plan → research → data-model → contracts, in that authority order. This file sits below all of them — it's a checklist, not a spec. |
| What's the authoritative task list for unbuilt features? | [specs/001-webaudit-mvp-baseline/tasks.md](../../specs/001-webaudit-mvp-baseline/tasks.md) — 209/250 done. This file copies the exact task text for Phases 8–11 as of 2026-09-03; if `tasks.md` has since changed, trust the live file over this copy. |
| What's the honest scoreboard? | [PROGRESS.md](../../PROGRESS.md) — read its "Resume here" section too. |
| What are the two prior review documents? | [2026-09-02-phases-4-7-engineering-review.md](2026-09-02-phases-4-7-engineering-review.md) (18 findings) and [2026-09-02-phases-4-7-remediation.md](2026-09-02-phases-4-7-remediation.md) (the 14-task plan that fixed 16 of them). Both are **done** — see Session 1. |

### Environment gotchas (each has cost someone an hour before)

- Postgres on port **5442**, Redis on port **6389** (containers `webaudit-postgres` / `webaudit-redis`), not the defaults.
- `TEST_DATABASE_URL` (test DB `webaudit_test`) is a **different database** from `DATABASE_URL` (dev DB `webaudit`). Running `prisma migrate deploy` without overriding the URL hits the wrong one.
- A git worktree does not inherit untracked files — copy `.env` into it manually before running anything that needs `JWT_ACCESS_SECRET` etc.
- Running more than one test file at once against the shared test DB needs `--no-file-parallelism`, or unrelated files' `beforeEach(resetDb)` calls race and produce phantom FK-violation failures that look like real bugs but aren't.
- `apps/web/tests/unit/adherence-lint.test.ts`'s "every ported .tsx file... lints clean" case has no explicit timeout override and can exceed vitest's default 5000ms on a cold oxlint start on some machines — a known, pre-existing, environment-dependent flake, not a code defect. If it fails, re-run it alone before assuming a regression.
- Provider calls are always stubbed (`AI_MODE=fixtures`) in tests — never spend real LLM money running the suite.

### Process every session follows

1. Read the constitution + relevant spec/plan sections for that session's area first.
2. Write or confirm a TDD-based implementation plan (per `superpowers:writing-plans`) before writing
   code, unless the task list in the session is already granular enough to execute directly.
3. Execute via the subagent-driven pattern already established in this project: implementer →
   independent reviewer → fix round, one task at a time. Keep an SDD ledger.
4. One consolidated fix wave at the end of the session from a whole-branch/whole-session review — do
   not open a second full review cycle; residual minor findings get adjudicated or fixed directly.
5. Never weaken a guarantee (the seven non-negotiables in CLAUDE.md) to make a task's tests pass
   faster.
6. Update PROGRESS.md and this file's checkboxes honestly when the session completes, including what
   is still unverified. Check a box only when the task is done **and verified**, not just written.
7. If the session surfaces a new, unplanned issue — the way Phases 4–7 surfaced three of them —
   record it under that session's own "New issues found" list rather than silently fixing and
   forgetting it.

---

## Session 1 — Land the finished Phases 4–7 remediation

**Start here.** Nothing in this session requires new engineering — every fix is done and verified
(two independent whole-branch reviews confirm it). What's left is a merge decision.

**Context**: An engineering review of Phases 4–7 (T144–T193) found 18 issues. A 14-task remediation
plan fixed 16 of them (2 deliberately excluded, see the Reference Appendix at the bottom of this
file). Along the way, three *additional* unplanned problems were found and fixed by the process
itself: a concurrency-limit regression in a pre-existing test, a genuinely-broken (not just "flaky")
test traced to a real supertest bug, and — the most important one — a **critical bug the final
whole-branch review caught that every per-task review and every automated test suite had missed**:
the workspace-teardown job's BullMQ id contained a colon, which BullMQ silently rejects on every call,
so cancelled scans were never actually being cleaned up in production despite the fix being marked
done. All of this is fixed, tested, and sitting on branch `worktree-phases-4-7-remediation` at
commit `c31139a` (29 commits since baseline `369fb5e`).

### Tasks
- [x] Decide the merge target: local `main` first, or straight to `origin/main`? → **local `main`
      first.** Safer default: keeps a staging point before anything touches the remote.
- [x] Decide the merge shape: fast-forward/merge commit preserving all 29 commits, or squash? →
      **fast-forward, full history preserved.** `main` (`d519cb2`) turned out to be an exact ancestor
      of the remediation branch (verified via `git merge-base --is-ancestor` before doing anything) —
      zero divergent commits, so a clean `--ff-only` merge was possible with no conflict risk.
      Squashing would have destroyed 29 commits' worth of individually-reviewed rationale for no
      benefit.
- [x] Merge `worktree-phases-4-7-remediation` (commit `c31139a`) into the chosen target. → Done,
      `main` is now at `c31139a`.
- [x] Resolve the pre-existing uncommitted state on `main` — **verified each file individually before
      touching anything**: `schema.prisma` and `readiness.routes.ts`'s modifications, plus the
      untracked migration dir, test file, and two of the three planning docs, were all confirmed
      byte-for-byte superseded (older, partial, or identical versions of exactly what the merge
      brought in — nothing unique was on `main` that the branch didn't already have or improve on).
      Discarded the two tracked-file modifications (`git checkout --`) and removed the four
      confirmed-superseded untracked paths — git's own `--ff-only` safety check flagged the same four
      files independently, matching the verification exactly, before anything was deleted. The
      fifth untracked file (this roadmap itself, written only on `main`, never in the branch) was
      correctly left untouched throughout — it didn't collide with anything.
- [x] Re-run the full gate on the merged result → **all green**: `lint` clean, `lint:adherence` 0
      warnings/errors, `pnpm -r typecheck` clean across 31 packages (after `pnpm run db:generate` —
      the Prisma client needed regenerating for the merged schema's new `appliedAt` column),
      `pnpm run test` **804/804** (isolated run — a first attempt run concurrently with the adverse
      suite against the shared test DB produced 25 phantom failures, confirmed as contamination and
      not real by re-running each suite alone), `pnpm run test:adverse` **570/571** (1 pre-existing
      skip, isolated), `pnpm run test:visual` 6 passed/7 todo/0 failed (flaked once on an unrelated
      Chromium screenshot protocol error, clean on re-run), production build clean.
- [ ] Remove the worktree — **git-level removal done** (`git worktree remove` unregistered it
      successfully; `git worktree list` confirms only `main` remains), but the on-disk directory at
      `.claude/worktrees/phases-4-7-remediation` could not be deleted (Windows `MAX_PATH` "Filename
      too long" via `rm -rf`, then a file-lock error via `cmd /c rmdir`, from an unidentified process
      — no lingering `node`/`vitest` process was found holding it). **Manual cleanup still needed**:
      delete that directory by hand (e.g. after a reboot, or with a long-path-aware tool) — it is
      already fully disconnected from git and safe to remove whenever the lock clears.
- [ ] Decide whether to revisit pushing `.github/workflows/ci.yml` (blocked earlier by a GitHub OAuth
      `workflow`-scope restriction, independent of which token/account was used) — needs a credential
      with the `workflow` scope, or push everything except that file again as before. **Not done —
      awaiting the human partner's decision**, same as before this session.

**Session 1 status: functionally complete.** `main` is merged, verified, and ready. Two small
manual-only loose ends remain (the leftover worktree directory, and the CI workflow push decision) —
neither blocks any other session in this file.

### Definition of done
All six gates above green on the merged branch; the worktree cleaned up; PROGRESS.md's header updated
to reflect the merge.

### Known baseline (confirm still true after merging, don't just trust this)
`lint`, `lint:adherence`, `pnpm -r typecheck` (31 packages), `test:adverse` (570/571, 1 pre-existing
skip), `test:visual` (6/13, 7 `it.todo`), and the production build are all clean on the worktree
branch as of `c31139a`. `pnpm run test` is 803/804 — the one failure is
`apps/web/tests/unit/adherence-lint.test.ts`'s cold-start timeout (see Environment gotchas above),
confirmed via `git log`/`git diff` to be completely untouched by this branch's 29 commits.

---

## Session 2 — Close the `grantLot` billing idempotency gap

**Context**: During the Phases 4–7 remediation (Task 5, retryable billing webhook), the implementer
found and the controller explicitly ruled to defer a narrower, real gap rather than silently expand
that task's scope: `grantLot` (`apps/api/src/services/credits/grant.ts`) has no idempotency key. If a
billing-webhook provider retries in the narrow window between `subscribe`/`renewSubscription`/
`purchaseCredits`'s own effect committing and the following `BillingEvent.appliedAt` write succeeding,
the retry re-invokes the effect and double-grants credits. This is recorded as PROGRESS.md's Open
Decision #15.

**Prerequisite**: Session 1 merged (this touches the same billing code the remediation branch just
fixed).

### Tasks
- [x] Read `apps/api/src/services/credits/grant.ts` and the `subscribe`/`renewSubscription`/
      `purchaseCredits` call chain in `apps/api/src/services/billing/` before writing anything. →
      Done — `grantLot` creates a `CreditLot` + `CreditTransaction` pair with no dedup key; all three
      effect functions call it inside their own `$transaction`.
- [x] Read `docs/superpowers/plans/2026-08-27-credit-refund-integrity.md` (the R1 plan) before
      touching credits code at all. → Done. The refund single-shot guarantee ("Ruling E") turned out
      to live on `CreditTransaction.reversesId`'s own `@unique` constraint, not in the R1 plan's prose
      — a completely separate field from what this session adds, so the fix here doesn't touch it at
      all (confirmed, not just assumed).
- [x] Write the failing test first — Done, `billing-webhook.test.ts`'s new "does not double-grant
      credits..." test, using a `db.billingEvent.update` proxy that fails only its first call
      (matching `scans.cancel-refund.test.ts`'s established `withFlaky...` pattern). Confirmed RED
      first (`800` granted instead of `400`), for the right reason.
- [x] Add a nullable `billingEventId` column with a unique constraint → **On `CreditTransaction`**,
      matching the existing `reversesId String? @unique` field's exact convention on the same model
      (not `CreditLot` — a lot has no natural "this is the ledger row for event X" semantics the way
      a transaction already does via its `reason` field). Migration
      `20260903050000_credit_transaction_billing_event_id`, applied to both dev and test databases.
- [x] Thread the billing event id through all three effect functions. → Done. Also required reordering
      `grantLot`'s two inserts (transaction row first, lot second) — a subtle point worth recording:
      catching a Postgres unique-violation *inside* the same interactive `$transaction` and continuing
      to use it is unsafe (Postgres marks the transaction aborted after any failed statement; a
      later `COMMIT` on an aborted transaction silently rolls back everything, including whatever
      already succeeded earlier in the same call). So the fix lets the error propagate all the way
      out of `$transaction` (a clean, whole-transaction rollback) and catches
      `DuplicateBillingEventGrantError` one level up, in each effect function, returning the
      already-committed state instead of re-throwing.
- [x] Confirm the fix doesn't change `refund`/`refundPartial`'s single-shot guarantee. → Confirmed —
      untouched file, unrelated field, all of `credits.refund-partial.test.ts`'s 7 tests still pass.
- [x] Full adverse-suite re-run, specifically the six named files → all pass (38 tests), plus the
      broader `renewal.test.ts`/`subscription-lifecycle.test.ts`/`billing-routes.test.ts`/
      `entitlements.test.ts` sweep (17 more) and the full adverse suite (570/571) and full unit suite
      (**805/805**, isolated — two separate contamination false-alarms hit and resolved during this
      verification, see the roadmap's Environment gotchas; neither was a real regression).
- [x] Update PROGRESS.md's Open Decision #15 → Done, resolved.

### Definition of done
New test passes, full adverse suite still green, Open Decision #15 marked resolved. **All met —
Session 2 complete.**

---

## Session 3 — US6: mid-audit brand-intent questionnaire (spec-kit Phase 8)

**Context**: This is spec-kit's next unstarted user story (of 7). **Goal**: a mid-audit intent
questionnaire that pauses only the design area and never holds a worker slot (R4 — "never block a
worker on human input" is a repository-wide, already-battle-tested guarantee; the existing
`awaitQuestionnaire` mechanism elsewhere in the orchestrator is the template to match: persist state,
emit the prompt, schedule a delayed job, return — no timer, no polling, no promise held open).
**Independent test**: answer the questions and confirm design findings reference the stated intent;
run without answering and confirm the audit still completes.

**Prerequisite**: none functionally, but see the Ordering note at the top of this file — base this
work on `main` after Session 1 merges, or expect a rebase.

### Tests to write first
- [ ] T194 — Write failing test asserting the questionnaire pause holds no worker slot (R4) in
      `apps/worker/tests/integration/questionnaire.no-block.test.ts`
- [ ] T195 — Write failing test asserting the deadline race between answer and timeout resolves
      exactly once in `apps/worker/tests/adverse/questionnaire.race.test.ts`
- [ ] T196 — Write failing test asserting timeout resumes on defaults and records DEFAULTED (FR-041)
      in `apps/worker/tests/integration/questionnaire.timeout.test.ts`

### Implementation
- [ ] T197 — Implement `AWAITING_QUESTIONNAIRE` persistence with deadline and slot release in
      `apps/worker/src/orchestrator/questionnaire.ts`
- [ ] T198 — Implement the delayed timeout job and optimistic single-transition guard in
      `apps/worker/src/orchestrator/questionnaire-timeout.ts`
- [ ] T199 — Implement answer submission triggering resume in
      `apps/api/src/services/scans/questionnaire.service.ts`
- [ ] T200 — Thread `DesignIntent` into the design area's AI context in
      `apps/worker/src/module-runner/design-intent.ts`
- [ ] T201 — Build the questionnaire interrupt with visible deadline and skip in
      `apps/web/components/scan/UIQuestionnaire.tsx`

### A specific trap to check before shipping T198
The jobId-colon bug fixed in the Phases 4-7 remediation (the final-review Critical finding) bit
`questionnaire-deadline`'s own delayed job once already, historically, for the identical reason:
BullMQ 6.2.0 only accepts a colon-bearing custom jobId when it splits into exactly 3 segments. Before
shipping T198's delayed timeout job, check its id shape against that rule, and add the same class of
real-queue test `apps/worker/tests/adverse/questionnaire-jobid.test.ts` already established (read
that file — it documents exactly this failure mode and how to test for it against a real queue, not a
hand-written fake, since BullMQ's own validation runs synchronously inside `queue.add` and no fake
reproduces it).

### Definition of done
All three new tests pass, they were RED before the implementation for the stated reason, no
regression in the existing orchestrator/questionnaire suites, and the jobId trap above has been
explicitly checked (not assumed safe).

**Status: done.** Built across 5 sequential implementer→reviewer commits, then a 6th whole-feature
review found the feature was entirely non-functional in production — both resume paths pre-transitioned
the scan to `RUNNING_PHASE_2`, colliding with the phase job's own entry transition and silently
no-opping it, so no UI-requesting audit ever actually ran. Fixed (a new `alreadyTransitioned` flag on
the phase-job payload, set only by the two resume paths) and re-reviewed clean, with a new end-to-end
test that actually runs the enqueued phase-2 job rather than just asserting it was enqueued — the
missing assertion class that let the regression through. Full detail in PROGRESS.md's own "Phase 8
(US6) — a Critical regression only a whole-feature review caught" section. `tasks.md`'s T194-T201
marked `[X]`. Full verification clean: `lint`, `tsc --noEmit` (every touched package), `pnpm run test`
835/835, `pnpm run test:adverse` 570/571 (1 pre-existing skip), production build clean.

---

## Session 4 — US7 admin: backend services & routes (spec-kit Phase 9a)

**Context**: **Goal**: operator control over users, plans, capabilities, providers, queue, and margin
visibility. **Independent test**: disable a capability, confirm audits still complete and report it
unavailable; re-enable and confirm return. Separately, confirm a completed audit's margin is visible.
This is the backend half; Session 5 is the frontend half; Session 6 is the review pass after both.

**Prerequisite**: none functionally, but see the Ordering note at the top of this file.

### Tests to write first
- [x] T202 — Write failing test asserting non-operators are refused every admin route however
      constructed (FR-008) in `apps/api/tests/adverse/admin-authz.test.ts`
- [x] T203 — Write failing test asserting margin is attributable to the individual capability that
      caused the cost (**SC-009**) in `apps/api/tests/integration/margin-attribution.test.ts`
- [x] T204 — Write failing test asserting a capability enabled by an operator reaches customers with
      no deploy (**SC-010**) in `apps/api/tests/integration/capability-enable.test.ts`

### Implementation
- [x] T205 — Implement user and plan administration services in
      `apps/api/src/services/admin/users.service.ts`
- [x] T206 — Implement margin aggregation per scan, area, and capability in
      `apps/api/src/services/admin/margin.service.ts`
- [x] T207 — Implement capability enable/disable/tier-restriction in
      `apps/api/src/services/admin/capabilities.service.ts`
- [x] T208 — Implement provider chain configuration with a two-vendor minimum guard in
      `apps/api/src/services/admin/providers.service.ts`
- [x] T209 — Implement queue inspection, retry, and cancel in
      `apps/api/src/services/admin/queue.service.ts`
- [x] T210 — Implement `AuditLogEntry` recording on every operator action (FR-089) in
      `apps/api/src/services/admin/audit-log.ts`
- [x] T211 — Wire all admin routes behind `requireOperator` in `apps/api/src/routes/admin/`

### Definition of done
T202–T204 all RED before implementation, all GREEN after; every route under `apps/api/src/routes/
admin/` refuses a non-operator caller regardless of how the request is shaped (that's exactly what
T202 must prove, adversarially — don't let it degrade into checking only the happy path).

**Status: done.** Built across five commits (users/plans+audit-log, margin, capabilities, providers,
queue), each implemented then independently reviewed, then closed with T211/T202's aggregation +
adversarial mount-proof. Two real findings surfaced and closed before commit, neither assumed away:

- A dispatched adversarial review of T209 (queue admin) found that a name-agnostic `cancel` on the
  `maintenance` queue could remove a `workspace-teardown` or `questionnaire-deadline` job's queue
  record with **no other mechanism** guaranteeing that work runs — `sweepOrphanedWorkspaces` (the
  crash backstop) is not wired into any production entrypoint today, and workspace destruction on the
  `CANCELLED` scan-cancel path depends exclusively on the `workspace-teardown` job the cancel route
  enqueues. That is a direct, silent, permanent violation of R15/FR-090's "destroyed on every exit
  path." Fixed by refusing `cancel` (not `retry` — retry is the correct recovery path) on both job
  names by construction, proven by two new adversarial tests, before commit.
- `margin-attribution.test.ts` (T203) hit a genuine intermittent flake across full-suite runs (never in
  isolation) root-caused to the report's default time window sitting within milliseconds of the test's
  own `Scan.createdAt` — fixed with an explicit wide window and a before/after delta assertion, not a
  retry loop or a "known flaky" comment.

T202's `admin-authz.test.ts` drives the real `createApp()` — not a standalone router around one file,
unlike every other `admin.*.test.ts` in this tree — against all 16 admin endpoints this session built,
three ways each (no token, a genuine non-operator's valid token, and a token whose JWT claims
`isOperator: true` against an account that is not one in the database), plus a closing positive case
proving a real operator gets 200. 54/54 green. `tasks.md`'s T202–T211 marked `[X]`. Full verification
clean: `apps/api` lint + `tsc --noEmit` clean, full monorepo `pnpm run test` **890/890**, full monorepo
`pnpm run test:adverse` **624/625 (1 pre-existing skip)**. Root `pnpm run typecheck` itself fails on a
pre-existing, unrelated turbo cyclic-dependency warning between `apps/api`/`apps/worker` — confirmed
pre-existing (present at the commit immediately before this session began) and recorded as PROGRESS.md
Open Decision #16 rather than silently worked around. Full detail in PROGRESS.md's "Phase 9a (US7
backend)" section. **Not built**: T212–T217 (US7 frontend, Session 5) and the dedicated admin-surface
adversarial review (Session 6) — the first `requireOperator`-gated surface in this codebase, worth a
review beyond T202's authz sweep.

---

## Session 5 — US7 admin: frontend screens (spec-kit Phase 9b)

**Context**: Ports the four admin screens from the vendored design system onto Session 4's real API.
Follow the same design-system rules every prior frontend task in this project has followed: port,
never author; tokens only via `var()`; both viewports (1440 and 390) measured; the two gates
(`pnpm lint`, `pnpm test:visual` at ≤0.5% diff) before calling any of these done.

**Prerequisite**: Session 4 done (these screens call real admin routes; nothing here should be built
against a mock).

### Tasks
- [x] T212 — Port the margin screen from `design-system/ui_kits/admin/AdminScreens.jsx` into
      `apps/web/app/(admin)/admin/billing/page.tsx` — adherence lint clean, visual diff ≤0.5% at
      1440/390
- [x] T213 — Port the capabilities screen into `apps/web/app/(admin)/admin/capabilities/page.tsx` —
      same gates
- [x] T214 — Port the queue screen into `apps/web/app/(admin)/admin/queue/page.tsx` — same gates
- [x] T215 — Port users and plans screens into `apps/web/app/(admin)/admin/users/page.tsx` and
      `apps/web/app/(admin)/admin/plans/page.tsx` — same gates

### Definition of done
All four screens pass `pnpm lint` and `pnpm test:visual` at both viewports, or carry an explicit,
three-place-documented exception per CLAUDE.md's UI-work rules (component's own module note,
`design/screen-map.md`'s "Documented exceptions" table, and a `research.md` decision entry) — not a
silent gap.

**Status: done, with one gate honestly unmet rather than silently claimed.** All four screens are wired to
Session 4's real backend (`GET`/`PATCH`/`POST` calls, not the mock's static rows), `pnpm run lint:adherence`
is clean (0 warnings/errors across 97 files), and `pnpm test:visual` itself passes (6/6, 7 pre-existing
`it.todo`, unchanged from before this session) — but that pass is **not** evidence for these four pages
specifically: `apps/web/tests/visual/harness.test.ts` has zero coverage for any `/admin/*` route at all,
confirmed by reading the whole file, and neither did the two admin pages that shipped before this session
(`AdminProvidersPage`, `AdminScansPage`, T244). This is not the "documented exception" mechanism this
Definition of done points at — that mechanism is for UI invented without a design source (T143, T201's
precedent); every pixel on these four pages is a straight port of `AdminScreens.jsx`, nothing invented. The
actual gap is narrower and pre-existing: no per-screen reference image exists to diff against
(`design-system/reference-pages/` exports one combined console HTML, not one per screen), so there is
nothing for `pnpm test:visual` to compare these pages to. Recorded as PROGRESS.md's new Open Decision #17
rather than silently passed over, with the decision (build reference images vs. formally accept
structural-test-only coverage) explicitly deferred to Session 6, which already reviews the whole admin
surface as one unit. In its place, each page carries the console's own already-established
`renderToStaticMarkup`/no-jsdom pre-data-shell test.

Real design-fidelity decisions worth recording: the margin screen (T212) drops the mock's fabricated
"Gross margin 78%" stat and per-capability margin-percentage column — the real backend (T206) refuses to
compute either, since credits and USD micros have no published conversion rate anywhere in this codebase
(PROGRESS.md's Open Decision #3) — and the plans screen (T215) drops the mock's fabricated "Price" column
for the identical reason. Two independent reviews (T212 alone given its constitutional weight; T214+T215
together) found no blocking or should-fix issues, including several empirically traced races (retry/cancel
timing, a double-click-on-"Load more" pagination race) all found sound. `tasks.md`'s T212–T215 marked
`[X]`. Full verification clean: `apps/web` unit (23 files / 147 tests), `pnpm test:visual` (unchanged
baseline), full monorepo `pnpm run test` after this session's changes — see PROGRESS.md's Phase 9b section
for the full account. **Not built**: Session 6 (the dedicated admin-surface adversarial review), which
should also resolve Open Decision #17.

---

## Session 6 — US7 admin: adversarial review & fix wave (spec-kit Phase 9c)

**Context**: This is the first `requireOperator`-gated surface in the entire codebase. Once Sessions
4 and 5 are both done, this session runs the same dedicated adversarial review this project has
already run twice (the Phase 3 engineering review, and the Phases 4–7 engineering review whose
findings this whole roadmap exists to track) — read the actual shipped code and tests directly, not
tasks.md's description of it, cross-checked against CLAUDE.md's seven non-negotiables.

**Prerequisite**: Sessions 4 and 5 both done.

### What to specifically check, based on the two prior reviews' own pattern of misses
- **A check that exists but is never actually wired into the request path** — Finding 4 from the
  Phases 4–7 review was exactly this shape (FR-079 dead code): `assertConcurrencyHeadroom` was
  *written* but never called from the real route. Confirm every admin service function built in
  Session 4 is actually reachable from a mounted route, not just defined.
- **A guarantee claimed in a comment or doc that the code doesn't quite deliver** — Finding 6
  ("idempotent" webhook that wasn't, under a specific failure timing) and the final-review Critical
  finding (workspace teardown "fixed" per its own module comment, but the job silently never
  enqueued) are both this shape. For each `requireOperator` route, actually attempt to reach it as a
  non-operator through every entry point that exists (not just the obvious one) and confirm the
  refusal really fires — T202's own adversarial test is the template, but don't assume the test
  covers every route just because it exists for one.
- **Whether audit-log coverage (T210) is actually complete** — check every operator action a route
  in `apps/api/src/routes/admin/` exposes writes an `AuditLogEntry`, not just the ones that were top
  of mind while building T205–T209.

### Tasks
- [x] Dedicated adversarial review of every admin route and every `requireOperator` boundary.
- [x] Write up findings the same way the two prior review documents did (severity table, files
      reviewed, fix/test-to-add per finding).
- [x] One consolidated fix wave addressing Critical + Important findings directly; Minor findings
      recorded, fixed only if cheap.
- [x] Full whole-branch verification gate: `pnpm run lint && pnpm run lint:adherence`,
      `pnpm -r typecheck`, `pnpm run test`, `pnpm run test:adverse`, `pnpm run test:visual`, build.
- [x] Update PROGRESS.md with a dated section recording this review, matching the style of the
      existing "Phase N engineering review — findings fixed" sections.

### Definition of done
Every finding at Critical/Important severity fixed and reviewed; all gates green; PROGRESS.md updated.

**Status: done.** Two independent review passes (backend, frontend — full write-up in
[2026-09-04-us7-admin-adversarial-review.md](2026-09-04-us7-admin-adversarial-review.md)), each explicitly
instructed to hunt for the two defect shapes this session's own brief named (Finding-4-shaped dead code;
Finding-6-shaped comment-claims-a-guarantee-the-code-doesn't-keep). Both found exactly one Important
finding and nothing Critical:

- **Backend**: `PATCH /admin/capabilities/:id`'s combined `{isEnabled, planIds}` body was not atomic — a
  bad `planIds` value could 400 the request *after* an `isEnabled` change had already committed and been
  audited (the dangerous direction: `{isEnabled: true, planIds: ["bad-id"]}` left a capability live and
  unrestricted for every plan behind an apparently-failed response). Confirmed empirically with a
  temporary, since-deleted repro before being reported. Fixed by validating `planIds` existence — a pure
  read, no side effects — before either mutation runs, with a new contract test proving neither half lands
  and zero audit rows are written when validation fails.
- **Frontend**: the admin Users page was the one screen among five built in Session 5 that skipped the
  "don't show a real-looking figure before data arrives" guard every sibling page already had — a plain
  `useState(0)` rendered a fabricated-looking "0 accounts" during loading and on a 401/403 refusal. Fixed
  with the same null-guard pattern already established elsewhere in the same session's own pages.

Every one of the "specific things to verify" both review briefs listed (audit-log completeness across all
five services; the T202 authz test's exhaustiveness against every real mounted route, confirmed
one-for-one; the full service→route→aggregator→app mount chain for every capability; capability-delete/
provider-chain/queue-cancel guarantees under race and partial-failure conditions; no client-side
authorization anywhere; frontend/backend shape parity re-verified field-by-field; the margin page's
no-fabricated-percentage claim re-confirmed under every code path) came back clean — "checked, no defect
found," not just assumed. Minor/Informational findings (a `balanceOf` N+1 pattern, an unconfirmed
low-likelihood audit-log race, `AdminShell`'s pre-existing hardcoded operator identity, the already-
documented CSS-Modules token gap, thin error-path test coverage) recorded, not fixed, per this session's
own "Minor findings recorded, fixed only if cheap" rule.

Full whole-branch gate after both fixes: `pnpm run lint` clean for `apps/api`/`apps/web` (failures are
confined to the unrelated, untracked `showcase-trimora/` directory); `pnpm run lint:adherence` clean (0/0,
97 files); `pnpm run test` **109 files / 905 tests**; `pnpm run test:adverse` **33 files / 624 passed, 1
pre-existing skip**; `pnpm run test:visual` **6/6 passing**, 7 pre-existing `it.todo`, unchanged — and
that harness runs a real `next build` internally, directly confirming `apps/web`'s production build is
clean. Root `pnpm run typecheck`/`pnpm run build` both still fail on the pre-existing, unrelated turbo
cyclic-dependency warning (PROGRESS.md's Open Decision #16, updated this session to record it also breaks
`build`, not only `typecheck`) — confirmed not introduced by this session, and the one package that
script would meaningfully build (`apps/web`, the only one with its own `build` script) is independently
verified clean regardless. PROGRESS.md's "US7 admin console engineering review (2026-09-04)" section
carries the full account.

**This closes US7 end to end.** Sessions 4, 5, and 6 are all done — the operator admin console is built,
reviewed, and its remaining honest gaps (Open Decisions #16 and #17) are named rather than hidden.

### Definition of done
Every finding at Critical/Important severity fixed and reviewed; all gates green; PROGRESS.md updated.

---

## Session 7 — Sandbox runner: core isolation (spec-kit Phase 10a)

> **⚠️ This phase must never be partially shipped.** A fallback to unsandboxed execution is the one
> failure mode this project treats as unshippable. If blocked partway through this session, leave the
> `503 SANDBOX_UNAVAILABLE` refusal in place — do not loosen it "temporarily," and do not merge
> Session 7's work into anything that could be mistaken for a complete sandbox until Session 8 also
> lands.

**Context**: R1's three nested boundaries (no egress, no credentials, separate process, bounded,
killable — `vm2` is forbidden by name). Sequenced last in the original spec-kit plan deliberately:
until this exists, the upload path correctly returns `503` rather than having a gap. This session
builds the isolation mechanism itself; Session 8 wires it into the real upload path.

**Prerequisite**: none functionally, but see the Ordering note at the top of this file.

**Status: done.** Built the full mechanism, then ran **two independent adversarial review passes**
before accepting it — the first found and this session fixed two Criticals: a vm-context
prototype-chain escape (`Object.create(null)` alone hardens the context's own global object, but any
host-realm value handed to the sandboxed capability afterwards — `console`, a data argument, a context
function — carries its own prototype chain and reopens `this.constructor.constructor(...)`; fixed by
never letting a host-realm value reach the sandboxed realm at all, via a JSON round-trip through the
target context's own `JSON.parse` for data and a context-internal `vm.Script` build for every
`CodeLayerContext` function, plus the same fix for a third instance in `capability-sdk`'s shared
conformance suite), and an unconditional child-process leak (`finish()` only killed the child on
`TIMEOUT`; every other outcome left it running forever — fixed by killing on every path). A second,
independent review reproduced both PoCs against the fix, tried 11 further escape variants (all
blocked), verified the leak fix at the OS process level, and found one Minor (a cross-realm blind spot
in `describeThrown`, fixed the same way). Full write-up:
[2026-09-04-sandbox-runner-adversarial-review.md](2026-09-04-sandbox-runner-adversarial-review.md).
Two Windows-specific gaps (empty-env leakage, an fs-permission glob-matching quirk) were found and left
honestly open rather than silently patched over — see PROGRESS.md Open Decisions #18/#19, both flagged
for confirmation during Session 8's real deployment. Whole-branch gate re-run clean:
`pnpm test` 907/907, `pnpm test:adverse` 639/640 (1 pre-existing skip). Committed as `dd6bcc5` (T216)
and `c90a21a` (T217–T224). **This closes SC-017 — all 11 adversarial gates are now green.**

### Tasks
- [X] T216 — Implement `POST /admin/capabilities/upload` returning `503 SANDBOX_UNAVAILABLE` with no
      fallback path in `apps/api/src/routes/admin/capabilities.routes.ts` (if Session 4 didn't
      already stub this — check first).
- [X] T217 — Write the hostile fixture capability attempting filesystem read, filesystem write,
      outbound connection, environment read, process spawn, and an allocation bomb in
      `apps/sandbox-runner/tests/fixtures/hostile-capability/index.js`
- [X] T218 — Write the failing suite asserting all six attempts are refused and the host survives
      (**SC-017**) in `apps/sandbox-runner/tests/adverse/sandbox-escape.test.ts`
- [X] T219 — Write failing tests asserting wall-clock and memory bounds are enforced from outside in
      `apps/sandbox-runner/tests/adverse/limits.test.ts`
- [X] T220 — Implement the child-process harness under the Node permission model with an empty
      environment in `apps/sandbox-runner/src/child-harness/harness.ts`
- [X] T221 — Implement parent-armed timeout and SIGKILL, unstarvable by the child, in
      `apps/sandbox-runner/src/limits/timeout.ts`
- [X] T222 — Implement OS memory limits per execution in `apps/sandbox-runner/src/limits/memory.ts`
- [X] T223 — Implement the sandbox protocol host accepting plain serialised data only, per
      `contracts/realtime-and-internal.md`, in `apps/sandbox-runner/src/host/server.ts`
- [X] T224 — Implement in-sandbox conformance verification before first use (FR-029) in
      `apps/sandbox-runner/src/host/conformance.ts`

### Definition of done
T218 and T219 both genuinely RED before implementation (confirm the hostile fixture actually
attempts each of the six escape vectors, not a subset), both GREEN after, and the host process itself
survives every attempt (assert this directly — a sandbox that merely reports a violation without the
host surviving unharmed does not satisfy SC-017).

---

## Session 8 — Sandbox runner: deploy & real dispatch (spec-kit Phase 10b)

**Context**: Finishes what Session 7 built by actually wiring it in and deploying it correctly.

> Same warning as Session 7 applies here: do not flip the switch from `503` to real dispatch until
> every one of Session 7's tests is green and reviewed — that's the entire point of sequencing this
> last.

**Prerequisite**: Session 7 done.

**Status: done.** `serve.ts` (new) is the first real process entrypoint this package has ever had, plus
a `GET /health` route and `infrastructure/sandbox-runner.md` — the first per-app deployment doc in this
repo, backed by a new structural adverse suite (`deployment-isolation.test.ts`) that asserts "no egress,
no DB credentials" against the real `package.json` and source tree rather than leaving it as prose.
`POST /admin/capabilities/upload` now dispatches for real: `capability-upload.service.ts` (new) POSTs
the uploaded bundle to the real, deployed sandbox and runs the real conformance suite inside it,
deliberately scoped to a conformance verdict only — no `Capability` row write, no execution against
real scans (see that file's own module note; `reconcile.ts`'s "disk is the source of existence" still
holds). Fixing `runConformanceCheck`'s signature (an in-process `SandboxHost` → a plain `baseUrl:
string`) was required first — the original could never be satisfied by a caller in a genuinely separate
deployment, a latent T224 gap only exposed by building the one caller this session exists to enable. An
independent adversarial review of the new wiring found **no Constitution Principle V violation** (no
unsandboxed-execution path, no auth bypass, no SSRF), fixed one Minor gap in the new structural test
itself (it initially checked only `dependencies`, not `devDependencies`, which the runbook's own
`pnpm install --frozen-lockfile` also installs), and confirmed one real, deliberately-unfixed finding:
running real dispatch end to end for the first time ever exposed a pre-existing T224 defect —
`harness.ts`'s CONFORMANCE `rawManifest` omits `name`/`version`/`entrypoint`, fields the uploaded-bundle
format never defined a way to supply, so no capability can pass full conformance today regardless of how
well-formed it is. Left unfixed per this session's own scope (`child-harness/*` untouched); the new
end-to-end test asserts this honestly (every other check genuinely passes) rather than forcing a result
the code cannot produce. Recorded as PROGRESS.md Open Decision #20. Full write-up in PROGRESS.md's
"Phase 10b (sandbox-runner deploy + real dispatch)" section. Whole-branch gate re-run independently,
clean: `pnpm test` 910/910 (109 files), `pnpm test:adverse` 642/643 (1 pre-existing skip, 36 files).
Committed as `d19897e`. **This closes Phase 10 and, with it, US7 end to end.**

### Tasks
- [X] T225 — Deploy `sandbox-runner` with no egress and no database credentials, documented in
      `infrastructure/sandbox-runner.md`
- [X] T226 — Replace the `503` with real dispatch to the sandbox in
      `apps/api/src/services/admin/capability-upload.service.ts`

### Definition of done
`sandbox-runner` is deployed as a genuinely separate deployment (per CLAUDE.md: "a security boundary
is only real if it is a deployment" — do not collapse it into another unit), confirmed to have no
egress and no DB credential, and `POST /admin/capabilities/upload` now dispatches to it for real, with
Session 7's full adverse suite still green against the real deployment, not just in-process.

**Checkpoint** (per spec-kit): all seven user stories complete; every adverse suite green. This also
closes SC-017, the last of the 11 adversarial gates — **now green, 11 of 11**, as of this session.

---

## Session 9 — Polish & cross-cutting concerns (spec-kit Phase 11)

**Context**: The remaining cross-cutting items — accessibility, dark-mode contrast verification,
egress verification, structured logging, two documentation corrections, and final validation against
the project's own definition of done. Best done last since T235/T236 validate the *whole* product,
but nothing here is strictly blocked on Sessions 3–8 — it can start any time after Session 1.

### Tasks
- [ ] T227 — Add axe-core accessibility assertions to all web e2e suites in
      `apps/web/tests/e2e/accessibility.spec.ts`
- [ ] T228 — Port `design-system/tokens/dark.css` and contrast-verify every dark severity value (the
      reference flags these as unverified) in `apps/web/app/globals.css`
- [ ] T229 — Verify zero third-party runtime requests from the web app in
      `apps/web/tests/e2e/no-external-requests.spec.ts`
- [x] T230 — Rate limiting on all public routes — **already done**, pulled forward out of order by an
      earlier review finding (M7). Nothing to do here.
- [ ] T231 — Add structured logging with redacted sinks across all services in
      `packages/config/src/logger.ts`
- [ ] T232 — Amend `spec.md` FR-025 to separate platform egress from auditing-browser egress
      (research.md open item 1)
- [ ] T233 — Correct `WebAuditAI_ARCHITECTURE.md` on `vm2`, in-job questionnaire, and deployable-unit
      count (research.md open item 2)
- [ ] T234 — Write deployment runbooks for all five units in `infrastructure/deploy.md`
- [ ] T235 — Run the full 10-scenario validation from `quickstart.md` and record results
- [ ] T236 — Verify every definition-of-done item in `quickstart.md` passes

### A doc-hygiene task not in tasks.md, found while writing this roadmap
- [ ] Fix CLAUDE.md's "Three known deviations in the vendored export" paragraph. It currently claims
      fonts-from-Google-Fonts (T127), icons-from-CDN (T247), and unwired mobile type tokens (T126)
      are all still outstanding. **They are not** — `specs/001-webaudit-mvp-baseline/tasks.md` marks
      all three `[X]` done, together at "T236a," well before this roadmap was written. Correct or
      remove the paragraph so a future reader isn't sent chasing an already-closed gap. Small,
      standalone, zero code risk — safe to do independently of everything else in this file.

### Definition of done
T227–T229, T231 all pass with real assertions (not `it.todo`); T232–T236 are documentation/validation
tasks — done when the documents are amended and the quickstart validation is recorded, honestly,
including anything that doesn't pass.

---

## Reference Appendix — findings and decisions that inform the sessions above

### Deliberately excluded from Phases 4–7 (not bugs to reopen in any session above)

- **Finding 9 (Medium)** — `moduleOutcomes` JSON-cast type safety at the DB boundary. A systemic
  pattern shared with `attempts.ts` and other call sites across the codebase; fixing it project-wide
  is a separate, larger decision than a targeted patch. Revisit only as its own dedicated
  type-safety pass across every JSON-cast boundary, not piecemeal, and not inside any session above.
- **Finding 17 (Low)** — per-request memory ceiling is not fleet-aware. An operational/capacity-
  planning note, not a code defect — belongs in ops runbooks (Session 9's T234), not a code fix.

### Other open decisions not yet resolved (from PROGRESS.md), relevant to no single session above

- **`JWT_REFRESH_SECRET`** is parsed but unused (refresh tokens are opaque DB rows) — needs a call:
  enforce it for something real, or delete the parsing.
- **Monetary price points** for the four tiers are unset — credits and entitlements are fixed, but
  actual currency pricing is a product decision, not an engineering one. No task number; needs
  business input before any task can be written.
- **Level 1 probe rate** (4 rps / burst 12, `packages/config`) — mechanism is correct and
  adversarially tested; the specific number needs product sign-off (it's customer- and
  third-party-visible).
- **Per-area score formula** (severity weights in `packages/scoring`) — same shape: mechanism
  correct, the specific weights (100 minus 25/12/5/2/0 by severity) are an engineering default
  needing sign-off.
- **Provider model + cost per million tokens for OpenAI and Google** — blocks a real production
  boot today (the executor refuses to construct a priceless provider). Anthropic has a real rate;
  the other two don't. `AI_MODE=fixtures` bypasses this in every test suite, which is why it's easy
  to forget this is unresolved.
- **`apps/worker` depending on `@webaudit/api`'s generated Prisma client** — a made-not-settled call;
  a `packages/db` extraction is the cleaner long-term shape but nothing forces it yet.
- **Capability loader is a static import table**, not filesystem-driven — clean fix is extracting
  manifest-walking into `@webaudit/capability-sdk`; not forced by only six known capabilities.

None of these block any session above; they're listed here so nobody rediscovers them mid-session and
wonders whether they're new.

### Design-system carried corrections still open (from PROGRESS.md)

- **`Button` has no keyboard-focus indicator** — a real accessibility gap (WCAG 2.4.7), faithfully
  ported from a source that also lacks one. Fix belongs in `design-system/` itself or as an explicit,
  signed-off deviation (Session 9's T227 accessibility pass is the natural place to catch this for
  real, with axe-core).
- **A `.js`-extensioned import to a `.tsx` file typechecks under `bundler` resolution but doesn't
  run** under Next's real webpack bundler — only shows up as a runtime 500, never a typecheck
  failure. Worth a lint rule or a documented gotcha if it bites again.

---

## How to use this file going forward

- Check a box only when the task is done **and verified** (tests green, reviewed, not just written).
- If a session surfaces a new, unplanned issue the way Phases 4–7 surfaced three of them, record it
  in this file under that session's own area rather than silently fixing and forgetting it — future
  sessions need the same honesty this project has kept everywhere else.
- If you're an agent picking this up cold: read Section 0 first, in full, then read only the one
  Session you were told to start — you do not need the other sessions' detail to do your own.
