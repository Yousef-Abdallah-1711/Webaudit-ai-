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
import { startApi, type ApiService } from '@webaudit/api';
import { startWorker, type WorkerService } from '@webaudit/worker';
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

  const api: ApiService = await startApi({ db, port: API_PORT, installSignalHandlers: false });
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
    async stop() {
      web.close();
      await worker.shutdown('e2e stack teardown');
      await api.shutdown('e2e stack teardown');
      await db.$disconnect();
    },
  };
}
