/** The reason code of the pending stop that covers a unit (execution, scan, grant, target, tenant or platform scope), if any. */

import type { SafetyDb } from '../safety/db.js';
import { Prisma } from '../../../prisma/generated/client/index.js';

export async function findPendingStopReason(
  db: SafetyDb,
  unit: { id: string; userId: string; scanPlanId: string },
): Promise<string | null> {
  const row = await db.executionUnit.findFirst({
    where: { id: unit.id, userId: unit.userId },
    select: { targetId: true, targetAuthorizationId: true, scanPlan: { select: { scanId: true } } },
  });
  if (row === null) return null;
  // Definer function: workers never read KillSwitchState; it applies the same predicate as f07_stop_pending.
  const rows = await db.$queryRaw<Array<{ reason: string | null }>>(Prisma.sql`
    SELECT public.fahes_pending_stop_reason(${unit.id}, ${row.scanPlan.scanId}, ${row.targetAuthorizationId ?? ''},
      ${row.targetId}, ${unit.userId}) AS reason`);
  return rows[0]?.reason ?? null;
}
