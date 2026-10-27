# Cross-Spec Contradiction Ledger

28 contradictions found: **16 resolved in the proposed design** (still unapproved) and **12 blocked** by an owner decision or missing evidence. "Resolved in the proposed design" never means applied or approved.

| ID | Contradiction | Sources | Decision | Task | Disposition |
|---|---|---|---|---|---|
| C-01 | 006 header Draft vs downstream "frozen 006"; dates not supplied | specs/006-scan-architecture-v2/spec.md:7; specs/010-web-testing-platform/spec.md:46,807 | DEC-031 | G-09 | BLOCKED |
| C-02 | DISPATCHED = "a queue job exists" (FR-014) vs owner Q2.1(i) | specs/009-core-scan-execution-platform/spec.md:380-388 | DEC-012 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-03 | REFUSED "never admitted" vs existing ADMITTED→REFUSED | specs/009-core-scan-execution-platform/contracts/runtime-finalization-contract.md:19 | DEC-013 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-04 | Runtime contract order (enqueue then F07) vs HEAD diagram (F07 then queue) | specs/009-core-scan-execution-platform/plan.md:253-261; specs/009-core-scan-execution-platform/contracts/execution-runtime-contract.md steps 1-4 | DEC-011 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-05 | Stop-pending includes broad-scope STOPPED rows (U-1) vs 008 refusal semantics | specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md:185; specs/008-safety-killswitch-budget-audit/contracts/safety-admission-contract.md step 1 | DEC-021 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-06 | Concurrency-refusal terminality attributed to 008 in v5; sources say 009 | specs/011-source-backend-database-testing-platform/contracts/untrusted-execution-contract.md invariant 13 | DEC-023 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-07 | "Class L/N" invented terminology collides with executionUnitClass | docs/audits/fahes-master-audit/remediation/PROPOSED_SPEC009_AMENDMENT_U1B_v5.md §5.3 | DEC-022 | G-07 | RESOLVED IN PROPOSED DESIGN |
| C-08 | 012 claim admits ADMITTED/DISPATCHED units (resume path) | specs/012-security-auth-api-testing-platform/spec.md:423 | DEC-055 | G-06 | RESOLVED IN PROPOSED DESIGN |
| C-09 | 012 FR-195 and E14 resume branches ("skipped when already DISPATCHED") | specs/012-security-auth-api-testing-platform/spec.md:416; specs/012-security-auth-api-testing-platform/contracts/active-security-execution-contract.md:43-44 | DEC-055 | G-06 | RESOLVED IN PROPOSED DESIGN |
| C-10 | 012 lease "expires within 30 s" vs reclaim up to ~90 s | specs/012-security-auth-api-testing-platform/data-model.md:1191; specs/008-safety-killswitch-budget-audit/research.md:95-96 | DEC-063 | G-06 | RESOLVED IN PROPOSED DESIGN |
| C-11 | 012 in-flight bound stated as request count vs elapsed pacing/gate time | specs/012-security-auth-api-testing-platform/contracts/active-security-execution-contract.md:51,54 | DEC-051 | CORE-05 | RESOLVED IN PROPOSED DESIGN |
| C-12 | Host loop starts at PROCEED but claim→PROCEED window unmonitored | docs/audits/fahes-master-audit/remediation/PROPOSED_SPEC009_AMENDMENT_U1B_v5.md §8 | DEC-017 | CORE-04 | RESOLVED IN PROPOSED DESIGN |
| C-13 | 010 leaves unit ADMITTED for retry at context ceiling vs lifecycle | specs/010-web-testing-platform/contracts/browser-execution-contract.md:52-58 | DEC-052 | G-04 | BLOCKED |
| C-14 | 010 constructs browser pool in forked child before RUNNING vs inert child rule | specs/010-web-testing-platform/contracts/browser-execution-contract.md:50-52 | DEC-052 | G-04 | BLOCKED |
| C-15 | 011 supervisor holds EP credential/calls F07 at dispatch vs no credential before RUNNING | specs/011-source-backend-database-testing-platform/contracts/untrusted-execution-contract.md invariant 15; specs/011-source-backend-database-testing-platform/spec.md:207 | DEC-053 | G-05 | BLOCKED |
| C-16 | 011 phase 1 "REFUSED/KILLED, no Guest" vs KILLED only from RUNNING | specs/011-source-backend-database-testing-platform/contracts/untrusted-execution-contract.md phase table row 1 | DEC-053 | G-05 | BLOCKED |
| C-17 | Single finalization authority vs three 012 entry points | specs/009-core-scan-execution-platform/contracts/runtime-finalization-contract.md:57; specs/012-security-auth-api-testing-platform/spec.md:423 | DEC-047 | G-06 | BLOCKED |
| C-18 | U-1 "pre-RUNNING units have nothing to terminate" vs inert child/effects | specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md:199 | DEC-064 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-19 | Sweep writes no F07 state vs stop acknowledgement ownership | specs/009-core-scan-execution-platform/contracts/scan-deadline-contract.md:173; specs/008-safety-killswitch-budget-audit/contracts/kill-switch-contract.md:45-66 | DEC-048 | G-03 | BLOCKED |
| C-20 | Legacy DEGRADED meaning vs 012 partial-coverage usage | packages/scoring/src/aggregate.ts:19-21; specs/012-security-auth-api-testing-platform/spec.md FR-142 | DEC-061 | B-01 | RESOLVED IN PROPOSED DESIGN |
| C-21 | P15 actual-work billing vs ADR-005 flat price vs AREA_COST/refund behaviour | specs/012-security-auth-api-testing-platform/spec.md FR-189; packages/config/src/refund.ts:15-25 | DEC-032 | B-02 | BLOCKED |
| C-22 | 008 lock order unspecified vs 012 global order missing BudgetCounter | specs/012-security-auth-api-testing-platform/data-model.md:1081; specs/008-safety-killswitch-budget-audit/research.md:88-101 | DEC-050 | G-03 | BLOCKED |
| C-23 | Identifier collisions (P/F/A/N/AR/U) across 011/012 | docs/audits/fahes-master-audit/remediation/REMEDIATION_MATRIX.md RM-F3 | DEC-019 | G-07 | RESOLVED IN PROPOSED DESIGN |
| C-24 | 009/010 tasks.md are planning logs; no implementation backlog | specs/009-core-scan-execution-platform/tasks.md; specs/010-web-testing-platform/tasks.md | DEC-069 | G-08 | RESOLVED IN PROPOSED DESIGN |
| C-25 | 002/003/004 headers Draft vs implemented behaviour | specs/002-fix-cancel-timeout-refunds/spec.md | DEC-065 | G-09 | BLOCKED |
| C-26 | U-1 plan.md "deadlineMs null iff REFUSED" vs data-model "non-null iff RESOLVED" | specs/009-core-scan-execution-platform/plan.md; specs/009-core-scan-execution-platform/data-model.md | DEC-066 | G-02 | RESOLVED IN PROPOSED DESIGN |
| C-27 | 011 provisioning (external resource) vs "no external resource before RUNNING" | specs/011-source-backend-database-testing-platform/contracts/untrusted-execution-contract.md phase 4 | DEC-054 | G-05 | BLOCKED |
| C-28 | recordStopped precondition (budget released) vs AR-19 unspecified release | specs/008-safety-killswitch-budget-audit/contracts/kill-switch-contract.md:49-56 | DEC-049 | G-03 | BLOCKED |
