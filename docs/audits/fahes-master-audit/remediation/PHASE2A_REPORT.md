# Phase 2A Report

Date 2026-10-22. **Documentation-only phase; no spec, code, schema, migration, infrastructure or test file was changed; nothing staged, committed, stashed or reset.**

## Baseline (verified at start and end)
HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`, branch `main`; status 35 entries before the phase's files, 24 files +215/−21; `specs/009` 10 files +169/−4; nothing staged; `.specify/feature.json` → SPEC 011 (unchanged). Phase 1 documents read; all `Answer:` lines in `OWNER_DECISIONS_REQUIRED.md` remain blank by design (answers live in the conversation and in `PHASE2A_DECISION_RESOLUTION.md`).

## Owner-decision gate: PARTIAL
- Accepted: **Q3**, **Q10**, **Q2 option B** (as an option).
- Accepted in part: **Q1** (a+b+c affirmed; **both dates are unfilled placeholders**, none inferred).
- Not authorized: the Q2 amendment *text* (needs separate explicit approval and two follow-up answers).
- Open and untouched: Q4–Q9.

## Files created (new; destinations verified absent)
`remediation/PHASE2A_DECISION_RESOLUTION.md`, `remediation/FUTURE_COMMIT_PLAN.md`, `remediation/PHASE2A_REPORT.md`. **Not created:** `PHASE2A_CHANGELOG.md` (no source file changed, so it would record nothing) and any amendment draft (writing one would choose Q2.1/Q2.2 for the owner).

## Repairs applied: none
RM-A4, RM-B4, RM-B6, RM-C9, RM-E9 are unapplied per Q10. RM-B4/B6 are in files U-1 also touches, so they follow the U-1 commit (CS-C). RM-A4/E9 touch only untracked 012 files; owner to confirm whether they may be applied before 012 is tracked.

## Findings of this phase
1. Under B, `009/spec.md:383-385` ("`DISPATCHED` = a queue job exists") is no longer true; the amendment must redefine `DISPATCHED` or reorder states (Q2.1).
2. **Correction to Phase 1** (`U1_PICKUP_ORDERING_OPTIONS.md`): it said Option B makes `DISPATCHED→REFUSED` unnecessary. That overlooked a crash/deadline window between `ADMITTED→DISPATCHED` and `DISPATCHED→RUNNING`, where the sweep needs a terminal edge from `DISPATCHED` (Q2.2). The Phase 1 file is left as written; this report is the correction.
3. SPEC 012 already assumes the pickup reading (FR-195 leaves a refused unit `PLANNED`; `sec_refuse_unclaimed_unit` is PLANNED-only), but T814 requires `REFUSED` from `DISPATCHED`, so 012's tests assume that edge exists.
4. 011 normative files reference neither `DISPATCHED` nor the added edges.

## Validation performed
`git status --short`, `git diff --stat` (whole tree and `specs/009`), `git diff --cached`, `.specify/feature.json`, file-existence checks before each write; greps of 009/010/011/012 for `DISPATCHED`/edge references with file:line capture. Not performed: tests (none in scope), SpecKit Analyze, any diff inspection of changed spec files (none changed).

## Readiness for SPEC 007
**Planning: yes**, 007 has no dependency on the open items (its only open items, AR-1 and AR-14, are optional/recommended), subject to reserving AR-13 role hooks (Q6 open). **Implementation: not yet** — wait for the U-1b amendment to be approved and the 009 provenance separated, because 007 tasks and the 009 task list share the status/authorization vocabulary, and there is still no CI. No implementation was started.

## Next step
The owner answers the form returned with this report (Q1 dates; Q2.1; Q2.2; approval to draft the amendment). Then: Phase 2B drafts the amendment text for review (no commit), applies it only after approval, and prepares CS-A validation evidence.
