# Recovery closure and SPEC 009 integration — report, 2026-10-30

**Verdict: PARTIALLY COMPLETE.** Recovery is closed. Of the SPEC 009 integration work, N02 is done and N03 is partly done. N01 is blocked on two undecided contract points. The rest is not started. SPEC 009 is **not** complete and nothing here is a production cutover.

Evidence tags: [DEV] run on this machine in this session; [SRC] source reading.

## 1. Recovery closure
Phase A passed its gate. Details and limits are in `docs/handoffs/NEW_DEVICE_RECOVERY_HANDOFF_2026-10-30.md`: standalone API (4510) + worker + web (4511) started against an isolated database/Redis, `/health` 200, zero error log lines, 35/35 migrations; real Chromium at desktop/tablet/mobile covered home, signup, login, dashboard pages, billing/usage, logout. Scan creation was **refused** (loopback target, 422, correct fail-closed). Target authorization, progress, results, cancellation and credit purchase were not driven in the smoke. Windows hard-kill only: graceful signal shutdown is untested here. This machine is the same Windows computer as before, not a new device.

## 2. Starting Git state
`main` = `origin/main` = `8aa5fc2b1a18`, ahead/behind 0/0. Owner files preserved untouched. The three Prettier-only edits were reviewed (identical ignoring whitespace) and committed with the audit report and handoff as `5bf644e`.

## 3. Implemented
| Task | Result |
|---|---|
| N02 production adapter registry | Done. Registry (`createAdapterRegistry`) already validated duplicates, local-file child module, workspace containment, dispatch queue, `onUnitExpired`, margin. Added: startup log of registered engine ids or "no execution engines registered" (`apps/worker/src/index.ts`); 8 unit tests + 1 real-boot integration test (zero engines → no exec queues/workers); a static test that no production `src` imports test helpers or the test adapter |
| N03 coverage read model | Partial. New `GET /scans/:id/coverage` (`apps/api/src/routes/scans.routes.ts`): tenant-scoped, facts only (no score/verdict), no engine ids/configuration/credential refs, empty for legacy scans; 4 contract tests (content, no leak, legacy empty, cross-tenant 404, auth). Report synthesis and UI do not consume it yet |
| N01 | **Blocked**, not implemented (section 6) |
| N04, N05, V01–V09, D01 | Not started; see `tasks.md` Phase 12 |

## 4. Changed files
`apps/worker/src/index.ts`, `apps/api/src/routes/scans.routes.ts`, `apps/api/tests/contract/scans.coverage.test.ts`, `apps/worker/tests/unit/production-adapter-boundary.test.ts`, `apps/worker/tests/integration/production-adapter-registry-boot.test.ts`, `specs/009-core-scan-execution-platform/tasks.md`, `docs/audits/spec-009-implementation/DEFECT_REGISTER.md`, this report, the recovery handoff.

Database changes: none. No migration.

## 5. Process deviation
CLAUDE.md requires Codex `gpt-6-luna` for implementation. The N01/N02 dispatch failed in about three seconds: `model_not_found` ("not supported when using Codex with a ChatGPT account"), the same condition recorded for SPEC 008. Delegation was therefore technically impossible, and the change was implemented directly under CLAUDE.md's stated exception and verified with real gates. The owner's earlier authorization covered only that earlier session; this deviation needs the owner's awareness.

## 6. N01 blockers (owner/spec decisions; nothing invented)
1. **Passive units have no completer.** The DB transition trigger and `fahes_finalize_unit` allow `PLANNED → COMPLETED` only for `TELEMETRY`; a `PASSIVE_HTTP` unit can only be refused from `PLANNED`. Nothing in production walks a passive unit to COMPLETED, so a flag-on plan with passive units would sit at the plan-unit barrier until its deadline. The contracts do not say who completes them.
2. **No way to request non-passive work.** `/scans` has no profile field; the CUSTOM configuration maps every domain to `PASSIVE_HTTP`.
3. `enqueueEligibleUnits` lives in `apps/worker`; the API may not import it, so enqueue must be a worker-side hook after `Scan.startedAt` is set.
Changing the trigger/finalizer or the request contract touches DB security and billing-adjacent behaviour, so it was not attempted.

## 7. Verification [DEV], isolated PostgreSQL 16 :5461 + Redis :6399, run on the final tree
| Check | Result |
|---|---|
| `pnpm typecheck` | 30/30 |
| ESLint on touched files, `lint:adherence`, Prettier on touched files, `git diff --check` | clean |
| Unit/contract/integration | 244 files, 1,886 passed, 0 failed (was 241/1,873; +3 files/+13 tests are the new ones) |
| Adverse | 73 files, 1,153 passed, 1 skipped (same as baseline) |
| Playwright | 93 passed, 0 failed, 27.1 min |
| Real Chromium smoke | see handoff (run on the pre-change tree; web app code unchanged since) |

Not run: visual project, instrumented coverage, k6/performance, 24-step Chrome acceptance, failure injection, non-superuser real-process stack, real R2. The dev API/worker still use the database superuser. No claim is made for those.

## 8. Requirement matrix and 28-gate DoD (recounted)
No gate or requirement changed status on this evidence. FR-039 stays PARTIAL (API read model exists; report/UI do not consume it). FR totals remain 49: 2 verified-invariant / 28 implemented-and-tested / 16 partial / 0 missing / 3 N/A; SC 8: 2/5/1. DoD 28 gates: **11 PASS / 17 PARTIAL / 0 FAIL / 0 BLOCKED**. Tasks: 49 historical ids, 48 verified, T-U1-10 open (production-engine termination and deployed clock-skew evidence); 15 new ids added in Phase 12 (1 done, 1 partial, 1 blocked on decisions, 12 not started incl. 2 externally blocked).

## 9. Remaining dependencies and owner decisions
External: real R2 credentials (or an accepted S3-compatible emulator), a deployed environment with NTP evidence, k6. Future specs: SPEC 010–012 (production engines, AC-12/19 termination, D-1). Owner decisions: (1) who completes passive units / whether to extend the transition table (G-1); (2) how `/scans` selects a profile (G-2); (3) production cutover policy; (4) billing of non-passive outcomes (DEC-032/062); (5) emulator acceptance; (6) awareness of the Codex-model deviation above.

## 10. Next exact actions
1. Owner decides G-1 and G-2. 2. Implement N01 behind the default-off flag with a worker-side enqueue hook, then N05, V01–V02 (real processes under non-superuser roles). 3. N04 and V03–V05 (independent of N01) can start immediately. 4. Update DoD/matrix after each with recounted totals.

## 11. Git
Commits are listed in the final message and verified against the remote after push.
