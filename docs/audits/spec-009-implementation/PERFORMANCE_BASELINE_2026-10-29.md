# SPEC 009 performance baseline — 2026-10-29

## Scope and method

This is a small local baseline for passive plan resolution, DAG scheduling, BullMQ queue latency/throughput, evidence and artifact writes, finalization, and timeout sweep. It is not a capacity or production deployment result. Nine runs used 100 iterations each for the DAG and sequential queue-latency metrics. The DAG workload was a 1,000-unit chain with 999 edges; each sample includes validation and topological sorting. Sequential queue samples used the existing producer and worker at concurrency 4. Passive plan resolution was measured five times across 100 distinct scans per run; fixture creation and cleanup are outside the timed intervals. Inline evidence, artifact metadata with a memory object store, REFUSED finalization of planned units, and failed-scan timeout sweep were each measured three times over 100 operations. A 500-job concurrent enqueue burst was measured twice with the same no-op worker at concurrency 4.

Environment: Windows 10 Pro 10.0.19045, AMD Ryzen 7 5700 (16 logical processors), Node v24.16.0, x64. The benchmark process ran on the host. BullMQ used the isolated Redis container at `127.0.0.1:6391`; plan resolution used the isolated PostgreSQL container at `127.0.0.1:5545`, database `m009_core01_evidence_fence_test`. No production engine was part of these timings. There was no HTTP endpoint or k6 run.

## Results

| Metric | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 | Run 6 | Run 7 | Run 8 | Run 9 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| DAG `topologicalOrder`, 1,000 nodes / 999 edges, p50 | 0.740 ms | 0.692 ms | 0.774 ms | 0.774 ms | 0.802 ms | 0.761 ms | 0.687 ms | 0.898 ms | 0.674 ms |
| DAG `topologicalOrder`, p95 | 2.045 ms | 1.693 ms | 2.411 ms | 1.957 ms | 1.421 ms | 1.542 ms | 1.521 ms | 1.806 ms | 1.186 ms |
| DAG min / max | 0.607 / 4.808 ms | 0.608 / 3.311 ms | 0.613 / 3.440 ms | 0.590 / 3.973 ms | 0.631 / 2.064 ms | 0.629 / 2.708 ms | 0.599 / 2.998 ms | 0.607 / 3.193 ms | 0.609 / 3.813 ms |
| BullMQ enqueue-to-handler-start, 100 sequential jobs, p50 | 1.735 ms | 1.643 ms | 1.960 ms | 1.668 ms | 1.744 ms | 2.055 ms | 1.715 ms | 1.718 ms | 1.683 ms |
| BullMQ enqueue-to-handler-start, p95 | 3.572 ms | 2.787 ms | 2.517 ms | 2.192 ms | 2.396 ms | 3.197 ms | 2.225 ms | 2.526 ms | 2.461 ms |
| BullMQ min / max | 1.019 / 8.701 ms | 1.045 / 4.340 ms | 1.008 / 4.755 ms | 0.858 / 4.403 ms | 1.017 / 4.324 ms | 0.782 / 4.591 ms | 1.040 / 8.136 ms | 0.938 / 5.952 ms | 1.002 / 3.614 ms |

| Passive resolver metric | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---:|---:|---:|---:|---:|
| 100 passive plans, one unit per plan, p50 | 7.476 ms | 9.296 ms | 9.564 ms | 9.064 ms | 7.489 ms |
| p95 | 10.301 ms | 11.630 ms | 14.268 ms | 12.902 ms | 9.614 ms |
| min / max | 6.094 / 16.930 ms | 7.356 / 17.734 ms | 6.660 / 19.610 ms | 6.922 / 21.758 ms | 6.340 / 16.515 ms |

| Service metric (100 operations per run) | Run 1 | Run 2 | Run 3 |
|---|---:|---:|---:|
| Inline evidence write p50 / p95 | 3.914 / 5.047 ms | 3.781 / 5.202 ms | 2.691 / 3.667 ms |
| Artifact metadata + memory-store write, 20,491-byte object p50 / p95 | 11.641 / 22.762 ms | 11.052 / 14.951 ms | 10.613 / 13.135 ms |
| Planned-unit REFUSED finalization p50 / p95 | 1.047 / 1.715 ms | 1.276 / 1.888 ms | 0.979 / 1.490 ms |
| Planned-unit finalization throughput (serial) | 844.2 units/s | 720.0 units/s | 897.8 units/s |
| Finalization total elapsed | 118.453 ms | 138.895 ms | 111.390 ms |
| Failed-scan planned-unit sweep p50 / p95 | 7.422 / 10.269 ms | 7.394 / 9.028 ms | 7.458 / 10.090 ms |

| 500-job BullMQ burst, worker concurrency 4 | Run 1 | Run 2 |
|---|---:|---:|
| Total elapsed / jobs per second | 162.155 ms / 3,083.5 | 169.483 ms / 2,950.2 |
| Enqueue-to-handler-start p50 / p95 | 110.691 / 151.630 ms | 113.600 / 160.451 ms |

Across the nine DAG/queue runs and five plan-resolution runs, results stayed in a similar range; no failure or lost job was observed. These are local measurements, not service-level objectives. Finalization covers the documented REFUSED-from-PLANNED path, not successful engine completion. Burst jobs use a no-op handler and do not measure a production engine or database-backed job.

## Reproduction

From the repository root, with both isolated containers available and all Prisma migrations already applied to the isolated database:

```powershell
$env:TEST_REDIS_URL = 'redis://127.0.0.1:6391/0'
$env:TEST_DATABASE_URL = '<isolated PostgreSQL URL whose database name ends in _test>'
node node_modules/tsx/dist/cli.mjs scripts/spec009-dag-benchmark.ts
Remove-Item Env:TEST_DATABASE_URL
Remove-Item Env:TEST_REDIS_URL
```

Without `TEST_DATABASE_URL`, the script skips PostgreSQL-backed measurements. Without `TEST_REDIS_URL`, it skips queue measurements. The database URL is checked to end in `_test` or `-test`; records use unique IDs and the script removes only those benchmark scans, plans, units, evidence, artifacts, target, and user. Redis must be a local endpoint; queue names and the BullMQ prefix are unique per invocation; the script closes workers and obliterates only its own prefixed queue keys.

## Still unmeasured

Sustained load, container resource utilization, production-engine execution and throughput, successful RUNNING-unit completion, real R2 persistence, and outage behavior. The burst result is a bounded no-op handler throughput sample, not production work capacity. Finalizer numbers are serial, not concurrent DB capacity. Artifact timing includes PostgreSQL metadata and an in-memory object store; R2 was not contacted. Gate 23 therefore remains PARTIAL; these baseline measurements do not establish production capacity or the full SPEC 009 performance gate.
