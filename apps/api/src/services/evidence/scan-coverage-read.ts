/**
 * N03 (FR-038/039): the tenant-scoped coverage read model shared by `GET /scans/:id/coverage` and the report.
 * Facts only (what completed, what did not and why). Never discloses engine ids, configuration or credential
 * references, and never a score or verdict. A legacy scan (no plan) answers an empty list; ordering is the plans'
 * resolution order, then the stable order `scanCoverageSummary` returns.
 */
import type { SafetyDb } from '../safety/db.js';
import { scanCoverageSummary } from './materialize.js';

export interface ScanCoveragePlan {
  planId: string;
  kind: string;
  completedUnits: Array<{ id: string; executionUnitClass: string }>;
  nonCompletedUnits: Array<{
    id: string;
    executionUnitClass: string;
    status: string;
    reason: string | null;
  }>;
}

export async function readScanCoverage(
  db: SafetyDb,
  scanId: string,
  userId: string,
): Promise<ScanCoveragePlan[]> {
  const plans = await db.scanPlan.findMany({
    where: { scanId, userId, state: 'RESOLVED' },
    orderBy: [{ resolvedAt: 'asc' }, { id: 'asc' }],
    select: { id: true, kind: true },
  });
  return Promise.all(
    plans.map(async (plan) => {
      const summary = await scanCoverageSummary(db, plan.id, userId);
      return {
        planId: plan.id,
        kind: plan.kind,
        completedUnits: summary.completedUnits.map((u) => ({
          id: u.id,
          executionUnitClass: u.executionUnitClass,
        })),
        nonCompletedUnits: summary.nonCompletedUnits.map((n) => ({
          id: n.unit.id,
          executionUnitClass: n.unit.executionUnitClass,
          status: n.status,
          reason: n.reason,
        })),
      };
    }),
  );
}
