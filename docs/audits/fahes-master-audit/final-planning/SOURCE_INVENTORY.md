# Source Inventory

Measured 2026-10-24 at HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196` (branch `main`). Counts are file counts from the working tree, not from earlier summaries. Classification: **CANON** canonical/authoritative · **ADR** approved decision · **PROP** proposed amendment · **EVID** audit/evidence only · **IMPL** implementation evidence · **MISS** missing/unresolved · **CONF** conflicting/superseded.

## Specifications (15 directories under `specs/`)
| Path | Files | Git | Class | Notes |
|---|---|---|---|---|
| `specs/001-webaudit-mvp-baseline` | 10 | tracked | CANON | implemented baseline; 258/258 tasks checked |
| `specs/002-fix-cancel-timeout-refunds` | 8 | tracked | CANON (header CONF) | header `Draft`, 21/21 tasks checked (C-25) |
| `specs/003-fix-browser-pool-ssrf` | 8 | tracked | CANON (header CONF) | 16/16 checked |
| `specs/004-load-testing-harness` | 8 | tracked | CANON (header CONF) | 14/14 checked |
| `specs/005-production-hardening` | 11 | tracked | CANON (status lag, UNVERIFIED) | |
| `specs/006-scan-architecture-v2` | 15 | tracked | CANON; header `Draft` CONF | ADRs decided |
| `specs/007-foundation-target-authorization-scope` | 11 | tracked | CANON | no implementation |
| `specs/008-safety-killswitch-budget-audit` | 12 | tracked | CANON | no implementation |
| `specs/009-core-scan-execution-platform` | 21 | tracked; **10 files modified + 1 untracked (U-1)** | CANON + PROP (U-1 working tree) | |
| `specs/010-web-testing-platform` | 22 | tracked | CANON | no implementation |
| `specs/011-source-backend-database-testing-platform` | 37 | **untracked** | PROP-authoritative (header FROZEN) | |
| `specs/012-security-auth-api-testing-platform` | 64 | **untracked** | PROP (NOT FROZEN) | |
| `specs/fahes-design-refresh`, `specs/katteb-ar`, `specs/ui-reference-siteaudits` | – | – | out of scope (UI/reference) | |

## Governance and navigation
`.specify/memory/constitution.md` v1.2.0 (CANON, ADR); `PROJECT_MAP.md`, `AGENTS.md`, `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md` (present); `specs/006…/decisions.md` ADR-001..009 (ADR); `specs/006…/roadmap.md`; `.specify/feature.json` → SPEC 011.

## Audit, review and remediation evidence (all untracked, EVID/PROP)
- `docs/audits/fahes-master-audit/` 7 deliverables + `remediation/` 20 files (Phase 1/2A reports, v1–v5 amendment proposals, race/crash matrices v1/v2, four review reports, decision forms) + this `final-planning/` set.
- SPEC 012 review chain: `adversarial-review.md`, `adversarial-rereview.md` (self-declared independent), later matrices/self-reviews; SPEC 011 `adversarial-review-u1.md` (declares NOT independent).
- `docs/reviews/` 19 files (production readiness, AI engineering, `scan-audit-2026-10-07/` 12 files); `docs/superpowers/plans/` 13 files; `docs/audits/` 223 files overall; `docs/` 110 markdown files. EVID; not re-read in full.

## Implementation evidence (IMPL)
`apps/` api, worker, web, probe-pool (library), sandbox-runner; `packages/` ai-executor, capabilities-vendored, capability-sdk, config, redaction, safe-archive, safe-net, scoring, types; Prisma schema 29 models, 20 enums, 21 migrations (latest `20260923010000_issue_fixable`); 283 `*.test.ts` files (not executed by this planning). Relevant files read: `packages/config/src/{refund,pricing}.ts`, `packages/types/src/domain.ts`, `packages/scoring/src/aggregate.ts`, `apps/worker/src/orchestrator/{timeout,timeout-scheduler,state-machine,terminal-refund}.ts`, `apps/api/src/services/queue/admission-gate.ts`, `apps/api/src/services/credits/debit.ts`, `apps/worker/src/db.ts`. Absent: every 007–012 entity, package and service (symbol and path searches), `.github/` CI, RLS/roles.

## Missing or unresolved sources (MS records in the traceability register)
MS-01 independent reviews after 2026-10-11 not stored · MS-02 owner approval records outside 012 documents · MS-03 spec owners not identified anywhere · MS-04 no runtime code for 007–012 entities · MS-05 no reclaim sweep code · MS-06 no Execution Plane provider implementation · MS-07 master-spec approval/freeze dates not supplied.

## Conflicts and superseded material
28 cross-spec contradictions (`CONTRADICTION_LEDGER.md`); superseded: v1–v4 amendment proposals (kept unchanged), `U1B_RACE_CRASH_MATRIX.md` (superseded by v2), earlier 012 repair matrices (historical per their own notices), `PROJECT_MAP.md` statements flagged stale by the audit (reviewed claims must be re-verified against source).

## Counts summary
12 numbered specs (+3 non-scope dirs); 538 functional-requirement rows for specs 006–012 in `docs/audits/fahes-master-audit/SPEC_TRACEABILITY.csv` (006: 28, 007: 24, 008: 27, 009: 47, 010: 53, 011: 158, 012: 201); 69 decisions; 28 contradictions; 53 backlog tasks; 188 traceability rows.
