/**
 * SPEC 008 FR-005a — the plain, non-locked, advisory read of `BudgetCounter`
 * that feeds F01's own `BUDGET_EXHAUSTED` verdict (T008). It never locks and
 * may be stale in either direction; the authoritative, lock-guarded check is
 * inside `f07_admit`, which is why admission treats F01's `BUDGET_EXHAUSTED` as
 * "proceed to the authoritative check" (admission contract step 2).
 *
 * The result matches `derive-state.ts`'s `BudgetConsumption` snapshot shape, so
 * `isAuthorized` is used unchanged (SPEC 007 stays untouched).
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { BudgetConsumption } from '../authorization/derive-state.js';
import type { SafetyDb } from './db.js';

interface SnapshotRow {
  grantId: string;
  consumedRequests: number;
  activeConcurrency: number;
}

export async function loadBudgetConsumption(
  db: SafetyDb,
  input: { targetId: string; userId: string },
): Promise<Map<string, BudgetConsumption>> {
  const rows = await db.$queryRaw<Array<{ r: SnapshotRow[] }>>(Prisma.sql`
    SELECT public.f07_budget_snapshot(${input.targetId}, ${input.userId}) AS r`);
  const map = new Map<string, BudgetConsumption>();
  for (const row of rows[0]?.r ?? []) {
    map.set(row.grantId, {
      requestsConsumed: row.consumedRequests,
      concurrencyInUse: row.activeConcurrency,
    });
  }
  return map;
}
