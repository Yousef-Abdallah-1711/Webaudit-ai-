/**
 * N01 / V02 (flag ON, isolated): the real HTTP lifecycle through the SPEC 009 plan path, in-process API + worker, real
 * PostgreSQL, real Redis/BullMQ, the legacy module pipeline in fixtures mode, orchestrator-owned passive completion
 * (DEC-071), master synthesis, report retrieval and the coverage read model. `SCAN_EXECUTION_PLANS=on` is set for this
 * file's process only; the flag stays OFF by default everywhere else.
 *
 * Limits (recorded in the SPEC 009 completion report): the in-process worker connects with the fixture database login,
 * not a least-privilege runtime login; no non-passive engine exists, so only passive units are exercised.
 */
import { test, expect } from '@playwright/test';
import { tmpdir } from 'node:os';
import { PrismaClient } from '@webaudit/api/prisma-client';
import { startApi, type ApiService } from '@webaudit/api';
import { startWorker, type WorkerService } from '@webaudit/worker';
import { startFixtureSite, type FixtureSite } from './fixtures/static-site.js';
import { isolatedTestDatabaseUrl, isolatedTestRedisUrl } from './support/test-config.js';

const TEST_DB_URL = isolatedTestDatabaseUrl();
const TEST_REDIS_URL = isolatedTestRedisUrl();
// The in-process API (fan-out subscriber, limiters) reads REDIS_URL from the environment.
process.env['REDIS_URL'] = TEST_REDIS_URL;

let db: PrismaClient;
let fixture: FixtureSite;
let api: ApiService;
let worker: WorkerService;

const CREDS = { email: 'e2e-exec-plans@example.com', password: 'correct-horse-battery-staple' };

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
  process.env['SCAN_EXECUTION_PLANS'] = 'on';

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
    'ScanPlan',
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
      url: TEST_REDIS_URL,
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
  delete process.env['SCAN_EXECUTION_PLANS'];
});

test('flag ON: a planned scan completes, its passive units are completed by the orchestrator, coverage reports them', async ({
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

  const plan = await db.scanPlan.findFirstOrThrow({
    where: { scanId: scan.id },
    include: { executionUnits: true },
  });
  expect(plan).toMatchObject({ kind: 'INITIAL', state: 'RESOLVED' });
  expect(plan.executionUnits).toHaveLength(2);
  for (const unit of plan.executionUnits) {
    expect(unit.status).toBe('COMPLETED');
    expect(unit.terminalReason).toBe('PASSIVE_COMPLETED_BY_ORCHESTRATOR');
  }

  const coverage = await request.get(`${base}/scans/${scan.id}/coverage`, { headers: auth });
  expect(coverage.status()).toBe(200);
  const { coverage: entries } = (await coverage.json()) as {
    coverage: Array<{ completedUnits: unknown[]; nonCompletedUnits: unknown[] }>;
  };
  expect(entries).toHaveLength(1);
  expect(entries[0]?.completedUnits).toHaveLength(2);
  expect(entries[0]?.nonCompletedUnits).toHaveLength(0);
});
