# SPEC 008 — independent final audit: executive summary

**Specification**: Foundation Spec 07 — Safety / Kill Switch / Budget Enforcement / Execution Audit Trail (`specs/008-safety-killswitch-budget-audit/`).
**Verdict**: VERIFIED COMPLETE WITH DOCUMENTED EXCLUSIONS (backend foundation) · operational activation PARTIAL · product production readiness NOT ready (see `FINAL_DOD_VERDICT.md`).

## What this audit did differently
It did not accept the previous closure. It rebuilt the requirement list from `spec.md` itself, traced each requirement through the real call path, read the test assertions, and attacked the gaps.
That found real defects the earlier 36/36 report did not:

| Defect | Why it mattered |
|---|---|
| **D-A (HIGH)** a lease could be renewed past its grant's expiry | an execution could outlive its authorization — FR-016a was effectively **FAILED** |
| **D-C** a second worker could lease a live execution id | FR-015's "new worker while the old one is alive" vector was open |
| **D-G** no audit retention | FR-024 was **MISSING** |
| D-B, D-D, D-E, D-F, D-I | uncertainty conflated with a fenced lease; environment refusal not a persisted stop; audit rows missing scope/environment/class; silent refusals; environment not re-checked under the admission lock |
| D-H | a retention failure could fail the whole safety sweep every minute (seen live in the worker log) |
| D-K | the rollback script skipped re-applying the new migration (caught because every test then failed) |
All fixed with regression tests (`DEFECT_REGISTER.md`); the SQL changes are an additive migration B with a tested rollback, and amendment A2 records the contract changes.

## Evidence at a glance
| Area | Result |
|---|---|
| Unit / adverse / typecheck | 229 files **1569** passed · 71 files **1127** passed (+1 known skip) · 30/30 |
| Role isolation, real non-superuser logins | **116** tests |
| SQL mutation testing | **6/6** mutants killed |
| Migrations | fresh install, upgrade with per-table md5 identical, two rollbacks tested, applied to the dev DB after a backup (row counts identical) |
| Failure injection (dedicated containers, non-superuser worker) | **9/9** — worker kill, Redis restart, DB pause, duplicate jobs, duplicate finalization |
| Load (non-superuser, through the real services) | ~105–113 admit+release/s on one hot grant, ~190/s across 20; max live leases never above the ceiling; **0 deadlocks**; one capacity limit recorded (D-J) |
| Real Chrome 150 manual QA | **28/28** (Playwright library, not MCP) |
| Playwright E2E | **93/93** (was 92/93; selector defect fixed) |

## Open items the owner should know
1. **D-1 re-reproduced in real Chrome**: Performance COMPLETE/93 with browser capabilities "succeeded" and the scan charged in full, with no browser pool. Needs the owner's browser-pool transport decision and DEC-061 / DEC-032; no credit semantics were changed.
2. **The shared dev API/worker still run as the superuser**: SPEC 008 role isolation is proven but not in force there.
3. Not measured: k6 (SPEC 008 has no HTTP surface), instrumented coverage (no provider; `c8` gave no usable output), Playwright MCP (profile locked by another instance).
4. Next: SPEC 009 (needs DEC-047 / 051 / 066).
