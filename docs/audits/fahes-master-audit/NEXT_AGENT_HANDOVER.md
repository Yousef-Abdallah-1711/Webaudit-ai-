# Next-Agent Handover

Written 2026-10-19 by the audit session. Read [MASTER_AUDIT_REPORT.md](MASTER_AUDIT_REPORT.md) sections 1, 12, 13 first. Everything here is DOCUMENTED or VERIFIED as labelled there; this file adds no new claims.

## 1. Current verified state

* Branch `main`, HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`. Application code last changed 2026-10-01.
* **No requirement of SPEC 007–012 is implemented.** 0 spec-owned symbols, packages, services or schema entities exist. 0 spec-owned tests exist. No test was run by the audit.
* SPEC 006 header: Draft. 007/008/009/010 headers: frozen. 011: FROZEN header, **untracked**. 012: **NOT FROZEN**, untracked. 009 amendment U-1 is **uncommitted**.
* Counts that reproduce: 012 = 201 FRs / 538 tasks / 83 reason codes / 20 models / 19 contracts / 237 checklist items (207 checked, 30 open); 011 = 158 FRs / 347 tasks.

## 2. What remains unresolved

Owner: OD-1, OD-2, OD-3, OD-4, P14, P16, P17, D6 batch (P4, P5, P6, P8, P9, P12, P18), AR-8, AR-9, 006 status, 011 P1–P8 (see [DECISIONS_AND_AMENDMENTS.md](DECISIONS_AND_AMENDMENTS.md)).
Upstream: AR-13, AR-19, AR-22 (REQUIRED FOR ACTIVATION), AR-18, AR-17, AR-15, AR-20, AR-21.
Engineering: everything. Process: no independent review of 012 after 2026-10-11.

## 3. Recommended first action

**Do not write code yet.** Ask the owner to approve (or decline) a docs-only commit sequence for 009 U-1 then 011 (IMP-G01/G02). Then produce implementation task lists for 009 and 010 (IMP-G05/G06). Only then start 007 (IMP-G07). Project rule: implementation is delegated through `/codex-delegate` (CLAUDE.md); Claude briefs, re-verifies the diff and gates, and commits.

## 4. Safe next commands / files

```
git status --short                                   # expect the 34 pre-existing entries + docs/audits/fahes-master-audit/
git diff --stat -- specs/009-core-scan-execution-platform   # expect 10 files, +169/-4
git grep -n -E "PLANNED *-> *REFUSED" HEAD -- specs  # expect no output (U-1 not committed)
cat .specify/feature.json                            # points at 011
```
Files: `PROJECT_MAP.md`, `AGENTS.md`, `specs/006-scan-architecture-v2/{decisions,roadmap}.md`, `specs/007-…/tasks.md`, `specs/008-…/tasks.md`, `specs/009-…/contracts/scan-deadline-contract.md`, `specs/012-…/{master-owner-decision-register,final-owner-approval-package,upstream-amendment-requests,final-closure-readiness}.md`.

## 5. Critical invariants (must hold in every implementation)

Ownership ≠ authorization (ADR-004) · per-execution-class grants (007) · authorization re-checked at plan, dispatch, and every request · admission and budgets atomic in PostgreSQL; Redis only accelerates (008) · leases expire and are fenced; fail closed on any internal error · kill switch precedence over everything · hostile customer code never runs in an ordinary worker (ADR-003) · evidence append-only, redacted before storage (ADR-009) · one terminal-finalization authority per unit (009 rule 1; reconcile AR-18 item 5 first) · no AI judgement in safety/authorization decisions · passive path and legacy 15-minute sweep unchanged for passive-only scans (ADR-006 parallel run) · every non-passive feature default-off and fail-closed behind gates.

## 6. Working-tree modifications that MUST be preserved

* `specs/009-core-scan-execution-platform/**` (10 modified files + untracked `contracts/scan-deadline-contract.md`) — the U-1 amendment.
* `specs/011-source-backend-database-testing-platform/` and `specs/012-security-auth-api-testing-platform/` (untracked, not backed up in Git).
* 14 modified `apps/web/**` files, `apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/` — someone's in-progress UI work.
* `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/`.
* **Never** `git add -A`, `git clean`, `git reset --hard`, `git stash -u`, or `git checkout -- .`.

## 7. Tests that must eventually run

Legacy regression (must stay green): existing timeout/refund/cancel/scan-phase tests (`pnpm test`, `pnpm test:adverse`), serialised, with `TEST_DATABASE_URL` (never the dev DB). v2: 007/008 adverse suites; 009 U-1 AC-1…AC-20; 011 isolation acceptance (9 items, real provider, Linux CI); 012's planned tests (538 tasks; T650 timing measurements; T814 transition-policy equality; CHK044–CHK057 DB-role checks on the target platform). Mermaid: actually render, not only parse.

## 8. Decisions requiring owner input

See DECISIONS_AND_AMENDMENTS.md §1 — top three for sequencing: **AR-8/AR-9** (commit provenance), **OD-2** (who schedules AR-13/AR-19), **OD-4** (Mode S vs P).

## 9. Do NOT assume

* "Frozen" ≠ implemented ≠ committed ≠ owner-confirmed.
* A checked task in 006/009/010 is a planning step, not code. 007/008/011/012 tasks are all unchecked.
* 012 "ADEQUATE / REPAIRED_IN_DOCUMENTS_ONLY" is not verified; the later reviews it cites are not in the repo.
* 012's tenant isolation holds only in Mode S (undecided) and only after AR-13/AR-19 exist.
* SpecKit Analyze is safe to run — it persists `.specify/feature.json`; re-point deliberately first.
* The legacy `apps/sandbox-runner` is the 011 Execution Plane — it is not (ADR-003).
* `P1`…`P8` in 011 equal `P1`…`P8` in 012 — they are different lists.
* Any pending decision has a default that is "approved" — every default is provisional or fail-closed.
