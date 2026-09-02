/**
 * Test database helpers.
 *
 * Contract tests run against a real PostgreSQL instance, not a mock. The credit
 * ledger's correctness depends on serializable transactions and `FOR UPDATE`
 * ordering (R2); a mock would prove nothing about either.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';
import { PLAN_TIERS } from '@webaudit/config';

const TEST_DB_URL =
  process.env['TEST_DATABASE_URL'] ??
  'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit_test?schema=public';

export const testDb = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
  log: ['error'],
});

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
  'BillingEvent',
  'RefreshToken',
  'EmailToken',
  'OAuthIdentity',
  'User',
  'AuditLogEntry',
] as const;

export async function resetDb(): Promise<void> {
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
  for (const tier of PLAN_TIERS) {
    const { id, ...rest } = tier;
    const row = { ...rest, allowedInputTypes: [...rest.allowedInputTypes] };
    await testDb.plan.upsert({ where: { id }, create: { id, ...row }, update: row });
  }
}

export async function closeDb(): Promise<void> {
  await testDb.$disconnect();
}
