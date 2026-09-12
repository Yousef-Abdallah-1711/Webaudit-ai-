# AI Engineering — Phase Kickoff Prompts

**Status (2026-09-12): all five phases below are complete.** T307-T312 were implemented using
these prompts and independently re-verified in a strict delta review — see
`docs/reviews/AI-ENGINEERING-TASKS.md`'s Status table and "Final verification" section for the
real, re-run results. **These prompts are kept as a historical record and as a template for a
future cross-cutting initiative of the same shape — do not re-run them against this initiative;**
there is nothing left to do.

Each block below is a **complete, self-contained prompt** for a fresh Claude Code (or other
agent) session that has no memory of the conversation that produced this initiative. Copy one
block verbatim as your first message to a new session to start that phase. Do not combine two
blocks into one session unless the block explicitly says its phase may run in parallel with
another.

**Before using any of these:** confirm the referenced files still exist at the stated paths and
that `docs/reviews/AI-ENGINEERING-TASKS.md`'s Status table still shows the phase you're about to
start as `NOT STARTED` — if someone already completed it, skip to the next one instead.

**Ordering:** Phase 1 → Phase 2 (benefits from Phase 1, not blocked by it) → Phase 3a / 3b (either
order, independent of Phases 1-2, can run in parallel in two separate sessions) → Phase 4 (only
after every other phase's Status row says DONE).

---

## Phase 1 prompt — T307 (promptVersion on AiInvocation)

```
Work in the repository at C:\Users\Yousef\Desktop\Projects\motakamel (a pnpm/Turborepo monorepo:
apps/api, apps/worker, apps/web, packages/*). This is WebAudit AI.

First read, in this order:
1. AGENTS.md (project rules, testing conventions, how this repo is structured)
2. docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md — read Part 7 (decision log, Decision 1)
   and Part 9 for context on why this task exists and what was already found. Do not re-derive
   this reasoning yourself; it is already settled.
3. docs/reviews/AI-ENGINEERING-TASKS.md — read the "How to use this document" section at the top,
   then read the full "T307" section in detail. That section is your complete, step-by-step
   implementation spec, including exact current code, exact target code, exact file paths, and
   exact test files to create.

Your task: implement T307 exactly as specified in that section. Nothing more, nothing less.
Specifically:
- Create packages/ai-executor/src/prompt-version.ts with computePromptVersion().
- Export it from packages/ai-executor/src/index.ts.
- Add an optional promptVersion field to AiRequest and AiInvocationRecord in
  packages/ai-executor/src/executor.ts, and thread it through the record() closure inside run().
- Add promptVersion to AiInvocationRow and recordInvocations() in
  packages/ai-executor/src/record.ts.
- Add a nullable promptVersion column to the AiInvocation model in
  apps/api/prisma/schema.prisma, then run
  `pnpm --filter @webaudit/api exec prisma migrate dev --name ai_invocation_prompt_version`
  against the local dev Postgres (check it's reachable first — DATABASE_URL is in .env; if the
  container isn't running, say so rather than working around it).
- Wire computePromptVersion into the two real call sites: apps/worker/src/module-runner/ai-layer.ts
  and apps/worker/src/orchestrator/master-report.ts (both import AiExecutor as a type-only import
  today — computePromptVersion needs a separate value-import line; the task doc shows the exact
  diff).
- Add packages/ai-executor/tests/unit/prompt-version.test.ts per the task doc's skeleton — check
  packages/ai-executor/tests/schema-failure.test.ts or chain-validation.test.ts for this repo's
  established pattern for constructing a RedactedPrompt directly in a test, and follow it rather
  than inventing a new one.

Do not touch T308, T309, T310, T311, or T312 — they are separate tasks with their own sessions.
Do not add anything not listed in T307's own acceptance criteria (no prompt registry, no admin UI,
no versioning beyond the one hash field).

Follow this repo's test-first convention (AGENTS.md): confirm what fails before you fix it where
applicable. All provider calls in tests are stubbed (AI_MODE=fixtures) — never spend real provider
credits.

When done, run exactly the commands listed under T307's "Verify" block in the tasks doc, report
the real pass/fail counts (not a summary), and update the Status table row for T307 in
docs/reviews/AI-ENGINEERING-TASKS.md to DONE with a one-line note on how it was verified — matching
the style already used for the T310/T311 rows in that same table.
```

---

## Phase 2 prompt — T309 (fixture-based prompt output-stability snapshots)

```
Work in the repository at C:\Users\Yousef\Desktop\Projects\motakamel (a pnpm/Turborepo monorepo:
apps/api, apps/worker, apps/web, packages/*). This is WebAudit AI.

First read, in this order:
1. AGENTS.md
2. docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md — Part 2 §L and §U, and Part 9 §9.1, for
   why this task is scoped narrowly (a regression snapshot, not a quality-scoring evaluation
   harness) and why that scoping is deliberate, not an oversight.
3. docs/reviews/AI-ENGINEERING-TASKS.md — read "How to use this document," then the full "T309"
   section. Also check the Status table: if T307 shows DONE, use its computePromptVersion export
   to label snapshot cases more informatively (optional refinement); if T307 is still NOT STARTED,
   proceed without it exactly as the T309 section describes — T309 does not require T307.

Your task: implement T309 exactly as specified. Specifically:
- Create apps/worker/tests/fixtures/prompt-snapshot-inputs.ts with the representative
  CapabilityFinding cases (no findings / one critical / mixed severity) given in the task doc.
  Before trusting the exact field shape shown there, check the real current CapabilityFinding
  type (packages/types) and cross-check against apps/worker/tests/adverse/
  hostile-capability-output.test.ts's own WELL_FORMED fixture, which the task doc names as the
  most reliable current reference.
- Create apps/worker/tests/unit/prompt-snapshots.test.ts using vitest's toMatchSnapshot(),
  capturing the actual text sent to a fixture provider (via its reply callback receiving
  request.text — do not snapshot the fixture provider's own fixed response, which proves
  nothing, per the task doc's explicit reasoning).
- The task doc flags one real open design question you must resolve by reading the actual source
  (not by guessing): how a capability's measured findings reach ai-layer.ts's renderMeasured() so
  your fixture findings actually appear in the captured prompt text. Read
  apps/worker/src/module-runner/index.ts's runModule to resolve this before writing the test body.
- Attempt the master-report snapshot (Step 3 in the task doc) using a minimal stub Prisma-shaped
  object. If it proves substantially harder than the module-prompt snapshots, it is acceptable to
  ship the module-prompt snapshots as a complete task on their own — but say so explicitly in your
  final report, do not silently drop it.
- Verify your own test is meaningful: temporarily edit SHARED_PREAMBLE or one module's prompt body
  (apps/worker/src/prompts/shared.ts or one of security.ts/seo.ts/performance.ts/testing.ts/ui.ts),
  confirm the snapshot test fails, then revert the edit exactly and confirm it passes again. Report
  that you did this and what you observed.

Do not touch T307, T308, T310, T311, or T312. Do not build a quality-scoring system, an LLM-judge,
or a golden human-graded dataset — this task is a stability/regression check only.

When done, run the commands listed under T309's "Verify" block, report real pass/fail counts, and
update the Status table row for T309 to DONE (or to a clearly-stated partial state if the
master-report snapshot was deferred — say exactly what was deferred and why).
```

---

## Phase 3a prompt — T308 (task-scoped AI chain override for master-report)

```
Work in the repository at C:\Users\Yousef\Desktop\Projects\motakamel (a pnpm/Turborepo monorepo:
apps/api, apps/worker, apps/web, packages/*). This is WebAudit AI.

First read, in this order:
1. AGENTS.md
2. docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md — Part 2 §D and Part 7 Decision 2, for
   why this is a narrow, static override and explicitly not a general model router.
3. docs/reviews/AI-ENGINEERING-TASKS.md — read "How to use this document," then the full "T308"
   section in detail. It contains confirmed, exact current source for every file you'll touch
   (packages/ai-executor/src/from-env.ts, packages/ai-executor/src/index.ts,
   apps/worker/src/orchestrator/orchestrator.ts's OrchestratorOptions interface and its
   runMasterSynthesis call site at line 735, apps/worker/src/index.ts's executor construction at
   line 238 and createPhaseHandler call at line 249) — these were read directly from the real repo
   during the audit that produced this task, so implement against them precisely rather than
   re-deriving the wiring yourself. If the real current code has drifted from what's quoted (the
   audit is dated 2026-09-12), stop and note the discrepancy rather than silently reconciling it.

Your task: implement T308 exactly as specified. Specifically:
- Add createMasterReportExecutorFromEnv() to packages/ai-executor/src/from-env.ts.
- Export it from packages/ai-executor/src/index.ts alongside createExecutorFromEnv.
- Add the optional masterReportExecutor field to OrchestratorOptions in orchestrator.ts, and
  change the runMasterSynthesis call site to use `options.masterReportExecutor ?? options.executor`.
- In apps/worker/src/index.ts, construct masterReportExecutor right after the primary executor is
  built, and pass it into the createPhaseHandler({...}) call alongside executor.
- Document the new optional AI_CHAIN_MASTER_REPORT env var in .env.example.
- Create packages/ai-executor/tests/task-scoped-chain.test.ts with the four tests given in the
  task doc (unset → same instance; set → distinct validated chain; malformed → throws; fixture
  mode → ignored).

Do not touch T307, T309, T310, T311, or T312. Do not add a per-module override or any
cost/latency/quality-scoring logic — this is one static override for one task shape
(master-report), nothing more.

When done, run the commands listed under T308's "Verify" block, report real pass/fail counts and
a real `pnpm typecheck` result, and update the Status table row for T308 to DONE with a one-line
verification note.
```

---

## Phase 3b prompt — T312 (prevent duplicate AI-layer execution on BullMQ stalled-job recovery)

```
Work in the repository at C:\Users\Yousef\Desktop\Projects\motakamel (a pnpm/Turborepo monorepo:
apps/api, apps/worker, apps/web, packages/*). This is WebAudit AI.

First read, in this order:
1. AGENTS.md
2. docs/reviews/AI-ENGINEERING-CURRENT-VS-TARGET-AUDIT.md — Part 9 §9.4 and §9.5 IN FULL. This is
   the most important reading for this task: it explains a real, non-obvious BullMQ behavior (a
   stalled scanPhase job is reprocessed by BullMQ's own stall-recovery independent of the
   `attempts: 1` setting, causing duplicate real AI-provider spend on worker crash/restart) that
   you must understand before touching any code, not just follow mechanically.
3. docs/reviews/AI-ENGINEERING-TASKS.md — read "How to use this document," then the full "T312"
   section, including its Step 4 ("the trade-off this task introduces — read before shipping").
   That step is not optional reading: this fix changes user-visible behavior (a stalled scan now
   fails-and-refunds instead of silently completing at double cost), and you are required to
   confirm — by actually reading apps/worker/src/orchestrator/timeout.ts, not by assuming — that
   the existing sweepTimedOutScans mechanism (FR-038) will correctly catch and refund a scan left
   in this state before you ship this change.

Your task: implement T312 exactly as specified. Specifically:
- Add SCAN_PHASE_MAX_STALLED_COUNT = 0 to packages/config/src/queues.ts, with a module comment
  extending (not replacing) the existing DEFAULT_JOB_OPTIONS reasoning already in that file.
- Add SCAN_PHASE_MAX_STALLED_COUNT to both the import-from-@webaudit/config list and the
  re-export list in apps/worker/src/queue/queues.ts (it does not use `export *`, so a new
  constant is invisible until added there explicitly — the task doc shows the exact current file
  content to edit).
- In apps/worker/src/queue/workers.ts, add `type WorkerOptions` to the existing bullmq import
  (line 44), give the build() helper an optional third `extra: Partial<WorkerOptions>` parameter,
  and pass `{ maxStalledCount: SCAN_PHASE_MAX_STALLED_COUNT }` only when constructing the
  scanPhase worker — reverify and maintenance must be unchanged.
- Extend apps/worker/tests/unit/queues.test.ts's existing "constructs every production worker
  without throwing" test with the three new assertions given in the task doc (scanPhase has the
  new value; reverify and maintenance do not).

Do NOT attempt to build a timing-based integration test that actually simulates a real stall — the
task doc explains why that would be flaky and why this repo's own convention (asserting against
.opts.* directly) is the right tool here.

Do not touch T307, T308, T309, T310, or T311. Do not make module execution itself idempotent
(e.g. checking for an existing CapabilityExecution before re-running); that is explicitly out of
scope — this narrower config fix is what closes the gap.

Before considering this task done, explicitly state in your final report: (a) what you found when
you read timeout.ts to confirm the sweep will catch this failure mode, and (b) whether you believe
the resulting user-facing trade-off (occasional failed-and-refunded scan vs. today's occasional
double-cost-but-successful scan) is acceptable — if you have any doubt, say so explicitly rather
than shipping silently; this is a product judgment call the task doc deliberately does not make
for you.

When done, run the commands listed under T312's "Verify" block, report real pass/fail counts, and
update the Status table row for T312 to DONE (or to BLOCKED, with a clear reason, if the Step 4
confirmation raised a concern you could not resolve yourself).
```

---

## Phase 4 prompt — Final verification (run only after T307-T312 all show DONE)

```
Work in the repository at C:\Users\Yousef\Desktop\Projects\motakamel. This is WebAudit AI.

First read docs/reviews/AI-ENGINEERING-TASKS.md in full, especially its Status table and its
"Final verification" section at the very end of the file. Confirm every row in the Status table
(T307-T312) says DONE before proceeding — if any row is not DONE, stop and report which one,
rather than attempting to verify unfinished work.

Your task: run every command listed in the "Final verification" section, in order, and check every
item in its manual-inspection checklist by actually looking (reading the diff, reading the
relevant source, running a query) — not by assuming. Specifically:
- pnpm typecheck
- pnpm lint
- pnpm exec vitest run --project unit --no-file-parallelism
- pnpm exec vitest run --project adverse --no-file-parallelism
- pnpm exec vitest run --project unit packages/ai-executor --no-file-parallelism
- pnpm exec vitest run --project unit apps/worker --no-file-parallelism

Then work through every bullet in that section's manual-inspection checklist (no real provider
calls in tests; no duplicate credit-charging code touched; no duplicate invocation-accounting
logic introduced; promptVersion consistency; scanId propagation for T310; the prompt-injection
boundary test for T311 still passes; T308's fallback and malformed-chain behavior; the
FAILED/DEGRADED/NOT_APPLICABLE distinction is untouched; the admin margin report still runs
cleanly against the schema with the new nullable promptVersion column).

Report the real pass/fail counts for every command — do not summarize as "tests pass" without the
actual numbers, per this repo's own stated verification standard (AGENTS.md: "Report actual
checks, failures and unverified scope"). If anything fails or looks wrong, stop and report it
clearly rather than proceeding to declare the initiative complete.

If everything passes, update docs/reviews/AI-ENGINEERING-TASKS.md's Status table to note the
final verification pass with today's date, and consider this cross-cutting initiative (T307-T312)
closed.
```
