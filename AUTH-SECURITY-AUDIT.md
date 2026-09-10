# Authentication System — Full Security Audit, Testing & Remediation TODO

Status: audit, reproduction, fixes, and every follow-up hardening item below are complete and
verified. Only the commit/push decision (§4) is deliberately left open. Companion pattern to
`PLAN.md`/`TASKS.md` (which are scoped to the Credit System) — this file is the equivalent
tracking document for the authentication system specifically.

---

## 1. Scope

Every authentication-adjacent flow was inspected and then actually exercised with real HTTP
requests against a real running `createApp()`/`startApi()` instance and a real Postgres/Redis
test stack — registration, email verification (+ resend/supersession), login, logout, refresh
rotation (+ concurrency, + reuse-after-grace), password reset, OAuth sign-in/connect (Google +
GitHub), `requireAuth`/`requireOperator`, rate limiting, CORS, SQL injection, and input
validation. Full narrative and code excerpts for the investigation live in this session's
conversation history; this file is the actionable checklist and the durable record of what was
found, fixed, and verified.

## 2. Findings

- [x] **AUTH-CRIT-1 — Account pre-hijacking via OAuth identity merge onto an unverified
      pre-existing registration** ("classic-federation merge" attack). An attacker registers a
      victim's real email with a password of their own choosing (FR-001 only refuses a *second*
      registration); the row sits unverified. The real victim later signs in with a
      provider-confirmed identity (Google/GitHub) using that same address — FR-004 correctly
      joins the existing row, but the join never checked whether it had ever actually been
      verified, and never invalidated a password nobody had proven ownership of. Once
      `emailVerifiedAt` gets set through any path (the victim's own confirmation link, a resend
      they trigger, anything), the attacker's original password satisfies `login()`'s
      verification gate and signs straight into the victim's real account.
      **Reproduced**: `apps/api/tests/adverse/oauth-account-prehijack.test.ts` — first run
      (pre-fix) showed the attacker's password returning `200` instead of `401`.
      **Fixed**: `apps/api/src/services/auth/oauth.service.ts` — joining an unverified existing
      row now nulls `passwordHash`, sets `emailVerifiedAt` to now, and revokes any live refresh
      tokens, atomically, treating the OAuth provider's proof as the account's first real
      verification. The legitimate case (joining an already-verified account) is untouched.
      **Verified**: same test file, both tests pass; `auth.oauth-join.test.ts`'s 8 pre-existing
      tests (the legitimate-case fixtures) still pass unmodified.

- [x] **AUTH-LOW-1 — Malformed/oversized request bodies misreported as server faults.** A
      broken-JSON or over-1MB body on any route returned `500 INTERNAL` (routed to the generic
      catch-all, logged as `[api] unhandled`) instead of a client error — not an information
      leak, but it misclassifies routine client mistakes as server incidents, polluting error
      monitoring with noise that could mask a real incident.
      **Fixed**: `apps/api/src/app.ts` — a dedicated body-parser error handler now answers with
      the status body-parser already computed (400 unreadable JSON, 413 over-limit) before the
      request reaches the generic 500 handler.
      **Verified**: `apps/api/tests/adverse/auth-input-validation.test.ts`.

## 3. Test-coverage gaps closed (no code defect, but previously unverified controls)

- [x] **Rate limiting** — never exercised by any test in the repo before this audit.
      `apps/api/tests/adverse/auth-rate-limiting.test.ts` (11 tests): proves login/register/
      forgot-password/verify-resend actually 429 past the limit, successful logins count too,
      IP-keying isolates clients, `/health` and OPTIONS preflights are never throttled, and
      documents (with a passing test) that all credential paths deliberately share ONE combined
      budget per client — a stricter design than independent per-route budgets, confirmed
      correct rather than assumed.
- [x] **SQL injection** — never exercised with real payloads before this audit.
      `apps/api/tests/adverse/auth-sql-injection.test.ts` (74 tests): classic and blind
      injection payloads fired at login, registration, password reset, email verification,
      the bearer token, and the refresh cookie. Every one refused safely; the `User` table
      verified intact after every attempt, including a literal stacked-statement payload.
- [x] **CORS** — zero tests existed before this audit.
      `apps/api/tests/adverse/auth-cors.test.ts` (8 tests): allowed origin reflected with
      credentials, disallowed origin gets no CORS header at all (not an error), no wildcard
      ever emitted, preflight behavior correct for both allowed and disallowed origins, no
      prefix/substring fuzzy-matching.
- [x] **Input validation edge cases** (type confusion, huge values, unicode, malformed JSON,
      missing/extra fields) — no prior coverage beyond a malformed-email and a short-password
      check. `apps/api/tests/adverse/auth-input-validation.test.ts` (48 tests).

## 4. Follow-up hardening items (opened during this audit's own final review)

- [x] **IDOR regression tests for `reports.routes.ts` and `issues.routes.ts`.** Code inspection
      confirmed every lookup in both files is scoped by `userId` (directly, or via
      `scan: { userId }`) — consistent with the same pattern already proven for `scans.routes.ts`
      and `targets.routes.ts` — but neither file had a dedicated cross-user test proving it at
      the HTTP layer, only `targets.routes.test.ts` did. Closed with
      `apps/api/tests/adverse/reports-issues-idor.test.ts` (7 tests, all passing in isolation
      against a live Postgres/Redis stack — a shared-machine peer session's concurrent test
      runs caused transient FK-violation contention while writing this file, resolved each
      time by a short cross-session pause; unrelated to the code under test).
- [ ] **Commit and, if requested, push** the two source fixes (`app.ts`, `oauth.service.ts`)
      and the six new adverse test files. Not yet done — awaiting explicit instruction, per this
      repository's established pattern of treating commit/push as separate, explicit steps.

## 5. Final verification

```
pnpm -r typecheck                          # clean, 34/34 projects
npx eslint <every changed/new file>        # clean
npx prettier --check <every changed/new file>  # clean
npx vitest run --project adverse --no-file-parallelism   # 48 files, 808/809 (1 pre-existing skip), 0 failed
npx vitest run --project unit --no-file-parallelism      # 130 files, 1027/1027, 0 failed
```

## 6. Verdict

One critical account-takeover vulnerability found via actual reproduction (not review),
fixed, and regression-tested. One low-severity monitoring-hygiene defect fixed. Three
previously-unverified security controls (rate limiting, SQL injection resistance, CORS) now
have real, passing, attack-simulation tests. IDOR posture on every auth-adjacent resource route
confirmed both by inspection and, as of this pass, by test. Nothing in this file is unchecked
except the commit/push decision, which is deliberately left to the user.
