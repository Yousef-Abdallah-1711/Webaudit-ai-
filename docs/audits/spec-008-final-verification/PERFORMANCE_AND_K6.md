# Performance and k6

**k6: NOT APPLICABLE to SPEC 008.** The repository's k6 harness (`load-testing/`, SPEC 004) drives HTTP scan endpoints. SPEC 008 is a database-and-library
foundation with **no HTTP route** (the spec defines none and none was invented). The workload was therefore driven through the real TypeScript services.

**Contractual thresholds** — the spec defines only the 5 s stop bound (FR-013) and the 30 s lease (FR-004). It defines no latency/throughput/capacity limit, so the numbers below are a *measured baseline*, not a pass/fail limit.

## Environment
Single Windows laptop; dedicated `postgres:16-alpine` container (:5452); client = **non-superuser `rt_api`** via the real `requestAdmission` / `releaseLeaseByToken`
(Prisma pool `connection_limit=60`); 12 s per stage; each iteration = one admission + one release. Shared dev services untouched.

## Admission + release (latency per admission call)
| Workers | Grants | Ops | p50 | p95 | p99 | max | Throughput (admit+release /s) | Refused / internal errors |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 | 475 | 21 ms | 26 ms | 30 ms | 82 ms | 40 | 0 / 0 |
| 5 | 1 | 1361 | 31 ms | 41 ms | 56 ms | 132 ms | 113 | 0 / 0 |
| 10 | 1 | 1330 | 47 ms | 111 ms | 169 ms | 239 ms | 110 | 0 / 0 |
| 20 | 1 | 1267 | 90 ms | 325 ms | 524 ms | 699 ms | 105 | 0 / 0 |
| 40 | 1 | 1045 | 190 ms | 899 ms | 1567 ms | 2662 ms | 85 | 0 / **6** |
| 10 | 20 | 2126 | 45 ms | 60 ms | 68 ms | 284 ms | 177 | 0 / 0 |
| 20 | 20 | 2286 | 83 ms | 113 ms | 157 ms | 455 ms | 190 | 0 / 0 |
| 40 | 20 | 2293 | 152 ms | 241 ms | 471 ms | 862 ms | 190 | 0 / 0 |
| 40 | 1 (budget 5) | 2040 | 177 ms | 518 ms | 753 ms | 1463 ms | 22 granted/s | 1771 budget refusals / 0 |

**Observations.** (1) Admission serializes **per grant** on the counter row: one hot grant plateaus near ~105–113 admit+release/s on this machine; independent grants scale ~1.7× (≈190/s, bounded by the single-host database).
(2) **At 40 concurrent callers on one hot grant, 6 admissions fail closed on the 3 s `lock_timeout`** (`INTERNAL_ERROR`, nothing written). This is the designed fail-closed behaviour (FR-005) and callers must retry with the *same* idempotency key (verified safe in FI S4), but it is a capacity limit worth knowing: LOW defect D-J (documented, not changed — the timeout is a deliberate bound).
(3) Scarce budget (40 workers, 5 slots): **max live leases observed = 5**, never above the ceiling.
(4) Consistency after the whole run: counters disagreeing with live leases = **0**; Postgres `deadlocks` for the database = **0**.

## Other measurements
- **Reconciler throughput**: 2000 stranded stops REQUESTED→STOPPED in 8 passes of ≤500 rows, 3.7 s (≈540 rows/s; two passes are inherent to the ACK-then-STOP rule).
- **Kill-switch propagation** (trigger → host observed, non-superuser host, 100 ms poll, 15 samples): p50 66 ms, p95 67 ms, max 67 ms; production default poll is 1 s (≤5 s clamp), against the 5 s contractual bound.
- **Reclaim/recovery**: crashed lease reclaimed in 0.5 s when a worker is running; after a worker restart STOPPED completed in 8.6 s (two 5 s sweep intervals); after a Redis restart 9.7 s.

## Comparison with the earlier microbenchmark (superuser client, `webaudit_test`)
Sequential p50 was 19 ms (now 21 ms as a non-superuser through the same path); 8-worker throughput was ≈113/s (now 113/s at 5 workers). No regression from the audit remediation.

## Not measured
Plan-resolution, DAG, evidence/artifact and finalization latencies (SPEC 009 scope); PgBouncer transaction-pooling path; multi-host capacity; sustained soak.
