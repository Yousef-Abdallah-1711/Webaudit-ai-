# Future Commit Plan (no commands executed; the owner runs every commit)

Basis: owner answers Q3 and Q10 (`PHASE2A_DECISION_RESOLUTION.md`). HEAD at planning time `e42577304a2ccec873b30bbbf1d712e6348f6196`. Rules for every step: stage **explicit paths only**; never `git add -A`, `git add .`, `git add -u`, `git clean`, `git reset --hard`, `git stash -u`, `git checkout -- .`; run the pre-commit check below; the assistant never stages or commits.

## Global exclusions (must never appear in any spec commit)

- Modified: `apps/web/app/(admin)/admin/billing/page.tsx`, `apps/web/app/(admin)/admin/capabilities/page.tsx`, `apps/web/app/(admin)/admin/page.tsx`, `apps/web/app/(dashboard)/settings/page.tsx`, `apps/web/app/tokens/colors.css`, `apps/web/app/tokens/dark.css`, `apps/web/components/admin/AdminShell.tsx`, `apps/web/components/dashboard/Sidebar.tsx`, `apps/web/components/marketing/remediation.tsx`, `apps/web/components/scan/InputTabs.tsx`, `apps/web/components/ui/Badge.tsx`, `apps/web/components/ui/Eyebrow.tsx`, `apps/web/components/ui/TwoToneHeading.tsx`, `apps/web/tailwind.config.ts` (14 files, 2 line-ending warnings aside).
- Untracked: `apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/`.
- `.specify/feature.json` (unmodified; keep it that way).
- `docs/audits/fahes-master-audit/` (the audit and remediation documents): **no commit decision has been made** by the owner; treat as its own optional change set (CS-E below), never mixed with specs.
- `specs/012-security-auth-api-testing-platform/`: stays untracked (Q3c).

## Order and gating

| # | Change set | Gate before the owner commits it | Depends on |
|---|---|---|---|
| CS-0 | (prerequisite, no commit) Q1 dates supplied; Q2.1 and Q2.2 answered; **amendment text approved explicitly** and applied to the 009 files by the assistant in a later phase; owner reviews the diff | owner approval of the amendment text | — |
| CS-A | SPEC 009 U-1 + Q2 amendment (docs only) | all CS-0 items; diff review; checks below | CS-0 |
| CS-B | SPEC 011 (docs only) | CS-A committed; 011 text re-validated against the committed 009 (no `DISPATCHED`/edge references found in 011 normative files on 2026-10-22; re-check) | CS-A |
| CS-C | 009 follow-up repairs RM-B4 and RM-B6 | CS-A committed; they edit the same 009 files, so they cannot be in CS-A | CS-A |
| CS-D | 012-only repairs RM-A4, RM-E9, and the wording alignment of 012 to the approved amendment | **only if 012 is ever tracked** (Q3c keeps it untracked); until then they can be applied to the untracked files without a commit — owner to confirm | Q3c, CS-A |
| CS-E | Audit and remediation documents (optional) | owner decision | none |
| CS-F | RM-C9 (note that the Redis queue admission gate is not F07) — location to be chosen (`PROJECT_MAP.md` or a 008 implementation note) | owner chooses location; it is not a SPEC 009/011 change | none |
| later | SPEC 012 commit | its open decisions resolved **and** independent review complete (Q3c; definition of independence is open, Q9); freeze not implied | Q4–Q9 |

## CS-A path allowlist (exactly 11 paths)

```
specs/009-core-scan-execution-platform/spec.md
specs/009-core-scan-execution-platform/plan.md
specs/009-core-scan-execution-platform/data-model.md
specs/009-core-scan-execution-platform/research.md
specs/009-core-scan-execution-platform/tasks.md
specs/009-core-scan-execution-platform/contracts/evidence-envelope-contract.md
specs/009-core-scan-execution-platform/contracts/execution-plan-contract.md
specs/009-core-scan-execution-platform/contracts/execution-runtime-contract.md
specs/009-core-scan-execution-platform/contracts/execution-unit-contract.md
specs/009-core-scan-execution-platform/contracts/runtime-finalization-contract.md
specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md   (untracked: new file)
```
Currently verified: 10 modified (+169/−4) and 1 untracked. The amendment may add lines to these files; it must **not** add other files without the owner's approval.
Suggested message: `docs(009): record controlled amendments U-1 (plan-level scan deadline) and U-1b (pickup-ordering)` — wording is the owner's.

## CS-B path allowlist

```
specs/011-source-backend-database-testing-platform/        (37 files, all .md; verified 2026-10-22)
```
Explicit file paths or this single directory path are both acceptable; no other path.

## CS-C allowlist (after CS-A)

```
specs/009-core-scan-execution-platform/contracts/execution-runtime-contract.md   (RM-B4)
specs/009-core-scan-execution-platform/plan.md                                   (RM-B6)
specs/009-core-scan-execution-platform/data-model.md                             (RM-B6, whichever side is harmonized)
```

## Pre-commit validation (owner runs; evidence the assistant will prepare in the later phase)

1. `git diff --cached --name-only` equals the allowlist exactly (no `apps/`, no `showcase-`, no `.specify/`, no `docs/audits/frontend-design`).
2. `git diff --cached --stat` matches the expected numbers recorded in the later phase report.
3. `git status --short` after staging shows the global exclusions still unstaged/untracked.
4. `git diff --cached --check` clean; do not normalize line endings (012 documents say its older files are CRLF; not re-verified here).
5. For CS-A: every statement of the amendment is traceable to an approved Q2/Q2.1/Q2.2 answer, and the Q1-dependent header text is absent until the dates exist.
6. For CS-B: re-run the grep of 011 for `DISPATCHED`, `ADMITTED`, `PLANNED->REFUSED`, `DISPATCHED->REFUSED`; any hit is reviewed against the committed CS-A.
7. No application, schema, migration, infrastructure or test path is in any set.

## Does U-1 have to be finalized before 011 is frozen or committed?

Per Q3 yes: 011 is committed only after U-1 (with the Q2 amendment) is committed. 011's own header already says FROZEN and its AG2 depends on U-1; committing 011 does not by itself record an owner freeze beyond what Q1-style dating would require — **no 011 freeze/approval date has been supplied; none is inferred**.
