# Implementation Readiness Gates

**No gate passes because this document says so.** Each gate lists evidence required, objective pass/fail criteria, current blockers, accountable owner and artifacts proving completion. Status reflects the repository as inspected on this date (HEAD `e42577304a2ccec873b30bbbf1d712e6348f6196`).

| Gate | Status now | Why |
|---|---|---|
| A — Source and authority complete | **NOT PASSED** | Inventory done (`SOURCE_INVENTORY.md`) but authority conflicts remain: 006 header vs "frozen" without dates (DEC-031), no spec owners identified, 011/012 untracked, U-1 uncommitted |
| B — Owner decisions resolved | **NOT PASSED** | 20 `OWNER DECISION REQUIRED`, 18 `RECOMMENDED — OWNER APPROVAL REQUIRED`, 2 `BLOCKED BY MISSING EVIDENCE` |
| C — Cross-spec contracts consistent | **NOT PASSED** | 12 of 28 contradictions blocked; 16 resolved only in the unapproved proposal |
| D — Tasks complete enough to execute | **NOT PASSED** | Backlog of 53 tasks has scope, prerequisites, acceptance, tests, migration notes, but prerequisites include unapproved decisions; 009/010 implementation lists not yet in their specs (G-08) |
| E — Runtime evidence available | **NOT PASSED** | No code exists for 007–012 entities; 8 evidence tasks (EV-01..08) open; reclaim sweep absent |
| F — Safe rollout and recovery defined | **NOT PASSED** | Rollout/rollback/kill-switch/orphan plans exist at planning level only (DEC-069, O-02, O-04) |

## Gate A — Source and authority complete
- Evidence: `SOURCE_INVENTORY.md`; `CONTRADICTION_LEDGER.md`; Git tracking status of every source.
- Pass: every relevant spec/contract/ADR/audit file classified; every authority conflict has an owner-stated rule or an explicit open decision; provenance of U-1/011/012 settled per Q3.
- Blockers: DEC-031 (dates), DEC-018 execution (commits), MS-03 (owners unidentified).
- Accountable: project owner. Artifacts: commits for U-1/011 (G-01), updated 006 header (G-09).

## Gate B — Owner decisions resolved
- Evidence: each decision in `DECISION_REGISTER.md` has status `EXISTING APPROVED DECISION` or `RESOLVED BY AUTHORITATIVE EXISTING CONTRACT` (or `REJECTED ALTERNATIVE`) with a recorded owner answer; recommendations are not counted.
- Pass: zero entries in `OWNER DECISION REQUIRED`, `RECOMMENDED — OWNER APPROVAL REQUIRED`, `BLOCKED BY MISSING EVIDENCE` that affect security boundaries, transitions, billing, leases, external effects or cross-spec contracts. Minimum set: DEC-031, 032, 033, 034, 044–058, 066.
- Accountable: project owner; spec owners where identified.
- Artifacts: a dated, owner-authored decision record (new file) per batch.

## Gate C — Cross-spec contracts consistent
- Evidence: grep/diff checks after G-02..G-06 show one definition per status, one edge table, one stop definition, one consumption terminology, one lock-order statement, one finalization authority, one settlement rule.
- Pass: all 28 ledger entries closed in the owning specs (not merely in a proposal).
- Blockers: C-01, 13–17, 19, 21, 22, 25, 27, 28.
- Artifacts: ledger with each entry linked to the committed spec diff.

## Gate D — Tasks executable
- Evidence: every task has scope, prerequisites, acceptance, tests, migration/rollback, DoD; 009/010 implementation lists exist; 007/008/011/012 lists reconciled to this order.
- Pass: no task depends on an unapproved decision; each acceptance criterion is traceable (`TRACEABILITY_AND_RISK_REGISTER.csv`) to a requirement and a test.
- Artifacts: new `tasks.md` sections (G-08), trace v2 (G-10).

## Gate E — Runtime evidence
- Evidence: source/tests for every claim about existing behaviour; EV-01..EV-08 filed; reclaim job existence and cadence (EV-05); consumes policies (EV-06).
- Pass: no `UNVERIFIED` claim remains that a task or guarantee relies on.
- Artifacts: evidence reports; test runs recorded when implementation exists.

## Gate F — Safe rollout and recovery
- Evidence: runbooks and staging drills for migration order, rollback (flags off), lease reclaim, kill-switch/stranded-stop handling, credential isolation (AR-13), orphan/external cleanup (AR-22), settlement idempotency.
- Pass: each drill executed and recorded; rollback verified; external cleanup demonstrated on the real provider where applicable (011 AG1).
- Blockers: AR-13, AR-19, AR-22, DEC-040 (KMS), EV-07.
- Artifacts: drill reports (O-01..O-05).

**Planning closure** requires Gates A–F evidence; none exists. See the final report: **PLANNING NOT CLOSED — OWNER DECISIONS OR EVIDENCE STILL REQUIRED**.
