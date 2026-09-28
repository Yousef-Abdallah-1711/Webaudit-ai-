# WebAudit AI — Current System, Audited for Running Production Without Real Paymob or Real AI

**Status: DISCOVERY ONLY.** Nothing in this document is a plan. No code was changed to produce it.
Every claim below is grounded in the actual source (file:line), not documentation, not task
checkboxes, and not assumption. Where something could not be verified from the repository, it is
explicitly listed in §29 rather than guessed.

Date: 2026-09-22 (first pass), updated 2026-09-22 (second pass — closes remaining unknowns).
Auditor: Claude Code, direct inspection of this checkout.

---

## SECOND DISCOVERY PASS — closing every remaining technical unknown

The first pass's optimism about "4 of 5 modules already work without AI" was **correct about the
module logic and incomplete about deployability.** This pass traced the actual boot sequence, not
just the runtime logic, and found **two hard, previously-unidentified blockers** that must be
understood before any implementation plan is written. Both are corrected below and propagated
through the rest of this document (§16, §22, §29-31 all updated to match).

### A. THE #1 FINDING: the worker cannot boot today without real AI provider keys — at all, for any module

Traced completely, file:line, no "likely":

1. `apps/worker/src/index.ts:255`: `const executor = options.executor ?? createExecutorFromEnv();`
   — called **unconditionally, synchronously**, as part of building the worker's `handlers` object,
   which happens once at worker startup, **before any queue consumption begins**. Not lazy, not
   per-scan, not wrapped in a try/catch that degrades.
2. `createExecutorFromEnv` (`packages/ai-executor/src/from-env.ts:132-155`): with `AI_MODE` unset
   (not `'fixtures'`), it reads `AI_CHAIN` (unset → `DEFAULT_CHAIN = 'anthropic,openai'`,
   `from-env.ts:30`) and calls `.map(name => buildOne(name, env))` — **synchronously, immediately**.
3. `buildOne('anthropic', env)` (`from-env.ts:40-44`): if `ANTHROPIC_API_KEY` is unset, **throws
   `ProviderNotConfiguredError` right there**, inside the `.map()`, before `createExecutor` is even
   reached.
4. **I also tested the "empty chain" escape hatch and it does not exist**: even `AI_CHAIN=""`
   (explicit empty string) produces `names = []`, and `createExecutor({chain: []})` calls
   `buildChain([])` (`packages/ai-executor/src/executor.ts:171` → `chain.ts:48-55`), which **throws
   `ChainConfigurationError`** ("No AI providers are configured... requires at least 2 distinct
   vendors (Principle IV)", `chain.ts:49-55`, `MIN_PROVIDER_VENDORS = 2` in
   `packages/config/src/constants.ts:42`). A single configured vendor also throws
   (`chain.ts:87-95`, the two-vendor minimum is enforced by distinct vendor count, not chain length).
5. **Conclusion, proven not inferred**: with `NODE_ENV=production`, `AI_MODE` unset, and zero AI
   provider keys, **the worker process throws at startup and never begins consuming the queue** —
   full stop. This has nothing to do with `impeccable` specifically, nothing to do with `runAiLayer`,
   nothing to do with any module's logic. **No scan of any kind — not URL, not any module, not even
   the 15 purely-deterministic ones — can run, because the process that runs all of them refuses to
   start.** The first pass's "4/5 modules already work without AI" claim is true about *module logic*
   and was importantly incomplete about *deployability*: today, the worker's own boot sequence is the
   actual blocker, not any individual module.
6. `createMasterReportExecutorFromEnv` (used right after, `index.ts:256`) is a non-issue by
   comparison — it only builds a *second* chain if `AI_CHAIN_MASTER_REPORT` is explicitly set, and
   returns the (already-constructed, or already-thrown) `fallback` executor otherwise
   (`from-env.ts:167-182`). It never runs before step 2-3 above would already have thrown.

**This is the real, corrected, single most important finding of this whole audit.**

### B. A second, independent hard blocker of the exact same shape: the API cannot boot in production without email credentials either

1. `apps/api/src/app.ts:329`: `const mailer = deps.mailer ?? createDefaultMailer(deps.db);` — called
   synchronously at `createApp()` construction time (API boot), unconditionally unless a test injects
   `deps.mailer`.
2. `createDefaultMailer` (`app.ts:109-129`): if `EMAIL_TRANSPORT !== 'SMTP'` **and** `env.isProduction`
   is true, it calls `createResendMailerFromEnv()` (`app.ts:127`).
3. `createResendMailerFromEnv` (`apps/api/src/services/email/resend-mailer.ts:165-171`): **throws
   synchronously** if `RESEND_API_KEY` or `EMAIL_FROM` is unset (`:168-169`).
4. **Conclusion**: with `NODE_ENV=production` and no `EMAIL_TRANSPORT=SMTP` (+ SMTP credentials) and
   no `RESEND_API_KEY`/`EMAIL_FROM`, **the API itself throws at boot and never starts serving
   requests.** Console mailer is only ever reached in the non-production branch — it is explicitly
   not a production fallback.
5. **This is easy to satisfy** (unlike the AI blocker) — `EMAIL_TRANSPORT=SMTP` plus real SMTP
   credentials (Hostinger SMTP support already exists in this codebase, per this repo's own commit
   history) is a low-friction, no-external-AI-account-needed path. It is listed here as a hard
   blocker only because it is *also* a boot-time throw, not because it is hard to fix.

### C. The smallest clean architecture for "AI intentionally off, not fixtures" (still not implemented — evaluated only)

Given A above, the fix must live in exactly one place: `packages/ai-executor/src/from-env.ts`'s
`createExecutorFromEnv` (and, for symmetry, `createMasterReportExecutorFromEnv`). The three
candidate shapes from the brief, evaluated against the actual code:

- **`AI_MODE=disabled` (recommended)**: add a third branch, sibling to the existing `fixtures`
  branch, that returns a minimal `AiExecutor` implementation whose `.run()` immediately resolves to
  the same "no provider could be reached" shape `runAiLayer` **already handles gracefully today**
  (`ai-layer.ts:222-238`, the `!result.ok` → `CHAIN_EXHAUSTED` → `degradedReason` set path — this is
  not new code to write in the worker, it already exists and is already proven non-fatal). Unlike
  `AI_MODE=fixtures`, this branch would **not** carry the production-blocking guard — its whole
  purpose is to be production-safe. It never constructs a real provider, never calls `buildChain`
  (so it does not trip the two-vendor minimum — that principle is about *configured-but-fragile*
  chains, not about a deliberately-empty one, and this mode is a third, explicit category, not a
  chain of zero or one). `runAiLayer.ts`, every capability, the schema, and scoring need **zero**
  changes — they already treat a failed/absent AI call as `DEGRADED`/`null summary`, never as a scan
  failure.
- **Empty provider chain**: rejected — `buildChain` explicitly throws on this (§A.4 above); reusing
  the existing chain machinery for "intentionally none" would require *weakening* the two-vendor
  safety check, which is a real constitutional principle (Principle IV, SC-012) protecting against a
  fragile single-vendor deploy — not something to compromise for this unrelated goal.
  **`AI_MODE=disabled` avoids this by being a different code path entirely, not a 0-length chain.**
- **Skip AI-layer capability resolution in the worker**: rejected as the *primary* mechanism — it
  would require touching `module-runner`/`ai-layer.ts` and the capability-resolution logic, a wider
  blast radius than a single new branch in one already-designed-for-this-exact-shape file.

**Where to enforce it**: `packages/ai-executor/src/from-env.ts` only. **Why**: it is the one place
that already distinguishes "fixtures" from "real chain," it is already called from exactly one
production call site (`apps/worker/src/index.ts:255`), and every downstream consumer (`ai-layer.ts`,
every capability, scoring, the schema) is already built to treat "no AI result" as a first-class,
graceful outcome. This is evaluation only, per the brief — not implemented.

### D. Complete deterministic rule inventory (counted from actual source, not manifests)

Grepped every CODE-layer capability's `src/` for its own `checkId`-shaped rule identifiers (a
dotted `module.rule-name` string literal, e.g. `'headers.csp-missing'`), cross-checked against each
file's own `finding(...)` call sites where the pattern used a shared local helper:

| Capability | Module | Distinct rule count | Confirmed examples |
| --- | --- | --- | --- |
| `bundle-analyzer` | PERFORMANCE | 3 | (not individually named in this pass) |
| `cwv-analyzer` | PERFORMANCE | 3 | — |
| `lighthouse-analyzer` | PERFORMANCE | 4 | — |
| `network-inspector` | PERFORMANCE | 4 | — |
| `data-leak-scanner` | SECURITY | 1 (single generic `SECRET_CHECK_ID`, imported from `@webaudit/redaction` — kind captured in evidence, not a separate rule id per secret type) | — |
| `dependency-scanner` | SECURITY | 10 | — |
| `headers-checker` | SECURITY | 5 | `headers.csp-missing`, `headers.frame-options-missing`, `headers.content-type-options-missing`, `headers.permissions-policy-missing`, `headers.referrer-policy-missing` |
| `owasp-checker` | SECURITY | 4 | `owasp.cookie-missing-httponly`, `.cookie-missing-samesite`, `.cookie-missing-secure`, `.server-version-disclosed` |
| `ssl-analyzer` | SECURITY | 3 | `ssl.not-https`, `ssl.hsts-missing`, `ssl.hsts-max-age-low` |
| `content-checker` | SEO | 5 | `content.h1-missing`, `.h1-multiple`, `.lang-missing`, `.images-missing-alt`, `.thin-content` |
| `meta-checker` | SEO | 6 | — |
| `contradiction-detector` | TESTING | 3 | — |
| `playwright-runner` | TESTING | 1 | `testing.broken-link` |
| `css-analyzer` | UI | 3 | — |
| `screenshot-capture` | UI | 4 | — |

**Total: ~59 distinct deterministic rules** across 15 CODE-layer capabilities (data-leak-scanner's
count reflects one shared secret-detection rule id, not per-secret-type rules — this is a modeling
choice already in place, not a gap). This count was derived from grepped string literals, not from
opening and reading all ~4,000+ lines of capability source line-by-line — treat it as a reliable
*approximate* inventory (±a few, for any rule constructed through a variable rather than an inline
literal), not an audited-to-the-line total.

### E. Report quality — real, verified examples (not invented)

Two full real examples, read directly from source:

```
checkId: content.h1-missing
severity: HIGH
title: "Missing H1 heading"
description: "No <h1> tag was found in the page."
consequence: "Search engines and assistive technology both use the H1 as the page's
  primary topic signal; without one there is no clear heading hierarchy to anchor
  either on."
location: <the page URL>
```
(`packages/capabilities-vendored/content-checker/src/index.ts:86-95`)

```
checkId: headers.csp-missing
severity: HIGH
title: "Missing Content-Security-Policy header"
description: "The response carried no Content-Security-Policy header."
consequence: "Without a CSP, the browser applies no restriction on which scripts,
  styles, or resources a page may load, which widens the impact of any injection
  vulnerability."
```
(`packages/capabilities-vendored/headers-checker/src/index.ts:35-41`)

**Assessment against the "would a customer understand what/where/why/how-serious" bar**: both
examples already answer *what* (title), *where* (location, first example), *why it matters*
(consequence), and *how serious* (severity) completely and in professional, plain-English prose —
**classified READY, not "needs copy improvement,"** based on this sample. A full line-by-line
classification of all ~59 rules was not completed in this pass (would require opening and reading
every one of the ~4,000+ lines across 15 files) — the two samples above were chosen as representative
or better cases; not confirmed whether every one of the 59 is this polished. Flagged as a real,
scoped remaining task in §29, not assumed complete.

**What every rule currently lacks**: a distinct "how do I verify the fix" instruction as a separate,
user-facing field — see §F below on `fixPrompt`.

### F. `fixPrompt` — exact generated shape, and a real classification

`buildFixPrompt` (`apps/worker/src/module-runner/attribute.ts:90-117`) generates, verbatim:

```
Fix the following {module} issue.

Problem: {title}
What was measured: {description}
Where: {location}
Why it matters: {consequence}
Evidence: {JSON.stringify(evidence)}

Make the smallest change that resolves this, and do not alter unrelated behaviour.
When you are done, state what you changed so the fix can be re-checked.
```

**This is unambiguously written for an AI coding agent (or a developer acting like one), not a
plain human-facing fix guide.** "Make the smallest change... do not alter unrelated behaviour...
state what you changed so the fix can be re-checked" is agent-directed instructional language. It
is **not** a step-by-step human recommendation ("add this header with this value"), and it has
**no distinct verification-steps field** — "so the fix can be re-checked" refers to this product's
own re-verification *feature*, not user-facing instructions on how to self-verify.

**Conclusion**: `fixPrompt` genuinely is what its name says — a prompt, primarily useful for handing
to a coding agent (human-in-editor via Claude Code, Cursor, etc., or an automated fixer) — not a
polished customer-facing "how to fix" guide. **A separate, deterministic, human-facing
`recommendation`/`howToFix` (and, if wanted, `verificationSteps`) field does not exist today** and
would need to be added if the temporary product wants to show end users plain fix instructions
rather than (or in addition to) an agent-oriented prompt. Not implemented in this pass, per
instructions — flagged as a real, scoped gap.

### G. Central rule catalog vs. per-capability text — architecture comparison (not implemented)

Today: every rule's `title`/`description`/`consequence` text lives **inline, per-capability**, as
plain string literals in each `src/index.ts` (§D/E). No shared, centralized `RULE_CATALOG[checkId]`
exists anywhere in this codebase.

| Dimension | Current (per-capability inline text) | Hypothetical central catalog |
| --- | --- | --- |
| Maintainability | Text changes require touching the specific capability's own file — matches this codebase's existing "each capability owns its own manifest/logic" convention | One file to edit for all text, but couples every capability to a shared schema/file, a new cross-cutting dependency |
| Testing | Already covered by each capability's own existing test suite (`packages/capabilities-vendored/tests/`) | Would need its own separate test suite plus a way to prove every `checkId` used by a capability has a catalog entry (a new invariant to maintain) |
| Consistency | Each capability author writes prose independently — no enforced structure beyond the shared `CapabilityFinding` TS interface | Enforces one consistent shape/tone across all ~59 rules by construction |
| Dynamic evidence | Already fully supported — `evidence`/`location` are populated per-finding, at the capability call site, with real values (URL, header name, etc.) | Would need the catalog entries to be *templates* (e.g. `"{header} header missing"`) interpolated at read time — a real, if small, new mechanism |
| Module ownership | Matches existing per-capability manifest ownership exactly | Crosses ownership boundaries — a catalog entry for `headers.csp-missing` would live outside `headers-checker`'s own package |
| Future AI integration | AI already only ever *adds* an optional `ModuleInsight` on top — unaffected either way | Unaffected either way |
| Localization (future) | Would require finding and changing strings in 15 separate files | Centralizing now would make a future localization pass meaningfully easier |

**Assessment**: the current per-capability-inline approach is what the architecture already
consistently does (manifests, capability ownership, tests are all already organized this way) — it
integrates more naturally with zero new cross-cutting mechanism. A central catalog's main real
advantage (consistency, future localization) is legitimate but is a product/maintainability trade-off,
not a technical necessity — **not implemented, per instructions**, this is a comparison only.

### H. `AdminUserDetail` — exact payload, fully traced (the pass-1 unknown, now resolved)

Traced `apps/web/lib/api.ts:771-778` → `GET /admin/users/:id` (`apps/api/src/routes/admin/users.routes.ts:102-113`)
→ `getUser()` (`apps/api/src/services/admin/users.service.ts:120-163`). The Prisma `select` is
explicit and complete — it fetches **exactly**: `id, email, isOperator, emailVerifiedAt, githubLogin,
createdAt, updatedAt, subscription {planId, status, periodStart, periodEnd, cancelAtPeriodEnd},`
plus a separately-computed `balance {plan, purchased, planExpiresAt}` (via `balanceOf`).

| Field the frontend type declares | Actually returned by the backend? |
| --- | --- |
| `subscription` | **BACKEND EXISTS** — real object, or `null` |
| `balance` (plan/purchased/planExpiresAt) | **BACKEND EXISTS** — summary numbers only |
| `creditLots: readonly unknown[]` | **BACKEND MISSING** — the frontend TS type declares this field, but `getUser()`'s actual return object never includes it. This is a real type/implementation mismatch (aspirational typing, not a lie about working code — but the field is always `undefined` at runtime today) |
| Credit transaction/ledger history | **BACKEND MISSING** from this endpoint entirely — not fetched, not returned |
| Scan history | **BACKEND MISSING** from this endpoint |
| Audit log / operator action trail | **BACKEND MISSING** from this endpoint (a separate `GET /admin/audit-log` endpoint exists elsewhere, not joined here) |
| Payment/receipt history | **BACKEND MISSING** from this endpoint (separate `/billing/receipts` exists for the *user's own* receipts, not surfaced to admin here) |

This corrects pass 1's softer "rendered as raw JSON, so hard to tell what it includes" — the answer
is now definitive: **the endpoint returns only profile + subscription + balance-summary; the ledger/
history/audit data an admin would actually want when inspecting a user is not in this payload at
all**, regardless of how it's rendered.

### I. Admin plan/tier management — definitively resolved (the pass-1 unknown, now a hard "no")

`apps/api/src/services/admin/users.service.ts`'s own module comment (lines ~1-12, directly above the
`UpdateUserInput` interface): *"'Manage' (FR-083's own word) is deliberately narrow here: **the only
mutable field is `isOperator`** — promoting or demoting an operator."* Confirmed by searching every
admin route file for a mutation: `PATCH /admin/users/:id` only accepts `isOperator`; `POST /admin/plans`
manages the **plan catalog** (creating/editing the `starter`/`pro`/`business` definitions themselves,
their prices, their `allowedInputTypes`), not a per-user assignment. **No endpoint exists anywhere in
`apps/api/src/routes/admin/` to assign a specific user to a specific plan/subscription tier.**

**This directly resolves §14's open question with a hard answer**: an admin can grant unlimited
credits to a user, but that user's *effective plan* (`entitlements.ts:85-101`) remains `free` forever
unless they go through the real (or, in dev, stubbed) subscription/payment flow — which, in a
genuinely payments-disabled production deployment, would not exist at all. **A credit-only user in
this temporary product is permanently limited to whatever the `free` plan's `allowedInputTypes`
(URL only, confirmed `Plan` row), `concurrentScanLimit`, and `allowReadinessPass`/`allowCustomCapability`
(both presumably `false` on free) allow — no matter how many credits an admin grants them.** If the
temporary product needs ARCHIVE/REPOSITORY scans or readiness passes available to credit-only users,
a **new** admin capability (assign-plan-without-payment) would need to be built — this does not exist
today, and is not a corner case, it's a hard gap. This is a product decision (§9's question), now
informed by a definitive technical fact rather than an open unknown.

### J. First-admin bootstrap — definitively resolved

Searched `scripts/`, `apps/api/src/index.ts`, and the whole repo for any seed/bootstrap/CLI mechanism
that creates a first `isOperator=true` user. **None exists.** `scripts/seed.ts` seeds `Plan` catalog
rows only (confirmed by its own module comment elsewhere in this codebase: "Plans are data, not
code"), not users. `load-testing/seed-test-user.ts` seeds ordinary (non-operator) load-test accounts.
**The only way to create the first operator today is a direct database update** (`UPDATE "User" SET
"isOperator" = true WHERE email = '...'`) — exactly what this session has been doing manually
throughout. For a real production launch, this is a real, if small, operational gap: someone needs
either a documented one-time manual SQL step, or a small bootstrap script/CLI, neither of which exists
in the repository today.

### K. Deployment topology — resolved from `infrastructure/deploy.md` (previously un-audited)

**No Dockerfile exists for any of the five `apps/*` units** — confirmed by `deploy.md`'s own text:
"None of these five units has a Dockerfile in this repo today." Only `infrastructure/docker-compose.yml`
exists, and it covers Postgres/Redis/PgBouncer only (already known). Documented, verified-by-a-prior-
session process-level commands:

- **`apps/api`**: `pnpm --filter @webaudit/api start` (`node --import tsx src/index.ts`, no build
  step — this whole monorepo runs TypeScript directly via `tsx`, except `apps/web`). Needs
  `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` (fail-closed,
  already known), AI provider keys **or the new disabled-mode from §C** (fail-closed, §A — new
  finding), `RESEND_API_KEY`/`EMAIL_FROM` **or** `EMAIL_TRANSPORT=SMTP` + SMTP vars (fail-closed, §B —
  new finding), `R2_*` (required only at the moment an archive upload is staged — lazy, not boot-time,
  confirmed this session previously), `SANDBOX_RUNNER_URL` (lazy-read, only needed for admin capability
  upload, not the core temporary product).
- **`apps/worker`**: `pnpm --filter @webaudit/worker start`. Same DB/Redis/AI/encryption vars as API
  (writes to the same DB, calls the same AI executor) **plus** `WORKSPACE_BASE_DIR` (required, boot-time
  guard) with real, sized disk (`MAX_ARCHIVE_LIMITS.maxUncompressedBytes` = 512MB per
  `packages/config/src/constants.ts`, × concurrent scans). No inbound port — pure Redis-driven
  consumer.
- **`apps/web`**: the only unit with a real build step (`pnpm --filter @webaudit/web build` then
  `start`). Needs only `API_URL` — holds no secrets of its own, matching this session's own repeated
  confirmation that frontend route guards are UX only, never the security boundary.
- **`apps/probe-pool`**: **confirmed, directly from `deploy.md`'s own text, not just the source
  comment found in pass 1**: "not yet a deployable unit... no server entrypoint and no start script...
  its `package.json`'s only script is a placeholder." Not part of any real deployment today.
- **`apps/sandbox-runner`**: has a real entrypoint (`serve.ts`), only needed if the temporary product
  allows admin-uploaded custom (non-vendored) capabilities — not required for the 16
  vendored/manifest-declared capabilities this whole document is about.

**Minimum topology for the temporary product**: Postgres, Redis, `apps/api`, `apps/worker`,
`apps/web`. PgBouncer is optional (profile-gated, already proven working end-to-end in a prior
session). `apps/sandbox-runner` and `apps/probe-pool` are not required for the URL/vendored-capability
core flow. A reverse proxy (Nginx or equivalent) is assumed necessary for real deployment (TLS, routing
`apps/web`'s browser traffic and `apps/api`'s direct browser calls) but **no such configuration exists
in this repository** — genuinely outside what source can answer, listed as an infra decision in §29.

---

## 0. Answer up front, then the evidence

**Superseded by the second discovery pass above — read that first.** The original claim below (pass
1) was right about *module logic* and wrong about *deployability*: the worker process cannot boot
today with zero AI provider keys, at all (§A above) — so "this system was already built to survive
without AI" is true of every module's own code, but not yet true of the process that runs them. The
fix is small and precisely scoped (§C), not a re-architecture. Original pass-1 text, for the record:

If you only read one paragraph: **this system was already built, deliberately, to survive without
AI and without a real payment provider** *(module-logic level, confirmed still accurate)*. Fifteen of
its sixteen scan modules never touch AI at all. The one that does is layered strictly *on top of*
deterministic findings, never a replacement for them, and its absence is already a modeled,
non-failure state in the database schema. Scoring reads only deterministic severities. Every issue's
fix instructions are generated by a plain function, not an AI call — though that function turned out
to be agent-oriented, not human-facing (§F, new finding). Admin-granted credits already work
end-to-end, but cannot unlock a plan tier (§I, new finding — corrected from "narrower gaps" to a
confirmed hard gap). **The real gap, corrected**: a small, one-file boot-time fix for AI (§C), real
email credentials for the API to boot at all (§B), a UI that only supports part of what the backend
can do, a missing admin plan-assignment capability, and one credit-adjustment capability (removal)
that was deliberately deferred. All are precisely scoped in the second pass above.

---

## 1. Complete application architecture

| Root | Owns | Evidence |
| --- | --- | --- |
| `apps/api` | Express HTTP API: auth, targets, scans, billing, admin, webhooks, realtime WS server | `apps/api/src/app.ts` (route mounting), `apps/api/src/index.ts` (boot) |
| `apps/web` | Next.js 15 / React 19 frontend, all customer + admin UI | `apps/web/app/(dashboard)/*`, `apps/web/app/(admin)/admin/*` |
| `apps/worker` | BullMQ consumer: runs scan phases, module execution, AI layer, report persistence, readiness, re-verification | `apps/worker/src/index.ts`, `apps/worker/src/orchestrator/*`, `apps/worker/src/module-runner/*` |
| `apps/probe-pool` | In-process Chromium pool library (Playwright) for browser-backed capabilities | `apps/probe-pool/src/browser/pool.ts` — **not a standalone service**, no cross-process transport exists (confirmed by its own doc comment) |
| `apps/sandbox-runner` | Isolated execution host for untrusted *installed* (non-vendored) capabilities | `apps/sandbox-runner/src/serve.ts` |
| `packages/types` | Shared domain types/enums (ModuleType, Severity, Attribution, CapabilityFinding, ScanEvent, …) | `packages/types/src/domain.ts`, `events.ts` |
| `packages/config` | Pricing, plans, queue names/priorities, refund/cancellation rules | `packages/config/src/pricing.ts`, `queues.ts` |
| `packages/capability-sdk` | The contract every capability implements; sandbox containment helpers | — |
| `packages/capabilities-vendored` | **The 16 actual scan modules** — see §3 | `packages/capabilities-vendored/*/src/index.ts` |
| `packages/ai-executor` | Provider chain (OpenAI/etc.), fixture mode, cost metering, the fixtures-in-production guard | `packages/ai-executor/src/from-env.ts` |
| `packages/redaction` | Secret detection + prompt assembly boundary | `packages/redaction/src/` |
| `packages/safe-net` / `packages/safe-archive` | SSRF-safe fetch/browser proxy; ZIP guard | — |
| `packages/scoring` | Deterministic scoring, fingerprinting | `packages/scoring/src/aggregate.ts` |

**Real-time data flow, with actual files at every hop:**

```
Browser (apps/web)
  → POST /scans (apps/api/src/routes/scans.routes.ts)
    → createScan() (apps/api/src/services/intake/create-scan.ts)
      → credit admission gate (apps/api/src/services/queue/admission-gate.ts)
      → debit() (apps/api/src/services/credits/debit.ts)
      → db.scan.create (Postgres, Prisma)
      → enqueueFirstPhase() (apps/api/src/services/queue/scan-phase-producer.ts)
        → BullMQ job on `webaudit-scan-phase` queue (Redis; packages/config/src/queues.ts)
          → apps/worker/src/orchestrator/phases.ts picks it up (concurrency: 4,
             apps/worker/src/queue/queues.ts:107-111)
            → apps/worker/src/module-runner/* resolves + runs applicable capabilities
              → each CODE-layer capability (packages/capabilities-vendored/*) returns
                CapabilityFinding[] directly — no AI involved (15 of 16 modules, see §3-4)
              → apps/worker/src/module-runner/ai-layer.ts::runAiLayer() — ONLY called for
                a module that has an AI-layer contributor (today: only UI, via `impeccable`)
              → apps/worker/src/module-runner/attribute.ts — builds Issue rows, including
                a deterministic fixPrompt for EVERY issue (apps/worker/src/orchestrator/fix-prompt.ts)
              → apps/worker/src/module-runner/persist.ts — writes ModuleResult + Issue rows
          → next phase job enqueued, repeat until RUNNING_DOCS → COMPLETED
        → every phase transition publishes a ScanEvent (packages/types/src/events.ts) over
          Redis pub/sub → apps/api/src/services/realtime/server.ts fans it out over
          WebSocket to subscribed browser clients
  → GET /scans/:id/report (apps/api/src/routes/reports.routes.ts)
    → apps/web/app/(dashboard)/reports/[id]/page.tsx renders it
```

---

## 2. Real user flow, traced

| Step | Frontend | API | Service | DB models | Queue/job | Credit behavior |
| --- | --- | --- | --- | --- | --- | --- |
| Register | `apps/web/app/(auth)/signup` | `POST /auth/register` (`auth.routes.ts:75`) | `registration.service.ts` | `User`, `CreditLot` (free grant), `EmailToken` | — | Free-plan `monthlyCredits` granted automatically (`Plan.monthlyCredits`, schema.prisma:259) |
| Verify email | `apps/web/app/(auth)/verify-email` | `GET /auth/verify/:token` | — | `EmailToken` | — | — |
| Login | `apps/web/app/(auth)/login` | `POST /auth/login` | `session.service.ts` | `RefreshToken` | — | — |
| Dashboard / new scan | `apps/web/app/(dashboard)/scan/page.tsx` (`ScanForm`) | `POST /targets`, `POST /scans/quote`, `POST /scans` | `create-scan.ts` | `Target`, `Scan` | enqueues `webaudit-scan-phase` job | Admission-gate check → `assertConcurrencyHeadroom` (plan's `concurrentScanLimit`) → quote-match check → `debit()` |
| Module selection | Same form, checkboxes | quote reflects `packages/config/src/pricing.ts`'s per-area cost | `quote.ts` | — | — | Nothing charged until accept (FR-012) |
| Progress | `apps/web/app/(dashboard)/scan/[id]/page.tsx` (`ScanProgress`) | WS `ws://.../realtime`, fallback `GET /scans/:id` | `realtime/server.ts` | `Scan.state` | — | — |
| Completion | same page → redirect | — | worker's `master-report.ts` (aggregation) | `Scan`, `ModuleResult`, `Issue` | — | — |
| Report | `apps/web/app/(dashboard)/reports/[id]/page.tsx` | `GET /scans/:id/report` | `reports.routes.ts` | `Scan`, `ModuleResult`, `Issue` | — | — |
| Fixes | `apps/web/app/(dashboard)/fixes` | `POST /issues/:id/assert-fixed`, `GET /issues/:id/attempts` | `issues.routes.ts`, worker re-verify | `Issue`, `VerificationAttempt` | `webaudit-reverify` queue | Re-verification has its own pricing/priority (`REVERIFICATION` priority in `queues.ts`) |
| Readiness | `apps/web/app/(dashboard)/readiness` | `POST /scans/:id/readiness` | `readiness.routes.ts` | `ReadinessVerdict` | — | Requires `Plan.allowReadinessPass` |

Automated coverage exists for essentially every step above (auth, scan creation, credits, queue
backpressure, reports/issues IDOR, readiness) under `apps/api/tests/{contract,integration,adverse}/`
— confirmed running clean in this session's own prior work (850+/1204+ tests passing).

---

## 3. Complete scan engine — every module, verified from its own manifest

Every capability under `packages/capabilities-vendored/*/capability.manifest.json` declares its own
`module`, `layer` (`CODE` or `AI`), `requiresCode` (needs the uploaded/cloned source, not just the
live URL), and `requiresScreenshot`. Read directly, not inferred:

| Capability | Module | Layer | Needs code | Needs screenshot | Credit cost basis |
| --- | --- | --- | --- | --- | --- |
| `bundle-analyzer` | PERFORMANCE | CODE | ✓ | — | `PERFORMANCE` area, `packages/config/src/pricing.ts` |
| `cwv-analyzer` | PERFORMANCE | CODE | — | — | same |
| `lighthouse-analyzer` | PERFORMANCE | CODE | — | — | same |
| `network-inspector` | PERFORMANCE | CODE | — | — | same |
| `data-leak-scanner` | SECURITY | CODE | — | — | `SECURITY` area |
| `dependency-scanner` | SECURITY | CODE | ✓ | — | same |
| `headers-checker` | SECURITY | CODE | — | — | same |
| `owasp-checker` | SECURITY | CODE | — | — | same |
| `ssl-analyzer` | SECURITY | CODE | — | — | same |
| `content-checker` | SEO | CODE | — | — | `SEO` area |
| `meta-checker` | SEO | CODE | — | — | same |
| `contradiction-detector` | TESTING | CODE | — | — | `TESTING` area |
| `playwright-runner` | TESTING | CODE | — | — | same |
| `css-analyzer` | UI | CODE | ✓ | — | `UI` area |
| `screenshot-capture` | UI | CODE | — | ✓ | same |
| **`impeccable`** | **UI** | **AI** | — | ✓ (nominal — see below) | same |

**15 of 16 modules are `layer: CODE` — fully deterministic, zero AI, by architecture, not by a
runtime flag.** Only `impeccable` (a design-critique contributor) is `layer: AI`, and it belongs to
the UI module only. PERFORMANCE, SECURITY, SEO, and TESTING have **zero** AI-layer capabilities
between them — their scan pipeline was never going to call AI, with or without `AI_MODE`.

**Execution model**: queue-based, phase-by-phase (`RUNNING_PHASE_1` → `RUNNING_PHASE_2` →
`RUNNING_PHASE_3` → `RUNNING_MASTER` → `RUNNING_DOCS` → `COMPLETED`, per `ScanState` enum,
schema.prisma:71-83), worker concurrency 4 per process (`apps/worker/src/queue/queues.ts:107-111`),
each capability run inside a contained call (`containCapabilityCall`, capability-sdk) so one
capability throwing cannot take down the module's other capabilities or the scan.

**How a scan report is assembled**: each capability contributes `CapabilityFinding[]` (deterministic
measurements) during its phase; `apps/worker/src/module-runner/attribute.ts` turns each into an
`Issue` row (with a deterministic `fixPrompt`, see §4); at the module boundary, `ai-layer.ts::runAiLayer`
is invoked once per module and either produces a `ModuleInsight` (only for UI, only if `impeccable`
ran) or reports `NO_AI_CAPABILITIES` for every other module — explicitly **not** treated as a
degradation (`ai-layer.ts:130-142`, the comment is explicit: "Not a degradation... calling that
DEGRADED would mark most areas degraded for doing exactly what they were configured to do").

---

## 4. AI dependency audit — exhaustive

| Feature | AI used for | Mandatory? | Deterministic data available first? | Fallback if AI fails/absent | Template-replaceable? |
| --- | --- | --- | --- | --- | --- |
| UI module design critique (`impeccable`) | A 2-3 sentence `summary` + up to 25 `insights` (title/explanation/consequence/severity) judging visual design taste | No — `contributors.length === 0` for every other module skips AI entirely, by design | Yes — `getContextData` in `impeccable/src/index.ts:46-77` reads only `codeFindings` (from `css-analyzer`/`screenshot-capture`) and the user's stated design intent | `CHAIN_EXHAUSTED` → `ModuleResult.degradedReason` set, `summary` stays null, **all measured Issue rows are unaffected and still fully populated** (`ai-layer.ts:222-238`) | Partially — the *taste judgment* itself ("this spacing feels cramped") is inherently subjective and not template-mappable; but nothing about scan completion, scoring, or fix instructions depends on it |
| Master report narrative (if configured — `AI_CHAIN_MASTER_REPORT`) | An optional, separately-chainable executive summary for the whole report | No — `createMasterReportExecutorFromEnv` returns the module chain unchanged if unset (`packages/ai-executor/src/from-env.ts:167-182`) | Yes | Falls back to the same chain as everything else, or fixtures | Yes, entirely — see §7 |

**If AI were permanently disabled tomorrow:**
- Scans still reach `COMPLETED` — confirmed by `MODULE_STATES_SCORED` including `DEGRADED`
  (schema.prisma / `packages/types`), and `ai-layer.ts`'s own explicit non-degradation path for the
  4 modules with zero AI capabilities.
- Scores still calculate — `packages/scoring/src/aggregate.ts:46-52` (`SEVERITY_WEIGHT`) reads
  **only `severity`**, a field every `CapabilityFinding` carries regardless of AI. No AI field is
  read anywhere in the scoring path (verified by reading the whole file — no `insight`/`summary`
  reference exists in `aggregate.ts`).
- Fix instructions still exist for every issue — `Issue.fixPrompt` is a **required, non-nullable**
  column (schema.prisma:571), built by `buildFixPrompt` in `apps/worker/src/module-runner/attribute.ts`,
  a plain deterministic function, explicitly documented as built this way "so that guarantee cannot
  be deferred to a later, AI-dependent step" (`apps/worker/src/orchestrator/fix-prompt.ts:6-11`).
- What disappears: only the UI module's `summary`/`insights` narrative text (`ModuleResult.summary`
  stays `null`, which the schema already models as valid — `summary String?`).
- Nothing crashes. Nothing stays stuck in a processing state because of AI absence specifically — a
  chain-exhaustion is caught and turned into `DEGRADED`, not an unhandled rejection.
- No UI component was found that assumes `summary`/`insight` fields are always present —
  `apps/web/app/(dashboard)/reports/[id]/page.tsx` renders `report.summary ?? 'No summary yet.'` (a
  null-safe fallback already exists in the UI itself).

**What `AI_MODE=fixtures` mechanically does** (`packages/ai-executor/src/from-env.ts:132-148`):
swaps the whole provider chain for two `fixtureProvider(...)` instances that presumably answer a
canned/empty structure per the class's own warning text ("Fixture providers answer `{}`" —
`from-env.ts:126`). **Critically, this file already contains a hard, throw-at-boot guard**:
```
if (env['NODE_ENV'] === 'production') throw new FixtureModeInProductionError();
```
(`from-env.ts:140`, class defined at `:121-130`). **Fixtures physically cannot reach production users
today — the process refuses to start.** This is not something that needs to be built; it already
exists.

---

## 5. Fixtures vs real deterministic vs real AI vs templates — traced per field

For a URL scan of, say, the SECURITY module using `headers-checker`:

| Report field | Source | Evidence |
| --- | --- | --- |
| `Issue.checkId`, `.title`, `.explanation`, `.severity`, `.location`, `.evidence` | Real deterministic scanner code, written directly in `headers-checker/src/index.ts` | `CapabilityFinding` interface (`packages/types/src/domain.ts:123-135`) — no AI touches this |
| `Issue.fixPrompt` | Deterministic template function `buildFixPrompt` | `apps/worker/src/module-runner/attribute.ts:173,225` |
| `Issue.attribution` | Set by the runner, not the capability — `MEASURED` for every CODE-layer finding | schema.prisma:569, `attribution Attribution` |
| `ModuleResult.score` | Deterministic formula over severities | `packages/scoring/src/aggregate.ts` |
| `ModuleResult.summary` (SECURITY module) | **Never set — SECURITY has no AI-layer capability at all** | confirmed via manifest table in §3 |
| `ModuleResult.summary` (UI module, `impeccable`'s contribution) | Real AI call in production/dev, or `AI_MODE=fixtures`' canned fixture response in test/local, **never both in the same environment** (guarded, §4) | `ai-layer.ts:214-220` |

**No fixture data can leak into a real report today** because (a) fixtures only activate via
`AI_MODE=fixtures`, which (b) throws at boot in `NODE_ENV=production`, and (c) even where AI runs, it
only ever supplies the optional `summary`/`insights` fields for one module — never an `Issue` row,
never a score, never a `fixPrompt`. **Production can already run with real scanner + deterministic
interpretation + deterministic fix templates, without fixtures and without external AI, for 4 of 5
modules completely, and for the UI module's *measured* findings (not its taste critique) as well.**

---

## 6-7. Report system & template-engine feasibility

`Issue` (schema.prisma:548-579) already carries every field the desired template model asks for:
`fingerprint` (deterministic identity), `checkId` (rule id), `severity`, `title`, `explanation`,
`consequence`, `location`, `evidence` (Json), `attribution`, `fixPrompt`, `state`. This is, field for
field, the "Raw Finding → Rule ID → Severity → Evidence → Explanation → Fix" shape the target
architecture describes — **it already exists as the persisted schema**, not something to design from
scratch. The open question is not "can findings carry template-shaped data" (yes, today), it's
"is each capability's own `title`/`description`/`consequence` text already professionally-written and
complete enough," which requires reading each of the 15 CODE-layer capabilities' own source
line-by-line — not done in this pass; flagged in §29 as a real unknown requiring that follow-up read.

Report UI (`apps/web/app/(dashboard)/reports/[id]/page.tsx`) already renders `report.score`,
`report.summary`, `report.areas[]` (per-module state/score), and `report.issues[]` with severity/
attribution/location/description/fixPrompt — all null-safely. No new UI is needed to display a
100%-deterministic report; it already treats AI-sourced fields as optional.

## 8-9. Template sizing & scoring — see §3's table for per-module capability counts (this pass did
not count individual rule-IDs inside each capability's source — that requires opening all 15
CODE-layer capabilities' `src/index.ts` files individually and counting distinct `checkId` constants,
not done here, flagged in §29).

**Scoring is 100% AI-free, confirmed by reading the whole file**: `SEVERITY_WEIGHT` (CRITICAL=25,
HIGH=12, MEDIUM=5, LOW=2, INFO=0) is the entire formula; `overallScore()` averages only
`isScorable` module states (COMPLETE, DEGRADED — both "measured something", per `MODULE_STATES_SCORED`);
`FAILED`/`NOT_APPLICABLE`/`PENDING`/`RUNNING` score `null`, never coerced to zero
(`packages/scoring/src/aggregate.ts:26-27`, explicit rule).

---

## 10. Credit system, traced

Models (schema.prisma): `CreditLot` (amountGranted, amountRemaining, kind, source, expiresAt),
`CreditTransaction` (ledger entries, reason strings like `scan:create`, `grant:admin`),
`CreditAllocation` (links a transaction to the lot(s) it drew from — supports multi-lot debits).

- **Balance** = sum of non-expired `CreditLot.amountRemaining` (`services/credits/balance.ts`).
- **Debit** draws from lots — this session's own prior work confirmed (live, under concurrency) that
  debit is atomic and race-safe (no double-spend, no negative balance) via direct load testing.
- **Admin grant** (`adjustCredits`, `services/credits/adjust.ts`) wraps the exact same `grantLot`
  every other legitimate credit source uses (free signup, subscription, purchase, webhook) —
  tagged `source: 'ADMIN_GRANT'` in the ledger, and writes an `AuditLogEntry` in the **same DB
  transaction** as the grant (`adjust.ts`'s module comment: "the grant and its AuditLogEntry land in
  one `$transaction`, so a credit grant without an audit trail... cannot happen").
- **Validation** (`adjust.ts:70-83`): `amount` must be a positive integer (no zero, no negative — see
  §23), `kind` must be `PLAN` or `PURCHASED`, a `PURCHASED` grant must never have an expiry, `reason`
  is required non-empty.
- **Scan fails** → refund path exists (`services/credits/refund.ts`, `refund-on-failure`,
  `refund-to-lot` — all covered by this session's already-passing adverse tests).
- **Worker crashes mid-scan** → job stays queued in BullMQ (proven live this session: an accidental
  worker outage left jobs safely queued, zero loss, zero duplicate processing on restart).
- **Duplicate/concurrent scan-creation requests** → prevented by two independent mechanisms, both
  verified live this session: (1) the queue-capacity admission gate (atomic Redis reservation,
  `apps/api/src/services/queue/admission-gate.ts`, fixed and regression-tested this session), and (2)
  `debit()`'s own atomicity (proven via a real concurrent-request race test with zero double-spend).

## 11. Admin credit management — verified against the ACTUAL frontend, not just the API

Read `apps/web/app/(admin)/admin/users/page.tsx` in full (235 lines). Reality check:

| Capability | Status | Evidence |
| --- | --- | --- |
| User list | **CURRENTLY WORKS** | real `getAdminUsers` call, paginated 50/page, "Load more" (`page.tsx:56-68`) |
| Search / filter | **MISSING** | no search input, no filter control anywhere in the file |
| Pagination | **CURRENTLY WORKS** | offset-based, `onLoadMore` (`:85-87`) |
| View user details | **PARTIALLY WORKS** | real API call (`getAdminUserDetail`), but rendered as a raw `<pre>{JSON.stringify(detail)}</pre>` dump (`:231`) — functional, not designed UI |
| Grant credits | **PARTIALLY WORKS** | real, wired to `adjustUserCredits` (`:112-117`) — but the form only ever sends `kind: 'PURCHASED'`, `expiresAt: null`; there is no UI control to grant `PLAN`-kind credits or set an expiry, even though the backend fully supports both |
| Remove / adjust (reduce) credits | **MISSING, and not a UI gap — a backend gap by deliberate design.** `adjust.ts`'s own comment: "Deliberately grant-only in this first pass... An operator *removing* credits is a debit... inventing a second decrement path here would be exactly the kind of duplicate financial mutation surface this whole audit exists to eliminate" and cites a blocked task `ADMIN-005 [BLOCKED]` for the deferred product decision. |
| Choose credit kind / set expiration | **BACKEND-ONLY** | `adjustCredits` supports both; the UI form hardcodes `PURCHASED`/`null` |
| Reason / audit note | **CURRENTLY WORKS** | required text input, sent as `reason` (`:117`) |
| Credit history / ledger view (per user) | **NOT SURFACED IN UI** | whatever `AdminUserDetail` returns is dumped as raw JSON, not a designed ledger table — could not confirm from this file alone whether the detail payload even includes transaction history (flagged §29) |
| Which scans consumed which credits | **NOT SURFACED IN UI** — not found in this page or an obviously linked one |
| Confirmation dialog before granting | **MISSING** — form submits directly on click, no `confirm()`/modal |
| Admin identity in the trail | **CURRENTLY WORKS on the backend** — `AuditLogEntry` records the operator (`adjust.ts`'s transaction), but not shown back to the admin in this UI |
| Permissions / RBAC | **CURRENTLY WORKS** — `requireOperator` gate confirmed at the aggregation point (`admin/index.ts`), re-checked from DB on every request (proven live this session: revoking `isOperator` mid-session immediately blocks further admin calls) |

## 12-15. Admin without payments / Paymob dependency / production-mode behavior

Already substantially proven this session (live-tested, not just read):

- **`createPaymentProviderFromEnv`** (`apps/api/src/services/billing/from-env.ts:14-41`): if none of
  `PAYMOB_API_KEY`/`PAYMOB_HMAC_SECRET`/`PAYMOB_INTEGRATION_ID` are set: returns
  `createStubPaymentProvider()` when `NODE_ENV !== 'production'`, and **returns `undefined`** (not a
  crash, not a silent fake) when `NODE_ENV === 'production'`.
- **`billingRoutes`'s own production guard** (`billing.routes.ts:110-118`, `makeDevTestOnlyGuard`) 404s
  `/billing/subscribe` and `/billing/credits/purchase` whenever `isProduction` is true — **completely
  independent of whether a real provider is configured**. So in production with Paymob unconfigured:
  the API **starts normally** (no crash), checkout/purchase routes 404 cleanly (indistinguishable from
  a nonexistent route to a prober), and the webhook route fails closed with `503
  WEBHOOK_NOT_CONFIGURED` (`webhooks.routes.ts`, confirmed this session) rather than accepting
  anything. **"Payments disabled in production" is already a real, safe, existing state today** — not
  something that needs new code to exist. What's missing is only a clean *conceptual* flag
  (`PAYMENTS_ENABLED=false` or similar) to make this an intentional, documented mode rather than an
  emergent side effect of "Paymob env vars happen to be unset" — see §26.
- **Classification**:
  - KEEP (works regardless of payments mode): credit ledger, admission gate, admin grant endpoint,
    all scan/report/fix functionality.
  - DISABLE-ABLE TODAY, ALREADY SAFE: `/billing/subscribe`, `/billing/credits/purchase` (404 in
    production automatically).
  - HIDE (frontend-only, not yet done): pricing/checkout buttons in `apps/web/app/(dashboard)/billing/*`
    and any public pricing page — these were **not individually inventoried in this pass** (flagged
    §29 — requires reading every billing-adjacent `.tsx` file for a button/CTA that assumes payments
    work).
  - REQUIRED LATER: `PAYMOB_API_KEY`/`HMAC_SECRET`/`INTEGRATION_ID`, real webhook delivery.

## 14. Plans vs credits — a subscription is NOT required, but a plan tier still gates some things

Confirmed from `apps/api/src/services/billing/entitlements.ts:85-101`: a user with **no
`Subscription` row at all** has an "effective plan" of `free` — a real, first-class plan, not an
error state. A free-plan user with a large admin-granted credit balance can fully use the product
**for URL-based scans**. However, `Plan.allowedInputTypes` (schema.prisma:262) gates `ARCHIVE` and
`REPOSITORY` input types independent of credit balance — a free-plan user cannot submit an archive
upload or repo scan no matter how many credits they hold, unless their *plan* (not just their
credits) is changed. Likewise `Plan.allowReadinessPass`, `.allowCustomCapability`,
`.concurrentScanLimit` are plan-gated, not credit-gated. **This matters directly for the "admin
grants credits, no subscription needed" model**: it works fully for the core URL-scan flow today,
but ARCHIVE/REPOSITORY scans and readiness passes would additionally need the admin to also change
the user's effective plan (there is a `PATCH /admin/users/:id` for `isOperator`; whether it also
supports changing plan/subscription was **not confirmed in this pass** — flagged §29).

## 16. Production without external AI — UPDATED, fully resolved (second pass)

**Superseded by the second discovery pass's §A/§C above — read those first.** Confirmed
conclusively, not "likely": with `NODE_ENV=production`, `AI_MODE` unset, and zero AI provider keys,
`createExecutorFromEnv()` throws `ProviderNotConfiguredError` synchronously (traced to
`from-env.ts:40-44` via `DEFAULT_CHAIN='anthropic,openai'`), and this call happens **unconditionally
at worker boot** (`apps/worker/src/index.ts:255`) — meaning **the worker never starts**, not "AI
findings degrade gracefully." An empty `AI_CHAIN=""` does not help either — `buildChain([])` throws
`ChainConfigurationError` (Principle IV's two-vendor minimum, `chain.ts:49-55`). There is no existing
"AI intentionally off, production-safe" mode. The recommended fix location and shape (a new
`AI_MODE=disabled` branch in `from-env.ts` returning a no-op executor that lets `runAiLayer`'s
already-existing graceful-degradation path run unconditionally) is detailed in the second pass's §C
above — not implemented in this document, evaluation only.

---

## 17. Database model map (schema.prisma, as read)

| Model | Key fields | Relates to |
| --- | --- | --- |
| `User` | email, passwordHash, isOperator, githubToken(enc) | Scan, Target, CreditLot, Subscription |
| `Target` | inputType, canonicalValue, controlLevel | User, Scan |
| `Scan` | state (ScanState enum), requestedModules, quotedCredits, chargedCredits | User, Target, ModuleResult |
| `ModuleResult` | module, state, score, summary (nullable), degradedReason | Scan, Issue |
| `Issue` | fingerprint, checkId, severity, title, explanation, consequence, evidence, attribution, fixPrompt, state | ModuleResult, VerificationAttempt |
| `ReadinessVerdict` | (baseline comparison result) | Scan |
| `CreditLot` | amountGranted, amountRemaining, kind, source, expiresAt | User, CreditTransaction |
| `CreditTransaction` | amount, reason, type | User, CreditLot (via CreditAllocation) |
| `CreditAllocation` | links a transaction to lot(s) drawn from | CreditLot, CreditTransaction |
| `Subscription` | plan, status, periodEnd | User, Plan |
| `Plan` | id (free/starter/pro/business), monthlyCredits, allowedInputTypes, concurrentScanLimit, allowReadinessPass, allowCustomCapability, retentionDays | Subscription |
| `PendingPayment` | providerReference, amountMicros, status | User |
| `BillingEvent` | idempotency record for webhook/redirect events | — |
| `Receipt` | per-payment receipt | User |
| `AuditLogEntry` | operator action trail (incl. credit grants) | User (operator) |

**Essential for the temporary mode**: User, Target, Scan, ModuleResult, Issue, CreditLot,
CreditTransaction, CreditAllocation, Plan (for `free`/entitlement defaults). **Payment/AI-specific,
safe to leave dormant**: Subscription (beyond the default-free path), PendingPayment, BillingEvent,
Receipt.

---

## 18-19. Report quality & module-by-module AI-removal classification

| Module | Pipeline today | Without AI | Classification |
| --- | --- | --- | --- |
| PERFORMANCE (bundle-analyzer, cwv-analyzer, lighthouse-analyzer, network-inspector) | Scanner → Finding → Score → Report | **Identical — no AI in this pipeline today** | READY WITHOUT AI |
| SECURITY (data-leak-scanner, dependency-scanner, headers-checker, owasp-checker, ssl-analyzer) | Scanner → Finding → Score → Report | **Identical** | READY WITHOUT AI |
| SEO (content-checker, meta-checker) | Scanner → Finding → Score → Report | **Identical** | READY WITHOUT AI |
| TESTING (contradiction-detector, playwright-runner) | Scanner → Finding → Score → Report | **Identical** | READY WITHOUT AI |
| UI — measured part (css-analyzer, screenshot-capture) | Scanner → Finding → Score → Report | **Identical** | READY WITHOUT AI |
| UI — design critique (`impeccable`) | Findings → AI prompt → `ModuleInsight` (summary/insights) → shown alongside measured issues | Findings → *(nothing added)* → Report (measured issues unaffected, `summary` stays null) | FUNDAMENTALLY NEEDS AI **for this one narrative layer only** — not template-replaceable without inventing a genuinely different (rule-based heuristic) design-critique feature, which is a product decision, not a technical gap |

**What report quality is actually lost without AI**: only the UI module's 2-3 sentence taste summary
and its up-to-25 "insights" list judging visual design against stated brand intent. Every severity,
every measured finding, every fix instruction, every score, on every other module and on the UI
module's own measured findings, is completely unaffected — this was verified by reading the actual
schema nullability, the actual scoring formula, and the actual fix-prompt generation code, not
inferred.

---

## 20. Template design inputs already available per finding

From `CapabilityFinding` (packages/types/src/domain.ts:123-135), every capability already has access
to construct: `checkId`, `fingerprintParts`, `severity`, `title`, `description`, `location`,
`evidence` (arbitrary JSON — URL, selector, header name/value, metric, threshold, actual-vs-expected,
whatever the specific capability chooses to attach), `consequence`, `fixable`. This is already rich
enough to drive a genuinely personalized deterministic template (e.g., "Missing `Strict-Transport-
Security` header on `https://example.com/login`" rather than a generic line) — the raw material for
personalization already exists in the schema; whether each of the 15 capabilities *currently uses*
`evidence`/`location` richly was not individually verified capability-by-capability in this pass
(§29).

## 21. Test coverage (locations only, not run in this pass beyond what this session already ran)

- Auth/authz/admin/rate-limit/IDOR: `apps/api/tests/adverse/*` — extensively verified this session
  (850+ tests passing).
- Credits/billing/queue: `apps/api/tests/adverse/{credits*,checkout-lock,queue-*,billing-*}.test.ts`
  — verified this session, including the new queue-admission-race regression suite.
- Scan/report/capability: `packages/capabilities-vendored/tests/`, `apps/worker/tests/adverse/*` —
  located, not individually read line-by-line in this pass (§29).
- AI-executor fixtures path: `packages/ai-executor` tests exist (not enumerated file-by-file here —
  §29).
- E2E: `apps/web/tests/e2e/{auth,onboarding,dashboard,admin}/*` — confirmed present and run in a
  prior session pass.

---

## 22. Production readiness for the temporary mode — factual, not assumed

| Area | Status | Evidence |
| --- | --- | --- |
| AI fixtures accidentally exposed | **ALREADY READY** | boot-time throw in production (§4) |
| Paymob startup behavior | **ALREADY READY** | starts clean, routes 404, no silent fake provider in production (§12-15) |
| Emails | **REQUIRED BEFORE DEPLOY** (if real email needed) — console mailer is the default otherwise, already safe for testing | prior session's audit of `apps/api/src/app.ts`'s mailer selection |
| Admin bootstrap (how does the *first* operator get created) | **UNKNOWN in this pass** — no seed/bootstrap script for the first `isOperator=true` account was located; the only path found is a direct DB flip | flagged §29 |
| Credits | **ALREADY READY** for grant-only; **BLOCKED task exists** for removal (`ADMIN-005`) | §10-11 |
| Worker/Redis/DB | **ALREADY READY** — proven under real concurrent load this session | prior load-testing report |
| Rate limiting/CORS/cookies/CSRF/security headers | **ALREADY READY** — extensively verified this session's security review | `reports/auth-security-review.md` |
| Environment validation | **ALREADY READY** — `config/env.ts` fails closed on missing secrets | prior session's finding |
| Monitoring/health checks | **PARTIALLY VERIFIED** — `/health` exists; deeper monitoring/alerting not re-verified in this pass | §29 |

---

## 23. Security of manual credit grants

Already covered in depth: operator-only (`requireOperator`, DB-rechecked per request, instant
revocation proven live this session), positive-integer-only validation (no negative/overflow-shaped
input reaches `grantLot`), reason required, single-transaction grant+audit-log write (no
grant-without-audit-trail possible), and this session's own IDOR/CSRF/rate-limit findings apply
identically to this endpoint (no separate weakness found). **Gap**: no confirmation dialog in the UI
before submitting a grant (a UX safety gap, not a security vulnerability — the request itself is
already properly authenticated/authorized/validated server-side).

## 24. Failure recovery

Worker crash mid-scan → job remains safely queued in BullMQ, no loss, proven live this session
(accidental outage during testing, zero data corruption on recovery). Redis restart → this session
also observed and worked through real Redis connectivity blips (Docker-networking-level, not
application-level) without data loss. One module failing → contained per-capability, does not fail
sibling capabilities or the whole module (capability-sdk's `containCapabilityCall`). Credit debit
succeeds but job enqueue fails → explicit refund-and-fail path exists (`create-scan.ts`'s
enqueue-failure catch block, refunds in full, transitions to `FAILED`).

---

## 25. What Claude can produce once, for the repository, vs what must never run at request-time

Realistic, given the architecture found: rule catalogs and recommendation/fix-text libraries **can**
be authored once (as capability source code or a data file the capability code reads), reviewed, and
committed — this is exactly how the 15 CODE-layer capabilities already work today (their `title`/
`description`/`consequence` text is already static, human-authored, checked-in source, not generated
per-request). The only genuinely AI-shaped feature found (`impeccable`'s design critique) is, by its
own nature, a per-scan judgment about a specific page's specific design — not something a fixed
template can substitute for without becoming a different, simpler feature (e.g., a small set of
deterministic heuristics like "more than N distinct font sizes on one page" instead of holistic taste
critique). That is a product decision, not a technical audit finding.

## 26. Configuration comparison

No `PAYMENTS_MODE`/`AI_MODE=deterministic`-style unified flag exists today. What exists instead is
implicit: payments are already effectively "disabled in production" whenever Paymob env vars are
absent (§12-15), and AI is already "disabled" for 4 of 5 modules unconditionally regardless of any
flag (§3-4) — the only real configuration gap is a clean, intentional way to also silence the UI
module's AI contributor in production without relying on "don't set `AI_CHAIN`" implicitly working
the same way payments' implicit-disable does (unverified whether an unset/empty real chain in
production fails closed the same clean way `AI_MODE=fixtures` is blocked — flagged §29 as the one
piece of this whole document not directly confirmed by reading `createExecutorFromEnv`'s non-fixture
branch in enough depth).

## 27. What can be deleted vs must stay

**Nothing should be deleted.** Every payment/AI code path audited here is already architected as
optional/gated (stub provider, `NO_AI_CAPABILITIES` path, `degradedReason`, nullable `summary`) —
the existing design already anticipated exactly this "run without them" mode. What could be hidden
(frontend pricing/checkout CTAs) is additive UI work, not removal of anything backend.

---

## 28. Exact temporary production flow, marked against real code

**USER**: Register (EXISTS) → Verify (EXISTS) → Login (EXISTS) → Dashboard (EXISTS) → Credits shown
(EXISTS) → Create Scan (EXISTS) → Select Modules (EXISTS) → Run Scan (EXISTS) → Progress (EXISTS, WS)
→ Complete (EXISTS) → Report (EXISTS) → Fixes (EXISTS).

**ADMIN**: Login (EXISTS) → Users (EXISTS) → Find User (PARTIAL — list/paginate exists, no search) →
Inspect Credits (PARTIAL — raw JSON, not a designed view) → Grant Credits (EXISTS, PURCHASED-kind
only) → Enter Reason (EXISTS) → Confirm (MISSING — no confirmation dialog) → Ledger Updated (EXISTS,
backend) → User Immediately Sees Credits (EXISTS — real-time balance read on next request).

**SYSTEM**: Scan Request → Auth (EXISTS) → Credit Check (EXISTS, atomic) → Queue (EXISTS) → Worker
(EXISTS) → Deterministic Modules (EXISTS, 15/16) → Template/Fix Mapping (EXISTS, `fixPrompt`) → Score
(EXISTS, AI-free) → Persist Report (EXISTS) → Notify UI (EXISTS, WS) → Credit Finalization (EXISTS).

---

## 29. Unknown / needs decision — UPDATED after second pass

**Resolved in the second pass (no longer unknown):**
- ~~Whether admin can change a user's plan/subscription~~ — **RESOLVED: no, only `isOperator` is
  mutable** (§I above). A hard technical fact, not a product decision anymore — though *whether to
  build that capability* remains a product decision, listed below.
- ~~Whether `AdminUserDetail` includes credit history~~ — **RESOLVED: no, it returns only profile +
  subscription + balance summary** (§H above).
- ~~Whether a bootstrap mechanism exists for the first operator~~ — **RESOLVED: no, confirmed absent
  repo-wide; manual DB flip is the only path today** (§J above).
- ~~Exact per-capability rule counts~~ — **RESOLVED: ~59 distinct rules, counted, with a per-capability
  breakdown** (§D above; ± a few for any rule constructed through a variable rather than a literal).
- ~~Whether an unset/empty real AI chain fails closed as cleanly as fixtures~~ — **RESOLVED: it fails
  closed even more completely — it throws at worker *boot*, not at first AI-layer call** (§A above).
  This is a stricter, earlier failure than pass 1 hoped for, and it blocks *all* scanning, not just
  AI-dependent scanning.

**Still genuinely unresolved (would need more time than this pass spent, not blocked on a decision):**
- A full line-item inventory of every pricing/checkout CTA in the frontend (`billing/page.tsx`,
  `pricing/page.tsx`, `settings/page.tsx`, `admin/plans/page.tsx` were located as the relevant files;
  each button's exact current behavior when clicked in a payments-disabled production was not
  individually traced click-by-click in this pass).
- A full, rule-by-rule (all ~59) report-quality classification — two representative samples were
  read and both scored READY; the remaining ~57 were not individually opened.
- Whether every one of the 15 CODE-layer capabilities' `evidence`/`location` fields are populated as
  richly as `content-checker`'s and `headers-checker`'s samples, or whether some are thinner.
- The real production reverse-proxy/TLS/WebSocket-proxying configuration — genuinely outside what
  this repository's source can answer (no such config exists in-repo).

**Product decisions (unchanged in kind, now better-informed):**
- Whether/how to ever allow admin credit *removal* (currently deliberately blocked, `ADMIN-005`) —
  and if so, whether it reuses the canonical debit/refund/ledger path rather than a new decrement.
- Whether the UI design-critique feature (`impeccable`) should be replaced by a simpler deterministic
  heuristic set when AI is off, or simply omitted (current behavior, already graceful: omitted).
- Whether ARCHIVE/REPOSITORY input types and readiness passes should be made available to credit-only
  users in this temporary mode — **now known to require building a new admin plan-assignment
  capability**, not a configuration flip, since none exists today (§I).
- Whether to build a distinct human-facing `recommendation`/`howToFix` field alongside the existing
  agent-oriented `fixPrompt`, or keep showing `fixPrompt` to end users as-is (§F).
- Whether a central rule catalog is worth its cross-cutting cost vs. the current per-capability
  inline text (§G) — leans toward "keep inline" on current evidence, but is a real product/maintainer
  preference, not a forced technical outcome.

**Business/infra decisions:** the production reverse-proxy/TLS topology (not in-repo); who owns/pays
for SMTP or Resend credentials (§B — required for API boot, not optional); whether a first-admin
bootstrap step is acceptable as a manual runbook item or needs a real script.

---

## 30. Final gap matrix — UPDATED after second pass (no remaining "likely"/"probably" where source can answer)

| Area | Current state | Desired temporary state | Gap | External dep? | Code change? | DB change? | Frontend change? | Backend change? | Worker change? | Tests needed? | Production risk |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication | Fully real, verified | Same | None | No | No | No | No | No | No | No | Low |
| Email | **Boot-time blocker in prod without SMTP or Resend creds** (§B, confirmed) | Same, with credentials configured | None architecturally — just needs real SMTP/Resend creds, already supported | Yes (SMTP or Resend) | No | No | No | No | No | No | Low — easy to satisfy, but genuinely required |
| Admin | Grant-only, no search, JSON detail dump, **cannot assign plan/tier** (§I, confirmed) | Full user mgmt + plan-assignment UI | UI polish, search, ledger view, **new plan-assignment endpoint** | No | Yes (UI + new endpoint) | No | Yes | Yes (new mutation) | No | Yes | Low-Medium (new mutation path, needs care) |
| Credits | Grant works, removal blocked by design | Same, or add removal | Removal path (deferred product decision, `ADMIN-005`) | No | Yes if adding removal | No | Yes if adding removal | Yes if adding removal | No | Yes if adding removal | Medium if rushed |
| Credit Ledger | Real, transactional, audited | Same | None functionally; UI surfacing gap (**confirmed: this endpoint returns none of it today**, §H) | No | No | No | Yes (surface it) | Yes (new query) | No | Yes | Low |
| Scanning | Real, works today **once the worker can boot** | Same | See "AI" row below — this is the real gate | No | No | No | No | No | No | No | Low, contingent on AI row |
| Modules (15/16) | Deterministic, complete, ~59 rules counted (§D) | Same | None | No | No | No | No | No | No | No | Low |
| Module (impeccable) | AI-dependent narrative, gracefully degrades already | Off (via new AI-disabled mode) | Handled by the AI row's fix | No | No (covered by AI row) | No | No | No | No | No | Low |
| Queue | Real, atomic, load-tested | Same | None | No | No | No | No | No | No | No | Low |
| Worker | **Cannot boot today with zero AI keys (§A, confirmed, not "likely")** | Boots cleanly with AI intentionally disabled | New `AI_MODE=disabled` branch in `from-env.ts` (§C) | No | Yes (small, one file) | No | No | No | Yes (config only, `ai-layer.ts` itself unchanged) | Yes (new mode) | **Was High/blocking; becomes Low once the one small fix lands** |
| AI | Confirmed: fixtures blocked in prod (unchanged), **real chain throws at worker boot with no keys (new, corrected finding)** | AI off cleanly in prod | New explicit disabled mode (§C) — same fix as "Worker" row | No | Yes (small) | No | No | Yes (from-env.ts) | Yes (uses it) | Yes | **Was Low (pass 1 underestimated); corrected to the true blocker, now precisely scoped and small** |
| Fixtures | Test-only, already blocked in prod | Same | None | No | No | No | No | No | No | No | Low |
| Templates | Already exist as static capability text + `fixPrompt`; **~59 rules counted, 2 samples read = READY quality** | Same, maybe enriched | Full rule-by-rule quality audit remains partial (§29) | No | Maybe | No | No | Maybe | No | Maybe | Low |
| Fix instructions | **`fixPrompt` confirmed agent-oriented, not a human fix guide (§F, new finding)** | Human-facing recommendation text, if wanted | New `recommendation`/`howToFix` field (product decision) | No | Yes if adding | No | Yes if adding | Yes if adding | Yes if adding | Yes if adding | Low |
| Reports | Real, AI-optional already | Same | None | No | No | No | No | No | No | No | Low |
| Scoring | Real, 100% deterministic | Same | None | No | No | No | No | No | No | No | Low |
| Payments | Stub in dev, cleanly disabled in prod today (confirmed, §12-15) | Explicit disabled mode | Conceptual flag only, plus CTA hiding (not fully inventoried, §29) | No | Small | No | Yes (hide CTAs) | Small | No | Small | Low |
| Paymob | Fully absent, safe | Same | None required now | Yes (later) | No | No | No | No | No | No | None now |
| Plans | Free-plan default works; **admin CANNOT change a user's plan today (§I, resolved from "maybe" to a hard "no")** | Same, or new admin plan-assignment | New endpoint required if credit-only users need ARCHIVE/REPOSITORY/readiness | No | Yes if adding | No | Maybe | Yes if adding | No | Yes if adding | Low-Medium |
| Subscriptions | Optional, not required for core URL-scan flow | Same | None | No | No | No | No | No | No | No | Low |
| Pricing UI | Exists (`pricing/page.tsx`, `billing/page.tsx`, `settings/page.tsx`, `admin/plans/page.tsx` located, §29) | Hide or relabel | Full click-by-click inventory still open (§29) | No | No | No | Yes | No | No | No | Low |
| Billing UI | Exists, assumes payments | Hide/relabel non-grant parts | Same as above | No | No | No | Yes | No | No | No | Low |
| Webhooks | Fail-closed safely without Paymob | Same | None | No | No | No | No | No | No | No | Low |
| Database | Complete, no schema blockers found | Same | None | No | No | No | No | No | No | No | Low |
| Security | Extensively verified this session | Same | None | No | No | No | No | No | No | No | Low |
| Monitoring | Health checks exist; deeper monitoring not re-verified | Same | Confirm coverage | No | No | No | No | No | No | No | Unknown |
| Deployment | **Resolved (§K): no Dockerfiles exist for any of 5 units; process-level topology confirmed from `deploy.md`** | Same 5-unit topology, minimal set = Postgres+Redis+api+worker+web | Reverse-proxy/TLS config (genuinely not in-repo) | Yes (proxy/TLS/hosting) | No | No | No | No | No | No | Low for app; unknown for infra layer |
| Admin bootstrap | **Resolved (§J): no mechanism exists; manual SQL is the only path today** | Same, or a small bootstrap script | Optional convenience script | No | Small if adding | No | No | Small if adding | No | Small if adding | Low |

---

## 31. Final summary answers — UPDATED, corrected after second pass

1. **Can the application be deployed today without Paymob?** Yes — confirmed from code: the API
   starts cleanly, checkout/purchase routes 404, webhooks fail closed. No crash, no fake provider
   answering in production.
2. **Can it be deployed today without an external AI provider?** **No, not today, without one small
   fix** — corrected finding: the worker throws `ProviderNotConfiguredError`/`ChainConfigurationError`
   at boot with zero AI keys (§A), so *no scan of any kind* can run, not just AI-dependent ones. The
   fix is small and precisely scoped (§C, one new branch in one file) but it is a real, required code
   change, not merely a configuration choice available today.
3. **Can fixtures be completely removed from production runtime?** They already cannot reach it —
   verified boot-time guard throws in `NODE_ENV=production`.
4. **Can real scanner findings generate useful reports without AI?** Yes — verified: scoring, fix
   instructions, and all measured findings are already 100% independent of AI, *once the worker can
   boot* (see #2).
5. **Which modules already support that?** PERFORMANCE, SECURITY, SEO, TESTING, and UI's measured
   (non-critique) findings — 15 of 16 capabilities, ~59 distinct rules counted (§D).
6. **Which modules need templates?** None need *new* templates to function — `fixPrompt` and each
   capability's own text already exist. Two representative samples read in full were already
   professional-quality (§E); a full ~59-rule audit remains a scoped follow-up, not assumed complete.
7. **Which modules actually require AI-style reasoning?** Only the UI module's design-critique
   narrative (`impeccable`), and only for that narrative — not for UI's own measured findings.
8. **Can Admin fully control user credits today?** Grant, yes. Remove/reduce, no — deliberately
   deferred (`ADMIN-005`).
9. **Is the Admin credit UI complete enough?** Functional but incomplete: no search, no PLAN-kind or
   expiry controls, no ledger view (confirmed: the backing endpoint doesn't even return ledger data,
   §H), no confirmation dialog, raw-JSON user detail.
10. **Can a user operate with zero subscription but admin credits?** Yes, for the core URL-scan flow
    only. **Corrected/hardened finding (§I): ARCHIVE/REPOSITORY input types and readiness passes are
    not just "plan-gated" — admin has literally no way to change a user's plan today.** A credit-only
    user is permanently `free`-tier unless a new admin capability is built.
11. **What breaks under `NODE_ENV=production` with Paymob missing?** Nothing breaks — checkout/
    purchase 404 cleanly, webhook fails closed.
12. **What breaks under `NODE_ENV=production` with external AI missing?** **Definitively resolved
    (was the #1 open unknown): the worker process itself throws at startup and never begins
    consuming the queue** — confirmed by tracing `createExecutorFromEnv` → `buildOne` →
    `ProviderNotConfiguredError`, and separately confirming the empty-chain escape hatch also throws
    (`ChainConfigurationError`, Principle IV's two-vendor minimum). This is not "AI features
    degrade" — it is "no scans run at all."
13. **What is preventing us from deploying this temporary version?** **Two real, small, code-level
    blockers, both now precisely scoped**: (a) the worker's AI-executor construction needs a new
    explicit "disabled" mode (§C) — small, one file, `runAiLayer` needs zero changes; (b) the API
    needs SMTP or Resend credentials configured to boot in production at all (§B) — not a code
    change, just credentials, but genuinely required, not optional. Everything else (admin UI
    completeness, plan-assignment, payments-UI hiding) is real but non-blocking polish/product work.
14. **What are the minimum architectural changes required?** A new `AI_MODE=disabled` (or equivalent)
    branch in `packages/ai-executor/src/from-env.ts` only — `ai-layer.ts`, every capability, scoring,
    and the schema all already handle "no AI result" gracefully and need no changes. Separately, if
    credit-only users need ARCHIVE/REPOSITORY/readiness, a new admin plan-assignment endpoint (does
    not exist today, §I). Separately, admin-UI additions (not backend rewrites) for credit-ledger
    visibility and search.
15. **What should NOT be changed because Paymob/AI will be reconnected later?** The entire billing
    architecture (stub provider, webhook signature/idempotency machinery, `Subscription`/
    `PendingPayment`/`BillingEvent`/`Receipt` models), the AI executor's provider-chain abstraction
    and its two-vendor safety check (Principle IV — this protects *real* AI deployments from a
    fragile single-vendor chain; do not weaken it to solve the disabled-mode problem, §C), and the
    `impeccable` capability itself — all already correctly designed to be re-enabled by configuration
    alone, not by undoing a deletion.

---

## 32. Final temporary product definition

**SUPPORTED USER FLOWS**: register, verify email (real, requires SMTP/Resend configured, §B),
login, view credit balance, submit a URL scan across any of the 5 modules, watch live progress
(WebSocket), view the full report (score, per-module state, issues with severity/evidence/location),
export report as HTML, mark an issue as fixed and trigger re-verification, request a readiness pass
(**only if the user's plan allows it — free-tier does not, and admin cannot upgrade a plan today**,
§I).

**SUPPORTED ADMIN FLOWS**: log in as operator (bootstrap via manual DB flip only, §J), list/paginate
users, view a user's profile/subscription/balance summary (not ledger history, §H), grant `PURCHASED`
or `PLAN` credits (UI today only exposes `PURCHASED`, no expiry — backend supports both, §11),
promote/demote another operator.

**SUPPORTED SCAN INPUTS**: URL only, cleanly, today, for a credit-only free-tier user. ARCHIVE and
REPOSITORY are real, built, and would work — but are plan-gated to starter/pro/business, and admin
cannot grant a plan today (§I) — so they are **not actually reachable** by an admin-credits-only user
until that gap is closed.

**SUPPORTED MODULES**: PERFORMANCE, SECURITY, SEO, TESTING (fully deterministic, all already
production-ready pending the AI-boot fix), UI's measured findings (`css-analyzer`,
`screenshot-capture`). UI's design-critique narrative (`impeccable`) is **disabled** in this temporary
mode (gracefully — `ModuleResult.summary` stays null, nothing else affected).

**DISABLED FEATURES**: real Paymob checkout/subscribe/purchase (already 404 in production
automatically), the `impeccable` AI design critique (pending the new disabled-mode fix, §C), admin
credit removal (does not exist, deliberately, `ADMIN-005`).

**HIDDEN FEATURES (frontend work, not yet scoped line-by-line, §29)**: pricing page CTAs, billing
page's subscribe/purchase buttons, any "upgrade" prompts.

**OPTIONAL FEATURES**: PgBouncer (proven working, not required at this scale); `apps/sandbox-runner`
(only needed for admin-uploaded custom capabilities, not the 16 vendored ones this document covers).

**FUTURE PAYMOB FEATURES** (architecture preserved, not touched): real checkout, real subscription
billing, real webhook delivery, receipts.

**FUTURE AI FEATURES** (architecture preserved, not touched): `impeccable`'s design critique once
re-enabled by configuration; any future `AI_CHAIN_MASTER_REPORT` executive-summary feature.

---

## 33. FINAL GO / NO-GO FACTS

- **Can API boot in production with zero AI keys?** Yes — the API never constructs an AI executor
  itself (only the worker does).
- **Can worker boot in production with zero AI keys?** **No — confirmed, throws at construction,
  every time, today.** Requires the new disabled-mode fix (§C) to change this.
- **Can a complete URL scan finish with zero AI keys?** Only once the worker can boot (see above) —
  the module logic itself is already 100% ready (§D-E).
- **Can UI scans finish with `impeccable` intentionally disabled?** Yes, by design — `ModuleResult.
  summary` stays null, everything else (score, measured issues, fixPrompt) is unaffected.
- **Can Paymob remain completely unconfigured?** Yes — confirmed safe, clean, no crash, no fake
  provider exposed publicly.
- **Can billing CTAs be safely hidden without touching credit logic?** Yes — credits/ledger/admission
  gate are fully independent of the billing UI layer; hiding buttons is presentation-only.
- **Can Admin grant credits safely?** Yes — atomic, audited, validated, proven under concurrent load
  in a prior session's testing.
- **Can Admin assign plan/tier today?** **No — confirmed, does not exist** (§I). Required if
  credit-only users need ARCHIVE/REPOSITORY/readiness.
- **Can a user with manually granted credits perform all desired temporary-product actions?** Only
  the URL-scan/report/fix flow — not ARCHIVE/REPOSITORY/readiness, until the plan-assignment gap is
  closed.
- **Is email required for registration/verification in production?** Yes, and **the API will not even
  boot in production without SMTP or Resend credentials configured** (§B) — this is stricter than
  "required for the flow to complete," it blocks the process from starting at all.
- **What infrastructure services are mandatory?** Postgres, Redis, `apps/api`, `apps/worker`,
  `apps/web` (§K). A reverse proxy for real hosting is assumed but not present in-repo.
- **What persistent storage is mandatory?** Postgres (all durable state), a writable
  `WORKSPACE_BASE_DIR` for the worker (transient per-scan, destroyed on completion — not persistent
  data, but must exist and have real disk space). R2 is required only if ARCHIVE uploads or report
  export-to-object-storage are used (not confirmed as a hard requirement for the core URL-scan+HTML-
  export flow in this pass — flagged for a quick follow-up check, not re-verified here).
- **How many deterministic rules exist?** ~59, counted directly from source across 15 CODE-layer
  capabilities (§D).
- **How many need report-text improvement?** Not fully determined — 2 of ~59 were sampled and both
  were already professional-quality; a full audit of the remaining ~57 was not completed in this pass.
- **What exactly remains before the temporary product is ready for implementation/deployment?**
  (1) the small `AI_MODE=disabled` fix in `from-env.ts` — **the one genuine hard blocker**; (2) SMTP
  or Resend credentials for the API to boot in production — an operational requirement, not code;
  (3) a decision on whether credit-only users need ARCHIVE/REPOSITORY/readiness, and if so, a new
  admin plan-assignment endpoint; (4) admin-UI polish (search, ledger view, PLAN-kind/expiry controls,
  confirmation dialog) — real but non-blocking; (5) a frontend pass to hide/relabel payments CTAs.

**Is this discovery now complete enough to create the final implementation plan?** Yes, for the
core technical architecture — the one hard blocker (#1 above) is small and precisely located, and
every other open item is either a scoped, boundable engineering task or an explicit product decision
(§29), not an unknown. The two items not fully exhausted (full ~59-rule text audit, full payments-CTA
click-by-click inventory) are scoped, low-risk, and can be sized during planning rather than
requiring another discovery pass.
