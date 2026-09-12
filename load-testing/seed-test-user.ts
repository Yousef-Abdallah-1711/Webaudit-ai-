/**
 * specs/004-load-testing-harness — seeds the fixtures the load-testing
 * harness needs to reach the real scan workflow without any product code
 * change (spec.md FR-005).
 *
 * **Sixty-five users, one per VU, not a shared pool** (research.md Decision
 * 2, revised after a real curl smoke test — not just reading code — found a
 * second, compounding constraint on top of `assertConcurrencyHeadroom`'s
 * real per-user `concurrentScanLimit` ceiling: `POST /targets` canonicalizes
 * away the entire path/query string down to the bare origin, so a per-VU
 * query-string suffix does not produce distinct targets for VUs sharing a
 * user, and those VUs would then collide on `Scan_one_active_per_target`
 * (scoped to userId+targetId) the moment two are mid-scan at once. A clean
 * one-VU-per-user mapping sidesteps both constraints: every VU is, correctly,
 * indistinguishable from one real, independent customer's account. 65 gives
 * margin above the 60-VU top stage.
 *
 * Each user is seeded already `emailVerifiedAt` (real registration requires
 * clicking a real email link, which a load test has no inbox for — the same
 * bypass this repo's own adverse test suites already use) and with a large,
 * non-expiring credit grant so credit exhaustion never confounds a stage's
 * timing.
 *
 * Idempotent — safe to re-run against an existing database, mirroring
 * scripts/seed.ts's own convention.
 */

import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

export const LOAD_TEST_USER_COUNT = 65;
export const LOAD_TEST_PASSWORD = 'load-test-correct-horse-battery-staple';
export const LOAD_TEST_PLAN_ID = 'business';

function emailFor(index: number): string {
  return `loadtest-${String(index)}@webaudit-loadtest.local`;
}

export const LOAD_TEST_EMAILS = Array.from({ length: LOAD_TEST_USER_COUNT }, (_unused, i) =>
  emailFor(i + 1),
);

async function main(): Promise<void> {
  console.log(`Seeding ${String(LOAD_TEST_USER_COUNT)} load-test users on the '${LOAD_TEST_PLAN_ID}' plan...`);

  // Same hashing library and cost this repo's own login path actually uses
  // (apps/api/src/services/auth/crypto.ts: `@node-rs/bcrypt`, cost 12+) —
  // hashed once, reused for every seeded user (same password). Imported via
  // apps/api's own node_modules (this package is not a root dependency, the
  // same reason PrismaClient below is imported via a relative path into
  // apps/api rather than assumed to be resolvable from the repo root).
  const bcrypt = (await import('../apps/api/node_modules/@node-rs/bcrypt/index.js')) as {
    hash(password: string, cost: number): Promise<string>;
  };
  const passwordHash = await bcrypt.hash(LOAD_TEST_PASSWORD, 12);

  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

  for (let i = 1; i <= LOAD_TEST_USER_COUNT; i += 1) {
    const email = emailFor(i);
    const user = await prisma.user.upsert({
      where: { email },
      create: { email, passwordHash, emailVerifiedAt: new Date() },
      update: { passwordHash, emailVerifiedAt: new Date() },
    });

    const existingSubscription = await prisma.subscription.findFirst({ where: { userId: user.id } });
    if (existingSubscription === null) {
      await prisma.subscription.create({
        data: {
          userId: user.id,
          planId: LOAD_TEST_PLAN_ID,
          status: 'ACTIVE',
          periodStart: new Date(),
          periodEnd: farFuture,
        },
      });
    }

    const existingLot = await prisma.creditLot.findFirst({
      where: { userId: user.id, source: 'PLAN_RENEWAL' },
    });
    if (existingLot === null) {
      await prisma.creditLot.create({
        data: {
          userId: user.id,
          kind: 'PLAN',
          source: 'PLAN_RENEWAL',
          // Generous enough that no stage's worth of scans can exhaust it —
          // this is about isolating timing from a credit concern, not
          // testing the credit ledger itself (already covered elsewhere).
          amountGranted: 100_000,
          amountRemaining: 100_000,
          expiresAt: farFuture,
        },
      });
    }

    console.log(`  ${email} — ready`);
  }

  console.log(`\n${String(LOAD_TEST_USER_COUNT)} load-test users ready, password: (see LOAD_TEST_PASSWORD in this file).`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
