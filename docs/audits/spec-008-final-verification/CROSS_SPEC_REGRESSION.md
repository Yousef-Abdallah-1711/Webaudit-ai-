# Cross-spec regression (SPEC 001–007 impact of SPEC 008 and of this audit's fixes)

**Method**: full unit and adverse suites (they contain the SPEC 001–007 suites), the full Playwright suite (real journeys), real-Chrome journeys on the isolated stack, and a static diff review of every file outside the SPEC 008 surface.

| Spec / area | What could be affected | Evidence | Result |
|---|---|---|---|
| 001 auth, targets, scans, credits | schema growth, extra tables, shared `User` FK usage | Chrome M1–M9 (register, login, wrong password, unverified, over-budget, scan, results, cancel, tenancy, logout); Playwright 93/93; full unit 229 files / **1569** passed | no regression |
| 002 cancellation + refunds | `revoke`/`classify` now also call `triggerStop` | Chrome M7.1: cancel → CANCELLED, refund = floor(80×1/5) = 16, ledger consistent, SPEC 008 rows delta 0; existing cancel/timeout/refund adverse suites pass | no regression |
| 003 SSRF / browser pool | new `AbortSignal` use with `safeFetch` | `kill-switch-abort.test.ts` (real HTTP server) + full SSRF adverse suites; the scan guard refused a loopback target until the explicit test allowance (`SAFE_NET_ALLOW_TARGETS`) | no regression |
| 004 load harness | none | not re-run (no HTTP change) | NOT TESTED |
| 005 production hardening (rate limits, redaction) | audit redaction reuse; limiters | the product's strict (10/15 min) and general (120/min) limiters **fired during Chrome QA and were respected, not weakened**; redaction pass-through tested | no regression |
| 006 architecture assumptions | additive-only, default-off | schema: 0 removed/changed pre-existing lines; legacy scan journey writes 0 SPEC 008 rows | holds |
| 007 authorization | `revokeAuthorization`/`classifyEnvironment` modified (stop wiring); `narrowAuthorization` untouched | authorization + control-gate adverse suites pass; `authorization-audit` unit test's fake transaction updated for the new stop call; **no change to `check.ts`/narrow semantics** | no regression |
| Enum drift guard | four new Prisma enums | mirrored in `packages/types`; guard test passes | no regression |

Regressions found: **none** attributable to SPEC 008 or the audit remediation. One *intermittent* failure of the pre-existing `queue-admission-race` suite (Redis `ECONNRESET`, 5 then 1 failures in two runs, 3/3 and 7/7 passes at other times; the queue code is unchanged) was observed while two extra Docker containers were running; it did not recur after they were removed and the final full adverse run was clean (71 files, 1127 passed, 1 skipped). Classified as environment load, not a code regression.
Pre-existing unrelated defects (kept separate): D-1 browser pool; the e2e selector defect (D-L, now fixed); Prettier drift in some files (not mass-reformatted).
