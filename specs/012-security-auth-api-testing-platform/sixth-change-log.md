# SPEC 012 — Sixth Repair: File-by-File Change Log

**Date**: 2026-10-15 · Repair author's log, not a review. Only files under `specs/012-security-auth-api-testing-platform/` were written. No application source, Prisma schema, migration, frozen SPEC 006–011 document, `.specify/feature.json` or unrelated working-tree file was touched (verified by `git status` and `git diff --stat`, see `sixth-semantic-audit.md` §6).

| File | Change |
|---|---|
| `spec.md` | FR-059 (pre-run stop is `REFUSED`); FR-032 (broker `RUNNING` only); FR-081 (planned hops only); FR-173 (unmeasured thresholds, R6 minimum sample, durable breach streak, accurate class-scoped / not tenant-scoped residual); FR-195 (finalize-based refusals, no pre-run `KILLED`, `PLANNED->ADMITTED` guarded, `DISPATCHED` pickup handled, broker denial through `sec_finalize_unit`); FR-199 (child no longer decides redirects); FR-200 (a: `TEST_ROLE`, per-kind columns, renderer confinement; b: `operationRef`, `constraints.shape`; d: closed path shapes; e: rewritten redirect and operation-identity model; h: extended compromised-child tests); FR-201 (b: registration function and `servedClasses`; c: `sec_claim_unit_host` class check, `sec_transition_unit` restricted to three edges, `sec_finalize_unit` full semantics, `sec_sweep_finalize_unit`; d: every edge named; h/i: functions and acceptance suites); FR-070 limit wording |
| `plan.md` | §18 cancellation (pre-run `REFUSED`); SG1 (transition-policy equality, edges used, 008 release in transaction, AR-18); OD-3 explicit conflict sentence; D12 label; limits wording |
| `data-model.md` | 4.9H (`breachStreak`, `lastBreachBucket`, creation at registration, R6 minimum sample, R1–R7); 4.9K (`servedClasses`, registration functions); 4.9L (`TEST_ROLE` kind, canonical-column table, renderer confinement, `operationRef`, `shape`); 4.10A (worker, operator and orchestrator function rows, `WorkerPrincipal` row); FR-173/FR-201 mapping rows; M012-7 function list; I-11 vocabulary |
| `tasks.md` | Edited T056, T300, T536, T537, T731, T756, T761, T781, T810, T811, T812, T813, T814, T815, T816, T818 and Dependencies item 5; added **Phase 21 T820–T828**; regenerated the traceability table (201 rows, 483 tasks) |
| `upstream-amendment-requests.md` | Overall statement (four AR-18 ambiguities); AR-13 summary row and body (full role list, positive grants, new functions); AR-18 table row and section rewritten |
| `research.md` | L1 P13 label; Decision J R1–R7 |
| `contracts/active-security-execution-contract.md` | Inputs (manifest, MAC); dispatch steps 2–5; redirect text (step 7, unit table, limits, item 11); cancellation, failure rows (checkpoint refusal, broker); item 13; tests; Open for closure |
| `contracts/credential-broker-contract.md` | `RUNNING` only (step 2, failure table, tests); signature without caller-asserted principal; authentication; broker-down row; item 7 (R7, streak, minimum sample, residual, tests); traceability |
| `contracts/auth-workflow-execution-contract.md` | Dispatch rewritten (lease after `RUNNING`); failure rows; limits; Open for closure closed |
| `contracts/auth-session-contract.md` | Broker-down row; Open for closure closed |
| `contracts/api-security-check-contract.md` | Inputs and invariant 3 (declarations), redirect and limits wording, item 4 inputs, Open for closure closed |
| `contracts/authorization-testing-contract.md`, `business-logic-security-contract.md` | State vocabulary; limits wording; Open for closure closed (authorization) |
| `contracts/mutation-cleanup-contract.md` | State machine rewritten to `state` + `cleanupState`; steps 6, 8; cleanup step 5; hard rule 1; duplicate prevention; invariant 4; Open for closure closed |
| `contracts/probe-family-contract.md`, `security-scope-contract.md` | Redirect and limits wording; Open for closure trimmed / closed |
| `contracts/secrets-management-contract.md` | Item 10 (function names, registration); Open for closure closed |
| `contracts/security-check-registry-contract.md` | Item 5 (AR-13 / AR-18 gate activation); Open for closure closed |
| `contracts/security-reverify-contract.md` | Refused-plan rows; Open for closure trimmed |
| `contracts/security-evidence-contract.md` | `CLEANUP_RECORD` `state` / `cleanupState` |
| `contracts/test-identity-contract.md` | Open for closure closed |
| `contracts/advisory-matching-contract.md`, `api-discovery-contract.md` | "83 codes"; AR-3 CLOSED |
| all 19 contracts | Consolidated-repairs header "FR-161..FR-201" |
| `checklists/*` | New items: active-probe-safety CHK033–CHK035, secrets-session-isolation CHK036–CHK038 (CHK038 open), requirements-completeness CHK036–CHK037 (CHK037 open), upstream-integration CHK031–CHK032 (CHK032 open); edited CHK032 (active), CHK029 (secrets), CHK002/CHK035 (requirements), CHK020 (authorization-production-safety) |
| `fifth-repair-matrix.md`, `fifth-review-handoff.md` | Superseded-in-part notice |
| New | `sixth-repair-matrix.md`, `sixth-change-log.md`, `sixth-semantic-audit.md`, `sixth-review-handoff.md` |
