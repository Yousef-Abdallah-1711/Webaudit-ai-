/**
 * VERIFY-001 (PLAN.md §17) — a read-only integrity diagnostic for the credit
 * ledger. Not a scheduled job, not a new admin route — a script an operator
 * runs by hand when something looks wrong, or periodically as a health
 * check. `detect → report`, never `→ auto-correct` (per the task's own
 * instruction: "prefer detect, report, investigate, controlled correction
 * over silent automatic repair").
 *
 * Every check here is either something the database's own `CHECK`
 * constraints (added in `20260910120000_credit_lot_amount_bounds_check`)
 * already make structurally impossible going forward — checked anyway, since
 * this script's job is to prove the invariant holds, not to assume the
 * migration that enforces it was applied everywhere it should be — or
 * something no constraint can express (an allocation total that does not
 * match its transaction's own amount).
 *
 * Exit code is 0 with nothing printed when the ledger is clean, non-zero
 * with a report when it finds something, so this is safe to wire into a cron
 * health check later without building any alerting infrastructure now.
 */

import { PrismaClient } from '../apps/api/prisma/generated/client/index.js';

const prisma = new PrismaClient();

interface Finding {
  readonly check: string;
  readonly count: number;
  readonly sample: readonly unknown[];
}

async function checkLotBounds(): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<
    { id: string; userId: string; amountRemaining: number; amountGranted: number }[]
  >`
    SELECT id, "userId", "amountRemaining", "amountGranted"
    FROM "CreditLot"
    WHERE "amountRemaining" < 0 OR "amountRemaining" > "amountGranted" OR "amountGranted" < 0
    LIMIT 20
  `;
  if (rows.length === 0) return null;
  return {
    check: 'CreditLot bounds (amountRemaining/amountGranted)',
    count: rows.length,
    sample: rows,
  };
}

async function checkNonPositiveAmounts(): Promise<Finding | null> {
  const tx = await prisma.$queryRaw<{ id: string; amount: number }[]>`
    SELECT id, amount FROM "CreditTransaction" WHERE amount <= 0 LIMIT 20
  `;
  const alloc = await prisma.$queryRaw<{ id: string; amount: number }[]>`
    SELECT id, amount FROM "CreditAllocation" WHERE amount <= 0 LIMIT 20
  `;
  const rows = [...tx, ...alloc];
  if (rows.length === 0) return null;
  return {
    check: 'CreditTransaction/CreditAllocation non-positive amount',
    count: rows.length,
    sample: rows,
  };
}

/**
 * No `CHECK` constraint can express this — it's a cross-row invariant, not a
 * single-row bound. A DEBIT's allocations should sum to exactly its own
 * `amount` (debit.ts always allocates the full requested amount across the
 * lots it draws from); a mismatch means some code path wrote a debit without
 * going through `debit()`.
 */
async function checkDebitAllocationSums(): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<{ id: string; amount: number; allocated: number }[]>`
    SELECT t.id, t.amount, COALESCE(SUM(a.amount), 0)::int AS allocated
    FROM "CreditTransaction" t
    LEFT JOIN "CreditAllocation" a ON a."transactionId" = t.id
    WHERE t.type = 'DEBIT'
    GROUP BY t.id, t.amount
    HAVING t.amount != COALESCE(SUM(a.amount), 0)
    LIMIT 20
  `;
  if (rows.length === 0) return null;
  return {
    check: 'DEBIT amount vs. sum of its own CreditAllocation rows',
    count: rows.length,
    sample: rows,
  };
}

/** Structurally impossible per the schema's own FK (no nullable variant), checked anyway. */
async function checkOrphanAllocations(): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT a.id FROM "CreditAllocation" a
    LEFT JOIN "CreditLot" l ON l.id = a."lotId"
    LEFT JOIN "CreditTransaction" t ON t.id = a."transactionId"
    WHERE l.id IS NULL OR t.id IS NULL
    LIMIT 20
  `;
  if (rows.length === 0) return null;
  return {
    check: 'orphan CreditAllocation (dangling lotId/transactionId)',
    count: rows.length,
    sample: rows,
  };
}

async function checkDoubleRefunds(): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<{ reversesId: string; n: number }[]>`
    SELECT "reversesId", count(*)::int AS n
    FROM "CreditTransaction"
    WHERE type = 'REFUND' AND "reversesId" IS NOT NULL
    GROUP BY "reversesId"
    HAVING count(*) > 1
    LIMIT 20
  `;
  if (rows.length === 0) return null;
  return {
    check: 'a debit refunded more than once (should be impossible: reversesId is @unique)',
    count: rows.length,
    sample: rows,
  };
}

async function checkMissingAuditForAdminGrants(): Promise<Finding | null> {
  const rows = await prisma.$queryRaw<{ id: string; userId: string }[]>`
    SELECT l.id, l."userId"
    FROM "CreditLot" l
    WHERE l.source = 'ADMIN_GRANT'
      AND NOT EXISTS (
        SELECT 1 FROM "AuditLogEntry" e
        WHERE e."subjectType" = 'User' AND e."subjectId" = l."userId" AND e.action = 'credits.adjust'
      )
    LIMIT 20
  `;
  if (rows.length === 0) return null;
  return {
    check: 'ADMIN_GRANT lot with no matching credits.adjust audit entry for its user',
    count: rows.length,
    sample: rows,
  };
}

async function main(): Promise<void> {
  const checks = [
    checkLotBounds,
    checkNonPositiveAmounts,
    checkDebitAllocationSums,
    checkOrphanAllocations,
    checkDoubleRefunds,
    checkMissingAuditForAdminGrants,
  ];

  const findings: Finding[] = [];
  for (const check of checks) {
    const result = await check();
    if (result) findings.push(result);
  }

  if (findings.length === 0) {
    console.log('Credit ledger integrity check: clean. No findings.');
    return;
  }

  console.error(`Credit ledger integrity check: ${String(findings.length)} finding(s).`);
  for (const f of findings) {
    console.error(`\n[${f.check}] ${String(f.count)} row(s):`);
    console.error(JSON.stringify(f.sample, null, 2));
  }
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Credit ledger integrity check failed to run:', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
