# Audit Evidence Index

Audit 2026-10-19. "Observed" = output seen by the audit session. Scratch scripts live outside the repo in the session scratchpad (`gen_trace.py`, `gen_find.py`, `trace.py`) and were used only to count and to produce the two CSV files.

## A. Git and working-tree evidence

| ID | Command / source | Observed result |
|---|---|---|
| E-01 | `git rev-parse --show-toplevel`; `git branch --show-current`; `git rev-parse HEAD`; `git stash list`; `git log` | root `C:/Users/Yousef/Desktop/Projects/motakamel`; `main`; `e42577304a2ccec873b30bbbf1d712e6348f6196` (2026-10-08 21:33:18 +0300); empty stash; 222 commits |
| E-02 | `git status --short` (start) | 34 entries: 24 `M` (14 `apps/web/**`, 10 `specs/009*`), 10 `??` (`apps/web/audit-sweep.mjs`, `auth-state.mjs`, `docs/audits/frontend-design/`, four `showcase-*`, `scan-deadline-contract.md`, `specs/011*`, `specs/012*`). End: 35 (adds `docs/audits/fahes-master-audit/`) |
| E-03 | `git diff --stat`; `git diff HEAD --stat -- specs/009*` | 24 files +215/−21; 009: 10 files +169/−4 |
| E-04 | `git grep -n -E 'PLANNED *(->|→) *REFUSED|DISPATCHED *(->|→) *REFUSED' HEAD -- specs` | **no output** (not in committed baseline). Working tree matches in 009 `execution-unit-contract.md`, `scan-deadline-contract.md`, `plan.md`, `tasks.md` and 011/012 docs |
| E-04b | `git ls-files specs/011* specs/012*` | 0 tracked |
| E-04c | `git log -- specs/006…010` | single commit `0afb9f7` 2026-10-08 "docs: add scan platform audit and implementation backlog" |
| E-04d | `cat .specify/feature.json` | `{"feature_directory": "specs/011-source-backend-database-testing-platform"}` |

## B. Code reality evidence

| ID | Command / source | Observed result |
|---|---|---|
| E-05 | Grep (ripgrep) for `ExecutionGrant\|ExecutionClass\|ScanPlan\|ExecutionGraph\|ExecutionUnit\|KillSwitch\|SafetyAdmission\|ExecutionLease\|SafetyBudget\|CredentialBroker\|SOURCE_EXECUTION\|SOURCE_STATIC\|TestIdentity\|deadlineMs\|EvidenceEnvelope\|fencing` in `{apps,packages,scripts,infrastructure}/**/*.{ts,tsx,prisma,sql,json,yml,mjs}` | **0 matches** |
| E-06 | `test -e` of planned paths | absent: `packages/security-registry`, `packages/security-engine`, `apps/credential-broker`, `apps/api/src/services/{security,planning,authorization,safety}`, `apps/worker/src/security`, `apps/worker/tests/contract/security`, `packages/source-execution-contract`, `packages/source-analysis`. `apps/` = api, probe-pool, sandbox-runner, web, worker; `packages/` = ai-executor, capabilities-vendored, capability-sdk, config, redaction, safe-archive, safe-net, scoring, types |
| E-07 | `apps/api/prisma/schema.prisma` model/enum lines; migrations dir | 29 models (User … EmailSendAttempt), 20 enums (incl. `ControlLevel`, `ScanKind`, `ScanState`, `ModuleState`); 21 migrations, latest `20260923010000_issue_fixable` |
| E-08 | `git log -3 -- apps/api/src apps/worker/src packages` | latest `a7db433` 2026-10-01 |
| E-10 | file reads | `packages/config/src/refund.ts:15-25` (`refundForUndelivered`: proportional by area count; full refund when 0 delivered; floor); `packages/types/src/domain.ts:84` `MODULE_STATES_SCORED = ['COMPLETE','DEGRADED']`; `apps/worker/src/orchestrator/timeout-scheduler.ts:25` `DEFAULT_MAX_DURATION_MS = 15 * 60_000`, env `SCAN_TIMEOUT_MS` |
| E-12 | file counts | `*.test.ts` under apps/packages (excl. node_modules): 283; TS file counts: control-gate 5, worker orchestrator 20, sandbox-runner 12, probe-pool 2, safe-net 10, redaction 5, capability-sdk 8, capabilities-vendored 23 |

## C. Specification counts (reproducible with the regexes in the scratch scripts)

| ID | Result |
|---|---|
| E-09a | FR ids (unique, bold `**FR-n`): 006=28, 007=24, 008=27, 009=47, 010=53, 011=158 (contiguous), 012=201 (contiguous) |
| E-09b | Task lines (`- [ ]`/`- [X] T…`): 006=15 (all checked), 007=42 (0 checked), 008=36 (0), 009=49 (39 checked, 10 unchecked = T-U1-1..10), 010=48 (all checked), 011=347 (0), 012=538 (0) |
| E-09c | FRs never cited in `tasks.md`: 011=0, 012=0, 009=40, 010=39; 007 and 008 have 10 and 13 FRs without an explicit citation |
| E-09d | 012: 83 distinct non-prefix `SEC_` tokens in contracts; 19 contracts; 20 `model` blocks in data-model; 19 ` ```mermaid ` blocks in plan+data-model; checklists 207 checked / 30 open |
| E-09e | Checklists (checked/open): 007 74/0, 008 61/0, 009 78/0, 010 110/0, 011 238/0 |
| E-09f | File counts: 011 = 37 `.md`; 012 = 64 `.md` |

## D. Key document evidence (path · section)

| Claim | Source |
|---|---|
| 012 status "NOT FROZEN"; later passes are self-reviews | `specs/012-…/spec.md:7` |
| Owner decisions, OD-1…OD-4, AR-8/9 | `specs/012-…/master-owner-decision-register.md` §1–5; `final-owner-approval-package.md` D1–D9 |
| Upstream classification, AR-1…AR-22 | `specs/012-…/upstream-amendment-requests.md` (summary table); `final-closure-readiness.md` §2 |
| Independent re-review scoreboard (33/19/1), N-1…N-18, verdict READY-WITH-REPAIRS | `specs/012-…/adversarial-rereview.md` §2, §4, §7 |
| Blockers B-1…B-13 | `specs/012-…/closure-review.md` §6; safe commit sequence §7 |
| MA-01…MA-19 | `master-audit-findings.md` §2, §4 |
| IC-1…IC-7, delta F1…F7 | `final-certification-repair.md` |
| 012 does not run SpecKit Analyze; mermaid parse claim | `master-validation-results.md` §3–4 and later sections |
| 011 FROZEN header, AG1–AG10, P1–P8 UNCONFIRMED | `specs/011-…/spec.md:7, 380-387, 395-404`; `closure-review.md` |
| U-1 request/resolution | `specs/011-…/upstream-amendment-requests.md`; `specs/009-…/spec.md` diff; `contracts/scan-deadline-contract.md` |
| 006 Draft; ADR index; open decisions | `specs/006-…/spec.md:7`; `decisions.md` ADR-001…009, §Open Decisions (line 149) |
| 009/010 task lists are planning logs | `specs/009-…/tasks.md` Phase 0–12 headings; `specs/010-…/tasks.md` header |

## E. Claims that remain UNVERIFIED

Independent reviews cited in repair matrices after 2026-10-11 (not stored) · owner approvals of 2026-10-11 (recorded only in 012 docs) · 012 Mermaid 19/19 parse · 011 deadline simulation · legacy test status · legacy defect T-HARDEN-1 · contents of contract bodies not read · whether managed Postgres can satisfy data-model 4.10E.

## F. Findings → evidence

Every row of [FINDINGS_REGISTER.csv](FINDINGS_REGISTER.csv) names its source document; every row of [SPEC_TRACEABILITY.csv](SPEC_TRACEABILITY.csv) cites `specs/<spec>/spec.md` and `tasks.md`, and its code column references E-05/E-06.
