# SPEC 012 — Master Validation Results

**SELF-REVIEW, NOT INDEPENDENT.** Date 2026-10-16. Mechanical checks were produced by scratch scripts outside the repository (a range-aware traceability script and shell/awk counters); they are not the official SpecKit Analyze. Diagram checks are block counts only: **no diagram was rendered**. **No planned test was executed or claimed as passing.**

## 1. Before and after

| Check | Before (start of this pass) | After |
|---|---|---|
| FRs, contiguous and unique | 201 | 201 |
| Tasks, unique | 491 | **506** (T829 to T836 from the seventh repair; T837 to T851 added here) |
| FRs without a task / tasks without an FR / FR citations outside 1..201 | 0 / 0 / 0 | 0 / 0 / 0 |
| Traceability table versus range-aware regeneration (`FR-NNN..FR-MMM` expanded) | 0 differences | 0 differences after regeneration (the table was updated for the new tasks) |
| Reason codes registered | 83 | 83 (unique; each in a contract; 0 unregistered tokens; prefix tokens such as `SEC_BUDGET_` excluded) |
| Planned Prisma models | 20 | 20 (one added column, `MutationIntent.mutationOrdinal`, and one added unique index) |
| Migration identifiers | M012-0, 1, 2, 3, 4, 5, 5b, 5d, 5e, 7, 5c, 6 (one M012-7) | unchanged |
| Mermaid blocks | 19 (16 plan, 3 data-model) | 19 (three edited, structure only) |
| Checklist items | 214 (191 checked, 23 open) | **220 (195 checked, 25 open)**; each open item labelled |
| Contracts | 19 | 19 |

Note: the pre-pass figures come from the seventh repair's own report; the task count at the start of this pass was recomputed as 491.

## 2. Stale-text greps over normative files (all clear except intended negative statements)

`readOnlyDeclared`, `requesterIdentity`, `live and fenced`, `unfenced`, `stale F07 lease`, `jarDisposed` (only in prohibitions), `validated fixture response`, `CLEANUP_PENDING` (only in the sentence that says it is not used), `insert-only` (only where it describes the old state or the new function-only rule), `unit is REFUSED/BLOCKED with SEC_BROKER`, `any registered principal`, `sole terminal path`, `REDIRECT_LOCATION` (negative statements and tests only), dependent `SKIPPED`.

## 3. Working tree

`git status --short` lists the same 34 entries as at the start of the session (24 modified including the 10 SPEC 009 U-1 files and 14 frontend files, 10 untracked including `specs/011-*`, `specs/012-*` and `scan-deadline-contract.md`); `git diff --stat -- specs/009-*` is still 10 files, 169 insertions, 4 deletions; no diff in 006, 007, 008 or 010; `.specify/feature.json` unchanged (it still points at SPEC 011). Existing 012 files keep CRLF line endings; new files are LF.

## 4. Not done

SpecKit Analyze (it would persist `.specify/feature.json`); any rendering of diagrams; any execution of tests; any implementation, migration, commit, push, deployment or freeze.


---

## Final-pass validation (same session)

| Check | Result |
|---|---|
| FRs | 201, contiguous |
| Tasks, unique and linked | 519; 0 FRs without a task, 0 tasks without an FR, 0 citations outside 1..201; range-aware regeneration equals the table (0 differences) |
| Reason codes | 83, unique, each in a contract, 0 unregistered tokens |
| Planned models | 20 (two added columns) |
| Migration identifiers | unchanged, one M012-7 |
| Contracts | 19 |
| Checklist items | 223 (197 checked, 26 open; every open item has a class label) |
| **Mermaid** | **19 of 19 blocks parse with the real Mermaid 10.9.1 parser** (installed outside the repository; syntax only, no image rendering). The earlier "0 structural problems" claim was wrong: three blocks failed to parse and were corrected (MA-19) |
| SpecKit | `check-prerequisites.ps1 -Json -PathsOnly` run read-only with `SPECIFY_FEATURE_DIRECTORY=specs/012-...`: it resolved the SPEC 012 paths and `.specify/feature.json` was byte-identical afterwards (hash compared; it still points at SPEC 011). The Analyze skill itself was **not** invoked, because its non-`-PathsOnly` prerequisite call persists `feature.json`; its consistency checks (duplication, coverage, contradictions) were performed with the scripts and greps above, so this is not an official Analyze run |
| Stale-text sweep | `readOnlyDeclared`, `requesterIdentity`, `live and fenced`, worker SELECT/INSERT statements, "insert-only" and the worker-evaluator placement: clear except intended negative statements |
| Working tree | 34 entries, identical to the start of the session; SPEC 009 still 10 files, 169 insertions, 4 deletions; no change outside `specs/012-security-auth-api-testing-platform/`; `.specify/feature.json` unchanged |

No planned test was executed or claimed as passing.


---

## Certification-repair validation (IC-1 to IC-7)

Recounted after the repairs: 201 FRs; **530 tasks** (T865 to T875 added), 0 FRs without a task, 0 tasks without an FR, traceability table equal to the range-aware regeneration; 83 reason codes; 20 models; 19 contracts; **230 checklist items (202 checked, 28 open, all 28 classed)**; 19 of 19 Mermaid blocks parse with the existing Mermaid 10.9.1 parser (syntax only). SpecKit Analyze not run; `.specify/feature.json` unchanged. No planned test executed.


---

## F1 to F7 repair validation

Recounted after the repairs: 201 FRs; **538 tasks** (T876 to T883 added), 0 FRs without a task, 0 tasks without an FR, traceability table equal to the range-aware regeneration; 83 reason codes; 20 models; 19 contracts; **237 checklist items (207 checked, 30 open, all 30 classed)**, identifiers unchanged, `secrets-session-isolation.md` ordered; Mermaid blocks parsed with the existing Mermaid 10.9.1 parser (syntax only). SpecKit Analyze not run; `.specify/feature.json` unchanged. No planned test executed.
