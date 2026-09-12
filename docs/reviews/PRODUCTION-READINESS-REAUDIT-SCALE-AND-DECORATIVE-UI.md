# Full Production-Readiness Re-Audit: Scale-to-1M + Complete Decorative-UI Sweep

**Date:** 2026-09-11
**Method:** Six independent, parallel research passes over the real codebase (no code changed, no fixes applied — this is an audit only). Every claim below is cited to a file and line the researching agent actually read. Where no evidence existed, the finding says so explicitly rather than estimating.
**Builds on:** `AUTH_AND_SCALE_AUDIT.md` (2026-09-11, surface-level pass) and `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md` (2026-09-10, workflow/credit/security correctness — different scope, not duplicated here).

---

## PART A — Can this system handle 1,000,000 users/month?

### A.0 — Already known, restated (not re-derived here)

`connection_limit=10` sized explicitly for ~1,000 users / ~60 concurrent audits; no PgBouncer installed; no APM/error-tracking of any kind (Sentry/Datadog/Prometheus/OpenTelemetry — none found anywhere); 2 of the 3 AI providers have no configured price; `apps/probe-pool` is single-instance with no cross-process transport; `apps/sandbox-runner` is a single host process with no proven multi-replica deployment; R2 object storage is already horizontally scalable by design.

### A.1 — Cost modeling at 1,000,000 users/month

**AI provider pricing — only 1 of 3 providers can actually run.** Anthropic has a real configured price (`$5.00` input / `$25.00` output per million tokens, `.env.example:117-118`, matching the default model `claude-opus-5`, `packages/ai-executor/src/providers/claude.provider.ts:40`). OpenAI and Google's price env vars are blank (`.env.example:124-125,130-131`). This isn't a soft gap: `packages/ai-executor/src/pricing.ts:32-41,92-106` makes an unpriced provider **refuse to construct at all** — a default `AI_CHAIN=anthropic,openai` deploy would fail at boot. Since the constitution requires a chain spanning ≥2 vendors, **the system cannot boot into a compliant, real-money-charging configuration today** until at least one more provider's real per-token cost is entered.

**Per-scan AI cost, computed from real numbers:** one AI call per module + one master-report call, using each prompt's declared `estimatedTokens` (PERFORMANCE 4000, SECURITY 4000, UI 6000, TESTING 3000, SEO 3000, master-report 8000 — `apps/worker/src/prompts/*.ts`) = 28,000 tokens/full scan. At Anthropic's real rate: **$0.14/scan (all-input bound) to $0.70/scan (all-output bound)** — a real range, not a guess, though the true input/output split isn't recorded anywhere so the exact point value is unknown.

**Monthly AI cost at 1,000,000 users**, assuming 1 full-audit-equivalent scan/user/month (stated explicitly as an assumption, since no real usage-mix data exists in the repo): **$140,000–$700,000/month in AI spend alone.**

**A real, separate pricing bug found in this pass:** `packages/config/src/pricing.ts` sets `FREE_ALLOCATION = 50` credits but `FULL_AUDIT_COST = 80` credits. **A free-tier user is granted an amount that cannot pay for even one full audit.** This is a product-breaking bug independent of the scale question — it affects user #1 today, not just user #1,000,000.

**Database:** at 1,000,000 scans/month, table growth is on the order of tens of millions of new narrow rows/month (5M `ModuleResult`, up to 16M `CapabilityExecution`, 6–12M `AiInvocation`, 1M+ `CreditTransaction`). This volume is plausibly within reach of a single well-provisioned managed Postgres instance for the OLTP write path, but a **read replica for reporting** (the admin margin dashboard runs ad-hoc aggregate queries against the same primary) would likely be needed well before sharding.

**Redis:** BullMQ queues, the rate limiter, and realtime pub/sub all read the same `REDIS_URL` with **no database-index or instance separation** (`apps/api/src/middleware/ratelimit.middleware.ts:254`, `apps/api/src/index.ts:117,233`, `packages/config/src/queues.ts:103`). This is a real contention risk at scale — one Redis instance absorbing job-queue blocking operations, per-request rate-limit counters, and pub/sub fan-out simultaneously.

**Object storage:** screenshot/artifact storage is real, working R2 infrastructure — but currently **unwired**: nothing in the shipped worker code ever calls `putObject` for a screenshot (`apps/api/src/services/storage/reports.ts:13-16`, own comment: "nothing calls this yet"). Real traffic today is content-addressed, deduplicated archive uploads capped at 50MB each. A worst-case (every scan is a 50MB upload, no dedup credit) estimate is up to 50TB/month, ≈$750/month in R2 storage using R2's publicly known egress-free pricing — very likely a large overestimate given dedup and short retention windows on lower tiers.

**Sandbox-runner / probe-pool at scale:** no per-instance CPU/memory sizing or $/hour is documented anywhere in `infrastructure/`. The honest answer is structural only: N replicas would be needed for N concurrent isolated executions, and the actual dollar cost depends entirely on a cloud compute choice this repo does not specify.

**Cost-tracking / budget-alerting: none exists.** Per-invocation cost is recorded (`AiInvocation` rows), but there is no scheduled digest, no threshold alert, no anomaly detection, and no spend cap anywhere in the codebase. **A pricing bug, a retry storm, or a provider price change would only ever be discovered on the monthly invoice** — confirmed absent by search, not assumed.

### A.2 — Latency / timing budgets across the pipeline

**A real, concrete correctness bug, not just a missing config:** the AI executor's per-attempt timeout is 60,000ms (`packages/ai-executor/src/executor.ts:98,168-170`), applied fresh to each provider in the fallback chain (`executor.ts:181-190`). With the real default 2-provider chain, the **worst-case AI-layer latency is ~120,000ms**. But the module timeout that is supposed to bound the whole module — including its AI layer — defaults to only **60,000ms** (`apps/worker/src/orchestrator/orchestrator.ts:434`, and confirmed the real worker entrypoint never overrides it, `apps/worker/src/index.ts:209-226`). **These two numbers were configured independently and don't compose safely: a module invoking a 2-provider AI fallback can be killed by the outer module timeout before the AI executor's own timeout logic has a chance to fail over.** This is a real bug worth its own fix, found by this audit, not previously known.

**Other configured timeouts found, each cited:** Postgres pool timeout 20s (`apps/api/src/db/client.ts:61-62`) — but **no `connect_timeout` is set at all** (checked `schema.prisma:21-23`). Rate-limiter Redis client: 500ms command timeout, 2s connect timeout (`ratelimit.middleware.ts:59,266-267`) — real and well-configured. **The realtime pub/sub Redis client has neither a connect nor a command timeout configured** (`apps/api/src/index.ts:117`) — it relies entirely on ioredis's own unmodified defaults. **BullMQ's `lockDuration`/`stalledInterval` are never explicitly set anywhere** (`apps/worker/src/queue/queues.ts`, `packages/config/src/queues.ts:86-101`) — production runs on undocumented library defaults. **No server-side WebSocket heartbeat or idle-connection timeout was found** (`apps/api/src/services/realtime/server.ts`) — a half-open socket could be held indefinitely.

**No backpressure mechanism exists.** Scan creation enqueues a job unconditionally with no queue-depth check anywhere (`apps/api/src/services/intake/create-scan.ts`). If the queue backs up, a user's scan simply waits — and the live-progress UI has **no "queued, position N" state at all**: `ScanProgress.tsx` renders only `Preparing`/`Running {module} checks`/`Audit complete` — a user whose scan is stuck behind a deep queue sees indefinite "Preparing" with zero explanation.

**No real production latency data exists.** The only measured timing anywhere in the repo is a 15-second poll deadline in an end-to-end test running with `AI_MODE=fixtures` (near-instant fake AI responses) — explicitly **not representative of real AI provider latency**. Actual end-to-end wall-clock time under real providers at any load is **unmeasured — no evidence found**.

### A.3 — Caching layer (not covered by any prior pass)

**There is no caching layer anywhere in this codebase.** Report reads, scan-status reads, score computation, and readiness-verdict computation are all recomputed from a fresh database query on every single request (`apps/api/src/routes/reports.routes.ts:58-113`, `scans.routes.ts:258-280`, `packages/scoring/src/aggregate.ts`, `apps/worker/src/readiness/verdict.ts`). No Redis-as-cache usage, no in-memory memoization, no `Cache-Control` header set anywhere in `apps/api`, no Next.js `revalidate`/`stale-while-revalidate` config anywhere in `apps/web`. Since nothing is cached, there is also no staleness/invalidation risk from caching — but it also means read load scales 1:1 with traffic with zero mitigation available today.

**A finding worse than "no CDN":** report and screenshot bytes aren't even served via a signed URL straight to R2. `apps/api/src/services/storage/reports.ts:73-99` reads the object **server-side** (`transformToByteArray()`) and streams it back through the API process itself — confirmed at the one real caller (`apps/api/src/routes/readiness.routes.ts:377`). **Every certificate/report/screenshot download consumes the API server's own bandwidth and compute**, with no `getSignedUrl`/presign call anywhere in the repo, and no CDN in front of either the web app or R2 (`infrastructure/deploy.md:105-106` explicitly confirms the browser talks only to `apps/api` directly). This is a real, direct scalability tax that gets worse linearly with report/download volume.

### A.4 — Database read/write scaling beyond connection pooling

**No read replicas exist.** A single `DATABASE_URL` backs one `PrismaClient`, used for every read and every write (`apps/api/src/db/client.ts:98-118`; confirmed no second connection string anywhere in `.env.example` or `infrastructure/deploy.md`).

**Hot-path N+1 check:** scan creation batches its independent reads correctly (`Promise.all`, `create-scan.ts:123-152`). Report synthesis is genuinely 2 queries total, not per-row (`reports.routes.ts:58-113`, using Prisma `include`). The credit-lot debit loop does issue one update + one allocation-create per consumed lot inside a transaction (`debit.ts:112-128`) — technically N+1-shaped, but bounded by the small number of unexpired lots per user, not a real risk at scale. **Index coverage on every hot-path field checked is genuinely thorough** — `Scan`, `Issue`, `CreditTransaction`, and `CreditLot` all have the composite indexes their real query patterns need (`schema.prisma:319,350-351,469,548-550`).

**A real, previously-unfound growth risk:** the retention sweep (`apps/api/src/services/storage/retention.ts:86-101`) does correctly delete real database rows for `Issue`, `ModuleResult`, and `ReadinessVerdict`, plus the matching R2 objects — that part works. **But `CreditTransaction`, `CreditAllocation`, `AiInvocation`, and `CapabilityExecution` have no archival, partitioning, or cleanup job at all, anywhere in the codebase.** These four tables will grow strictly unbounded, forever, for as long as the product runs — a real, concrete future operational and backup-cost problem distinct from the already-known "orphaned R2 file" gap in one narrow sweep path.

### A.5 — Final verdict for Part A

**Restating the combined gap list** (known + newly found): connection pool sized for ~1,000 users with no pooler installed; two of three AI providers cannot legally/architecturally be used (blocking a compliant ≥2-vendor production boot entirely); a free-tier pricing bug that makes the free allocation insufficient for even one audit; zero APM/error-tracking; zero cost-runaway detection; a real timeout-composition bug that can kill a module mid-AI-fallback; several unconfigured timeouts (DB connect, realtime Redis, BullMQ lock/stall, WebSocket heartbeat); no backpressure or queue-position feedback to users; zero caching anywhere; every file download proxied through the API server itself with no CDN; no read replicas; four tables with unbounded growth; `probe-pool` and `sandbox-runner` unproven beyond a single instance each.

**The bottom line, as a number rather than a qualitative judgment:** as configured *today*, the system cannot legally serve **any** real paying user in a constitutionally-compliant configuration at all, because the AI provider chain refuses to boot with fewer than two priced vendors and only one is priced — the practical ceiling right now is **0 real users in production**, not a small number. Once that specific blocker is resolved (entering one more real provider price) and the free-tier pricing bug is fixed, the architecture's own documented headroom (the connection-pool comment explicitly allows roughly doubling capacity via replicas without a redesign) suggests a realistic engineering estimate — **explicitly labeled as an estimate, since no load-testing harness exists anywhere in this repo to measure it** — of somewhere in the **low thousands to low tens of thousands of active users per month** before the missing caching layer, shared single Redis instance, API-proxied file serving, and lack of monitoring start causing real, user-visible degradation. That is roughly **two to three orders of magnitude short of 1,000,000 users/month**, not a small gap to close.

---

## PART B — Complete decorative-UI sweep

**Method note:** three independent passes covered disjoint scopes (dashboard/reports/auth-adjacent/navigation; Settings + Billing, re-verified from scratch rather than trusting the prior claim; the entire 10-page admin panel). Tables below are reproduced as delivered, grouped by page, each row citing the exact handler location.

### B.1 — Dashboard, live-progress, report, fixes, readiness, usage, auth-adjacent, navigation

| Page | Control | State | File:line | What it actually does |
|---|---|---|---|---|
| New-scan | URL tab | REAL | InputTabs.tsx:146-161 | Real input feeding submission |
| New-scan | Repository tab | REAL | InputTabs.tsx:101-115 | `GET /repos` |
| New-scan | Archive tab / dropzone / Browse | REAL | InputTabs.tsx:117-136, 261-269 | Real `POST /scans/upload` |
| New-scan | "Connect GitHub"/"Reconnect" (repo tab) | PARTIAL/BROKEN | InputTabs.tsx:184-191 | Navigates to `/auth/github/connect`, a page that doesn't exist, and a route shape (`POST`) a GET navigation can't satisfy anyway — a dead link, distinct from the real OAuth-start flow login/signup correctly use |
| New-scan | Area checkboxes | REAL | ScanForm.tsx:117-134 | Confirmed |
| New-scan | "Accept and run" | REAL | ScanForm.tsx:93-107,148-154 | Real quote → real scan creation |
| Live progress | Elapsed time / per-area status | REAL | ScanProgress.tsx:116-169 | Real realtime + resync |
| Live progress | "Cancel scan" | REAL | scan/[id]/page.tsx:45-47 | Real cancel + refund |
| Live progress | "Open report" | REAL | ScanProgress.tsx:213-217 | Routes to real report |
| Live progress | Questionnaire submit/skip/choices | REAL | UIQuestionnaire.tsx:185-296 | Real resume/skip endpoints |
| Report | **"Export" button** | **DECORATIVE** | reports/[id]/page.tsx:107-109 | No `onClick` — despite a real, implemented `GET /scans/:id/export` backend route existing (`reports.routes.ts:157`) with zero frontend wiring to it anywhere |
| Report | **"Re-audit" button** | **DECORATIVE** | reports/[id]/page.tsx:110 | No `onClick` at all |
| Report | Area filter tabs | REAL | reports/[id]/page.tsx:87-90,154-167 | Correctly filters real issues |
| Report | **"Copy fix prompt"** | **PARTIAL/BROKEN — fake success** | IssueCard.tsx:56-62,80-88 | Never calls the clipboard API at all; shows "Copied" while copying nothing |
| Fixes | "I fixed this — 3 cr" | REAL | IssueRow.tsx:79-88 | Real charge + real re-verification |
| Fixes | Realtime verdict update | REAL | fixes/page.tsx:72-87 | Real pass/fail reflected |
| Readiness | "Run readiness pass" | REAL | readiness/page.tsx:89-99 | Real fresh re-audit |
| Readiness | Certificate link | REAL | readiness/page.tsx:249-258 | Real, gated correctly |
| **Usage** | **Entire page (stats, chart, refunds)** | **DECORATIVE** | usage/page.tsx:1-41 | Confirmed: own header comment admits every figure is the vendored placeholder, not wired to anything |
| Usage | "Export CSV" | DECORATIVE | usage/page.tsx:52-55 | No `onClick` |
| Verify-email | "Resend verification email" | REAL | verify-email/page.tsx:68-79 | Real resend endpoint |
| Login | "Remember me" checkbox | **DOES NOT EXIST** | — | Confirmed absent by full-text search |
| Login/Signup | "Continue with GitHub" | REAL | login/signup pages | Real OAuth-start route |
| Signup | "Name" field | DECORATIVE | signup/page.tsx:26,61-68 | No backing DB column, never sent |
| Whole app | Notification bell / activity feed | **DOES NOT EXIST** | — | Confirmed absent by full-text search |
| Sidebar | Nav links (real routes) | REAL | Sidebar.tsx | All resolve correctly |
| Sidebar | "Fixes" badge (hardcoded `4`) | DECORATIVE | Sidebar.tsx:228 | Static literal, never reflects real count |
| Public header | "Docs", "Changelog" | DEAD LINK | Public.tsx:47-48 | `href="#"` |
| **Public header / Landing (×3)** | **"Start free" / hero / final CTA** | **DEAD LINK** | Public.tsx:83; page.tsx:71,203 | All link to `/register`, a route that does not exist anywhere in the app (real signup route is `/signup`) |
| Public footer | 9 column links + 2 bottom links | DEAD LINK | Public.tsx:113,123,126 | All `href="#"` |
| Pricing | 4 tier CTA buttons | REAL (nav only) | pricing/page.tsx:99-101 | Correctly link to `/signup`, but the chosen tier isn't passed along |

**Sub-total this pass:** 47 controls audited — 33 REAL, 4 PARTIAL/BROKEN, 6 DECORATIVE, plus 2 confirmed-nonexistent features and 15 dead navigation links found separately.

### B.2 — Settings and Billing (re-verified fresh, not trusting the prior claim)

| Page | Control | State | File:line | What it actually does |
|---|---|---|---|---|
| Settings | **"Save changes"** | **DECORATIVE** | settings/page.tsx:61 | No `onClick` at all; Name/Email are bare `useState`, no `<form>` anywhere on the page |
| Settings | Name input | DECORATIVE | settings/page.tsx:69-75 | Never sent anywhere |
| Settings | Email input | DECORATIVE | settings/page.tsx:79-86 | Claims "sends a new verification link"; no such call exists |
| Settings | **"Change password"** | **DECORATIVE** | settings/page.tsx:89-91 | No `onClick`, opens nothing |
| Settings | Appearance toggle | REAL (client-only) | settings/page.tsx:94-113 | Genuinely changes theme via `localStorage`, zero network call |
| Settings | **"Disconnect" (GitHub)** | **DECORATIVE** | settings/page.tsx:125-127 | No `onClick`; badge stays "Connected" forever |
| Settings | **"Revoke" (session ×2)** | **DECORATIVE** | settings/page.tsx:143-145 | `SESSIONS` is a hardcoded local array, not fetched from anywhere |
| Settings | **"Delete my account"** | **DECORATIVE** | settings/page.tsx:156-158 | No `onClick`, no confirmation, no call — despite a fully real, working `DELETE /auth/me` backend existing |
| Settings | "Manage plan" | DECORATIVE | settings/page.tsx:166-168 | No `onClick`, doesn't navigate |
| Settings | 2FA / notification prefs / timezone / API keys | **DO NOT EXIST** | — | Confirmed absent anywhere in the dashboard app |
| Billing | Subscribe/change-plan buttons | PARTIAL/BROKEN | billing/page.tsx:260-270 | Real DB writes (subscription + credit lot) — but see the payment finding below |
| Billing | Free plan button | DECORATIVE (correctly disabled) | billing/page.tsx:264,269 | Intentionally inert |
| Billing | "Cancel plan" | REAL | billing/page.tsx:289-297 | Real, UI messaging matches backend exactly |
| Billing | **"Buy credits"** | **PARTIAL/BROKEN** | billing/page.tsx:314-316 | Real DB credit grant — no real money ever collected (see below) |
| Billing | Credits input, balance display, movements list, plan grid | REAL | billing/page.tsx (multiple) | All live-queried from real tables |
| Billing | Invoice/receipt view | **DOES NOT EXIST** | — | Confirmed absent anywhere in the app |

**The single most important finding in this entire audit:** a full-text, case-insensitive search of the *entire* `apps/api` tree for "stripe" (or any payment provider) found **zero real payment integration anywhere**. `POST /billing/subscribe` and `POST /billing/credits/purchase` are gated `404` in production specifically *because* they grant real, spendable credit lots and real subscriptions with **no payment step of any kind** — confirmed by the route's own guard comment. `POST /billing/change-plan`, critically, is **not** production-gated at all, and applies for real with no payment-difference check. A generic HMAC-verified webhook receiver exists (`webhooks.routes.ts`) that *would* apply these effects on a real provider's confirmation — but nothing anywhere in the codebase ever initiates a charge, redirects to a checkout page, or calls any payment SDK. **This means: even setting the entire scale question aside, this product today has no mechanism to actually collect money from a real customer for a subscription or a credit purchase.** This is a business-blocking gap on par with the AI-provider-pricing boot-block found in Part A, not a decorative-UI nicety.

**Sub-total this pass:** 21 controls — 6 REAL, 3 PARTIAL/BROKEN, 8 DECORATIVE, 5 confirmed non-existent features.

### B.3 — Admin panel (all 10 pages, enumerated fresh)

| Page | Control | State | File:line | What it actually does |
|---|---|---|---|---|
| Overview | *(no controls — every stat is a hardcoded literal)* | DECORATIVE | admin/page.tsx:22-37 | Zero fetch, zero interactivity |
| Users | Make/Remove operator toggle | REAL | users/page.tsx:115-125 | Real, audited |
| Users | "Load more" | REAL | users/page.tsx:130-140 | Real pagination |
| Users | Suspend/ban | **DOES NOT EXIST — no backend field or route either** | — | `User` has no status/ban column at all; nothing to wire even if a button existed |
| Users | Delete user | **DOES NOT EXIST** | — | No route, no button |
| Users | Grant credits | **Backend real, zero UI** | users.routes.ts:137-173 | Fully working endpoint, completely unreachable from the admin console |
| Users | View user detail | **Backend real, zero UI** | users.routes.ts:102-113 | Same — dead-on-the-frontend endpoint |
| Plans | Activate/Deactivate toggle | REAL | plans/page.tsx:113-123 | Real, enforced downstream |
| Plans | **"New plan"** | **DECORATIVE** | plans/page.tsx:89 | No `onClick`; a fully real `POST /admin/plans` backend sits unused |
| Plans | Edit pricing/limits | **DOES NOT EXIST in UI** | — | No such control anywhere despite the PATCH route supporting a full field patch |
| Capabilities | Enable/Disable toggle | REAL | capabilities/page.tsx:130-140 | Confirms prior T207 finding |
| Capabilities | Tier-restriction | **Backend real and enforced, zero UI** | capabilities.service.ts:317-356 | No chips/checkboxes/plan-picker anywhere sends `planIds` |
| Capabilities | "Run conformance suite" | DECORATIVE | capabilities/page.tsx:100-102 | No such endpoint exists at all |
| Capabilities | **"Upload capability"** | **DECORATIVE — no upload flow exists** | capabilities/page.tsx:103 | Directly confirms the suspicion: `POST /admin/capabilities/upload` is real and fully wired end-to-end (T226/T253), but there is no file-upload control, form, or `lib/api.ts` wrapper anywhere in the admin UI — reachable only via a raw API call |
| **Providers** | **"Up"/"Down" reorder, "Add provider"** | **DECORATIVE** | providers/page.tsx:58,92-109 | Pure local-state array swap; the file imports nothing from `lib/api.ts` at all — the real T208 backend (`GET`/`PATCH /admin/providers`) was never wired to this page |
| Providers | *(backend caveat)* | — | providers.service.ts:6-55 | Even if wired, a persisted chain change would not reconfigure a live worker — the running chain is fixed at boot from env vars, and per this note isn't even re-read from the DB on redeploy |
| Queue | Retry / Cancel buttons | REAL | queue/page.tsx:131-150 | Confirms prior work, audited |
| Queue | "Pause intake", "Retry stalled" | DECORATIVE | queue/page.tsx:101-106 | No such endpoints exist |
| Queue | "Clear queue" | **DOES NOT EXIST** | — | No control, no backend |
| Margin | Stats + per-capability table | **REAL, live-queried data** | billing/page.tsx:49-62 | Genuine — no fabricated numbers found; deliberately omits a margin % since no credit-to-USD rate exists |
| Margin | "Export" | DECORATIVE | billing/page.tsx:74-78 | No such endpoint |
| Scans | "Load more" | REAL | scans/page.tsx:84-96 | Real pagination |
| Scans | Force-cancel / view raw data | **DOES NOT EXIST** | — | No action column, no backend route for either |
| Audit log | Entries + pagination | **REAL — genuinely populated** | log/page.tsx:30-46,75-87 | Real, append-only `AuditLogEntry` rows from every real admin mutation found in this sweep |
| Audit log | Filter/search | **DOES NOT EXIST** | — | No such control on the page at all |
| **Settings (admin)** | **5 feature-flag toggles + "Save"** | **DECORATIVE, re-confirmed fresh** | admin/settings/page.tsx:49,56-69 | Pure `useState`; no `FeatureFlag` model exists in the schema at all and no such function exists in `lib/api.ts` — confirmed by direct search, not by trusting the old comment |

**Sub-total this pass:** 30 real controls audited — **8 REAL, 0 PARTIAL/BROKEN, 22 DECORATIVE** — plus 8 separately-noted claimed admin capabilities (suspend/ban, delete user, grant credits UI, user-detail UI, tier-restriction UI, force-cancel scan, raw-data view, audit-log filter) that have **no UI control at all**, one of which (suspend/ban) has no backend support of any kind either.

### B.4 — Combined totals across all of Part B

| | REAL | PARTIAL/BROKEN | DECORATIVE | Confirmed non-existent | Dead links |
|---|---|---|---|---|---|
| Dashboard/report/auth/nav (B.1) | 33 | 4 | 6 | 2 | 15 |
| Settings/Billing (B.2) | 6 | 3 | 8 | 5 | — |
| Admin panel (B.3) | 8 | 0 | 22 | 8 | — |
| **Total** | **47** | **7** | **36** | **15** | **15** |

**Out of roughly 105 distinct findings across the whole application: fewer than half (47) are genuinely real, working controls.** 36 controls look interactive and do nothing. 15 more features are advertised in the UI's own copy or an obvious missing form (upload capability, tier restriction, grant credits, suspend/ban, invoice view, notification feed, remember-me, 2FA) with **no control at all**, and in one case no backend support to wire it to even if a control existed. 15 more are dead navigation links on public marketing pages, including the site's own primary "Start free" call-to-action pointing at a route (`/register`) that has never existed.

---

## Cross-cutting observation

Both parts of this audit converge on the same shape of problem: **the parts of the system that are hard to build later (the scan pipeline, the credit ledger, the sandbox isolation, the database schema and indexing) are genuinely solid.** The parts that are missing are almost entirely the parts that connect the solid engine to the outside world and to money: no real payment collection, no real email delivery (per the prior audit), no monitoring to know when something breaks, no caching or CDN to survive real traffic, and — separately — a large fraction of the operator-facing admin console that was clearly designed and partially backend-built but never actually wired to a click.
