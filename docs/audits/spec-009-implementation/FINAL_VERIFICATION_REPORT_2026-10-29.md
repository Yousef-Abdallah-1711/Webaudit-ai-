# SPEC 009 — independent verification report (2026-10-29)

## A. Executive summary

**Verdict: PARTIALLY COMPLETE.** SPEC 009 has a working service layer and a direct integration path that passed against disposable PostgreSQL, Redis, and BullMQ. A new role-isolation regression reproduced and fixed excess finalizer grants on a fresh migration chain. This is not a production-complete scan pipeline: the standard worker entrypoint does not start SPEC 009 execution consumers, no SPEC 010–012 production engine is registered, and the API-to-worker path was not exercised. DoD gates remain open.

## B. Starting repository state

- Checkout: `H:\Projects\Webaudit-ai-`; branch `main`.
- Local HEAD and `origin/main` at inspection: `96df6fe72d1107c352e89b9aa6534d612077e4a7`; working tree was already dirty.
- GitHub API and `origin` identify `Yousef-Abdallah-1711/Webaudit-ai-`; the pasted repository name `Yousef-Abdallah-1711/motakamel` returned not-found. No remote divergence was present.
- Existing website/auth refactor edits, `pnpm-lock.yaml`, `.next-final-cta-verify/`, and `logs/` were preserved and excluded from this SPEC 009 change set.

## C. Cross-device environment recovery

Node 24.16, pnpm 9.0.0, Docker 29.7.2, PostgreSQL 16 and Redis 7 images were available. Existing WebAudit production-named containers and shared development Postgres/Redis were left running and untouched. Two isolated disposable containers were created for this verification: PostgreSQL at `127.0.0.1:5545` and Redis at `127.0.0.1:6391`; Postgres data is tmpfs and the containers are `--rm`. A fresh isolated database received the full 27-migration chain. No owner database was reset or migrated in this session.

## D. Specification inventory

The SPEC 009 spec defines FR-001–047 plus amendments, 8 success criteria, 10 U-1 implementation tasks, and 28 DoD gates. Its contracts cover configuration, profiles, plan resolution, unit lifecycle, runtime, deadlines, finalization, evidence, artifacts, provenance, and retention. This report does not claim all 49 requirement entries were re-tested.

## E. Decision verification

The dated decision amendment records DEC-047 Option A, DEC-051 Option A, and DEC-066 Option A in principle as approved. The v6 amendment is retained. No business or billing policy was changed. Future-engine decisions remain with SPEC 010–012.

## F. Requirement-by-requirement delta review

Static inspection confirmed implementation in planning, runtime, safety integration, evidence, artifacts, materialization, and the planned timeout sweep. This session directly re-ran only the role-isolation regression and the execution-runtime integration suite. The requirement matrix's prior totals and commit references are stale and must not be treated as a fresh complete 49-FR review. Main current gaps: standard worker startup composition, production adapter registration, API plan-resolution/dispatch invocation, full permission matrix, event consumer authorization/reconnect behavior, and full-stack evidence.

## G. Database migration results

Created disposable database `m009_privilege_test` and applied all 27 migrations successfully. The additive migration `20261030130000_core01_restrict_finalizer_grants` revokes `EXECUTE` on `fahes_finalize_unit` from `PUBLIC`, `fahes_api`, and `fahes_worker_exec`, then grants it to `fahes_exec_host` and `fahes_orchestrator`. No shared database received this correction. Fresh install was verified; upgrade/rollback of this new additive correction was not run.

## H. Real non-superuser privilege tests

`apps/api/tests/adverse/core01-role-isolation.test.ts` creates actual TCP LOGIN roles for API, generic worker, execution host, orchestrator, operator, and an ungrouped user. Against the pre-fix chain the regression failed for API and generic worker as expected. Against the corrected fresh chain all 7 tests passed: only host/orchestrator can execute the finalizer, column status update privilege is host-only, and a host direct terminal-status write is rejected by the trigger. Lease-secret reads, cross-tenant mutation, effect-ledger forgery, immutable plan writes, and all F07 function bypasses were not covered by this test; the complete requested privilege matrix remains open. The migrated existing development database still has the earlier grant state until the additive correction is deployed there.

## I. BullMQ integration results

`apps/worker/tests/integration/execution-runtime.test.ts`: 16/16 passed with real disposable PostgreSQL, Redis, BullMQ queues, and workers. Covered minimal payload rejection, duplicate delivery, dependent enqueue, progress publication, evidence rows, effect authorization, cancellation, kill switch, grant revocation, deadlines, hard stop, lost lease, crashed-host state recovery, and plan gate. This is a test-process integration, not an API or separately launched production worker test.

## J. Execution host verification

The host/adapter implementation was exercised by those 16 tests; worker TypeScript typecheck passed. A review found that the unregistered-engine refusal path finalized without invoking the plan gate. The host now loads the plan's `scanId` and uses the configured gate before finalizing that refusal; the integration test verifies continuation at the ready barrier. No SPEC 010–012 engine or separately deployed host process exists here.

## K. Progress-event verification

The integration suite observed multiple Redis progress messages on the per-unit channel and validated their shape and indeterminate flag. Authenticated frontend consumption, tenant authorization at subscription time, ordering through reconnect, missed/duplicate event recovery, and restart behavior were not verified.

## L. Artifact retention and reaper verification

Static inspection confirms `createArtifactReaperHandler` is included in the real worker handler map and `scheduleArtifactReaper` is scheduled on the maintenance queue. The worker also passes `artifactStore` into billing retention. This session did not run a retention/reaper lifecycle test or use R2; real object storage remains unverified. The old progress text claiming the reaper was unscheduled is stale.

## M. Real full-stack results

Existing WebAudit Docker containers reported healthy at inspection. They were not launched or modified in this session, and no HTTP scan lifecycle was run through them. Isolated database/Redis integration tests are not a real API+worker stack test.

## N. Real Chrome acceptance

Not run. No Chrome/Chromium manual journey, screenshot, trace, or Playwright MCP session is claimed.

## O. Failure injection

Controlled runtime tests covered cancellation, kill switch, authorization revocation, deadline, hard stop, lease loss, duplicate delivery, and a unit persisted RUNNING after host loss. PostgreSQL/Redis outage, actual process crash/restart, artifact upload/delete failure, and worker reconnection were not injected.

## P. Security review

Confirmed defect: the initial grant migrations left the finalizer callable by API and generic-worker roles. Reproduced with real login roles, fixed additively, and verified on a fresh migration chain. Direct host terminal update is trigger-blocked. Review found no claim of full least-privilege closure: test coverage still needs lease secret, tenant, immutable plan, effects, admission, and SECURITY DEFINER negative cases, and the correction is not yet deployed to the existing shared dev database.

## Q. Full unit suite

Not run in this session. Historical result in `SESSION_PROGRESS.md` is 1,783/1,789 with six failures; it is not current evidence and the failures were not root-caused here.

## R. Adverse suite

The new focused role-isolation adverse test passed 7/7 after the correction. The full adverse suite was not run.

## S. Contract suite

Not run in this session.

## T. Playwright regression

Not run. The web app build previously passed in this session chain, but a build is not browser regression evidence.

## U. Performance measurements

Not run. No k6 or load baseline was collected.

## V. Instrumented coverage

Not run. No coverage report was produced.

## W. Remaining defects and gaps

1. `apps/worker/src/index.ts` starts legacy workers but does not compose `createExecQueues`, `createExecWorkers`, or `createExecutionJobHandler` into the production worker lifecycle.
2. Repository search found `resolvePlan` used in tests and defined in the API service, but no production caller. No API-to-plan-to-enqueue path was exercised.
3. No production SPEC 010–012 adapter is present; this is a future-spec dependency, not a reason to omit testing the generic runtime.
4. The complete negative privilege matrix and non-superuser API/worker execution remain open.
5. Six historical full-suite failures were not investigated to root cause.
6. R2, event consumer security/reconnection, full stack, Chrome, k6, and coverage remain unverified.
7. Existing shared development database still has the earlier finalizer grants until the additive migration is deployed.

## X. External dependencies

- Future engine adapters and browser pool: SPEC 010–012 (D-1 remains open).
- R2 credentials and real object-storage verification: not used or requested.
- Repository identifier mismatch: supplied `motakamel` is not the valid configured remote; work remains on the verified `Webaudit-ai-` origin.
- No unresolved owner business decision was encountered.

## Y. Definition-of-Done results

The 28-gate reassessment is appended to `DEFINITION_OF_DONE.md`. Evidence supports partial progress on queue/host/runtime/security but does not satisfy the real production worker/API, full privilege matrix, full regression, browser, performance, and coverage gates. No historical PASS was promoted solely from its prior status.

## Z. Git commits and remote synchronization

At report creation, implementation and report changes were local and uncommitted. The user's pre-existing web edits and artifacts remain unstaged. Push is authorized by the master directive but is deferred until the final scoped diff and checks are reviewed; no force operation is planned. Record the commit and remote verification here after delivery.

## Verification commands and evidence classification

- `pnpm.cmd --filter @webaudit/worker typecheck` — exit 0; static TypeScript check.
- `TEST_DATABASE_URL=...m009_privilege_test ... vitest run tests/adverse/core01-role-isolation.test.ts` — 7/7, real PostgreSQL TCP login roles; run earlier in this task chain against isolated Docker PostgreSQL.
- `TEST_DATABASE_URL=...m009_privilege_test EXEC_TEST_REDIS=127.0.0.1:6391 pnpm.cmd --filter @webaudit/worker exec vitest run tests/integration/execution-runtime.test.ts --reporter=dot` — 16/16; real PostgreSQL, Redis, BullMQ, test adapter.
- No real HTTP API, separately launched worker, Chrome, Playwright MCP/CLI, R2, k6, coverage, or full-suite evidence is claimed.
