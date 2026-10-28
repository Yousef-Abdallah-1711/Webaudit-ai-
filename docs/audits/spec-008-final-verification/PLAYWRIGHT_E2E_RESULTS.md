# Playwright E2E results

| Item | Value |
|---|---|
| Command | `cd apps/web && npx playwright test --workers=1` (config `apps/web/playwright.config.ts`, `testDir ./tests/e2e`, `workers: 1`, `trace: retain-on-failure`, no retries configured) |
| Browser | Playwright-managed Chromium (the runner's default project), not the installed Google Chrome used for the manual QA |
| Environment | each spec boots its own in-process API + worker + `next build`/`next start` against the isolated test database and Redis DB 15 (`tests/e2e/support/stack.ts`); the dev web server (3010) was stopped for the build and restored afterwards |
| **Before the audit** | 93 tests: **92 passed, 1 failed** (`admin/plan-and-credit-journey.spec.ts:69`), 38.0 min |
| **Final (after all code changes)** | **93 tests: 93 passed, 0 failed, 0 skipped, 0 retries/flaky, 33.5 min, exit 0** |

## The previously failing test — reproduced and root-caused
Failure: `getByText('Plan credits')` matched two elements (strict-mode violation) — the table's column header `<span>` (`table_plan_credits`) and the detail panel's `<dt>` (same string).
Classification: **test-selector defect**, not an accessibility or product defect; both elements are legitimate and distinct. It was also *vacuous*: the header is always on screen, so the assertion could pass even if the detail panel never opened.
Fix: assert the detail panel's definition term — `page.getByRole('term').filter({ hasText: 'Plan credits' })` (not `.first()`). The file's pre-existing Prettier drift was deliberately left untouched (the diff is the selector only).
Verification: the targeted spec passed in isolation (1/1), then the whole suite passed (93/93) after the final code change.

## Noise observed (not failures)
`connect ETIMEDOUT` ioredis messages appear in e2e output from a component dialing a non-listening address; tests are unaffected. Pre-existing, not investigated.
Visual regression (`pnpm test:visual`) was **not run** in this verification (no UI changed).
