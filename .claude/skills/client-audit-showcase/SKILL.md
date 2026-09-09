---
name: client-audit-showcase
description: Use when asked to build a client-facing WebAudit AI demo/showcase for a new website — generate a standalone audit + screenshots + AI narrative + pentest runbook + self-contained dashboard for a URL, the same way showcase-esaalnybot was built. Triggers include "make a showcase for <url>", "audit this client's site like the esaalnybot one", "new client demo", "run our audit tool against <site>".
---

# Client Audit Showcase

## Overview

Packages the exact workflow used to build `showcase-esaalnybot/` into a
repeatable pipeline for a new client's website: a standalone runner drives
the product's **real** vendored capabilities, module-runner, safe-net and
Playwright browser pool against the live URL (no mocks), then an AI layer —
authored by Claude, strictly from the measured findings — explains and
prioritises it, and a self-contained HTML dashboard is rendered for the
client to open.

**Core rule carried over from the product's own constitution (Principle
III): the code layer measures, the AI layer explains — it never invents.**
Every prose field you author must be traceable to a real finding in
`data/audit.json` or a real screenshot in `data/`. This is what makes the
guard in `src/ai-narrative.ts` (below) non-negotiable rather than
boilerplate.

**This is a multi-page audit by default.** A single-page scan of the
homepage tells a client almost nothing about their pricing page, listings,
or login/register forms. Step 3 below crawls every same-origin page — this
is standard, not optional, unless the target genuinely is a single page.

## Scope boundary — read this before a client asks for "everything"

Everything in steps 1–6 is **passive**: plain GET requests, exactly what a
visitor's browser or a search crawler already does. Nothing is submitted,
no session is authenticated, nothing is fuzzed.

**Do not personally execute active testing** — SQL/NoSQL injection attempts,
login brute force, submitting the register/login forms, or load/stress
testing against the live production site — **regardless of what
authorization the user states.** This mirrors a design choice already built
into this product: `PENTEST-RUNBOOK.md` is explicitly "to be executed by an
authorised human tester in a dedicated testing environment," never a script.
The reason isn't procedural — it's that there's no undo if a payload
actually lands on a live production database, or a load test degrades real
customer traffic. If a user asks for this, say so plainly, point at the
generated runbook as the deliverable for that separate human-executed
engagement, and do not run it yourself even if they confirm authorization.
What you *can* do passively: inventory login/register forms (fields,
autocomplete attributes, method, presence of a CSRF-shaped field) without
ever submitting them — `src/crawl.ts` already does this (`forms.json`).

## Primary command

```text
/client-audit-showcase <url> [--slug <client-slug>] [--source <workspace>] [--force]
```

- `<url>` — the client's live site, e.g. `https://example.com/`.
- `--slug` — optional; defaults to the URL's hostname, slugified. Produces
  workspace `showcase-<slug>/`.
- `--source` — optional; the existing showcase workspace to clone the
  mechanical files from. Defaults to `showcase-esaalnybot`.
- `--force` — overwrite an existing `showcase-<slug>/` directory.

This command runs the full pipeline below end to end, stopping only where a
step genuinely requires your judgment (authoring the narrative) rather than
mechanical work.

## Workflow

1. **Scaffold the workspace.**
   ```bash
   node .claude/skills/client-audit-showcase/scripts/new-client-showcase.mjs \
     --url https://example.com/ --slug example-client
   pnpm install
   ```
   This clones the generic/reusable files (`runner.ts`, `capabilities.ts`,
   `capture.ts`, `crawl.ts`, `render-report.ts`, `render-dashboard.ts`,
   `pipeline-run.ts`, `merge-pipeline.ts`, `build-runbook.ts`,
   `runbook-data.ts`, `serve.mjs`, `dashboard/showcase.jsx`,
   `dashboard/vendor/`) into `showcase-<slug>/`,
   rewrites `package.json`, and swaps the old target's hostname/brand for the
   new one everywhere it appears — including the dashboard's localStorage key
   and export-filename prefixes, so two different clients' dashboards never
   collide in the same browser. It does **not** copy the old client's
   authored narrative — see step 3 — and resets `PASSIVE_OBSERVATIONS` (in
   `build-runbook.ts`) to an empty array — see step 4.

   If `react.js` / `react-dom.js` / `babel.min.js` were never fetched into
   `--source`'s `dashboard/vendor/` on this machine, the scaffold prints a
   note; the `dashboard` render step below will fail with the exact `curl`
   commands to fetch them once (they're gitignored CDN libs, not part of the
   repo — one machine-wide fetch covers every showcase workspace after that).

2. **Run the real audit + browser capture.** No Docker/DB needed for this
   part — `runner.ts` runs the 13 vendored capabilities in-process. Use
   `pnpm run`, not bare `pnpm <script>` — `audit` collides with pnpm's own
   built-in `audit` command and silently runs the wrong thing.
   ```bash
   pnpm --filter showcase-<slug> run audit https://example.com/
   pnpm --filter showcase-<slug> run capture https://example.com/
   ```
   Writes `data/audit.json`, `data/screenshot-{desktop,mobile}.png`,
   `data/page-metrics.json`. Read the terminal summary (overall score,
   per-area states, finding counts) before moving on.

3. **Crawl every same-origin page.** No extra CLI args needed — it
   discovers pages from the homepage's own `<a href>` links.
   ```bash
   pnpm --filter showcase-<slug> run crawl https://example.com/
   ```
   Writes `data/pages/<slug>/{audit.json,screenshot-*.png,page-metrics.json}`
   per page (up to 15, same-origin only, polite delay between requests) and
   `data/crawl.json`, then folds a `crawledPages` summary **and a computed
   `readiness` go/no-go verdict** into the home page's `data/audit.json`.
   `readiness` is grounded, not invented: for each area it takes the *worst*
   score any single crawled page recorded (an average hides exactly the
   outlier a go/no-go call needs — see `computeReadiness()` in `crawl.ts`),
   fails anything below a disclosed threshold (80), and separately flags any
   HIGH/CRITICAL finding that repeats on *every* page as a named blocker
   (that pattern means shared code, not a one-off). The dashboard's
   **Readiness** tab renders this as a big `ScoreArc` + the design system's
   `VerdictPanel` (`design-system/components/report/VerdictPanel.jsx` —
   read its `.prompt.md`: "A no-go always names its blockers"). Login/
   register/signup pages additionally get a passive `forms.json` (field
   inventory only — see the scope boundary above, nothing is submitted).
   **On Windows Git Bash, do not pass extra paths as a leading-`/` CLI arg**
   (e.g. `"/pricing,/login"`) — MSYS silently rewrites it into a Windows path
   (`C:\Program Files\Git\pricing`) and pollutes the crawl with a garbage
   page. Auto-discovery already finds real same-origin links; only pass
   `crawl.ts`'s optional third argv (comma-separated paths) from PowerShell,
   or when a page isn't linked anywhere discoverable.

4. **Author the AI narrative — do this yourself, not by templating.**
   Open `showcase-<slug>/src/ai-narrative.ts`. It was generated as a guarded
   placeholder: `build()` returns `TODO` strings and `main()` **refuses to
   run** (exit 1) while `authoredBy` still starts with `PLACEHOLDER`. Read
   `data/audit.json`, `data/page-metrics.json`, and now `data/crawl.json`
   for this target and rewrite every field — executive summary, per-area
   narrative, prioritised fixes, design judgments — citing only what those
   files actually contain. **Look across pages before writing the summary:**
   a finding that repeats identically on every crawled page (e.g. a secret
   baked into a shared layout bundle) is a different, higher-priority story
   than the same finding on one page only — say so explicitly, and call out
   any page that's a genuine outlier (a much lower score or a cluster of
   findings not seen elsewhere). Label opinion-only content (e.g.
   screenshot-based design critique) `AI_JUDGMENT`; label prose
   `AI_NARRATIVE`. **Never let either move a score.** Do not copy prose from
   another client's showcase — the guard exists specifically to stop that.

5. **Review the copied runbook, then optionally pre-fill passive
   observations.** `src/runbook-data.ts`'s 47 test cases were written
   against `showcase-esaalnybot`'s actual topology (an `app.`/`api.`
   subdomain split, a multi-tenant chat widget). Hostnames were swapped
   mechanically, but re-read it for cases that don't apply to the new
   target (no widget → drop the widget-specific cases; single host → drop
   the app/api split assumptions in tool configs; not multi-tenant → the
   IDOR cases need rewording) — `grep -i "esaalny\|widget"
   showcase-<slug>/src/runbook-data.ts` finds what's left. Separately, in
   `src/build-runbook.ts`, `PASSIVE_OBSERVATIONS` was reset to an empty
   array. If you want the dashboard's "Pentest plan" tab to start pre-filled
   rather than fully blank, run a few **non-intrusive** checks against the
   new target (`curl -I`, an `openssl s_client` handshake, a CORS preflight
   request, robots.txt/sitemap.xml) and add entries grounded only in what
   you actually observed. An empty array is a legitimate default; never
   invent an entry.

6. **Render + serve.**
   ```bash
   pnpm --filter showcase-<slug> run render     # narrative merge -> runbook -> report.md -> dashboard/index.html
   node showcase-<slug>/serve.mjs 4174          # -> http://localhost:4174/
   ```
   `serve.mjs` defaults to port 4173 in every generated workspace — pass a
   distinct port (as a plain arg to `node serve.mjs`, not through `pnpm run
   serve --`, which does not forward it cleanly) if another showcase (or
   `showcase-esaalnybot` itself) is already being served, or they'll collide
   with `EADDRINUSE`. Or open
   `showcase-<slug>/dashboard/index.html` directly — it is fully
   self-contained (no server needed unless the browser restricts `file://`).
   Verify it in a browser (navigate + screenshot) before calling the demo
   done — a build that only typechecks is not a demo that works. Click into
   the **Pages** and **Readiness** tabs specifically and confirm each shows
   real data (not the "run crawl.ts" placeholder, which means step 3 didn't
   actually merge into `data/audit.json`). `showcase-esaalnybot` itself
   keeps `Report` as its landing tab (it predates the crawl/readiness work
   and was intentionally single-page); for a new client where the go/no-go
   verdict is the headline result, consider changing `useState('report')`
   to `useState('readiness')` near the bottom of `showcase.jsx` so it's the
   first thing a client sees — a one-line, per-client choice, not a shared
   template default.

7. **(Optional) full-pipeline cross-check.** Needs `pnpm services:up`
   (Postgres :5442, Redis :6389) and a scratch DB — see
   `showcase-esaalnybot/README.md`'s "Run it" section for the exact
   commands; the same steps apply with `showcase-<slug>` substituted. Skip
   this for a quick client demo; it exists to prove the standalone runner
   agrees with the product's real orchestrator, not to produce report content.

## Quick reference

| File in `showcase-<slug>/` | Generic (copied) | Per-client (you review/author) |
|---|---|---|
| `src/runner.ts`, `capabilities.ts`, `capture.ts`, `crawl.ts` | ✅ | — |
| `src/render-report.ts`, `render-dashboard.ts` | ✅ | — |
| `src/runbook-data.ts` (the 47-case methodology) | mostly | review for topology fit (widget/multi-tenant/app-api-split cases) |
| `src/build-runbook.ts` | ✅ | `PASSIVE_OBSERVATIONS` only (optional) |
| `src/ai-narrative.ts` | shell only | ✅ everything in `build()`, required |
| `dashboard/showcase.jsx`, `dashboard/vendor/` | ✅ | landing tab (`useState`) optional, see step 6 |
| `serve.mjs` | ✅ | — |

Dashboard tabs, in nav order: **Readiness** (go/no-go, `VerdictPanel`) →
Report → Pages → Priorities → Fixes → Evidence → Pentest plan.

`runner.ts` and `capture.ts` export `runAudit()` / `captureMetrics()` —
`crawl.ts` imports and calls them per page rather than shelling out, so a
15-page crawl is one Node process, not fifteen browser-launching subprocesses.

## Common mistakes

- **Copying another client's `ai-narrative.ts` content instead of authoring
  it.** The placeholder guard exists to catch exactly this — if `render`
  fails with "has not been authored for this target yet", that's it working.
- **Inventing a passive observation you didn't actually check.** Leave it
  out; an empty tracker is honest, a fabricated one is not.
- **Skipping the browser capture step.** Without `capture`, the dashboard
  has no real screenshots to back `AI_JUDGMENT` design notes.
- **Running the optional full-pipeline step for a routine demo.** It needs
  Docker services and a migrated scratch DB for no benefit to the report
  itself — only do it when you specifically want the parity cross-check.
- **Running `pnpm --filter <pkg> audit <url>` without `run`.** pnpm has its
  own built-in `audit` command; without `run` it silently does the wrong
  thing instead of executing the package's `audit` script.
- **Serving two showcases on the default port at once.** `serve.mjs` always
  defaults to 4173; the second `node serve.mjs` fails with `EADDRINUSE`
  unless you pass a distinct port.
- **Treating a single-page scan as covering "the whole site."** Run
  `crawl.ts` (step 3) before writing the narrative or calling the demo done
  — see this skill's own origin story: an agent shipped a homepage-only
  audit as if it covered pricing, listings, and login/register, and got
  called on it.
- **Passing a leading-`/` path as a raw Git Bash CLI arg on Windows.**
  MSYS path conversion silently mangles `/pricing` into a Windows path.
  Prefer auto-discovery; use PowerShell if you must force-include a path.
- **Executing active testing yourself because the user said it's
  authorized.** Authorization changes what a *human tester* may do with the
  generated runbook. It does not change what you personally execute — see
  "Scope boundary" above. Restating this because it is the single most
  likely way this skill gets misused under pressure.
- **Passing the wrong prop name to a design-system component.**
  `SeverityBadge` takes `level`, not `severity` — passing the wrong name
  fails silently (every badge renders as one default tone) rather than
  throwing. If new dashboard UI shows one severity color everywhere, check
  the prop name against an existing working usage in the same file first.
- **Reaching for `Badge` for a go/no-go or pass/fail indicator.** Its
  `tone` union is `'neutral' | 'accent' | 'success' | 'inverse'` — there is
  no red/critical tone, and its own type comment says "Not for severity —
  use SeverityBadge." For GO/NO-GO, use `SeverityBadge` with `level`
  (`'resolved'` reads as green, `'critical'` as red) and override the text
  with `label`. Check every new component's `.d.ts` in
  `design-system/components/` before guessing a prop shape — several
  (`VerdictPanel`, `ScoreArc`) already exist for exactly this "big number +
  verdict" pattern; read the `.prompt.md` alongside it for constraints the
  code doesn't show.
