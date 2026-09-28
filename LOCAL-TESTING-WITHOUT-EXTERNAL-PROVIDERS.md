# WebAudit AI — Running & Testing Everything Without Real Paymob or Real AI

This explains, plainly, how the project already runs today, why it does **not** need real Paymob or
real AI provider credentials to be fully tested end-to-end, how admin credit-granting already works,
and what to change (nothing structural — just env vars) to start testing the whole product right now.
No project plan here — just the current state, explained.

---

## 1. The short version

**You do not need to do anything to "skip" Paymob or AI.** The app already runs, by default, in this
exact repo checkout, without either:

- **AI**: `.env` already has `AI_MODE="fixtures"`. Every scan runs deterministic, canned, fixture-based
  results instead of calling a real AI provider. Zero AI spend, zero AI API key required.
- **Payments**: no `PAYMOB_*` variables are set in `.env`. The billing code detects this and
  automatically uses a built-in **stub payment provider** instead of real Paymob — it mints fake
  checkout URLs and never touches Paymob's servers. Zero Paymob account required.

Both of these are **not test-only shortcuts you need to build** — they are the project's own
documented, intentional local-development behavior, already wired in, already working, already used
throughout this project's own automated test suite and every manual test session so far.

What you're missing right now to actually *use* it: **the app processes aren't running.** See §7.

---

## 2. How the AI side actually works (and why it's already safe to test)

- Every scan runs a "code-layer" (deterministic, no AI) pass first, then an "AI layer" pass for
  judgment calls a deterministic check can't make (e.g., writing quality, honest wording).
- `AI_MODE=fixtures` (already set in `.env`) makes the AI layer read from **pre-recorded fixture
  responses** instead of calling any real provider (OpenAI/Anthropic/whatever `packages/ai-executor`
  is configured for). This is enforced by the project's own constitution — automated tests are
  **required** to run this way; live-provider spend in a test is treated as a bug, not a feature.
- Result: every scan you run locally right now already produces full, complete results — score,
  issues, fix suggestions, everything — with **zero real AI calls and zero AI cost**, using the exact
  same code path production will use, just with fixture data standing in for the provider response.
- There is nothing to "disable" here. It's already off. If you ever wanted to point it at a real
  provider, that's a separate `.env` addition (`AI_MODE` + provider keys) — not something this document
  needs to cover, since you explicitly don't want that right now.

## 3. How the payment side actually works (and why it's already safe to test)

- Real code path: `apps/api/src/services/billing/from-env.ts` builds the "payment provider" the whole
  billing system talks to. It looks for three env vars: `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`,
  `PAYMOB_INTEGRATION_ID`.
- **None of them are set in this repo's `.env`.** When all three are empty and the app isn't running in
  production mode, the code automatically falls back to `createStubPaymentProvider()` — a real,
  checked-in, intentional development stand-in (`apps/api/src/services/billing/stub-payment-provider.ts`),
  not a mock only used in tests.
- What the stub does: it creates a fake "checkout URL" instantly (no real Paymob API call), and it can
  process fully realistic **webhook events** (`payment.succeeded`, `payment.failed`,
  `subscription.cancelled`, `refund.succeeded`) — signed with a real HMAC signature, verified by the
  exact same signature-checking code a real Paymob webhook would go through — so the *entire* billing
  pipeline (checkout → webhook → credit grant/subscription activation → receipt) is exercised for
  real, just without a real bank/payment gateway on the other end.
- This was independently verified working during this project's security review: a real HTTP checkout
  request, a real signed webhook call, real database state changes (subscription activated, credits
  granted), replay-safety (sending the same webhook twice does not double-grant), and tamper-detection
  (a webhook claiming a different amount than was quoted gets rejected) — all proven live against this
  stub, not assumed from reading the code.
- **One thing you do need to set**, if you want to test the *checkout* flow specifically (subscribing
  to a plan, or buying extra credits through the UI) rather than just granting credits as admin: the
  price env vars. Without them, `/billing/subscribe` and `/billing/credits/purchase` refuse with
  "price is not configured" — this is a deliberate safety check (never invent a price), not a bug.
  Add to `.env` (any numbers you like, in micros — 1,000,000 micros = 1 currency unit):
  ```
  BILLING_STARTER_PRICE_MICROS="9990000"
  BILLING_PRO_PRICE_MICROS="29990000"
  BILLING_BUSINESS_PRICE_MICROS="99990000"
  BILLING_CREDIT_PRICE_MICROS="100000"
  ```
  If you only plan to test using admin-granted credits (§4) and never touch the checkout UI at all,
  you can skip this entirely.

## 4. How admin credit-granting already works

There is a real, already-built admin endpoint for exactly what you described — an operator manually
giving a user credits, no payment involved at all:

```
POST /admin/users/:id/credits
Authorization: Bearer <an operator's access token>
Content-Type: application/json

{
  "amount": 500,
  "kind": "PLAN",        // or "PURCHASED"
  "expiresAt": null,     // or an ISO datetime string
  "reason": "manual grant for testing"
}
```

- `kind: "PLAN"` credits behave like the free monthly grant (can be configured to expire).
- `kind: "PURCHASED"` credits behave like a real credit-pack purchase (typically non-expiring).
- This is gated by the same admin/operator check as every other `/admin/*` route — only a user with
  `isOperator = true` can call it. There's already an admin UI page for this too
  (`/admin/users`, per `apps/web/app/(admin)/admin/users/page.tsx`) — find the user, adjust credits
  from the row action, no API call needed by hand if you'd rather click through the UI.
- **How to make your own account an operator**, for local testing (no UI for this part — it's a
  direct, one-time database flip, standard practice for this project's own local testing so far):
  ```sql
  UPDATE "User" SET "isOperator" = true WHERE email = 'your-test-account@example.com';
  ```
  Run it via:
  ```bash
  docker exec webaudit-postgres psql -U webaudit -d webaudit -c \
    "UPDATE \"User\" SET \"isOperator\"=true WHERE email='your-test-account@example.com';"
  ```

## 5. What this means for testing "the whole flow"

With `AI_MODE=fixtures` (already on) and no Paymob configured (already the case), here is what already
works end-to-end, right now, with zero external accounts:

| Flow | Works without AI/Paymob? | Notes |
| --- | --- | --- |
| Register / login / email verification | ✓ | Verification email prints to the server console (no real email provider needed either, unless you configure one) |
| Submit a scan (URL, any module mix) | ✓ | Full fixture-based results, real scoring, real issue list |
| View report, fixes, readiness | ✓ | All real UI, real data, fixture-sourced findings |
| Free-tier credits | ✓ | Every new account gets a real free grant automatically |
| Admin granting extra credits | ✓ | §4 above — fully real, no payment involved |
| Subscribing to a paid plan via the UI | ✓ (if §3's price vars are set) | Uses the stub provider — no money moves, no Paymob account |
| Buying a credit pack via the UI | ✓ (if §3's price vars are set) | Same |
| Real webhook / receipt / refund behavior | ✓ | Provably correct against the stub — see §3 |
| Anything requiring a *real* AI-written judgment call unique to your prompt | ✗ | By design — fixtures are canned, not generative. Not needed for testing product flow/UI/business logic. |
| Anything requiring a *real* bank charge / real Paymob dashboard entry | ✗ | By design — nothing here talks to Paymob's real servers |

If your goal is testing the **product** — the flows, the UI, the credits/roles/admin logic, the
report/fix loop — none of that ✗ list matters. Everything you'd actually click through as a user or
admin already works today.

## 6. Current `.env` state (this checkout, redacted)

```
DATABASE_URL="postgresql://webaudit:***@localhost:5442/webaudit?schema=public"
REDIS_URL="redis://localhost:6389"
AI_MODE="fixtures"                 # <- AI already off, fixtures only
ENCRYPTION_KEY="***"
JWT_ACCESS_SECRET="***"
JWT_REFRESH_SECRET="***"
WORKSPACE_BASE_DIR="C:/Users/Yousef/Desktop/Projects/motakamel/var/scan-workspaces"
WEB_URL="http://localhost:3010"
```

Notably absent (on purpose, for local dev): `PAYMOB_API_KEY`, `PAYMOB_HMAC_SECRET`,
`PAYMOB_INTEGRATION_ID` (→ stub payment provider, automatic), `EMAIL_TRANSPORT` (→ verification/reset
emails print to the console instead of sending), `BILLING_*_PRICE_MICROS` (→ needed only if you want
to click through the checkout UI itself, see §3).

## 7. How to actually start everything and test it

**Infrastructure (Docker — Postgres, Redis, pgbouncer):**
```bash
docker ps    # if these three aren't "Up", run: pnpm services:up
```

**API** (port 3001):
```bash
cd apps/api
pnpm run start
```

**Worker** (no HTTP port — this is what actually *processes* a submitted scan; without it, scans stay
queued forever):
```bash
cd apps/worker
pnpm run start
```

**Web app** (port 3010):
```bash
cd apps/web
pnpm exec next dev --port 3010
```

Then open **http://localhost:3010**, register a normal account (free 50 credits, no card, real
signup flow), submit a scan against any URL, and watch it complete for real — fixture-backed, but a
completely real pass through auth → credits → queue → worker → report → UI.

To test admin/credits/billing specifically: promote your account per §4, log in, visit `/admin`, and
either grant credits directly or (if you added the price vars from §3) walk through `/billing` as a
normal user.

## 8. Going toward a real server later (not now — just so it's written down)

None of the above changes anything about what's needed for a *real* production deployment — real
Paymob credentials and a real AI provider are still required before charging real money or running
real AI judgment calls in production. This document only covers what's needed to fully exercise the
product **locally, for testing, right now** — that work is unaffected by, and doesn't need to wait on,
either of those two external accounts.
