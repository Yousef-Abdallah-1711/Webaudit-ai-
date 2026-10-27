# Spec-by-Spec Change Plan

**PROPOSED — NOT APPLIED — NOT APPROVED.** No spec file is modified by this phase. Each section states whether the spec can be finalized **now**, **only after decisions**, or **only after missing evidence**. IDs refer to `DECISION_REGISTER.md` (DEC), `IMPLEMENTATION_BACKLOG.md` (tasks), `CONTRADICTION_LEDGER.md` (C-xx). Baseline HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`.

## Constitution and 001–005 (foundations, legacy behaviour)
| Spec | Status and authority | Evidence | Change proposed | Finalizable |
|---|---|---|---|---|
| Constitution v1.2.0 | Ratified 2026-08-22, amended 2026-10-07 (VIII–XIV added) | `.specify/memory/constitution.md:551` | none | now |
| 001 baseline | "Ready for planning"; 258/258 tasks checked; implemented in code | `specs/001-…/tasks.md`; legacy apps/packages | none; remains the parallel-run baseline (ADR-006) | now |
| 002 cancel/timeout/refunds | header `Draft`; 21/21 tasks checked; code implements sweep and refunds | `specs/002-…`; `apps/worker/src/orchestrator/timeout.ts` | status header update only after owner confirmation (C-25, DEC-065, G-09) | after owner decision |
| 003 browser SSRF | header `Draft`; 16/16 tasks checked; `probe-pool` library exists | `specs/003-…`; `apps/probe-pool/src/browser/pool.ts` | same (C-25) | after owner decision |
| 004 load testing | header `Draft`; 14/14 tasks checked | `specs/004-…` | same | after owner decision |
| 005 production hardening | header "Draft — planning artifact only"; PROJECT_MAP says most tasks implemented; my task count regex found no checked items — **UNVERIFIED** | `PROJECT_MAP.md`; `specs/005-…/tasks.md` | status reconciliation | after evidence (EV not created; part of G-09) |

## 006 — architecture v2
Status/authority: header `Draft` (`006/spec.md:7`); ADRs decided; owner affirmed approval and freeze **without dates** (DEC-031). Conflicts: C-01. Change: replace the single status token by five axes (planning, authority, freeze, implementation, activation) — G-09. Contracts affected: header, `roadmap.md` references (F05 absorbed by 012; F06 unspecified). Decisions: DEC-031. Acceptance: header states each axis; every "frozen 006" reference names the axis. **Finalizable only after owner supplies the dates (or states the statuses stay unchanged).**

## 007 — F01 target/authorization/scope
Status: "Planning complete — frozen" header; committed; no implementation; 42 implementation tasks unchecked. Conflicts: none found beyond 012 follow-ups (AR-1/AR-14 optional). Changes: none required to unblock; reserve DB role hooks (DEC-044, F-02). Contracts: `authorization-check-contract`, `grant-lifecycle-contract`, `scope-matching-contract` unchanged. Dependencies: DEC-034 (role design scheduling). Acceptance: tasks T001–T042 per its own list (F-03). **Finalizable now for implementation planning; implementation start needs F-01 (CI) and DEC-044/F-02.**

## 008 — F07 safety/kill switch/budget/audit
Status: "frozen" header; committed; no implementation; 36 tasks unchecked. Conflicts: C-19, C-22, C-28 (and C-05 where U-1 contradicts 008). Proposed changes (via G-03, owner SPEC 008 not identified): (1) lock order for admission/renewal/release/reclaim/reconcile; (2) unit-keyed, token-free, transaction-joinable release (AR-19); (3) trusted-caller or context-derived identity for admission; (4) stranded stop-state handling and aggregation rule; (5) `recordStopped` preconditions/caller/order; (6) reclaim/reconcile jobs as real jobs with cadence; (7) clarify replay returns the holder token only to the first caller is **not enforceable by F07** (rule lives in 009). Contracts/data models: `safety-admission`, `safety-checkpoint`, `kill-switch` contracts; `data-model.md` (`AdmissionLease`, `KillSwitchState`); `research.md` R3. Decisions: DEC-045, DEC-048, DEC-049, DEC-050, DEC-063. Migration: none (no schema exists). Acceptance: `safety-admission-race` adverse suite, lock-order stress test (S-05). **Finalizable only after decisions DEC-045/048/049/050.**

## 009 — core scan and execution platform (+ U-1, + U-1b)
Status: "frozen" header; committed baseline plus **uncommitted U-1** (10 files +169/−4 + untracked `scan-deadline-contract.md`); no implementation except legacy; `tasks.md` are planning logs (39 checked) plus T-U1-1..10 unchecked. Conflicts: C-02, C-03, C-04, C-05, C-06, C-11, C-12, C-17, C-18, C-24, C-26. Proposed changes (G-02, after DEC-066): status definitions (FR-014), data-model comments, diagram, runtime-contract sequence (enqueue → pickup-ignore → pre-F07 checks → claim → F07 → CAS …), host-claim entity and token mechanics, CAS form, lease predicate conditional on the dispatch call's `consumes`, start gate + `authorizeEffect` ledger, `onUnitExpired` rule, stop-first classifier replacing the prose at `scan-deadline-contract.md:188` and fixing `:185`, step 0 only for `PLANNED`, limitation paragraphs, enqueue reconciler (if DEC-059 approved), implementation task lists (G-08). Contracts: all ten `contracts/*` named in the U-1 change list. Dependencies: DEC-011..017, 021, 047, 050, 051, 056–060, 064, 066. Migration: additive nullable columns/tables. Acceptance: validation criteria of U-1b v5 §16 plus the matrix traces. **Finalizable only after DEC-066 and the 008/010/011 decisions it depends on.**

## 010 — web testing platform
Status: "frozen" header; committed; no implementation (`probe-pool` is a library); `tasks.md` is a planning log. Conflicts: C-13, C-14. Changes (G-04): ceiling checked before F07 admission with a local reservation released on every exit (recommended, DEC-052); pool built after `RUNNING`; context creation and navigation behind `authorizeEffect`; state its consumption policy (none stated); accept or amend U-1 obligations (DEC-042). Contracts: `browser-execution-contract.md`, `web-check-registry-contract.md`. Acceptance: ceiling tests, effect fence tests. **Finalizable only after DEC-042/DEC-052 and EV-06/EV-08.**

## 011 — source/backend/database testing
Status: header FROZEN (2026-10-10); **entire directory untracked**; no implementation; 347 tasks unchecked; provisional P1–P8 unconfirmed (DEC-041). Conflicts: C-15, C-16, C-27. Changes (G-05): map each lifecycle phase to a 009 status; EP credential delivered after `RUNNING`; provisioning only after `RUNNING` behind `authorizeEffect`; no second F07 call; EP creation fence/tombstone requirement (or accept dead-man/TTL-only cleanup explicitly); cite U-1b edges. Contracts: `untrusted-execution-contract.md`, `isolation-policy-contract.md`, plan lifecycle table. Dependencies: DEC-053, DEC-054, DEC-046, DEC-051; AG1–AG10 unchanged. **Finalizable only after missing evidence EV-02/EV-03 and owner decisions.**

## 012 — security/auth/API testing
Status: PLANNING COMPLETE — NOT FROZEN; untracked; no implementation; 538 tasks unchecked; all repairs after 2026-10-11 are self-reviews. Conflicts: C-08, C-09, C-10, C-11, C-17, C-19, C-21, C-22. Changes (G-06; file stays untracked per Q3): claim only `PLANNED` units; remove resume branches (FR-195, E14 :43-44); map `UnitDispatchRecord` to the generic claim (principal ≡ token); unclaimed step-0 refusal not written when a stop is pending; lease wording (reclaim ≤ ~90 s, inert child possible); BudgetCounter in the global lock order; effect bound stated as time not only F07 units; keep fail-closed defaults. Decisions: DEC-033..040, 044–047, 055, 061. **Finalizable only after owner decisions and an independent stored review (DEC-043).**

## Cross-spec terminology (adopt in all specs; DEC-019, DEC-022)
| Term | Use |
|---|---|
| ownership vs authorization | ownership = control proof; authorization = per-`ExecutionClass` grant |
| claim / claim token | 009 host claim per `(unit, attempt)`; token is a bearer secret hashed at rest; `hostInstanceId` is a label |
| consumption | the call's `consumes {request, concurrency}`; engine "unit-consumption policy"; **not** "Class L/N" |
| lease / budget states | `AdmissionLease` held iff unreleased ∧ unreclaimed ∧ (expiry rule per 008); `BudgetCounter` |
| statuses | `PLANNED`, `ADMITTED`, `DISPATCHED`, `RUNNING`, terminal (definitions per DEC-011..013) |
| stop | pending = `REQUESTED`/`ACKNOWLEDGED` any scope, `STOPPED` for `(EXECUTION, id)` |
| deadline / hard stop | plan `deadlineMs` (immutable), `hardStopMarginMs`, step 0 |
| effect | externally visible action recorded in the effect ledger (authorized → confirmed) |
| `COMPLETE` / `DEGRADED` | legacy: both scored and delivered; DEGRADED = missing interpretation; partial coverage uses `coverageComplete:false` |
| billing / settlement | per-area charge and equal-share refund today; OD-3 open |
| identifiers | SPEC-prefixed (`012-P16`, `011-P4`) |
