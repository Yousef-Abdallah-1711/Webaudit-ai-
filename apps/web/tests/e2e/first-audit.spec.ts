/**
 * T109 — the full User Story 1 journey: register, submit a URL, select
 * areas, watch progress, receive a report with a score and at least one
 * remediation prompt (this file's own "Independent Test" line in
 * tasks.md).
 *
 * **Drives the real HTTP API directly, not the browser UI.** T109 is
 * listed under "Tests for User Story 1" — written before "Frontend for
 * User Story 1" (T126–135). The registration form, the new-scan panel, the
 * progress view, and the report screen do not exist yet (T128–130, T134
 * are still open) — there is nothing for Playwright to click. This test
 * uses `@playwright/test`'s own `request` fixture the same way its
 * `page`/`browser` fixtures would drive a UI, so the file only needs new
 * assertions layered in once T126–135 land, not a rewrite: replace each
 * `request.post(...)` with the equivalent `page.click(...)` as each screen
 * ports in.
 *
 * **Every service is booted in-process**, the same `startApi`/`startWorker`
 * composition T107/T108 use — `apps/api`'s own `dev` script still says "not
 * implemented", so there is no separate process to point Playwright's
 * `webServer` config at yet.
 *
 * **The audit target is a local fixture page** (`fixtures/static-site.ts`),
 * not a real public site — the user's own explicit choice for this suite,
 * recorded when this task was scoped: deterministic, and nothing is
 * hammering a third party on every run. Reaching it past the real SSRF
 * guard needs `SAFE_NET_ALLOW_TARGETS` (`packages/safe-net/src/index.ts`),
 * set once in `beforeAll` before `startApi` ever handles a request — every
 * other address class stays refused exactly as before this test existed
 * (`allow-test-targets.test.ts` is the guard's own regression suite for
 * that).
 *
 * **RED right now, for the same reason as T107/T108, at a later step.**
 * Registration, target creation, quoting, and scan creation are also
 * blocked on T110–T112 (no `/scans` route exists — 404), so this file
 * cannot get further than that today either. Once those land, it will run
 * to "quote and create the scan" and then wait for a report that never
 * arrives, for the same `JobNotImplementedError` reason T107/T108 already
 * document — genuinely reaching "receives a report with a score and a
 * remediation prompt" needs T113 through T125.
 */

import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@webaudit/api/prisma-client';
import { startApi, type ApiService } from '@webaudit/api';
import { startWorker, type WorkerService } from '@webaudit/worker';
import { startFixtureSite, type FixtureSite } from './fixtures/static-site.js';

const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';

let db: PrismaClient;
let fixture: FixtureSite;
let api: ApiService;
let worker: WorkerService;

const CREDS = { email: 'e2e-first-audit@example.com', password: 'correct-horse-battery-staple' };

test.beforeAll(async () => {
  fixture = await startFixtureSite();

  // Must be set before startApi ever handles a request — assertPublicTarget
  // reads it live on every call, but there is no reason to leave a wider
  // window open than necessary.
  process.env['SAFE_NET_ALLOW_TARGETS'] = fixture.origin;

  // vitest's workspace config sets this for every project; a plain
  // `playwright test` process has no equivalent, and createExecutorFromEnv()
  // would otherwise try to build a real provider chain with no keys set.
  process.env['AI_MODE'] = 'fixtures';

  // Required for the worker to manage scan workspaces.
  process.env['WORKSPACE_BASE_DIR'] = tmpdir();

  db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } }, log: ['error'] });

  const tables = [
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
  ]
    .map((t) => `"${t}"`)
    .join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`);
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

  api = await startApi({ db, port: 0, installSignalHandlers: false });
  worker = startWorker({
    connection: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
      maxRetriesPerRequest: null,
    },
    db,
    installSignalHandlers: false,
  });
});

test.afterAll(async () => {
  await worker.shutdown('e2e cleanup');
  await api.shutdown('e2e cleanup');
  await db.$disconnect();
  await fixture.close();
  delete process.env['SAFE_NET_ALLOW_TARGETS'];
});

test('register, submit the fixture site, accept the quote, and start an audit', async ({
  request,
}) => {
  const base = `http://127.0.0.1:${String(api.port)}`;

  const registered = await request.post(`${base}/auth/register`, { data: CREDS });
  expect(registered.status()).toBe(201);

  // Verifies directly through the database, matching every contract suite
  // in apps/api/tests/contract/ — there is no verification-email UI to
  // click through either (T128).
  await db.user.update({ where: { email: CREDS.email }, data: { emailVerifiedAt: new Date() } });

  const loggedIn = await request.post(`${base}/auth/login`, { data: CREDS });
  expect(loggedIn.status()).toBe(200);
  const { accessToken } = (await loggedIn.json()) as { accessToken: string };
  const auth = { Authorization: `Bearer ${accessToken}` };

  const target = await request.post(`${base}/targets`, {
    headers: auth,
    data: { inputType: 'URL', value: `${fixture.origin}/` },
  });
  expect(target.status(), await target.text()).toBe(201);
  const { target: targetRow } = (await target.json()) as { target: { id: string } };

  const quote = await request.post(`${base}/scans/quote`, {
    headers: auth,
    data: { targetId: targetRow.id, modules: ['SECURITY', 'SEO'] },
  });
  // RED today: no /scans route is mounted at all (T110–T112). Once it is,
  // this should be 200 with { quote: { credits: 30 } }.
  expect(quote.status(), await quote.text()).toBe(200);
  const { quote: quoted } = (await quote.json()) as { quote: { credits: number } };

  const created = await request.post(`${base}/scans`, {
    headers: auth,
    data: { targetId: targetRow.id, modules: ['SECURITY', 'SEO'], acceptedQuote: quoted.credits },
  });
  expect(created.status(), await created.text()).toBe(201);
  const { scan } = (await created.json()) as { scan: { id: string } };

  // US1's own bar: a complete report, with a score and at least one issue
  // carrying a usable remediation prompt. Polls rather than opening a
  // WebSocket — T135 (the realtime client) is what a real UI would use;
  // GET /scans/:id (FR-047, "authoritative current state") is what any
  // client falls back to regardless. Bounded short: nothing runs a phase to
  // completion until T113 exists, so this is expected to time out today,
  // not hang.
  const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
  let state = 'QUEUED';
  const deadline = Date.now() + 15_000;
  while (!terminal.has(state) && Date.now() < deadline) {
    const res = await request.get(`${base}/scans/${scan.id}`, { headers: auth });
    ({
      scan: { state },
    } = (await res.json()) as { scan: { state: string } });
    if (!terminal.has(state)) await new Promise((r) => setTimeout(r, 500));
  }

  expect(state).toBe('COMPLETED');

  const report = await request.get(`${base}/scans/${scan.id}/report`, { headers: auth });
  expect(report.status()).toBe(200);
  const body = (await report.json()) as {
    report: { score: number | null; issues: { fixPrompt: string }[] };
  };
  expect(body.report.score).not.toBeNull();
  // data-model.md: Issue.fixPrompt is a required field, never optional — a
  // usable remediation prompt exists for every issue, not just some.
  expect(body.report.issues.length).toBeGreaterThan(0);
  expect(body.report.issues.every((issue) => issue.fixPrompt.length > 0)).toBe(true);
});
