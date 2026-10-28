# Migration verification

Migrations under review: `20261028120000_add_safety_foundation` (A) and `20261029000000_safety_audit_context_and_lease_exclusivity` (B, this audit).
All runs used **disposable** databases or the isolated `webaudit_test`; rollback was never run against the owner's `webaudit` data
(B was applied forward to `webaudit` at the end of the audit, after a backup). No `migrate dev/reset/db push` was used anywhere.

| # | Test | Method (actual) | Result |
|---|---|---|---|
| 1 | **Fresh installation** | clean `postgres:16-alpine` container (`m008-audit-pg`, :5452, no pre-existing roles): `prisma migrate deploy` | all **24** migrations applied; **23** `f07_*` functions; 5 `fahes_*` roles created |
| 2 | **Upgrade from a valid pre-SPEC 008 baseline** | copied `schema.prisma` + migrations minus A and B into a scratch dir, `migrate deploy` on `m008_upgrade_test`; seeded 25 users / targets / scans / audit-log rows; recorded `count(*)` + `md5(string_agg(row::text))` per table; then `migrate deploy` with the real folder | applied cleanly; **row counts and every per-table md5 identical before and after** (User, Target, Scan, AuditLogEntry) |
| 3 | **Existing data preservation on the owner DB** | A applied (previous session) and B applied now, each after a `pg_dump` backup | User 86 / Scan 243 / CreditTransaction 267 identical before and after B; 23 functions |
| 4 | **Rollback of B only** | `ROLLBACK-M008B.sql` on a disposable copy (`webaudit_m008_check`, A+B applied) | functions 23 → 20; `f07_admit` 8 → 7 args; `AdmissionLease.executionClass` column dropped; B's `_prisma_migrations` row removed |
| 5 | **Re-application after rollback** | `migrate deploy` | functions back to 23, `f07_admit` 8 args |
| 6 | **Full rollback of A+B** | `ROLLBACK-M008.sql` on `webaudit_test` and the scratch DB (repeated ~10 times during this audit) | all five tables, four enums and every `f07_*` function removed; **both** history rows removed. *Defect found and fixed here:* the original script removed only A's row, so `migrate deploy` silently skipped re-applying B — caught because every test then failed with `INTERNAL_ERROR`. |
| 7 | **Idempotency assumption** | role creation uses `IF NOT EXISTS`; the upgrade DB already had the five roles (cluster-level) from test 1 | passes both with and without pre-existing roles |
| 8 | **Constraint enforcement** | `safety-killswitch-reconciler` "structural invariants": CHECK (`activeConcurrency >= 0`, platform id), kill-switch trigger parity with the TypeScript table (3×3 matrix), audit append-only trigger, REQUESTED→STOPPED by a direct superuser write refused | PASS |
| 9 | **Permission enforcement** | `safety-role-isolation` — **116** tests with real non-superuser logins | PASS |
| 10 | **Partition safety** | migrations A and B contain no `ALTER`/`DROP` against any pre-SPEC 008 table (B alters only SPEC 008's own `AdmissionLease`) (`prisma migrate diff` between datamodels, 0 removed schema lines); `AiInvocation`/`CapabilityExecution` untouched | PASS |

SQL under review is in the repository: `apps/api/prisma/migrations/<name>/migration.sql`; rollbacks in `specs/008-safety-killswitch-budget-audit/amendments/`.
The generator for B extracted function bodies from A and applied targeted edits; its first version mis-bounded PL/pgSQL blocks (a regex matched through to
the next function) — caught by an assertion that each extracted block contains exactly one `CREATE FUNCTION`, then fixed before any database saw it.
