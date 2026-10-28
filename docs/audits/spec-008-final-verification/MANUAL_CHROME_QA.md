# Manual Chrome acceptance — SPEC 008 independent audit

## Method (stated precisely)
- **Browser**: Google Chrome **150.0.7871.124** (installed, `channel: 'chrome'`), headless, **throwaway user-data-dir** per context (no existing profile or session touched).
- **Tooling**: the **Playwright library** driving real Chrome with scripted steps (`results.json`). **Not Playwright MCP** — its browser profile was locked by another instance for the whole session and was left alone. **Not the Playwright test runner** for this run (that is `PLAYWRIGHT_E2E_RESULTS.md`). The driver script is a temporary, uncommitted file; its recorded outputs are in `evidence/chrome-qa/`.
- **Stack under test** (isolated, none of the shared dev services): web `next start` :3020 (built with `NEXT_PUBLIC_API_URL=http://localhost:3021`) → API :3021 running as the **non-superuser** `rt_api` → dedicated Postgres :5452 + dedicated Redis :6391 (AOF) → worker running as **non-superuser** `rt_worker`; fixture site `127.0.0.1:4173` (synthetic, allowed only via the project's `SAFE_NET_ALLOW_TARGETS` test hatch on this stack).
- **Accounts**: `qa-a@example.test`, `qa-b@example.test` (synthetic). Registration went through the real form; there is no SMTP in this environment (mail is console-logged), so email verification was set in the isolated database — a setup step, not a product bypass. No real mail, payment or third-party target was involved.
- **Pacing**: the driver paces navigations at human speed. An earlier, faster driver tripped the product's own strict (10 attempts/15 min) and general (120 req/min) rate limiters and lost its session — the limiters worked as designed and were **not** weakened or cleared; the final run waited out the window and used ≤8 credential attempts.
- **Result: 28 of 28 steps PASS** in the final clean run. (Earlier partial runs failed for driver reasons, listed under "Driver issues" below, and were discarded.)

## Scenarios
| ID | Requirement | Steps → actual | Result | Evidence |
|---|---|---|---|---|
| M1.1 | — | open `/` → renders (title "Fahes") | PASS | — |
| M1.2 | auth | signup with a short password → **submit disabled** and a "12 characters" requirement visible; 0 users created | PASS | `M1-02-weak-password.png` |
| M1.3 | auth | register A through the real form → `/verify-email` page; user row exists, unverified | PASS | `M1-03-verify-email.png` |
| M1.4 | auth | unverified account tries to sign in → stays on `/login` | PASS | — |
| M1.5 | auth | wrong password → `role=alert` "Incorrect email or password.", no session | PASS | `M1-05-wrong-password.png` |
| M1.6 | auth | login → lands on `/scan`; cookies: `refresh_token` httpOnly, SameSite=Lax (secure=false is expected on http://localhost) | PASS | `M1-06-dashboard.png` |
| M2.1–2.6 | dashboard | `/report`, `/usage`, `/billing`, `/settings`, `/progress`, `/fixes` for a new user → each loads with a sensible **empty state** (e.g. "No scan in progress"), billing shows 50 plan credits | PASS | — |
| M4.0 | credit budget | 80-credit quote vs 50 plan credits → no scan created, **0 DEBIT rows** | PASS | `M4-00-over-budget-quote.png` |
| M4.1 | quote | synthetic target `http://127.0.0.1:4173` → "Quote 80 credits" | PASS | `M4-01-quote.png` |
| M4.2 | scan initiation | grant 200 credits, accept & run → live-scan page with the **design-intent questionnaire** and a **Cancel scan** button; **Skip** → worker completes: `COMPLETED|quoted=80|charged=80`, DEBIT rows 0→1 | PASS | `M4-02-live-scan-questionnaire.png`, `M4-03-live-scan-final.png` |
| M8.1 | results | modules: PERFORMANCE COMPLETE 93 · SECURITY COMPLETE 62 · UI **DEGRADED** 100 · TESTING COMPLETE 100 · SEO COMPLETE 91 | PASS (observation) | `M8-01-report.png` |
| **M8.2** | **D-1** | **Still reproducible.** PERFORMANCE = COMPLETE/93 and `cwv-analyzer succeeded=true findings=0`, `lighthouse-analyzer succeeded=true findings=2`, `network-inspector`, `playwright-runner`, `screenshot-capture` all `succeeded=true findings=0`; the scan was **charged 80** — browser-dependent capabilities report success without a browser pool | PASS (reproduces the defect; not fixed — see `DEFECT_REGISTER.md` D-1) | `results.json` |
| M6.1 | FR-026 | full legacy scan: rows across the 5 SPEC 008 tables before/after **78136 → 78136 (delta 0)** (the count is non-zero from the earlier load run; the delta is what matters) | PASS | — |
| M7.1 | cancellation | second scan: real **Cancel scan** button → `CANCELLED` after 4/5 areas delivered; charged 80, **refunded 16 = floor(80×1/5)** (the product's refund rule); ledger `GRANT:50, GRANT:200, DEBIT:80, DEBIT:80, REFUND:16`; SPEC 008 rows delta 0 | PASS | `M7-01-running-with-cancel.png`, `M7-03-after-cancel.png` |
| M9.1 | tenancy | user B opens A's report in the UI → no data leaked; API as B: **GET A's scan 404, cancel A's scan 404**, no token 401, bad token 401 | PASS | `M9-01-B-opens-A-report.png` |
| M9.2 | session | account menu → sign out → `/scan` redirects to `/login?next=%2Fscan`; `refresh_token` cookie gone | PASS | `M9-03-after-logout.png` |
| M10.* | responsive | 1440 / 768 / 390 px: `/login`, `/signup` overflow 0 px; signed-in `/scan` at 390 and 768: overflow 0 px | PASS | `M10-mobile-scan.png`, `M10-tablet-scan.png` |
| M11.1 | a11y | keyboard: tab order logo → language → theme → Email → **Forgot?** → Password; every stop has a 2 px outline (inputs also box-shadow); Enter submits and signs in | PASS | `M11-01-focus-visible.png` |
| M11.2 | a11y | axe-core on `/login`, `/signup`, `/scan`: **0 violations** (0 serious/critical) | PASS | — |
| M12.1 | diagnostics | page errors 0, hydration errors 0; console errors are 401/429 from the logged-out `/auth/me`+`/auth/refresh` probes and from rate-limited requests during an earlier pacing issue (`diagnostics-summary.json`); no 5xx | PASS | `diagnostics-summary.json` |

## SPEC 008 surfaces that have no browser path (not invented)
- **Kill switch, admission, budgets, leases, execution audit**: SPEC 008 defines **no UI and no HTTP route**, and no engine consumes it yet. Scenario 6 ("stop through an existing UI surface") therefore has none; verified by services + real PostgreSQL + real worker instead (`CONCURRENCY_AND_FAILURE_TESTS.md`). M6.1 additionally proves the user-visible scan/cancel/credit flow does **not** touch the new tables (FR-026).
- The only user-facing stop is the pre-existing scan cancellation (M7.1), deliberately unchanged.

## Observations (not failures)
1. **Credential-page tab order puts "Forgot?" between Email and Password.** Common pattern; focus is visible; reported for the design owner.
2. **M9.1 after clearing cookies the page did not redirect immediately**: the access token is held in page memory, so clearing cookies alone does not end the in-memory session until it expires or refreshes (refresh is blocked). Logout (M9.2) does redirect. Normal for a bearer access token; noted, not a SPEC 008 matter.
3. **UI area = DEGRADED/100** is the legacy "missing interpretation, not measurement" meaning (DEC-061) and is scored; see D-1 for why Performance's COMPLETE is misleading.

## Driver issues (discarded runs)
Early runs failed because of driver mistakes, not product defects: the signup button is correctly *disabled* (not clickable) for a weak password; `/reports` is `/report`; new users already get 50 plan credits; Windows `execSync` rejects inline env vars; a cleanup `DELETE` silently failed on a foreign key (fixed with a cascading truncate of the isolated QA database); and rapid navigation exhausted the product's rate limits.
