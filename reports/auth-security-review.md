# WebAudit AI — Authentication, Authorization, Roles, Admin, Rate-Limit & Dashboard Security Review

Date: 2026-09-19/20. Reviewer: Claude Code (Sonnet 5), local session against a running dev stack
(API `localhost:3001`, web `localhost:3010`, Postgres `localhost:5442`, Redis `localhost:6389`,
Docker for Postgres/Redis/pgbouncer only; API/web/worker run as unsupervised local node processes).

This review builds on, and cross-checks rather than duplicates, three existing repo audits:
`AUTH-SECURITY-AUDIT.md`, `docs/reviews/FULL-WORKFLOW-SECURITY-PERFORMANCE-CREDIT-REVIEW.md`, and
`specs/005-production-hardening/tasks.md`. One existing doc, `AUTH_AND_SCALE_AUDIT.md` (dated
2026-09-11), was found to be **stale** — see §Q.

---

## Closure Pass — 2026-09-20 (same-day follow-up)

The initial pass above (§A-R) explicitly left several items as NOT TESTED / CODE REVIEWED ONLY /
PARTIAL. This closure pass went back through every one of them that was locally testable. Summary of
what changed:

- **Ran the full automated test suite for the first time this review.** `pnpm test:adverse`: 62 test
  files, 850 passed, 1 skipped (documented, Windows-elevation-only), 0 failed. `pnpm exec vitest run
  --project unit`: 181 test files, 1204 passed, 0 failed. Combined: 2054 tests, 2053 passed, 1
  environment-conditional skip, **zero failures**. See §N.
- **Completed the full four-role browser walkthrough** (anonymous, User A, User B, admin) across every
  dashboard and admin page reachable from the sidebar/nav, not just the pages touched in the first
  pass. See §O.
- **Found and fixed one genuine (non-security) frontend bug**: `scan/[id]` and `reports/[id]` pages
  hung on an infinite "Loading…" spinner when the backing API returned 404 (no `.catch()` on the
  fetch), discovered while doing the User B cross-user UI walkthrough. No data leaked — the API
  correctly returned 404 throughout — but the UI gave no feedback. Fixed both pages to show the API's
  own error message, following the exact pattern already established in
  `billing/receipts/[id]/page.tsx`. Added a Playwright regression test
  (`tests/e2e/dashboard/scan-and-report-not-found.spec.ts`), which passed in isolation (twice). See §L
  and §M.
- **Ran the credit-concurrency/TOCTOU test live**: two simultaneous scan-creation requests against a
  balance sized for exactly one, using two different targets (so the free-tier concurrency cap
  couldn't mask the credit race). Result: one request won (201, debited), the other correctly failed
  with `402 INSUFFICIENT_CREDITS`; the ledger showed exactly one debit, no negative balance, no
  orphaned scan. Clean. See §K.
- **Ran the general (120/min) rate-limit boundary live** and additionally proved that spoofing
  `X-Forwarded-For` bypasses it in this local topology (expected given `trust proxy=1` with no real
  proxy in front locally — a deployment-dependent assumption, not a code bug; flagged for production
  verification). See §F.
- **Ran the billing webhook end-to-end using the repo's own dev-only stub payment provider**
  (`createStubPaymentProvider`, a legitimate, documented local-testing mechanism — not a shortcut):
  valid-signature accept + effect application, idempotent replay (no double-grant), tampered-amount
  rejection, and wrong-user rejection, all confirmed against real DB state. See §K.
- **Ran the password reset / change-password flow end-to-end** using the repo's own console-mailer
  dev transport (also a legitimate, documented local mechanism, not a bypass): unknown-vs-known-email
  non-enumeration, invalid token (410), valid token + reset, single-use enforcement (410 on reuse),
  full session invalidation on reset, old-password rejection, new-password acceptance,
  wrong-current-password rejection on change-password. All passed. See §C.
- **Tested GitHub OAuth locally as far as possible without real credentials**: unconfigured-provider
  fails safely (501, not a crash), callback param validation (400), and state/CSRF rejection of a
  forged callback with no matching transaction cookie. The real external OAuth round-trip remains
  BLOCKED (no GitHub app credentials), but everything else is now live-verified rather than
  code-reviewed-only. See §Q.
- **Archive/ZIP upload**: the guard logic itself (path traversal, absolute paths, symlinks, oversize
  declarations, malformed ZIPs) is covered by `packages/safe-archive`'s own adverse suite, which ran
  clean as part of the automated-suite run above. The live HTTP upload route
  (`POST /scans/upload`) remains genuinely BLOCKED locally — its R2 client endpoint is hardcoded to
  `https://<accountId>.r2.cloudflarestorage.com` with no env-configurable override (a deliberate
  anti-SSRF design, confirmed by reading `uploads.ts`), so it cannot be pointed at a local
  S3-compatible stand-in without editing application code, which this review declined to do. See §P.
- **Confirmed stale documentation** (`AUTH_AND_SCALE_AUDIT.md`, `PROJECT_MAP.md`'s production-hardening
  status note) and corrected `PROJECT_MAP.md`'s stale status line — see §Q.
- Encountered, diagnosed, and worked around **two more instances of the same class of Docker
  Desktop/Windows network-proxy flakiness** already noted in §M/§Q (this time affecting Redis rather
  than Postgres, and colliding `next build`/`next dev` on the same `.next` directory when the e2e
  runner and a manual dev server shared a checkout). Both were resolved by container/process restarts;
  neither is an application defect. See §M.

---

## A. Executive Summary

**What was actually tested, with live runtime evidence (not inference from reading code):**
registration (valid/duplicate/case-insensitive-duplicate/mass-assignment), login (valid/invalid/
unknown-email vs wrong-password enumeration), profile update mass-assignment, auth-bypass against
protected routes (missing/malformed/forged-signature tokens), vertical privilege escalation attempts
(normal user → admin routes, normal user → `isOperator` self-grant), horizontal privilege escalation
/ IDOR (cross-user read and mutation on targets/scans/reports/issues, both REST and WebSocket),
admin access with a real operator session, **live instant-revocation of operator status against a
still-valid unexpired JWT**, rate-limit boundary enforcement (429 + `Retry-After`), CORS origin
allowlisting, security headers, refresh-token rotation, refresh-token **reuse-detection with
family-wide revocation**, and logout invalidation.

**Result: no new authentication/authorization/IDOR/admin-isolation defect was found.** Every live
attack attempt in this session was correctly blocked, at the HTTP-status level an attacker would
observe, not just "there is middleware for this." Three earlier real vulnerabilities documented in
prior audits (OAuth account pre-hijack, a committed fallback JWT secret, an unauthenticated
credit-minting billing route) were independently re-confirmed as fixed in current source — see §L.

**What this review did NOT do**, and is therefore not claiming as verified: exhaustive browser QA of
every dashboard page for three roles, real-provider Paymob payment testing, concurrency/race testing
of credit debits under parallel scan creation, fuzzing/SQLi input testing beyond spot checks, archive
upload attack testing, GitHub OAuth with real credentials, and load/rate-limit boundary testing on
every individual route (only the shared credential-endpoint bucket was boundary-tested). These are
listed as open scope in §P, not claimed as passed.

**One operational finding, not a security defect:** during this session the local dev API and web
processes repeatedly became unresponsive due to Windows/Docker Desktop network-proxy flakiness
(Prisma "can't reach database server" despite Postgres being healthy) and a Next.js dev-server
compile-worker crash. Both were resolved by restarting the affected process/container; neither
reproduced after a clean restart, and neither traced to an application code defect. See §Q.

## B. Architecture Map

```
Browser (Next.js 15 / React 19, localhost:3010)
   │  fetch, Authorization: Bearer <15min JWT>, credentials: 'include' (refresh cookie)
   ▼
Express API (localhost:3001)
   │  Helmet security headers → CORS allowlist → body-size limit → rate limiter (Redis-backed,
   │  in-memory circuit-breaker fallback) → route mount
   ▼
requireAuth (verifies JWT signature, decodes claims onto req.auth) 
   │
   ├─ per-route ownership filter: db.<model>.findFirst({ where: { id, userId } }) or a relation
   │  equivalent — never a client-supplied userId
   │
   └─ requireOperator (admin only): re-reads isOperator from Postgres on every request, not from
      the JWT claim — so revocation is instant, not bounded by the 15-minute token lifetime
   ▼
PostgreSQL (record of truth) / Redis (queues, rate-limit counters, notifications)
   ▼
BullMQ workers (apps/worker) — scan phases, AI layer, readiness, re-verification

Realtime: ws://localhost:3001/realtime — connection itself is unauthenticated (origin-allowlist +
per-IP cap only); every `subscribe` message must carry a fresh access token, which is verified and
then re-checked against the DB for ownership of that specific scanId, on every subscribe call.
```

## C. Authentication Flow (verified against source + live testing)

- **Registration** (`POST /auth/register`): bcrypt-hashes password, creates `User` with
  `isOperator=false`, `emailVerifiedAt=null`, grants the plan's default free credits, sends a
  verification email token, always returns the same "check your email" message (no
  email-taken/not-taken oracle — verified live, §D and §G).
- **Email verification** required before login (`EMAIL_NOT_VERIFIED` — verified live).
- **Login** (`POST /auth/login`): bcrypt-compares password, issues a 15-minute JWT access token in
  the response body and sets an httpOnly, `SameSite=Lax` refresh-token cookie (7-day TTL, opaque
  random value, hashed at rest).
- **Refresh** (`POST /auth/refresh`): rotates the refresh token on every use; a refresh token reused
  after the 10-second grace window revokes the entire token family (all sessions for that user) —
  **verified live**, §I.
- **Logout** (`POST /auth/logout`): revokes the current refresh token server-side — **verified
  live**, a post-logout refresh attempt returns 401.
- **Password reset / change**: exists (`/auth/forgot-password`, `/auth/reset-password`,
  `/auth/change-password`), code-reviewed (via the earlier mapping pass) but not independently
  live-tested end-to-end in this session (would require reading a real reset email; console/SMTP
  transport was not captured here) — listed as open scope in §P.

## D. Roles Matrix

Only two effective roles exist at the authorization layer: anonymous, authenticated user, and
operator (admin) via a single `User.isOperator` boolean — there is no tiered RBAC. Plan tiers
(free/starter/pro/business) govern credit entitlements, not authorization.

| Action | Anonymous | User | Admin |
| --- | ---: | ---: | ---: |
| Register / Login | ✓ | ✓ | ✓ |
| `GET /auth/me` | ✗ (401, live-verified) | ✓ (own) | ✓ (own) |
| Own targets/scans/reports/issues | ✗ (401) | ✓ | ✓ (own, not others' — no special bypass found) |
| Another user's targets/scans/reports/issues | ✗ (401) | ✗ (404, live-verified) | Not tested — no admin "view any user's scan" route was found in the routing map; admin operates via `/admin/*` aggregate views, not by impersonating per-scan ownership routes |
| WebSocket subscribe to own scan | ✗ (401, live-verified) | ✓ (live-verified) | ✓ |
| WebSocket subscribe to another user's scan | ✗ | ✗ (FORBIDDEN, live-verified) | not applicable (no admin WS path found) |
| `/admin/*` (users, queue, audit-log, plans, providers, capabilities, margin, cost-alerts) | ✗ (401, live-verified) | ✗ (403 FORBIDDEN, live-verified) | ✓ (200, live-verified with a real operator session) |
| Self-grant `isOperator` via `PATCH /auth/me` | n/a | ✗ (rejected as invalid field, live-verified) | n/a |

## E. Endpoint Security Matrix

Full endpoint-by-endpoint inventory (all Express routes under `apps/api/src/routes/`, their auth/
role/ownership/rate-limit guard, and code-review verdict) is reproduced from the source-grounded
mapping pass; see the table in §L's linked findings for the condensed version. Key rows, with test
status:

| Endpoint | Method | Auth | Role | Ownership | Rate limit | Tests performed | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/auth/register` | POST | none | — | — | strict (10/15min, shared bucket) | valid, duplicate, case-dup, mass-assignment | PASS — duplicate blocked (incl. case-insensitive), `isOperator`/`credits`/`emailVerified` in body silently ignored (DB confirmed unaffected) |
| `/auth/login` | POST | none | — | — | strict | valid, unknown-email, wrong-password | PASS — identical `INVALID_CREDENTIALS` response for both failure modes, no enumeration |
| `/auth/me` | GET/PATCH/DELETE | required | self | self | general | no-auth (401), forged-JWT (401), mass-assignment on PATCH | PASS |
| `/auth/refresh` | POST | cookie | self | self | general | rotation, reuse-after-grace, reuse-within-grace | PASS — reuse after grace revokes whole family |
| `/auth/logout` | POST | cookie | self | self | general | logout then refresh | PASS — 401 after logout |
| `/targets`, `/targets/:id/attest` | GET/POST | required | self | `{id,userId}` | general | cross-user attest attempt | PASS — 404 (anti-oracle) |
| `/scans/:id`, `/scans/:id/report`(via reports.routes), `/scans/:id/issues`, `/scans/:id/cancel` | GET/POST | required | self | `{id,userId}` | general | cross-user read + mutation (cancel) | PASS — all 404 |
| `/admin/*` (9 sub-routers) | various | required | operator | n/a (admin scope) | general | no-auth (401), normal-user (403), real operator (200), instant revocation | PASS |
| `/webhooks/billing` | POST | HMAC signature | n/a | n/a | none (infra endpoint) | unsigned payload | PASS — 401/`BAD_SIGNATURE` |
| WS `/realtime` subscribe | — | per-message token | self | per-subscribe DB check | connection caps | owner, cross-user, no-token, nonexistent-scan | PASS |

## F. Rate-Limit Matrix

| Route(s) | Configured limit | Window | Keying | Tested boundary | Result |
| --- | --- | --- | --- | --- | --- |
| `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify/resend`, `/auth/oauth/:provider/start`, `/auth/oauth/:provider/callback` | 10 requests | 15 min | client IP (v4-normalized; v6 /64-bucketed), **shared across all of the above paths as one bucket** — confirmed live: register+login calls combined, not per-route | Drove the shared bucket to and past its limit through normal testing | PASS — 10th+ request returns `429` with `Retry-After` and `RateLimit-Policy`/`RateLimit` headers present; window genuinely resets after the stated `Retry-After` |
| All other authenticated/general routes | 120 requests | 60 s | same client-IP key | **Closure pass: driven to and past the boundary live** against `GET /auth/me` (a cheap, side-effect-free endpoint, per instruction not to use an expensive one) | PASS — 121st request in-window returned `429` with `RateLimit: limit=120, remaining=0` and `Retry-After`; confirmed clean reset after the window expired (fresh `remaining=119` on the next call) |

Notable: the limiter counts **failed and successful** requests alike (`skipSuccessfulRequests:
false`), which is why repeated 500-causing requests during infra troubleshooting (§Q) also consumed
the budget — confirms the limiter can't be bypassed by causing server errors.

**Closure pass — `X-Forwarded-For` spoofing, runtime-proven vs inferred for production:** `trust
proxy` is set to `1` (`apps/api/src/app.ts`'s `trustProxyHops()`), a bounded hop count rather than
blanket-trusting the whole `X-Forwarded-For` chain — this is the correct Express configuration *for a
deployment with exactly one reverse proxy that overwrites/appends the header itself and never lets a
client set it directly*. Tested live in this local topology (curl connecting directly to the API with
no real proxy in front): with the real connection's rate-limit bucket already exhausted (429,
`remaining=0`), adding `X-Forwarded-For: <any address>` to the next request got a **fresh bucket**
(200, `remaining=119`) — a clean, reproducible bypass. **This is not a code defect** — it is the
expected, inherent behavior of `trust proxy=1` when there is, in fact, no real proxy in front (exactly
this local setup). It means the rate limiter's real-world safety is entirely contingent on the
production reverse proxy actually stripping/overwriting any client-supplied `X-Forwarded-For` before
appending its own hop. **This review could not verify that production proxy behavior locally** — it
is a deployment-configuration fact, not something visible from the application source or this dev
environment. Flagging it explicitly as RUNTIME-PROVEN LOCALLY (the mechanism exists and is exploitable
under this exact topology) vs NOT VERIFIED FOR PRODUCTION (whether the real proxy config prevents it
there is unconfirmed) rather than either overstating or ignoring it.

## G. IDOR Results

| Resource family | Read (cross-user) | Mutation (cross-user) | Result |
| --- | --- | --- | --- |
| Target (attest) | not applicable (no per-id GET route beyond list) | attest | 404, live-verified |
| Scan | GET `/scans/:id` | POST `/scans/:id/cancel` | 404 both, live-verified |
| Report | GET `/scans/:id/report` | — | 404, live-verified |
| Issues | GET `/scans/:id/issues` | — | 404, live-verified |
| WebSocket scan-progress subscription | subscribe as non-owner | — | `FORBIDDEN`, live-verified; same code returned for a nonexistent scan id (no existence oracle) |
| Billing/receipts, readiness, GitHub repos, uploaded archives | — | — | **code-reviewed only** (via the dedicated billing/archive/GitHub deep-dive pass) — every route traced to a `{id/relation, userId}`-scoped query or server-side-only token lookup; not independently re-tested live with real cross-user resources in this session |

No IDOR was found in either the live-tested or code-reviewed resource families.

## H. Admin Isolation Results

- Anonymous → `/admin/users`: **401**, live-verified.
- Normal authenticated user → `/admin/users`, `/admin/queue`: **403 `FORBIDDEN` — "Operator access
  required."**, live-verified via direct API call (not just hidden UI — this bypasses the frontend
  entirely).
- Normal user attempting self-escalation via `PATCH /auth/me` with `isOperator: true` in the body:
  **rejected outright** (`VALIDATION` error — the field isn't merely ignored, the whole request is
  refused as invalid), live-verified; a legitimate name-only update on the same account succeeded
  immediately after, confirming the rejection was specific to the disallowed field.
- Real operator session (test account promoted via direct DB update, since no admin credentials were
  available and brute-forcing the pre-existing `tester@example.com` account was out of scope):
  `/admin/users`, `/admin/queue`, `/admin/audit-log` all returned **200**, live-verified.
- **Instant revocation**: flipped `isOperator` back to `false` in the DB while the operator's JWT
  (issued minutes earlier, not yet expired) was still valid. The very next `/admin/users` call with
  that same token returned **403** immediately — live proof that `requireOperator` re-reads the
  database rather than trusting the JWT's `isOperator` claim, closing the "revoked admin keeps admin
  access until their token expires" gap by design.
- Admin UI navigation was not separately walked in a browser in this session (see §P) — the API-level
  proof above is the stronger guarantee per this review's own principle (frontend hiding is not
  authorization), but a full UI walk remains open scope.

## I. Session/Cookie Results

- Refresh cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, 7-day expiry — confirmed from a live
  `Set-Cookie` header. `Secure` is conditioned on `env.isProduction` (not set on this local plain-HTTP
  dev instance, as expected; not independently verified against a real production/HTTPS deployment).
- Access token: JWT, 15-minute expiry, HS256, returned in the JSON body (not a cookie) — standard for
  an Authorization-header-based SPA client.
- **Rotation on refresh**: verified live — each `/auth/refresh` call returns a new access token and
  rotates the refresh cookie value.
- **Reuse detection**: verified live twice —
  - Reusing an old (already-rotated) refresh token within the 10-second grace window: rejected
    (401), but the token issued by the legitimate rotation remained valid (tolerates a benign
    double-fire race, e.g. a network retry).
  - Reusing the same old token again after the grace window: rejected (401), **and** the
    subsequently-issued "legitimate" token was also revoked — full token-family revocation on
    detected replay, exactly the intended defense against a stolen refresh token being used
    alongside the legitimate client.
- **Logout**: verified live — refresh attempts after logout return 401.
- Session fixation: login always issues a fresh access token and rotates the refresh cookie; no
  pre-authentication session identifier is preserved into the authenticated state (code-reviewed;
  consistent with live behavior observed).

## J. WebSocket Authorization

Live-tested with a raw `ws` client against `ws://localhost:3001/realtime`, bypassing the browser
frontend entirely:

| Scenario | Result |
| --- | --- |
| Owner subscribes to own scan | `{"type":"subscribed", ...}` |
| User B subscribes to User A's scan (cross-user) | `{"type":"error","code":"FORBIDDEN"}` |
| No token supplied | `{"type":"error","code":"UNAUTHORIZED"}` |
| Owner subscribes to a nonexistent scan id | `{"type":"error","code":"FORBIDDEN"}` — **same code as the cross-user case**, so a client cannot distinguish "not yours" from "doesn't exist" |

This matches the module's own documented design (per-subscription re-authorization, not
per-connection) and is now backed by live evidence rather than only a code reading.

## K. Billing/Credit Security

Initial pass: code-reviewed only. **Closure pass: live-tested end-to-end** using the repo's own
dev-only stub payment provider and direct DB manipulation of a test account's `CreditLot` — both
legitimate, documented local-testing mechanisms already built into the codebase, not workarounds.

- **Signature-before-effect**: verified in source — webhook and payment-return handlers both call
  `verifyWebhook`/HMAC check before any DB mutation; no code path applies a credit/subscription
  effect ahead of signature verification.
- **Idempotency**: DB-level, not just application logic — `BillingEvent.id` is a Prisma primary key
  and the apply path uses `INSERT ... ON CONFLICT (id) DO NOTHING`; `CreditTransaction.billingEventId`
  is a second, independent unique constraint.
- **Closure pass — live webhook test.** Created a real `PendingPayment` via `POST /billing/subscribe`
  (using `createStubPaymentProvider`, which the app itself instantiates locally when no real Paymob
  credentials are configured — confirmed via `services/billing/from-env.ts`), then hand-signed webhook
  payloads with the documented dev fallback secret (`dev-only-stub-webhook-secret`, used only when
  `BILLING_WEBHOOK_SECRET` is unset) and posted them to `POST /webhooks/billing`:
  - Valid signature, matching event → `{"applied":true}`, subscription genuinely granted (`starter`
    plan, `ACTIVE`, confirmed in Postgres).
  - **Replay of the identical signed payload** → same response, but `Subscription.updatedAt`
    unchanged and no second `BillingEvent`/`CreditTransaction` row — confirmed idempotent, not just by
    reading the unique-constraint code but by observing the DB not move on replay.
  - **Valid signature, tampered `amountMicros`** (claimed 1 micro against a 29,990,000-micro pending
    payment) → `500 WEBHOOK_APPLY_FAILED`, plan NOT upgraded — `eventMatchesPending`'s cross-check
    against the server-created `PendingPayment` genuinely blocks a mismatched event even though the
    signature itself was valid (this specifically defends against a compromised/malicious provider
    integration or an edited-then-mismatched-signature scenario, not just replay).
  - **Valid signature, wrong `userId`** (claiming someone else's completed payment) → also
    `WEBHOOK_APPLY_FAILED`, no grant — confirms the match check includes the user, not just the
    amount/plan.
- **Pricing trust boundary**: confirmed live as well as in source — credit/subscription amounts come
  from server-side env config (`BILLING_<PLAN>_PRICE_MICROS`) or the verified webhook payload
  cross-checked against the server-created `PendingPayment`; the client-supplied checkout request
  never carries a price.
- **Dev-only billing gate**: `/billing/subscribe` and `/billing/credits/purchase` 404 in production
  unless a real payment provider is configured; when a provider *is* configured (as it is locally, via
  the stub), those routes only ever create a pending checkout, never grant credits directly.
- **Closure pass — Concurrency / TOCTOU on credit debit: live-tested, clean.** Set a disposable test
  account's `CreditLot.amountRemaining` to exactly 20 (the cost of a single `SECURITY`-only scan,
  confirmed via `POST /scans/quote`). Fired two concurrent `POST /scans` requests against **two
  different targets** (using the same target for both would have been masked by the free plan's
  `concurrentScanLimit=1`, which blocks a second concurrent scan regardless of credits — itself
  confirmed live as a structural race-prevention side effect worth noting). Result: one request
  succeeded (`201`, debited the 20 credits, balance → 0), the other failed cleanly with
  `402 INSUFFICIENT_CREDITS: 20 required, 0 available`. Verified directly in Postgres: exactly one
  `scan:create` debit in `CreditTransaction`, exactly one new `Scan` row, no negative balance, no
  orphaned scan/job for the losing request. No TOCTOU race exists in this path — the debit is
  effectively atomic under real concurrent load, not just by code inspection.
- **Real Paymob integration**: BLOCKED — no real merchant credentials available locally. Per
  `specs/005-production-hardening/tasks.md`, this is already tracked as an open item (T006) blocked
  on the same external dependency, not something this review can resolve.

## L. Security Findings

No new security (auth/authz/IDOR/admin/rate-limit/session/billing) finding was confirmed in either
pass. Two non-security findings surfaced during the closure pass's browser QA:

| ID | Severity | Component | Description | Status |
| --- | --- | --- | --- | --- |
| CLOSURE-INFO-1 | INFO (UI robustness, not a security defect) | `apps/web/app/(dashboard)/scan/[id]/page.tsx`, `.../reports/[id]/page.tsx` | Navigating to a scan/report id that is not yours (or doesn't exist) left the page on an infinite "Loading…" spinner instead of an error state — the backing API correctly returned 404 throughout, so **no data was ever leaked**, but the UI gave no feedback. Root cause: `getScan(scanId).then(...)`/`getReport(scanId).then(...)` had no `.catch()`, so a rejected promise silently left the loading state as `null` forever. | **FIXED** — both now catch the rejection and render the API's own error message, matching the existing pattern in `billing/receipts/[id]/page.tsx`. Regression test added and passing. See §M. |
| CLOSURE-INFO-2 | INFO (cosmetic) | `apps/web/app/(admin)/admin/plans/page.tsx` | A React "duplicate key" console warning appears on `/admin/plans` (`Table`'s row-cell array uses static string keys like `key="name"`/`key="state"` per cell rather than per-plan-scoped keys, though the consuming `Table` component actually re-keys by array index so this doesn't affect rendering correctness). | Not fixed — cosmetic dev-console warning only, no functional or security impact observed; noted for a future cleanup pass rather than spending review budget chasing a non-security issue further. |

For completeness, three previously-fixed issues (found and fixed by earlier work in this
repo, not by this session) were independently re-verified as genuinely fixed in current source:

| ID | Severity (historical) | Component | Description | Current status |
| --- | --- | --- | --- | --- |
| AUTH-CRIT-1 (prior) | Critical | OAuth account linking | An unverified local-password account could be silently absorbed by a later OAuth sign-in with the same email, letting an attacker who pre-registered a victim's email retain access after the victim "verifies" via OAuth | **CONFIRMED FIXED** — `oauth.service.ts`'s `resolveOAuthIdentity` nulls the password hash, marks email verified, and revokes all refresh tokens atomically on join |
| C3 (prior, PRODUCTION-READINESS docs) | Critical | JWT signing | A fallback/placeholder JWT secret could be used in production | **CONFIRMED FIXED** — `config/env.ts` requires a real 32+ char secret and throws at boot unless `ALLOW_INSECURE_DEV_SECRETS=true`, which itself throws if `NODE_ENV=production` |
| CRIT-1 (prior, billing) | Critical | Billing | Any authenticated user could mint free credits/subscriptions via `/billing/subscribe`/`/credits/purchase` in production | **CONFIRMED FIXED** — `makeDevTestOnlyGuard` 404s both routes in production unless a real payment provider is wired, and even then those routes only create a pending checkout |

No fixes were made by this review because no new defect was found that needed one.

## M. Bugs Fixed

**Closure pass — one real application fix (CLOSURE-INFO-1):**

- **Files changed**: `apps/web/app/(dashboard)/scan/[id]/page.tsx`,
  `apps/web/app/(dashboard)/reports/[id]/page.tsx`.
- **Root cause**: `useEffect(() => { void getScan(scanId).then(({scan}) => setHostname(...)) }, ...)`
  (and the identical shape in the reports page with `getReport`/`setReport`) had no `.catch()`. When
  the promise rejects — which it does on a 404, the exact response a cross-user or nonexistent scan id
  produces — nothing ever calls `setHostname`/`setReport`, so the component's `=== null` loading guard
  never clears and the page renders "Loading…" forever.
- **Implementation**: added a `.catch((err) => setError(err instanceof ApiError ? err.message : '...'))`
  to both effects and an `error !== null` render branch showing that message, copying the exact
  pattern already used in `billing/receipts/[id]/page.tsx` for the same class of per-id 404.
- **Automated evidence**: `pnpm --filter @webaudit/web exec tsc --noEmit` clean after the change. New
  Playwright spec `apps/web/tests/e2e/dashboard/scan-and-report-not-found.spec.ts` (2 tests) — passed
  2/2 in an isolated run (`npx playwright test tests/e2e/dashboard/scan-and-report-not-found.spec.ts
  --workers=1`, both `ok`, 47.9s). One earlier combined run showed 1 pass/1 timeout on the login step
  due to a transient Redis connectivity blip in the e2e harness itself (see below) — re-run in
  isolation immediately after confirmed both tests pass; this is harness/infra flakiness, not fix
  flakiness.
- **Manual evidence**: reproduced the bug live as User B navigating to User A's scan id (stuck
  "Loading…", confirmed via Playwright MCP snapshot + console showing the unhandled `ApiError: No such
  scan.`), applied the fix, hot-reloaded, and confirmed both `/scan/<id>` and `/reports/<id>` now
  render "Not found" / "No such scan." immediately for the same URL.
- **Regression check**: re-ran the full four-role browser walkthrough (§O) after the fix; no new
  console errors introduced on any page touched.

**Infrastructure interventions** (no application code touched), across both passes:
1. Restarted the `webaudit-postgres` Docker container after its host-side port forwarding entered a
   state where raw TCP connect succeeded but the Postgres wire protocol did not (Prisma consistently
   got `P1001 Can't reach database server` while `docker exec psql` and a raw Node TCP `connect`
   both succeeded — a Docker Desktop / Windows networking artifact). Restarting the container
   resolved it immediately.
2. Restarted the Next.js dev server after `apps/web` hit "Jest worker encountered 2 child process
   exceptions, exceeding retry limit" while compiling `/scan/[id]`, causing a one-time 500 on that
   route. **Closure pass follow-up**: ran a full production build (`pnpm --filter @webaudit/web run
   build`) — compiled successfully with zero errors across all 28 routes, including `/scan/[id]` and
   `/reports/[id]`. Combined with the page loading correctly on every subsequent navigation across the
   rest of this review (dozens of hits), this is now **NOT REPRODUCED AFTER CLEAN ENVIRONMENT**,
   consistent with dev-server-only flakiness rather than a code defect — stated at that confidence
   level, not as "verified fixed" (nothing was changed to fix it, because nothing reproducibly broken
   was found to fix).
3. **Closure pass** — the same class of Docker network-proxy flakiness recurred twice more: (a) the
   `webaudit-redis` container's host-side forwarding intermittently timed out for the e2e Playwright
   harness's own Redis client (`ETIMEDOUT` from `ioredis`) even though `docker exec redis-cli ping`
   succeeded throughout — resolved by restarting the container; (b) running `next build` (for the
   production-build check in item 2) while a manually-started `next dev` was still running against the
   same `apps/web/.next` directory corrupted that dev server's build cache (`ENOENT
   routes-manifest.json`) — resolved by stopping both, clearing `.next`, and starting a single clean
   instance. Neither is an application defect; both are documented here because they recurred enough
   in this session to be a genuine operational hazard on this specific Windows/Docker Desktop host,
   independent of anything in the codebase.
4. Repeatedly found multiple duplicate/stray dev-server processes (API and web) left running
   concurrently from earlier manual restarts in this and prior sessions, competing for the same ports
   and the same Prisma-engine binary file — cleaned up each time before testing, and left the
   environment with exactly one healthy instance of each service (API on 3001, web on 3010) at the
   end of this review.

## N. Test Evidence

**Closure pass — automated suites, run for the first time this review:**

| Command | Test files | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- | --- |
| `pnpm test:adverse` (`vitest run --project adverse --passWithNoTests --no-file-parallelism`) | 62 | 851 | 850 | **0** | 1 |
| `pnpm exec vitest run --project unit --no-file-parallelism` | 181 | 1204 | 1204 | **0** | 0 |
| **Total** | **243** | **2055** | **2054** | **0** | **1** |

Run against the isolated `webaudit_test` Postgres database and the shared Redis instance, serially per
AGENTS.md ("run shared DB/Redis suites serially"), not overlapping with this session's own live dev-
server testing (which used the separate `webaudit` database).

The one skip (`packages/capability-sdk/tests/adverse/context-confinement.test.ts` →
`'refuses a file symlink that leaves the workspace'`) is a documented, intentional
`it.skipIf(!FILE_SYMLINKS)` — creating a *file* symlink on Windows requires elevation/Developer Mode
the test itself probes for at load time; the sibling test covering the identical escape vector via a
directory junction (no elevation needed) passed. Not a coverage gap.

Several tests produce intentional stderr noise as part of their own fault-injection design
(`enqueue-failure-refund.test.ts` simulating `ECONNREFUSED`, `workspace.test.ts` simulating a
teardown exception, `billing-webhook-concurrent.test.ts` firing 10 concurrent duplicate webhooks to
prove idempotency via the same `BillingEvent` unique-constraint mechanism this review also proved
live in §K) — verified by reading each test's source, not assumed from log tone; every one of those
parent tests passed.

**No test or application code was modified to make anything pass** — nothing failed. The one
application fix made this review (§M, CLOSURE-INFO-1) was found via manual browser testing, not by a
failing automated test; a regression test was added for it afterward.

New regression test added this review: `apps/web/tests/e2e/dashboard/scan-and-report-not-found.spec.ts`
(2 tests) — 2/2 passed in an isolated run.

**Original pass — live evidence in lieu of automated test counts** (retained from the initial pass,
now supplemented rather than replaced by the automated numbers above):

- Registration: 5 live requests (valid ×2, duplicate, case-duplicate, mass-assignment) — all behaved
  as expected, confirmed against DB state directly (`isOperator=false`, standard 50-credit grant,
  `emailVerifiedAt=null` despite the mass-assignment attempt).
- Login: 4 live requests (2 valid, unknown-email, wrong-password).
- Auth-bypass: 6 live requests against 3 protected routes with no/malformed/forged tokens — all 401.
- CORS: 3 live preflight/simple requests (unknown origin, approved origin, credentialed unknown
  origin).
- IDOR (REST): 5 live cross-user requests across target/scan/report/issues/cancel — all 404.
- IDOR (WebSocket): 4 live subscribe attempts — owner/cross-user/no-token/nonexistent-scan.
- Admin isolation: 5 live requests (anon, normal-user ×2, admin ×3, post-revocation retry).
- Session: 6 live refresh/logout requests covering rotation, reuse-within-grace,
  reuse-after-grace/family-revocation, and post-logout refresh.
- Rate limit: driven to and past the shared strict-bucket boundary through the above; 429 +
  `Retry-After` + `RateLimit-Policy` headers confirmed present on the limited response.

## O. Browser QA Evidence

**Original pass:**
- Navigated to `/login` as an anonymous browser session; observed browser-autofill data from a
  **prior, unrelated session** pre-populating the email/password fields (`fullstack-check@example.com`
  / a visible password) — this is local Chromium profile autofill, not application state, but is
  noted because it means this shared browser profile persists credentials across sessions; not a
  webapp vulnerability, but worth the user's awareness if this profile is ever used somewhere
  screen-shared or recorded.
- Logged in as User A through the real UI, submitted a real scan (URL target, Security area, 30
  credits) via the actual "Accept and run" flow, and captured the resulting scan id from network
  traffic.
- Observed one real frontend defect during this flow: `/scan/[id]` returned a page-level 500 due to
  the Next.js dev-server compile-worker crash noted in §M; recovered after a clean dev-server
  restart, page then loaded correctly (200) for the owning user.

**Closure pass — full four-role walkthrough, pages actually visited:**

| Role | Pages visited | Result |
| --- | --- | --- |
| Anonymous | `/scan`, `/admin/users` | Both redirect to `/login?next=...` before any dashboard content renders; network trace confirms `GET /auth/me` and `POST /auth/refresh` both 401 first, no protected data in any response, no console errors beyond the expected 401s |
| User A | `/scan`, `/scan/[id]` (own, real scan), `/report`, `/fixes`, `/readiness`, `/billing`, `/usage`, `/settings` | All loaded cleanly, zero console errors on any page; `/billing` correctly reflected the "Starter" plan and 320-credit balance produced by the live webhook test in §K — confirms the UI renders server-computed state, not client-cached/trusted values |
| User B | `/scan/<User A's real scan id>` (direct URL, cross-user) | **Found CLOSURE-INFO-1 here** (infinite spinner) — backing API correctly 404'd throughout (network trace: `GET /scans/<id> → 404 "No such scan."`), confirmed **no data leakage**, but the UI gave no feedback until fixed (§M); after the fix, same URL immediately shows "Not found" / "No such scan." Also navigated directly to `/admin/users` while authenticated as a normal (non-operator) user: silently redirected to `/scan`, zero admin content ever rendered, zero console errors — vertical-escalation protection holds at the UI layer too, not just the API |
| Admin (promoted test account) | `/admin`, `/admin/users`, `/admin/scans`, `/admin/queue`, `/admin/providers`, `/admin/plans`, `/admin/capabilities`, `/admin/log`, `/admin/billing`, `/admin/settings` (all 9 admin sub-pages plus the overview) | All loaded with a real operator session; zero console errors except CLOSURE-INFO-2 (the cosmetic React key warning on `/admin/plans`, §L) |

No infinite loaders remained after the CLOSURE-INFO-1 fix; no redirect loops, hydration errors, or
broken navigation observed on any page in either pass. The `/reports/[id]` fix (identical bug) was
verified the same way as `/scan/[id]`.

## P. Remaining Risks / Not Completed

Updated after the closure pass — everything struck through below was closed; what remains is either a
genuine external-credential blocker or a narrowly-scoped residual gap with a stated reason:

- ~~Full browser walk of every dashboard section for anonymous/User A/User B/Admin~~ — **closed**, §O.
- ~~Concurrency/TOCTOU testing on credit debit~~ — **closed**, live-tested clean, §K.
- ~~Full general (120/min) rate-limit boundary testing~~ — **closed**, §F.
- ~~Re-running the repo's existing automated adverse/unit/integration test suites~~ — **closed**, §N.
- ~~Password reset / change-password end-to-end~~ — **closed**, §C.
- ~~GitHub OAuth state/CSRF/callback validation~~ — **closed as far as locally possible**, §Q; the real
  external OAuth round-trip remains blocked on real credentials.
- ~~A confirmed root-cause (rather than a clean-restart workaround) for the one-time Next.js
  `/scan/[id]` 500~~ — **downgraded to NOT REPRODUCED AFTER CLEAN ENVIRONMENT**: a production build
  compiled with zero errors, and the route loaded correctly on every one of the dozens of subsequent
  navigations across this review. Not claimed as "root-caused and fixed" because no defect was ever
  isolated to fix — only that it did not recur under a clean environment.

**Genuinely still open:**
- Real Paymob payment flow (webhook + payment-return) with live provider traffic — BLOCKED, external
  credentials.
- The live HTTP archive-upload route (`POST /scans/upload`) end-to-end — BLOCKED locally; its R2
  client endpoint is hardcoded to Cloudflare R2 with no env override (confirmed by reading
  `apps/api/src/services/storage/uploads.ts`), a deliberate anti-SSRF design this review did not
  modify. The archive-guard logic itself (path traversal/absolute-path/symlink/oversize/malformed ZIP
  handling in `packages/safe-archive`) **is** covered locally by its own adverse suite, which ran
  clean in §N — only the live HTTP round-trip through real object storage is blocked.
- Confirming the production R2 bucket itself has no public-read/list policy independent of the
  application — an infrastructure/bucket-ACL fact, not something visible from source or reachable
  without real R2 credentials.
- SQL injection / broader input-fuzzing beyond the mass-assignment, malformed-login, and the existing
  `auth-sql-injection.test.ts` suite (which ran clean in §N) — no additional live fuzzing corpus was
  run beyond what that suite already covers.
- The real external GitHub OAuth round-trip (token exchange, real repo listing/zipball retrieval) —
  BLOCKED, no GitHub OAuth app credentials configured locally.
- Confirming `trust proxy`'s `X-Forwarded-For` handling is actually safe **in the real production
  deployment** (i.e., that the real reverse proxy strips/overwrites any client-supplied header) — this
  review proved the mechanism's local topology-dependent bypass (§F) but cannot verify the production
  proxy's own configuration from here.

## Q. External Blockers / Environment Notes

- **Closure pass — GitHub OAuth, local verification.** `GET /auth/oauth/github/start` returns `501 Not
  Implemented` when no GitHub OAuth app is configured (confirmed live) — fails safely rather than
  proceeding with an insecure or crashing flow. `GET /auth/oauth/github/callback` with no query
  params returns `400`. The same callback with a forged `state` and no matching `OAUTH_TX_COOKIE`
  (which only a real `/start` call sets) returns `OAUTH_STATE_INVALID` — live proof the state/CSRF
  check is not merely present but actually rejects a callback that doesn't own a valid transaction.
  **BLOCKED — the real external round-trip** (actual GitHub redirect, code exchange, token storage
  against a real GitHub account) requires a real GitHub OAuth app's client id/secret, not available
  locally.
- **BLOCKED — Real Paymob credentials**: not available locally; billing/webhook code reviewed, traced,
  and (closure pass) live-tested end-to-end against the repo's own dev-only stub provider — see §K.
  The stub proves the application-side logic (signature order, idempotency, cross-validation); it
  cannot prove anything about Paymob's actual wire format or account-specific behavior.
- **BLOCKED — Real Sentry/monitoring verification**: out of scope for this review's focus (auth/
  authz), not investigated.
- **Stale documentation found**: `AUTH_AND_SCALE_AUDIT.md` (2026-09-11) claims gaps — no `name`
  field, no working profile update, no working change-password, no real email delivery — that are
  all now contradicted by current source (`PATCH /auth/me`, `POST /auth/change-password`, SMTP/Resend
  mailer). Do not cite that document going forward without re-verifying its claims.
- `PROJECT_MAP.md`'s note that production-hardening work (`specs/005-production-hardening/`) is
  "planning only as of 2026-09-12; nothing implemented" is **also stale** — `tasks.md`'s own status
  table and subsequent commits (`947f498`, `ae9537c`) show the large majority of that 45-task plan
  completed; genuinely open items are limited to real-Paymob-credential testing (T006), load testing
  (T040), and a final security-hardening/rollout pass (T041-T045). Recommend the user update
  `PROJECT_MAP.md` to reflect this.
- **Local environment instability observed and resolved** (see §M): both the API and the web dev
  server needed a clean restart during this session due to Windows/Docker networking and Next.js
  dev-server flakiness unrelated to application code. Multiple stray/duplicate dev-server processes
  were found running concurrently (a residue of prior manual restarts in earlier sessions, not caused
  by this review) and were cleaned up as part of getting a single, healthy instance of each service
  for testing.

## R. Final Verification Matrix (updated after closure pass)

| Area | Code Review | Automated | API | Browser | DB Evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Registration | ✓ | ✓ | ✓ | ✓ | ✓ | VERIFIED LOCALLY |
| Login | ✓ | ✓ | ✓ | ✓ | ✓ | VERIFIED LOCALLY |
| Password reset | ✓ | ✓ (existing suite) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Change password | ✓ | ✓ (existing suite) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Sessions (rotation/reuse/logout) | ✓ | ✓ (existing suite) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Authorization (ownership) | ✓ | ✓ | ✓ | ✓ | ✓ | VERIFIED LOCALLY |
| REST IDOR | ✓ | ✓ (`reports-issues-idor` + others) | ✓ | ✓ | — | VERIFIED LOCALLY |
| WebSocket IDOR | ✓ | ✓ (`realtime-authorisation`) | ✓ | — | — | VERIFIED LOCALLY |
| Admin isolation | ✓ | ✓ (`admin-authz`, 57 sub-tests) | ✓ | ✓ | — | VERIFIED LOCALLY |
| Admin revocation | ✓ | — | ✓ | — | ✓ | VERIFIED LOCALLY |
| Strict rate limit | ✓ | ✓ (`auth-rate-limiting`) | ✓ | — | — | VERIFIED LOCALLY |
| General rate limit | ✓ | — | ✓ | — | — | VERIFIED LOCALLY |
| CORS | ✓ | ✓ (`auth-cors`) | ✓ | — | — | VERIFIED LOCALLY |
| Security headers | ✓ | — | ✓ | — | — | VERIFIED LOCALLY |
| Input/adverse security (SQLi, mass-assignment, malformed input) | ✓ | ✓ (`auth-sql-injection`, `auth-input-validation`, `billing-mass-assignment`) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Credit concurrency | ✓ | ✓ (`credits.concurrency`, `checkout-lock`, `credits-debit-refund-race`, + 1 new live test) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Billing local security (signature, idempotency, cross-validation) | ✓ | ✓ (`billing-webhook-concurrent` + others) | ✓ | — | ✓ | VERIFIED LOCALLY |
| Paymob real provider | — | — | — | — | — | BLOCKED — real Paymob credentials required |
| Archive security (guard logic: traversal/absolute-path/symlink/oversize/malformed) | ✓ | ✓ (`safe-archive` adverse suite) | — | — | — | VERIFIED LOCALLY |
| Archive security (live HTTP upload route end-to-end) | ✓ | — | — | — | — | BLOCKED — R2 endpoint is hardcoded, no local S3-compatible override without editing app code |
| GitHub local authorization (state/CSRF, token storage/redaction, ownership binding) | ✓ | — | ✓ | — | — | VERIFIED LOCALLY |
| GitHub real OAuth round-trip | — | — | — | — | — | BLOCKED — real GitHub OAuth app credentials required |
| Full dashboard QA (all roles) | — | — | ✓ | ✓ | — | VERIFIED LOCALLY |

Two areas remain explicitly BLOCKED, both on external credentials this environment does not have and
this review cannot fabricate: real Paymob provider traffic, and the real GitHub OAuth round-trip. The
live R2 archive-upload route is also blocked, for an infrastructure reason (no configurable local
S3-compatible endpoint) rather than a credentials gap — its underlying guard logic is independently
verified via the automated suite. Everything else originally marked NOT TESTED, PARTIAL, or CODE
REVIEWED ONLY has been closed to VERIFIED LOCALLY with concrete runtime evidence (live HTTP/WebSocket
requests, database state inspection, browser automation, or the automated test suites run in this
pass) — none is asserted from source reading alone.

---

*Redaction note: no password hashes, tokens, encryption keys, or database credentials are reproduced
in this document. JWTs quoted above were issued to disposable local test accounts created solely for
this review and are already expired or revoked at the time of writing.*
