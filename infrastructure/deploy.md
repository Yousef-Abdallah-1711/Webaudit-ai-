# Deployment runbook — all five units

T234 (Phase 11, Session 9, 2026-09-04). This is the first document to cover deployment for every
`apps/*` unit in one place. `infrastructure/sandbox-runner.md` (T225) already covers `apps/sandbox-runner`
in depth — this file's own sandbox-runner section is a short pointer to it, not a duplicate, so the two
never drift apart on the same facts. There is no other per-app deployment doc or Dockerfile anywhere in
this repo to follow as precedent; this establishes the pattern the other four sections use.

**Five deployable units, not three** — `research.md`'s R16, corrected into `WebAuditAI_ARCHITECTURE.md`
at T233: `apps/api`, `apps/worker`, `apps/web`, `apps/probe-pool`, `apps/sandbox-runner`. `probe-pool`
and `sandbox-runner` are each their own deployment specifically because, per CLAUDE.md, "a security
boundary is only real if it is a deployment" — collapsing either into `api` would make its isolation
claim false regardless of how careful the code inside it is.

Every unit needs Node ≥22 — the sandbox depends on the `--permission` model (research.md R1), and this
repo's root `package.json` already states `engines.node >= 22` for the whole workspace, not just
`sandbox-runner`. None of these five units has a Dockerfile in this repo today; every section below
documents the real, currently-runnable process-level command (`pnpm --filter <pkg> start`), which is
what this environment can actually verify, not an unverified container spec.

---

## `apps/api` — Express, holds database and provider credentials

**What it is.** The one HTTP API surface a client (web, or a future third-party integration) talks to.
Holds the platform's database connection, encryption key, JWT signing secrets, AI provider keys, and R2
credentials — the most privileged of the five units, and the only one that should ever see any of them.

**Required environment** (see `.env.example` for the authoritative list; `apps/api/src/config/env.ts`
fails closed — refuses to boot — if `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET`/`ENCRYPTION_KEY` are unset
and `NODE_ENV=production`, per Finding C3's fix):
`DATABASE_URL`, `REDIS_URL`, `DATABASE_CONNECTION_LIMIT`/`DATABASE_POOL_TIMEOUT` (sized per-process —
see `.env.example`'s own arithmetic if running more than 2 replicas), `ENCRYPTION_KEY`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ANTHROPIC_API_KEY`/`OPENAI_API_KEY`/`GOOGLE_API_KEY` +
their `_MODEL`/`_USD_PER_MTOK` pairs (Principle IV: at least two vendors configured with a real price,
or the executor refuses to start — `AI_MODE=fixtures` bypasses this for non-production use only),
`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET`, `RESEND_API_KEY`/`EMAIL_FROM`,
`GOOGLE_OAUTH_CLIENT_ID`/`_SECRET`, `GITHUB_OAUTH_CLIENT_ID`/`_SECRET`, `SANDBOX_RUNNER_URL` (T226 —
required at request time only, for capability upload; the rest of the API boots fine without it, per
`apps/api/src/config/sandbox.ts`'s own lazy-read design).

**Network**: inbound HTTP from `apps/web` (and any other client) on its own port (`API_URL`, default
`3001`); outbound to PostgreSQL, Redis, the three AI providers, R2, Resend, and — per FR-025 — the
audit target and nothing else from *platform* code (FR-025a: the auditing browser's own, separate
egress policy belongs to `apps/probe-pool`, not here).

**Runbook**:
```sh
pnpm install --frozen-lockfile
pnpm db:migrate            # or db:deploy in a real environment — see root package.json
pnpm --filter @webaudit/api start     # node --import tsx src/index.ts
```
No `build` step: this monorepo runs TypeScript directly via `tsx` in every service (`apps/api`,
`apps/worker`, `apps/sandbox-runner` all follow the identical `dev`/`start` script shape — only
`apps/web`, a Next.js app, has a real `build` step). Health/liveness: `GET /` or any unauthenticated
route is enough to confirm the process is up; there is no dedicated `/health` route on this unit today
(unlike `sandbox-runner`'s new one, T225) — worth adding if a real orchestrator needs one, not yet done.

---

## `apps/worker` — BullMQ consumer, same database, no public port

**What it is.** Runs the scan orchestrator: dequeues phase jobs, executes capabilities, writes results,
manages scan workspaces. Depends on `@webaudit/api`'s generated Prisma client as a real workspace
dependency (Open Decision #10 — a made-not-settled call, sharing the ORM artifact rather than
duplicating it).

**Required environment**: the same `DATABASE_URL`/`REDIS_URL`/AI-provider/`ENCRYPTION_KEY` set as
`apps/api` (it writes to the same database and calls the same providers), plus `WORKSPACE_BASE_DIR`
(required — `installTerminalTeardown` at boot guards on this being set, since a scan's on-disk source
must have somewhere real to live and be destroyed from) and the limit vars (`SCAN_TIMEOUT_MS`,
`QUESTIONNAIRE_TIMEOUT_MS`, `MAX_ARCHIVE_BYTES`/`MAX_ARCHIVE_RATIO`).

**Network**: **no inbound port at all** — it is a pure queue consumer, reached only via Redis, never
addressed directly by another service. Outbound: PostgreSQL, Redis, the three AI providers, R2 (report
export), `apps/sandbox-runner` (once T226's real dispatch is in a scan path — currently only the admin
upload route calls it, not a running scan), and the audit target itself (FR-025).

**Disk**: needs a real, writable `WORKSPACE_BASE_DIR` with enough space for the largest permitted
archive upload (`MAX_ARCHIVE_LIMITS.maxUncompressedBytes`, 512 MB per `packages/config/src/constants.ts`)
times however many concurrent scans this deployment runs — workspaces are destroyed on every exit path
(SC-015), but only after the scan finishes, so peak usage is real, not transient.

**Runbook**:
```sh
pnpm install --frozen-lockfile
pnpm --filter @webaudit/worker start     # node --import tsx src/index.ts
```

---

## `apps/web` — Next.js, the only unit with a real build step

**What it is.** The customer-facing and operator-facing UI. Holds no database or provider credentials
of its own — every real read/write goes through `apps/api`'s HTTP surface, matching
`apps/web/src/middleware.ts`'s (`auth.middleware.ts`'s frontend-side counterpart) own documented design:
"Frontend route guards are usability, never security."

**Required environment**: `API_URL` (so the client knows where to call), whatever public, non-secret
config Next.js needs at build time (check `apps/web/next.config.ts` for any `NEXT_PUBLIC_*` vars this
deployment's build must supply — none are required beyond `API_URL` as of this writing).

**Network**: inbound HTTP from real users' browsers on its own port (`WEB_URL`, default `3000`);
outbound only to `apps/api` from the server side (SSR/route handlers) — the browser itself talks
directly to `apps/api` for client-side fetches, and to nothing else: T127/T247 self-host fonts and vendor
icons specifically so the browser makes zero third-party CDN requests (verified for real, T229).

**Runbook** — the one unit that needs an actual build step:
```sh
pnpm install --frozen-lockfile
pnpm --filter @webaudit/web build   # next build
pnpm --filter @webaudit/web start   # next start --port 3000
```
`apps/web/tests/visual/harness.ts`'s `startServer` helper runs exactly this `next build` + `next start`
sequence already, as a real OS child process (not Next's programmatic server API, which crashes on
Windows with a native libuv assertion — confirmed while building that harness) — the same two commands
above, just automated for testing rather than typed by hand.

---

## `apps/probe-pool` — browser automation and load generation, isolated from platform credentials

**Honestly: not yet a deployable unit.** `apps/probe-pool/src/` contains real library code
(`browser/pool.ts`) but **no server entrypoint and no `start` script** — its `package.json`'s only
script is a placeholder (`"dev": "echo 'not implemented — scaffold only (port 3002)'"`). This is the
same state `apps/sandbox-runner` was in before Session 7/8 built its real entrypoint (`serve.ts`) — this
document does not invent a runbook for code that does not exist yet, matching this project's own
"report honestly" convention rather than describing unverified steps as if they were real.

**Intended shape**, per `research.md`'s R6/R12 (recorded here so the eventual entrypoint has a target to
build against, not because any of it is running today): a separate deployment specifically so the
auditing browser (FR-025a — may load whatever the target page loads, unlike platform code's FR-025
allowlist) runs isolated from `apps/api`'s database and provider credentials. No `DATABASE_URL`, no
provider keys, no `JWT_*`/`ENCRYPTION_KEY` — an escape from a hostile page should yield nothing more
than what this unit already legitimately has, mirroring `sandbox-runner`'s own "an escape must yield
access to nothing worth having" design (`infrastructure/sandbox-runner.md`). Inbound: from `apps/worker`
(`PROBE_POOL_URL`, `.env.example` reserves port `3002`). Outbound: wherever the audited page's own
resources point, still subject to the same SSRF refusal FR-014 requires of platform code (FR-025a's own
text: "remains subject to the same SSRF refusal... so a hostile page cannot use the auditing browser as
a gateway into the platform's own network").

**Action item, not closed here**: building a real `serve.ts`-equivalent entrypoint and a real `start`
script for this unit is genuinely unstarted work, outside T234's own scope (a deployment *runbook*, not
a missing service's implementation) — flagged for a future task rather than silently left unmentioned.

---

## `apps/sandbox-runner` — untrusted capability isolation, no egress, no database credentials

Fully covered by [`infrastructure/sandbox-runner.md`](sandbox-runner.md) (T225) — the exact environment
variables (`SANDBOX_RUNNER_PORT`/`HOST`, and nothing else — that document's own structural adverse suite,
`deployment-isolation.test.ts`, asserts this over time, not just in prose), the network policy (deny-all
outbound, inbound only from `apps/api` on `/execute` and `/health`), the runbook
(`pnpm --filter @webaudit/sandbox-runner start`), and two Windows-specific gaps flagged for confirmation
on the real (expected Linux) deployment target. Not duplicated here — read that document directly.

---

## Phase 5 email rollout checklist

The API selects `createResendMailerFromEnv()` only when `NODE_ENV=production`; development and
tests retain `createConsoleMailer()` unless a mailer is injected. Resend uses the HTTPS
`POST https://api.resend.com/emails` endpoint with `RESEND_API_KEY`, `EMAIL_FROM`, and `WEB_URL`.

Before enabling production traffic:

1. Create a Resend API key in the deployment secret manager. Never place it in `.env.example`, git,
   logs, or a browser-exposed variable.
2. Verify the sender domain in Resend and set `EMAIL_FROM` to an address on that domain.
3. Set `RESEND_API_KEY`, `EMAIL_FROM`, and the public frontend `WEB_URL` in the API environment.
4. Deploy to staging and exercise registration verification, password reset, readiness, renewal, and
   retention warning emails with a controlled inbox.
5. Confirm verification links use `/verify-email` and reset links use `/reset-password` on `WEB_URL`.
6. Confirm a mocked provider failure leaves the error visible to the existing retry/error path; the
   API process must remain alive.
7. Record delivery, bounce, and rejection results from the Resend dashboard in the release evidence.

Do not mark Phase 5 production-ready until all seven checks have dated evidence.

---

## Summary table

| Unit | Public port | Own DB/queue credentials | Own AI provider keys | Build step | Real runbook exists |
| --- | --- | --- | --- | --- | --- |
| `apps/api` | 3001 (inbound) | Yes | Yes | No (`tsx`) | Yes |
| `apps/worker` | none (queue consumer) | Yes | Yes | No (`tsx`) | Yes |
| `apps/web` | 3000 (inbound) | No | No | Yes (`next build`) | Yes |
| `apps/probe-pool` | 3002 (reserved, unused) | No (by design, R6/R12) | No | — | **No — scaffolding only** |
| `apps/sandbox-runner` | 3003 (inbound, from `apps/api` only) | No (by design, R1) | No | No (`tsx`) | Yes — see `sandbox-runner.md` |
