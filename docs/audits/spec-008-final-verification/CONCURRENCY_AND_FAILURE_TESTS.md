# Concurrency, failure-injection and mutation evidence

## A. Concurrency (real PostgreSQL, real connections; barriers where noted)
| Test | Technique | Result |
|---|---|---|
| 2 callers / 1 concurrency slot; 25 callers / 5 slots | concurrent `Promise.all` over the Prisma pool | exactly 1 / exactly 5 granted, 0 internal errors; counter == live leases |
| 2 callers / last request unit | same | exactly 1 consumption row |
| 8 concurrent duplicates with one idempotency key | same | 1 lease, 1 consumption |
| 8 concurrent acquisitions of one execution id, different keys (D-C) | same + per-unit advisory lock | exactly 1 `GRANTED`, 7 `EXECUTION_ALREADY_LEASED` |
| Admission waits behind an **uncommitted** stop → refused once the stop commits | **deterministic barrier**: open transaction holds the exclusive scope lock | `KILL_SWITCH_PENDING`, no lease |
| A stop waits behind an **uncommitted** admission → lands after it, lease then stopped | deterministic barrier | lease present, `STOP_PENDING` on renewal, reconciler does not advance while live |
| Stop vs admission under held lock timeout | held advisory lock outlasting `lock_timeout` | `REFUSED/INTERNAL_ERROR`, no partial rows |
| Concurrent reclaimers (4) over 8 expired leases | concurrent | 8 reclaimed in total, counter 0 |
| Concurrent reconcilers (3+2+1) over 6 stops | concurrent | each transition exactly once (6 ACK + 6 STOPPED events) |
| 10 concurrent finalizations of one unit | concurrent (real stack, FI S8) | released once, counter 0, 1 event |
| Mixed 40+ operations (admit/renew/release/stop/reclaim/reconcile) | concurrent | 0 errors; counters consistent |
| Staged load, 1→40 workers (see `PERFORMANCE_AND_K6.md`) | concurrent | max live leases never above the ceiling; **0 deadlocks** in `pg_stat_database`; counters == live leases |

## B. Failure injection (dedicated containers `m008-audit-pg`:5452 and `m008-audit-redis`:6391 with AOF; worker as non-superuser `rt_worker`; the shared dev services were never touched)
| ID | Injection | Observed | Pass |
|---|---|---|---|
| S1a | none (baseline): crashed holder's expired lease | reclaimed in 506 ms | ✔ |
| S1b | stop REQUESTED with a live lease and 2+ sweeps (12 s) | state stayed REQUESTED — **no premature STOPPED** | ✔ |
| S1c | last lease released by authority | ACK then STOPPED 8.1 s later (two 5 s sweeps) | ✔ |
| S2a | **worker process killed** | after 11 s nothing moved: lease still live, stop REQUESTED — state preserved, nothing forgotten | ✔ |
| S2b | worker restarted | reclaim + ACK + STOPPED completed 8.6 s after start | ✔ |
| S3 | **Redis container restarted** (AOF) | sweep resumed without a worker restart; STOPPED 9.7 s after the restart | ✔ |
| S4 | **Postgres paused 8 s** with 6 callers retrying idempotently | each caller needed 3–4 attempts; final: consumed 6, active 6, leases 6, consumption rows 6 — **no double consumption** | ✔ |
| S5 | **6 duplicate `safety-sweep` jobs** enqueued concurrently | lease reclaimed once; exactly 1 `BUDGET_RELEASED` | ✔ |
| S8 | 10 concurrent duplicate finalizations | released once | ✔ |
Worker log across the run: **0 "permission denied" lines**, no error lines other than expected retries.
Not injected: browser-process crash and storage failure (no consumer exists in SPEC 008); a hard kill of a worker *mid-transaction* was not forced (the transaction semantics are covered by the rollback tests).

## C. Mutation testing of the SQL (each mutant applied to `webaudit_test`, the targeted test run, then reverted)
| Mutant | Killed by |
|---|---|
| M1 remove the counter row lock in `f07_admit` | RACE 25-caller test |
| M2 reconciler ignores live leases | KSR "never advances while a live lease remains" |
| M3 `f07_record_stopped` ignores live leases | KSR "cannot skip ACKNOWLEDGED…" |
| M4 renewal ignores a pending stop | KSR "operator TARGET stop is observed" |
| M5 reconciler writes STOPPED directly | KSR "ACK on one pass…" (and now also refused by the trigger) |
| M6 reclaim ignores expiry (in the UPDATE) | KSR "reclaims only expired leases" |
All six killed. (An earlier M6 variant mutated the driver query instead of the UPDATE and survived — correctly, as that mutation is behaviour-preserving; re-targeted and killed.)
