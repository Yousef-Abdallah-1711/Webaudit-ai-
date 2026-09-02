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
import { ensurePlatformCapabilities } from '../apps/api/src/services/registry/platform-capabilities.js';
import { PLAN_TIERS } from '@webaudit/config';

const prisma = new PrismaClient();

/**
 * The tier table now lives in `@webaudit/config` (`PLAN_TIERS`) so this script,
 * the test helper, and the billing services never drift. The free allocation is
 * deliberately below the 80 credits a full audit costs — the conversion
 * mechanism, not an oversight (spec.md, Plan Tiers and Entitlements).
 */
const PLANS = PLAN_TIERS;

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

  // The module-ai:<module> sentinel capability rows — the FK target for every
  // scan's per-module AI execution row (review finding C1). `startApi` also
  // ensures these at boot; seeding them keeps a fresh DB consistent before the
  // API has ever run.
  await ensurePlatformCapabilities(prisma);
  console.log('Ensured module-ai platform capability rows.');

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
