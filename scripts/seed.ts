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

  // T027: an operational starting default, not a confirmed business figure —
  // finance/product should still replace these before launch. Reasoned from
  // the system's own known unit economics rather than an arbitrary round
  // number: a full audit costs 80 credits, and at 100,000 micros/credit
  // (matching FULL_AUDIT_COST_MICROS in cost-alerts.test.ts) that is
  // 8,000,000 micros of AI spend per audit. FR-C04 requires the window not to
  // fire on one large *legitimate* scan, so both ceilings sit at a multiple of
  // that per-audit cost chosen to clear ordinary heavy usage with headroom:
  //   PER_USER: 5 audits' worth in 60 minutes — a genuine power user rarely
  //   runs that many full audits inside one hour; a sustained pattern at or
  //   above this is the credential-stuffing/scripted-abuse shape FR-C01
  //   exists to catch, not a busy customer.
  //   GLOBAL: 100 audits' worth in 60 minutes — 20x the per-user ceiling, i.e.
  //   the platform-wide equivalent of 20 power users each independently
  //   hitting their own ceiling at once. Both keep the mechanism proportional
  //   to a number this codebase actually defines, rather than an invented
  //   dollar figure.
  const FULL_AUDIT_COST_MICROS = 8_000_000;
  for (const threshold of [
    { scope: 'PER_USER', windowMinutes: 60, thresholdMicros: FULL_AUDIT_COST_MICROS * 5 },
    { scope: 'GLOBAL', windowMinutes: 60, thresholdMicros: FULL_AUDIT_COST_MICROS * 100 },
  ]) {
    await prisma.costAlertThreshold.upsert({
      where: { scope: threshold.scope },
      create: threshold,
      update: threshold,
    });
  }
  console.log(
    'Seeded cost-alert thresholds reasoned from FULL_AUDIT_COST_MICROS (T027 — operational ' +
      'starting default, finance/product should confirm the real figures before launch).',
  );

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
