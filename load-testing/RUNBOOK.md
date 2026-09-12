# Load-Testing Runbook

Reproduces the staged concurrency measurements behind `REPORT.md`. Written as instructions for a
future reader to follow themselves, not a description of what one session already did.

## Prerequisites

- Docker running, `grafana/k6` image pulled (`docker pull grafana/k6`).
- The repo's docker-compose Postgres (port 5442) and Redis (port 6389) up.
- A working `.env` at the repo root with real `DATABASE_URL`/`REDIS_URL`/`ENCRYPTION_KEY`/JWT secrets
  and **`AI_MODE=fixtures`** — never real provider credentials. This harness never sets this for you;
  it is a checked prerequisite so it can't silently drift to a live-spend mode.
- `apps/api` and `apps/worker` running locally against that `.env` (`pnpm --filter @webaudit/api start`
  / `pnpm --filter @webaudit/worker start`, or however this repo's own dev environment already runs
  them — this harness assumes they're already up, it does not start them).

## Step 1 — Seed the load-test users (once; safe to re-run)

```bash
npx tsx load-testing/seed-test-user.ts
```

Seeds 65 users (`loadtest-1@webaudit-loadtest.local` … `loadtest-65@webaudit-loadtest.local`, password
in `load-testing/seed-test-user.ts`'s own `LOAD_TEST_PASSWORD`), each already email-verified, each on
the `business` plan tier with a large non-expiring credit grant. **One dedicated user per VU, never
shared** — see "Why one user per VU" below for why this matters.

## Step 2 — Run one stage

```bash
mkdir -p load-testing/results/stage-<N>

# Windows/Mac Docker Desktop (host.docker.internal resolves automatically):
docker run --rm \
  -v "<absolute-path-to-repo>/load-testing/scripts:/scripts" \
  -v "<absolute-path-to-repo>/load-testing/results:/results" \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e STAGE_VUS=<N> \
  grafana/k6 run /scripts/golden-path.js --summary-export=/results/stage-<N>/summary.json
```

On Windows via Git Bash, prefix with `MSYS_NO_PATHCONV=1` and use forward-slash `C:/...` paths, or the
`-v` argument gets mangled by path conversion.

Replace `<N>` with the stage's VU count and `<absolute-path-to-repo>` with this repo's real absolute
path. Each VU logs in as its own dedicated user, creates (or reuses) its target, requests a quote,
creates a scan, and polls until terminal or a 5-minute timeout.

## Step 3 — Read the result

Console output shows `checks_succeeded`, the four custom `Trend` metrics (`quote_latency`,
`scan_create_latency`, `time_to_first_progress`, `time_to_terminal`), and `golden_path_errors`.
`results/stage-<N>/summary.json` is the same data as k6's own raw JSON — the traceable evidence
`REPORT.md`'s numbers point back to.

## The staged sequence

Run 1, 5, then 10 in order — each is cheap and low-risk. **Before treating a stage 10+ result as clean,
read "The real ceiling" below first — a stage 10 run immediately after other recent runs is not a clean
reading of stage 10's own true pass/fail rate, only of `/auth/login`'s window arithmetic.**

## The real ceiling: stages above 10 are UNVERIFIABLE BY DESIGN, not merely contention-gated

**This was discovered by actually running stage 10, not assumed up front.** `/auth/login` sits behind a
real, intentional strict rate limiter — 10 attempts per 15-minute window, keyed by source IP
(`apps/api/src/middleware/ratelimit.middleware.ts`, `STRICT_LIMIT`/`STRICT_WINDOW_MS`) — a deliberate
anti-brute-force/CPU-exhaustion control, not a bug. Every VU in one `docker run` (and every `curl` call
from one machine) shares a single source IP as the API sees it. A stage of 20+ concurrent fresh logins
**cannot** stay under that 10-per-window cap, regardless of scheduling — and pre-authenticating tokens
ahead of time doesn't route around it either, since the issued JWT's own lifetime is exactly 15 minutes
(`iat + 900s`), shorter than the time it legitimately takes to acquire more than 10 tokens at the
limiter's own allowed pace.

**Practical consequence for this runbook**: only run stages up to and including **10** from a single
machine. Space stage runs comfortably (10+ minutes apart, or check the limiter's own `Retry-After`
header/`retryAfterSeconds` body field on a `429` to know exactly how long is left) so an earlier stage's
login budget doesn't bleed into a later one and produce a misleadingly low success rate for a stage that
would otherwise pass cleanly — this is exactly what happened the first time stage 10 was run back-to-back
with stages 1 and 5 in this same session (6 of 10 logins refused, all with real `429 RATE_LIMITED`
bodies — not a timeout, not a worker failure). Do **not** attempt stages 20/40/60 against this real
limiter — every attempt will show a `login` failure rate that reflects the rate limiter working
correctly, not the platform's real scan-handling capacity, which is what this harness exists to measure.
Report a stage above 10 as UNVERIFIABLE BY DESIGN with this reason, never as a measured number.

## Why one user per VU, and a shared fixed target URL

A real `POST /targets` response (captured in this repo's own spec work) showed target canonicalization
discards any path/query string down to the bare origin — `https://example.com/?vu=1` canonicalizes to
`https://example.com`, identical to every other VU's input. `Scan_one_active_per_target`'s uniqueness is
scoped to `(userId, inputType, canonicalValue)`, so VUs sharing one user would collide on that
constraint the moment two are mid-scan against the identical canonicalized target at once. Giving every
VU its own dedicated seeded user sidesteps this entirely — every VU is simply, correctly, one
independent account creating one target and running one scan, exactly like a real customer would.

## Contention check for stages that do run

Even a stage within the safe 1-10 range should not run against a busy shared machine. Before running,
check for other load on the same Postgres this test also uses:

```bash
docker exec webaudit-postgres psql -U webaudit -d webaudit -c \
  "select pid, state, now()-query_start as dur from pg_stat_activity where datname='webaudit' and pid <> pg_backend_pid();"
```

Proceed only if this returns no long-idle or actively-busy connections beyond expectations; otherwise
wait for a quieter window.

## AI mode

`AI_MODE=fixtures` must already be set in `.env` before `apps/api`/`apps/worker` are started — this
harness assumes it, checks nothing itself, and never sets it. Running against a live-provider mode would
incur real spend on every scan this harness creates.
