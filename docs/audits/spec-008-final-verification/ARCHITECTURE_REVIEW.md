# Architecture review (independent)

## Structure
Two-layer admission: **TypeScript** (`apps/api/src/services/safety/*`) owns identity derivation, the F01 `isAuthorized` call and the transaction-joining seam;
**SQL** (`f07_*` `SECURITY DEFINER`, owned by non-superuser `fahes_owner`, `search_path` pinned, `lock_timeout` 3 s) owns every write to the five tables. The worker adds a host-side
watcher (`kill-switch.ts`) and a repeatable `safety-sweep` job. Dependency direction is clean: `worker → @webaudit/api/safety → Prisma/SQL`; `packages/types` owns the four shared enums; `packages/config` owns channel names. No cycle introduced (typecheck 30/30).

## Lock order (DEC-050), re-derived from the final SQL
1. Scope advisory locks — admission: shared, up to six keys in rank order, plus an exclusive **per-unit** key (`f07:exec:<id>`, admission only); stop/ack/record: exclusive on one scope key; reconciler: `pg_try_advisory_xact_lock` (never waits).
2. `BudgetCounter … FOR UPDATE` (reclaim/reconcile use `SKIP LOCKED`).
3. `AdmissionLease` rows. 4. `KillSwitchState` row. 5. inserts.
No function takes a lower level while holding a higher one; the new per-unit key is requested immediately after the scope locks and before any counter lock, and nothing else ever requests it ⇒ it cannot be part of a cycle.
Evidence: deterministic barrier tests in both orders, a mixed-operation run with zero errors, and **0 deadlocks** recorded by PostgreSQL across the load run.

## Findings (all in-scope, all fixed unless stated)
See `DEFECT_REGISTER.md` — D-A/B/C/D/E/F/G/H/I. The common root cause of D-A/D-B/D-D was that the first implementation treated the *lease-held* checkpoint path as only a heartbeat; the spec's FR-018 requires the full sequence (stop check → fresh authorization → budget) at every checkpoint.

## Review of choices that remain
- **Environment is the only mutable authorization input** (grants are immutable except `revokedAt`; scope is immutable) — which is what makes "scope matching stays in TypeScript" safe and "re-check environment in SQL" sufficient (FR-001). A future SPEC 009/012 claim-bound wrapper that admits without TypeScript will need an equivalence-tested SQL scope matcher (AR-19); not built here.
- **STOPPED written only by `f07_record_stopped` and the reconciler**, both verifying no live lease in the same transaction; the `REQUESTED → STOPPED` edge is refused by a trigger as well as by the functions.
- **Leaseless running units** (consuming request budget only) are invisible to the liveness check until SPEC 009 supplies `ExecutionUnit`; they rely on their own checkpoint ack plus the 30 s reconciler grace. Documented limit.
- **Redis is only an accelerant** (`publishStopSignal`, optional subscription); no admission, budget, lease or audit decision reads it (STATIC grep: zero Redis references in those modules).
- **No AI** in any safety path (STATIC grep: zero provider/AI imports).

## Residual risks
Operational role activation (D-M); sandbox SIGKILL wiring (FR-014); uncalibrated timing constants (DEC-060: 30 s lease, 5 s sweep for tests/60 s default, 30 s ack grace); hot-grant contention (D-J).
