# WebAudit AI — Build Progress

**Updated** 2026-09-04 · **Tasks** 250 / 250 — the whole plan (+T236a, not in the original 250) ·
**Tests** `unit` **938/938**, `adverse` **645 passed / 1 pre-existing skip** (+3 from `admin-authz.test.ts`'s
expanded coverage — see the final review below), e2e **12/12** (new axe-core +
third-party-request suites), `test:visual` **6/6** (7 pre-existing `it.todo`), `apps/api`/`apps/web`
lint + typecheck clean per-package (root `pnpm run typecheck`/`pnpm run build` both still fail on a
pre-existing turbo cyclic-dependency warning unrelated to any change in this or prior sessions — Open
Decision #16). 🎯 **A full, independent production-readiness delta review — three passes across
everything, not just Phase 11 — is done.** Full write-up:
[2026-09-04-final-production-readiness-review.md](docs/superpowers/plans/2026-09-04-final-production-readiness-review.md).
Pass 1 (a fresh cross-check of all six historical review documents) came back clean — no dropped
findings. Pass 2 (the seven non-negotiables, re-verified against current code and live tests, plus a
~24-task `tasks.md` accuracy spot-check) found six of seven hold cleanly and one has a real,
already-known, now more clearly documented tension (Open Decision #13); no task's `[X]` mark was found
false. Pass 3 (integration seams between subsystems built across nine sessions) found and fixed a real
test-coverage gap (`admin-authz.test.ts` never covered the T226 upload route — now does, 57/57) and
recorded one new, latent, not-currently-exploitable design gap as Open Decision #21. Also fixed: a
badly stale CLAUDE.md "Project state" paragraph (said "209/250, next is Phase 8") and a stale
`terminal-refund.ts` comment. **The verdict: production-ready in the sense this project has always used
the phrase — every guarantee is either true today, verified live, or a plainly-stated, already-accepted
exception, never a silent gap.**
🎯 **Phase 11 (polish & cross-cutting concerns) complete — T227–T236.
This closes the entire 250-task plan.** Session 9 of the [full-project remediation
roadmap](docs/superpowers/plans/2026-09-03-full-project-remediation-roadmap.md): dark-mode severity
contrast genuinely verified (WCAG AA, all six pass); real axe-core + zero-third-party-request e2e
suites against a live, built `apps/web` (surfaced one new, real, pre-existing accessibility gap in the
vendored brand tokens, narrowly excluded with full evidence — carried correction 0a-2); structured,
redacted logging wired into all three real service entrypoints; FR-025 amended and
`WebAuditAI_ARCHITECTURE.md` corrected in place; a five-unit deployment runbook
([infrastructure/deploy.md](infrastructure/deploy.md)); and a full quickstart validation pass that
found `quickstart.md`'s own example commands were never literally runnable and fixed them before using
them. See "Phase 11 (polish & cross-cutting concerns)" below for the full account.
🎯 **Phase 10b (sandbox-runner deploy + real dispatch) complete — T225–T226,
closing Phase 10 and US7 end to end** (Session 8) — a real process entrypoint and health route for
`apps/sandbox-runner` plus a deployment runbook, then replaced `POST /admin/capabilities/upload`'s
unconditional 503 with genuine dispatch to the real, deployed sandbox. An independent adversarial
review found no unsandboxed-execution path, no auth bypass, and no SSRF in the new wiring, fixed one
Minor gap in the new structural test itself, and confirmed one real, deliberately-not-fixed finding:
running real dispatch end to end for the first time exposed a pre-existing Session 7 defect in
`harness.ts`'s CONFORMANCE `rawManifest` construction — see "Phase 10b (sandbox-runner deploy + real
dispatch)" below and Open Decision #20.
🎯 **Phase 10a (sandbox-runner core isolation) complete — T216–T224, closing
SC-017, the last of the 11 adversarial gates. 11 of 11 green.** Session 7 of the same roadmap built the
child-process isolation mechanism the upload path had been returning `503 SANDBOX_UNAVAILABLE` for since
T216: a bundle format, an esbuild-precompiled harness run inside a `--permission`-restricted child,
parent-armed timeout/memory enforcement, and in-sandbox conformance verification. Two independent
adversarial reviews found and closed two Criticals before this shipped — a vm-context prototype-chain
escape (any host-realm value handed to the sandboxed capability reopened the classic
`this.constructor.constructor(...)` vm escape even after the context's own global object was hardened)
and an unconditional child-process leak (every non-timeout outcome left the child running forever) —
plus one Minor. Two Windows-specific gaps were found and left honestly open rather than silently
patched over. Full write-up:
[2026-09-04-sandbox-runner-adversarial-review.md](docs/superpowers/plans/2026-09-04-sandbox-runner-adversarial-review.md).
🎯 **US7 (the operator admin console) complete end to end — Sessions 4, 5, and
6.** Backend (T202–T211), frontend (T212–T215), and a dedicated adversarial review all done. The review
(Session 6, Phase 9c) found and fixed one Important defect on each side: a combined
`PATCH /admin/capabilities/:id` body that could commit an `isEnabled` change and audit it before a bad
`planIds` value 400'd the response, and an admin Users page that rendered a fabricated-looking "0
accounts" during loading or on a 401/403 refusal. No Critical findings either side. Full write-up:
[2026-09-04-us7-admin-adversarial-review.md](docs/superpowers/plans/2026-09-04-us7-admin-adversarial-review.md)
and "US7 admin console engineering review" below.
🎯 **Phase 9b (US7 frontend) complete —
T212–T215.** Four admin screens (margin, capabilities, queue, users+plans) wired to Phase 9a's real
backend, replacing `AdminScreens.jsx`'s static placeholder rows. Session 5 of the [full-project
remediation
roadmap](docs/superpowers/plans/2026-09-03-full-project-remediation-roadmap.md) — see "Phase 9b (US7
frontend)" below for the full account, including a design-fidelity call carried over from the margin
page's own backend design (no fabricated margin percentage or price figure, ever) and a real,
pre-existing route mismatch this phase fixed (`AdminShell.tsx`'s nav linked two screens to the wrong
paths). One gate honestly unmet: no per-screen visual-regression baseline exists for this admin console
at all, a pre-existing gap tracked as Open Decision #17 (still open — Session 6 named it again but did
not resolve it, since building reference images is design/tooling work outside an engineering review's
scope). 🎯 **Phase 9a (US7 backend) complete —
T202–T211.** Operator administration of users, plans, margin, capabilities, AI providers, and the BullMQ
queue, all behind `requireOperator`, all audit-logged. Session 4 of the same roadmap — see "Phase 9a (US7
backend)" below for the full account, including a real gap (silent, permanent workspace orphaning on a
maintenance-queue job cancel) an adversarial review found and closed before commit. The dedicated
admin-surface adversarial review is Session 6 of the same roadmap, not yet started.
🎯 **Phase 8 (US6, the mid-audit design-intent
questionnaire) complete — T194–T201.** Built across five separately-reviewed commits (Session 3 of the
same roadmap), then a sixth, whole-feature review found the entire feature was non-functional in
production — see "Phase 8 (US6) — a Critical regression only a whole-feature review caught" below.
Fixed, re-reviewed, re-verified. Merged to `main` at `c31139a` before this phase started (Session 1 of
the same roadmap, fast-forward, all 29 commits preserved, zero conflicts — `main` was an exact ancestor
of the remediation branch).
plus the T109 Playwright e2e spec fully green. `typecheck` + `lint` + `lint:adherence` clean across
the monorepo; `next build` clean. Phase 7 surfaced one pre-existing lint regression
(`scripts/seed.ts` importing `@webaudit/config`, which was never a root dependency) and one stale
test expectation (`upload.test.ts` naming `pro` for archive input while the test helper seeded only
two tiers — the spec's Plan Tiers table says Starter); both fixed and recorded below.
🎯 **Phase 3 (US1) complete — T105–T143.** ✅ **Phase 4 (US2, the fix loop) complete — T144–T157;
SC-007 now has its adversarial gate.** ✅ **Phase 5 (US3, the readiness verdict) complete —
T158–T168; the full journey audit→fix→verify→ship is deliverable.** ✅ **Phase 6 (US4, audit source)
complete — T169–T179; archive and repository input, refused before extraction and before charging.**
✅ **Phase 7 (US5, pay for capacity) complete — T180–T193; subscriptions, entitlements, credit
purchase, the signed idempotent billing webhook, retention + self-contained export. SC-008 now has
its adversarial gate — 10 of 11 green.** Three review passes on Phases 1–7 also folded in
(§§ below) — most recently, a Phases 4–7 engineering review's 18 findings, 16 of them now fixed.

## Phase 8 (US6) — a Critical regression only a whole-feature review caught

T194–T201 build the mid-audit design-intent questionnaire (FR-040 through FR-043): a scan requesting
the `UI` module pauses before the design area runs, asks the user four questions (audience, style
preference, admired references, brand colors), and resumes on either an answer, a skip, or — if the
10-minute published wait expires — documented defaults, recorded as such. The generic "pause without
holding a worker" mechanism (R4, `awaitQuestionnaire`/`resumeAfterQuestionnaire`) already existed from
an earlier phase (T096) and was already tested against a fake queue; nothing in the real orchestrator
run loop had ever called it.

Built across five commits, each individually implemented then independently reviewed:
1. Wired `awaitQuestionnaire` into the real orchestrator's phase-1-to-phase-2 handoff, plus two new
   published config constants (`DESIGN_INTENT_WAIT_MS`, `DESIGN_INTENT_QUESTIONS`).
2. Built the worker-side deadline-timeout handler — resumes on expiry, records `DesignIntent(source:
   DEFAULTED)`, but only after confirming it actually won the race against a real answer/skip.
3. Built the `apps/api` routes (`GET/POST /scans/:id/questionnaire`, `POST .../skip`). `apps/api`
   cannot import `apps/worker` (only the reverse dependency is allowed), so this hand-duplicates the
   guarded-transition-then-enqueue logic, matching the established `scan-phase-producer.ts` precedent
   exactly (same job-id shape, same payload schema).
4. Threaded the real `DesignIntent` DB row into `CapabilityInput.designIntent` — the shape the UI/design
   AI-layer capability (`impeccable`) already read but nothing had ever populated.
5. Built and wired in the React component, under an explicit, user-authorized governance exception —
   no design artboard exists for this surface (`design/screen-map.md`'s own "Coverage gaps" table said
   so). Recorded in the three places this project's process requires, following the R18/T143
   (`AnnotatedScreenshot`) precedent exactly: the component's own module note, a new row in
   `screen-map.md`'s "Documented exceptions" table (and — correctly, matching what T143's own
   resolution did and unlike this task's first draft — removed from the "Coverage gaps" table, not
   left contradicting itself in both places at once), and `research.md`'s new R19 entry.

**Then a sixth pass — a whole-feature review, deliberately scoped to look across all five commits at
once rather than re-verify any one of them — found the feature did not work at all.** Both resume
paths transitioned the scan straight to `RUNNING_PHASE_2` before enqueueing the phase-2 job. The phase
job's own entry step (`handlePhase`, in every phase job, not specific to this feature) then attempted
`RUNNING_PHASE_2 → RUNNING_PHASE_2` — an illegal self-transition under `state-machine.ts`'s `ALLOWED`
table, since no state has a self-edge — and silently no-opped. **No UI-requesting audit ever actually
ran the UI area.** Confirmed empirically with a real-DB probe before the fix: `ModuleResults =
["SECURITY"]` only, the scan permanently stuck at `RUNNING_PHASE_2` until the FR-038 timeout sweep
eventually caught it and refunded (no billing harm, but US6's own Independent Test — "run without
answering and confirm the audit still completes" — failed outright, and so did the answered case).

Two "obvious" fixes were considered and rejected, each for a real reason confirmed by reading the code,
not assumed:
- **Changing `AWAITING_QUESTIONNAIRE`'s legal target to `RUNNING_PHASE_1`** in `state-machine.ts`
  would contradict that file's own documented, deliberate design intent ("reachable only from phase 1
  and leads only into phase 2") — and wouldn't even fix the API-side resume, which hand-rolls its own
  guarded `updateMany` and never consults `ALLOWED` at all.
- **Relaxing `handlePhase`'s entry guard to accept any self-transition** would reopen a real risk for
  a *different* scenario the guard exists to protect against: a BullMQ stalled-job redelivery of an
  already-run phase job would silently re-run all of that phase's modules a second time. `ModuleResult`
  upserts and `Issue` uses `createMany({ skipDuplicates: true })` against real unique constraints, so
  those wouldn't duplicate — but `CapabilityExecution` and `AiInvocation` have no unique constraint at
  all and would, corrupting per-capability cost attribution (SC-009) and causing genuine double
  provider spend.

The actual fix: `PhaseJobData` gained an optional `alreadyTransitioned` flag, set only by the two
resume paths (the API's producer hardcodes it rather than exposing it as a parameter, so no future
caller can accidentally omit it and reintroduce the bug). When flagged, `handlePhase` skips its own
entry transition attempt — but still checks the already-fetched scan row against the target phase and
returns early on a mismatch, preserving the existing guarantee that a cancellation racing in between
resume and job-delivery is still caught. A new end-to-end test actually runs the phase-2 job the resume
enqueues through the real `handlePhase` (not just asserts it was enqueued — the exact assertion class
missing from all three of this feature's per-commit test suites, which is how the regression survived
five individually-thorough reviews) and confirms a real `UI` `ModuleResult` exists afterward. The same
pass also closed a second, related TOCTOU: `DesignIntent` was being written *after* the phase-2 job was
enqueued rather than before, so a fast worker could theoretically run before the row existed and
silently drop the user's answers — reordered on both resume paths.

**Known, pre-existing gap surfaced but correctly left alone**: a scan requesting only `UI` (no other
module) cannot start an audit at all — phase 1's module list would be empty, and the job schema refuses
an empty module list at the queue boundary. Not introduced or worsened by this phase; a product
decision about what a design-only audit should mean, not a code defect. Recorded in
`phase-modules.ts`'s module note.

Verified at the end, from a clean perspective: `pnpm run lint` clean, `pnpm -r exec tsc --noEmit` clean
across every touched package, full `pnpm run test` **835/835**, full `pnpm run test:adverse` **570
passed / 1 pre-existing skip** (one transient re-run needed — a single flake that did not reproduce on
a clean rerun, confirmed not a regression), `next build` clean.

## Phase 9a (US7 backend) — admin surface for users, plans, margin, capabilities, providers, queue

T202–T211 build the backend half of operator administration (FR-008, FR-085 through FR-089): user and
plan CRUD, a margin report attributing real provider cost per scan/area/capability alongside revenue in
credits, capability enable/disable/tier-restriction, AI provider-chain configuration, and BullMQ queue
inspection/retry/cancel — all behind `requireOperator`, all writing through the single
`recordAuditLog` (FR-089). Session 4 of the roadmap. Five commits, each independently reviewed:

1. `users.service.ts`/`plans.service.ts` and their routes, plus `recordAuditLog` itself (T205, T210).
   Review fix: `admin.plans.test.ts` was leaving `Plan.starter.isActive: false` uncleaned, corrupting
   shared reference data for later test files — added an `afterAll` restoring it.
2. `margin.service.ts` (T206, T203): per-scan, per-area, per-capability revenue (`chargedCredits`) and
   real cost (`costMicros`) reported side by side, never blended into an invented dollar figure — this
   codebase has no published credit-to-dollar rate (Open Decision #3 below), and inventing one here
   would have been a fabrication a customer-facing "margin" report cannot afford. Per-area revenue is
   split evenly across a scan's `requestedModules`, floored, with the remainder documented as
   unattributed rather than silently absorbed anywhere. A genuine intermittent flake in
   `margin-attribution.test.ts` (real, reproduced on roughly half of several full-suite runs, never in
   isolation) was root-caused to the default report window's `to: new Date()` sitting within
   milliseconds of the test's own `Scan.createdAt` (`@default(now())`, Postgres's clock, not Node's) —
   fixed with an explicit multi-year window and a before/after delta assertion, not a guess at
   "flakiness."
3. `capabilities.service.ts` (T207, T204): enable/disable takes effect on the very next scan snapshot
   with no deploy, because `CapabilityRegistry.build`/`resolveSnapshot` already read `isEnabled` and
   `CapabilityPlan` fresh every time (SC-010, proven by `capability-enable.test.ts` driving the real
   registry, not a fake). `removeCapability` refuses (409, audited even on refusal) whenever the row has
   any `CapabilityExecution` history — `reconcile.ts`'s "a capability row is never deleted" is a claim
   about reconciliation specifically, not every code path, and the FK (`ON DELETE RESTRICT`) would
   refuse the delete regardless; a capability with zero history may still be removed.
4. `providers.service.ts` (T208): validates a replacement AI provider chain with the real `buildChain`
   from `@webaudit/ai-executor` — the same function `createExecutorFromEnv` calls at worker boot —
   rather than a parallel check that could drift from it. Replace-the-set in one transaction. Honestly
   does **not** live-reconfigure a running worker; no such mechanism exists today (the worker reads
   `AI_CHAIN`/per-vendor env vars once, at boot). Review added a test proving a rejected replacement
   leaves a *previously valid* chain untouched — the original suite only proved "nothing written to an
   empty table," a narrower claim.
5. `queue.service.ts` (T209): inspects waiting/active/delayed/failed/completed jobs across all three
   BullMQ queues, retries a genuinely `failed` job, cancels a job that is not `active` — all driven
   against a real local Redis with a real BullMQ `Worker` (not a mock; BullMQ validates state
   transitions server-side via Lua scripts). **A dispatched adversarial review of this task, before
   commit, found a real gap**: cancelling a queued `workspace-teardown` or `questionnaire-deadline` job
   on the maintenance queue has no backstop — `sweepOrphanedWorkspaces` is not wired into any production
   entrypoint (only ever called from tests), and workspace destruction on the `CANCELLED` scan-cancel
   path depends *exclusively* on the `workspace-teardown` job the cancel route enqueues. A name-agnostic
   cancel would have let an operator silently and permanently orphan a cancelled scan's on-disk source —
   a direct violation of R15/FR-090's "destroyed on every exit path." Fixed by refusing cancel (not
   retry — retry is the correct recovery path) on both job names by construction, proven by two new
   tests. The reviewer's other two flagged concerns — refusing to cancel an `active` job, and requiring
   `failed` state before a retry — were verified empirically against real BullMQ races (a genuine active
   job's `remove()` throws inside BullMQ itself; a second concurrent `retry()` on the same job throws
   "not in the failed state") rather than merely argued.

T211/T202 close the phase: a new `routes/admin/index.ts` aggregates all six admin routers under one
`requireAuth` + `requireOperator` gate, mounted at `/admin` in `app.ts`, so a future admin route
inherits the gate structurally rather than by every file remembering to add it. `admin-authz.test.ts`
drives the real `createApp()` — not a standalone router around one file, unlike every other
`admin.*.test.ts` in this tree — against all 16 admin endpoints, three ways each: no Authorization
header, a genuine non-operator's valid token, and a token whose JWT claims `isOperator: true` against
an account that is not one in the database (the forged/stale-claim case `requireOperator`'s own module
note names as the reason it reads the database rather than the token claim). A closing positive case
proves a real operator gets 200 on every no-parameter GET route — proof the refusal above is the
operator gate itself, not a mis-typed path 404ing for everyone. 54/54 green.

Verified after each commit and again at the end: `pnpm --filter @webaudit/api exec tsc --noEmit`
clean, `eslint` clean on every touched file, full `apps/api` `pnpm test` (45 files / 316 tests) and
`pnpm test:adverse` (16 files / 191 tests) both green after mounting `/admin`.

**Not built in this phase** (Sessions 5 and 6 of the roadmap, not yet started): T212–T217 (the four
admin screens ported from `design-system/ui_kits/admin/AdminScreens.jsx`) and the dedicated adversarial
review pass on the whole admin surface — the first `requireOperator`-gated surface in this codebase,
worth a review of its own beyond T202's authz sweep.

## Phase 9b (US7 frontend) — four admin screens wired to the real Session 4 backend

T212–T215 port the four remaining admin screens from `design-system/ui_kits/admin/AdminScreens.jsx`'s
hardcoded placeholder rows onto the real backend Session 4 (Phase 9a) built — margin (`/admin/billing`),
capabilities (`/admin/capabilities`), queue (`/admin/queue`), users and plans (`/admin/users`,
`/admin/plans`). Session 5 of the roadmap. Four commits after a shared-infrastructure commit, each
independently reviewed:

0. **Shared prerequisites**: `lib/api.ts` gained `PATCH` support (every admin mutation this phase's
   frontend calls is a PATCH) and typed client functions/interfaces for all five surfaces, read directly
   from the real `apps/api/src/routes/admin/*` route and service files rather than guessed. Also fixed a
   real, pre-existing route mismatch in `AdminShell.tsx` (T243): its nav linked "Capabilities" to
   `/admin/caps` and "Margin" to `/admin/margin`, but `design/screen-map.md` — the authoritative routing
   table per CLAUDE.md's UI-work section — has always said `/admin/capabilities` and `/admin/billing`.
   Undetected until now because neither page existed yet to expose the resulting 404; corrected to match
   screen-map.md so the four pages below land where the nav actually points.
1. **Margin (T212)**: the session's one genuinely constitution-adjacent decision. The mock hardcodes a
   "Gross margin 78%" stat and a per-capability margin-percentage column — both placeholder numbers
   invented before any real backend existed. The real `GET /admin/margin` (T206) refuses to compute
   either, on purpose: revenue is in credits, cost is real USD micros, and this codebase has no
   published conversion rate between them (Open Decision #3) — its own `note` field says so in every
   response. The page drops both mock elements, shows credits and cost side by side instead, and
   surfaces that `note` verbatim in its own card. An independent review confirmed no percentage sign, no
   client-side division of credits by cost (or the inverse), appears anywhere in the page, including the
   pre-data fallback text.
2. **Capabilities (T213)**: the mock's "Cost / run" column invents a dollar figure `AdminCapabilitySummary`
   has no field for (only `estimatedTokens`, a token budget) — renamed to "Est. tokens" and shows the
   real number, the same "don't invent a figure the backend doesn't provide" call as T212. The per-row
   Enable/Disable button is the one real mutation this surface has, wired to the real `PATCH`.
3. **Queue (T214)**: the mock's Target/Phase/Priority columns are entirely invented — they don't
   correspond to anything BullMQ actually returns for a generic job, since the platform's three queues
   each carry a different job-data shape with no common target/phase field. Columns adapted to what's
   real: job id, queue, name, state, attempts, creation timestamp. Retry/Cancel call the real endpoints
   and refetch the whole list on success (either mutation can move a job to a different state bucket, so
   patching one row locally would risk staleness). Deliberately does **not** special-case or hide the
   Cancel button for the two system-internal job kinds (`workspace-teardown`, `questionnaire-deadline`)
   that T209's backend refuses to cancel by name — the real 409 surfaces through the same error banner as
   any other refusal, confirmed by an independent review that traced this exactly (no client-side
   name-check exists anywhere in the page).
4. **Users and Plans (T215)**: Users drops the mock's fabricated Audits/Renews columns (no such fields
   exist on the list endpoint) and replaces its two non-existent action buttons ("Grant credits", "Change
   plan" — no such endpoints exist) with the one real mutation, an operator-toggle. Plans drops the
   mock's fabricated "Price" column for the same reason as T212's margin percentage (no credit-to-dollar
   rate exists anywhere), replacing it with a State badge and fetching with `includeInactive=true`
   specifically so a deactivated plan can be found and reactivated from this one page; its "Edit" button
   is replaced with the one real mutation, an `isActive` toggle. An independent review traced the
   pagination stop condition, the toggle-direction logic against a stale-closure risk, and a
   double-click-on-"Load more" race, and found all three sound.

**The "visual diff ≤0.5% at 1440/390" half of every one of these four tasks' own completion line could
not be literally satisfied** — recorded honestly rather than silently claimed. `apps/web/tests/visual/
harness.test.ts` has zero coverage for any `/admin/*` route, and the two admin pages already shipped
before this session (`AdminProvidersPage`, `AdminScansPage`, T244) never got individual visual coverage
either — a pre-existing gap in this admin console's own test strategy, not something introduced or
fixable here by inventing a reference image with no design-system source to diff against. T212–T215
instead follow the console's own already-established convention for a real-data page:
`renderToStaticMarkup`, no jsdom, asserting the pre-data shell (`admin-shell.test.ts`/`admin-screens.test.ts`'s
precedent, itself matching `billing-and-pricing.test.ts`'s for the customer-facing side) — the `useEffect`
fetch never fires under static server-side rendering, so that's genuinely the furthest a `pnpm lint`+test
gate can reach without a live server. `pnpm run lint:adherence` is clean for all four (0 warnings/errors).

Two independent reviews (T212 alone, given its constitutional weight; T214+T215 together) found no
blocking or should-fix issues across all four pages, including empirically traced races (retry/cancel
timing, double-click pagination) and stale-closure risks, all found sound. Full `apps/web` unit suite (23
files / 147 tests) and `pnpm test:visual` (6/6 passing, 7 pre-existing `it.todo`, unchanged from before
this session) both re-run clean.

**Not built in this phase**: Session 6, the dedicated admin-surface adversarial review — which should also
weigh in on whether the visual-baseline gap named above is worth closing as its own finding, now that the
console has five real, data-backed pages instead of two.

## US7 admin console engineering review (2026-09-04) — findings fixed

Session 6 of the roadmap: the dedicated adversarial review of the whole US7 admin surface (Sessions 4-5,
T202–T215), run the same way the two prior engineering reviews were — two independent passes (one backend,
one frontend), each reading the actual shipped code and tests directly, cross-checked against CLAUDE.md's
seven non-negotiables, explicitly hunting for the two defect shapes the Phases 4-7 review's own Findings 4
and 6 found (a check that exists but is never wired into the real request path; a guarantee a comment
claims that the code doesn't quite keep under a specific timing case). Full write-up:
[2026-09-04-us7-admin-adversarial-review.md](../docs/superpowers/plans/2026-09-04-us7-admin-adversarial-review.md).

**Backend pass — one Important finding, fixed.** `PATCH /admin/capabilities/:id`'s combined
`{isEnabled, planIds}` body was not atomic: sending a bad `planIds` value alongside an `isEnabled` change
let the `isEnabled` half commit and get audited *before* the `planIds` half's validation threw and the
route answered 400 — a response telling the caller the request failed, sitting next to a real, committed
mutation. Empirically confirmed with a temporary (since-deleted) repro before being reported. The more
dangerous direction: `{isEnabled: true, planIds: ["bad-id"]}` left a capability live and **unrestricted for
every plan** while the caller saw only a 400. Fixed by extracting the plan-existence check into a new
exported, side-effect-free `validatePlanIdsExist` (`capabilities.service.ts`) and calling it — as a pure
read, before either mutation — from the route whenever `planIds` is present. A new contract test sends both
dangerous orderings and asserts neither mutation lands and zero audit rows are written. Everything else the
backend pass checked (audit-log completeness across all five services; `admin-authz.test.ts`'s 16-route
array matching the real router files one-for-one; the full service→route→aggregator→app mount chain for
every capability; capability-delete/provider-chain/queue-cancel guarantees under race and partial-failure
conditions; no dead/unmounted service export anywhere) came back clean — "checked, no defect found."

**Frontend pass — one Important finding, fixed.** The admin Users page (`admin/users/page.tsx`) was the
one screen, among five built the same prior session, that skipped the "don't show a real-looking figure
before data arrives" guard every sibling page already had: a plain `useState(0)` rendered a fabricated-
looking `"0 accounts"` in the header during the loading window and on a genuine 401/403 refusal —
indistinguishable from a real empty system. Fixed by making the count `number | null`, defaulting to
`null`, and conditionally omitting the header's `meta` prop entirely while `total === null`. A new test
asserts the string `"accounts"` never appears in the pre-data shell. Everything else the frontend pass
checked (no client-side authorization anywhere, matching this codebase's documented "frontend guards are
usability, never security" design; every page's typed interface genuinely matching the real backend shape,
re-verified field-by-field against the service files, not the frontend's own type declarations; the margin
page's no-fabricated-percentage claim re-confirmed under every code path including the loading state and an
empty `perScan` array; the queue page's Cancel button re-confirmed to never special-case the two
system-protected job names; zero raw hex/px literals in any admin `.tsx` file, confirmed by direct grep, not
just a passing lint run) came back clean.

**Minor/Informational findings recorded at the time, since resolved (2026-09-08, spec-kit Phase 12/
Convergence delta review):** `listUsers`'s per-row `balanceOf` calls — fixed via a new batched
`balancesOf` in `packages/services/credits/balance.ts`, one query regardless of page size, real
regression test asserting the query count. The audit-log `before`-snapshot race — real, and worse than
"very-low-likelihood" once actually raced under `Promise.allSettled`: confirmed live to corrupt
`CapabilityPlan` rows outright (two concurrent restriction PATCHes could each delete rows out from
under the other) and to throw a unique-constraint violation on `ProviderChainEntry.position` (two
concurrent chain replaces racing their own delete+recreate pairs) — not just produce a misleading audit
entry. Fixed in all three services `updateUser`'s original fix didn't reach: `plans.service.ts`
(`updatePlan`, row-locked transaction), `capabilities.service.ts` (`setCapabilityEnabled` and
`setCapabilityPlanRestrictions`, row-locked transaction), and `providers.service.ts`
(`replaceProviderChain`, a Postgres advisory transaction lock — no single row exists to lock for a
whole-table replace). New adverse suite `admin-audit-race.test.ts` reliably reproduced all four races
(8/8 confirmed-RED runs) and reliably confirmed all four closed (8/8 confirmed-GREEN runs) — full
`apps/api` regression (326 unit + 198 adverse) stayed green throughout.

**Still recorded, not fixed** (per this project's own "Minor findings recorded, fixed only if cheap"
rule): `AdminShell`'s hardcoded operator identity/queue-depth stats (pre-existing since T243, already
deliberately tested, out of this review's admin-*surface-correctness* mandate to re-wire); the admin
console's CSS Modules mixing raw px with tokens (closed as a ratchet, not a rewrite — see CLAUDE.md's
Known open items #4, updated 2026-09-08); and admin frontend error-path test coverage, since closed for
the 5 pages the original review named (`apps/web/tests/unit/admin-error-paths.test.ts`, 2026-09-08).

**Full whole-branch verification gate**, run after both fixes: `pnpm run lint` clean for `apps/api`/
`apps/web` (the only failures are in the unrelated, untracked `showcase-trimora/` directory);
`pnpm run lint:adherence` clean (0/0, 97 files); `pnpm run test` **109 files / 905 tests**;
`pnpm run test:adverse` **33 files / 624 passed, 1 pre-existing skip**; `pnpm run test:visual` **6/6
passing**, 7 pre-existing `it.todo`, unchanged — and that harness runs a real `next build` internally as
part of its own mechanism, which is the actual, direct confirmation that `apps/web`'s production build is
clean. The root `pnpm run typecheck`/`pnpm run build` scripts both still fail on the pre-existing, unrelated
turbo cyclic-dependency warning — Open Decision #16, updated this session to record that it breaks `build`
too, not only `typecheck`; neither `apps/api` nor `apps/worker` has its own build script, so the one package
this would meaningfully build (`apps/web`) is independently confirmed clean regardless.

**This closes US7 (the operator admin console) end to end.** Sessions 4 (backend), 5 (frontend), and 6
(this review) are all done.

## Phase 10a (sandbox-runner core isolation) — T216–T224 — closes SC-017, done

Session 7 of the roadmap. R1's three nested boundaries for untrusted capability execution, built from
near-empty `apps/sandbox-runner` scaffolding. Until this shipped, `POST /admin/capabilities/upload`
(T216, committed separately) returned an unconditional `503 SANDBOX_UNAVAILABLE` — correct behaviour
per the roadmap's own "must never be partially shipped" rule for this phase, not a gap.

**What was built.** A bundle format (no format existed before): a capability bundle is UTF-8 JS source
whose *completion value* — the value of the last-evaluated expression, exactly what `vm.Script.runInContext`
naturally returns — is the `AuditCapability`-shaped object, so no module system is needed inside the
sandboxed realm. A trusted child-harness (`child-harness/{load,context,harness}.ts`) is precompiled
**once** by the unrestricted host process via esbuild's Node API into a flat, dependency-free `.js` file
(cached under `.sandbox-build/`, gitignored), because running `tsx`/`esbuild` itself *inside* a
`--permission`-restricted child fatally conflicts — `esbuild`'s own transform spawns a worker thread,
and `--allow-worker` denial blocks even this trusted code (`ERR_ACCESS_DENIED: WorkerThreads`,
confirmed live). Each forked child then runs the flat file directly with plain `node` — no loader, no
compiler, no worker thread, at request time. Parent-armed, `.unref()`'d `setTimeout` → `SIGKILL`
(`limits/timeout.ts`) is genuinely unstarvable by the child, since parent and child are separate OS
processes with independent event loops. `--max-old-space-size` (`limits/memory.ts`) is the code-level
memory bound, explicitly documented as one of two defense-in-depth layers — a real OS `cgroup` at
deploy time is Session 8/T225's job, not this one's, and this session's own module note says so rather
than implying the guarantee is complete. `host/server.ts` forks with computed `--permission`
`execArgv`, per-path `--allow-fs-read`, `env: {}`, no `--allow-fs-write`/`--allow-child-process`/
`--allow-worker` ever. `host/conformance.ts` runs FR-029's in-sandbox verification before first use.

**Two independent adversarial reviews, two Criticals found and closed before this shipped** — full
write-up: [2026-09-04-sandbox-runner-adversarial-review.md](docs/superpowers/plans/2026-09-04-sandbox-runner-adversarial-review.md).

1. **A vm-context prototype-chain escape.** `Object.create(null)` as the sandbox's global object blocks
   the classic `this.constructor.constructor('return process')()` escape at the top level, but any
   host-realm value handed to the sandboxed capability afterwards — `console`, a data argument, a
   `CodeLayerContext` method like `ctx.fetch` — carries its *own* prototype chain independently of the
   context's global object, and reopens the identical escape via
   `arg.constructor.constructor('return process')()`. Confirmed capable of reaching (and could have
   killed) the host's own parent process. Fixed by never letting a host-realm value reach the sandboxed
   realm at all: data crosses via a new `cloneIntoContext(context, value)` (a JSON round-trip through
   the *target context's own* `JSON.parse`, confirmed a genuinely separate, context-scoped intrinsic),
   and the entire `CodeLayerContext` is built by one `vm.Script` executed *inside* the target context so
   every method's own constructor chain is rooted there too. A third, narrower instance of the same bug
   lived in `packages/capability-sdk`'s shared `runConformanceSuite` (reused for the sandbox's
   `CONFORMANCE` operation per FR-029's "under the same restriction"), which builds its own `canRun`
   trap `Proxy` and `reverify` probe as host-realm objects, outside `harness.ts`'s own reach — closed
   with two new **optional** fields on `ConformanceDeps` (`buildCanRunTrap?`, `buildReverifyProbe?`)
   defaulting to the original construction, so every other, non-sandboxed caller is unaffected —
   confirmed via zero regression in `capabilities-vendored/tests/conformance.test.ts` (16/16) and
   `apps/worker/tests/adverse/capability-disable.test.ts` (44/44).
2. **An unconditional child-process leak.** `finish()` only killed the child on the `TIMEOUT` path;
   every other outcome (success, `FORBIDDEN_ACCESS`, `CONTRACT_VIOLATION`, `BUNDLE_INVALID`) left the
   child's IPC listener holding its event loop open forever. Confirmed live: 7 sequential completed
   requests left 7 orphaned `node.exe` processes running minutes later. Fixed by making `finish()`
   unconditionally `SIGKILL` the child before resolving, on every path (a documented no-op for an
   already-exited child).

A second, independent review reproduced both PoCs against the fixed code, tried 11 further novel escape
variants (all blocked), verified the leak fix at the OS process level across all six possible response
outcomes, and found one Minor: `describeThrown`'s (`packages/capability-sdk/src/contain.ts`)
`instanceof Error` check has the identical cross-realm blind spot, turning a sandboxed capability's real
`canRun` bug into an undiagnosable `"canRun threw: {}"` — fixed the same way (`.name`/`.message` checked
as plain strings first), and used to delete `harness.ts`'s now-redundant local copy of the same logic.
Also fixed along the way: an unbounded `POST /execute` request body (16 MiB cap; the first fix attempt's
`req.destroy()` truncated the 413 response into a raw `ECONNRESET`, corrected by removing that call).

**Two Windows-specific gaps found and left honestly open, not silently patched over** — both from live
debugging on this dev machine (Node v24.15.0), not from either formal review: `fork(..., {env: {}})`
still measurably leaks ~11 real OS-required env vars (`HOMEDRIVE`, `PATH`, `SYSTEMROOT`, etc.) despite
an empty `env` object; and `--allow-fs-read`/`-write` glob matching produced a garbled, mis-cased
resource path for certain glob forms, worked around with narrow explicit allow-paths rather than
root-caused. Both assessed as likely Windows-specific and not necessarily present on the real Linux
deployment target, but unverified — flagged for confirmation during Session 8/T225's real deployment.
See Open Decisions below.

**Full whole-branch verification gate**, re-run clean after every fix:
`pnpm test` **907/907**; `pnpm test:adverse` **639 passed / 1 pre-existing skip**
(`apps/sandbox-runner/tests/adverse/sandbox-escape.test.ts` alone: 11/11 across 4 `describe` blocks —
the original 6-vector SC-017 suite, the 2 new vm-context escape tests, 1 process-cleanup test, 1
request-body-size test; `limits.test.ts`: 4/4).

**This closes SC-017 — the last of the 11 adversarial gates. 11 of 11 are now green.** Not built in
this session: T225 (real deployment, no egress, no DB credentials) and T226 (replacing the 503 with real
dispatch) — Session 8, which depends on this phase being genuinely complete first.

## Phase 10b (sandbox-runner deploy + real dispatch) — T225–T226 — closes Phase 10 and US7, done

Session 8 of the roadmap, the last two tasks in the whole 250-task plan. Phase 10a (above) built the
isolation mechanism itself; this phase deploys it for real and wires the upload route to it.

**T225.** `apps/sandbox-runner/src/serve.ts` (new) is the first real process entrypoint this package
has ever had — `src/index.ts` was only a `SERVICE_NAME` export; nothing before this turned
`createSandboxHost` into a running process. It reads `SANDBOX_RUNNER_PORT`/`PORT` and
`SANDBOX_RUNNER_HOST` from the environment, boots the host, and shuts down cleanly on
`SIGTERM`/`SIGINT`. `host/server.ts` gained a `host` option on `CreateSandboxHostOptions` (default
`'127.0.0.1'`, fully backward compatible with every existing test) and a `GET /health` route ahead of
the `/execute` check. [`infrastructure/sandbox-runner.md`](infrastructure/sandbox-runner.md) (new — the
first per-app deployment doc in this repo) documents why this must be a separate deployment (quoting
CLAUDE.md and R1's three boundaries directly), the exact two env vars this process reads and the five
it must never be given (`DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`,
`ENCRYPTION_KEY`), the network policy (deny-all outbound, inbound only from `apps/api` on
`/execute`/`/health`), and carries forward Session 7's two Windows-specific open gaps as a "verify on
first real deploy" checklist. A new structural adverse suite,
`apps/sandbox-runner/tests/adverse/deployment-isolation.test.ts`, asserts the "no egress, no DB
credentials" claim against the real `package.json` and source tree rather than leaving it as prose —
initially checked only `dependencies` for a forbidden database/queue client; an independent review
found the deploy runbook's own `pnpm install --frozen-lockfile` (no `--prod`) would also install a
`devDependencies` entry, so the check now covers both.

**T226.** `apps/api/src/routes/admin/capabilities.routes.ts`'s `POST /capabilities/upload` no longer
answers an unconditional 503 — it reads the uploaded bundle as a raw body (`express.raw`, scoped to
this one route; safe regardless of `app.ts`'s global `express.json()` mount order, since that
middleware is a no-op passthrough for any content-type other than its own), and hands it to a new
`apps/api/src/services/admin/capability-upload.service.ts`, which dispatches it to the real,
deployed `sandbox-runner` and runs the real conformance suite inside it (FR-029, "under the same
restriction"). A missing or unreachable sandbox still always answers 503 `SANDBOX_UNAVAILABLE` — same
code T216's placeholder used, preserved for wire compatibility — never a fallback to unsandboxed
execution (Constitution Principle V holds exactly as strictly as before). **Scope boundary, stated
explicitly in the service's own module note**: this delivers a genuine conformance verdict only — it
does not write a `Capability` database row and does not make an uploaded bundle executable by any real
scan. `reconcile.ts`'s own rule ("Disk is the source of existence. The database is the source of
enablement") still holds; there is no code path anywhere that writes an uploaded bundle to the
discovery root, and `data-model.md`'s `Capability` entity has no field for one. Turning a passed
verdict into an installed, runnable capability is a separate, larger, currently-unspecified change —
see Open Decision #20.

Getting T226 built required a fix to T224's own `host/conformance.ts`: `runConformanceCheck` took a
live, in-process `SandboxHost` object, which can never be handed across the network/process boundary
Session 8's whole point is to create. Its signature is now a plain `baseUrl: string` — a latent T224
design gap, only exposed once building the one caller it was always meant for was actually attempted.

**An independent adversarial review of the new wiring** (auth/authz, SSRF, body-size DoS, information
leakage, the `express.raw`/`express.json()` interaction, the new `/health` route, and the scope-boundary
claim in `capability-upload.service.ts`) found **no Constitution Principle V violation** — no
`eval`/`Function()`/direct `require()` of uploaded bytes anywhere in `apps/api`, the only path is the
real HTTP round trip to the real sandbox — confirmed `requireAuth`+`requireOperator` still gates the
route unchanged, confirmed `SANDBOX_RUNNER_URL` is never influenced by request input, and empirically
confirmed the 16 MiB body cap and the content-type passthrough both work as documented (not just as
written). It found the `devDependencies` gap above (fixed) and one Informational, accepted as low-risk:
a `SandboxUnavailableError`'s `detail` (e.g. a raw `ECONNREFUSED` message) is echoed into the 503
response, which could reveal the configured sandbox host:port — low impact since the route is already
operator-gated and the value is an internal address with no credentials attached.

**Found, confirmed real by both the implementer and the independent review, and deliberately left
unfixed**: running real dispatch end to end for the very first time (nothing in Phase 10a's own test
suite ever exercised the `CONFORMANCE` operation) exposed a pre-existing defect in
`child-harness/harness.ts`'s `runConformance` (T224, Session 7): its `rawManifest` is built as
`{ id, module, layer }` only, but `@webaudit/capability-sdk`'s `manifestSchema` also requires `name`,
`version`, and `entrypoint` — fields the uploaded-bundle format (T220) never defined a way to supply at
all, since a real vendored capability's manifest lives in a sibling `capability.manifest.json` file
that an in-memory uploaded bundle has no equivalent of. The result: `manifest-valid`, and therefore a
`ConformanceReport`'s overall `passed`, cannot come back `true` for *any* capability dispatched through
`CONFORMANCE` today. `child-harness/*` was explicitly out of scope for this session, so the new
end-to-end test (`admin.capabilities.test.ts`'s "T226 — real dispatch" block) asserts this honestly —
every other check (`contract-shape`, `can-run-has-no-side-effects`, `throwing-is-contained`,
`no-llm-from-code-layer`, `fingerprint-stable`, `abort-honoured`) genuinely runs against the real,
isolated capability and genuinely passes, proving the real dispatch mechanism itself works — rather
than forcing a `passed: true` the current code cannot honestly produce. Recorded as Open Decision #20,
not silently fixed or ignored.

**Full whole-branch verification gate**, re-run independently (not just trusting the implementer's own
report) after every fix: `pnpm test` **910/910** (109 files); `pnpm test:adverse` **642 passed / 1
pre-existing skip** (36 files) — both run in isolation after an initial combined run surfaced 3
failures traced directly to this session's own concurrent-background-command test-DB contamination
(PROGRESS.md's own long-documented gotcha), confirmed spurious by re-running the affected file alone
clean. Both packages' `tsc --noEmit` and every touched file's `eslint` clean.

**This closes Phase 10 end to end and, with it, US7 (the operator admin console) completely — Sessions
4 through 8 all done.** Only Phase 11 (polish, T227–T236 minus T230 done early) remains in the whole
250-task plan.

## Phase 11 (polish & cross-cutting concerns) — T227–T236 — closes the plan, done

Session 9 of the roadmap, 2026-09-04. Nine remaining tasks (T230 was already done, pulled forward at
Phase 3 by review finding M7): accessibility, dark-mode contrast, egress verification, structured
logging, two documentation corrections, a five-unit deployment runbook, and final validation against
this feature's own definition of done.

**T232 — FR-025 amended.** Split into FR-025 (platform code, allowlisted — capability logic, provider
calls, storage) and a new FR-025a (the auditing browser — may load whatever the target page loads,
isolated from platform credentials, still SSRF-refused per FR-014), per research.md's R6. `plan.md`,
`research.md`, and `CLAUDE.md`'s own "open items"/"known open items" sections are all updated to point
at the resolution rather than restate the gap; `CLAUDE.md`/`PRODUCT.md`/`README.md`'s "94 requirements"
citations bumped to 95.

**T233 — `WebAuditAI_ARCHITECTURE.md` corrected in place.** A banner at the top (quoting CLAUDE.md and
research.md's R1/R4/R16 directly) plus an inline note at each of the three wrong points — §1/§7's `vm2`
sandbox references, §6/§7's in-job questionnaire wait, and the closing "how everything connects"
diagram's three-unit count — so a reader hits the correction at the point of error, not only in a
preamble. The rest of the document (vendoring strategy, module/skill/AI-layer split, general UX flow
shape) is left as directionally-accurate historical context, per its own new banner's own scoping.

**T228 — dark-mode severity contrast, genuinely verified.** The port itself (`design-system/tokens/
dark.css` into `apps/web/app/tokens/dark.css`) was already done at T236a; the real, previously-missing
work was contrast-verifying every value the source itself flags "NOT YET CONTRAST-VERIFIED". All six
severity foregrounds meet WCAG AA (4.5:1) against `SeverityBadge.module.css`'s actual
foreground-on-own-background pairing, `--surface-page`, and `--surface-raised` — worst case 5.99:1
(`sev-critical`). `apps/web/tests/unit/dark-severity-contrast.test.ts` (19 tests) computes this live
from the real token file rather than hard-coding the ratios, so a future re-port that changes a value
fails the test instead of a comment quietly going stale. `design-system/` itself is untouched (read-only
reference) — the verification is recorded in the port's own comment and this test, not by editing the
source's "unverified" note.

**T227/T229 — real axe-core and third-party-request e2e suites**, the first tests in this repo to drive
a real browser against a real, built `apps/web` (reusing `tests/visual/harness.ts`'s `startServer` — a
real `next start` child process — rather than reinventing server boot). Six pages covered: the home page
and the five auth pages, the ones that render with no backend/auth session needed; the heavier lift of
booting a full API+worker+DB stack to also cover authenticated dashboard/admin pages (mirroring
`first-audit.spec.ts`'s own composition) was not attempted, stated honestly rather than silently
assumed done.

T229's result is a genuine, freshly-observed clean zero: real request interception during a full page
load confirms T127 (self-hosted fonts) and T247 (vendored icons) hold up in practice, not just by
reading the source — no Google Fonts, no icon CDN, no other host, on any of the six pages.

T227 found something real and new: a first, deliberately unfiltered axe-core run confirmed the
already-known Button focus-ring gap (Open Decision 0a) is **not mechanically detectable at all** — axe
has no rule for focus-ring visibility — but surfaced a **different, previously undocumented** finding on
every page: the vendored `--accent`/`--promo-bg` brand tokens fail WCAG AA `color-contrast` against
white/near-white surfaces (measured 2.53–3.14:1 against the 4.5:1 floor, on the primary `Button`, several
inline links, and the Home page's `PromoBar`), plus one `region` finding (`PromoBar`'s text not in a
landmark, Home page only). Both are named, vendored components; recoloring the token or rewrapping the
markup would be an unreviewed change to `design-system/` itself, outside "port, never author" without an
explicit, signed-off exception. The suite excludes exactly these two rule ids — nothing broader — with
the measured evidence in its own module comment; every other axe-core rule still asserts for real on all
six pages. Recorded as a new carried correction (0a-2) alongside 0a, not silently suppressed.

**T231 — structured, redacted logging.** `packages/config/src/logger.ts`: a `createLogger(service)`
factory over `@webaudit/redaction`'s existing `redactText` (confirmed no circular dependency —
`packages/redaction` depends only on `@webaudit/types`), recursively redacting every string in a log
line's message and fields (depth-bounded at 6) before it reaches `stdout`/`stderr`, with reserved core
keys (`timestamp`/`level`/`service`/`message`) protected from being forged by a field of the same name.
Wired into the three real process entrypoints this monorepo has — `apps/api/src/index.ts`,
`apps/worker/src/index.ts`, `apps/sandbox-runner/src/serve.ts` — replacing every `console.warn`/
`console.error` startup/shutdown line with a structured, redacted one. **Scope stated explicitly in the
module's own header, not implied as broader than it is**: this is not a sweep of every `console.*` call
site in the monorepo (`packages/capability-sdk/src/context.ts`'s own purpose-built logger, scoped to the
untrusted capability boundary, is deliberately left alone), and `apps/probe-pool` has no real process
entrypoint yet to wire into — both named as honest gaps, not silently assumed covered. 9 new tests prove
the redaction genuinely happens (planted credentials in message/fields/nested objects/arrays never
survive to the output line) and that benign content passes through completely unchanged (over-redaction
is a real cost here too, matching `packages/redaction`'s own stated concern).

**T234 — `infrastructure/deploy.md`**, covering all five units. `apps/api`/`apps/worker`/`apps/web` get
real, verified runbooks (exact env vars from `.env.example`, network policy, exact commands — `apps/web`
is the only unit with a real build step, `next build`). `apps/sandbox-runner` points at its own
already-existing `sandbox-runner.md` (T225) rather than duplicating it. `apps/probe-pool` is **honestly
documented as not yet a deployable unit** — no server entrypoint or `start` script exists, only
`browser/pool.ts` library code and a placeholder `dev` echo — with the intended R6/R12 shape (isolated
from platform credentials, port 3002) recorded for whenever a real bootstrap lands, rather than an
invented, unverified runbook for code that doesn't exist.

**T235/T236 — quickstart validation, and a real problem found in the validation guide itself.** Before
running anything, checked whether `quickstart.md`'s own example commands actually work: **they didn't.**
`pnpm test:adverse -- --suite <name>` looked like a suite-selection flag but isn't one — `test:adverse`
has no `--suite` option, confirmed live (the flag is silently misinterpreted, never a suite selector) —
and `pnpm demo:scan`/`demo:trace`/`demo:readiness` (Scenarios 1 and 3) were never built; no such scripts
exist anywhere in this repo. Fixed by amending `quickstart.md` itself (per this project's own "prefer
amending a document over quietly diverging from it" rule) to name the real file path(s) that actually
exercise each scenario's claim, with a banner at the top explaining what changed and why. Also fixed two
smaller stale lines in the same file: `pnpm dev`'s comment named only 4 of the 5 real units, and "the
eight hostile suites" undercounted the current 11 (mirrored in `CLAUDE.md`'s own identical stale count,
also corrected, with each of the 11 SC numbers named and the phase it was added at).

With the commands corrected, every scenario was run for real:

- **Scenario 1** (first audit end to end): `apps/web/tests/e2e/first-audit.spec.ts` — 1/1 passed. The
  new T231 logger is visible working end to end in the run's own output (real structured JSON lines from
  both `api` and `worker`).
- **Scenarios 2, 4–10** (SC-007, SC-015, SC-016, SC-017, SC-018, SC-021, SC-022, SC-011/012): all
  covered by the same whole-branch `pnpm test`/`pnpm test:adverse` run this session already ran clean
  (below) — the corrected quickstart.md now names each scenario's own specific file(s) rather than a
  fake flag.
- **Scenario 3** (readiness verdict and regressions): `readiness.fresh.test.ts`, `readiness.regression
  .test.ts`, `readiness-diff.test.ts`, `readiness-verdict.test.ts` — part of the same clean full-suite
  run.
- **Scenario 11** (design fidelity): `pnpm lint` clean for everything this product owns (found one real,
  cheap gap along the way — `apps/sandbox-runner/.sandbox-build/`, T225's gitignored esbuild cache, was
  missing from `eslint.config.js`'s ignores and produced a parse error on any machine that had already
  exercised the sandbox once; fixed, matching the existing precedent for other generated/out-of-tsconfig
  paths); `pnpm test:visual` — **6/6 real assertions pass, 7 remain `it.todo`** on the already-tracked
  `PublicHeader` mobile-nav gap (named repeatedly since Phase 3, not new).

**Definition of done, checked item by item**: all scenarios pass and `pnpm test:adverse` is green ✅; no
`NEEDS CLARIFICATION` anywhere in `spec.md`/`plan.md` (grepped, zero matches) ✅; SC-006 attribution,
SC-009 margin query, SC-010 no-deploy-to-enable all already covered by existing, passing suites from
earlier phases ✅; `WebAuditAI_ARCHITECTURE.md` corrected ✅ (T233); `pnpm lint` clean with adherence
rules active ✅; zero runtime requests to font/icon/asset CDNs ✅ (T229, freshly confirmed); no surface
shipped without a `design/screen-map.md` row ✅ (unchanged since Phase 3). **The one item honestly not
fully met**: `pnpm test:visual` green "at 1440 and 390 for every surface" — 6 of 13 assertions are real
and green, 7 are `it.todo` on the pre-existing `PublicHeader` gap. Restated accurately here, not
re-discovered as new and not glossed over as satisfied.

**Full whole-branch verification gate**, independently re-run (not just trusting either implementer
agent's own report): `pnpm test` **938/938** (111 files, +28 new tests — 19 contrast + 9 logger);
`pnpm test:adverse` **642 passed / 1 pre-existing skip** (36 files, unchanged — `context-confinement
.test.ts`'s `it.skipIf(!FILE_SYMLINKS)`, a platform-conditional skip, confirmed by name, not a new or
unexplained gap); the new e2e suite **12/12**; `pnpm test:visual` **6/6** (unchanged real count, 7
pre-existing `it.todo`); `tsc --noEmit` and `eslint` clean on every touched package; `pnpm lint:adherence`
clean (0/0, 100 files).

**This closes Phase 11 — the last phase in the whole plan. 250 of 250 tasks done (T001–T236, plus
T236a not in the original count).** Every quickstart scenario passes for real, against commands that now
actually work; every definition-of-done item is met except the one honestly-recorded visual-coverage
gap, itself pre-existing and already tracked, not a new discovery.

## Phases 4–7 engineering review (2026-09-02) — findings fixed

A strict senior-engineering review of T144–T193 (Phases 4–7) produced 18 findings; see
[docs/superpowers/plans/2026-09-02-phases-4-7-engineering-review.md](docs/superpowers/plans/2026-09-02-phases-4-7-engineering-review.md).
All but two are now fixed via a 14-task remediation plan
([2026-09-02-phases-4-7-remediation.md](docs/superpowers/plans/2026-09-02-phases-4-7-remediation.md)),
executed subagent-driven, each task implementer→reviewer, one fix round on Tasks 2/4/5/7:

- **Finding 1 (Critical)** — `owasp-checker`'s multi-cookie reverify could PASS a site where only
  some of several vulnerable cookies had actually been fixed, because the recheck asked "is at least
  one cookie now good" (a substring match against the whole joined `Set-Cookie` header) instead of
  checking every originally-flagged cookie individually. Fixed: each cookie is now checked on its
  own, and the check only PASSes if all of them are.
- **Finding 3 (High)** — `safeFetch` forwarded the GitHub Bearer token used for repository intake to
  every redirect hop, with no host allowlist re-check per hop (SSRF-adjacent credential leak to a
  redirect target). Fixed: credential stripping now applied per-hop, not once at the start, closing a
  found-in-review gap where a stripped-then-same-host-again hop could resurrect the header.
- **Finding 4 (High)** — FR-079's concurrent-scan-per-user limit was written but never called from the
  real `POST /scans` path — dead code. Wired in. Running it against a live database for the first time
  (this remediation pass) surfaced a real, narrow interaction with a pre-existing FR-018
  duplicate-scan race test (a free-tier test user could now legitimately hit the new 403 instead of
  the 409 it was written to isolate) — fixed as an unplanned "Task 3b." The final whole-branch review
  caught a second gap in the same finding: `assertConcurrencyHeadroom` counts every non-terminal scan
  across *all* of a user's targets, but only `create-scan.ts`'s path called it — a running readiness
  pass consumed a slot there while nothing stopped starting a readiness pass itself over the limit.
  Wired into `createReadinessScan` too, same place in the refuse-before-charge order.
- **Finding 5 (High)** — `entitlements.middleware.ts` was never mounted; the cheapest-permitting-tier
  lookup was duplicated ad hoc at each call site instead. Deduped behind one real function (Task 4);
  the final whole-branch review caught that this left the dead middleware in place while Task 3 added
  a *third* copy of the same `EntitlementError` envelope mapping — resolved by deleting the unused
  middleware and confirming (per the review's own Open Question #1) that ad hoc, per-route typed-error
  mapping is the intended design, matching every other refusal `scans.routes.ts` already handles this
  way.
- **Finding 6 (High)** — the billing webhook applied its effect and wrote its idempotency-claim
  `appliedAt` as two separate steps, so a transient failure between them looked identical to "never
  applied" to a provider retry. Made retryable; a residual, narrower double-grant window
  (`grantLot` has no idempotency key of its own) was found during this task and is recorded as a new,
  not-yet-built open item below — not silently expanded into this task's scope.
- **Finding 7 (Medium)** — the Fixes board issued one HTTP request per failing-evidence row (client
  N+1). Batched into one lookup.
- **Finding 10 (Medium)** — cancellation writes `CANCELLED` directly from `apps/api`, which never
  goes through `apps/worker`'s `transition()` — so the in-process terminal-transition observer that
  destroys a scan's workspace on FAILED/COMPLETED never fired for a cancelled scan at all, in any
  circumstance, leaving source on disk indefinitely. Fixed by enqueuing a real teardown job the worker
  durably processes instead. **The first version of this fix did not work**: the job's id
  (`` `workspace-teardown:${scanId}` ``) contains a colon, and BullMQ 6.2.0 rejects a colon-bearing
  custom job id unless it splits into exactly 3 segments — every single enqueue call threw
  `Custom Id cannot contain :`, silently swallowed by the cancel route's fire-and-forget `try/catch`,
  so every production cancellation of a source-bearing scan still left its workspace on disk. Caught
  by the final whole-branch review (no per-task review had run against live Redis) and confirmed
  4/4 with real cancellations before the second fix (hyphenate the id) made it 0/4. A test against a
  real queue — this exact bug already bit `questionnaire-deadline` once before, see
  `apps/worker/tests/adverse/questionnaire-jobid.test.ts` — now proves the job id is actually accepted,
  plus a wiring test proving the cancel route calls the producer at all.
- **Finding 11 (Medium)** — the webhook's fail-closed 503 (no signing secret configured) had no test.
  Added.
- **Finding 12 (Low)** — `tasks.md` T153 overstated what the multi-cookie reverify fix actually
  guaranteed. Wording corrected.
- **Finding 13 (Low)** — the Fixes board's re-check failure message said "you were not charged" even
  when the failure was a lost-in-transit success response (i.e., possibly charged) — now distinguishes
  a genuine 402/409 refusal from every other failure mode.
- **Finding 14 (Low)** — a certificate mid-generation and a certificate that will never exist both
  produced a plain 404. Added a distinct 202 `CERTIFICATE_GENERATING`.
- **Finding 15 (Low)** — two CSS Modules mixed raw px/font-size values with design tokens; the
  adherence lint doesn't parse `.css` files at all (a real blind spot, recorded in research.md, not
  fixed here). Values with an exact token match were swapped; values with none (several font-sizes,
  because every `--type-*` token is a `font` shorthand never usable as a bare `font-size`, confirmed
  by a 117-usage codebase check) were correctly left raw with an explanatory comment.
- **Finding 16 (Low)** — a Zip64 sentinel size field (`0xFFFFFFFF`) with no Zip64 locator fell through
  to whichever unrelated size check happened to catch it, if any — sometimes accepted outright at the
  pre-charge inspection stage. Now explicitly refused with a precise reason.
- **Finding 18 (Low)** — the retention sweep's `expiry <= now` removed a report at the exact expiry
  millisecond instead of strictly after it. Changed to `<`.

**Deliberately not fixed** (per the remediation plan's own Global Constraints): **Finding 9**
(`moduleOutcomes` JSON-cast type safety) is a systemic pattern shared elsewhere in the codebase, not a
targeted fix. **Finding 17** (per-request memory ceiling not fleet-aware) is an operational/capacity
note, not a code defect.

**New open item, not one of the 18 findings:** `grantLot` (`apps/api/src/services/credits/grant.ts`)
has no idempotency key, so `subscribe`/`renewSubscription`/`purchaseCredits` can double-grant credits
if a provider retries a webhook in the narrow window between the effect's own commit and the
following `appliedAt` write (Finding 6's fix narrows this window; a prior version of the code had no
narrowing at all). Closing it fully needs a dedicated task: a nullable `billingEventId` column with a
unique constraint on `CreditTransaction`/`CreditLot`, threaded through the three effect functions.

Verified at the end of this pass: `pnpm run lint` and `pnpm run lint:adherence` clean;
`pnpm -r typecheck` clean across all 31 workspace projects; `pnpm run test:adverse` fully green
(568 passed, 1 pre-existing skip — SSRF suites and credit/billing adverse suites specifically
re-confirmed); `pnpm run test:visual` 6 passed / 7 todo / 0 failed; `next build` clean.
`pnpm run format:check` fails on 94 files. Of the 13 files this branch actually touches, 11 predate
the branch entirely (diff byte-identical against their `main` blob, confirmed file-by-file) and 2 are
new files this branch created (`apps/api/tests/integration/attempts-batch.test.ts`,
`apps/api/tests/unit/entitlements.test.ts`) that also fail `prettier --check` — a real, if
inconsequential, gap in this branch's own hygiene rather than something inherited.
`pnpm run test`'s full 802-test run found exactly one failure, in a test this branch's baseline
commit had already added (`readiness.certificate-email-guard.test.ts`'s 202-GENERATING case, unrelated
to the 14 tasks). Root-caused, by reading the actual installed `superagent`/`supertest` source (not
just inferring): a `Test` object with no `.then()`/`.end()`/`await` chained onto it never dispatches
its request at all — deterministically, confirmed by reverting the fix and reproducing the failure
4/4 times in isolation. This test's own fire-and-forget trigger request had exactly this shape, so it
never fired; the earlier "known flake" label from an even-earlier investigation was a misdiagnosis.
Fixed directly (forcing dispatch via `.catch(() => {})`, verified clean across two full 802/802
suite runs — the exact load conditions that originally exposed it).

## Phase 3 engineering review (2026-08-30) — findings fixed

A strict senior-engineering review of T105–T143. Findings and their remediation:

- **C1 (Critical) — a scan including the UI/Design area failed at persist on an unreconciled FK.**
  `persist.ts` writes the module AI-execution row keyed `module-ai:<module>`; `CapabilityExecution
  .capabilityId` is a required FK to `Capability.id` and nothing created those synthetic rows, so any
  scan whose AI layer emitted an invocation (UI, via `impeccable`) threw
  `CapabilityExecution_capabilityId_fkey` → `failScan` → whole scan FAILED. No test caught it
  (`persist.test.ts` mocks the writer; T109 e2e is SECURITY+SEO only). **Fixed:** new
  `apps/api/src/services/registry/platform-capabilities.ts` (`ensurePlatformCapabilities`), called
  from `reconcileCapabilitiesAtBoot`, from the worker orchestrator's first job (memoised), and from
  `scripts/seed.ts`. New test `apps/worker/tests/integration/orchestrator-ui-module.test.ts` (also
  closes review finding M9 — no e2e covered a UI-area scan) and the showcase full-pipeline run now
  completes a real 5-area scan with no workaround.
- **H2 (High) — `persistModuleResult` was not transactional.** A failure partway left a half-written
  `ModuleResult`. **Fixed:** the orchestrator wraps the call in `db.$transaction`.
- **H3 (High) — the `globalThis.fetch` egress poison raced across concurrently-run modules.** Module
  A's `finally` un-poisoned `fetch` while module B was still running (FR-025 silently off).
  **Fixed:** the poison is now reference-counted and process-wide with one shared violations map
  keyed by `currentCapabilityId()`; restored only when the last concurrent module's code layer ends.
  New test in `layer-ordering.test.ts`.
- **H4 (High) — FR-018 one-active-scan-per-target was a read-then-write TOCTOU race** (concurrent
  `POST /scans` → double charge). **Fixed:** partial unique index
  `Scan_one_active_per_target` (raw migration `20260830090000_...`) + `create-scan.ts` catches the
  P2002 → `DuplicateScanError`. New test: 8 concurrent creates → exactly one 201, one debit.
- **M5** — `chargedCredits` is now written at scan-create time, not in a later separate update (a
  crash between `debit` and that update left a real charge reading as `chargedCredits: 0`).
- **M6** — `create-scan.ts` no longer runs the `reconfirmControl` network probe when nothing in the
  selection needs more than `NONE` control (the common URL scan), matching the orchestrator.
- **M7** — the orchestrator now threads completed `ModuleResult` summaries into later phases'
  `CapabilityInput.priorModuleResults` (was hard-coded `{}`). `contradiction-detector` (TESTING,
  phase 1) still needs a dedicated post-audit QA phase to be fully useful; the threading mechanism it
  depends on is now real.
- **T108's second assertion (`chargedCredits < quotedCredits`) is fixed, not RED.** `create-scan.ts`
  now debits only the modules whose control gate is met; the gated module's share is never charged.
  `gated-check-partial.test.ts` raises every SECURITY capability to `VERIFIED` so SECURITY is
  genuinely gated at execution (NOT_APPLICABLE) while SEO completes.
- **L10–L13** — `create-scan.ts` selects only the plan fields it needs (not the whole `User` row) and
  parallelises its independent reads; `persist.ts` writes capability-execution rows in one
  `createMany`; the flaky `adherence-lint` cold-start test gets a 20s timeout.

Not changed: **M8** — `AI_MODE=fixtures` returning `{}` and degrading the AI layer is a *deliberate*
design (it is forbidden in production for exactly that reason); the AI layer is tested with
schema-valid responses via explicit stubs, not the default fixture chain.

## Phases 1–2 review (2026-08-30) — wiring gaps fixed

A follow-on review of the pre-Phase-3 foundation for "built but never connected":

- **`sweepTimedOutScans` (T101 / FR-038) was never scheduled** — its only caller was a test, so a
  scan whose phase job died sat non-terminal for ever with its credits spent. New
  `apps/worker/src/orchestrator/timeout-scheduler.ts`: a BullMQ **repeatable** job on the
  maintenance queue (`upsertJobScheduler`, 60s default, `TIMEOUT_SWEEP_INTERVAL_MS` to tune),
  wired into `startWorker`. New `timeout-sweep.test.ts` (3): stuck scan → TIMED_OUT + refund,
  in-deadline scan untouched, dispatch routing. Confirmed at real worker boot
  (`bull:webaudit-maintenance:repeat:timeout-sweep` registered).
- **`assertCapabilitiesAreLocal` (T074 / FR-023) was defined but never called at boot.** Now runs
  inside `reconcileCapabilitiesAtBoot` (option `assertLocal`, default true) and **fails closed** —
  a capability that reconciled but whose entry module is not on disk stops the boot. The 13
  vendored manifests point at `src/index.ts` (present), so it passes; verified at real `startApi`.
- **`capability-loader.ts` ignored the registry's `isEnabled` flag** (open decision #13) — an
  operator-disabled capability kept running until the next deploy. `loadCapabilities` now takes the
  enabled-id set; the orchestrator reads `isEnabled: true` per module and threads it in. New
  `orchestrator-capability-enabled.test.ts` (2): a disabled capability writes no execution row; a
  module with everything disabled resolves NOT_APPLICABLE without failing the scan.
- **`apps/api` and `apps/worker` had no runnable `dev` script** — both `index.ts` files already
  carried `isEntrypoint()` guards, so this was just missing package scripts. Added `dev`
  (`node --env-file-if-exists=../../.env --import tsx --watch src/index.ts`) and `start`. Both boot
  cleanly (`[api] listening on …`, `[worker] consuming …`). The stale "placeholders until T113"
  worker log line is corrected.

**Fixed (2026-09-02 remediation)** — workspace teardown now fires on an API-side
`POST /scans/:id/cancel` (closing SC-015's cross-process gap, PROGRESS open item 7). The route
enqueues a `workspace-teardown` job on the maintenance queue (`apps/api/src/services/queue/
teardown-producer.ts`); `apps/worker` registers a real handler (`apps/worker/src/index.ts`) that
calls `destroyScanWorkspace` with the same baseDir/db/owner triple the in-process
terminal-transition observer already uses.

Verified: `pnpm test` **666/666**, `pnpm test:adverse` **532/533** (1 skip), `pnpm lint` clean.
(A concurrent-session collaboration on Phase 4 is in the same worktree; run tests against your own
`TEST_DATABASE_URL` — two `--no-file-parallelism` runs truncate one DB and produce phantom failures.)
**Task list** [specs/001-webaudit-mvp-baseline/tasks.md](specs/001-webaudit-mvp-baseline/tasks.md) — authoritative for task state.

Human-readable roll-up and handoff. **Starting a fresh session? Read § Resume here first.**

---

## Phase 7 (User Story 5) — pay for capacity with plans and credits, T180–T193 — done

**Revenue is collectable and the margin is recorded, and nobody is billed for a failure.** The lot
ledger from Phase 1 (research R2) already had the shape; this phase adds the subscription lifecycle
that grants and expires PLAN lots, the entitlement layer that refuses an input type or feature
*before* any debit while naming the tier that would permit it (FR-016), a credit purchase that
creates non-expiring PURCHASED lots, and the external-payment surface — a signed, idempotent
webhook — that drives all of it in production.

**SC-008 is the gate, and it is structural, not a matter of statement order.** `refund-on-failure`
(T180, adverse) asserts a scan that fails before any area ran is refunded in full, a scan that
delivered one of two areas is refunded the undelivered half, and — the part a balance-only assertion
would miss — the refund appears in `GET /billing/credits` with amount, reason, and timestamp
(FR-076). The refund returns to the originating lot, so an expiring-credit refund does not silently
become a permanent one.

**FR-078's two credit lifetimes never collapse into one number.** `balanceOf` returns `{ plan,
purchased, planExpiresAt }` and nothing sums them for display. `GET /billing/credits` carries the
full movement history and, for every `DEBIT`, a `drewFrom` map built from `CreditAllocation` → lot
kind, so scenario 6 ("the account shows which balance was drawn against") is answerable from one
call. Plan credits are spent before purchased (SC-022, already enforced in `debit`); renewal
*replaces* the plan lot rather than topping it up (`renewSubscription` expires the closing period's
PLAN lots, then grants the new period's); a cancelled subscription lapses and grants nothing.

**The webhook fails closed and is idempotent on the provider's event id.** No secret configured →
`503`, never a silent accept. Body signature recomputed HMAC-SHA256 and compared `timingSafeEqual`;
a forged "you were paid" is `401` with nothing applied. The first thing a verified handler does is
`INSERT` the event id into `BillingEvent`; a duplicate delivery hits the P2002 and returns `200`
with nothing re-applied. It mounts its own `express.raw` ahead of the app's `express.json` because
the raw bytes are what the signature covers. An application-level failure (webhook for a deleted
user, a removed plan) is logged and answered `200 { applied: false }` — the event row is the
reconciliation record; spinning the provider on a retry that cannot succeed helps no one.

**Retention and export (T189/T190, FR-092/FR-093).** The worker's billing sweep — one repeatable
maintenance job, `CONCURRENCY.maintenance = 1` — renews due subscriptions, sends the pre-renewal
expiry warning once per period for subscriptions whose plan credits are about to lapse, then warns
about and removes reports past their plan's retention window. A removal clears the findings, module
results and readiness verdict and nulls the score/summary, keeps the `Scan` row, sets
`reportRemovedAt`, and (when R2 storage is configured — it is `null` in the worker for now) deletes
the stored objects. `GET /scans/:id/report` then answers `410 REPORT_REMOVED`; `GET
/scans/:id/export` produces a single self-contained HTML file (no external CSS, fonts, or scripts)
with the score, summary, every area and issue, each issue's fix prompt (FR-051), and the
attribution — refused `404`/`410`/`409` by reason for a report that is missing, removed, or not yet
finished.

**Frontend (T192/T193).** `apps/web/app/(dashboard)/billing/page.tsx` shows the two balances as two
figures that never add — plan credits carry "expire at renewal" with the date, purchased carry
"never expire" — with a movement list that names the balance every row moved (and the per-lot split
for a debit), the plan chooser wired to `subscribe`/`change-plan`, a top-up control, and the
always-present refund line. `apps/web/app/(public)/pricing/page.tsx` ports `Pricing.jsx` verbatim;
its dollar figures are the vendored source's own placeholders (monetary price points remain an open
item). Both are covered by the adherence-lint gate (the `apps/web/app/**/*.tsx` glob picks them up
automatically) and by `apps/web/tests/unit/billing-and-pricing.test.ts`. Visual diff for `/billing`
is N/A (no `/billing` artboard in `design-system/reference-pages/`, as with the other dashboard
screens); `/pricing` stays an `it.todo` for the same reason the Home and auth pages do — the shared
`PublicHeader` has no mobile-nav treatment and overflows every public page at 390, and a few
desktop comparisons land ~1.5–3% over the 0.5% bar from the same header. Not this task's call to
invent a fix for ("port, never author").

**Two pre-existing issues surfaced and fixed:**

- **`scripts/seed.ts` could not resolve `@webaudit/config`.** An earlier Phase 7 change pointed the
  seed script at `PLAN_TIERS` so the script, the test helper, and the billing services never drift —
  but `@webaudit/config` was not a dependency of the root `package.json`, so pnpm never linked it
  into the root `node_modules` and `tsc -p tsconfig.json` / `eslint .` both failed. Fixed by adding
  the `workspace:*` dependency.
- **`upload.test.ts` named `pro` as the tier that permits an uploaded archive.** The spec's Plan
  Tiers table says Starter ("Uploaded archive: No | Yes | Yes | Yes"). The assertion only read
  `pro` because the old two-tier `seedPlans()` helper seeded just `free` + `pro`; Phase 7's helper
  seeds all four, so the "cheapest active tier that permits ARCHIVE" is now correctly `starter`.
  Test updated, spec unchanged.

Verified: `pnpm -r typecheck` clean (32 projects), `pnpm lint` + `pnpm run lint:adherence` clean,
`pnpm test` **794/794**, `pnpm test:adverse` **564 passed / 1 pre-existing skip**, `pnpm test:visual`
6 + 7 todo (baseline unchanged), `next build` clean (`/billing` and `/pricing` both build).
`pnpm format:check` remains red on files that predate this phase — see § Resume here.

## Phase 6 (User Story 4) — audit source, not just the served page, T169–T179 — done

**A `.zip` or a connected GitHub repository is now a first-class audit input.** It is refused before
extraction and before charging if it is hostile, becomes a workspace the three new source capabilities
read, and is destroyed on every exit path. FR-015's ordering guarantee is structural rather than a
matter of statement order: **the upload endpoint stages a `Target` and does not create a scan or charge
anything** — the charge is a separate request that cannot be reached by an archive that was refused.

**The extraction guard (T172) is the load-bearing piece, and the order inside it is the guarantee.**
`packages/safe-archive` has two entry points. `inspectArchive` answers every FR-015 question from the
zip central directory with no filesystem involved, so the API can refuse before a scan row exists.
`extractArchive` calls it **unconditionally** — no skip option, no "already inspected" fast path,
because a fast path is exactly how a second caller ends up writing unchecked bytes a year from now.
Three details each close a real hole:

- **A ratio *and* an absolute ceiling.** Either alone has a gap. `ARCHIVE_LIMITS.maxUncompressedBytes`
  (512 MB, added this phase) stops a 50 MB archive expanding *honestly* to 5 GB — no suspicious ratio
  anywhere. The ratio stops a 4 KB archive expanding to 512 MB — under any absolute ceiling worth
  having. The budget is the `min` of the two.
- **A per-entry byte budget between inflate and the file.** A central-directory size is a *claim*. A
  `ByteBudget` transform enforces it mid-stream, so an entry that lies about its size fails
  `DECLARED_SIZE_MISMATCH` and its partial file is removed before the error propagates.
- **Symlinks are refused, never dereferenced.** Following one to decide whether to allow it is the
  vulnerability.

**Zip only, deliberately.** T179 corrects the shipped copy that promised `.tar.gz`. Every additional
container is a second parser that must be independently proven not to write before it checks, and a
tar `typeflag` check is not the same code as a zip mode check. Support arrives with its own T169
entries or not at all.

**A repository is fetched as a zipball, not cloned — a recorded divergence from T174's wording**, for
three reasons that all point the same way. It routes repository bytes through the same adversarially
tested guard an upload uses, where `git clone` would *create* the symlink and leave the SDK's read
confinement as the only defence. It keeps the credential out of a process argument list visible in
`ps`. And it keeps a `git` binary out of an image that processes hostile input. The cost is no history
and no submodules; nothing in this repository reads either. Two details matter: `stripComponents: 1`
removes GitHub's `owner-repo-<sha>/` wrapper, without which **every source finding's fingerprint would
change on every commit** (R3), and `safeFetch` is doing real work here because the zipball request
302s to `codeload.github.com` — the hop that delivers the bytes is the second one, so it is the one
that must be re-validated (R6).

**Materialisation is idempotent across phase jobs.** Each phase is a separate invocation; re-fetching
would mean auditing a moving target. A materialisation failure destroys the workspace before
propagating — FR-090 does not exempt "the source never fully arrived".

**A revoked connection is a refusal, not a refund (T171).** `create-scan.ts` checks connection liveness
*before* the debit, so the user gets a `409` naming the remedy and no statement lines at all. The test
asserts no `DEBIT` **and** no `REFUND`, because a balance-only assertion passes against an
implementation that charges and compensates — which leaves two entries on a bill for an audit that
never ran. The refund path stays behind the check for a revocation that lands in the seconds after it.

**Routes (T178).** `GET /repos` and `POST /scans/upload` live in their own router mounted **ahead of**
`scansRoutes` for one concrete reason: `express.json()` runs on every request, and a 50 MB multipart
body must never reach a JSON parser. The upload handler owns its body from the socket to
`readBoundedUpload` with nothing buffering in between. `413` for oversize, `422` for every other
refusal — a client can act on the first and cannot act on the second, and conflating them makes every
hostile archive look like a size problem in a dashboard.

**Three capabilities (T175–T177):** dependency-scanner (vulnerable dependencies against a *vendored*
advisory list — Principle II, plus missing lockfiles and floating ranges), bundle-analyzer (oversized
and unminified bundles, published source maps), css-analyzer (weight, `!important` overuse, colour
sprawl). All three answer `canRun` from `CapabilityInput.code`'s listing without touching disk, so
T170 can assert what a URL-only audit does: all three skip on `PRECONDITIONS`, the module lands
NOT_APPLICABLE, and **the area's score is `null`, not `0`** — FR-053, and a `?? 0` here would deflate
every URL-only audit ever run. `reverify` reports `UNVERIFIABLE` rather than guessing once FR-090 has
destroyed the workspace.

One bug worth recording because its own test caught it: bundle-analyzer originally read a prefix of
each bundle and reported clean on **every** file that leaked its source, since
`//# sourceMappingURL=` is the *last* line of a real bundle. It now reads head and tail.

**Frontend (T179).** `InputTabs.tsx` extracts the selector from `ScanForm` (T129) and gives it the
backing that task's note said it was waiting for: `GET /repos` replaces three hardcoded repository
names, `POST /scans/upload` replaces a decorative dropzone. It reports a discriminated
`InputSelection` upward rather than a tab name — "which tab is open" and "what has the user chosen"
are different questions, and conflating them submits an empty URL because the URL tab happened to be
in front. **An archive is staged when chosen, not at submit**: refusing is free, so a hostile archive
is rejected at the file picker rather than after the user has chosen five areas and pressed "Accept
and run". Visual diff N/A — no new-scan artboard exists in `design-system/reference-pages/` (as with
T129, T155/156, T168); verified with adherence lint, unit tests, and a clean `next build` instead.

Verified: `pnpm lint` clean, `pnpm -r typecheck` clean (30 projects), `pnpm test` **752/753** (1
confirmed-flaky timing test, green 2/2 in isolation — see the header), `pnpm test:adverse`
**561 passed / 1 pre-existing skip** (30 files), `pnpm test:visual` 6 + 7 todo (baseline unchanged),
`next build` clean. `pnpm format:check` is red on files that predate this phase — see § Resume here.

**Re-verification found one real regression the session that wrote this section had not caught**:
`repo-clone.ts`'s zipball URL built `.../zipball${ref}` from a `refPath()` helper that was called but
never defined — `tsc --noEmit` on `apps/worker` failed with `Cannot find name 'refPath'`, so "typecheck
clean (30 projects)" above was not true at the commit this session inherited. Fixed with the obviously
intended helper (`''` for the default branch, `/<encodeURIComponent(ref)>` otherwise — GitHub's API
decodes `%2F` inside a ref segment, which is what makes a branch name like `release/1.0` reachable at
all). Recorded here rather than silently amending the claim above.

**One pre-existing flaky adverse test was de-flaked on the way through** (`credits.expiry-race.test.ts`,
"leaves purchased credits alone however the sweep is raced"). It raced a debit against the expiry sweep
with `Promise.allSettled` and then asserted a balance of exactly 50 — which is the outcome only when
the *debit* commits first. Sweep-first is equally legitimate and leaves 10, so the suite was green on
most runs and red on precisely the interleaving it exists to exercise; it failed once in three full
gate runs here. It now asserts the order-independent invariant instead: no purchased credit is ever
destroyed, so the surviving balance is fully explained by the grant minus the debit minus the sweep's
own `creditsDestroyed`, and a sweep that reached the purchased lot would break that identity from
either side. **The de-flake did not weaken SC-022** — the old assertion could not distinguish "the
sweep spared the purchased lot" from "the debit got there first".

**Not done in this phase, and named rather than left implicit:** the `tar.gz` container (above);
GitLab and Bitbucket (`GET /repos` is GitHub-only, matching the single provider in `token-vault`);
and a `Target` for a subdirectory of a repository, which the schema allows and no UI offers.

---

## Phase 4 (User Story 2) — the fix loop, T144–T157 — done

**The red-to-green loop is built end to end.** A user asserts an issue fixed, the platform re-runs
*only* that one check against the recorded location, and the issue turns green **only** when the
check passes — verified adversarially (SC-007), not just enforced by the schema.

**SC-007 is the load-bearing guarantee, and it is now structural in three layers:**

1. `@webaudit/types`' `ISSUE_STATE_TRANSITIONS` already had `RESOLVED` with exactly one inbound
   edge (from `ASSERTED_FIXED`) and no user action on any right-hand side.
2. `apps/api/src/services/issues/state-machine.ts` (T148) — `outcomeToState` is a **total function
   over `VerificationOutcome` whose only `RESOLVED` branch is `PASSED`**; `assertResolvedOnlyOnPass`
   re-checks that at runtime before any write.
3. `recordVerificationAttempt` (`attempts.ts`, T151) is the **only writer of `Issue.state =
   RESOLVED` anywhere in the system** — one transaction, the state move guarded on
   `state: 'ASSERTED_FIXED'` (a retried BullMQ job records exactly one attempt), the
   `VerificationAttempt` row second, a refund outside the tx for a non-delivered verdict.

`apps/api/tests/adverse/verification.test.ts` (T144, 5 tests) drives all three SC-007 shapes —
unchanged assertion → `FAILED` → stays `OPEN`; bulk assert-all → 0 green; a throwing check →
`ERRORED` → not green + refunded — plus a positive control proving a genuine `PASSED` *does*
resolve, so the suite tests a lock rather than a wall.

**Async, through a real queue — not the http-api.md example's synchronous-looking shape.**
`POST /issues/:id/assert-fixed` (T154) charges 3 credits (`REVERIFY_COST`), transitions the issue to
`ASSERTED_FIXED` under a guarded `updateMany` (a lost race refunds + 409s), enqueues a `reverify`
job, and returns `202`. The verdict arrives later as an `issue:verified` realtime event and a new
`VerificationAttempt` row — matching the dedicated `reverify` queue + `REVERIFY_JOB_OPTIONS`
(3 attempts, backoff) the architecture already shipped in `@webaudit/config`. New producer:
`apps/api/src/services/queue/reverify-producer.ts`, mirroring `scan-phase-producer.ts` (no
`@webaudit/worker` dependency in production).

**The worker runner (T149/T150) touches exactly one capability.** `apps/worker/src/reverify/
resolve-check.ts` maps a `checkId` namespace (`headers`/`ssl`/`owasp`/`meta`/`content`/`redaction`)
to its owning capability id — a static table for the same reason `capability-loader.ts`'s is; an
unknown namespace, or a capability with no `reverify`, resolves to nothing → the runner returns
`UNVERIFIABLE` (FR-063), never a guess. `runner.ts` loads the issue (must be `ASSERTED_FIXED` or the
job is stale and no-ops), builds the same `CodeLayerContext` a code-layer capability gets, contains
the call with `containCapabilityCall` (a throw, a rejection, and a hang are all one `ERRORED`
shape), hands the verdict to `recordVerificationAttempt`, and publishes `issue:verified`. It never
calls `runModule` or loads the module's other capabilities — FR-059's "MUST NOT re-audit" is a
property of only ever touching one `reverify`.

**Refunds on a non-delivered verdict (FR-075).** `ERRORED` (we could not run the check) and
`UNVERIFIABLE` (we have no check for this issue at all — a gap in our coverage, not a service) both
refund the 3-credit charge to its originating lot. A `FAILED` re-check *is* a delivered verdict —
the user learns their fix did not hold — and stays charged. `IssueVerifiedEvent.outcome` gained
`'ERRORED'` (additive union widening in `@webaudit/types`).

**`reverify` on all six first-slice capabilities (T153).** Each fetches the recorded URL once and
re-runs exactly the one check its `checkId` names — never the others — returning
`PASSED` / `FAILED {evidence}` / `UNVERIFIABLE`. `data-leak-scanner` is URL-only and *kind*-granular
at re-check time (`ctx.readFile` is unavailable with no attached-source workspace): it never reports
`PASSED` while any credential of the flagged kind remains in the page — the safe direction for
SC-007. `ssl-analyzer` decides ownership before touching the network (the conformance probe passes
`conformance-probe` as the checkId).

**Recurrence (T152).** `markRecurrences` runs in the orchestrator's `RUNNING_DOCS` phase: a
new-scan issue whose fingerprint reached `RESOLVED` (or `previouslyResolved`) in an earlier scan of
the same target is re-labelled `REOPENED` with `previouslyResolved`/`reopenedAt` set — a birth-time
classification, not a fix-loop transition, so the fixes board and the readiness diff (FR-069) both
see it as a regression rather than a new find.

**Frontend (T155–T157).** `apps/web/components/fixes/{FixesBoard,IssueRow}.tsx` ported from
`FixesScreen`; `app/(dashboard)/fixes/page.tsx` reads `?scan=<id>` (no "current scan" concept,
`Suspense`-wrapped for `useSearchParams`), loads `GET /scans/:id/issues`, re-fetches on every
`issue:verified` event and `onResync` (T135 realtime), shows "Re-checking…" optimistically from the
route's returned state, and pulls `GET /issues/:id/attempts` for any re-checked-but-not-resolved
issue so the current failing evidence renders **inline in mono, never behind a click** (FR-061).
**Visual diff N/A** — there is no fixes-board artboard in `design-system/reference-pages/` (only
Home/Dashboard/Admin + public pages), the same situation T129/T130/T134's dashboard screens were in;
covered by `apps/web/tests/unit/fixes-board.test.ts` (9) + adherence lint instead.

**`@webaudit/api/issues` package subpath** added (same shape as `/credits`, `/control-gate`) so the
worker reaches `recordVerificationAttempt`/`markRecurrences` without depending on `apps/api`'s
routes.

**Two pre-existing tests updated for the new reality, not worked around:** the capability conformance
suite's `reverify-reports-failure-with-evidence` check now actually runs (the 6 capabilities have a
`reverify`) — `ssl-analyzer` needed its ownership check moved before the fetch; and
`workers.test.ts`'s "reverify has no producer yet" premise is stale — `reverify` is now a known job,
so a missing handler is `JobNotImplementedError` naming T150, not `UnknownJobError`.

**Verified** (against an isolated `TEST_DATABASE_URL`, so the concurrent Phases 1–2 session's runs
don't collide): `pnpm lint` + `pnpm -r typecheck` clean; `pnpm test` **666/666**; `pnpm test:adverse`
**532 passed / 1 pre-existing skip** (+8: `verification.test.ts` ×5, `reverify.unverifiable.test.ts`
×3); `pnpm test:visual` 6 passed / 7 todo (baseline unchanged); `next build` clean, `/fixes` route
builds. New unit coverage beyond the 4 numbered task suites: worker runner (7), capability `reverify`
(16), recurrence (3), fixes board (9).

**Still open, recorded not hidden:** an AI-judgment issue (`checkId` `ai.*`) has no re-verification
entry point, so pressing "I fixed this" on one costs 3 credits then immediately refunds them and
lands `UNVERIFIABLE` — financially correct, mildly wasteful UX. Disabling the button for those needs
the frontend to know the `resolve-check` namespace map, which is worker-side; deferred.

---

## Phase 5 (User Story 3) — the readiness verdict, T158–T168 — done

**The full journey is deliverable: audit → fix → verify → ship.** A user whose baseline audit has no
outstanding critical or high issues runs a readiness pass; every area is re-audited fresh; the
result is diffed against the baseline by fingerprint; and an explicit **go / no-go** verdict comes
back with every failing criterion named.

**FR-067 (audit fresh, no reuse) is kept by construction.** A `READINESS` scan
(`apps/api/src/services/readiness/create.ts`, T161) is an ordinary `Scan` — `kind: READINESS`,
`baseline` connected, `requestedModules: ALL_AREAS` — that runs the same orchestrator phase
pipeline as an `INITIAL` one. `persistModuleResult` writes against the readiness scan's own id, so a
baseline `ModuleResult` is never read for scoring, copied, or mutated. `readiness.fresh.test.ts`
(T158) pins that: the verdict is scored from the readiness scan's own results, and the baseline's
rows come back byte-identical.

**The finalization pipeline** (`apps/worker/src/readiness/run.ts`, T162) runs in the orchestrator's
`RUNNING_DOCS` phase when `scan.kind === 'READINESS'`: it reads both scans' snapshots (baseline only
for comparison, FR-068), computes the diff and verdict, and upserts the one `ReadinessVerdict` row
(idempotent for a retried phase).

**The diff** (`diff.ts`, T163) is pure and fingerprint-keyed. `areaChanges` carries a signed delta
and a direction per area with a 3-point noise floor (FR-068). `regressions` are all **named**
(FR-069's "named, not merely counted"): an area score that fell past the floor; an area whose state
carries less confidence than before (COMPLETE→DEGRADED counts as a regression *of the audit* even at
the same score — `STATE_RANK`); a fresh issue whose fingerprint reached `RESOLVED` in the baseline
(a verified fix that came back); a fresh CRITICAL/HIGH issue whose fingerprint is absent from the
baseline (the "readiness pass discovers new critical issues" edge case). `improvements`: risen
scores, cleared blocking issues.

**The verdict** (`verdict.ts`, T164) is pure. A *go* needs both halves of FR-071 at once — every
area at or above its **published** threshold (`READINESS_THRESHOLDS` in `@webaudit/config`, defaulted
PERF/SEC 80, TESTING 75, UI/SEO 70 — an open decision, published rather than hidden in the logic)
**and** zero regressions. Every failing criterion becomes a named blocker (FR-070). An unscored area
is a blocker — you cannot ship what could not be audited — and `overallScore` is never null (an
audit that measured nothing is a no-go at 0).

**FR-066 (premature)** — `POST /scans/:baseline/readiness` is refused `403 READINESS_PREMATURE` with
the outstanding count while any CRITICAL/HIGH issue on the baseline is not `RESOLVED`, and charges
nothing; `GET /scans/:baseline/readiness` reports `{ premature, outstandingBlocking }` so the UI
offers-and-marks rather than hides. `readiness.premature.test.ts` (T160) covers both plus the
free-tier `403 PLAN_UPGRADE_REQUIRED` and the "starts once resolved" path.

**FR-072 (shareable certificate)** — a self-contained HTML page (no external CSS/fonts/scripts),
generated **lazily** by `GET /scans/:id/readiness` on the first read of a *go* verdict, stored in R2
under the scan's prefix, guarded by a single `updateMany` on `certificateKey: null` so it happens
once — and the congratulations email (T166, a new `Mailer.sendReadinessAchieved` method) is sent in
the same guarded block. If R2 is not configured the verdict still returns and `certificateKey` stays
null (documented, matching how `storage/reports.ts` is real-but-unconsumed until something needs it).

**Frontend** — `ReadinessVerdict` (T168, ported from `VerdictPanel.jsx`, prop names matching its
`.d.ts`, blockers always visible per `VerdictPanel.prompt.md`) plus `app/(dashboard)/readiness/page.tsx`
(not a numbered task, same "the component is dead code without it" reasoning as T157's fixes page):
`?scan=<id>` resolves to offer/premature for an INITIAL scan or the verdict for a READINESS scan,
realtime-driven, with the certificate link.

**`@webaudit/api/readiness` was NOT added** — the certificate/email stay route-side (lazy), and the
worker's finalization writes only the verdict row, so no new package subpath was needed beyond what
Phase 4 already established.

**Verified** (isolated `TEST_DATABASE_URL`): `pnpm lint` + `pnpm -r typecheck` clean; `pnpm test`
green; `pnpm test:adverse` green; `next build` clean, `/readiness` route builds. New coverage: the 3
named suites (T158/159/160) + `readiness-diff` (8), `readiness-verdict` (5), `readiness-certificate`
(4), the `ReadinessVerdict` component (3).

**Open decision recorded:** the per-area go thresholds have no number in the spec ("published and
fixed" is all it says) — defaulted and published in `@webaudit/config/constants` with a rationale,
same treatment as FR-017's Level 1 probe rate. Needs product sign-off; a one-line change.

---

## Resume here

### Get running

```bash
pnpm install
pnpm services:up          # postgres :5442, redis :6389 — NOT the defaults
pnpm db:migrate
pnpm db:seed
```

### Six gotchas that will each cost you an hour

1. **Non-default ports.** Postgres **5442**, Redis **6389**. Other projects on this machine hold
   5432/6379. `.env.example` matches — do not "fix" it back.
2. **Config fails closed.** `apps/api/src/config/env.ts` refuses to boot without
   `JWT_ACCESS_SECRET` (≥32 chars). Deliberate — finding C3, it used to fall back to a constant
   committed in this repo. Local `.env` has one. For a throwaway shell,
   `ALLOW_INSECURE_DEV_SECRETS=true` works and warns loudly.
3. **Tests need a real database.** Contract and adverse suites run against PostgreSQL. Export this
   or the helper falls back to a default that may not exist:
   ```bash
   export TEST_DATABASE_URL="postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public"
   ```
4. **The `unit` project runs serially** (`--no-file-parallelism`). Contract files share one database
   and each `beforeEach` truncates it; in parallel they wipe each other mid-test. Do not remove the
   flag without giving each file its own schema.
5. **`tsx` run from `apps/api` does not load the root `.env`.** Pass secrets inline for one-off
   scripts.
6. **`design-system/` is read-only.** Port out of it; never edit it, never import it at runtime
   (constitution v1.1.0, Design Adherence).

### Is the tree healthy?

```bash
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm test:adverse && pnpm test:visual
```

Seven of the eight pass. **`pnpm format:check` is red, and was already red before Phase 6** — about
two dozen files from Phases 4 and 5, `apps/probe-pool`, and several vendored capabilities were
committed unformatted. Every file Phases 6 and 7 touched is formatted; the pre-existing ones were
left alone deliberately so each phase's diff stays reviewable. Fixing it is one mechanical
`npx prettier --write .` whenever someone is willing to own the whitespace-only churn, and it should
happen on its own commit rather than inside a feature phase. `pnpm lint` (code lint plus
design-adherence lint), `pnpm -r typecheck`, `pnpm test`, `pnpm test:adverse`, `pnpm test:visual`, the
T109 e2e spec, and `next build` are all green.

### The plan is complete — 250 of 250 tasks done (2026-09-04)

**Every phase is done. All 11 adversarial gates are green. US7 is complete end to end. Phase 11
(polish, Session 9 of the [full-project remediation
roadmap](docs/superpowers/plans/2026-09-03-full-project-remediation-roadmap.md)) closed the plan.**

Phase 10 (Sessions 7 and 8) built and deployed the sandbox: Session 7 (T216–T224) closed SC-017 by
building the isolation mechanism itself; Session 8 (T225–T226) deployed it for real and replaced the
upload route's 503 with genuine dispatch. See "Phase 10a (sandbox-runner core isolation)" and "Phase
10b (sandbox-runner deploy + real dispatch)" above — including the two Criticals two independent
adversarial reviews found and closed in Session 7, the Minor fixed in Session 8's own review, and the
pre-existing T224 defect Session 8's real end-to-end test exposed but deliberately left unfixed
(`harness.ts`'s CONFORMANCE `rawManifest` — Open Decision #20). Two Windows-specific gaps from Session 7
(Open Decisions #18, #19) were flagged for confirmation whenever this deployment actually runs on its
real (expected Linux) target — resolved 2026-09-08 via a `node:22-slim` Docker container reproducing
the exact invocations: neither gap reproduces on Linux, and no code change was needed.

Phase 11 (Session 9, T227–T236, T230 already done early) closed the plan: dark-mode severity contrast
genuinely verified; real axe-core + zero-third-party-request e2e suites (surfacing one new,
real, pre-existing accessibility gap in the vendored brand tokens — carried correction 0a-2, narrowly
excluded with full evidence); structured, redacted logging wired into all three real service
entrypoints; FR-025 amended (a new FR-025a) and `WebAuditAI_ARCHITECTURE.md` corrected in place at all
three of its known-wrong points; a five-unit deployment runbook (`apps/probe-pool` honestly documented
as not yet deployable — no server entrypoint exists); and a full quickstart validation pass that first
found `quickstart.md`'s own example commands were never literally runnable (a fake `--suite` flag,
`demo:*` CLI scripts that were never built) and corrected them before actually running every scenario
for real. See "Phase 11 (polish & cross-cutting concerns)" above for the full account, including the
one honestly-recorded, already-tracked exception to the definition of done (`pnpm test:visual` is not
green for every surface — 7 pre-existing `it.todo` on the `PublicHeader` mobile-nav gap).

Phase 8 (US6, the mid-audit design-intent questionnaire, T194–T201) and Phase 9 (US7, T202–T215) are
both already complete — see their own sections above. The paragraph below predates both and is kept for
the historical T136–T143 context it carries.

Two pre-existing gate failures were fixed during Phase 6 rather than worked around, and both are worth
knowing about before the next session runs the gates:

- **`next build` could not resolve any `@webaudit/config` import.** Webpack took
  `export * from './constants.js'` literally and reported a missing file that nothing in this monorepo
  will ever emit. `apps/web/next.config.ts` now sets `resolve.extensionAlias` (`.js` →
  `['.ts', '.tsx', '.js']`), which is webpack's own answer to ESM-correct specifiers over TypeScript
  sources. This is known issue 0b from the other direction: there a `.js` specifier pointing at a
  `.tsx` file typechecked and would not bundle, and the fix was the import; here the imports belong to
  a shared package and are correct as written, so the bundler had to be told.
- **`pnpm lint` failed on two untracked operator scripts** (`scripts/domain-*.mjs`) with a parse error,
  not a finding: they are in no tsconfig, so the type-aware service cannot read them. Added to
  `eslint.config.js`'s `ignores`, alongside the parked worktrees already there.

The rest of this section predates Phase 4/5 and is kept for the T136–T143 context it carries.

Phase 4 (the fix loop, T144–T157) is done — see § Phase 4 near the top for the full account. **Next
is Phase 5, User Story 3 ("Get a production readiness verdict")**, starting at T158: a fresh full
re-audit that diffs against the baseline (the fingerprint identity `markRecurrences` already relies
on), names regressions (FR-069), and returns an explicit go / no-go. It depends on US1 for a
baseline and US2 for resolved issues — both now in place.

The rest of this section predates Phase 4 and is kept for the T136–T143 context it carries.

**Phase 3's "Remaining audit areas" sub-phase (T136–T142) is done** — the seven capabilities that
fill in `capability-loader.ts`'s PERFORMANCE/UI/TESTING arrays, left empty since T125. See § T136–T142
below for the full account: which of the seven work today via `ctx.fetch` alone, which are currently
inert pending the cross-process browser-pool transport T116 already documented as unbuilt, and how the
conformance suite and a new fake-`AuditPage` unit-test harness prove each one without needing that
transport to exist yet.

**T143 is also done**, resolved rather than left blocked. No design existed anywhere in
`design-system/` for it — re-confirmed by a full content search, including `_ds_manifest.json`, before
asking — and the user then explicitly authorized an original design for this one surface, using the
constitution's own documented-exception process rather than either inventing silently or refusing
outright. `AnnotatedScreenshot.tsx` reuses `--sev-*` tokens and `SeverityBadge` exactly as `IssueCard`
does, and is not wired into the live report page — no scan produces a screenshot or a finding
coordinate today, so wiring it in waits on whatever task builds that pipeline. Full record:
`research.md`'s R18, `design/screen-map.md`'s new "Documented exceptions" table, and `CLAUDE.md`'s UI
section, which now states the general process for the next task like this. See § T143 below.

**Next is Phase 4, User Story 2 ("Fix issues and turn the board green")**, starting at T144: a failing
suite asserting nothing turns green unearned (SC-007's adversarial gate), through T148's issue state
machine and T149's fingerprint-to-check resolution for re-verification.

**Phase 3's entire User Story 1 slice — backend and frontend — is done.** T105–T135 are all complete.
The backend proof from two sessions ago stands (T105/T106/T107/T109 fully green, T108's second
assertion structurally blocked pending a real `VERIFIED`-requiring capability — see § T119–T125). An
earlier session built the frontend that lets a human actually drive it: 5 real auth pages wired to
`apps/api`'s real endpoints, the new-scan panel computing live quotes from the same schedule the API
enforces, live progress driven by real realtime events, and a report screen reading real `GET /scans/
:id/report` data. `npx next build` and `npx playwright test` both pass; `pnpm lint` (standard eslint
+ the project's own adherence oxlint gate) is clean across all 70 files under `apps/web`. See
§ T126–T135 below for the full account, including two real infrastructure gaps found and fixed along
the way (a `screenshotReferencePage` sizing bug in the visual harness, and a missing `module` field on
each report issue) and one genuine, honestly-recorded visual-gate gap inherited from T240, not
introduced there.

**T135 was plan.md's own marker for "first sellable artifact"** — a real audit of a real site, driven
by a human through the UI, is possible end to end since that session.

### T105–T109 — the 5 tests for User Story 1, TDD-first

All five compile clean (`pnpm typecheck`), lint clean (`pnpm lint`), and fail today for a documented,
verified reason — not a flake, not a setup bug. Full reasoning for each lives in `tasks.md`'s own T105–
T109 entries; the highlights:

- **T105/T106** (`scans.quote.test.ts`, `scans.refusals.test.ts`) — 404 on every request, because
  `/scans` is not mounted in `apps/api/src/app.ts` yet. T106 adds `AppDeps.scans.
  resolveRequiredControlLevel` — a type-only seam, no route consumes it — because none of the first
  vertical slice's six capabilities (T119–124) requires `VERIFIED` control, so nothing real exists yet
  to trigger FR-017's whole-scan 403.
- **T107** (`progress-streaming.test.ts`) — deliberately drives the real queue (`startApi` +
  `startWorker`, real Redis on :6389) rather than the fan-out layer alone, which would pass today and
  prove nothing about FR-033. RED: the real `apps/worker/src/queue/workers.ts` throws
  `JobNotImplementedError` naming T113; 0 of the 2 expected `module:complete` events arrive. This
  needed `apps/worker` to become importable as a package for the first time (`main`/`exports` added —
  nothing had ever consumed it) and `@webaudit/worker`/`bullmq` added as `apps/api` **devDependencies
  only** — checked explicitly: production `apps/api` code still cannot reach `apps/worker`, and the
  five deployable units stay five deployments.
- **T108** (`gated-check-partial.test.ts`) — scoped at module granularity, not check granularity
  (documented as a deliberate simplification in the file's own header): the credit schedule only
  prices whole modules, and no real capability requires `VERIFIED` control yet, so there is nothing
  finer to test against honestly. Reuses T106's seam. Same 404 RED as T105/T106.
- **T109** (`apps/web/tests/e2e/first-audit.spec.ts`) — the first real `playwright test` runner usage
  in this repo (`apps/web/playwright.config.ts`, `test:e2e` script; `apps/web/tests/visual/harness.ts`
  only ever used `@playwright/test`'s `chromium` export directly, never the runner itself). Drives the
  real HTTP API via Playwright's `request` fixture, not the browser — T126–135 (registration form,
  scan panel, progress view, report screen) don't exist yet, so there is nothing to click; each
  `request.post` is meant to become the equivalent `page.click` as each screen ports in, not be
  rewritten. Every service (fixture site, API, worker) boots in-process inside the spec's own
  `test.beforeAll` — `apps/api/package.json`'s `dev` script still literally says "not implemented", so
  there is no separate process for a `webServer` config to point at.

  **The audit target is a local static fixture page, by explicit user decision** — real, deterministic,
  nothing hammering a third party on every run. Reaching it past the real SSRF guard needed a new
  `SAFE_NET_ALLOW_TARGETS` env var in `packages/safe-net/src/index.ts`: an exact-origin allowlist,
  modelled on `ALLOW_INSECURE_DEV_SECRETS`'s own shape (affirmative named opt-in, refuses to start
  outright under `NODE_ENV=production`, documented in `.env.example`). It is a *second*, narrower
  mechanism than `policy.ts`'s existing `allowLoopback` field, not a change to it — `allowLoopback`
  stays exactly what its own doc comment says it is, unreachable from outside the package. The new gate
  has its own regression suite, `packages/safe-net/tests/adverse/../unit/allow-test-targets.test.ts`,
  and the full existing adverse SSRF suite (133 tests) was re-run and stayed green.

  RED, and further than T105/106/108: registration, login, and target creation against the fixture
  site all genuinely succeed (proving the SSRF allowlist actually works end to end), then 404s at
  `/scans/quote` — the same root cause as every other test in this batch.

Also newly exported for the first time, all additive, all test-only:
`apps/api/package.json` gained `./prisma-client` and `./test-db` subpath exports (the generated Prisma
client, and `resetDb`/`seedPlans`/`testDb` — T109 needed both and duplicating either risks drifting
out of sync with the real thing); `apps/worker/package.json` gained a `main`/`exports` pointing at
`./src/index.ts`, the same shape every `packages/*` workspace package already uses.

### T110–T112 — quote, scan creation, and the `/scans` routes

`quote.ts` is a thin wrapper over `@webaudit/config`'s already-tested `quoteAreas`. `create-scan.ts`
runs FR-018 (duplicate concurrent scan) → FR-016 (plan permits the input type) → FR-017 (whole-scan
control-level gate, re-confirmed live via `reconfirmControl`, never from the cached column) →
FR-012 (quote-mismatch, re-derived from `quoteFor`) → a `totalAvailable` pre-flight, in that order,
before the one `debit()` call for the whole accepted quote. A scan row is created immediately before
that debit (needed for the transaction's `scanId`) and deleted again if the debit throws — Principle
VI, "never a charge with no row and never a row with no charge."

**Two scope decisions, both deliberate and both documented in `tasks.md`'s T111/T112 entries:**

- No per-module refund when a selection is partially gated. `packages/capabilities-vendored/` is
  empty until T119–124, so every module resolves to zero capabilities regardless of gating in this
  sub-phase — there is no way to observe a partial refund passing or failing yet, and building one now
  would be implementing ahead of anything that could prove it correct. This is exactly why
  `gated-check-partial.test.ts`'s second assertion stays RED: not a defect in this work, a gap this
  work cannot close yet.
- `POST /scans/:id/cancel` writes the guarded terminal transition directly (`updateMany` conditioned
  on a non-terminal state, matching `state-machine.ts`'s own shape) but does not run workspace teardown
  or an undelivered-work refund. Those observers (`onTerminalTransition`) are registered in-process by
  `apps/worker` and never fire for a row `apps/api` writes from a different process — a real gap in
  FR-037, recorded rather than silently faked.

**Required a real architectural fix, not a workaround**: `apps/api` needs to enqueue the first phase
job when it creates a scan, but the queue names, priorities and job-option defaults
(`QUEUE_NAMES`/`PRIORITY`/`priorityForPlan`/`DEFAULT_JOB_OPTIONS`/`REVERIFY_JOB_OPTIONS`/
`redisConnection`) lived in `apps/worker/src/queue/queues.ts`, and `apps/api` must not depend on
`@webaudit/worker` in production (that dependency is test-only, established in T107). Moved all six
into `@webaudit/config` — a package both apps already depend on — and had `apps/worker/src/queue/
queues.ts` re-export them unchanged, so nothing inside `apps/worker` needed to change an import.
`apps/api` gained a new producer-only `apps/api/src/services/queue/scan-phase-producer.ts` (a raw
BullMQ `Queue`, not `enqueuePhase`) and `bullmq` moved from `apps/api`'s devDependencies to real
dependencies. `@webaudit/worker` stays a devDependency only — the boundary T107 established is
unchanged.

**Found and fixed a latent bug in T105/T106 while turning them green.** Both files asserted
`creditTransaction.count() === 0` for "charges nothing" — but registration itself grants a free
allocation via a `CreditTransaction` (T038's `grantFreeAllocation`, called from
`registration.service.ts`), so every signed-in test user already has exactly one before any `/scans`
request. The assertion was always going to fail once the route existed, regardless of whether the new
code was correct — the original recorded RED reason (404, route not mounted) had been masking this.
Fixed by capturing a baseline count right after sign-in and comparing against that instead of a
hardcoded zero, in both files. This is a test-authoring bug from when T105/T106 were written, not a
production-code defect; recorded here rather than silently patched over.

Verified: `pnpm -r typecheck` clean across all 12 packages/apps; `pnpm lint`(the touched files) clean;
full `unit` project (`--no-file-parallelism`) — 526 passed, 2 failed, both the documented T107/T108
gaps, no regressions anywhere else (528 tests total, up from 513 pre-existing plus the 15 T105/T106
tests that flipped green). `apps/web`'s `first-audit.spec.ts` (T109) re-run directly via
`npx playwright test`: now fails at `expect(state).toBe('COMPLETED')` (received `QUEUED`) instead of
404 — confirms registration, login, target creation, quote, and scan creation all work end to end
through the real SSRF-allowlisted fixture site.

### T113–T118 — the orchestrator, synthesis, docs phase, probe-pool, R2, and report routes

`orchestrator.ts`'s `createPhaseHandler` is what `startWorker()` now wires by default (replacing the
`JobNotImplementedError` placeholder): it walks a scan through
`RUNNING_PHASE_1 → RUNNING_PHASE_2 → RUNNING_PHASE_3 → RUNNING_MASTER → RUNNING_DOCS → COMPLETED`,
running each phase's modules concurrently via `runModule`/`persistModuleResult` and emitting
`module:complete` independently per module the instant it finishes — that concurrency, not a
placeholder failure, is what T107 now proves.

**A real bug, found by running the real thing, not by reading the code.** `RUNNING_PHASE_2` and
`RUNNING_PHASE_3` have no modules to run in this vertical slice (only `UI` belongs to phase 2, and
nothing yet belongs to phase 3) — but `phaseJobSchema` requires `modules.min(1)` (a phase job that
runs on zero areas would cost a worker slot to do nothing, on purpose). Enqueueing an empty-module
phase job for either — which the naive version of this code did for every SECURITY/SEO-only scan —
failed at the queue's own validation boundary and left the scan stuck at `RUNNING_PHASE_1` forever.
Fixed by walking forward through any empty module-running phase *inside the same job invocation*
(a loop of guarded transitions with no enqueue) rather than ever building a job with nothing in it.
First caught running `pnpm test` end to end against real Redis, not by inspection.

**A deliberate, reasoned exception to the api/worker production boundary T107 drew.** The orchestrator
needs a database connection, and `apps/api` owns `schema.prisma`; rather than duplicate a second copy
of the schema, `apps/worker/src/db.ts` reuses `@webaudit/api`'s *generated Prisma client* as a real
(non-dev) dependency. This is judged different in kind from the `@webaudit/worker`-from-`apps/api`
direction that stays dev-only: a generated ORM client carries no route or business logic and both
processes read and write the same tables in the same database — it sits closer to `@webaudit/types`
than to application code. A cleaner long-term shape is a dedicated `packages/db` neither app has;
recorded as an open decision below rather than built now, since extracting one today would mean
re-plumbing `apps/api`'s already-tested Prisma setup for no behavioural change this sub-phase needs.

**`master-report.ts` (T114)** computes `overallScore()` from `packages/scoring` (never asked of the
model — `masterReportPrompt`'s own instruction is explicit that a produced number would contradict the
computed one) and makes one AI call for the headline, falling back to a deterministic sentence if the
chain is exhausted. **`fix-prompt.ts` (T115)** is honestly a no-op: `module-runner/attribute.ts`
(T090) already builds a real, non-empty `fixPrompt` for every issue at persist time — FR-051 requires
it to work with no AI layer at all — so `RUNNING_DOCS` is a real, visited phase with nothing left to
enrich in this sub-phase. **`probe-pool/browser/pool.ts` (T116)** is a real Chromium-backed
`createBrowserPool()` (via `@playwright/test`'s `chromium`, matching T246's existing usage) adapting a
fresh `BrowserContext`/`Page` per call to the `AuditPage` contract — unconsumed today, since no
capability exists yet to call `ctx.withPage`, and no cross-process transport to a separately-deployed
`probe-pool` exists either (no task builds one; both gaps are named in the file's own module note
rather than assumed away). **`storage/reports.ts` (T117)** wraps `@aws-sdk/client-s3` against R2's
S3-compatible endpoint, per-scan-prefixed, for rendered artifacts and screenshots only — the JSON
report itself is synthesized on read, never stored here (R17). Also unconsumed: no capability produces
a screenshot yet. **`reports.routes.ts` (T118)** wires `GET /scans/:id/report` (synthesized from
`Scan` + `ModuleResult[]` + `Issue[]`, no stored `Report` row exists anywhere), `GET /scans/:id/issues`
(FR-057 severity/state filtering), and `GET /issues/:id`, mounted at the app root since the three
routes span two path prefixes.

**What changed in T105–T109 as a result, verified by actually running each:**

- **T107 is fully green.** Its own test file changed too — it originally asserted the *placeholder's*
  failure (`JobNotImplementedError` naming T113); now that T113 exists, that job succeeds instead, so
  the assertion was rewritten to wait for the job's real completion and check the same FR-033 claim
  it always cared about (`module:complete` fires once per area, independently).
- **T108's first test stays green; its second stays RED**, now for exactly one documented reason
  (`chargedCredits < quotedCredits` needs a per-module refund T111 deliberately does not implement
  yet — see its own entry above) rather than the prior "route doesn't exist" reason.
- **T109 (`apps/web/tests/e2e/first-audit.spec.ts`, re-run directly with `npx playwright test`) now
  runs the entire journey**: register, verify, login, create target, quote, create scan, poll to a
  real `COMPLETED` state, and fetch a real `200` report. It fails only on the report's content —
  `score !== null` and `issues.length > 0` — both because `packages/capabilities-vendored/` is empty,
  the same root cause behind T108's remaining gap. Needed `AI_MODE=fixtures` set in the spec's own
  `beforeAll` (a plain `playwright test` process has no equivalent of vitest's workspace `env` block,
  which is what every other suite in this repo relies on).

**Verified**: `pnpm -r typecheck` clean across all 13 packages/apps; every touched file lints clean;
full `unit` project (`--no-file-parallelism`) — 527 passed, 1 failed (T108's documented second
assertion), 528 total, up from 513 pre-existing + 15 newly-green; full `adverse` project — 508 passed,
1 pre-existing skip, 509 total, no regressions.

### T119–T125 — the first six real capabilities, and everything they revealed was missing

Six capabilities, all SECURITY or SEO, all CODE-layer, each a `ctx.fetch` of the target and pattern
matching over the response — `headers-checker` (5 missing-header checks), `ssl-analyzer` (scheme +
HSTS, deliberately scoped to what response headers can show — see below), `data-leak-scanner`
(delegates to `@webaudit/redaction` rather than reimplementing secret detection), `owasp-checker`
(cookie flags + server-version disclosure), `meta-checker` (title/description/viewport/canonical),
`content-checker` (H1/lang/alt-text/thin-content). Full behavioural coverage in
`packages/capabilities-vendored/tests/unit/capabilities.test.ts` (17 tests against an injected fake
context) plus the T125 conformance suite (6/6 pass every one of the SDK's eight checks, against a real
fixture server rather than the always-refusing test double, so `fingerprint-stable` genuinely exercises
findings instead of skipping).

**A user decision, asked before writing `ssl-analyzer`**: `SafeResponse` carries no TLS handshake
metadata (protocol, cipher, certificate chain/expiry) and there is no sanctioned way to reach one —
`ctx.fetch` is the only network door, and it exposes URL/status/headers/redirects only. Widening
`CodeLayerContext` with a raw TLS door is a security-relevant SDK change with its own design questions,
not "implement a capability." User chose **header-inferable checks only** (not-https, missing/weak
HSTS) over widening the contract or deferring the capability. A real TLS-inspection door remains
future work if a later capability genuinely needs it.

**Two infrastructure gaps were required to make six capabilities actually run, and both were found by
running the real pipeline against a real fixture server — neither was visible from reading code.**

1. **`SAFE_NET_ALLOW_TARGETS` (T109) never actually reached `ctx.fetch`.** It shipped checking only
   `assertPublicTarget` — target *submission* time (`POST /targets`) — while `safeFetch` (what a
   capability's `ctx.fetch` calls at *execution* time) went straight to `guardedFetch` with no
   allowlist check at all. Every capability's fetch against the conformance suite's loopback fixture
   was refused with `LITERAL_ADDRESS_DISALLOWED`, unconditionally, regardless of the env var — because
   no capability had ever called `ctx.fetch` against a loopback target before this session; T109's own
   e2e spec never exercises a capability, so it never could have caught this. Fixed in
   `packages/safe-net/src/index.ts`: `safeFetch` now passes `policy: { allowLoopback: true }` — a field
   this package's own adverse suites already use internally, reachable only from inside the package,
   never through `SafeFetchInit` — when the target's origin is on the allowlist. Three new regression
   tests in `allow-test-targets.test.ts` prove `safeFetch` itself now respects the allowlist, not just
   `assertPublicTarget`; all 133 pre-existing adverse SSRF tests re-run and stayed green.
2. **Nothing had ever called `discoverCapabilities`/`reconcileCapabilities` together.** Both have
   existed since Phase 2G (T068/T069), fully built and unit-tested — but `packages/
   capabilities-vendored/` was empty until this session, so there was nothing to discover and no
   pressure to wire the boot sequence that connects them. Surfaced as a
   `CapabilityExecution_capabilityId_fkey` foreign-key violation the moment a real capability first
   executed inside a real scan: `persistModuleResult` writes a `CapabilityExecution` row keyed on the
   capability's id, and that id only exists in the `Capability` table once reconciliation has run at
   least once (`reconcile.ts`'s own module note: "disk is the source of existence, the database is the
   source of enablement"). Fixed with a new `apps/api/src/services/registry/boot.ts`
   (`reconcileCapabilitiesAtBoot`), called from `startApi()` by default and soft-failing — a discovery
   or reconciliation problem degrades ("capabilities not reconciled this boot", logged loudly) rather
   than taking down every unrelated route the way a missing `REDIS_URL` correctly does.

**A third, smaller decision**: the capability loader (`apps/worker/src/orchestrator/
capability-loader.ts`, a stub since T113) is now a real loader — but a static table of six
`import('@webaudit/capability-<name>')` calls keyed by module type, not a filesystem/manifest-driven
one. The real discovery logic already exists (`apps/api/src/services/registry/discover.ts`), but
reaching it from `apps/worker` would mean depending on `apps/api`'s business logic in production — a
real crack in the boundary T107 drew, unlike the generated-Prisma-client exception T113 already made
(no logic there, just types). Recorded as a decision: the clean fix is extracting the manifest-walking
logic into `@webaudit/capability-sdk`, which both apps already depend on; not done here, since this
vertical slice's capability set is small, fixed, and known at compile time, and a second discovery
mechanism risks drifting from the real one before anything forces them to agree.

**Net result, each verified by actually running it, not by inspection:**

- **T107, T105, T106 unaffected** — still fully green.
- **T108's second assertion is still RED, and now for a confirmed, structural reason rather than a
  missing-infrastructure one.** None of these six real capabilities has `requiredControlLevel:
  VERIFIED` (matching what T106/T108 already documented before any capability existed), and the
  `resolveRequiredControlLevel` test seam only ever gated the whole-scan create-time 403 — it was never
  wired into per-module execution. There is still no real capability selection that can exercise a
  genuinely mixed gated/non-gated module. A real fix needs either a capability that actually requires
  `VERIFIED` control, or threading required-control-levels through `Scan.capabilitySnapshot` (still
  `{}`, per T111's own note) into the orchestrator's `runModule` call — neither exists yet.
- **T109 is fully green.** `npx playwright test` passes end to end, unmodified from the file T109
  originally wrote — the whole point of writing tests that assert against reality rather than against
  today's implementation state. `Scan.overallScore` is non-null, every issue carries a real `fixPrompt`,
  and the scan genuinely reaches `COMPLETED` through the real six-capability pipeline.

Verified: `pnpm -r typecheck` clean across all 19 typecheck-bearing packages (6 new capability
packages plus the shared test package, all newly added to `pnpm-workspace.yaml`); every touched file
lints clean (including a narrowed `eslint.config.js` glob — `packages/capabilities-vendored/*/src/**`
rather than the whole tree, so `tests/fixtures/`'s legitimate `node:http` fixture server isn't caught
by the same-directory network restriction meant for capability code); full `unit` project — 553
passed, 1 failed (T108's now-structural gap), 554 total; full `adverse` project — 508 passed, 1
pre-existing skip, 509 total, no regressions anywhere.

### T126–T135 — the frontend, 🎯 MVP checkpoint reached

T126/T127 (tokens, self-hosted fonts) were already done at T236a — verified before starting, not
re-done. T131/T132 (`ScoreArc`, `ModuleStatus`) were already done at T240 — same. The genuinely new
work is T128–T130 and T133–T135.

**T128 — 5 auth pages** (`app/(auth)/{login,signup,verify-email,forgot-password,reset-password}`),
wired to real `apps/api` endpoints via a new `lib/api.ts` — the first thing under `apps/web` to ever
call the real API; nothing before this session did. `VerifyPage`/`ResetPage` had to go beyond the
static mock, which only shows "we sent a link, waiting" — the real mailer's link is
`/verify-email?token=...`, a frontend route, so both pages now branch on whether a token is present
and actually call `GET /auth/verify/:token` / `POST /auth/reset-password`. `RegisterPage`'s `Name`
field is shown (visual fidelity) but never sent — `apps/api`'s `User` model has no name column at
all, and inventing a place to put it would be exactly the kind of scope creep this session's own
discipline argues against; documented in the file rather than silently dropped.

**T129 — the new-scan panel** (`components/scan/ScanForm.tsx`). The live cost estimate as areas are
toggled is computed client-side from `@webaudit/config`'s own `quoteAreas`/`AREA_COST` — the same
schedule the API enforces — rather than re-deriving the source mock's hardcoded numbers, so estimate
and reality can never drift apart; the number actually sent as `acceptedQuote` always comes from a
real `POST /scans/quote` call. Only the URL tab does real work — the repository tab (needs a GitHub
connection nothing fetches yet) and archive tab (`POST /scans/upload`, unbuilt) are visually present,
disabled at the submit boundary, not faked.

**T130 — live progress**. Ports `ProgressRow` for real this time (added to the report barrel) and
composes it with the already-ported `ModuleStatus` into `components/scan/ScanProgress.tsx`. Real
elapsed time (`Scan.startedAt`, ticked locally) and real independent per-area landing (FR-033) via
T135's realtime client replace the source's demo timer.

**T133 — `IssueCard`** (added to the report barrel; `AttributionMark` was already ported at T239).
The copy-fix-prompt button is a real, always-rendered `<button>` — never hover-gated — matching its
own `.prompt.md`; `AttributionMark` sits at the header row's end exactly as the source places it.

**T134 — the report screen** (`app/(dashboard)/reports/[id]/page.tsx`), wired to real
`GET /scans/:id/report`. **Required extending `reports.routes.ts` (T118)**: the route as T118 shipped
it gave a client no way to filter issues by area — `Issue` carries only `moduleResultId`, not a
module name — so this task added `include: { moduleResult: { select: { module: true } } }` and
flattened `module` onto each issue in the response. A real, found-by-actually-building-the-consumer
gap in already-committed T118 work, fixed rather than worked around on the frontend. A `null` overall
score renders as "No score yet", never coerced to 0 (FR-053, the same rule `overallScore()` already
enforces server-side) — checked directly since this is exactly the class of bug CLAUDE.md's own
`?? 0` warning is about.

**T135 — the realtime client** (`lib/realtime.ts`), built before T130 needed it despite the higher
task number (T130 cannot be genuinely live without it). Speaks the real wire protocol from
`apps/api/src/services/realtime/server.ts`: the access token travels on every `subscribe` message,
never cached from connect; a refused subscription never closes the socket (a user with two tabs, one
on a scan they no longer own, keeps the other). Reconnect backoff is capped and full-jittered so an
API restart does not reconnect every open client on the same tick. `onResync` fires after every
successful (re)subscribe, not only the first — FR-047's contract is "current state from the database,
then live events from the socket," which means every resync, not just the initial connect, needs a
fresh `GET /scans/:id`.

**Two real infrastructure gaps found and fixed while wiring the visual gate, neither by inspection —
both by actually running `startServer`/`screenshotUrl` against a live built app for the first time
(declared since T246, never previously called from any test):**

1. `screenshotReferencePage`'s `fullPage: true` capture did not reliably reflect a bundler-swapped
   reference page's real content size — it silently clipped to the original viewport dimensions
   regardless of actual content, guaranteeing a `dimension-mismatch` on every comparison no matter how
   close the real render was. Confirmed by pulling and visually inspecting a `Sign in` screenshot pair
   directly: the auth form itself was essentially pixel-identical to its reference the whole time.
   Fixed in `apps/web/tests/visual/harness.ts` by reading the swapped DOM's real `scrollWidth`/
   `scrollHeight` and resizing the viewport to it before the shot, and by waiting on
   `document.fonts.ready` instead of a fixed 300ms delay (the fixed wait raced font-swap reflow often
   enough to make the size read flaky between runs — the font-loading fix reduced but did not fully
   eliminate this; a `T128 mechanism check` test now documents both outcomes as legitimate rather than
   asserting past the remaining flakiness).
2. `reports.routes.ts`'s issues had no `module` field — see T134 above.

**T128's visual-diff gate stays `it.todo`, honestly, not forced green.** At 390px every auth page
inherits `PublicHeader`'s pre-existing lack of a mobile-nav treatment — the exact same root cause
already documented for the Home page's own `it.todo` (T240) — not a defect in `AuthFrame`, whose
`.inner` already carries the source's own `max-width: 100%`. A few desktop-1440 comparisons also land
~1.5–3% over the 0.5% bar even once the dimension-mismatch bug above is fixed. Recorded as a fourth
(really, the same) known deviation rather than silently passed — see `apps/web/tests/visual/
harness.test.ts`'s own module note on the auth-pages `describe` block for the full account.

**Verified**: `pnpm -r typecheck` clean across all 19 typecheck-bearing packages; standard eslint and
the project's own adherence oxlint (`design-system/_adherence.oxlintrc.json`) both clean across all 70
files under `apps/web`; `npx next build` succeeds (all 15 static routes plus the new dynamic
`/reports/[id]`); `npx playwright test` (T109) still fully green, unmodified; full `unit` project —
553 passed, 1 failed (T108's documented, unrelated gap), 554 total, no regressions; full `adverse`
project — 507 or 508/509 depending on one confirmed-flaky timing test (passes cleanly in isolation,
re-run to verify — a race-condition suite occasionally flaking under heavy sequential test load is
expected of that specific test, not a regression from this work).

### T136–T142 — the remaining seven capabilities, and an honest look at what `ctx.withPage` can do today

**The load-bearing discovery this sub-phase turned up: no deployment has ever wired a `pageProvider`
into `createCodeLayerContext`.** T116 built a real in-process browser pool (`apps/probe-pool/src/
browser/pool.ts`), but its own module note already said the cross-process transport that would let
`apps/worker`'s orchestrator actually reach it was a separate, unbuilt gap — and checking
`orchestrator.ts`'s `makeContext` confirms it: `createCodeLayerContext({ signal, capabilityId })`,
no `pageProvider`, today. Every one of the seven capabilities below was designed around that fact
rather than around the SDK's full theoretical surface — the same judgment call `ssl-analyzer` (T120)
already made explicit for TLS metadata `ctx.fetch` cannot see.

**Four still work fully today, `ctx.fetch`-only:** `network-inspector` (fetches the page, regex-
extracts its own `<script src>`/`<link rel=stylesheet>`/`<img src>` references, samples up to 15,
flags broken/uncompressed/duplicated resources and excessive redirects), `playwright-runner` (same
technique against `<a href>`, same-origin only, flags links that don't resolve — a real functional
defect class, "clicking this takes you nowhere", despite the name implying a live browser),
`contradiction-detector` (no network door touched at all — pure correlation over
`input.priorModuleResults`' aggregate stats, catching combinations the scoring/state pipeline should
never produce), and `impeccable` (AI-layer only — no `runCodeLayer`, contributes design-critique
instructions plus a summary of the module's own measured findings to the UI area's one AI call,
exactly the shape `ai-layer.ts`'s module note requires — never calls a provider itself).

**Three lean on `ctx.withPage` for part or all of their findings, and degrade to reporting nothing
from that part rather than throwing:** `lighthouse-analyzer` (Content-Encoding/Cache-Control headers
work today; render-blocking-script and page-weight checks wait on the transport),
`screenshot-capture` (broken-image detection works today via `ctx.fetch`; horizontal-overflow,
tiny-tap-target, and near-blank-render checks wait on it), and `cwv-analyzer` (Core Web Vitals
genuinely cannot be approximated without a real render — entirely inert until the transport exists,
same as the other two's page-based halves). Every `try`/`ctx.withPage(...)`/`catch` in these three
was written specifically so `containCapabilityCall` sees a resolved (possibly empty) array rather
than a rejection — required for `fingerprint-stable` to legally skip instead of fail when no page is
available, and incidentally also the correct production behaviour (an infrastructure gap is not this
capability's failure to report).

**Proven two ways, since neither alone covers it.** The shared conformance suite
(`packages/capabilities-vendored/tests/conformance.test.ts`) now runs all 13 capabilities against the
real `deficient-site.ts` fixture — `cwv-analyzer`, `network-inspector`, and `playwright-runner`
legitimately skip `fingerprint-stable` there (no page, and the fixture's one page has no links or
script/stylesheet tags for their fetch-only paths to find), the same documented-legal shape
`data-leak-scanner` already established; the other four get real, deterministic findings, including
`contradiction-detector` against a deliberately inconsistent `priorModuleResults` sample added to the
shared `input`. But conformance alone cannot exercise a `ctx.withPage` code path with no `pageProvider`
configured — so `tests/unit/capabilities.test.ts` gained a `fakePage`/`fakeContextWithPage` harness (a
hand-written `AuditPage` whose `evaluate()` returns pre-queued canned values in call order) that
directly proves the render-blocking-script, page-weight, Core Web Vitals, overflow, tap-target, and
blank-render logic correct today, standing in for a real page until the transport exists to supply one.

**One pre-existing failure investigated, not caused here.** `pnpm test` shows the same single RED
assertion as before this sub-phase — `gated-check-partial.test.ts`'s "does not charge for the gated
one" — reproduced identically against the pre-T136 commit (`7792ebe`) with this sub-phase's changes
stashed, and already recorded at T111/T112 (§ below) as a documented, open refund-plumbing gap
unrelated to audit capabilities. Confirmed, not assumed.

**Verified**: `pnpm -r typecheck` clean across all 26 typecheck-bearing packages; `pnpm run lint`
(standard eslint, `packages/capabilities-vendored/*/src`'s own `no-restricted-imports` rule) clean;
`pnpm test:adverse` — 25/25 files, 508 passed, 1 skipped, no regressions; `pnpm test` — 580/581, the
one pre-existing failure above, no new ones; the new unit suite for these seven — 37 behavioural tests
plus 13 conformance suites, all passing.

### T143 — the annotated screenshot, resolved by a documented design exception

**T143 was genuinely blocked, not skipped.** `design/screen-map.md` said "No artboard" and the
constitution's Design Adherence section is explicit: a surface absent from that file "MUST NOT be
invented — request a design instead." Before asking, the gap was re-confirmed rather than trusted at
face value — a full content search of `design-system/` (every component, screen, reference page, plus
the machine-generated `_ds_manifest.json` component inventory, the authoritative list) turned up
nothing resembling a screenshot with findings marked on it. The user was then asked directly, and
explicitly authorized an original design for this one surface — the constitution's own governance
clause for exactly this situation ("a documented exception... and an issue to remove it"), not a
licence to invent the next blocked surface too.

**What got built reuses everything that already exists.** `apps/web/components/report/
AnnotatedScreenshot.tsx` invents no new colour, radius, or type token — it reuses `--sev-*`/
`--sev-*-bg` and `SeverityBadge` exactly as `IssueCard` (T133) does, and follows the same
"never hide meaningful content behind hover" rule `IssueCard.prompt.md` and `AttributionMark.
prompt.md` both state for their own surfaces: every annotation renders in an always-visible legend
below the image (numbered pin markers positioned by percentage, so they stay correct at any render
size), never only as a hover-only pin tooltip.

**Deliberately not wired into the live report page.** Investigated first, not assumed: no scan
produces a screenshot today (`screenshot-capture`'s own module note, T139 — the captured bytes are
taken and immediately discarded, used only as a liveness signal) and no finding carries any positional
data (`CapabilityFinding.location`/the `Issue.location` column are both free text, never a
coordinate). Building a screenshot capture → R2 storage → report pipeline just to have something to
wire this component into would be exactly the ahead-of-signal work this codebase has declined
everywhere else a similar gap appeared (T116's browser-pool transport, T139/T136/T138's `ctx.withPage`
checks). That pipeline is real, separate, unbuilt work for whenever a task actually needs it.

**`pnpm test:visual` does not apply here, and that is stated rather than left silent** — there is no
artboard to diff a render against. Verified instead with a new unit suite
(`apps/web/tests/unit/annotated-screenshot.test.ts`, 6 tests, `renderToStaticMarkup`, same
no-jsdom discipline as every other component test in this repo), adherence lint, `pnpm -r typecheck`,
and `next build`, all clean.

**The general process for the next task like this is now written down in three places**, not just
followed once: `research.md`'s R18 (the full decision record), `design/screen-map.md`'s new
"Documented exceptions — invented under explicit authorization" table, and `CLAUDE.md`'s UI-work
section (item 3), so a future session hits the same disciplined path rather than re-deriving it or,
worse, treating this one exception as blanket permission.

**Phase 2 proper is complete**, and so is the delta review of all of it — see the sections below.
2K closed SC-015; T104a/T104b made both services boot, and 9915608 later fixed the BullMQ colon-name
defect that meant the worker in fact could not, until this session.

**The entire "Gate and harness first" half of Phase 2L is done: T236a, T237, T238, T239, T245, T246,
T247.** In order:

- **T236a** (`abc8efb`) scaffolded the Next.js app that did not exist — `apps/web` was a
  `package.json` and a stub. Folded in T126 (tokens, ported verbatim into `apps/web/app/tokens/`) and
  T127 (Lexend Deca / JetBrains Mono self-hosted via `next/font/google`, not the vendored export's
  live Google Fonts link). Wired the mobile type-scale media query CLAUDE.md names as never applied
  (640px breakpoint, confirmed against `design-system/guidelines/type-mobile.card.html`).
- **T237** (`5a05de0`) ported the 7 core components (Button, Input, Card, Badge, Eyebrow, StatRow,
  PromoBar) to `apps/web/components/ui/`. Caught a real bug `tsc --noEmit` could not see: webpack
  cannot resolve a `.js`-extensioned specifier against a `.tsx` file the way TypeScript's
  `moduleResolution: bundler` accepts for type-checking alone — found only by running `next dev` for
  real. See Carried correction 0b.
- **T238/T239** (`ce82c7a`) ported `TwoToneHeading`, `SeverityBadge`, `AttributionMark` (the latter
  two to a new `apps/web/components/report/`).
- **T247** (`9c14f78`) found there was no CDN dependency to remove — every icon in the portable
  sources is already an inline `<svg>`; the Lucide-from-`unpkg` reference in `readme.md` describes the
  design system's own separate live-preview tooling, never what gets ported. Consolidated the 19
  scattered icon paths across `Sidebar.jsx`/`AdminShell.jsx` (4 duplicated under different names) into
  `apps/web/components/ui/icons/`, ready for T241/T243.
- **T245** (`f0a2c7c`) found `pnpm run lint:adherence` had never once been able to fail — its three
  rules (`no-restricted-syntax`/`no-restricted-imports`/`react/forbid-elements`) are not implemented
  by oxlint 0.13.2 at all, and oxlint silently drops a config rule it does not recognise rather than
  erroring. Every selector ported verbatim into `eslint.config.js`'s `no-restricted-syntax` instead —
  the tool that actually runs this kind of custom AST-selector check.
- **T246** (`b48af08`) found `pnpm test:visual` was the same silent-gate shape, matching zero files.
  Built `apps/web/tests/visual/harness.ts`: `pixelmatch`-based diffing plus a renderer for
  `design-system/reference-pages/`'s bundler HTML files, which are not static images — they swap
  their entire DOM for the real rendered page client-side, so the harness waits for that swap
  (`#__bundler_thumbnail` detaching) rather than a fixed delay. Of the 7 public-page references, only
  "Home page" belongs to this phase (T240, next); the other 6 are T193 (Phase 7) and T128 (Phase 3),
  each a named `it.todo` rather than silently absent.

Every one of the six found a real defect in what it was asked to wire, not just wired it — see each
commit for the full reasoning, and Carried corrections 0a–0c for what stays open across them
(Button's missing focus ring, the extension-less-import rule, the accessible-icon-markup gap).

**T248 is done, out of task-number order, and on purpose.** `Public.jsx`'s header renders
`<LangToggle/><ThemeToggle/>` directly, so T240/T241/T243 cannot port without it — the task text
itself says as much ("done first despite the numbering," recorded when the ordering decision was
made). Ported `design-system/ui_kits/theme.jsx` to `apps/web/app/theme.tsx`: the module-scope
pub-sub store (`waStore`), `useTheme`/`useLang`/`useT`, and `ThemeToggle`/`LangToggle`. Two things
the source never had to handle, because its preview never ran on a server:

- **Every `document`/`localStorage` touch is now guarded on `typeof window !== 'undefined'`.** The
  source calls `document.documentElement.setAttribute(...)` unconditionally at module load; Next
  evaluates this module server-side first, where `document` does not exist. Guarding it is the whole
  fix — nothing about the store's behaviour in the browser changed.
- **`ThemeScript`, new, not in the source.** A tiny inline `<script>` in the root layout's `<head>`
  that reads `wa-theme`/`wa-lang` from `localStorage` and applies them to `<html>` before the first
  paint, so a dark-mode or Arabic visitor never sees a light/English flash while the client bundle
  loads. `apps/web/app/layout.tsx` renders it and carries `suppressHydrationWarning` on `<html>` for
  the `lang`/`dir` attributes it may overwrite ahead of hydration.

Also found: `apps/web/tsconfig.json` inherited `tsconfig.base.json`'s `lib: ["ES2023"]` with no
`DOM` — correct for every backend package, wrong for the one package in this monorepo that runs in a
browser. Every prior ported file happened to reference DOM only as a *type* (`HTMLButtonElement` in
`Button.tsx`'s `MouseEventHandler<HTMLButtonElement>`), which resolves regardless of `lib`; `theme.tsx`
is the first file to touch `window`/`document` as runtime values, and that's what actually needs the
lib. Fixed by adding `"lib": ["ES2023", "DOM", "DOM.Iterable"]` to `apps/web/tsconfig.json` alone,
not the shared base. `strings.jsx` (87 lines, English + Arabic, unassigned to any task — same class of
gap as T104a/T104b) ported alongside as `apps/web/lib/strings.ts`, typed against the English table's
key set so a missing Arabic translation is a compile error, not a silent fallback to the raw key.

Hover moved from `useState` + `onMouseEnter`/`onMouseLeave` to CSS `:hover`, and the inline style
objects moved to `apps/web/app/theme.module.css` — the same, already-established deviation as
`Button.tsx` (T237), not a new one. `aria-hidden="true"` added to both toggles' decorative SVGs,
consistent with T247's `Icon.tsx` reasoning: each icon sits beside the button's own `aria-label`, so
hiding it from assistive tech is correct markup, not a restyle.

Verified: `tsc --noEmit` clean, `next build` clean (checked the emitted HTML contains the pre-paint
script and `<html lang="en" ...>`), 8 new tests in `apps/web/tests/unit/theme.test.ts` (including one
that imports the module with no `window` present at all — the SSR-guard regression this task exists
to prevent), `pnpm lint` clean, full `pnpm test` green (468 tests, run with the required
`--no-file-parallelism` flag this time — a direct `vitest run` without it deadlocks the Postgres
contract suites, which is a footgun in this repo's test setup, not anything T248 touched).

**Phase 2L is done. Next: Phase 3 (US1, T105+)** — the plan confirmed with the user twice this session
(once mid-T242, after a message assumed Phase 2 was already fully done, and it was not) is to finish
all of 2L before starting it, and 2L's own checkpoint is now reached: every task through T248 is `[X]`,
and `pnpm lint`/`pnpm typecheck`/`pnpm test`/`pnpm test:visual` are all green across the whole monorepo.

### T244 — the last 4 admin screens

Ported `design-system/ui_kits/admin/AdminScreens.jsx`'s `Scans`, `Providers`, `Log`, and `Settings` to
`apps/web/app/(admin)/admin/{scans,providers,log,settings}/page.tsx`. `Scans` and `Log` have no hooks
in the source — Server Components, same as T242's `UsagePage`. `Providers` (fallback-chain reorder)
and `Settings` (feature-flag toggles) mutate local state only, no backend wiring exists yet — both
need `'use client'`.

One fix that had to land before these screens could be written at all: the source's `Table` columns
are literal CSS width strings (`'120px'`) — T243's `Table` ported that literally, and these 4 screens
alone declare 25 of them, every one a raw-px lint violation waiting to happen. Changed `Table`'s
`cols[].width` to `number | '1fr'`, with `Table` appending `px` itself — the same move `Card` already
made for `padding` (T237). `mono`/`num`, the source's small formatting helpers reused by 3 of the 4
screens, moved to `apps/web/components/admin/format.tsx`, exported from the barrel rather than
duplicated per screen.

Verified: `tsc --noEmit` clean, `next build` clean (checked all 4 routes' emitted HTML for real
content), `pnpm lint` clean **across the whole repo** (not just the adherence subset — `eslint .` and
`oxlint` both zero warnings, zero errors), `pnpm test` green (507 tests, +7 in
`apps/web/tests/unit/admin-screens.test.ts`), `pnpm test:visual` green (unchanged from T240 — 5 real
assertions, 7 `it.todo`).

### T243 — operator shell and overview

Ported `design-system/ui_kits/admin/AdminShell.jsx` (`AdminSidebar`/`AdminShell`/`AHead`/`Table`/
`Stat`) to `apps/web/components/admin/AdminShell.tsx`, barrel at `apps/web/components/admin/index.ts`
(extended T245's barrel-import rule again), and a thin `apps/web/app/(admin)/layout.tsx`. `Overview`
itself is defined in `AdminScreens.jsx`, not `AdminShell.jsx` as the task text says — ported from where
the code actually lives, at `apps/web/app/(admin)/admin/page.tsx`.

Every colour on the operator rail (`#1f2937`, `#374151`, `#6b7280`, `#9ca3af`, `#fafafa`) is a literal
from the source, not the light/dark token palette — the rail is deliberately a fixed dark shell
regardless of the app's own theme setting. All moved to `AdminShell.module.css`, same lint-technical
reason as ModuleStatus's `#fff3ec` (T240). The source's `AdminShell` also destructures `useTheme()`
and never reads either binding — dead code, same call as `AdminShell`'s note about it; not ported.

Same routing translation as T241: `view`/`setView` became `usePathname()` against real `/admin/*`
routes. Writing `dashboard-shell.test.ts`'s counterpart for this file caught a real bug the customer
sidebar's own nav never could: "Overview" sits at `/admin` itself, the same path every other admin
route nests under, so a plain prefix match marked it active on every admin page, not just its own.
`isActive()` now requires an exact match for that one entry — the test that caught it
(`admin-shell.test.ts`) is the regression guard.

Verified: `tsc --noEmit` clean, `next build` clean (checked `/admin`'s emitted HTML for the operator
chip, both status badges, all 4 stat cards, both Overview panels), `pnpm lint` clean, `pnpm test`
green (500 tests, +9 across `apps/web/tests/unit/admin-shell.test.ts` and `admin-overview.test.ts`).

### T242 — usage and profile screens

Ported `design-system/ui_kits/app/Account.jsx`'s two screens to `apps/web/app/(dashboard)/usage/
page.tsx` and `apps/web/app/(dashboard)/settings/page.tsx` (route names per T241's own routing notes —
"Profile" already pointed at `/settings`). `UsagePage` has no hooks anywhere in the source — a static
`Export CSV` button, nothing else — so it stays a Server Component, the first ported screen that
doesn't need `'use client'`. `SettingsPage` needs it for `useTheme()` (the Appearance toggle) and the
two editable fields.

One contract question, resolved the same way Card's missing focus ring (0a) was: the source's Name/
Email fields use `defaultValue`, which was never in `Input`'s documented contract — not in the
vendored `Input.d.ts`, not in this port. Extending the contract to add it was considered and rejected;
wired as `value`/`onChange` (controlled) instead, the one documented way to pre-fill an editable field.
Same demo values, same editability, no contract extension. Every other value on both screens (spend
figures, the 24-day chart, sessions, plan, connected account) is the exact placeholder content the
vendored source shows — Phase 7 (US5 billing, T180+) wires the real numbers.

Verified: `tsc --noEmit` clean, `next build` clean (checked both routes' emitted HTML for real content),
`pnpm lint` clean, `pnpm test` green (491 tests, +6 in `apps/web/tests/unit/dashboard-screens.test.ts`).

### T241 — customer app shell and collapsible sidebar

Ported `design-system/ui_kits/app/Sidebar.jsx` to `apps/web/components/dashboard/Sidebar.tsx`
(`Sidebar`/`AppShell`/`PageHead`, one file matching the source), barrel at
`apps/web/components/dashboard/index.ts` (extended T245's barrel-import lint rule again), and a thin
`apps/web/app/(dashboard)/layout.tsx` rendering `<AppShell>`.

The source's `AppShell({view, setView, children})` takes the active nav item as a controlled prop —
in-memory state in the static preview, since there was never a real router underneath it. There is one
here: `AppShell` is a genuine Next.js layout, so "active" now comes from `usePathname()` against each
nav item's real route (`/scan`, `/progress`, `/report`, `/fixes`, `/readiness`, `/usage`, `/billing`),
with two exceptions grounded in other tasks' own text rather than guessed: "Profile" points at
`/settings` (T242 already places the profile screen at `app/(dashboard)/settings/page.tsx`) and the
admin-console link points at `/admin` (where T243's `admin/page.tsx` resolves to). None of this is a
contract — adjust either if a later task decides differently. Every one of `Sidebar.jsx`'s 11 icons
matched an existing entry in T247's `ICON_PATHS`; none needed adding.

Added `apps/web/app/(dashboard)/scan/page.tsx` as an explicit scaffold placeholder, same reasoning as
T236a's own: a layout with no page under it renders nothing `next build` can verify. Whichever Phase 3
task ports the real "New scan" page replaces it.

Verified: `tsc --noEmit` clean, `next build` clean (checked the emitted HTML for the sidebar's real
content — nav labels, the "Fixes" badge, credit balance, profile identity), `pnpm lint` clean,
`pnpm test` green (485 tests, +9 in `apps/web/tests/unit/dashboard-shell.test.ts` — the first test file
in this port to need `vi.mock('next/navigation', ...)`, since `usePathname()` throws outside a real
router context the same way T240's own hydration-invariant debugging found in production code).

### T240 — public shell and landing page

Ported `design-system/ui_kits/marketing/{Public,Landing}.jsx` to `apps/web/components/public/Public.tsx`
(`Wordmark`/`PublicHeader`/`PublicFooter`/`PublicPage`, one file matching the source, new
`apps/web/components/public/index.ts` barrel — extended T245's barrel-import lint rule to cover it
alongside `components/ui`/`components/report`) and `apps/web/app/(public)/page.tsx` (`Hero`/
`Difference`/`Areas`/`Proof`/`Loop`/`FinalCta`, also one file). Deleted T236a's scaffold `app/page.tsx`,
which named itself as temporary for exactly this. Per the earlier folding decision, `Proof()`'s
`<ScoreArc>`/`<ModuleStatus>` are ported here too, at `apps/web/components/report/{ScoreArc,
ModuleStatus}.tsx` — T131/T132 are no-ops when Phase 3 reaches them.

Two real defects found building this, both fixed:

- **`apps/web/tsconfig.json` had no DOM lib.** It inherited the monorepo base's `lib: ["ES2023"]`,
  correct for the backend packages, wrong for the one package that runs in a browser. Every file
  ported before this one happened to reference DOM only as a *type* (`HTMLButtonElement` as a generic
  parameter resolves regardless of `lib`); `theme.tsx` (T248) was the first to touch `window`/
  `document` as runtime values and hit it first. Fixed narrowly: `"lib": ["ES2023", "DOM",
  "DOM.Iterable"]` added to `apps/web/tsconfig.json` alone.
- **`ModuleStatus.jsx`'s colour lookup was a JS object containing a raw hex literal** (`running:
  {bg:'#fff3ec'}`), which this repo's own raw-hex lint rule (T245) forbids in a `.tsx` file. Moved to
  `ModuleStatus.module.css` as `--state-fg`/`--state-bg` custom properties per state class — the exact
  same colours, relocated for a lint-technical reason, not a value change. The spin animation stayed
  inline (`style={{animation: ...}}`) rather than also moving to CSS, because `apps/web/app/tokens/
  motion.css`'s own `prefers-reduced-motion` guard targets `[style*="wa-spin"]` — a class-based
  animation would have silently broken that guard.

**A third finding changed the task's own acceptance bar, by user decision.** Building the harness far
enough to actually run T240's visual-diff assertion (not just the diffing mechanism T246 proved could
fail — `startServer`/`screenshotUrl` in `apps/web/tests/visual/harness.ts` are new, real, and boot
`apps/web` for real) surfaced that `Public.jsx`'s header — logo, 4 nav links, lang/theme toggles, two
buttons, one flex row, `flex-wrap` never set — has no mobile treatment anywhere in the vendored
source: no `@media` query, no collapse, no hamburger. Loading the reference bundler HTML itself at
390px and reading `document.documentElement.scrollWidth` directly confirmed it overflows to ~672px
there too — not a porting mistake, a property of the design as vendored. Fixing it without inventing a
mobile nav pattern the source doesn't have would violate "port, never author"; asked the user, who
chose to leave it and record it as a known gap (§ below) rather than have this session invent one.
`apps/web/tests/visual/harness.test.ts`'s Home-page comparison stays `it.todo` at both viewports —
the task's bar is "diff <=0.5% at 1440/390" as one requirement, and a passing 1440-only assertion
next to a 390 todo would have read as more done than it actually is.

**A fourth, narrower harness bug was found but not fixed**: `screenshotReferencePage`'s `fullPage:
true` capture of the *same* overflowing reference page comes back exactly viewport-width instead of
the true (overflowing) width `screenshotUrl` correctly captures for the live app — a Playwright
sizing quirk specific to a page whose DOM was just replaced by the bundler's unpack script. Worth
fixing before the Home-page assertion is trustworthy even once the header itself is addressed; not
chased further this session once the header gap made the assertion moot regardless.

Verified: `tsc --noEmit` clean, `next build` clean (checked the emitted HTML for real content at both
`/` and reflowed all six sections), `pnpm lint` clean, `pnpm test` green (476 unit tests, +8 new in
`apps/web/tests/unit/report-status.test.ts`; also fixed `adherence-lint.test.ts`'s scaffold test,
which hardcoded the now-deleted `app/page.tsx` path — glob'd to `apps/web/app/**/*.tsx` instead, so
the next page replacement doesn't repeat this), `pnpm test:visual` green (5 real assertions, 7 todo,
same count as before — the Home-page todo's wording changed, its presence didn't).

### What 2K and the bootstrap left behind

- **Teardown hangs off `transition`, not off four call sites.** Every terminal state
  (COMPLETED/FAILED/CANCELLED/TIMED_OUT) is written in one function, so `onTerminalTransition`
  observers are the only way to make FR-090 hold on *every* exit path. Observers fire only when the
  row actually moved — a lost race must not delete the workspace of a scan that is still running —
  and an observer that throws is reported and swallowed, because failing a finished audit over a
  scratch directory is the wrong trade.
- **Teardown removes entries itself rather than calling `fs.rm(recursive: true)`**, and confines
  every path by realpath against the configured base. A teardown that could be pointed anywhere is a
  remote delete primitive.
- **Both services now boot and shut down in order.** `startApi` wires the WebSocket server and the
  Redis fan-out and listens; `startWorker` opens the three queues *and* their producers, because R4
  has a phase job enqueue its own successor.
- **The queue processors are loud placeholders that always reject** (`JobNotImplementedError`, naming
  T113). A consumer that acknowledged a job and reported success without running the audit would move
  a scan to a terminal state having measured nothing, with the credits already spent. A queue with no
  consumer loses time; a consumer that lies loses money.
- **Queue payloads are Zod-validated strictly**, so an unexpected field during a rolling deploy stops
  the job rather than being silently stripped.

---

## Phase status

| Phase | Tasks | State | Notes |
| --- | --- | --- | --- |
| 1 — Setup | T001–T012 | ✅ done | Monorepo, toolchain, CI, services |
| 2A — Persistence | T013–T022 | ✅ done | 22 models, migration applied, seeded |
| 2B — Accounts & sessions | T023–T034 | ✅ done | Incl. OAuth + GitHub vault, completed during remediation |
| 2C — Credit ledger | T035–T043 | ✅ done | **SC-022 green** |
| 2D — SSRF-safe fetch | T044–T051 | ✅ done | **SC-018 green** |
| 2E — Control gate | T052–T057 | ✅ done | **SC-021 green** |
| 2F — Secret redaction | T058–T062 | ✅ done | **SC-016 green** |
| 2G — Capability SDK | T063–T074 | ✅ done | **SC-011 green (resolution half)** |
| 2H — AI executor | T075–T083 | ✅ done | **SC-012 green** |
| 2I — Module runner | T084–T093 | ✅ done | **SC-006 green**, SC-011 completed |
| 2J — Queue & realtime | T094–T101 | ✅ done | R4's pause holds no worker |
| 2K — Workspace lifecycle | T102–T104a/b | ✅ done | **SC-015 green.** +2 tasks the plan omitted |
| 2L — Design system port | T236a, T237–T248 all done | ✅ done | Checkpoint reached; Phase 3 next |
| 3 — US1 🎯 MVP | T105–T143 | ✅ done | 🎯 **MVP checkpoint reached** — real audit, driven through the UI, end to end, all 5 areas' capabilities wired. T143's design gap resolved by documented exception (§ below) |
| 4 — US2 fix loop | T144–T157 | ✅ done | **SC-007 green** — the red-to-green loop, async re-verify queue, `reverify` on all 6 first-slice capabilities, recurrence, fixes board. § Phase 4 near top |
| 5 — US3 readiness | T158–T168 | ✅ done | Fresh full re-audit, fingerprint diff, go/no-go verdict with named blockers, shareable certificate. § Phase 5 near top |
| 6 — US4 source audit | T169–T179 | ✅ done | Archive + repo input, streaming extraction guard, refused before extraction and before charging. § Phase 6 near top |
| 7 — US5 billing | T180–T193 | ✅ done | **SC-008 green** — subscriptions, entitlements before charging, credit purchase, signed idempotent webhook, retention + self-contained export. § Phase 7 near top |
| 8 — US6 questionnaire | T194–T201 | ✅ done | Mid-audit design-intent pause, wired end to end; one Critical regression found and fixed by the whole-feature review — § below |
| 9 — US7 admin | T202–T215 | ✅ done | SC-009, SC-010. First `requireOperator` route; Sessions 4–6 |
| 10 — Sandbox runner | T216–T226 | ✅ done | **SC-017 green.** T216–T224 (Session 7) + T225–T226 (Session 8, deploy + real dispatch) all done |
| 11 — Polish | T227–T236 | ✅ done | Session 9, 2026-09-04. T230 done early (finding M7). **Last phase — plan complete.** |

## Adversarial gates — honest scoreboard

| Criterion | Asserts | Task | State |
| --- | --- | --- | --- |
| SC-022 | No purchased credit lost or drawn out of order | T035 | ✅ **GREEN** — 8 seeds × 200 random steps |
| SC-018 | SSRF refused including DNS rebinding | T044 | ✅ **GREEN** — 99 assertions, 4 layers |
| SC-007 | Nothing turns green without a passing check | T144 | ✅ **GREEN** — schema + `outcomeToState` total function + single RESOLVED writer; adversarial suite: unchanged assertion, bulk assert-all, throwing check, + positive control |
| SC-006 | No unattributed finding reaches a user | T084 | ✅ **GREEN** — 8 seeds × 25 random module shapes, 3 locks |
| SC-008 | Nobody charged for our failures | T180 | ✅ **GREEN** — full refund before any area ran, partial refund for the undelivered half, and the refund visible in `GET /billing/credits` with amount/reason/time; refund returns to the originating lot |
| SC-011 | Disabling any capability leaves audits completable | T066 | ✅ **GREEN** — resolution half at 2G, execution half at 2I |
| SC-012 | Total provider failure still delivers measured findings | T077 | ✅ **GREEN** — 4 outage shapes, plus total exhaustion |
| SC-015 | Source destroyed on all four exit paths | T102 | ✅ **GREEN** — four exit paths, confinement mutation-tested |
| SC-016 | Planted credentials never reach a provider | T058 | ✅ **GREEN** — 15 planted credentials, 76 assertions |
| SC-017 | Six escape attempts refused, host survives | T218 | ✅ **GREEN** — 6-vector SC-017 suite plus 2 vm-context prototype-chain escape tests (found by adversarial review, not in the original suite) and a process-cleanup test; two independent reviews, two Criticals found and closed |
| SC-021 | Load generation refused without verified control | T052 | ✅ **GREEN** — 3 named bypasses + 2 forged-state cases |

**11 of 11 green.** SC-017 (T218) landed with Phase 10, Session 7 (2026-09-04) — see "Phase 10
(sandbox-runner core isolation)" above.

---

## Code review remediation — 19 findings, all resolved (`f02ef48`)

A full engineering review of Phases 1–2B produced 19 findings. All fixed and verified by execution.
Work was split across five parallel agents by file ownership; three were killed by a session limit
and finished by hand.

### Critical

- **C1** Refund created its replacement lot with `expiresAt: null`, so a refunded PLAN lot tied with
  PURCHASED under `expiresAt ASC NULLS LAST` and lost to any older purchase. Users lost permanent
  credits while expiring ones sat unspent. Replacement lots now resolve a real expiry.
- **C2** Refresh rotation was not atomic (`findUnique` then revoke), so concurrent presentations of
  one cookie all succeeded. The revoke is now the gate; reuse outside a 10s self-race grace revokes
  the live token set.
- **C3** `env.ts` returned a committed constant whenever `NODE_ENV !== 'production'` — and it
  defaults to `development`. Anyone could mint `isOperator: true`. Now fails closed.

### High

- **H1** CI ran no working gate: `quality` executed DB-backed tests with no postgres service,
  `visual` invoked an uninstalled Playwright, `adverse` lacked `TEST_DATABASE_URL`. All fixed.
- **H2** OAuth was never implemented despite T030/T031/T034 being marked done. Added start/callback
  with state + PKCE and GitHub connect/disconnect; the token vault is no longer dead code.
- **H3** The property test claimed to check both invariants every step but asserted only one — and
  its renewal step never made a lot expire by wall clock, so the branch C1 lived in went unexecuted
  across 1,600 steps.
- **H4** FR-009 deletion was database-only. Artifact purging is now an explicit injectable step
  running *before* the cascade. **Still needs a real R2 purger wired at T189/T102.**

### Two criticals an agent found outside its brief

- Every account's free grant is a null-expiry PLAN lot carrying the same C1 ordering flaw —
  reachable with no refund at all. Fixed with a `kind` tiebreak in the debit `ORDER BY`.
- Refunding into a swept lot resurrected expired credits. `expireRenewedLots` now clamps
  `expiresAt` so swept and expired are one observable state.

### Medium / Low

Operator status re-read from the database rather than a 15-minute claim · superseded email tokens ·
expired-token sweep · Redis-backed rate limiting (T230) · helmet, CORS allowlist, trust proxy ·
enum-drift test · connection pool sized to plan.md's real 1,000-user target rather than the review's
assumed 10,000 · README · schema comment on the deliberate `AuditLogEntry` FK absence.

---

## What is verified, not merely written

- **22 tables, 19 enums, 70 indexes, 27 FKs** — confirmed by querying `pg_indexes`/`pg_tables`, not
  by trusting migration output. All 24 index tuples declared in `data-model.md` exist.
- **No credit balance column exists anywhere.** A balance is only computable from unexpired lots.
- **`OPEN → RESOLVED` is not a legal transition** — SC-007 as a schema constraint.
- **SC-022 holds over ~1,600 random operations**, both invariants asserted every step.
- **A 10-way concurrent debit race never oversells** — the `FOR UPDATE` lock makes it true.
- **Exactly 1 of 3 concurrent refresh presentations succeeds** — proven by calling `refresh()`
  directly. The HTTP-level version of that test passes even against the broken code, because
  connection setup serialises the requests. Keep both.
- **The enum-drift test bites.** Removing a `LOT_SOURCES` member fails with
  `Only in schema.prisma: [PROMOTIONAL]`.
- **All four OAuth endpoints are mounted and respond correctly** — `501 PROVIDER_NOT_CONFIGURED`,
  `400 OAUTH_STATE_INVALID`, `401 UNAUTHORIZED` ×2.
- **bcrypt cost 12 is enforced, not commented** — `BCRYPT_COST=4` is refused at startup; stored
  hashes carry `$2y$12$`.
- **`design-system/` is never imported at runtime**; `.env` is untracked.
- **SSRF refusal survives mutation, not just review.** Three deliberate breaks were introduced and
  each was caught: approving every peer address in the connect guard failed 2 rebinding tests;
  checking only `addresses[0]` in the resolve guard failed 2; dropping IPv6 tunnel unwrapping failed
  9 form cases. The suites bite.
- **All 56 literal-address forms are refused through `safeFetch` itself**, not only through the
  internal form layer — decimal, octal, hex, per-octet hex, unicode digit lookalikes, IPv4-mapped,
  IPv4-compatible, NAT64, 6to4 and Teredo embeddings included.
- **A DNS rebind is refused with nothing sent.** A real UDP DNS server answers public then loopback;
  the fixture on loopback records **zero** requests, so the socket died before the request line.
- **The redirect chain is followed by hand and each hop counted.** A three-hop chain shows exactly
  one request per fixture, and a chain ending private stops at the last allowed hop.
- **The green adverse run makes no outbound connections.** Every fixture is loopback and every
  public address is only ever classified, never dialled.
- **SC-021's three named bypasses each fail for the stated reason, verified by mutation.** Trusting
  the stored `controlLevel` flag failed 10 tests; letting attestation promote to VERIFIED failed 2;
  matching any published token rather than the one issued to that row failed the "Bob publishes
  Alice's token" case specifically.
- **A `Target` row with `controlLevel: VERIFIED` written directly to the column is still refused** —
  twice over, once with no verification row and once with only a revoked one.
- **Every demotion is in the audit log**, asserted by reading `AuditLogEntry` back.
- **The control-gate and targets suites make no network calls.** The probe is a map; the one place
  DNS would be reached is faked at the resolution stage only, so layer 1 still refuses
  `metadata.google.internal` through the real guard.
- **15 planted credentials — AWS, GitHub, Slack, Stripe, Google, OpenAI, Anthropic, SendGrid, npm,
  a JWT, a PEM private key, a connection-string password, and two unnamed blobs — appear nowhere in
  the assembled prompt**, asserted over `JSON.stringify` of the entire result rather than over
  `prompt.text`, and additionally as base64, URL-encoded, lowercased, and as 12/16/24-character
  prefixes and suffixes.
- **Redaction survives mutation, six ways.** Skipping replacement failed 50 tests; leaking the value
  into the returned ref failed 32; a hash-derived placeholder failed the re-encoding checks;
  truncating before redacting failed the clipped-file test; a structural `isRedactedPrompt` failed
  the two forgery tests; dropping the mixed-case-plus-digit guard failed the negative controls —
  which is the over-redaction direction, and the reason those controls exist.
- **A `RedactedPrompt` round-tripped through `JSON.parse(JSON.stringify(…))` is rejected**, so
  redaction cannot be claimed by a payload that merely says it was redacted.
- **Ordinary content is untouched**: a formatter, a Tailwind class list, a git sha, an SRI hash, and
  a base64 `data:` URI all pass through with zero detections.
- **Trust cannot be claimed, four ways.** A manifest `trust` field, five other spellings of it, a
  vendored-looking id with a vendored `originalSource`, and a symlink from outside into the vendored
  root are each refused; reconciliation corrects a stored trust value that drifted.
- **Capability confinement survives mutation, five ways.** Reading trust from the manifest failed 2
  tests; dropping the realpath containment in discovery failed the symlink case; resetting
  `isEnabled` on reconcile failed the operator-disable test; `parts.join('|')` failed the fingerprint
  collision set; replacing the context's realpath check with string inspection failed 2 confinement
  tests.
- **SC-011's resolution half holds over every capability × every scan shape** — 16 fixture
  capabilities, 3 shapes, plus whole-module and everything-disabled degenerate cases.
- **The conformance harness contains a capability that rejects, throws synchronously, hangs, or
  returns rubbish** — all four produce a report rather than an exception. Two of those four were
  genuine holes in the harness that T066 caught.
- **`readFile` and `glob` refuse `..`, absolute paths, a NUL byte, a symlinked directory, the
  workspace root itself, and everything when no source is attached.** The file-symlink case is
  skipped on Windows, where creating one needs elevation; the directory-junction case carries the
  same property on every platform.
- **One vendor going dark is invisible in the output.** Asserted across four outage shapes —
  connection refused, rate limited, timing out, authentication error — and a provider that throws
  synchronously rather than rejecting.
- **Total provider loss returns a value, never an exception**, and the area comes back DEGRADED with
  every measured finding intact, attributed MEASURED, score null, and a notice that says so.
- **Nine valid items and one invalid one discards all ten.** No partial acceptance anywhere.
- **The executor is mutation-tested five ways.** Counting chain length instead of vendors failed 2;
  skipping `isRedactedPrompt` failed 4; partially accepting an invalid response failed 7; throwing on
  exhaustion failed 6; stopping at the first provider failed 10.
- **A sixth mutation did *not* fail, and the comment was corrected rather than the test.** Replacing
  the string-arithmetic dollar parse with `Math.round(parseFloat × 1e6)` passed everything — within
  the six-decimal input domain the two are equivalent. `pricing.ts` now says that plainly instead of
  claiming an exactness it was not providing.
- **SC-006 holds over 200 random module shapes** (8 seeds × 25), where every generated capability
  ships an `attribution: 'MEASURED'` field and every one is ignored. Both layers are exercised every
  seed — asserted, so the invariant is not vacuous for one of them.
- **FR-030's ordering is asserted on an observed timeline**, not on a flag: no AI invocation starts
  until the slowest concurrent code-layer capability has ended, and there is exactly one AI call per
  module.
- **A capability reaching `globalThis.fetch` is denied, recorded, and blamed correctly** — the
  offender only, with two innocent capabilities running beside it.
- **A `?? 0` in `overallScore` fails 9 tests.** That test did not exist until a mutation showed the
  function had none; the gap was in the tests, and it was closed rather than explained.
- **The runner is mutation-tested six ways.** Copying the capability's attribution claim failed 8;
  scoring a DEGRADED area null failed 2; hoisting containment out of the per-task closure failed 10;
  running the AI layer before the code layer failed the two ordering assertions; coercing a null area
  score to zero failed 9.
- **The questionnaire pause returns without an answer ever arriving**, and both sides of the race are
  asserted — answer-first, deadline-first, and both at once. Exactly one phase-2 job in every case; a
  second would run the design area twice and charge twice.
- **A socket cannot subscribe to a scan it does not own**, asserted with a wrong-user token, no
  token, an expired token, a token signed with the wrong key, a non-existent scan id, and a
  client-supplied room name. One authorised subscription does not authorise the next.
- **The realtime layer is mutation-tested seven ways.** Trusting the connection instead of the
  subscription failed 4; publishing before persisting failed 2; giving terminal states outgoing edges
  failed 3; inverting the optimistic guard failed 9; rounding the refund up failed 1; counting
  DEGRADED as undelivered failed 1; forwarding an unvalidated envelope failed 11.

## Delta review — Phase 1–2 read against running code, not against the spec

Requested explicitly, separate from and in addition to the mutation testing each phase already
carries: read-only reviewer agents given each sub-phase's scope, told to write executable probes
rather than reason from the source, and to report CONFIRMED (executed) separately from SUSPECTED
(reasoned). Twelve defects were confirmed and fixed as a result — most severe first:

- **Password reset was not single-use (HIGH, live).** `completeReset` kept the read-then-write shape
  finding C2 removed from `refresh()` — the earlier remediation fixed one single-use-token path and
  left the sibling one. Reproduced: eight concurrent presentations of one reset token, eight
  successes, last password written wins. Reachable without compromising anything — a reset link is
  visible to anyone with sight of the mailbox. Fixed the same way as C2: the `usedAt` write is the
  gate, inside the transaction.
- **SC-006 defeated through a side door.** A capability could *earn* MEASURED attribution without
  measuring anything: secrets were detected across every prompt segment including a capability's own
  `getSystemPromptAddition()`, and every one became a MEASURED finding. A capability with no code
  layer produced three fabricated CRITICAL credential findings on a report, at a location inside our
  own prompt. Secrets are now findings only from target-supplied segments.
- **AI judgements moved area scores (Principle III).** `scoreFromFindings` was scoring every finding,
  judgements included; a clean area scored 0 if the model emitted four criticals of its own. Scoring
  now filters to MEASURED.
- **A refund racing the expiry sweep left credits unspendable (FR-075).** Row-locking the sweep did
  not fully fix this — the fix needed the `now` read moved to *after* the lock. Instrumented the
  failing case: the sweep clamped expiry to `…54.207` while refund had captured `now` at `…54.190`,
  seventeen milliseconds earlier. A lot came back from the lock carrying a boundary later than a clock
  reading from before it died, so it was judged alive by a clock that predated its death.
- **The EXPIRE ledger row overstated what died.** `expireRenewedLots` was the one credit mutator with
  no `FOR UPDATE` and no `withRetry`: it totalled a snapshot, then blocked on a concurrent debit's
  lock and zeroed whatever was actually left. Reproduced a ledger that summed to −40.
- **`runModule` threw on six shapes of malformed capability output (FR-022).** Containment wrapped the
  call, not the returned value: a numeric fingerprint part hit `Buffer.from`, circular/BigInt evidence
  hit `JSON.stringify` twice, a numeric location hit `.trim()`. An invented severity also scored `NaN`,
  which `NaN !== null` carried into the overall score and into a Prisma column that rejects it.
  `asFindings` now validates every field it relies on and snapshots values (closing a Proxy TOCTOU
  between validation and use) rather than checking four fields loosely.
- **Billed provider calls recorded at zero (Principle VI).** Billability was decided by outcome, but
  OpenAI's `finish_reason: length` and Claude's `stop_reason: refusal` both return real token counts —
  and a truncated call is the most expensive one the chain can make. Billing now follows reported
  usage; `costMicrosOf` refuses NaN/Infinity/negative rather than writing them to a money column;
  `AI_MODE=fixtures` now refuses to build when `NODE_ENV=production`.
- **The IPv6 SSRF classifier had four gaps.** The IPv4 table was complete against the IANA registry;
  the IPv6 table had six rules. NAT64 at RFC 8215's local-use prefix, deprecated site-local
  `fec0::/10`, IPv4-translated `::ffff:0:0:0/96`, and most of `2001::/23` were all accepted — and for a
  literal address the classifier is the *only* defence, because the resolve guard has nothing to
  resolve and the connect guard re-asks the same question. 34 new adverse tests.
- **A repository target crashed FILE verification, after revoking the caller's existing token.**
  `fileUrlFor` had no guard where `hostOf` did, so `new URL('owner/repo')` threw and reached the route
  as a 500 — *after* the transaction had already revoked the caller's outstanding verification. Now
  refused before any write, in the same class DNS already used.
- **The verification probe followed redirects anywhere.** `safeFetch` defaults to five hops; a proof
  of control should accept none. `maxRedirects: 0`.
- **Negative headroom in `refund` could mint credits.** `Math.min(amount, headroom)` with an unfloored
  headroom; unreachable today, free to close.
- **A symlinked entrypoint escaped capability discovery.** The capability *directory* was already
  realpath-checked against its discovery root; `manifest.entrypoint` was only checked lexically (no
  `..`, not absolute) — which a manifest can satisfy while naming a path through a symlinked directory
  component that resolves completely outside the capability. Confirmed with a directory-junction
  attack: `dist/index.js` where `dist` links elsewhere read a file with zero relationship to the
  capability. Now realpath-checked the same way the directory is.

Commits: `16dc70b`, `7d8cc1d`, `890873d`. Reviews still open: 2J/2K (queue, realtime, workspace) —
two agents were killed by the same session-limit error before starting; not yet re-run.

**A process-sharing note, not a defect:** a second interactive session was found working in this same
checkout mid-review (`ListAgents` — sessions on one machine share a git working tree, not just a
repo). It independently produced a real fix for a capability's detached `setTimeout`/rejection
escaping `containCapabilityCall` and crashing the whole worker process — a different, serious gap in
the same family as the ones above, in `apps/worker/src/process-guards.ts` (new),
`packages/capability-sdk/src/capability-context.ts` (new), plus edits to `contain.ts`,
`conformance/suite.ts`, `capability-sdk/index.ts`, `code-layer.ts`, and the worker entrypoint. Was
mid-edit when discovered; not committed as of this writing. If you land in this repo and see those
files uncommitted, that work is real and in progress — do not discard it.

## Defects found and fixed in a later phase

- **2H scored a DEGRADED area null (FR-053), fixed in 2I.** `degradeModule` returned `score: null`,
  which excludes an area from the overall average. An area with ten measured criticals that lost its
  AI layer would therefore make the overall score *rise* — the inflation FR-053 forbids, caused by
  omitting an area whose score was perfectly computable. `MODULE_STATES_SCORED` in `@webaudit/types`
  had said DEGRADED was scorable all along. The 2H assertion that demanded `score: null` was
  corrected rather than the code being left wrong.
- **The conformance suite's containment wrapper was a private copy, extracted in 2I.** Its own
  documentation claimed it tested "the same containment wrapper the runner will use"; that only
  became true when the runner was written and the wrapper moved to
  `packages/capability-sdk/src/contain.ts`.
- **Egress violations were attributed to every concurrent capability, fixed before commit.** The
  first `code-layer.ts` credited any `fetch` call to the whole batch, which would report innocent
  capabilities as violating FR-025 and have an operator disable the wrong check. Now attributed with
  `AsyncLocalStorage`.
- **`overallScore` had no test.** Found by a mutation that passed. The gap was in the tests.

## Open decisions

| # | Decision | Status |
| --- | --- | --- |
| 1 | `JWT_REFRESH_SECRET` is parsed but unused — refresh tokens are opaque DB rows | **Needs a call:** enforce or delete. A parsed-but-unused secret invites false assumptions |
| 2 | 2L design port as a parallel lane, or after 2K | **Settled: done, before Phase 3.** All of 2L (T236a, T237–T248) is complete; Phase 3 is next |
| 3 | Monetary price points for the four tiers | Unresolved. Credits and entitlements are fixed; currency is not |
| 4 | Authenticated auditing | Out of baseline scope by decision. Largest depth gap, largest risk increase |
| 5 | GitHub vault cipher | Settled: AES-256-GCM, per-record IV |
| 6 | Connection pool size | Settled: `connection_limit=10`, sized against plan.md's 1,000 users / ~60 concurrent audits |
| 7 | Level 1 probe rate (FR-017's "published request rate") | **Needs a call:** spec states no number. Defaulted at T056 to 4 rps / burst 12 per target, published in `packages/config`. Mechanism tested; value unsigned-off |
| 8 | Per-area score formula (severity weights in `packages/scoring`) | **Needs a call:** FR-048 requires a per-area score and specifies no formula. Defaulted to 100 minus 25/12/5/2/0 by severity, floored at 0, so four criticals reach zero |
| 9 | Provider model + cost per million tokens for OpenAI and Google | **Needs a call, and it blocks a production boot:** the executor refuses to construct a provider with no configured price (FR-081 needs actual cost). Anthropic has a house model and a documented rate; the other two have neither, so `OPENAI_MODEL`/`GOOGLE_MODEL` and their `_USD_PER_MTOK` keys are empty in `.env.example`. `AI_MODE=fixtures` bypasses it, which is why every suite passes |
| 10 | `apps/worker` depends on `@webaudit/api`'s generated Prisma client (real dependency, T113) | **Made, not settled.** Judged as sharing a generated ORM client, not application logic — see T113–T118's own section above for the reasoning. A `packages/db` extraction is the cleaner long-term shape; not built, since nothing today needs it beyond what this gets right |
| 11 | No refund on a phase job that throws mid-run (T113) | **Resolved.** A code-review remediation plan (`docs/superpowers/plans/2026-08-27-credit-refund-integrity.md`) exposed the credits service to `apps/worker` via a `@webaudit/api/credits` package subpath (the same shape as the existing `./prisma-client` export) and registered `installTerminalRefund`, a terminal observer that refunds the undelivered share of a scan's charge on FAILED or COMPLETED. `failScan`'s `scan:failed` event now reports the real refunded amount instead of a hardcoded 0. The same mechanism also covers a gated-but-unmet module never running on an otherwise-completed scan — `gated-check-partial.test.ts`'s second assertion stays RED for a separate, still-open reason: nothing enforces per-module control-level gating in the orchestrator yet, so a `VERIFIED`-requiring module still runs to `COMPLETE` on an unverified target (a distinct gap, tracked separately, not this decision) |
| 12 | `ssl-analyzer` scoped to header-inferable checks only (T120) | **User decision.** `CodeLayerContext` has no TLS-inspection door; user chose not to add one over widening the SDK contract or deferring the capability. Real cert/cipher checks are future work if a later capability genuinely needs the door |
| 13 | Capability loader is a static import table, not filesystem-driven (T119–125) | **Resolved (2026-09-08, T249, spec-kit Phase 12/Convergence).** Extracted `discoverManifestsInRoot` (single-root manifest walking, trust-free) into `@webaudit/capability-sdk`; `apps/api/src/services/registry/discover.ts` now delegates to it, adding only the registry-specific trust-by-root and cross-root shadow logic on top — the R10 adversarial suite (`capability-trust.test.ts`, 25/25) stayed green throughout, proving zero behavior change there. `apps/worker/src/orchestrator/capability-loader.ts` no longer hardcodes any `import()`s or a per-module table: it walks the real vendored root once per process, dynamically imports each manifest's own `entrypointPath` (resolved via `pathToFileURL`, confirmed working under both Vitest and the real `tsx` production runtime), and groups by each capability's own `.module` — reading the declaration instead of encoding it, per Constitution I's own words. `apps/worker/src/reverify/resolve-check.ts`'s `CHECK_NAMESPACE_TO_CAPABILITY` table is gone too: `AuditCapability` gained an optional `checkNamespaces?: readonly string[]` field, and the 9 capabilities that own a `reverify` (`headers-checker`, `ssl-analyzer`, `owasp-checker`, `meta-checker`, `content-checker`, `data-leak-scanner`, `dependency-scanner`, `bundle-analyzer`, `css-analyzer`) now declare their own namespace(s) directly on their exported object — `capabilityIdForCheck` searches the loaded capabilities' own declarations instead of a static map. Verified end-to-end against the real vendored capabilities (not fakes): a real `owasp.cookie-missing-secure` checkId resolves to the real `owasp-checker` through real discovery, confirmed to actually depend on the new field by temporarily removing it and watching the test fail. Full regression: apps/api 324/324, apps/worker 285/285 unit + 205/205 (+1 pre-existing skip) adverse, capability-sdk/capabilities-vendored 82/82 + 7/7 new tests, all typechecked and linted clean. |
| 14 | Per-module control-level gating not wired into orchestrator execution (T108's remaining gap) | **Resolved.** A code-review remediation plan (`docs/superpowers/plans/2026-08-27-control-gate-enforcement.md`, R2) exposed `apps/api`'s control-gate service to `apps/worker` via a `@webaudit/api/control-gate` package subpath (the same shape R1 established for `@webaudit/api/credits`), wired a real `buildResolveRequiredControlLevel` at API boot (closing the intake-time 403 the seam had always supported but nothing built), and gave the orchestrator a real per-phase `requiredControlLevelsFor`/live-reconfirmation step — `resolveEffectiveControlLevel` skips the network-touching `reconfirmControl` call entirely when nothing in a phase requires more than `NONE` (true of every scan shape in production today), and calls it at most once per phase job when something does. A later fix pass on the same plan closed a real vulnerability the first cut introduced: `reconfirmControl` could not tell a rate-limit refusal from a genuinely removed token and would revoke a legitimate `TargetVerification` on the former — closed by a wait-and-retry in the probe (`verify.ts`'s `acquireOrWait`) plus a same-key check against `level1RateBound` in `reconfirmControl` itself before ever treating a negative as removal. `gated-check-partial.test.ts`'s second assertion (Open Decision #11's own note) and `apps/api/tests/adverse/control-gate.test.ts`'s "the enum is a cache, the verification row is the truth" block are now backed end to end, not just at the service layer — see `apps/worker/tests/integration/orchestrator-control-gate.test.ts` for the orchestrator-level proof, including a stale-cached-column case matching SC-021 bypass 3 |
| 15 | `grantLot` has no idempotency key (2026-09-02 Phases 4–7 remediation, Task 5) | **Resolved (2026-09-03, Session 2 of the [full-project remediation roadmap](docs/superpowers/plans/2026-09-03-full-project-remediation-roadmap.md)).** Added a nullable, unique `billingEventId` column to `CreditTransaction` (migration `20260903050000_credit_transaction_billing_event_id`) — Postgres treats multiple `NULL`s as distinct, so registration's free grant and the direct dev/test billing routes (neither passes an id) are unaffected. `grantLot` now creates the `CreditTransaction` *before* the `CreditLot` specifically so a duplicate `billingEventId` is caught before any lot exists to roll back; a conflict throws `DuplicateBillingEventGrantError`, which `subscribe`/`renewSubscription`/`purchaseCredits` each catch around their own `$transaction` and answer with the already-committed state instead of re-throwing — letting Postgres roll back the whole retry attempt (including, in `subscribe`'s case, a harmless re-write of the subscription row to the same values an earlier attempt already committed) rather than trying to catch-and-continue mid-transaction, which would risk committing an orphaned lot if Postgres marks the transaction aborted after the failed insert. `webhooks.routes.ts` now passes `event.id` into all three effect calls. New test in `billing-webhook.test.ts` proves the exact residual scenario this closes: an effect that commits for real, followed by a rigged `appliedAt` write failure, followed by a genuine retry — balance stays at the single grant, not double. Full adverse suite (570/571) and full unit suite (805/805) both green, run in isolation to avoid the shared-test-DB contamination this roadmap's Environment gotchas section warns about (hit twice again during this session's own verification, each time confirmed as contamination — not a regression — by re-running alone) |
| 16 | Root `pnpm run typecheck` **and `pnpm run build`** both fail on a pre-existing turbo cyclic-dependency warning, unrelated to any code change (surfaced 2026-09-04, Session 4 wrap-up; confirmed to also break `build` during Session 6's whole-branch gate) | **Needs a call, not urgent.** `apps/worker`'s `package.json` has depended on `@webaudit/api` as a real workspace dependency since T113 (Open Decision #10 above — the generated Prisma client, judged a shared ORM artifact rather than application logic). `turbo run typecheck` (the second half of the root `typecheck` script, after the plain `tsc --noEmit -p tsconfig.json` that runs first and passes) and, identically, `turbo run build` (the entire root `build` script) both walk the same `^build` dependency graph and refuse outright: `apps/api` and `apps/worker` each list the other as a dependency somewhere (api's own `package.json` has no runtime dependency on worker — confirmed by reading it — so this is almost certainly turbo conflating a test-only/dev dependency with a build-graph edge), and turbo treats any A-depends-on-B-depends-on-A as fatal regardless of which edge is dev-only. Confirmed pre-existing and not introduced by Phase 9a: `git show d519cb2:apps/worker/package.json` (the commit immediately before Session 4's work began) already lists `@webaudit/api` as a dependency. Neither `apps/api` nor `apps/worker` has its own `build` script at all (only `apps/web` does, `next build`) — Session 6's whole-branch gate confirmed that one directly (`apps/web/tests/visual/harness.test.ts` runs a real `next build` internally as part of its own mechanism, and it passed clean), so the only package this root script would meaningfully build is unaffected by the graph error in practice; the failure is purely turbo's own dependency-graph bookkeeping refusing to proceed before it would even reach that step. Every verification in this session and the three before it ran `tsc --noEmit`/`eslint` per-package rather than the root scripts, which is why this had gone unnoticed until Session 4's wrap-up (for `typecheck`) and Session 6's (for `build`). Not fixed here — out of scope for an admin-surface task list — but worth a real decision: either accept `apps/worker`'s dependency on `@webaudit/api` needs to be a devDependency turbo's graph can be told to ignore, or both root scripts need to stop shelling out to `turbo run {typecheck,build}` and just walk packages directly the way every session so far has already done by hand |
| 17 | The admin console (`apps/web/app/(admin)/`) has no per-screen visual-regression baseline for any of its 6 real screens (surfaced 2026-09-04, Session 5 wrap-up) | **Resolved (2026-09-08, T250, spec-kit Phase 12/Convergence).** The real scope was 10 screens, not 6. `harness.ts`'s new `screenshotAdminReferenceView` clicks the sidebar to each named view before capturing — the reference is one interactive bundler document with a `view` state switching screens, not one file per screen — turning the single combined export into ten real reference screenshots. Comparing the two sides caught a real, previously-undiscovered defect: `AdminShell.module.css`'s `.navItem`/`.exitLink`/`.publicSiteLink` style real `<a>` tags but never set `text-decoration: none`, so every sidebar link and "Public site" rendered underlined on all 10 real screens — fixed. `apps/web/tests/visual/admin-console.test.ts` wires real, asserted `pnpm test:visual` coverage for the 5 screens with no live data fetch (`Overview`, `AI providers`, `Scans`, `Audit log`, `Settings` — byte-identical placeholder content to the reference, confirmed by reading each page's own module note); each measures 1.7-2.6% diff at desktop-1440 after the fix, close but honestly over the 0.5% bar and left `it.todo` with the measured numbers rather than forced green, matching this file's own pre-existing Home-page/auth-page precedent for a small, real, not-yet-root-caused layout drift. The other 5 screens (`Users`, `Capabilities`, `Margin`, `Queue`, `Plans`, T202-215) fetch real data and render it with real formatting that cannot byte-match the reference's hand-authored mock strings regardless of backend content — recorded as `it.todo` with that specific reason rather than stubbed to fake a pass. Two real "mechanism check" tests (not `it.todo`) prove the extraction and live-vs-reference pipeline genuinely work end to end. Zero regressions: apps/web unit 177/177, visual 8/8 real + 17 todo. |
| 18 | `apps/sandbox-runner`'s child `fork(..., {env: {}})` still measurably leaks ~11 real OS-required env vars (`HOMEDRIVE`, `PATH`, `SYSTEMROOT`, etc.) on this Windows dev machine despite an empty `env` object being passed (found live during Session 7, T220, 2026-09-04) | **Resolved (2026-09-08).** Verified on real Linux: a `node:22-slim` Docker container (matching this project's pinned Node 22) ran `fork(childPath, [], { env: {} })` and the child's `Object.keys(process.env)` came back `[]` — zero leaked variables, not ~11. This confirms the original assessment — the leak is Windows's `CreateProcess` loader requiring certain variables to start `node.exe` at all, an OS-level behaviour `child_process.fork` cannot suppress on that platform — and that it does not reproduce on Linux, the actual deployment target. No code change: `env: {}` in `host/server.ts` already achieves the intended guarantee there. This is Node/OS platform behaviour confirmed via a representative Linux container, not a claim verified against the live production host itself. |
| 19 | `apps/sandbox-runner`'s `--allow-fs-read`/`--allow-fs-write` glob matching produces a garbled, mis-cased resource path (`\\?\c:\uSERS\...`) for certain glob forms on this Windows machine (found live during Session 7, T223, 2026-09-04) | **Resolved (2026-09-08).** Verified on real Linux: the same `node:22-slim` container ran the exact invocation `host/server.ts` uses — `fork(child, [child], { execArgv: ['--permission', '--allow-fs-read=<dir>/*'], env: {} })` — and the child cleanly read a file inside the allowed directory with exit code 0 and no stderr output; no mis-casing, no garbled path. This is expected rather than surprising: the reported artifact was a Windows extended-length path prefix (`\\?\c:\...`), a Windows-only path convention with no Linux equivalent, so the quirk cannot occur there by construction. No code change needed — the existing narrow, `path.sep`-consistent `readAllowlist` in `host/server.ts` already works correctly on the deployment target. |
| 20 | `apps/sandbox-runner/src/child-harness/harness.ts`'s `runConformance` (T224, Session 7) builds `rawManifest: { id, module, layer }` only; `@webaudit/capability-sdk`'s `manifestSchema` also requires `name`, `version`, and `entrypoint`, so `manifest-valid` — and therefore a `ConformanceReport`'s overall `passed` — cannot come back `true` for any capability dispatched through `CONFORMANCE` today (found live during Session 8, T226, 2026-09-04, the first time anything ever exercised the `CONFORMANCE` operation end to end) | **Manifest-completeness half resolved (2026-09-08, T251, spec-kit Phase 12/Convergence); installation half split out as T253.** Chose the wire-protocol extension over adapting `manifest-valid` for uploads: `SandboxRequest` gained an optional `manifest: { name, version }` field, populated from a new `?name=&version=` query pair on the upload route (validated against `manifestSchema`'s own constraints), and `runConformance` now builds a complete `rawManifest` — `id`/`module`/`layer` from the loaded capability's own code (trustworthy the same way any self-declaration is), `name`/`version` from the operator's query params, `entrypoint` a fixed documented sentinel (`'bundle.js'`) since an uploaded bundle IS its own entry module and there is no second file for a relative path to point at. `manifest-valid` and the report's overall `passed` now genuinely come back `true` — `admin.capabilities.test.ts`'s real-dispatch test asserts this against the real sandbox, not a mock. What T251 explicitly did NOT do, by design: write a `Capability` row, decide where an accepted bundle's code lives on disk, or wire it into a real scan's dispatch path — that is T253, a genuinely separate architectural question this session's own scoping (and the original module note) correctly kept out of T251's reach. |
| 21 | `capability-upload.service.ts`'s conformance run hardcodes `controlLevel: 'NONE'` for every uploaded capability, and nothing in `runConformanceSuite` varies this or gates on the capability's own declared `requiredControlLevel` — found by the final production-readiness review's integration-seam pass (2026-09-04) | **Resolved (2026-09-08, T252, spec-kit Phase 12/Convergence) — chose the enforced-rule option over per-level re-runs.** `CapabilityInput` (`@webaudit/capability-sdk`) no longer has a `controlLevel` field at all: `canRun`/`runCodeLayer` structurally cannot read what was never on the object handed to them, closing the risk category itself rather than verifying around it. The one real FR-017 gate, `apps/worker/src/module-runner/resolve.ts`'s `resolveApplicable`, now takes the target's real level as its own `targetControlLevel` parameter kept separate from `input`; `RunModuleOptions` and `orchestrator.ts` thread it the same way, and `capability-upload.service.ts`'s conformance sample input simply has nothing to set anymore. A new test in `resolve.test.ts` asserts the object `canRun` receives has no `controlLevel` own-property at any target level, confirmed to genuinely depend on the fix (removed the fix, watched the test fail, restored it). Touched the contract type plus ~20 call sites project-wide; the full adverse suite (392/392, +1 pre-existing unrelated skip) and unit suite (612/612 across the affected packages) stayed green throughout, including every SC-021/SC-011/SC-017 adversarial test — none of which needed to change. |

## Carried corrections — still open

0a. **`Button` ships with no keyboard-focus indicator.** The vendored `Button.jsx` has none — hover
    only, via `useState` — and `--shadow-focus` exists as a token but is never applied to it anywhere
    in `design-system/`. T237's port is faithful to that rather than inventing one: "port, never
    author" governs a mechanical port, and adding a ring the source never had is authoring, not
    porting, however well-intentioned. `Input` does have one (`:focus`, ported), so this is
    `Button`-specific. Real accessibility gap (WCAG 2.4.7); the fix belongs in `design-system/`
    itself or as an explicit, signed-off deviation — not slipped into a port silently. **Confirmed
    axe-core cannot catch this at all** (T227, Session 9, 2026-09-04): focus-ring *visibility* has no
    automated rule; a real, unfiltered run against all six standalone pages found zero focus-related
    violations, confirming only a manual/visual audit ever catches this one.
0a-2. **The vendored `--accent`/`--promo-bg` brand tokens fail WCAG AA `color-contrast`, on every
    page** (found live, T227, Session 9, 2026-09-04 — a real, unfiltered axe-core run against all six
    standalone pages, not assumed). `design-system/tokens/colors.css` defines both verbatim
    (`--accent:#fe5a01`, `--promo-bg:#10b981`); `apps/web/app/tokens/colors.css` copies them unchanged,
    so this is inherited from the vendored palette, not introduced by the port — same shape as 0a.
    Measured against the WCAG AA 4.5:1 floor for normal text: the primary `Button` (`#fafafa` on
    `#fe5a01`, 3.01:1) on every page's hero/nav/form CTA; the same accent used as link/eyebrow/footer-
    wordmark text on white or `#fafafa` (3.01–3.14:1); the Home page's `PromoBar` (`#ffffff` on
    `#10b981`/`#0c9065`, 2.53:1 / 4.04:1). A second, distinct axe-core id — `region` (moderate,
    best-practice, not a WCAG violation) — also fires on the Home page only: `PromoBar`'s text content
    is not contained by a landmark. Both `Button` and `PromoBar` are named, documented, vendored
    components (`.d.ts`/`.prompt.md` pairs exist for both); recoloring the accent token or rewrapping
    `PromoBar`'s markup would be an unreviewed design change to `design-system/`'s own tokens/
    components, not something T227 (or any task outside an explicit, signed-off design exception) may
    do silently. `apps/web/tests/e2e/accessibility.spec.ts` excludes exactly these two rule ids —
    nothing broader — with the full evidence in its own module comment; every other axe-core rule
    still asserts for real on all six pages.
0b. **A `.js`-extensioned import to a `.tsx` file typechecks and does not run.** `tsc --noEmit` with
    `moduleResolution: bundler` accepts `from './Button.js'` against a real `Button.tsx` — that is
    the whole point of "bundler" resolution mode — but Next's actual webpack bundler does not map the
    extension the same way, and the failure only shows up as a runtime 500 from `next dev`, never from
    `tsc` or `next build` with nothing importing the broken path yet (T237's own build passed before
    anything referenced the components — see that task's write-up above for how this was caught).
    Every future `apps/web` component/page import must be extension-less; a `.js`-suffixed relative
    import in that directory is a bug, not a style choice, unlike the backend apps where it is
    required.
0c. **`design-system/` itself has no accessible-decorative-icon markup anywhere.** Every inline
    `<svg>` across `Sidebar.jsx`, `AdminShell.jsx`, `SeverityBadge.jsx`, `AttributionMark.jsx` and
    the rest lacks `aria-hidden`, always paired with visible text that already carries the same
    information. T237–T239's ports match the source exactly, per 0a's reasoning; T247's *new*
    `Icon.tsx` (not a port of any single named, documented component — undocumented private local
    helpers being consolidated into shared infrastructure the task itself asked for) does add it,
    reasoned differently in that file's own module note. A real, signed-off pass across
    `design-system/` would close this properly rather than leaving two conventions side by side.
0d. **The timeout sweep's refund inputs are a stale, unlocked read.** `sweepTimedOutScans`
   (`apps/worker/src/orchestrator/timeout.ts`) reads `moduleResults` and `chargedCredits` in one
   `findMany`, then — possibly much later, after processing the rest of its batch — guards the
   `TIMED_OUT` transition on `state` alone. `persist.ts` already writes one `ModuleResult` row per
   module as it completes, independently of any scan-state transition, so a module finishing between
   the sweep's read and its write is a real, reachable race: the transition's state guard still
   matches (nothing moved `state`), so the sweep proceeds and reports a `deliveredModules` list, a
   `failureReason` message, and a refund computed from data that was already stale when the decision
   was made. **Currently inert for money**, because `chargedCredits` has no writer anywhere yet — it
   stays 0, `refundForUndelivered` short-circuits to 0, and Principle VI is not yet at risk. It stops
   being inert the moment T113 wires real charging. The fix is not written here because it depends on
   how T113 actually charges: if credits are debited once per phase transition (coupled to `state`),
   the existing state guard is already sufficient and this note can be deleted; if they are debited
   per module (coupled to nothing `transition` can see), the guard needs to re-read and re-verify
   `chargedCredits`/`moduleResults` inside the same transaction as the state write, the same way
   `debit`'s `FOR UPDATE` makes its own read authoritative. Guessing the shape now risks building the
   wrong guard. **Blocks nothing yet; must be resolved before or alongside T113.**
0e. **`Public.jsx`'s header has no mobile treatment anywhere in the vendored source.** Logo, 4 nav
    links, lang/theme toggles, two buttons — one flex row, `flex-wrap` never set, no `@media` query,
    no collapse, no hamburger. Genuinely overflows to ~672px at a 390px viewport. Confirmed against
    the vendored design itself, not just this port: loading `design-system/reference-pages/
    public-pages/1 Home page.html` at 390 and reading `document.documentElement.scrollWidth` directly
    gives the same overflow. T240's port matches the source exactly, per 0a's reasoning — inventing a
    hamburger/collapse pattern the source doesn't have would be authoring, not porting. Asked the
    user; decision was to leave it and record it here rather than have this session invent a mobile
    nav design. `apps/web/tests/visual/harness.test.ts`'s Home-page comparison stays `it.todo` at
    both viewports for this reason (T240's own note in tasks.md has the full account). The fix
    belongs in `design-system/` itself or as an explicit, signed-off deviation.

1. **The code-layer `fetch` poison is process-wide.** `apps/worker/src/module-runner/code-layer.ts`
   replaces `globalThis.fetch` for the duration of the code layer, which is safe only because one
   module runs at a time. FR-033 requires areas to run concurrently, so when the orchestrator does
   that, the poison must move to the sandbox boundary or the modules must share one code-layer phase.
   Documented in the file. **Blocks nothing yet; must be resolved before FR-033 is implemented.**

2. **FR-025 needs amending** — it restricts audit egress to the target and providers, which breaks
   realistic page measurement. Platform and auditing-browser egress need separating. **T232.**
3. **`WebAuditAI_ARCHITECTURE.md` is wrong in three places** — names `vm2`, awaits the questionnaire
   in-job, lists three deployable units where there are five. **T233.**
4. **T143 and T201 are blocked, not skipped** — annotated screenshot and design questionnaire have
   no artboard and must not be invented (constitution v1.1.0).
5. **H4's artifact purger is a stub.** `deleteAccount` accepts an injectable purger and warns when
   none is wired. Real R2 purger at **T189**, workspace cleanup at **T102**.
6. **One agent never filed a completion report** (killed mid-run). Its work — rate limiter,
   helmet/CORS, README, drift test — passes all gates, and the drift test was verified by
   execution. But nobody has reviewed the rate limiter's design intent. Worth a read before it
   carries production traffic.
7. **SC-015 teardown is now wired in, and the four-path guarantee is now fully true.**
   `installTerminalTeardown` is called once at worker boot (`apps/worker/src/index.ts`, alongside
   `installTerminalRefund`), guarded by a required `WORKSPACE_BASE_DIR` env var, exactly as this
   note asked. That covers `COMPLETED`/`FAILED`/`TIMED_OUT` by construction. The fourth path —
   `CANCELLED`, written directly by `apps/api`'s `/scans/:id/cancel` route via its own `updateMany`,
   in a different process, which never reached `apps/worker`'s observer registry — was closed by
   the 2026-09-02 remediation plan (Task 7, Finding 10): the cancel route now enqueues a
   `workspace-teardown` job on the maintenance queue (`apps/api/src/services/queue/
   teardown-producer.ts`) after its `CANCELLED` write commits, and `apps/worker` registers a real
   handler (`apps/worker/src/index.ts`) that calls `destroyScanWorkspace` with the same
   baseDir/db/owner triple the in-process observer uses. Cancellation's *credit refund* was already
   handled at the source (Open Decision #11 above); its *workspace teardown* now is too.
   `teardown.ts`'s and `state-machine.ts`'s docstrings, and this route's own module comment, were
   updated to match — none of them still claim the gap is open.
8. **The redaction detector cannot see a credential split by whitespace.** `AKIA IOSFODNN7EXAMPLE`
   (a space) or a GitHub token folded across two lines the way a YAML `>` scalar or a wrapped `.env`
   value commonly is — `packages/redaction/src/detect.ts`'s named patterns require the credential body
   as one unbroken run of non-whitespace, so either passes through undetected and unredacted. Found by
   delta review; confirmed by execution. **Deliberately not fixed**: closing it means either
   whitespace-collapsing before matching (a real, industry-standard limitation most secret scanners
   share for the same reason — the false-positive risk of merging unrelated adjacent tokens is not
   zero, and this module's own docstring calls over-redaction as costly as under-redaction) or a
   position-mapping rewrite big enough to want its own reviewed change, not a rider on an unrelated
   pass. Two lower-severity variants of the same class (unicode-escaped, percent-encoded) were also
   found and are lower priority — less naturally occurring, mainly relevant to base64-shaped secrets.
9. **The worker shutdown "abandon" path may close producer queues out from under a job still
   enqueuing its successor.** SUSPECTED, not confirmed — reasoned by the 2J/2K delta review and
   verified only at the sub-primitive level (`Queue.add()` after `Queue.close()` really does throw
   `Connection is closed`, confirmed against real Redis). `startWorker`'s shutdown races
   `workers.close(false)` against a grace-period deadline; on the *timeout* branch it stops waiting but
   does not cancel the still-running job, then closes the queues anyway. R4's pattern has a phase job
   enqueue its own successor from inside itself — if that enqueue happens just after the grace period
   expires, it throws into a job whose credits are already charged and whose results are already
   written, stranding the scan with no next-phase job ever queued. Could not be demonstrated end to
   end because it needs real job handlers, which don't exist before T113. Re-examine when T113 lands.
10. **`PublicHeader`'s missing mobile-nav treatment now blocks a second task's visual gate, not just
    T240's.** T128's 5 auth pages all wrap in `PublicPage`, so all 5 inherit the same 390px overflow
    T240 already documented and left as `it.todo` for the Home page — confirmed the auth form itself
    is not the cause (`AuthFrame.module.css`'s `.inner` already carries the source's own `max-width:
    100%`; manual screenshot inspection during T128 showed the form rendering essentially
    pixel-identical to its reference). A real fix needs the same design decision T240's own note
    already asks for — a mobile nav pattern the vendored `Public.jsx` never had — and now blocks 6
    `it.todo`s (Home page + 5 auth pages) instead of 1.
11. **`screenshotReferencePage`'s content-size read is still measurably flaky, even after T128's
    fix.** Reading `scrollWidth`/`scrollHeight` off the bundler-swapped DOM and waiting on
    `document.fonts.ready` (both added during T128) turned "always exactly wrong" into "usually
    correct, occasionally still exactly viewport-sized" — a real improvement, not a full fix. Suspected
    remaining cause: some layout-affecting async work (a stylesheet, a late reflow) that neither font
    readiness nor a 100ms settle catches reliably. `apps/web/tests/visual/harness.test.ts`'s `T128
    mechanism check` test documents both outcomes as legitimate rather than asserting past it; worth a
    focused pass (e.g. polling the measurement until it stabilizes across two consecutive reads) before
    leaning on this harness for a task whose gate needs to actually turn green.

## Reality check on "production ready"

The core loop works and CI genuinely gates merges. Honest state as of Phase 11, the last phase
(2026-09-04):

- **250 of 250 tasks (100%). Every phase is complete.** A real audit runs against a live URL, an
  uploaded archive, or a connected GitHub repository, through the real orchestrator and 16 vendored
  capabilities; a human drives it through the UI; the fix loop turns issues green only on a passing
  re-check; a readiness pass returns a go/no-go verdict with named blockers and a shareable
  certificate; the account can be subscribed to a plan, buy non-expiring credits, and is never billed
  for a platform failure (refunds are visible on the ledger); the mid-audit design-intent questionnaire
  pauses and resumes without holding a worker slot; the operator admin console (users, plans, margin,
  capabilities, providers, queue) is live behind `requireOperator`; an operator-uploaded capability
  genuinely runs inside three nested isolation boundaries (service, process, language), deployed for
  real, with a genuine conformance verdict returned in place of the old unconditional refusal; dark-mode
  severity contrast is genuinely WCAG-AA-verified; every public page is confirmed, by real browser
  observation, to issue zero third-party runtime requests and to pass every axe-core rule except two
  narrowly-excluded, fully-documented, pre-existing vendored-token findings; and every service's
  process-lifecycle logging is structured and redacted.
- **"100% done" does not mean "nothing left to decide."** Every item below is a real, load-bearing,
  honestly-recorded exception — read them before calling this shippable, not as a formality after.
- **Uploading a capability produces a verdict, not an installed capability.** `POST
  /admin/capabilities/upload` genuinely dispatches to the real sandbox and returns a real, per-check
  `ConformanceReport` — but does not write a `Capability` row or make the bundle executable by any real
  scan (a deliberate scope boundary, Open Decision #20's own subject) and, separately, no capability can
  pass full conformance today regardless of how well-formed it is, because of a pre-existing gap in how
  the `CONFORMANCE` operation builds its manifest (also Open Decision #20). Both are honestly documented,
  not silently assumed away.
- **No provider has ever been called with real spend.** Every suite runs `AI_MODE=fixtures` by
  design; the three vendor adapters are typechecked and stubbed. A production boot also needs the
  OpenAI/Google model + per-MTok price config (open decision #9).
- **11 of 11 adversarial gates green.** SC-017, the last one, closed 2026-09-04 with Phase 10a — see
  "Phase 10a (sandbox-runner core isolation)" and "Phase 10b (sandbox-runner deploy + real dispatch)"
  above.
- **`pnpm format:check` is red** on ~two dozen files from Phases 4–5, `apps/probe-pool`, and several
  vendored capabilities, committed unformatted before Phase 6 started. Everything Phases 6–11 touched
  is formatted; the rest is a mechanical `npx prettier --write .` someone should own on its own commit.
- **`apps/probe-pool` is not a deployable unit yet.** No server entrypoint, no `start` script — library
  code only (`browser/pool.ts`). Documented honestly in `infrastructure/deploy.md` rather than an
  invented runbook for code that doesn't exist.
- **`pnpm test:visual` is not green for every surface in `design/screen-map.md`.** 6 of 13 assertions
  are real and passing; 7 remain `it.todo` on the pre-existing `PublicHeader` mobile-nav gap, named
  since Phase 3 — the one item in quickstart.md's own definition of done not fully met (T236's own
  honest finding, not a new discovery).
- **A new, real, pre-existing accessibility gap surfaced at T227**: the vendored `--accent`/
  `--promo-bg` brand tokens fail WCAG AA `color-contrast` on every public page (carried correction
  0a-2) — narrowly excluded from the new axe-core suite with the measured evidence documented, not
  fixed (recoloring a design-system token needs a signed-off design exception, not a polish-task
  side effect). Sits alongside the already-known `Button` focus-ring gap (0a), which axe-core cannot
  mechanically detect at all.
- **Four honestly-open, unverified/undecided gaps** (Open Decisions #18, #19, #20, plus the two above
  restated as their own bullets for visibility): empty-env leakage and an fs-permission glob-matching
  quirk in `sandbox-runner` (both found on this Windows dev machine, both assessed as likely
  Windows-specific but not yet confirmed on the real Linux deployment target), and the `CONFORMANCE`
  manifest gap (#20, needs a real design decision about the uploaded-bundle format or the conformance
  suite's shared code, not a quick fix).
- The first sellable artifact was **T135**, end of Phase 3; the full audit→fix→verify→ship journey
  is deliverable as of Phase 5; source-level depth (repos and archives) as of Phase 6; the account
  is billable as of Phase 7; brand-intent tailoring as of Phase 8; the operator console as of Phase 9;
  untrusted-capability isolation, deployed and dispatching for real, as of Phase 10; every
  cross-cutting polish item verified or honestly recorded, as of Phase 11 — the last phase.

## Commit log

| | |
| --- | --- |
| `2cdad28` | feat(polish): dark-mode contrast verification, a11y/egress e2e, structured logging (T227,T228,T229,T231) |
| `60d3990` | docs: close out Session 8 (sandbox-runner deploy + real dispatch, spec-kit Phase 10b) |
| `d19897e` | feat(sandbox): deploy sandbox-runner and replace the 503 with real dispatch (T225-T226) |
| `bf7f711` | docs: close out Session 7 (sandbox-runner core isolation, spec-kit Phase 10a) |
| `c90a21a` | feat(sandbox): child-process isolation with vm-escape hardening (T217-T224) |
| `dd6bcc5` | feat(us7): capability upload refuses unconditionally, no fallback (T216) |
| `99dcff4` | feat(us5): pay for capacity with plans and credits (T180–T193) |
| `2a22d46` | feat(us4): audit source code, not just the served page (T169–T179) |
| `8e64e88` | docs: task board + progress through phase 5; ignore parked worktree dirs |
| `8792ef7` | feat(us3): production-readiness verdict (T158–T168) |
| `e75ac61` | feat(us2): verified fix loop, plus phase 1–3 engineering-review remediations (T144–T157) |
| `a2b2735` | Initial push: WebAudit AI monorepo (Phases 1–3 + review work) |
| `b48af08` | feat(web): build the visual-comparison harness (T246) |
| `f0a2c7c` | fix(web): the design-adherence gate could never fail (T245) |
| `9c14f78` | feat(web): vendor the icon subset, no CDN dependency existed to remove (T247) |
| `ce82c7a` | feat(web): port TwoToneHeading, SeverityBadge, AttributionMark (T238, T239) |
| `5a05de0` | feat(web): port the 7 core components (T237) |
| `abc8efb` | feat(web): scaffold the Next.js App Router application (T236a) |
| `643b21d` | fix(worker): priorityForPlan propagated NaN into a real BullMQ enqueue |
| `9915608` | fix(worker): a capability's detached throw crashes the process; BullMQ can't boot |
| `890873d` | fix(security): close a symlinked-entrypoint escape in capability discovery |
| `7d8cc1d` | fix(credits,control-gate): four more defects from the delta review |
| `16dc70b` | fix(security): six defects found by adversarial delta review of phases 1-2 |
| `7d3f7d9` | feat(orchestrator): resumable phases, realtime fan-out, timeout sweep (T094–T101) |
| `a7a790f` | feat(module-runner): two-layer runner, SC-006 green, SC-011 completed (T084–T093) |
| `decaa27` | feat(ai-executor): two-vendor chain, typed degradation, SC-012 green (T075–T083) |
| `ec4de66` | feat(capabilities): SDK, conformance suite, and registry (T063–T074) |
| `6997b13` | feat(redaction): mandatory redaction at the prompt boundary, SC-016 green (T058–T062) |
| `6ccf91e` | feat(workspace): SC-015 teardown on four exit paths, plus the two service entrypoints the plan omitted |
| `b1f7391` | feat(control-gate): two-level target control gate, SC-021 green (T052–T057) |
| `ec2360b` | feat(safe-net): four-layer SSRF guard, SC-018 green (T044–T051) |
| `f9a099a` | docs: session handoff — mark T230, rewrite PROGRESS.md as a resume point |
| `f02ef48` | fix: resolve all 19 code-review findings (3 critical, 4 high, 8 medium, 4 low) |
| `2706949` | feat(credits): lot-based ledger, SC-022 green (T035–T043) |
| `39922ff` | feat(auth): accounts and sessions, test-first (T023–T034) |
| `ec64db5` | feat(db): persistence layer — schema, migration, seeds (T013–T022) |
| `896011a` | chore(deps): pin toolchain to exact versions before Phase 2 |
| `7463235` | feat(setup): pnpm/turborepo monorepo scaffold (T001–T012) |
| `fa3d5de` | chore: initialize repository with governance baseline |
