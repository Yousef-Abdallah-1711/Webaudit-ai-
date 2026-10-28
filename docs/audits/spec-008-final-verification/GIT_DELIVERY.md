# Git delivery

| Item | Value |
|---|---|
| Starting HEAD | `8e35542` (= `origin/main`, ahead/behind 0/0 at session start) |
| Branch / remote | `main` / `origin` (normal push, **no force**) |

## Commits (oldest first)
| Hash | Message |
|---|---|
| `40e9882` | feat(db): SPEC 008 audit remediation migration (lease exclusivity, audit context, retention) — migration B, tested rollback, amendment A2, schema column |
| `09b713a` | fix(api,worker): SPEC 008 audit defects — lease vs grant expiry, `STATE_UNCERTAIN`, checkpoint order, retention |
| `7ed53b0` | test(spec008): regression tests for the independent audit defects, 116-case role matrix |
| `8cbf8c1` | test(e2e): fix ambiguous "Plan credits" locator in the admin journey |
| `81dd7ff` | docs(spec008): independent final audit package, 28/28 Chrome QA evidence, verdict |
| (this file) | docs(spec008): git delivery record |

## Pre-push checks
Every diff reviewed before staging; staging was by explicit path (no `git add -A`). Credential-shaped literal scan of the staged diff: clean. No database dumps, browser profiles/sessions or temporary drivers committed
(the drivers were temporary files, deleted; the backups `webaudit-pre-m008*.dump` stay in the session scratchpad). Screenshots/JSON in `evidence/chrome-qa/` contain only synthetic data (cookie *names* only, no values).

## Remote verification (after the code and verdict push)
`git rev-parse HEAD` = `git rev-parse origin/main` = `git ls-remote origin refs/heads/main` = `81dd7ff6288924bf4930a6f0b876854b98480fb0`; `git rev-list --left-right --count HEAD...origin/main` = `0 0`.

## Intentionally uncommitted (owner work, preserved unchanged)
`pnpm-lock.yaml` (the owner's `@swc/helpers` hunks), `apps/web/audit-sweep.mjs`, `apps/web/auth-state.mjs`, `docs/audits/frontend-design/`, `showcase-eink/`, `showcase-esaalnybot/`, `showcase-omanda-ai/`, `showcase-trimora/`. The unrelated worktree `.worktrees/phase-7-monitoring` was not touched.

## Environment side effects
- Dedicated containers `m008-audit-pg` / `m008-audit-redis` and volume were created and **removed**; scratch databases `webaudit_m008_check` / `webaudit_m008_rt_test` dropped (`zz_review_fk` pre-existed and was left).
- Migration B applied to the dev `webaudit` database after a backup (legacy row counts identical).
- The shared Redis DB 14 received 300 short-lived (5 s TTL) probe keys during a connectivity check; they expired on their own.
- The dev web server (3010) was stopped twice for builds and restored with `NEXT_PUBLIC_API_URL=http://localhost:3011`; the dev API (3011) and the unrelated service on port 3000 were never touched.
