# Integration test results (evidence kinds kept separate)

| Evidence kind | What ran | Result |
|---|---|---|
| **Real PostgreSQL** | every SPEC 008 suite (`RACE`, `KSR`, `REM`, `CON`, `QS`, `HOST`, `SWEEP`, `ROLE`) on the isolated `webaudit_test`; fresh/upgrade/rollback on disposable databases | all pass (counts in `FINAL_DOD_VERDICT.md`) |
| **Real Redis** | `HOST`: published stop wakes a watcher whose poll is 5 s in <2 s; a malformed message does not abort; dedicated AOF Redis restart during the worker run | pass |
| **Real worker process (BullMQ)** | `worker` as non-superuser `rt_worker`: repeatable `safety-sweep` registered in Redis; crashed-lease reclaim, no premature stop, ACK→STOPPED; killed and restarted; Redis restarted; DB paused; 6 duplicate jobs | pass (S1–S8) |
| **Real HTTP + real Chrome** | isolated web→API→DB→worker stack as non-superusers: register/login/scan/cancel/results/tenancy/logout | 28/28 |
| Contract tests | admission idempotency/fail-closed/audit/redaction, quickstart B1–B3, all 12 audit event types | pass |
| Mocked integration | none used as evidence. Two fault-injection tests wrap the Prisma client to force a failure at one call; everything else is real | — |

## What the worker integration does and does not exercise
- Exercised: job registration/dispatch/handler, the SQL maintenance functions under a least-privilege login, recovery after process/Redis/database interruption.
- **Not exercised (does not exist yet)**: worker → safety admission → engine execution → checkpoint → finalization, because no engine consumes F07 (SPEC 009+). The host-side watcher and `safetyCheckpoint` are library code driven by tests that simulate the execution unit. Claiming end-to-end "scan executes under F07" would be false; M6.1 proves the opposite is true today (legacy scans touch none of the new tables, by design — FR-026).

## D-1 (browser-dependent capabilities) — re-verified, independent of the SPEC 008 verdict
Reproduced in real Chrome (M8.2) on the isolated stack: PERFORMANCE `COMPLETE`/93 while `cwv-analyzer`, `network-inspector`, `playwright-runner`, `screenshot-capture` report `succeeded=true, findings=0` and `lighthouse-analyzer` `succeeded=true, findings=2`; the scan charged 80 credits in full.
Execution path: `apps/worker/src/orchestrator/orchestrator.ts` documents "No probe pool yet; `withPage` still rejects" → the capability runner records the failed page acquisition as a successful execution with no findings.
Product impact: a Performance (and Testing/UI) score and a full charge without a browser measurement. Billing impact: customers are charged for unmeasured areas; refund logic (`floor(charged × undelivered ÷ requested)`) treats the area as delivered.
Options for the owner (none implemented): (a) wire the probe pool and a transport (needs the transport decision); (b) mark such executions not-measured/`DEGRADED` and refund the skipped share (needs DEC-061 / DEC-032 — the legacy `DEGRADED` means "missing interpretation, not measurement" and is scored). No credit semantics were changed.
Verdict separation: this is a **product-level** blocker; it does not affect any SPEC 008 requirement.
