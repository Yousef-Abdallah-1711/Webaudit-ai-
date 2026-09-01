# showcase-esaalnybot

A **client showcase**: a real WebAudit AI audit of **https://app.esaalnybot.tech/**, rendered into
the project's own design-system dashboard and served on localhost.

It is a self-contained workspace under the repo root. It is **not a deployable unit** and is not part
of the 250-task build plan — it exists to demonstrate the audit engine that already works today,
against a live site, for a client.

---

## What it does

1. **`src/runner.ts`** — the audit engine. Runs the **13 real vendored capabilities**
   (`packages/capabilities-vendored/*`, unmodified) against the target using the product's own
   `apps/worker/src/module-runner/*` (resolution, isolated concurrent execution, `globalThis.fetch`
   poisoning, per-area state, per-area scoring — imported, not re-implemented), the product's
   SSRF-guarded `safeFetch` for `ctx.fetch`, and the product's **real Playwright browser pool**
   (`apps/probe-pool`) for `ctx.withPage`. Writes `data/audit.json`.

2. **`src/capture.ts`** — drives a real headless Chromium separately to save
   `data/screenshot-{desktop,mobile}.png` and `data/page-metrics.json` (real navigation + paint
   timings, DOM stats).

3. **`src/ai-narrative.ts`** — the **AI layer, authored offline**. WebAudit AI's design is: the code
   layer measures, the AI layer explains and prioritises what was measured. No runtime LLM key is
   configured, so this file is that layer, written by Claude **strictly from the measured findings**
   in `audit.json`. Everything it adds is labelled `AI_NARRATIVE` (prose) or `AI_JUDGMENT` (the four
   design observations) and **never moves a score** — scores come only from `MEASURED` findings, as
   in the real `packages/scoring`.

4. **`src/pipeline-run.ts`** — the **full production pipeline**, in-process: boots the real
   `startApi` + `startWorker` (Express, BullMQ, the five-phase orchestrator, Postgres :5442 + Redis
   :6389), registers a user over HTTP, creates a real `Scan`, and lets the orchestrator drive it to
   `COMPLETED`. Writes `data/pipeline-report.json`. `src/merge-pipeline.ts` folds the parity result
   into `audit.json`.

5. **`src/runbook-data.ts` + `src/build-runbook.ts`** — a **manual penetration-test runbook** for a human
   tester: 9 phases / 47 test cases across `app`, `api` and the chatbot `widget` — SQL/NoSQL injection,
   authentication (login / register / password-reset incl. host-header poisoning + reset-token race),
   rate limiting & brute-force with bypasses, reaching the admin dashboard, IDOR & cross-tenant
   isolation, SSRF, XSS, JWT/session, the widget & prompt injection, business logic, transport/headers.
   Each case has objective, steps, payloads, tools, evidence-to-capture, "secure looks like", and
   remediation. Emits `PENTEST-RUNBOOK.md` + `data/pentest-runbook.json`. This is the active/offensive
   engagement the passive WebAudit AI scan does *not* do.

   In the dashboard ("Pentest plan" tab) this is a **live execution tracker**: each case gets a status
   (Not started / In progress / Partial / Vulnerable / Secure / N/A) and a notes field, saved in the
   browser (`localStorage`), with an **Export findings** button that produces a findings log. Seven
   rows are pre-filled from **non-intrusive** checks already run (missing security headers, TLS
   protocol/cipher posture, `Server:` version disclosure, a CORS-preflight smell, advertised HTTP
   methods, the parked apex domain). **Everything else is "Not started" — the active testing (SQLi,
   auth attacks, brute force, IDOR, SSRF, XSS, …) is for a human tester, under written authorisation
   and a signed scope. None of it has been run from here.**

6. **`src/render-report.ts`** — `audit.json` → **`report.md`** (the full report + a runbook summary).

7. **`src/render-dashboard.ts`** — `audit.json` → **`dashboard/index.html`**, a **single, fully
   self-contained, client-side-only** HTML file. Everything is inlined — the design-system token CSS,
   the design-system component bundle, React 18, Babel standalone, the theme/strings helpers, the
   showcase UI (`dashboard/showcase.jsx`), the real audit data (`window.__AUDIT__`) and both
   screenshots (data: URIs). **No server, no build, no network at view time** (bar an optional
   Google Fonts stylesheet that degrades to the fallback stack). Just open the file.

8. **`serve.mjs`** — an optional zero-dependency static server, only for browsers that restrict
   `file://`. Not required.

---

## Run it

Prerequisites: `pnpm install` at the repo root, Docker running with the project's services up
(`pnpm services:up` — Postgres :5442, Redis :6389).

```bash
# 1. the audit + the browser capture + the AI narrative + the report + the dashboard
pnpm --filter showcase-esaalnybot build

# 2. (optional) the full-pipeline cross-check — needs a migrated scratch DB:
docker exec webaudit-postgres psql -U webaudit -d webaudit -c "CREATE DATABASE webaudit_showcase"
DATABASE_URL="postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_showcase?schema=public" \
  pnpm exec prisma migrate deploy --schema apps/api/prisma/schema.prisma
DATABASE_URL="postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_showcase?schema=public" \
  REDIS_URL="redis://localhost:6389" \
  pnpm --filter showcase-esaalnybot pipeline
pnpm --filter showcase-esaalnybot merge-pipeline
pnpm --filter showcase-esaalnybot render   # re-render with the parity section

# 3. view — just open the file, no server:
#   Windows:  start showcase-esaalnybot\dashboard\index.html
#   or double-click  showcase-esaalnybot/dashboard/index.html
#
# (optional) if your browser restricts file://:
pnpm --filter showcase-esaalnybot serve          # -> http://localhost:4173/
```

Audit a different URL: `pnpm --filter showcase-esaalnybot audit https://example.com/`.

---

## What is real vs. authored

| Real, measured against the live site | Authored (labelled, no score impact) |
|---|---|
| Every finding's severity, location, evidence, fingerprint (`MEASURED`) | Executive summary, per-area narrative, prioritised action list (`AI_NARRATIVE`) |
| Per-area state + score, overall score (`packages/scoring`) | The 4 design observations from the screenshots (`AI_JUDGMENT`) |
| Page load timings, screenshots, DOM stats (real Chromium) | The scope note |
| Capability execution table (real timings) | |

**Not run:** the runtime AI executor (no LLM key — that's the "issue"), billing, and anything behind
the target's sign-in (out of scope for the WebAudit AI baseline by design).

## Files this workspace adds outside its own folder

- One line in `pnpm-workspace.yaml` registering `showcase-esaalnybot` as a workspace.
- `apps/api/prisma/generated/` — the generated Prisma client (`pnpm db:generate`), needed by the
  optional full-pipeline step. Not committed; regenerate with `pnpm db:generate`.

Nothing in `apps/`, `packages/`, or `design-system/` source is modified.

## One real product defect this surfaced

The full-pipeline run hit a foreign-key violation: `apps/worker/src/module-runner/persist.ts` writes
an AI execution row keyed `module-ai:<module>`, but nothing reconciles those synthetic ids into the
`Capability` table, so the required `CapabilityExecution → Capability` FK fails the moment the AI
layer produces an invocation (it does under `AI_MODE=fixtures`). `pipeline-run.ts` seeds those rows
as a workaround and notes it. Worth a real fix in the product.
