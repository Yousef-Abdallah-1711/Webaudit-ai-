/**
 * Test database helpers.
 *
 * Contract tests run against a real PostgreSQL instance, not a mock. The credit
 * ledger's correctness depends on serializable transactions and `FOR UPDATE`
 * ordering (R2); a mock would prove nothing about either.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';
import { PLAN_TIERS } from '@webaudit/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';

export const testDb = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
  log: ['error'],
});

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const prismaCliPath = require.resolve('prisma');
const prismaSchemaPath = fileURLToPath(new URL('../../prisma/schema.prisma', import.meta.url));
const repositoryRoot = fileURLToPath(new URL('../../../..', import.meta.url));
let migrationPromise: Promise<void> | undefined;

/**
 * Keep the isolated test database aligned with the checked-in migrations.
 * This runs only when a DB-backed suite resets data, and always targets the
 * same URL as testDb rather than DATABASE_URL (which may be the dev database).
 */
async function ensureTestDatabaseMigrated(): Promise<void> {
  migrationPromise ??= execFileAsync(
    process.execPath,
    [prismaCliPath, 'migrate', 'deploy', '--schema', prismaSchemaPath],
    {
      cwd: repositoryRoot,
      env: { ...process.env, DATABASE_URL: TEST_DB_URL },
      windowsHide: true,
    },
  )
    .then(() => undefined)
    .catch((error: unknown) => {
      migrationPromise = undefined;
      throw new Error('Failed to apply Prisma migrations to TEST_DATABASE_URL before resetDb().', {
        cause: error,
      });
    });

  await migrationPromise;
}

/**
 * Tables in dependency order, children first. Plan rows survive — they are
 * reference data seeded once, and every test needs them.
 */
const TABLES_TO_CLEAR = [
  'CreditAllocation',
  'CreditTransaction',
  'CreditLot',
  'VerificationAttempt',
  'Issue',
  'ModuleResult',
  'AiInvocation',
  'CapabilityExecution',
  // Capability rows are discovered from disk at boot, not seeded reference data,
  // so a suite that plants capabilities must not inherit the previous one's.
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
  'CostAlertEvent',
  'CostAlertThreshold',
] as const;

export async function resetDb(): Promise<void> {
  await ensureTestDatabaseMigrated();

  // TRUNCATE ... CASCADE in one statement: faster than per-table deletes and
  // immune to the FK ordering above being wrong.
  const list = TABLES_TO_CLEAR.map((t) => `"${t}"`).join(', ');
  await testDb.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE;`);
}

/**
 * The four tiers from spec.md, from the one shared definition in
 * `@webaudit/config` (so a test never drifts from `scripts/seed.ts`).
 * Idempotent, so any test may call it.
 */
export async function seedPlans(): Promise<void> {
  await testDb.plan.deleteMany({
    where: { id: { notIn: PLAN_TIERS.map((tier) => tier.id) } },
  });

  for (const tier of PLAN_TIERS) {
    const { id, ...rest } = tier;
    const row = { ...rest, allowedInputTypes: [...rest.allowedInputTypes] };
    await testDb.plan.upsert({ where: { id }, create: { id, ...row }, update: row });
  }
}

export async function closeDb(): Promise<void> {
  await testDb.$disconnect();
}
