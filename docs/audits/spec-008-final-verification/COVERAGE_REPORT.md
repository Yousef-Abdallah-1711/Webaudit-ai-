# Coverage report

## Instrumented code coverage — NOT MEASURED (no percentages are claimed)
- The repository has no coverage provider (`@vitest/coverage-v8` is not installed). Installing one would modify `package.json` and `pnpm-lock.yaml`; the lockfile already carries an unreviewed owner change, so this was not done.
- A provider-free attempt was made with `c8` (V8 native coverage via `npx`, no project change) over the SPEC 008 suites (all passed under it). Its report was empty ("Unknown" for every metric): vitest's transformed modules do not map back to the source files through V8 coverage in this setup. The result is recorded as a failed measurement, not as a number.
- **To obtain it**: add `@vitest/coverage-v8@2.1.9` as a dev dependency in a dedicated commit and run `vitest run --coverage --project unit --project adverse` scoped to `apps/api/src/services/safety/**`, `apps/worker/src/orchestrator/{kill-switch,safety-lease-sweep}.ts` and `packages/config/src/safety-channels.ts`.

## Requirement-level coverage (this is what the audit actually established)
Every FR/SC/user-story/edge-case row of `REQUIREMENT_DELTA_MATRIX.md` names the tests that prove it; of the 30 functional-requirement rows, **25 are VERIFIED COMPLETE, 2 PARTIAL (FR-014, FR-022), 3 NOT APPLICABLE (FR-009, FR-019, FR-027)**; of the 6 success criteria, 4 VERIFIED and 2 NOT APPLICABLE by nature (SC-005, SC-006); 0 MISSING, 0 FAILED after remediation (the audit initially found FR-016a FAILED and FR-024 MISSING).

| Dimension | Coverage |
|---|---|
| Contract | admission, checkpoint (incl. new `STATE_UNCERTAIN`, `GRANT_INVALID`, `EXECUTION_ALREADY_LEASED`), kill-switch, audit — each contract clause has a test (matrix) |
| Security | cross-tenant, authority, replay, role matrix (116), hijack, tamper, redaction (`SECURITY_REVIEW.md`) |
| Integration | real PostgreSQL in every suite; real Redis (`HOST`); real worker/BullMQ + non-superuser roles (`FI`) |
| Failure paths | held-lock timeout, caller rollback, DB pause, worker kill, Redis restart, duplicate jobs, retention failure, read failure, audit-write failure during escalation |
| Browser acceptance | 28/28 real-Chrome steps for the user-visible flows SPEC 008 must not disturb; SPEC 008 itself has no UI |
| Mutation | 6/6 SQL mutants killed |

## Known uncovered critical paths
- sandbox-runner SIGKILL through `onEscalate` (hook only; no real child);
- a hard kill of a worker *inside* a transaction (rollback semantics are covered, the kill is not forced);
- production role provisioning and PgBouncer transaction-pooling path;
- multi-replica sweeps (idempotency/skip-locked are tested; two real worker processes were not run).
