# apps/web Testing Guide

Seven layers, each answering a different question. Run them in this order when in doubt about which
one caught a regression.

| Layer | Command | What it answers | Where |
|---|---|---|---|
| Unit | `pnpm test` (root, `--project unit`) | Does this component render the right thing given props? | `tests/unit/` |
| CSS adherence | same, `css-adherence-lint.test.ts` | Any new raw hex/px outside the recorded baseline? | `tests/unit/css-adherence-lint.test.ts` |
| Visual | `pnpm test:visual` (root) | Does a ported page match its design-system reference within 0.5%? | `tests/visual/` |
| Contract/adverse (API side) | `pnpm test` / `pnpm test:adverse` (root, `apps/api`) | Does the backend enforce its own guarantees? | `apps/api/tests/` |
| **E2E** | `pnpm --filter @webaudit/web exec playwright test` | Does a real browser, driving the real UI, against a real API and worker, complete a real user journey? | `tests/e2e/` |
| Manual/Playwright-MCP | walk `tests/manual/CHECKLIST.md` | What can't be scripted (real OAuth, real email, visual judgment)? | `tests/manual/` |
| Accessibility/no-external-requests | `playwright test tests/e2e/accessibility.spec.ts tests/e2e/no-external-requests.spec.ts` | Axe-core violations; any third-party network request? | `tests/e2e/` (pre-existing) |

## Running the e2e suite

```bash
pnpm services:up   # postgres :5442, redis :6389 — see PROGRESS.md's environment gotchas
cd apps/web
npx playwright test tests/e2e/auth/ tests/e2e/support/ tests/e2e/onboarding/ tests/e2e/dashboard/ tests/e2e/admin/ --workers=1
```

Every spec under `tests/e2e/{auth,onboarding,dashboard,admin}/` boots its own real api/worker/web
stack via `tests/e2e/support/stack.ts` — no external services beyond Postgres/Redis need to be
running first. `stack.ts` also opts every spec out of the real Redis-backed credential rate limiter
(`startApi`'s `rateLimiters: null`) — every spec in this suite shares one client IP (127.0.0.1) and
one real Redis instance, so leaving it on means the first handful of spec files exhaust the other
files' register/login budget. **Do not run this suite alongside a separately-running dev stack**
(`pnpm --filter @webaudit/{api,worker} run dev`) pointed at the same `REDIS_URL` — a live dev worker
competes with each spec's own worker for the same BullMQ queue and produces non-deterministic
`RUNNING_PHASE_*` stalls that have nothing to do with the code under test.

Expect the suite to take 8-10 minutes across all 22 specs: `stack.ts` runs a real `next build` per
spec file (`playwright.config.ts`'s `workers: 1` is why — these stacks bind fixed ports and cannot
run concurrently).

## Shared fixtures (`tests/e2e/support/`, `tests/e2e/fixtures/`)

- `stack.ts` — `startStack()`: a real `startApi`/`startWorker`/Next.js production build+start, backed
  by the real test Postgres and Redis. Returns `{ apiBaseUrl, webBaseUrl, db, mailer, stop() }`.
- `auth.ts` — `registerAndVerify`, `loginViaUi` (drives the real `/login` form), `promoteToOperator`.
- `journey.ts` — `runScanToCompletion(page, fixture)`: submits a URL through the real `/scan` form,
  accepts the quote, waits for the scan to finish, and returns `{ scanId }` — the shared starting
  point every dashboard/admin spec that needs a completed audit builds on.
- `fixtures/static-site.ts` — `startFixtureSite()`: a tiny local HTTP server used as the audit target,
  so nothing hits a real third party on every run. Requires `SAFE_NET_ALLOW_TARGETS` set to its
  origin *before* `startStack()` runs (the real SSRF guard reads it live on every request).

## Coverage map

| Page | Covered by |
|---|---|
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | `tests/e2e/auth/*.spec.ts` |
| `/scan`, `/scan/[id]`, `/reports/[id]` | `tests/e2e/onboarding/first-audit.spec.ts` |
| `/fixes` | `tests/e2e/dashboard/fixes-board.spec.ts` |
| `/readiness` | `tests/e2e/dashboard/readiness.spec.ts` |
| `/billing` | `tests/e2e/dashboard/usage-and-billing.spec.ts` |
| `/admin/users` | `tests/e2e/admin/access-gate.spec.ts`, `users.spec.ts` |
| `/admin/capabilities`, `/admin/plans` | `tests/e2e/admin/capabilities-and-plans.spec.ts` |
| `/admin/providers` | `tests/e2e/admin/providers.spec.ts` |
| `/admin/scans`, `/admin/log` | `tests/e2e/admin/queue-and-log.spec.ts` |
| `/usage`, `/admin/queue`, `/admin/settings`, `/admin` (overview), customer `/settings`, `/` (public), `/pricing` | Not covered by an e2e spec — see Open Items |

## Real gaps found and closed while writing this suite

Three pages turned out to be unwired or mock-only, discovered by writing the journey a real user
actually takes rather than by reading the source first. All three are now real:

- **`/scan` was a T241 scaffold placeholder** — the sidebar's only "start an audit" entry point, and
  `/login`'s own post-auth redirect target, rendered a static heading with no form. `ScanForm` (T129)
  was fully built and wired to the real API but never mounted anywhere. Fixed: `/scan` now renders it;
  a new `/scan/[id]` (per `design/screen-map.md`'s own routing table) hosts the equally-orphaned
  `ScanProgress` (T130); `/progress` and `/report` (the sidebar's id-less nav entries) get a real
  "nothing selected" state instead of a 404.
- **`/admin/scans` and `/admin/log` were Server Components rendering 5 hardcoded placeholder rows
  each**, no backend call at all. Fixed: `GET /admin/scans` and `GET /admin/audit-log` are real,
  paginated, operator-gated endpoints now; both pages are wired to them.
- **`/admin/providers` remains local-state-only, by design, for now** — reordering doesn't persist,
  "Add provider" does nothing. Unlike the two gaps above, the real backend chain-replace validation
  (`PATCH /admin/providers`, "fewer than two vendors is refused") already exists with its own
  contract suite; `admin/providers.spec.ts` tests what the screen actually does today rather than a
  mutation nothing calls yet. `/usage` (customer-facing) is the same class of gap — 100% placeholder
  demo data by its own header comment — and is deliberately left alone; `/billing`'s real balance is
  tested instead.

## Open items (honestly not covered by this suite)

- `/admin/queue`, `/admin/settings`, `/admin` overview, `/` (public homepage), `/pricing`, and the
  customer `/settings` page have no e2e spec yet — this suite prioritized the auth flow and the
  highest-traffic customer/admin journeys first. Extending it with one spec per remaining page,
  following the exact same shape as the dashboard/admin specs, is straightforward follow-on work.
- `/usage` and `/admin/providers` are deliberately untested against their own mock behavior beyond
  what's noted above — wiring them for real is follow-on feature work, not a testing gap.
- GitHub OAuth and real email delivery are `tests/manual/CHECKLIST.md` items, permanently — they
  cannot become automated specs without real third-party credentials this repo does not have.
