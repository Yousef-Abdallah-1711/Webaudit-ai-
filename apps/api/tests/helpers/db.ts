/**
 * Test database helpers.
 *
 * Contract tests run against a real PostgreSQL instance, not a mock. The credit
 * ledger's correctness depends on serializable transactions and `FOR UPDATE`
 * ordering (R2); a mock would prove nothing about either.
 */

import { PrismaClient } from '../../prisma/generated/client/index.js';

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

/** The four tiers from spec.md. Idempotent, so any test may call it. */
export async function seedPlans(): Promise<void> {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      monthlyCredits: 50,
      creditsRecur: false,
      allowedInputTypes: ['URL' as const],
      allowLoadGeneration: false,
      allowReadinessPass: false,
      allowCreditPurchase: false,
      allowCustomCapability: false,
      concurrentScanLimit: 1,
      queuePriority: 40,
      retentionDays: 7,
    },
    {
      id: 'pro',
      name: 'Pro',
      monthlyCredits: 1200,
      creditsRecur: true,
      allowedInputTypes: ['URL' as const, 'ARCHIVE' as const, 'REPOSITORY' as const],
      allowLoadGeneration: true,
      allowReadinessPass: true,
      allowCreditPurchase: true,
      allowCustomCapability: false,
      concurrentScanLimit: 3,
      queuePriority: 20,
      retentionDays: 365,
    },
  ];
  for (const p of plans) {
    const { id, ...rest } = p;
    await testDb.plan.upsert({ where: { id }, create: { id, ...rest }, update: rest });
  }
}

export async function closeDb(): Promise<void> {
  await testDb.$disconnect();
}
