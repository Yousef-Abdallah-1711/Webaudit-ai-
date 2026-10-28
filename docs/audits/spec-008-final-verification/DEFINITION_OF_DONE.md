# SPEC 008 — Independent Definition of Done

Derived from the spec's own requirements, the approved amendments (A1, F-02 §13) and the project engineering standards —
not from the previous report's criteria. **Contractual numbers are only those the spec states:** 30 s lease (FR-004), 5 s
observe/acknowledge/escalate bound (FR-013/FR-014), 20+ adversarial scenarios each resolved (SC-004). The spec defines **no**
latency, throughput or capacity threshold; performance gates therefore report a *measured baseline*, not a pass/fail limit.

Verdict vocabulary: PASS · FAIL · PARTIAL · BLOCKED · NOT APPLICABLE. A gate is PASS only with the evidence named.

| # | Gate | Required evidence & method | Pass criteria | Fail criteria | Allowed exclusion | Status (final) |
|---|---|---|---|---|---|---|
| 1 | Specification completeness | Row-by-row `REQUIREMENT_DELTA_MATRIX.md` traced to code + test assertions | every FR/SC/story/edge case is VERIFIED COMPLETE, NOT APPLICABLE (with reason) or an exclusion below | any MISSING / FAILED / unverified row | FR-014 forcible process kill (spec names F04 as the dependency); FR-022 unauditable rollback refusals (FR-021 precedence) | **PARTIAL** — 2 documented partials (see matrix); 9 audit defects fixed |
| 2 | Contract consistency | Contracts vs implementation vs A1/F-02 §13 diff; enum drift guard | no contradiction between text and behaviour; every deviation recorded as an amendment | silent deviation | none | **PASS** — A2 (`amendments/AMENDMENT-A2.md`) records this audit's deviations |
| 3 | Database correctness | fresh install, upgrade from pre-008 baseline with row checksums, rollback, re-apply; constraint + trigger tests | legacy data byte-identical after upgrade; rollbacks leave no residue and re-apply; invariants enforced by the DB itself | data change, residue, un-enforced invariant | none | **PASS** — `MIGRATION_VERIFICATION.md` |
| 4 | Security | real non-superuser logins; EXECUTE/DML matrix both directions; search_path/shadow-object tests; cross-tenant tests; secret scan | every denied operation fails at the database; no cross-tenant read/write/stop; no secret in repo | any bypass | none | **PASS** (tests + isolated stack). Runtime enforcement on the shared dev stack: see gate 10 |
| 5 | Concurrency | deterministic barriers (held advisory locks / open transactions) and contended real-connection runs; mutation testing of the SQL | no oversubscription; exactly-once outcomes; no deadlock; every seeded mutant killed | any over-admission, deadlock, surviving mutant | none | **PASS** |
| 6 | Kill switch | lifecycle + trigger parity test; authority; scopes; admission refusal; checkpoint/watcher; escalation | STOPPED never while a live in-scope lease; REQUESTED→STOPPED impossible even by direct write; observe ≤5 s | premature STOPPED; resurrection | forcible OS kill (F04) | **PASS** (FR-014 partial noted) |
| 7 | Lease lifecycle | acquire/renew/expire/reclaim/release suites; fencing; expiry-vs-grant; one-live-lease-per-unit | no double release; expired never revived; stale holder fenced; lease never outlives grant | any | none | **PASS** |
| 8 | Reconciliation | reconciler suites + real worker as non-superuser; concurrent reconcilers; restart | two-pass, grace, never premature, exactly-once transitions | any | none | **PASS** |
| 9 | Audit integrity | rollback leaves no event; append-only trigger; redaction; tenant-scoped reconstruction; all 12 types emitted; retention | events match committed state only | false success record; mutable audit; raw secret | un-auditable rollback refusals | **PASS** (FR-022 partial noted) |
| 10 | Runtime integration & operational controls | real API + worker processes, real Postgres/Redis, **as non-superuser logins**; sweep via BullMQ | processes run with no permission errors; sweep reconciles; **and** the controls are active in the environment being claimed | superuser runtime claimed as isolated | Shared dev stack stays superuser (owner decision, not a SPEC 008 deliverable) | **PARTIAL** — isolated stack runs as non-superuser (PASS); shared dev stack still superuser (not in force there) |
| 11 | Browser acceptance | real Google Chrome, throwaway profile, 12 scenarios, console/network/axe | every applicable scenario executed with evidence; SPEC 008 has no UI → backend-only items verified by HTTP+DB | unexecuted scenario reported as pass | no UI/route for kill switch or F07 budgets (not invented) | **PASS** — 28/28 real-Chrome steps (`MANUAL_CHROME_QA.md`); SPEC 008's own surfaces have no browser path (not invented) |
| 12 | Regression | full unit + adverse + full Playwright; cross-spec review | no new failure; pre-existing failures root-caused | new failure | pre-existing unrelated failures, documented | **PASS** — unit 229 files/1569, adverse 71 files/1127 (+1 known skip), Playwright 93/93, typecheck 30/30 (`PLAYWRIGHT_E2E_RESULTS.md`, `CROSS_SPEC_REGRESSION.md`) |
| 13 | Reliability | failure injection on dedicated containers: worker kill, Redis restart, DB pause, duplicate jobs, duplicate finalization | recovery without double effect or premature STOPPED | any | none | **PASS** — S1–S8 |
| 14 | Performance | staged load through the TypeScript services as non-superuser; k6 where an HTTP surface exists | measured baseline recorded with exact workload; no inconsistency/deadlock under load | inconsistency, deadlock | **k6: NOT APPLICABLE** — SPEC 008 exposes no HTTP endpoint; inventing one is out of scope | **PASS (baseline)** — `PERFORMANCE_AND_K6.md` |
| 15 | Delivery | docs, evidence, logical commits, normal push, remote verified | `git ls-remote` equals local HEAD; ahead/behind 0/0 | unpushed work | none | **PASS** — see `GIT_DELIVERY.md` |

## Three separate verdict axes
1. **Implementation status** — are the required features implemented? (gates 1–2, 6–9)
2. **Verification status** — independently verified? (gates 3–5, 11–14)
3. **Operational status** — are the runtime controls *actually active* where claimed? (gate 10)
4. **Product production readiness** — D-1 and the shared dev superuser connection are product-level blockers outside SPEC 008.
