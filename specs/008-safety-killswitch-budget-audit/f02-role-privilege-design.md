# F-02 — Database role, privilege and transactional-surface design for SPEC 008 (Foundation Spec 07)

**Status: FINAL TECHNICAL DESIGN — owner-delegated decisions (2026-10-28); see §13.** The draft text below (§1–§12) is preserved as drafted; §13 records the final answers to Q1–Q5, DEC-050 and DEC-063 and every place the implementation differs from the draft. These are decisions the project owner explicitly delegated to the implementing engineer in the 2026-10-28 session; they are **not** earlier owner answers and must not be cited as such. Drafted under DEC-034 (Option A). DEC-044, DEC-045,
DEC-048, DEC-049 are approved as *directions* (`docs/audits/fahes-master-audit/final-planning/
DECISION_AMENDMENT_2026-10-28_SPEC008_LEVEL1.md`); this text is not approved until the owner signs §10. Nothing
here is implemented. No frozen 008 file is edited; contract changes are in `amendments/AMENDMENT-A1-DRAFT.md`.

Evidence labels: **VERIFIED** (observed 2026-10-28), **DESIGN** (proposed here), **UNKNOWN** (needs evidence).

## 1. Verified starting state

- Dev PostgreSQL 16 (`webaudit-postgres`, port 5442): exactly one role, `webaudit` — Superuser, BYPASSRLS. Databases
  `webaudit`, `webaudit_test` (owner `webaudit`), schema `public` owned by `pg_database_owner`. **VERIFIED.** A superuser
  session ignores every grant and revoke, so **no isolation claim is possible until each runtime connects as a
  non-superuser role.**
- API and worker share one `DATABASE_URL` (`apps/worker/src/db.ts:26`). **VERIFIED (per PROCESS doc).**
- Production managed-DB capabilities (can we create roles, `SECURITY DEFINER`, `ALTER DEFAULT PRIVILEGES`, PgBouncer
  user mapping?) are **UNKNOWN** (EV-07). PgBouncer is in front of Postgres locally (port 6452); per-role pooling must be
  configured (`auth_file`/`auth_query`) — DESIGN §9.
- No 008 table exists. No consumer of F07 exists (legacy scans never call it). Therefore introducing 008 roles cannot
  break any current runtime path as long as legacy tables keep their current grants (§3 "legacy rule").

## 2. Scope boundary

In scope: roles, grants, functions and lock order for the **five 008 tables** (`BudgetCounter`, `AdmissionLease`,
`BudgetConsumption`, `KillSwitchState`, `ExecutionAuditEvent`). Out of scope (owned by 009/012, listed so names stay
compatible): `ExecutionUnit`/claim, `WorkerPrincipal`, broker, `sec_claim_unit_host`, `sec_finalize_unit`, 012 tables.
Legacy tables (`Scan`, `Credit*`, …) keep today's access; least-privilege for them is **not** claimed here.

## 3. Roles (DESIGN)

All roles are created by an additive migration `NOLOGIN`, no passwords, no credentials in the repo. Operations
provisions login roles as members (`GRANT fahes_x TO <login>`), per environment. Role names follow AR-13 so 012 can
extend them.

| Role | Purpose | Notes |
|---|---|---|
| `fahes_owner` | Owns the 008 tables and functions; used only by the migration runner. `NOLOGIN`; migrations run as a member. | Definer functions execute with its privileges. Must not be a superuser in prod. |
| `fahes_api` | API process. | Legacy: unchanged grants (via membership in the existing application role). 008: EXECUTE on API-facing functions only. |
| `fahes_worker_exec` | Worker execution host. | 008: EXECUTE on checkpoint/ack/liveness wrappers only (wrappers are added when 009 exists; until then **no** 008 privilege). |
| `fahes_orchestrator` | Maintenance/sweep/reconciler/finalizer. | 008: EXECUTE on reclaim, reconcile, release-by-authority, ack-by-authority. |
| `fahes_operator` | Incident tooling. | 008: EXECUTE on `f07_trigger_stop` with operator authority only. |

`fahes_broker`, `fahes_api_planner`, `fahes_sec_derive` (AR-13) are created by 012/009 migrations, not here.

**Legacy rule**: this migration does not `REVOKE` anything on existing tables and does not change default privileges
for them. It only (a) creates roles, (b) creates the five tables owned by `fahes_owner`, (c) `REVOKE ALL ... FROM PUBLIC`
on the new tables and functions, (d) grants EXECUTE as below. Existing runtimes continue to work unchanged.

## 4. Privilege matrix for the five tables (DESIGN)

Direct table privileges: **none** for `fahes_api`, `fahes_worker_exec`, `fahes_orchestrator`, `fahes_operator`
(all access is through functions). Exception: `SELECT` on `ExecutionAuditEvent` for `fahes_api` only, because the
tenant-scoped reconstruction query (T029) is a read; the function-less read is acceptable because it adds no write.
Tenant scoping is applied in the query (re-derived through the grant's `userId`), not by privilege.

| Function (schema `public`, owner `fahes_owner`, `SECURITY DEFINER`, `SET search_path = pg_catalog, public`) | api | worker_exec | orchestrator | operator |
|---|---|---|---|---|
| `f07_admit(...)` (locked budget/lease step, §6) | via TS layer | — until 009 wrapper | — | — |
| `f07_renew_lease(lease_id, holder_token)` | — | via wrapper | — | — |
| `f07_release_lease_by_execution(execution_id)` token-free, idempotent, counter-correcting | — | — | EXECUTE | — |
| `f07_release_lease_by_token(lease_id, holder_token)` | — | via wrapper | — | — |
| `f07_trigger_stop(scope, scope_id, triggered_by, reason)` (authority re-checked in function) | EXECUTE | — | EXECUTE | EXECUTE |
| `f07_ack_stop(execution_id, ...)`, `f07_record_stopped(...)` | — | via wrapper | EXECUTE | — |
| `f07_ack_stop_by_authority(execution_id)` (DEC-048 finalizer path) | — | — | EXECUTE | — |
| `f07_reclaim_expired_leases(limit)` (DEC-063) | — | — | EXECUTE | — |
| `f07_reconcile_stranded_stops(limit)` (DEC-048/049) | — | — | EXECUTE | — |
| `f07_scope_has_live_execution(scope, scope_id)` (internal, §8) | — | — | internal | — |
| `f07_record_audit(...)` (the **only** insert path; redaction already applied by caller, §5) | internal only | internal only | internal only | internal only |

"via wrapper" means a claim-bound wrapper that derives identifiers from the claimed unit, created by SPEC 009/012.
Until then the worker role has no 008 privilege — safe because no engine consumes F07 yet.

## 5. Audit writes and redaction

Redaction (`@webaudit/redaction`) is TypeScript; a SQL function cannot redact. Design: callers pass an
**already-redacted** payload to `f07_record_audit`. A "redacted" stamp would be forgeable by any caller with EXECUTE, so
it is not a boundary and is not used. Honest position (DESIGN): redaction stays a TS-layer control for TS callers; SQL-internal events
(reclaim, reconcile, release) contain **only fixed structural fields, never free text** (`payload` is NULL or
a closed key set validated in SQL). `f07_record_audit` is therefore not granted to any runtime role and is called only
by other definer functions (fixed payloads) and by the TS writer through a function that enforces a payload key
allow-list and a size cap. This preserves FR-024 for the data we control and **does not claim** SQL-level redaction of
arbitrary content. Owner sign-off item Q4.

## 6. Admission: two-layer design (resolves contradiction 2)

`isAuthorized` (SPEC 007) is TypeScript (scope/environment matching). DESIGN:

- **Layer 1 (TS, API/orchestrator callers)**: `requestAdmission(tx, args)` takes a Prisma interactive-transaction
  handle `tx` (transaction-joinable for TS callers; satisfies DEC-045 for finalize paths that are TS). Derives `userId`
  from `Target.userId` (never an argument), `now` from the database (`SELECT clock_timestamp()` in the same tx;
  the `now` argument is removed). Calls `isAuthorized`, then calls Layer 2 inside the same tx.
- **Layer 2 (SQL, `f07_admit`)**: re-verifies cheaply *in SQL*: grant exists, belongs to the target's owner, not
  revoked, not expired by DB clock; takes the locks (§7); checks kill-switch under the locks; checks ceilings; inserts
  lease/consumption; bumps counters; writes audit. A caller that skips Layer 1 (a compromised caller with EXECUTE)
  can still not charge another tenant's budget or exceed ceilings or admit while a stop is pending or after
  revocation/expiry. It **can** still claim a wrong destination/scope — scope matching is Layer 1 only.
- **Gap, stated**: a worker-role path that must admit without TS (012 definer finalize/admission) needs an
  equivalence-tested SQL port of scope matching. That is a 009/012 gate (AR-19 "separate admission service"
  alternative) and is **not** built here.
- Idempotency: unique `(targetAuthorizationId, idempotencyKey)` on lease and consumption. Same key returns the prior
  outcome. `holderToken` is generated in SQL (`gen_random_uuid()`), unique per acquisition.

## 7. Lock order and race closure (DESIGN — proposal for DEC-050 / G-03; **not approved**)

Global acquisition order for every 008 operation, always ascending within a level:

1. **Scope advisory locks** `pg_advisory_xact_lock[_shared](hashtextextended('f07:stop:'||scope||':'||scope_id, 0))`
   — admission takes the **shared** lock on each of its up-to-six scope keys (ascending by scope rank
   EXECUTION<SCAN<GRANT<TARGET<TENANT<PLATFORM); `f07_trigger_stop` takes the **exclusive** lock on its one key.
2. `BudgetCounter` row `FOR UPDATE` (lazy create first with `INSERT … ON CONFLICT DO NOTHING`).
3. `AdmissionLease` rows `FOR UPDATE` ordered by `id`.
4. `KillSwitchState` row `FOR UPDATE` (ack/stopped/reconcile).
5. Inserts into `BudgetConsumption` and `ExecutionAuditEvent` (no lock needed).

Race closures:
- **Stop vs admission**: admission re-reads `KillSwitchState` *after* taking the shared locks. A stop that committed
  before is seen; a stop waiting on the exclusive lock commits after the admission, and the new lease is then subject
  to the stop via checkpoint/reconciler. No admission can commit *after* a stop committed without observing it.
- **Release vs reconcile**: reconcile takes step 4 then reads leases under step 3 order; because new admissions in a
  stopped scope are refused while `REQUESTED/ACKNOWLEDGED`, the live-lease set can only shrink, so "no live lease"
  is stable once observed (this is why DEC-049 A is sound).
- **Reclaim vs renew**: both lock the lease row; renew's guarded `UPDATE … WHERE holderToken AND releasedAt IS NULL
  AND reclaimedAt IS NULL` returns 0 rows after reclaim.
- Deadlock: single global order, no function takes a lower-level lock while holding a higher one. Tested with
  concurrent mixed-operation stress (§11).

## 8. Reconciler (DEC-048, DEC-049) and liveness

- `f07_scope_has_live_execution(scope, scope_id)` = exists live lease in scope (`releasedAt IS NULL AND reclaimedAt
  IS NULL AND expiresAt > db now`) **or** (after 009) a non-terminal `ExecutionUnit` in scope. Today **leases are the
  only liveness evidence**; a running unit that holds no lease (consumes.concurrency=false) is invisible. Mitigation:
  such units still acknowledge at their own checkpoint (≤5 s); the reconciler **never** moves `REQUESTED→STOPPED`
  directly — it advances `REQUESTED→ACKNOWLEDGED` only when no live lease exists **and** `requestedAt + ack_grace`
  (default 30 s, DEC-060-class provisional value) has elapsed, then `ACKNOWLEDGED→STOPPED` on the next pass only if
  still no live lease. A leaseless live unit therefore gets a grace window and is not declared stopped on a pure
  timeout of a *live* execution beyond that evidence limit; this limit is documented, not hidden.
- Finalizer path (DEC-048 a): `f07_ack_stop_by_authority(execution_id)` is called inside the finalize transaction
  (TS now, definer later). It acknowledges the EXECUTION row and any broader row only if this was the scope's last live
  lease.
- `STOPPED` is written only by `f07_record_stopped` (host, after exit) or the reconciler, both verifying no live lease
  in the same transaction under the §7 locks. Idempotent; concurrent reconcilers serialize on the row lock
  (`FOR UPDATE SKIP LOCKED` batches).
- Each pass emits one audit row per transition (contract rule 4: exactly one per transition).

## 9. Migration plan (DESIGN; nothing applied)

Never `prisma migrate dev`/`reset`/`db push` (partitioned-PK hazard R1, D-10). Hand-reviewed SQL applied with
`prisma migrate deploy` only, first against a throw-away database.

- M008-1 `roles`: create the five roles `NOLOGIN` (idempotent `DO` blocks), no grants yet.
- M008-2 `schema`: five enums + five tables (owner `fahes_owner`), `REVOKE ALL … FROM PUBLIC`; additive column
  `AdmissionLease.scanId`, `targetId` (nullable) per contradiction 3 — **amends `data-model.md` (A1)**; CHECK
  constraints (`consumedRequests >= 0`, `activeConcurrency >= 0`), partial index on live leases
  `(targetAuthorizationId) WHERE releasedAt IS NULL AND reclaimedAt IS NULL`.
- M008-3 `functions`: the `f07_*` definer functions, `REVOKE ALL ON FUNCTION … FROM PUBLIC`, EXECUTE grants per §4,
  `ALTER FUNCTION … OWNER TO fahes_owner`, `SET search_path` pinned.
- Prisma side: the five models are added to `schema.prisma` as specified (no `@relation`); because Prisma cannot
  express owner/grants/functions, the migration SQL is hand-written and `prisma validate` + a "schema diff is empty
  except known partition drift" check guards it.
- **Rollback/recovery**: tables and functions are new; rollback = `DROP FUNCTION/TABLE/TYPE` of exactly those objects
  in reverse order (documented script, tested on the throw-away DB); roles are left (shared). No existing row is read
  or written by these migrations. Backup before applying anywhere non-ephemeral.
- **PgBouncer**: transaction pooling is compatible with `pg_advisory_xact_lock` (xact-scoped) and with interactive
  transactions on one connection; session-level locks must not be used. Per-role pool credentials are an ops step.
- **Runtime switch** (later, ops-owned): point each process at its own login role; until then the superuser dev
  connection works but proves nothing about isolation. The closure report will state this plainly.

## 10. Owner sign-off request (the exact gate)

Approve, amend or reject each item. S-01 (schema, T002/T003) and everything after it stays blocked until Q1–Q4 are
answered; independent work continues (§12).

- **Q1 (roles/matrix)**: approve §3–§4 (five `NOLOGIN` roles, no direct table DML, function-only access, legacy
  tables untouched).
- **Q2 (two-layer admission)**: approve §6 — TS `requestAdmission(tx, …)` + SQL `f07_admit` re-verifying
  ownership/revocation/expiry/ceilings/kill-switch; scope matching stays TS; SQL port of `isAuthorized` deferred to the
  009/012 gate. Alternative: build the SQL port now (larger, duplicates F01 logic, drift risk).
- **Q3 (lock order = DEC-050 and reclaim job = DEC-063)**: approve §7 lock order and §8 reclaim/reconcile jobs
  (60 s cadence from R3, `ack_grace` 30 s).
- **Q4 (audit redaction)**: approve §5 (TS redaction for TS callers; SQL-internal events carry fixed structural fields
  only; no SQL-level free-text redaction claim) — DEC-068 scope.
- **Q5 (data-model amendment)**: approve additive `AdmissionLease.scanId`/`targetId` and the CHECK/partial-index
  additions (A1 §3).

## 11. Test design (written before implementation; real PostgreSQL, `webaudit_test` or a throw-away DB only)

1. Role isolation: log in as each runtime role on a throw-away DB; assert direct `INSERT/UPDATE/DELETE/SELECT` on the
   five tables is denied, `TRUNCATE` denied, `SET ROLE` / `SET search_path` abuse denied, definer function cannot be
   hijacked by a shadow object in a caller schema, EXECUTE denied where §4 says "—".
2. Admission races (T009/T010, T011, T012, T014a) — N concurrent connections, exactly-once outcomes.
3. Stop vs admission (both orders), release vs reconcile, reclaim vs renew, finalize-ack vs reconcile, two
   reconcilers: assert invariants + no deadlock (`deadlock_detected` count 0) over a randomized interleaving run.
4. Rollback: injected failure at each step leaves no row/counter change; no audit row for a rolled-back operation.
5. Crash/restart recovery (T019c); reconciler restart; replay of an old `holderToken`.
6. Migration tests: apply M008-1..3 on a copy with seeded legacy rows → row counts and checksums of existing tables
   unchanged; rollback script restores the prior catalog.

## 12. Work that proceeds before sign-off (does not depend on Q1–Q5)

- T007 scope-keyed Redis channel helper (pure config package code).
- Pure stop-lifecycle transition table (`REQUESTED→ACKNOWLEDGED→STOPPED`) with unit tests.
- Test harness design only (no schema-dependent tests).

Everything else (T001-stub dirs excepted) waits: T002–T006, T008, T013–T015, T019c–T029.


## 13. Final technical decisions (owner-delegated, 2026-10-28) and implementation deltas

Provenance: the owner approved DEC-034/044/045/048/049 (Option A) and then delegated all remaining *technical*
implementation decisions to the implementing engineer. Nothing here changes pricing, legal policy or a frozen
product requirement. Each answer is verified by the tests named in
`docs/audits/SPEC_008_FULL_IMPLEMENTATION_CLOSURE_2026-10-28.md`.

| Item | Final answer | Why (safest option consistent with the approved directions) |
|---|---|---|
| Q1 roles/matrix | Approved as drafted, **with one change**: `fahes_worker_exec` also receives the *token-bound or read-only* functions (`f07_renew_lease`, `f07_release_lease_by_token`, `f07_stop_pending`, `f07_ack_stop`, `f07_record_stopped`, `f07_mark_escalated`) because the execution host needs them today and none can be abused with guessed identifiers (renew/release need the unguessable `holderToken`; ack only moves `REQUESTED→ACKNOWLEDGED`, still blocking admission; `record_stopped` verifies no live lease itself). It still receives **no** admission, trigger, release-by-authority, reclaim, reconcile or audit-write function. | Least privilege that still lets the host work; matrix asserted in `safety-role-isolation.test.ts` (real non-superuser logins). |
| Q2 admission layers | Two-layer design as drafted. SQL `f07_admit` derives the tenant from `Target.userId`, uses `clock_timestamp()`, re-verifies grant ownership/revocation/expiry, takes the §7 locks, checks the kill switch under them, then ceilings, then writes. Scope matching stays in TypeScript `isAuthorized`; an equivalence-tested SQL port is **deferred to the SPEC 009/012 claim-bound wrappers (AR-19)** and is not claimed here. | Avoids duplicating SPEC 007 logic (drift) while closing the cross-tenant charge and clock holes. |
| Q3 / DEC-050 lock order | §7 order adopted unchanged, with one refinement: the reconciler uses `FOR UPDATE SKIP LOCKED` on rows and `pg_try_advisory_xact_lock` on scope keys, so it never waits and cannot join a cycle; `lock_timeout = 3s` on every definer function turns any unexpected wait into a fail-closed error. | Proven by interleaving tests (stop vs admission in both orders; mixed-operation stress with zero errors). |
| Q3 / DEC-063 reclaim | `f07_reclaim_expired_leases` run by the repeatable `safety-sweep` job (60 s). Only leases past their **database-clock** expiry and never released are reclaimed; contended grants are skipped (`SKIP LOCKED`) and retried; the counter is recomputed from live leases (drift correction). **A lease past expiry can no longer be renewed**, so a late heartbeat cannot revive it; a live lease is never reclaimed. Idempotent; concurrent sweeps safe. | Prevents double release and resurrection; observable (return counts + `BUDGET_RELEASED/RECLAIMED_EXPIRED` audit rows). |
| Q4 audit redaction | As drafted: TypeScript redaction for TypeScript callers; SQL-originated events carry fixed structural payloads; `f07_record_audit_ts` caps payload (object, ≤8 KiB). No SQL-level free-text redaction is claimed. | A forgeable "redacted" stamp is not a boundary. |
| Q5 data model | `AdmissionLease.scanId` and `.targetId` (nullable, additive); CHECK constraints (`>= 0`); partial live-lease index; platform scope id CHECK. | Needed to verify "no live lease" per SCAN/TARGET scope. |

Differences from the draft (all deliberate):
1. **Idempotent replay** of an `(grant, idempotencyKey)` pair returns the stored outcome *including the stored holder token even if that lease has since been released or reclaimed*; the stale holder is then fenced on its next renewal (FR-006a). A new acquisition after reclaim uses a new idempotency key (the frozen unique constraint makes a same-key re-acquire impossible).
2. **Finalizer acknowledgement** (`f07_ack_stop_by_authority`) moves only the unit's own `(EXECUTION, id)` row. Broader-scope rows are advanced only by the reconciler, the safer reading of DEC-048 (a)+(b): nothing advances a broad row on a single unit's say-so.
3. **STOPPED** is written only from `ACKNOWLEDGED` and only after `f07_scope_has_live_execution` is false inside the same transaction (host path `f07_record_stopped` and reconciler alike). `REQUESTED→STOPPED` is impossible (`stop-lifecycle.ts`, mutant-tested).
4. **Reconciler** needs two passes (ack, then stop) and an `ack_grace` (default 30 s, env `SAFETY_STOP_ACK_GRACE_SECONDS`).
5. **Stop events** record the scope's own id in the matching audit column (`f07_audit_scope`), so a tenant-scoped reconstruction through the grant finds them.
6. `f07_stop_pending` also returns `requestedAt` (database clock) so the host's 5 s escalation bound is measured from the request, not from observation.
7. Roles are cluster-level: the migration creates five `NOLOGIN` group roles (idempotent). They now exist in the shared dev cluster. Operations must create login roles as members and, in production, grant the app login `fahes_api` membership **and** keep its existing legacy-table privileges.

Known limits (not hidden):
- The dev API/worker still connect as the shared superuser (`webaudit`); **no isolation is in effect for the running dev stack** until each process is given its own login role. Isolation is proven only for real non-superuser logins in tests.
- Until SPEC 009 supplies `ExecutionUnit`, leases are the only liveness evidence; a running unit that holds no lease is covered only by its own checkpoint acknowledgement plus the grace window. Identity is derived from `Target`/`TargetAuthorization`, not from a claimed unit.
- No engine consumes F07 yet; legacy scans do not call it (additive, default-off).
- Redis is an accelerant only; the 5 s bound rests on the database poll.
