/**
 * The one shared full-stack fixture every spec under tests/e2e/{auth,
 * onboarding,dashboard,admin}/ boots through. Combines what
 * first-audit.spec.ts already does (real startApi/startWorker, in-process,
 * against a real test database) with what harness.ts's startServer already
 * does (a real `next build` + `next start` child process, T246) so a spec
 * gets a real browser driving a real frontend that makes real network calls
 * to a real backend — no existing spec combines all three before this file.
 *
 * The API port is fixed, not ephemeral (`port: 0`), because `NEXT_PUBLIC_
 * API_URL` is inlined into the frontend bundle at `next build` time — the
 * build has to know the real API origin before it runs, and a fixed port
 * lets `next build`'s own on-disk cache (`.next/cache`) actually help
 * between runs, the way an ephemeral port never could.
 */
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@webaudit/api/prisma-client';
import { PLAN_TIERS } from '@webaudit/config';
import { startApi, type ApiService } from '@webaudit/api';
import { startWorker, type WorkerService } from '@webaudit/worker';
import { createCapturingMailer, type CapturingMailer } from '@webaudit/api/test-mailer';
import { startServer, type ServerHandle } from '../../visual/harness.js';

const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';

const WEB_DIR = new URL('../../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const WEB_PORT = 4400;
const API_PORT = 4401;

export interface Stack {
  readonly apiBaseUrl: string;
  readonly webBaseUrl: string;
  readonly db: PrismaClient;
  readonly mailer: CapturingMailer;
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
  'PendingPayment',
  'Receipt',
  'BillingEvent',
  'RefreshToken',
  'EmailToken',
  'OAuthIdentity',
  'User',
  'AuditLogEntry',
  'ProviderChainEntry',
] as const;

/**
 * Every real tier (`@webaudit/config`'s `PLAN_TIERS` — free/starter/pro/
 * business), reset to their real defaults on every call, mirroring
 * `apps/api/tests/helpers/db.ts`'s own `seedPlans()` exactly.
 *
 * Found live while debugging spurious e2e failures: `Plan` is not in
 * `TABLES_TO_CLEAR` (plan rows are reference data a scan/subscription
 * foreign-keys against, so truncating them on every reset would be wrong),
 * but the old version of this function only ever upserted a single
 * hand-rolled "free" row with `update: {}` — a genuine no-op on every call
 * after the first. Two real, separate leaks followed: (1) `pnpm test`'s own
 * contract suites call the real `seedPlans()` against this exact same
 * `webaudit_test` database and left starter/pro/business rows permanently
 * seeded, so any e2e spec that subscribed to "pro" (payment-and-receipts.spec.ts)
 * only worked by accident of that cross-tool leakage, not because this
 * fixture actually provisions it; (2) a spec that deactivates "free"
 * (capabilities-and-plans.spec.ts, queue-and-log.spec.ts) left it inactive
 * for the next file's fresh `startStack()` to inherit, timing out waiting
 * for a "Deactivate" button that correctly did not exist because the row
 * was already inactive. Re-seeding all four tiers with real field values on
 * every reset closes both gaps at once.
 */
async function resetDb(db: PrismaClient): Promise<void> {
  const list = TABLES_TO_CLEAR.map((t) => `"${t}"`).join(', ');
  await db.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
  await db.plan.deleteMany({ where: { id: { notIn: PLAN_TIERS.map((tier) => tier.id) } } });
  for (const tier of PLAN_TIERS) {
    const { id, ...rest } = tier;
    // `PlanTier` (the static catalogue) has no `isActive` field at all — it
    // is a runtime, admin-toggleable column, not part of a tier's fixed
    // definition. Forced back to `true` here explicitly: a prior spec's
    // admin-deactivate test (capabilities-and-plans.spec.ts,
    // queue-and-log.spec.ts) otherwise leaves it `false` for every
    // subsequent file's fresh `startStack()` to inherit, since an `update`
    // with no `isActive` key leaves Prisma's existing value untouched.
    const row = { ...rest, allowedInputTypes: [...rest.allowedInputTypes], isActive: true };
    await db.plan.upsert({ where: { id }, create: { id, ...row }, update: row });
  }
}

export async function startStack(): Promise<Stack> {
  process.env['AI_MODE'] = 'fixtures';
  process.env['WORKSPACE_BASE_DIR'] = mkdtempSync(path.join(tmpdir(), 'webaudit-e2e-'));

  // `startApi` (below, called with no explicit `billing`/`webhooks` deps)
  // wires the stub `PaymentProvider` by default outside production — the
  // price catalog it needs reads these directly from `process.env`
  // (`checkout-pricing.ts`'s `createEnvBillingPriceCatalog`), and the
  // webhook secret must be known here too so a spec can sign a real webhook
  // call the same way a real payment gateway would.
  process.env['BILLING_STARTER_PRICE_MICROS'] ??= '29000000';
  process.env['BILLING_PRO_PRICE_MICROS'] ??= '99000000';
  process.env['BILLING_BUSINESS_PRICE_MICROS'] ??= '299000000';
  process.env['BILLING_CREDIT_PRICE_MICROS'] ??= '1000';
  process.env['BILLING_WEBHOOK_SECRET'] ??= 'e2e-stack-webhook-secret';

  // WEB_URL must be set before `startApi` — `app.ts`'s `corsAllowlist()`
  // reads it while building the Express app inside `startApi`, once,
  // synchronously. Setting it after `startApi` has already returned is the
  // exact ordering bug this fixture's own first draft had: the allowlist
  // silently fell back to `http://localhost:3000` and every request from
  // this stack's real webBaseUrl was refused with no CORS header at all —
  // confirmed live while building this file.
  const webBaseUrl = `http://localhost:${String(WEB_PORT)}`;
  process.env['WEB_URL'] = webBaseUrl;

  const db = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } }, log: ['error'] });
  await resetDb(db);

  const mailer = createCapturingMailer();
  // `app.ts`'s real Redis-backed limiter (10 credential requests per 15
  // minutes, keyed on client IP) is real infrastructure this fixture is not
  // testing — every spec here shares one client IP (127.0.0.1) and one real
  // Redis instance, so without this a handful of spec files run back to back
  // exhausts the bucket and every later register/login call gets a 429. The
  // limiter's own behaviour has its own dedicated suite; this fixture proves
  // the auth *flow*, so it opts out via `createApp`'s documented escape
  // hatch rather than fighting the limiter's real state.
  const api: ApiService = await startApi({
    db,
    port: API_PORT,
    installSignalHandlers: false,
    mailer,
    rateLimiters: null,
  });
  const apiBaseUrl = `http://127.0.0.1:${String(api.port)}`;

  const worker: WorkerService = startWorker({
    connection: {
      url: process.env['REDIS_URL'] ?? 'redis://localhost:6389',
      maxRetriesPerRequest: null,
    },
    db,
    installSignalHandlers: false,
  });

  // NEXT_PUBLIC_* is inlined at BUILD time — must be set before `next build`
  // runs, not merely before `next start`.
  process.env['NEXT_PUBLIC_API_URL'] = apiBaseUrl;

  execSync('npx next build', { cwd: WEB_DIR, stdio: 'ignore' });
  const web: ServerHandle = await startServer(WEB_DIR, WEB_PORT);

  return {
    apiBaseUrl,
    webBaseUrl: web.url,
    db,
    mailer,
    async stop() {
      web.close();
      await worker.shutdown('e2e stack teardown');
      await api.shutdown('e2e stack teardown');
      await db.$disconnect();
    },
  };
}
