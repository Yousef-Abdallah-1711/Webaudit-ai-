# SPEC Implementation Packets

Planning only. A packet may be prepared while blocked; **only Packet 0 (SPEC 007) has no unresolved decision**, and even it needs your start authorization and an environment. Decision IDs: `../DECISION_REGISTER.md`; levels/categories: `DECISION_RECLASSIFICATION.md`; tasks: `../IMPLEMENTATION_BACKLOG.md` (original IDs). Paths named "likely" come from each SPEC's own `plan.md`/`tasks.md` and the repository layout; they are expectations, not commitments. Test commands (from `package.json`): `pnpm test` (unit project), `pnpm test:adverse`, targeted `pnpm exec vitest run --project unit <file> --no-file-parallelism`; DB suites use `TEST_DATABASE_URL` (default test DB `localhost:5442/webaudit_test`, `apps/api/tests/helpers/db.ts`), run serially; **Docker is currently not running**.

## Packet 0 — SPEC 007 (F01) — `F-03`
- **Status: implementation-ready subject to start authorization (A0-1) and a database for T003+.** No unresolved required decision.
- Sources: `specs/007-foundation-target-authorization-scope/{spec.md,plan.md,data-model.md,tasks.md T001–T042,contracts/*}`; constitution X; `apps/api/src/services/control-gate/` (parallel structure).
- Unresolved contract changes: none required. Optional hardening AR-1 (isAuthorized account/role/category parameters) and AR-14 are recommended-only and not part of this packet.
- Prerequisite decisions: none. Evidence: F-01a baseline (optional but recommended), Docker/Postgres availability, enum-drift baseline.
- Inspect/likely change: `apps/api/prisma/schema.prisma`; `apps/api/src/services/authorization/{index.ts,derive-state.ts,…}`; `apps/api/tests/adverse/authorization.test.ts`, `apps/api/tests/unit/authorization-audit.test.ts`; `packages/types/src/domain.ts`, `packages/types/tests/unit/enum-drift.test.ts`; a reviewed migration `…_add_target_authorization_scope`.
- Order (007's own phases): slice 1 (T001–T002 + enum mirroring) → Phase 2 (T003–T007, needs DB) → US1 → US2 → US3 → Polish. Test-first throughout.
- Migration/compat risks: additive tables and two relation-only back-fields on `Target`; legacy `ControlLevel`/`control-gate` untouched; migration must be reversible; `BUDGET_EXHAUSTED` consumption input is stubbed (T019) until SPEC 008.
- Tests: unit, contract, adverse (revocation effective at next check, expiry, derived state), side-effect-free `isAuthorized`; enum-drift; regression: existing control-gate adverse suite.
- Acceptance: 007 success criteria SC-001…SC-006 and each task's own checks; every criterion reported pass/fail/unverified.
- Rollback: revert the commit and reverse the migration on the test database; no production data.
- Entry gate: A0-1; clean understanding of working-tree changes (35 entries untouched); baseline recorded.
- Exit gate: all 007 tasks done with red→green evidence; no 008/009 files touched; diff reviewed; owner decides on commit.
- Must NOT implement: 008 counters/leases, budget consumption, engine integration, DB roles/RLS, AR-1 parameters, any 009 entity.

## Packet 1 — SPEC 008 (F07) — `S-01…S-05`, with `G-03`, `F-02`
- **Status: PREPARED — BLOCKED** (Level 1 decisions open).
- Sources: `specs/008-…/{spec.md (27 FR),plan.md,data-model.md,research.md,contracts/*}`; U-1 `scan-deadline-contract.md` for stop/deadline interplay.
- Unresolved contract changes (G-03): lock order for every operation (DEC-050); transaction-joinable, unit-keyed release and context-derived identity (DEC-045); stranded-stop handling (DEC-048); `recordStopped` order (DEC-049); reclaim/reconcile as real jobs (DEC-063); correct U-1 `:185` stop definition (DEC-021).
- Prerequisite decisions: DEC-034, 044, 045, 048, 049 (L1); DEC-050/063 (technical). Evidence: EV-01 (008 lock-order statements), EV-05 later.
- Inspect/likely change: `apps/api/prisma/schema.prisma` (`BudgetCounter`, `BudgetConsumption`, `AdmissionLease`, `KillSwitchState`, `ExecutionAuditEvent`); `apps/api/src/services/safety/`; `apps/worker/src/orchestrator/{kill-switch.ts,timeout-scheduler.ts}`; `packages/config/src/cancellation.ts`; `apps/api/tests/adverse/safety-admission-race.test.ts`; existing `services/credits/debit.ts` as `FOR UPDATE` precedent (raw SQL because Prisma cannot express it).
- Order: S-01 schema → S-02 admission (replay lookup before counter lock, atomic counters) → S-03 renewal/release/reclaim/reconcile jobs → S-04 kill switch → S-05 race suite.
- Risks: Redis must never be authority (legacy `admission-gate.ts` is unrelated); additive migration; reclaim cadence is design intent (60 s default, ≤ ~90 s worst case after a crash).
- Tests: N-caller concurrency on the last unit; idempotent replay returns same result; token fencing (zero-row renewal = stop); release vs reclaim vs finalize races with lock-order stress; kill-switch lifecycle incl. hostless; crash/restart of reclaim; regression: legacy credits/timeout suites.
- Acceptance: 008 acceptance + SC list; no over-admission; no stranded `REQUESTED` rows without alert (per DEC-048).
- Rollback: flag-off consumers; migration reversible; no behaviour change for legacy scans.
- Entry gate: Packet 0 exit; DEC-034/044/045/048/049 answered; G-03 text approved and applied (and committed per DEC-018); F-02 design reviewed; EV-01 filed. Exit gate: S-05 suite green in a recorded run; diff reviewed.
- Must NOT implement: effect ledger, claims (009), engines, Redis authority, any 012 definer function.

## Packet 2 — SPEC 009 (+ U-1/U-1b) — `CORE-01…CORE-10`, `G-01`, `G-02`, `G-08`
- **Status: PREPARED — BLOCKED** (DEC-047, 051, 066; 008 exit).
- Sources: `specs/009-…/{spec.md (47 FR),plan.md,data-model.md,contracts/*}` incl. working-tree U-1 and `scan-deadline-contract.md`; v5 proposal and the Phase 2C review (evidence only).
- Unresolved contract changes: status definitions (DEC-012/013), claim entity and token mechanics (DEC-015/056), CAS/lease predicate by the dispatch call's `consumes` (DEC-057), stop-first classifier (DEC-058), effect ledger and hook rule (DEC-051/064), finalization authority (DEC-047), U-1 text fixes (C-05, C-26), implementation task lists (G-08).
- Prerequisite decisions: L1 DEC-047, 051, 066; accepted batch DEC-056/057/058; DEC-059/060 L3. Evidence: EV-06.
- Inspect/likely change: `apps/api/src/services/planning/`; `apps/worker/src/execution-runtime/`; `apps/worker/src/orchestrator/{timeout.ts,timeout-scheduler.ts,state-machine.ts,cancellation.ts,emit.ts}`; `apps/worker/src/evidence/`; `packages/config/src/queues.ts`; schema/migrations; `apps/worker/tests/adverse/`.
- Order: CORE-01 data model → CORE-02 resolver/deadline → CORE-03 claim → CORE-04 dispatch + host loop → CORE-05 effects → CORE-06 finalize → CORE-07 sweeps (T-U1-6..8) → CORE-08 evidence → CORE-09 race/crash suite → CORE-10 legacy regression.
- Risks: legacy sweep must stay byte-identical for plan-less/passive scans (ADR-006); additive nullable `deadlineMs`; the new claim/ledger tables; lock order unit→lease→counter.
- Tests: matrix traces from `U1B_RACE_CRASH_MATRIX_v2.md` and v5 Appendix B; duplicate pickup; pause/resume; start-gate CAS loss; hook `PENDING` while an effect is `AUTHORIZED`; legacy regression (AC-1).
- Acceptance: U-1 AC-1…AC-20 plus validation criteria of the approved amendment; guarantees reported with their class (not claimed beyond text).
- Rollback: flags off; legacy path unchanged; migration reversible. Entry: Packet 1 exit; DEC-047/051/066 answered; G-02 applied. Exit: CORE-09/10 green; evidence of per-engine conformance harness.
- Must NOT implement: engines, billing changes, 012 functions, any claim of compromised-worker resistance.

## Packet 3 — SPEC 010 — `E-01`, `E-02`, `G-04`
- **Status: PREPARED — BLOCKED** (DEC-042, 052; Packet 2 CORE-05..07).
- Sources: `specs/010-…/{spec.md (53 FR),plan.md,contracts/*}`; `browser-execution-contract.md:44-66`.
- Unresolved changes: context ceiling vs lifecycle (C-13), pool construction after `RUNNING` (C-14), per-effect fence for context creation, consumption policy statement (none today), U-1 obligations (DEC-042).
- Evidence: EV-06, EV-08. Inspect/likely change: `apps/probe-pool/src/browser/pool.ts` (library), `apps/worker/src/web-checks/`, `apps/worker/src/execution-runtime/`, `apps/probe-pool/tests/adverse/browser-pool-ssrf.test.ts`.
- Order: E-01 browser engine → E-02 crawler/domains. Tests: ceiling and starvation, repeated pickup, SSRF suite, effect fence. Rollback: engine flag off.
- Entry: DEC-042/052 answered; Packet 2 CORE-05..07 done; G-04 applied. Exit: tests green; no held-lease wait outside the chosen option.
- Must NOT implement: any behaviour assuming option (c) (F07 per-grant budget as the per-process ceiling).

## Packet 4 — SPEC 011 — `E-03`, `E-04`, `E-05`, `G-05`
- **Status: PREPARED — BLOCKED for E-05**; E-03 (E12 static) needs only CORE-08 and DEC-041 provisional defaults; E-04 (provider interface + fake + Disabled) needs CORE-05.
- Sources: `specs/011-…/{spec.md (158 FR),plan.md,contracts/untrusted-execution-contract.md,…}` (untracked until DEC-018).
- Unresolved changes: phase→009-status mapping, credential timing, provisioning after `RUNNING`, no second F07 call (DEC-053); EP creation fence (DEC-054; the EP interface has none); backstop (DEC-046). Evidence: EV-02, EV-03.
- Likely change: `packages/source-analysis/`, `packages/source-execution-contract/`, worker supervisor; fake provider contract suite (AG7). Tests: stale-provision and destroy/terminalize race on the fake provider; real-provider claims stay UNVERIFIED (AG1).
- Entry: for E-05 DEC-053/054 evidence filed; Packet 2 exit; AG gates unchanged. Exit: lifecycle and teardown-confirmation tests green on the fake; real provider remains unproven.
- Must NOT implement: a real Execution Plane, any unsandboxed customer-code execution, SOURCE_EXECUTION activation.

## Packet 5 — SPEC 012 — `E-06…E-09`, `G-06`, `B-01`
- **Status: PREPARED — BLOCKED** (DEC-033, 044, 045, 046, 055, 061, 040, 037; Packets 1–2; AR-13/19/22).
- Sources: `specs/012-…/{spec.md (201 FR),plan.md,data-model.md,contracts/* (19)}` (untracked; not frozen; self-reviewed only).
- Unresolved changes (G-06): `PLANNED`-only claim, remove resume branches, 30 s wording, `BudgetCounter` in the global lock order, unclaimed refusal when a stop is pending; claim mapping (principal ≡ token).
- Order: E-06 broker/vault/roles (needs AR-13/19/22, KMS DEC-040, EV-07) → E-07 passive-first registry/E14 → E-08 E15 (DEC-037) → E-09 D20/coverage (needs B-01). Flags default off (SG1–SG10).
- Tests: 012's 538-task test plan as reordered; compromised-worker scenarios only where AR-13 exists; settlement tests via B-02/B-03.
- Entry: all named decisions answered; Packets 1–2 exit; independent stored review (DEC-043) before freeze. Exit: SG gates evidenced.
- Must NOT implement: active/authenticated purchase surface before DEC-032; any claim of tenant isolation under worker compromise outside Mode S.
