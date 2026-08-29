/**
 * Seed the four plan tiers.  (T020)
 *
 * Values come from the tier table in specs/001-webaudit-mvp-baseline/spec.md,
 * which resolved the constitution's TODO(PLAN_TIERS). Nothing here is invented.
 *
 * Plans are data, not code (FR-084) — an operator changes a tier without a
 * deploy. This script establishes the launch state and is idempotent, so it is
 * safe to re-run against an existing database.
 */

import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

/**
 * The free allocation is deliberately below the 80 credits a full audit costs.
 * A new user audits two or three areas of their choosing and sees real findings,
 * but complete coverage requires a plan. That is the conversion mechanism, not
 * an oversight — see spec.md, Plan Tiers and Entitlements.
 */
const PLANS = [
  {
    id: 'free',
    name: 'Free',
    monthlyCredits: 50,
    creditsRecur: false, // one-time grant
    allowedInputTypes: ['URL'] as const,
    allowLoadGeneration: false,
    allowReadinessPass: false,
    allowCreditPurchase: false, // keeps the free tier an evaluation, not a route around subscribing
    allowCustomCapability: false,
    concurrentScanLimit: 1,
    queuePriority: 40, // lower runs sooner
    retentionDays: 7,
  },
  {
    id: 'starter',
    name: 'Starter',
    monthlyCredits: 300,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE'] as const,
    allowLoadGeneration: false,
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: false,
    concurrentScanLimit: 1,
    queuePriority: 30,
    retentionDays: 30,
  },
  {
    id: 'pro',
    name: 'Pro',
    monthlyCredits: 1_200,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'] as const,
    allowLoadGeneration: true, // still gated on VERIFIED control per FR-017
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: false,
    concurrentScanLimit: 3,
    queuePriority: 20,
    retentionDays: 365,
  },
  {
    id: 'business',
    name: 'Business',
    monthlyCredits: 4_000,
    creditsRecur: true,
    allowedInputTypes: ['URL', 'ARCHIVE', 'REPOSITORY'] as const,
    allowLoadGeneration: true,
    allowReadinessPass: true,
    allowCreditPurchase: true,
    allowCustomCapability: true, // requires sandbox-runner; upload returns 503 until then
    concurrentScanLimit: 6,
    queuePriority: 10,
    retentionDays: 730,
  },
];

async function main(): Promise<void> {
  console.log('Seeding plan tiers...');

  for (const plan of PLANS) {
    const { id, ...rest } = plan;
    await prisma.plan.upsert({
      where: { id },
      create: { id, ...rest, allowedInputTypes: [...rest.allowedInputTypes] },
      update: { ...rest, allowedInputTypes: [...rest.allowedInputTypes] },
    });
    console.log(
      `  ${id.padEnd(9)} ${String(plan.monthlyCredits).padStart(5)} credits` +
        `${plan.creditsRecur ? '/mo' : ' once'}  retention ${plan.retentionDays}d`,
    );
  }

  const count = await prisma.plan.count();
  console.log(`\n${count} plans in database.`);

  // Sanity check the conversion gate is intact. If the free allocation ever
  // covers a full audit, the funnel silently changes shape.
  const free = await prisma.plan.findUnique({ where: { id: 'free' } });
  const FULL_AUDIT_COST = 80;
  if (free && free.monthlyCredits >= FULL_AUDIT_COST) {
    console.warn(
      `\nWARNING: free tier (${free.monthlyCredits}) now covers a full audit ` +
        `(${FULL_AUDIT_COST}). spec.md relies on it not doing so.`,
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
