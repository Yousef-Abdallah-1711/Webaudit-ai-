# Manual / Playwright-MCP Exploratory Checklist

Run this against a real running dev stack (`pnpm --filter @webaudit/api run dev`,
`pnpm --filter @webaudit/worker run dev`, `pnpm --filter @webaudit/web run dev`), either by a human
clicking through it or by Claude driving the Playwright MCP browser tool one step at a time. Record
the actual observed result next to each item, with a date — this file is a log, not a static spec.
This is not a re-statement of what `tests/e2e/{auth,onboarding,dashboard,admin}/` already assert
automatically (22 specs, all green as of 2026-09-09) — it exists for exactly the things automation
cannot cover, plus a human-judgment pass over what it can.

## Auth — the two things automation genuinely cannot cover

- [ ] **GitHub OAuth sign-in**: requires `GITHUB_OAUTH_CLIENT_ID`/`_SECRET` for a real registered
  GitHub OAuth app pointed at this dev stack's real callback URL. Click "Continue with GitHub" on
  `/login`, authorize against a real GitHub account, confirm redirect back to `/scan` (the real
  new-scan form, not the old scaffold placeholder — see 2026-09-08's plan) with a real session.
  **Blocked until real OAuth app credentials exist** — record whether this was actually run.
- [ ] **Real email delivery**: requires a real `RESEND_API_KEY`. Register a real, reachable test
  inbox, confirm the verification email actually arrives (not just the console log line), click the
  real link in the real email, confirm it verifies the account. Repeat for the password-reset email.

## Visual/UX judgment calls automation does not make well

- [ ] Walk all 5 auth pages, both viewports (1440 and 390) — does anything look broken that a
  pixel-diff threshold might tolerate but a human would call wrong?
- [ ] Walk the onboarding journey end to end as a first-time user would, without already knowing the
  UI: `/scan` (submit a URL, pick areas, accept the quote) → `/scan/[id]` (live progress) → `/reports/[id]`
  (the report). Is anything confusing, is any copy unclear, does any button do something surprising?
- [ ] Walk all 10 admin screens (`/admin`, `/admin/users`, `/admin/capabilities`, `/admin/plans`,
  `/admin/providers`, `/admin/billing`, `/admin/queue`, `/admin/scans`, `/admin/log`,
  `/admin/settings`) as a real operator — same "does this feel right" pass Tasks 8-10's assertions
  don't capture. Two of these are known, deliberately-scoped-out gaps worth a specific look:
  `/admin/providers` is local-state-only (reordering doesn't persist, "Add provider" does nothing —
  the real backend chain-replace validation exists but nothing calls it from this screen yet), and
  `/usage` (customer-facing, not admin, but the same class of gap) is 100% placeholder demo data by
  its own header comment. Confirm both still read as obviously incomplete rather than silently wrong
  — a demo number that looks plausible is worse than one that looks fake.
- [ ] Confirm the public marketing footer's "Dashboard"/"Admin console" links (always visible,
  logged in or not — this is the vendored design's own behavior, not a bug; see this plan's own
  investigation notes) behave sensibly for a logged-out visitor who clicks them.

## Cross-cutting

- [ ] With devtools' Network tab open, confirm no request ever leaves for a third-party host from
  any of the 27 real pages beyond what `no-external-requests.spec.ts` already automates for 6 of them
  (`/`, `/login`, `/signup`, `/verify-email`, `/forgot-password`, `/reset-password`) — spot-check the
  other 21 (`/reset-password` already covered; remaining: `/scan`, `/scan/[id]`, `/reports/[id]`,
  `/fixes`, `/readiness`, `/usage`, `/billing`, `/settings`, `/pricing`, and all 10 `/admin/*` pages).
- [ ] Confirm a browser back/forward through the onboarding journey doesn't leave the UI in a
  contradictory state (e.g. showing "processing" for a scan that already completed).
