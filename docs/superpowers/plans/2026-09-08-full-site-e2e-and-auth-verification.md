# Full-Site E2E, Auth-Flow, and Manual Testing Coverage — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the real, measured gap between what this product's UI *can* do (23 real pages, a real
auth system, a real admin console, a real audit pipeline) and what has *browser-driven* end-to-end
coverage today (3 specs: accessibility, zero-external-requests, and one API-only journey with no
browser UI at all) — with real Playwright specs, a documented manual/Playwright-MCP checklist for what
automation genuinely cannot cover (GitHub OAuth against a real app, real email delivery), and one doc
that explains the whole testing pyramid so a new contributor does not have to reverse-engineer it.

**Architecture:** One shared e2e fixture (`apps/web/tests/e2e/support/stack.ts`) boots a real
`apps/api` + `apps/worker` in-process (the same `startApi`/`startWorker` composition
`first-audit.spec.ts` already uses) against the real test database, and a real built-and-started
`apps/web` (the same `startServer` `harness.ts` already uses for the visual suite) — giving every spec
in this plan a real browser driving a real frontend making real network calls to a real backend, which
no existing spec combines today. Every phase after Phase 0 is real Playwright specs built on that one
fixture, organized by subsystem into their own subdirectories under `apps/web/tests/e2e/` (auth,
onboarding, dashboard, admin) so files that change together live together, per this project's own
`packages/` convention. A manual/Playwright-MCP checklist (Phase 5) covers what cannot be scripted at
all. A README (Phase 6) is the map tying unit/contract/integration/adverse/visual/e2e/manual together.

**Tech Stack:** `@playwright/test` (already a dependency, already has a `playwright.config.ts`),
TypeScript, Prisma test-DB helpers, this repo's existing `startApi`/`startWorker`/`startServer`
functions — no new tooling.

**Spec:** No formal spec.md — this plan is scoped directly from a real, reproducible gap found live
during manual testing on 2026-09-08 (see "What's actually broken today" below) plus the user's own
explicit ask: full auth-flow verification for both account types, full site E2E coverage, a manual/
Playwright-MCP checklist, tests organized in their own folder, and docs for how it all fits together.

## What's actually broken today (found live, 2026-09-08, fixed as part of standing the app up)

Two real, reproducible bugs — both already fixed in the running dev stack, but **neither has a
regression test**, so both could silently return:

1. **CORS allowlist defaults to `http://localhost:3000` only** (`apps/api/src/app.ts`'s
   `corsAllowlist()`), read from `WEB_URL`. Any frontend running on a different port (this session's
   own dev stack ran on 3010 because 3000 was already taken by an unrelated process) gets silently
   refused by the browser — no CORS header, no error surfaced to the API, the frontend's `fetch` just
   fails and `lib/api.ts`'s catch-all renders "Something went wrong. Try again." with zero information
   about the real cause. **No test asserts the login form surfaces a real, specific error, or that a
   configured `WEB_URL` actually appears in `Access-Control-Allow-Origin`.**
2. **`apps/worker` has no default `WORKSPACE_BASE_DIR`** and refuses to boot without one set — true
   by design (`installTerminalTeardown`'s own guard), but `.env.example` ships the key with an empty
   value and nothing before this session's own dev-stack boot had ever exercised that failure path
   outside a unit test.

Neither is a task in this plan by itself (both are already fixed in `.env`) — but Phase 1's login
spec and Phase 0's stack fixture both assert the underlying guarantees directly, so a regression in
either would fail a real test instead of only being caught by a human clicking "Sign in" again.

## Global Constraints

- Every new spec lives under `apps/web/tests/e2e/`, in a subdirectory named for its subsystem
  (`auth/`, `onboarding/`, `dashboard/`, `admin/`) — never flat files dropped next to the existing
  three.
- Every spec uses `support/stack.ts`'s `startStack()`/`stopStack()` — no spec boots its own
  `startApi`/`startWorker`/`startServer` trio from scratch. `accessibility.spec.ts` and
  `no-external-requests.spec.ts` are NOT migrated in this plan (they don't need a logged-in session or
  API calls; touching them is out of scope and risks the exact `next build` race
  `playwright.config.ts`'s own `workers: 1` note already describes fixing once).
- `AI_MODE=fixtures` for every spec — this project's own non-negotiable #4 ("Provider calls are always
  stubbed"). No spec may set `AI_MODE` to anything else.
- Money in integer micros, never floats — inherited, not touched by this plan, but any spec asserting
  a credit/cost figure must assert the integer, never a derived float.
- Every spec that logs in must go through the real `/login` form (`page.fill`/`page.click`), not a
  direct `POST /auth/login` API call with a manually-injected `localStorage` token — the whole point
  of this plan is browser-driven coverage of the auth flow itself, not a shortcut around it.
- GitHub OAuth login (`GITHUB_OAUTH_CLIENT_ID`/`_SECRET` are empty in `.env.example`) and real email
  delivery (`RESEND_API_KEY` unset, mail is console-logged in dev) cannot be exercised by an automated
  spec without real third-party credentials this repo does not have — both are Phase 5 (manual/
  Playwright-MCP) items, not Phase 1 specs. Do not fabricate a mock OAuth provider or a fake mail
  sink to force automated coverage of either; that would test the mock, not the real integration.

---

### Task 1: The shared e2e stack fixture

**Files:**
- Create: `apps/web/tests/e2e/support/stack.ts`
- Test: `apps/web/tests/e2e/support/stack.spec.ts` (new — proves the fixture itself works before
  anything else depends on it)

**Interfaces:**
- Produces: `startStack(): Promise<Stack>` where
  `interface Stack { readonly apiBaseUrl: string; readonly webBaseUrl: string; readonly db: PrismaClient; stop(): Promise<void>; }`
- Consumes: `startApi`/`ApiService` from `@webaudit/api`, `startWorker`/`WorkerService` from
  `@webaudit/worker`, `startServer`/`ServerHandle` from `../../visual/harness.js` (the same three
  functions `first-audit.spec.ts` and `harness.test.ts` already use — no new boot mechanism).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/e2e/support/stack.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from './stack.js';

let stack: Stack;

test.beforeAll(async () => {
  stack = await startStack();
}, 180_000);

test.afterAll(async () => {
  await stack.stop();
});

test('boots a real api, worker, and web frontend that can reach each other', async ({ page }) => {
  const apiHealth = await page.request.get(`${stack.apiBaseUrl}/health`);
  expect(apiHealth.ok()).toBe(true);

  await page.goto(stack.webBaseUrl);
  await expect(page).toHaveTitle(/WebAudit/i);

  // The real regression this fixture exists to catch: a frontend that can't
  // reach its own API because of a CORS/WEB_URL mismatch renders the login
  // page fine (it's static) but the login FORM fails silently. Prove the
  // preflight the browser would send is actually allowed.
  const preflight = await page.request.fetch(`${stack.apiBaseUrl}/auth/login`, {
    method: 'OPTIONS',
    headers: {
      Origin: stack.webBaseUrl,
      'Access-Control-Request-Method': 'POST',
    },
  });
  expect(preflight.headers()['access-control-allow-origin']).toBe(stack.webBaseUrl);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/support/stack.spec.ts`
Expected: FAIL — `Cannot find module './stack.js'` (`stack.ts` does not exist yet).

- [ ] **Step 3: Write the fixture**

```typescript
// apps/web/tests/e2e/support/stack.ts
/**
 * The one shared full-stack fixture every spec in tests/e2e/{auth,onboarding,
 * dashboard,admin}/ boots through. Combines what first-audit.spec.ts already
 * does (real startApi/startWorker, in-process) with what harness.ts's
 * startServer already does (a real `next build` + `next start` child
 * process) so a spec gets a real browser driving a real frontend that makes
 * real network calls to a real backend — no existing spec combines all
 * three before this file.
 */
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@webaudit/api/prisma-client';
import { startApi, type ApiService } from '@webaudit/api';
import { startWorker, type WorkerService } from '@webaudit/worker';
import { startServer, type ServerHandle } from '../../visual/harness.js';

const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';

const WEB_DIR = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_PORT = 4400;

export interface Stack {
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
  readonly db: PrismaClient;
  stop(): Promise<void>;
}

const TABLES_TO_CLEAR = [
  'CreditAllocation',
  'CreditTransaction',
  'CreditLot',
  'VerificationAttempt',
  'Issue',
  'ModuleResult',
  'AiInvocation',
  'CapabilityExecution',
  'CapabilityPlan',
  'Capability',
  'ReadinessVerdict',
  'DesignIntent',
  'Scan',
  'TargetVerification',
  'Target',
  'Subscription',
  'RefreshToken',
  'EmailToken',
  'OAuthIdentity',
  'User',
  'AuditLogEntry',
  'ProviderChainEntry',
] as const;

async function resetDb(db: PrismaClient): Promise<void> {
  const list = TABLES_TO_CLEAR.map((t) => `"${t}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  await db.plan.upsert({
    where: { id: 'free' },
    create: {
      id: 'free',
      name: 'Free',
      monthlyCredits: 50,
      creditsRecur: false,
      allowedInputTypes: ['URL'],
      allowLoadGeneration: false,
      allowReadinessPass: false,
      allowCreditPurchase: false,
      allowCustomCapability: false,
      concurrentScanLimit: 1,
      queuePriority: 40,
      retentionDays: 7,
    },
    update: {},
  });
}

export async function startStack(): Promise<Stack> {
  process.env['AI_MODE'] = 'fixtures';
  process.env['WORKSPACE_BASE_DIR'] = mkdtempSync(path.join(tmpdir(), 'webaudit-e2e-'));

  const db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } }, log: ['error'] });
  await resetDb(db);

  const api: ApiService = await startApi({ db, port: 0, installSignalHandlers: false });
  const apiBaseUrl = `http://127.0.0.1:${String(api.port)}`;

  const worker: WorkerService = startWorker({
    connection: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
      maxRetriesPerRequest: null,
    },
    db,
    installSignalHandlers: false,
  });

  // The built frontend needs to know the API's real (ephemeral) port, and
  // NEXT_PUBLIC_* is inlined at BUILD time — this env var must be set before
  // `startServer`'s `next build` runs, not after.
  process.env['NEXT_PUBLIC_API_URL'] = apiBaseUrl;
  const webBaseUrl_ = `http://localhost:${String(WEB_PORT)}`;
  process.env['WEB_URL'] = webBaseUrl_;
  const web: ServerHandle = await startServer(WEB_DIR, WEB_PORT);

  return {
    apiBaseUrl,
    webBaseUrl: web.url,
    db,
    async stop() {
      web.close();
      await worker.shutdown('e2e stack teardown');
      await api.shutdown('e2e stack teardown');
      await db.$disconnect();
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/support/stack.spec.ts`
Expected: PASS. This step also does a real `next build`, so it is slow (60-90s) — this is expected
and matches `harness.test.ts`'s own "T128 mechanism check" build time.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/support/stack.ts apps/web/tests/e2e/support/stack.spec.ts
git commit -m "test(e2e): add the shared full-stack fixture every subsequent e2e spec boots through"
```

---

### Task 2: The shared auth helper

**Files:**
- Create: `apps/web/tests/e2e/support/auth.ts`
- Test: `apps/web/tests/e2e/support/auth.spec.ts`

**Interfaces:**
- Consumes: `Stack` from Task 1.
- Produces:
  - `registerAndVerify(stack: Stack, creds: { email: string; password: string }): Promise<void>`
  - `loginViaUi(page: Page, webBaseUrl: string, creds: { email: string; password: string }): Promise<void>`
  - `promoteToOperator(stack: Stack, email: string): Promise<void>`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/e2e/support/auth.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from './stack.js';
import { registerAndVerify, loginViaUi } from './auth.js';

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack();
}, 180_000);
test.afterAll(async () => stack.stop());

test('registerAndVerify + loginViaUi lands on the real dashboard', async ({ page }) => {
  const creds = { email: 'helper-check@example.com', password: 'correct-horse-battery-staple' };
  await registerAndVerify(stack, creds);
  await loginViaUi(page, stack.webBaseUrl, creds);
  await expect(page).toHaveURL(/\/scan$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/support/auth.spec.ts`
Expected: FAIL — `Cannot find module './auth.js'`.

- [ ] **Step 3: Write the helper**

```typescript
// apps/web/tests/e2e/support/auth.ts
import type { Page } from '@playwright/test';
import type { Stack } from './stack.js';

export interface Creds {
  readonly email: string;
  readonly password: string;
}

/** Registers through the real API, then verifies the same way every apps/api
 * contract test does (there is no verification-EMAIL to click in dev — mail
 * is console-logged, not delivered; RESEND_API_KEY is unset). Verifying
 * through the database, not a shortcut around registration itself, which
 * still goes through the real HTTP endpoint. */
export async function registerAndVerify(stack: Stack, creds: Creds): Promise<void> {
  const res = await fetch(`${stack.apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (res.status !== 201) throw new Error(`register failed: ${String(res.status)} ${await res.text()}`);
  await stack.db.user.update({
    where: { email: creds.email },
    data: { emailVerifiedAt: new Date() },
  });
}

export async function promoteToOperator(stack: Stack, email: string): Promise<void> {
  await stack.db.user.update({ where: { email }, data: { isOperator: true } });
}

/** Drives the REAL /login form — this is the point of this plan, not a
 * localStorage shortcut. */
export async function loginViaUi(page: Page, webBaseUrl: string, creds: Creds): Promise<void> {
  await page.goto(`${webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/, { timeout: 10_000 });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/support/auth.spec.ts`
Expected: PASS. If the login form's real `<label>`/`<button>` text doesn't match
`getByLabel('Email')` or `getByRole('button', { name: 'Sign in' })` exactly, this is the point where
that's discovered — read `apps/web/app/(auth)/login/page.tsx` and adjust the selectors in Step 3 to
match the real markup, then re-run. Do not weaken the assertion to a CSS selector as a shortcut.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/support/auth.ts apps/web/tests/e2e/support/auth.spec.ts
git commit -m "test(e2e): add the shared registerAndVerify/loginViaUi helper"
```

---

### Task 3: Auth flow — login success and failure, real error surfaced

**Files:**
- Create: `apps/web/tests/e2e/auth/login.spec.ts`

**Interfaces:**
- Consumes: `startStack` (Task 1), `registerAndVerify`/`loginViaUi` (Task 2).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/e2e/auth/login.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'login-flow@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);
test.afterAll(async () => stack.stop());

test('correct credentials reach the dashboard', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill(creds.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);
});

test('wrong password shows a real, specific error — not a generic network failure', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill('definitely-wrong');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  // This is the exact failure mode this plan's own "What's actually broken
  // today" section describes: a CORS/network failure and a real 401 both
  // must not collapse into the same generic message.
  await expect(page.getByText(/incorrect|invalid.*(email|password)/i)).toBeVisible({ timeout: 5_000 });
  await expect(page).toHaveURL(/\/login$/);
});

test('an unverified account is refused with a specific reason, not silently logged in', async ({ page }) => {
  const unverified = { email: 'unverified@example.com', password: 'correct-horse-battery-staple' };
  await fetch(`${stack.apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(unverified),
  });
  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(unverified.email);
  await page.getByLabel('Password').fill(unverified.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByText(/verify/i)).toBeVisible({ timeout: 5_000 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/auth/login.spec.ts`
Expected: likely PASS on the first test (login already works, per this session's own manual
verification) but read the actual output carefully for the second and third — if the frontend really
does render "Something went wrong. Try again." for a wrong password too (indistinguishable from the
CORS failure this plan's intro describes), test 2 FAILs here for a real reason. That failure is a real
product finding, not a test bug — read `apps/web/app/(auth)/login/page.tsx`'s error handling before
assuming the test is wrong.

- [ ] **Step 3: Fix the login page's error handling if Step 2 found a real gap**

If `login/page.tsx` maps every `ApiError` to the same generic string, change it to branch on the
real error, matching this repo's own existing pattern in `apps/web/app/(admin)/admin/*/page.tsx`
(`err instanceof ApiError ? err.message : 'generic fallback'` — `ApiError.message` already carries the
API's real reason, e.g. "Incorrect email or password." or "Verify your email before signing in."). Do
not invent new copy — read `apps/api/src/services/auth/login.service.ts`'s real error messages first
and let the frontend surface them verbatim.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/auth/login.spec.ts`
Expected: PASS, 3/3.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/auth/login.spec.ts apps/web/app/\(auth\)/login/page.tsx
git commit -m "test(e2e): cover login success/failure/unverified; surface the real API error if it wasn't"
```

---

### Task 4: Auth flow — registration and forgot/reset password

**Files:**
- Create: `apps/web/tests/e2e/auth/registration.spec.ts`
- Create: `apps/web/tests/e2e/auth/password-reset.spec.ts`

**Interfaces:**
- Consumes: `startStack` (Task 1).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/e2e/auth/registration.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack();
}, 180_000);
test.afterAll(async () => stack.stop());

test('signing up through the real form creates a real, unverified user', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Email').fill('new-signup@example.com');
  await page.getByLabel('Password', { exact: true }).fill('correct-horse-battery-staple');
  await page.getByRole('button', { name: 'Start free', exact: true }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5_000 });

  const user = await stack.db.user.findUnique({ where: { email: 'new-signup@example.com' } });
  expect(user).not.toBeNull();
  expect(user?.emailVerifiedAt).toBeNull();
});

test('signing up with an already-registered email shows a real, specific error', async ({ page }) => {
  await fetch(`${stack.apiBaseUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dupe@example.com', password: 'correct-horse-battery-staple' }),
  });
  await page.goto(`${stack.webBaseUrl}/signup`);
  await page.getByLabel('Email').fill('dupe@example.com');
  await page.getByLabel('Password', { exact: true }).fill('another-password-here');
  await page.getByRole('button', { name: 'Start free', exact: true }).click();
  await expect(page.getByText(/already.*(registered|exists|use)/i)).toBeVisible({ timeout: 5_000 });
});
```

```typescript
// apps/web/tests/e2e/auth/password-reset.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'reset-flow@example.com', password: 'original-password-here' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);
test.afterAll(async () => stack.stop());

test('forgot password issues a real, single-use reset token; the new password logs in', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/forgot-password`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('button', { name: /send|reset/i }).click();
  await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5_000 });

  const emailToken = await stack.db.emailToken.findFirst({
    where: { user: { email: creds.email }, purpose: 'PASSWORD_RESET' },
    orderBy: { createdAt: 'desc' },
  });
  expect(emailToken).not.toBeNull();

  await page.goto(`${stack.webBaseUrl}/reset-password?token=${emailToken!.rawToken}`);
  await page.getByLabel('New password', { exact: true }).fill('a-brand-new-password-here');
  await page.getByRole('button', { name: /reset|update/i }).click();
  await expect(page.getByText(/success|updated|changed/i)).toBeVisible({ timeout: 5_000 });

  await page.goto(`${stack.webBaseUrl}/login`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByLabel('Password').fill('a-brand-new-password-here');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/scan$/);
});

test('a reset token cannot be used twice', async ({ page }) => {
  await page.goto(`${stack.webBaseUrl}/forgot-password`);
  await page.getByLabel('Email').fill(creds.email);
  await page.getByRole('button', { name: /send|reset/i }).click();

  const emailToken = await stack.db.emailToken.findFirst({
    where: { user: { email: creds.email }, purpose: 'PASSWORD_RESET' },
    orderBy: { createdAt: 'desc' },
  });

  await page.goto(`${stack.webBaseUrl}/reset-password?token=${emailToken!.rawToken}`);
  await page.getByLabel('New password', { exact: true }).fill('first-use-password');
  await page.getByRole('button', { name: /reset|update/i }).click();
  await expect(page.getByText(/success|updated|changed/i)).toBeVisible({ timeout: 5_000 });

  await page.goto(`${stack.webBaseUrl}/reset-password?token=${emailToken!.rawToken}`);
  await page.getByLabel('New password', { exact: true }).fill('second-use-should-fail');
  await page.getByRole('button', { name: /reset|update/i }).click();
  await expect(page.getByText(/expired|invalid|already/i)).toBeVisible({ timeout: 5_000 });
});
```

**Note on `EmailToken.rawToken`**: read `apps/api/prisma/schema.prisma`'s real `EmailToken` model
before writing this step for real — this plan assumes a field storing (or from which the test can
derive) the raw, pre-hash token value the URL needs; if the schema only stores a hash (matching
`apps/api/tests/adverse/reset-single-use.test.ts`'s own likely pattern), read that test file's own
token-minting helper and reuse its exact approach instead of inventing a new one.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/auth/registration.spec.ts tests/e2e/auth/password-reset.spec.ts`
Expected: FAIL until the real selectors/copy are matched to the real pages — read
`apps/web/app/(auth)/signup/page.tsx`, `forgot-password/page.tsx`, `reset-password/page.tsx` and
correct button names/label text/success copy in Step 1 to what they really render, the same way
Task 2 Step 4 describes.

- [ ] **Step 3: Fix selectors against the real markup**

(No separate code block — this is the same "read the real page, correct the test" loop as Task 2.)

- [ ] **Step 4: Run tests to verify they pass**

Run: same command as Step 2.
Expected: PASS, 4/4 across both files.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/auth/registration.spec.ts apps/web/tests/e2e/auth/password-reset.spec.ts
git commit -m "test(e2e): cover registration and forgot/reset password through the real forms"
```

---

### Task 5: Onboarding — the real first-audit journey, browser-driven

**Files:**
- Create: `apps/web/tests/e2e/onboarding/first-audit.spec.ts`
- Modify: `apps/web/tests/e2e/first-audit.spec.ts` — add a header note, do not delete (see below)

This supersedes the API-only `first-audit.spec.ts` for **UI** coverage — that file's own header
already says it exists because "the registration form, the new-scan panel, the progress view, and the
report screen do not exist yet." They do now. Leaving the old file in place as the API-contract-level
smoke test it already is (it's a legitimate, fast, no-browser check that the whole pipeline produces a
scored report) while adding this new one for real browser coverage is not duplication — they test two
different things at two different levels, matching this repo's own layered-testing convention.

**Interfaces:**
- Consumes: `startStack` (Task 1), `registerAndVerify`/`loginViaUi` (Task 2), `fixtures/static-site.ts`
  (already exists, reused as-is).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/e2e/onboarding/first-audit.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'onboarding@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('a new user submits a URL, watches progress, and receives a scored report with a fix prompt', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await expect(page).toHaveURL(/\/scan$/);

  await page.getByLabel(/url/i).fill(`${fixture.origin}/`);
  await page.getByRole('button', { name: /start|continue|next/i }).click();

  // Area selection — SECURITY and SEO, matching first-audit.spec.ts's own
  // API-level test so the two specs assert the same real journey.
  await page.getByLabel(/security/i).check();
  await page.getByLabel(/search visibility|seo/i).check();
  await page.getByRole('button', { name: /start audit|run audit|submit/i }).click();

  await page.waitForURL(/\/progress|\/report/i, { timeout: 10_000 });
  await page.waitForURL(/\/report/i, { timeout: 60_000 });

  await expect(page.getByText(/score/i)).toBeVisible();
  // FR-053/spec.md: a fix prompt exists for every issue — assert at least
  // one is visible and non-empty, not just that the report loaded.
  const firstFixPrompt = page.locator('[class*="fixPrompt"], [data-testid="fix-prompt"]').first();
  await expect(firstFixPrompt).toBeVisible();
  await expect(firstFixPrompt).not.toBeEmpty();
});
```

**Note on the fix-prompt locator**: read `apps/web/components/report/IssueCard.tsx` for the real
class name or add a `data-testid="fix-prompt"` to it if none exists — CSS-module class names are
hashed at build time and `[class*="fixPrompt"]` is a fragile guess; prefer adding one real
`data-testid` attribute to `IssueCard.tsx` over guessing the hashed class, and note that addition in
this task's commit.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/onboarding/first-audit.spec.ts`
Expected: FAIL — correct every selector/copy/route against the real
`apps/web/app/(dashboard)/scan/page.tsx`, the progress component, and `reports/[id]/page.tsx` before
re-running, same loop as every prior task.

- [ ] **Step 3: Add `data-testid="fix-prompt"` to IssueCard.tsx if it has no stable selector**

Read the file first; if a stable attribute already exists, skip this step and use it instead.

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 2.
Expected: PASS. This is the slowest single spec in the plan (a real scan runs to completion) — if it
exceeds the 60s waitForURL budget, check the worker's own log output for the real cause before
widening the timeout; `AI_MODE=fixtures` scans should complete in a few seconds, not a minute, and a
minute-long real wait points at a stuck job, not a slow-but-working one.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/onboarding/first-audit.spec.ts apps/web/components/report/IssueCard.tsx
git commit -m "test(e2e): cover the full onboarding journey through the real browser UI"
```

---

### Task 6: Customer dashboard — fixes board and re-verification

**Files:**
- Create: `apps/web/tests/e2e/dashboard/fixes-board.spec.ts`

**Interfaces:**
- Consumes: `startStack`, `registerAndVerify`/`loginViaUi`, `fixtures/static-site.ts` — same as Task 5.
- Reuses Task 5's journey (register → scan → report) as setup, factored into a local helper rather
  than imported from Task 5's spec file (Playwright specs are not modules other specs should import
  test bodies from — a shared `runOnboardingJourney(page, stack, fixture)` helper belongs in
  `support/`, not in another `.spec.ts`).

- [ ] **Step 1: Extract the onboarding journey into a reusable support helper**

```typescript
// apps/web/tests/e2e/support/journey.ts
import type { Page } from '@playwright/test';
import type { Stack } from './stack.js';
import type { FixtureSite } from '../fixtures/static-site.js';

/** Runs the same real browser journey Task 5's own spec asserts step by
 * step, without the assertions — for specs that need a completed, real
 * scan already sitting in the database as their own starting point. */
export async function runScanToCompletion(
  page: Page,
  fixture: FixtureSite,
): Promise<{ readonly scanUrl: string }> {
  await page.goto('/scan');
  await page.getByLabel(/url/i).fill(`${fixture.origin}/`);
  await page.getByRole('button', { name: /start|continue|next/i }).click();
  await page.getByLabel(/security/i).check();
  await page.getByLabel(/search visibility|seo/i).check();
  await page.getByRole('button', { name: /start audit|run audit|submit/i }).click();
  await page.waitForURL(/\/report/i, { timeout: 60_000 });
  return { scanUrl: page.url() };
}
```

- [ ] **Step 2: Write the failing test**

```typescript
// apps/web/tests/e2e/dashboard/fixes-board.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'fixes-board@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('the fixes board lists real issues from a completed scan and re-verify updates state', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await runScanToCompletion(page, fixture);

  await page.goto(`${stack.webBaseUrl}/fixes`);
  const firstRow = page.locator('[data-testid="issue-row"]').first();
  await expect(firstRow).toBeVisible();

  await firstRow.getByRole('button', { name: /mark.*fixed|assert.*fixed|i fixed this/i }).click();
  await expect(firstRow.getByText(/verifying|checking/i)).toBeVisible({ timeout: 5_000 });

  // AI_MODE=fixtures resolves re-verification deterministically and fast —
  // assert a terminal state is reached, not which one (the fixture's
  // canned reverify outcome is not this test's concern).
  await expect(firstRow.getByText(/resolved|open|unverifiable/i)).toBeVisible({ timeout: 15_000 });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/dashboard/fixes-board.spec.ts`
Expected: FAIL — read `apps/web/components/fixes/FixesBoard.tsx`/`IssueRow.tsx` for the real
`data-testid`/button text and correct Step 2, adding a `data-testid="issue-row"` to `IssueRow.tsx` if
none exists (same reasoning as Task 5 Step 3).

- [ ] **Step 4: Run test to verify it passes**

Run: same command as Step 3. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/tests/e2e/support/journey.ts apps/web/tests/e2e/dashboard/fixes-board.spec.ts apps/web/components/fixes/IssueRow.tsx
git commit -m "test(e2e): cover the fixes board and re-verification through the real browser UI"
```

---

### Task 7: Customer dashboard — readiness certificate, usage, and billing

**Files:**
- Create: `apps/web/tests/e2e/dashboard/readiness.spec.ts`
- Create: `apps/web/tests/e2e/dashboard/usage-and-billing.spec.ts`

**Interfaces:** Consumes the same `support/` helpers as Task 6.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/e2e/dashboard/readiness.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const creds = { email: 'readiness@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('requesting a readiness verdict after a completed scan produces a real go/no-go', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await runScanToCompletion(page, fixture);

  await page.goto(`${stack.webBaseUrl}/readiness`);
  await page.getByRole('button', { name: /request|generate|run readiness/i }).click();
  await expect(page.getByText(/go|no-go/i)).toBeVisible({ timeout: 30_000 });
});
```

```typescript
// apps/web/tests/e2e/dashboard/usage-and-billing.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'usage-billing@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);
test.afterAll(async () => stack.stop());

test('usage page shows the real starting balance for a fresh free-tier account', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/usage`);
  await expect(page.getByText('50')).toBeVisible();
});

test('a free-tier account cannot purchase credits — the real entitlement refusal is visible', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/billing`);
  const purchaseButton = page.getByRole('button', { name: /buy|purchase|top up/i });
  // FR-078: purchase is a paid-plan feature. Either the control is absent
  // for a free account, or clicking it surfaces the real 403 reason —
  // assert whichever this page actually does, don't assume.
  if (await purchaseButton.isVisible().catch(() => false)) {
    await purchaseButton.click();
    await expect(page.getByText(/upgrade|paid plan/i)).toBeVisible({ timeout: 5_000 });
  } else {
    await expect(page.getByText(/upgrade|paid plan/i)).toBeVisible();
  }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/dashboard/readiness.spec.ts tests/e2e/dashboard/usage-and-billing.spec.ts`
Expected: FAIL initially — correct selectors/copy against `readiness/page.tsx`, `usage/page.tsx`,
`billing/page.tsx`, same loop as every prior task.

- [ ] **Step 3: Run tests to verify they pass**

Run: same command. Expected: PASS, 3/3.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/dashboard/readiness.spec.ts apps/web/tests/e2e/dashboard/usage-and-billing.spec.ts
git commit -m "test(e2e): cover readiness verdict, usage balance, and the free-tier purchase refusal"
```

---

### Task 8: Admin console — operator login gate and the Users screen

**Files:**
- Create: `apps/web/tests/e2e/admin/access-gate.spec.ts`
- Create: `apps/web/tests/e2e/admin/users.spec.ts`

**Interfaces:** Consumes `startStack`, `registerAndVerify`/`loginViaUi`/`promoteToOperator` (Task 2).

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/e2e/admin/access-gate.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi } from '../support/auth.js';

let stack: Stack;
const creds = { email: 'non-operator@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, creds);
}, 180_000);
test.afterAll(async () => stack.stop());

test('a genuine non-operator account cannot see admin data even after navigating to /admin', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, creds);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  // CLAUDE.md: "Frontend route guards are usability, never security" — the
  // page may render its shell, but it must never show real user data for a
  // non-operator account. Assert the real server-side 403, not a client
  // redirect that a hostile client could skip.
  await expect(page.getByText(/forbidden|not authorized|403/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText('tester@example.com')).not.toBeVisible();
});
```

```typescript
// apps/web/tests/e2e/admin/users.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-users-op@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
  await registerAndVerify(stack, { email: 'listed-user@example.com', password: 'irrelevant-password' });
}, 180_000);
test.afterAll(async () => stack.stop());

test('a real operator sees the real user list, and can promote another account', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/users`);
  await expect(page.getByText('listed-user@example.com')).toBeVisible();

  const row = page.locator('tr', { hasText: 'listed-user@example.com' });
  await row.getByRole('button', { name: /make operator/i }).click();
  await expect(row.getByRole('button', { name: /remove operator/i })).toBeVisible({ timeout: 5_000 });

  const promoted = await stack.db.user.findUnique({ where: { email: 'listed-user@example.com' } });
  expect(promoted?.isOperator).toBe(true);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/admin/access-gate.spec.ts tests/e2e/admin/users.spec.ts`
Expected: FAIL initially — correct copy/selectors against the real
`apps/web/app/(admin)/admin/users/page.tsx` and whatever the real 403 rendering looks like (read
`apps/web/tests/unit/admin-error-paths.test.ts`, already built this session, for the real expected
copy — it asserts this exact page's real refusal text already).

- [ ] **Step 3: Run tests to verify they pass**

Run: same command. Expected: PASS, 2/2.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/admin/access-gate.spec.ts apps/web/tests/e2e/admin/users.spec.ts
git commit -m "test(e2e): cover the real operator gate and the Users admin screen"
```

---

### Task 9: Admin console — capabilities, plans, and providers mutations

**Files:**
- Create: `apps/web/tests/e2e/admin/capabilities-and-plans.spec.ts`
- Create: `apps/web/tests/e2e/admin/providers.spec.ts`

**Interfaces:** Same as Task 8.

- [ ] **Step 1: Write the failing tests**

```typescript
// apps/web/tests/e2e/admin/capabilities-and-plans.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-caps-op@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
}, 180_000);
test.afterAll(async () => stack.stop());

test('disabling a real capability persists and re-enables cleanly', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/capabilities`);
  const row = page.locator('tr', { hasText: 'headers-checker' });
  await row.getByRole('button', { name: /disable/i }).click();
  await expect(row.getByRole('button', { name: /enable/i })).toBeVisible({ timeout: 5_000 });

  const capability = await stack.db.capability.findUnique({ where: { id: 'headers-checker' } });
  expect(capability?.isEnabled).toBe(false);

  await row.getByRole('button', { name: /^enable/i }).click();
  await expect(row.getByRole('button', { name: /disable/i })).toBeVisible({ timeout: 5_000 });
});

test('editing a plan tier persists the real change and writes an audit entry', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/plans`);
  const row = page.locator('tr', { hasText: 'Starter' });
  await row.getByRole('button', { name: /edit/i }).click();
  await page.getByLabel(/monthly credits/i).fill('350');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(row.getByText('350')).toBeVisible({ timeout: 5_000 });

  const plan = await stack.db.plan.findUnique({ where: { id: 'starter' } });
  expect(plan?.monthlyCredits).toBe(350);
  const entry = await stack.db.auditLogEntry.findFirst({
    where: { subjectType: 'Plan', subjectId: 'starter', action: 'plan.update' },
    orderBy: { createdAt: 'desc' },
  });
  expect(entry).not.toBeNull();
});
```

```typescript
// apps/web/tests/e2e/admin/providers.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';

let stack: Stack;
const operator = { email: 'admin-providers-op@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
}, 180_000);
test.afterAll(async () => stack.stop());

test('a single-vendor chain is refused with the real buildChain reasoning, persisting nothing', async ({ page }) => {
  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/providers`);
  await page.getByRole('button', { name: /add provider/i }).click();
  await page.getByLabel(/vendor/i).fill('anthropic');
  await page.getByLabel(/model/i).fill('claude');
  // Remove every other configured provider first if the page seeds one —
  // read admin/providers/page.tsx to confirm the real starting state before
  // asserting the single-vendor refusal path.
  await page.getByRole('button', { name: /save|apply/i }).click();
  await expect(page.getByText(/two vendors|at least two/i)).toBeVisible({ timeout: 5_000 });

  const chain = await stack.db.providerChainEntry.findMany();
  expect(chain).toEqual([]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/admin/capabilities-and-plans.spec.ts tests/e2e/admin/providers.spec.ts`
Expected: FAIL initially — correct selectors against the real
`admin/capabilities/page.tsx`, `admin/plans/page.tsx`, `admin/providers/page.tsx`.

- [ ] **Step 3: Run tests to verify they pass**

Run: same command. Expected: PASS, 3/3.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/admin/capabilities-and-plans.spec.ts apps/web/tests/e2e/admin/providers.spec.ts
git commit -m "test(e2e): cover capability enable/disable, plan edits, and provider chain validation"
```

---

### Task 10: Admin console — queue and audit log

**Files:**
- Create: `apps/web/tests/e2e/admin/queue-and-log.spec.ts`

**Interfaces:** Same as Task 8/9. Reuses `runScanToCompletion` (Task 6) via a scan that reaches the
queue, and `startFixtureSite` (already used in Tasks 5-7).

- [ ] **Step 1: Write the failing test**

```typescript
// apps/web/tests/e2e/admin/queue-and-log.spec.ts
import { test, expect } from '@playwright/test';
import { startStack, type Stack } from '../support/stack.js';
import { registerAndVerify, loginViaUi, promoteToOperator } from '../support/auth.js';
import { runScanToCompletion } from '../support/journey.js';
import { startFixtureSite, type FixtureSite } from '../fixtures/static-site.js';

let stack: Stack;
let fixture: FixtureSite;
const operator = { email: 'admin-queue-op@example.com', password: 'correct-horse-battery-staple' };
const customer = { email: 'queue-customer@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  fixture = await startFixtureSite();
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;
  stack = await startStack();
  await registerAndVerify(stack, operator);
  await promoteToOperator(stack, operator.email);
  await registerAndVerify(stack, customer);
}, 180_000);

test.afterAll(async () => {
  await stack.stop();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('a real completed scan appears in the operator audit log after a plan edit', async ({ page, context }) => {
  const customerPage = await context.newPage();
  await loginViaUi(customerPage, stack.webBaseUrl, customer);
  await runScanToCompletion(customerPage, fixture);
  await customerPage.close();

  await loginViaUi(page, stack.webBaseUrl, operator);
  await page.goto(`${stack.webBaseUrl}/admin/scans`);
  await expect(page.getByText(customer.email)).toBeVisible({ timeout: 5_000 });

  await page.goto(`${stack.webBaseUrl}/admin/plans`);
  const row = page.locator('tr', { hasText: 'Free' });
  await row.getByRole('button', { name: /edit/i }).click();
  await page.getByLabel(/monthly credits/i).fill('60');
  await page.getByRole('button', { name: /save/i }).click();
  await expect(row.getByText('60')).toBeVisible({ timeout: 5_000 });

  await page.goto(`${stack.webBaseUrl}/admin/log`);
  await expect(page.getByText(/plan\.update/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(operator.email)).toBeVisible();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @webaudit/web exec playwright test tests/e2e/admin/queue-and-log.spec.ts`
Expected: FAIL initially — correct selectors against `admin/scans/page.tsx` and `admin/log/page.tsx`.

- [ ] **Step 3: Run test to verify it passes**

Run: same command. Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/web/tests/e2e/admin/queue-and-log.spec.ts
git commit -m "test(e2e): cover the scans/audit-log admin screens against a real customer journey"
```

---

### Task 11: Manual and Playwright-MCP exploratory checklist

**Files:**
- Create: `apps/web/tests/manual/CHECKLIST.md`

This is the one thing this plan cannot script: GitHub OAuth against a real GitHub OAuth app (no
credentials in this repo, per Global Constraints), and real email delivery (Resend is unconfigured in
dev — mail is console-logged). Both need a human, or Claude driving the Playwright MCP browser tool
interactively against the real running dev stack, following this checklist step by step and recording
the real observed result next to each item — not a re-statement of what Tasks 1-10 already assert
automatically.

- [ ] **Step 1: Write the checklist**

```markdown
# Manual / Playwright-MCP Exploratory Checklist

Run this against a real running dev stack (`pnpm --filter @webaudit/api run dev`,
`pnpm --filter @webaudit/worker run dev`, `pnpm --filter @webaudit/web run dev`), either by a human
clicking through it or by Claude driving the Playwright MCP browser tool one step at a time. Record
the actual observed result next to each item, with a date — this file is a log, not a static spec.

## Auth — the two things automation genuinely cannot cover

- [ ] **GitHub OAuth sign-in**: requires `GITHUB_OAUTH_CLIENT_ID`/`_SECRET` for a real registered
  GitHub OAuth app pointed at this dev stack's real callback URL. Click "Continue with GitHub" on
  `/login`, authorize against a real GitHub account, confirm redirect back to `/scan` with a real
  session. **Blocked until real OAuth app credentials exist** — record whether this was actually run.
- [ ] **Real email delivery**: requires a real `RESEND_API_KEY`. Register a real, reachable test
  inbox, confirm the verification email actually arrives (not just the console log line), click the
  real link in the real email, confirm it verifies the account. Repeat for the password-reset email.

## Visual/UX judgment calls automation does not make well

- [ ] Walk all 5 auth pages, both viewports (1440 and 390) — does anything look broken that a
  pixel-diff threshold might tolerate but a human would call wrong?
- [ ] Walk the onboarding journey end to end as a first-time user would, without already knowing the
  UI — is anything confusing, is any copy unclear, does any button do something surprising?
- [ ] Walk all 10 admin screens as a real operator — same "does this feel right" pass Task 8-10's
  assertions don't capture.
- [ ] Confirm the public marketing footer's "Dashboard"/"Admin console" links (always visible,
  logged in or not — this is the vendored design's own behavior, not a bug; see this plan's own
  investigation notes) behave sensibly for a logged-out visitor who clicks them.

## Cross-cutting

- [ ] With devtools' Network tab open, confirm no request ever leaves for a third-party host from
  any of the 23 real pages beyond what `no-external-requests.spec.ts` already automates for its 6
  pages — spot-check the other 17.
- [ ] Confirm a browser back/forward through the onboarding journey doesn't leave the UI in a
  contradictory state (e.g. showing "processing" for a scan that already completed).
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/tests/manual/CHECKLIST.md
git commit -m "docs(e2e): add the manual/Playwright-MCP exploratory checklist for what can't be scripted"
```

---

### Task 12: The testing README

**Files:**
- Create: `apps/web/tests/README.md`

- [ ] **Step 1: Write the doc**

```markdown
# apps/web Testing Guide

Seven layers, each answering a different question. Run them in this order when in doubt about which
one caught a regression.

| Layer | Command | What it answers | Where |
|---|---|---|---|
| Unit | `pnpm test` (root, `--project unit`) | Does this component render the right thing given props? | `tests/unit/` |
| CSS adherence | same, `css-adherence-lint.test.ts` | Any new raw hex/px outside the recorded baseline? | `tests/unit/css-adherence-lint.test.ts` |
| Visual | `pnpm test:visual` (root) | Does a ported page match its design-system reference within 0.5%? | `tests/visual/` |
| Contract/adverse (API side) | `pnpm test` / `pnpm test:adverse` (root, `apps/api`) | Does the backend enforce its own guarantees? | `apps/api/tests/` |
| **E2E (this plan)** | `pnpm --filter @webaudit/web exec playwright test` | Does a real browser, driving the real UI, against a real API and worker, complete a real user journey? | `tests/e2e/` |
| Manual/Playwright-MCP | walk `tests/manual/CHECKLIST.md` | What can't be scripted (real OAuth, real email, visual judgment)? | `tests/manual/` |
| Accessibility/no-external-requests | `playwright test tests/e2e/accessibility.spec.ts tests/e2e/no-external-requests.spec.ts` | Axe-core violations; any third-party network request? | `tests/e2e/` (pre-existing, not part of this plan) |

## Running the e2e suite

```bash
pnpm services:up   # postgres :5442, redis :6389 — see PROGRESS.md's environment gotchas
pnpm --filter @webaudit/web exec playwright test
```

Every spec under `tests/e2e/{auth,onboarding,dashboard,admin}/` boots its own real api/worker/web
stack via `tests/e2e/support/stack.ts` — no external services beyond Postgres/Redis need to be
running first. Expect the suite to take several minutes: `stack.ts` runs a real `next build` per file
group (matching `playwright.config.ts`'s `workers: 1` reasoning already documented there).

## Coverage map

| Page | Covered by |
|---|---|
| `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email` | `tests/e2e/auth/*.spec.ts` |
| `/scan`, `/reports/[id]` | `tests/e2e/onboarding/first-audit.spec.ts` |
| `/fixes` | `tests/e2e/dashboard/fixes-board.spec.ts` |
| `/readiness`, `/usage`, `/billing`, `/settings` | `tests/e2e/dashboard/readiness.spec.ts`, `usage-and-billing.spec.ts` (`/settings`: not yet covered — see Open Items below) |
| `/admin/users` | `tests/e2e/admin/access-gate.spec.ts`, `users.spec.ts` |
| `/admin/capabilities`, `/admin/plans` | `tests/e2e/admin/capabilities-and-plans.spec.ts` |
| `/admin/providers` | `tests/e2e/admin/providers.spec.ts` |
| `/admin/scans`, `/admin/log` | `tests/e2e/admin/queue-and-log.spec.ts` |
| `/admin/queue`, `/admin/settings`, `/admin` (overview), `/` (public), `/pricing` | Not yet covered — see Open Items |

## Open items (honestly not covered by this plan)

- `/admin/queue`, `/admin/settings`, `/admin` overview, `/` (public homepage), `/pricing`, and the
  customer `/settings` page have no e2e spec yet — this plan's Tasks 1-10 prioritized the auth flow
  and the highest-traffic customer/admin journeys the user explicitly asked about first. Extending
  this plan with one task per remaining page, following the exact same shape as Tasks 6-10, is
  straightforward follow-on work, not a design question — add it as a new task the same way.
- GitHub OAuth and real email delivery are Task 11 (manual/Playwright-MCP) items, permanently — they
  cannot become automated specs without real third-party credentials this repo does not have.
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/tests/README.md
git commit -m "docs(e2e): add the testing guide tying every layer together, with an honest coverage map"
```

---

## Self-Review Notes (per the writing-plans skill's own required step)

- **Spec coverage**: every explicit thing the user asked for maps to a task — full auth flow for both
  account types (Tasks 3-4, 8), onboarding (Task 5), full-site E2E (Tasks 6-10, with the honest
  remainder named in Task 12's Open Items rather than silently dropped), manual + Playwright-MCP
  testing (Task 11), tests in their own folder (`apps/web/tests/e2e/{auth,onboarding,dashboard,
  admin}/`, Global Constraints), docs for how it works (Task 12).
- **Placeholder scan**: every step has real, complete code; every selector-uncertainty is called out
  explicitly as "read the real file and correct this" rather than left vague, because this plan was
  written without running each spec against the live app first — that correction loop IS Step 2/3 of
  nearly every task, by design, not a placeholder.
- **Type consistency**: `Stack` (Task 1) is the one shape every later task's `stack: Stack` parameter
  uses; `Creds`/`registerAndVerify`/`loginViaUi`/`promoteToOperator` (Task 2) are used with the same
  names and signatures in every task from 3 onward; `runScanToCompletion` (Task 6) is reused verbatim
  by Tasks 7 and 10 rather than re-implemented.
