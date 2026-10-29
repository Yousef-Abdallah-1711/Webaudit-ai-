/** The reason code of the pending stop that covers a unit (execution, scan, grant, target, tenant or platform scope), if any. */

import type { SafetyDb } from '../safety/db.js';
import { findPendingStop } from '../safety/kill-switch-state.js';

export async function findPendingStopReason(
  db: SafetyDb,
  unit: { id: string; userId: string; scanPlanId: string },
): Promise<string | null> {
  const row = await db.executionUnit.findFirst({
    where: { id: unit.id, userId: unit.userId },
    select: { targetId: true, targetAuthorizationId: true, scanPlan: { select: { scanId: true } } },
  });
  if (row === null) return null;
  const stop = await findPendingStop(db, {
    executionId: unit.id,
    scanId: row.scanPlan.scanId,
    grantId: row.targetAuthorizationId ?? '',
    targetId: row.targetId,
    userId: unit.userId,
  });
  if (stop === null) return null;
  const ks = await db.killSwitchState.findUnique({
    where: { scope_scopeId: { scope: stop.scope, scopeId: stop.scopeId } },
    select: { reason: true },
  });
  return ks?.reason ?? 'SYSTEM_SAFETY_POLICY';
}
