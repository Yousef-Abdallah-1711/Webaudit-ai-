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
`sandbox-runner`. Every section below documents the real, currently-runnable process-level command
(`pnpm --filter <pkg> start`), which is what this environment can actually verify, not an unverified
container spec.

As of Phase 8 (production-without-Paymob-or-AI master plan), `apps/api`, `apps/worker`, and `apps/web`
each have a real, build-and-run-verified Dockerfile (`apps/{api,worker,web}/Dockerfile`), and there is a
real production compose topology (`infrastructure/docker-compose.production.yml`) covering all three
plus Postgres/Redis/an optional PgBouncer/an nginx reverse proxy — see "Docker Compose (production)"
below. `apps/probe-pool` and `apps/sandbox-runner` are still not part of that compose topology,
deliberately (the master plan's own §5 Out of scope for this release) — their sections below remain the
process-level runbook.

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

## Connection pooling (PgBouncer) — T295/T036

`apps/api/src/db/client.ts`'s own connection-limit comment named the intended shape before this was
built ("A pooler (PgBouncer in transaction mode) replaces this arithmetic; set the limit explicitly
then."). That design is now real, not just anticipated:

**What's built and verified** (`infrastructure/docker-compose.yml`'s `pgbouncer` service,
profile-gated so it never starts by accident — `docker compose --profile pooled up -d`):
PgBouncer 1.25, `pool_mode = transaction`, sitting in front of the same `postgres` service, on host
port `6452`. Verified for real, not assumed: a live Prisma client, and separately a full `apps/api`
process booted with `DATABASE_URL` pointed at `postgresql://webaudit:webaudit_dev@localhost:6452/webaudit?connection_limit=1&pgbouncer=true`,
both ran real queries through it successfully (`SELECT`, a real `user.count()`, and a live `GET
/health` returning `200`) before being torn down.

**The one thing this does not decide** — matching T295's own "the design is buildable now;
deploying it needs real infrastructure provisioning" framing — is the real *production* topology:
self-hosted PgBouncer co-located with `apps/api`/`apps/worker` (what the docker-compose service
above stands in for), vs. a managed pooler (RDS Proxy, Neon's/Supabase's built-in pooler, a
cloud-provider equivalent). That choice depends on which managed Postgres this deployment actually
uses, which is not decided in this repository. Whichever is chosen, the application-side contract is
the same: point `DATABASE_URL` at the pooler's host/port instead of Postgres directly, and set
`DATABASE_CONNECTION_LIMIT=1` (transaction-mode pooling means the pooler — not Prisma — is what
multiplexes many app connections onto few real Postgres ones; `client.ts`'s `withPoolSettings`
already honors an explicit `connection_limit` in the URL over its own un-pooled default).

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

## Docker Compose (production)

Phase 8 (production-without-Paymob-or-AI master plan) built and verified — via real `docker build` and
`docker compose up` runs against throwaway Postgres/Redis, not just by authoring the files —
`infrastructure/docker-compose.production.yml`, the three `apps/*` Dockerfiles, and
`infrastructure/nginx/nginx.conf`. This section is the exact command sequence that smoke test used;
follow it for a real deployment, substituting `.env.production` (a real, filled-in copy of
`.env.production.example`, never committed) for the throwaway secrets a smoke test would use.

1. **Build the images** (from the repository root):
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production build
   ```
2. **Bring the stack up**:
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production up -d
   ```
   Startup ordering is enforced by `depends_on` conditions, not by hoping: `postgres`/`redis` must
   report `healthy` before `migrate` runs; `migrate` (`prisma migrate deploy`, one-shot) must exit 0
   before `api`/`worker` are even created; `api` must report `healthy` before `web`; `api` and `web`
   must both report `healthy` before `proxy` starts routing to them.
3. **Confirm migrations actually ran before anything else started** — do not assume this from the
   compose file alone:
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production ps -a
   ```
   `migrate` should show `Exited (0)`; `postgres`, `redis`, `api`, `worker`, `web`, `proxy` should all
   show `healthy` (`pgbouncer` only appears if started with `--profile pooled`).
4. **Spot-check the real routes through the reverse proxy** (matches what the Phase 8 smoke test
   actually ran):
   ```
   curl -i http://<host>/healthz    # nginx itself
   curl -i http://<host>/health     # proxied to apps/api's real health route
   curl -i http://<host>/           # proxied to apps/web
   ```
   The `/realtime` WebSocket upgrade (the live scan-progress feed) is proxied by the same nginx config
   — verify it with a real WebSocket client rather than plain `curl` once TLS is live.
5. **Tear down** (smoke test / non-production only — this removes volumes, i.e. all data):
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production down -v
   ```

TLS is not yet live — the HTTP-only server block in `infrastructure/nginx/nginx.conf` is what actually
runs; a commented-out HTTPS block with identical routing is included, ready to uncomment once a real
certificate is provisioned (ACME/certbot or a managed load balancer's own TLS — a genuine operational
decision this repository's source cannot make for you). `TRUST_PROXY_HOPS=1` in the compose file assumes
exactly this one-nginx-hop topology; changing the number of proxies in front of `apps/api` requires
updating that value to match, or the rate limiter's client-IP derivation silently breaks.

### First-time bootstrap (a genuinely fresh database)

Two real, one-time steps a fresh deployment needs beyond `up -d` — both found missing by Phase 12's
own real end-to-end smoke test, not assumed from reading the code:

1. **Seed the plan tiers.** A freshly migrated database has zero `Plan` rows at all — not even
   `free` — so every credit/entitlement operation fails until this runs once:
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production \
     run --rm --entrypoint "" api node --import tsx scripts/seed.ts
   ```
   Idempotent — safe to re-run.
2. **Bootstrap the first admin**, once a real account has registered and verified:
   ```
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production \
     run --rm --entrypoint "" api node --import tsx scripts/bootstrap-admin.ts <email>
   ```
   Neither `scripts/` (root-level operational tooling) nor `packages/capabilities-vendored/`
   (`apps/api`'s own boot-time capability reconciliation reads it, but `apps/api`'s own `package.json`
   has no dependency on any individual capability package, so `turbo prune` never included it) survive
   `turbo prune @webaudit/api --docker` on their own — both are now copied into `apps/api/Dockerfile`'s
   image explicitly. Without the second of these two, a real deployment's every scan module silently
   resolves to `NOT_APPLICABLE` forever, because nothing else in this topology ever populates the
   `Capability` table — confirmed by running a real scan against an unpatched image and getting exactly
   that empty, broken result before the fix.
3. **Postgres has no published port in this topology** (`backend` is `internal: true`, by design) — the
   two commands above, and any other one-off admin script, run *through* the `api` service's own image
   (which already has `DATABASE_URL` and reaches the network `backend` is on), never from an operator's
   own machine directly. There is no supported way to run `prisma studio`/`psql` against a real
   deployment's database without either temporarily publishing a port (weakens the isolation P8-T4
   deliberately built) or `docker compose exec`-ing into a container already on that network.

### Other operational tooling

`scripts/` is copied into the `apps/api` image wholesale (see the note above), so every root-level
operator script runs the same way, not just the two above — for example, the credit-ledger integrity
diagnostic (VERIFY-001), safe to run at any time (read-only, exits non-zero only if it finds a real
inconsistency):
```
docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production \
  run --rm --entrypoint "" api node --import tsx scripts/credits-integrity-check.ts
```

### Rollback procedure

Every service in `infrastructure/docker-compose.production.yml` is a real, tagged Docker image
(`webaudit-api`, `webaudit-worker`, `webaudit-web`) — rolling back is retagging and restarting, not a
code revert:

1. **Before deploying a new version**, tag the current, known-good images with a real version marker
   (a git SHA or release tag), not just `:latest`:
   ```
   docker tag webaudit-api:latest webaudit-api:<previous-version>
   docker tag webaudit-worker:latest webaudit-worker:<previous-version>
   docker tag webaudit-web:latest webaudit-web:<previous-version>
   ```
2. **If the new version's migration is additive/backward-compatible** (this master plan's own standing
   rule — never a destructive migration), rolling back the application containers alone is enough:
   ```
   docker tag webaudit-api:<previous-version> webaudit-api:latest
   docker tag webaudit-worker:<previous-version> webaudit-worker:latest
   docker tag webaudit-web:<previous-version> webaudit-web:latest
   docker compose -f infrastructure/docker-compose.production.yml --env-file .env.production \
     up -d api worker web
   ```
   `postgres`/`redis`/`proxy` are untouched; `migrate` is not re-run (a rollback never reverses a
   migration — the additive-only rule is what makes the old code safe to run against the new schema).
3. **Confirm recovery** the same way P8-T4's own smoke test did: `docker compose ... ps -a` shows every
   service `healthy` again, and a real request through the proxy (`curl http://<host>/health`) succeeds.
4. **Real dry-run performed** (Phase 12, this session), using a real regression this same session found
   and fixed as the "bad version": tagged the fixed, known-good `webaudit-api` image aside
   (`:known-good`), built and redeployed the pre-fix image in its place (missing
   `packages/capabilities-vendored`, this file's own "First-time bootstrap" note above) against the
   *already-initialized* Phase 12 database. Real, useful finding from this specific dry-run: the broken
   image's own boot log showed `reconciled 0 new, 0 updated, 21 absent capabilities` (reproducing the
   underlying defect exactly), yet a real scan through it still came back `COMPLETED` with a real score
   — because `reconcile.ts`'s own design deliberately never deletes or disables an "absent" `Capability`
   row (its own module note: "a capability row is never deleted... reconciliation must never write
   `isEnabled`"), so the 16 rows an earlier, correct boot had already reconciled stayed fully usable.
   **The blast radius of this class of bug is therefore scoped to a genuinely first-ever bootstrap of a
   database that has never been successfully reconciled before** — a redeploy of a broken image onto an
   already-initialized system is safe by the registry's own existing design, not by luck. Rolled back by
   re-tagging `:known-good` to `:latest` and re-running `up -d api` regardless (the correct action
   either way): the service returned to `healthy`, boot logged a real `reconciled 16 new` again, and a
   fresh scan continued to complete normally. No data loss at any step (Postgres/Redis were never
   touched).

## Summary table

| Unit | Public port | Own DB/queue credentials | Own AI provider keys | Build step | Real runbook exists |
| --- | --- | --- | --- | --- | --- |
| `apps/api` | 3001 (inbound) | Yes | Yes | No (`tsx`) | Yes |
| `apps/worker` | none (queue consumer) | Yes | Yes | No (`tsx`) | Yes |
| `apps/web` | 3000 (inbound) | No | No | Yes (`next build`) | Yes |
| `apps/probe-pool` | 3002 (reserved, unused) | No (by design, R6/R12) | No | — | **No — scaffolding only** |
| `apps/sandbox-runner` | 3003 (inbound, from `apps/api` only) | No (by design, R1) | No | No (`tsx`) | Yes — see `sandbox-runner.md` |
