/**
 * SPEC 009 U-1 (T-U1-6/7): the planned pass and the self-healing pass of the existing `timeout-sweep` job.
 *
 * The sweep stays ONE repeatable job. This port is what it consults when it is given one; with no port (or no
 * `RESOLVED` `INITIAL` `ScanPlan` rows in existence) the sweep's behaviour is byte-identical to today's (FR-040).
 * Every new deadline comparison here uses the database clock (`clock_timestamp()` in the same statement).
 */

import {
  expirePlanUnits,
  type ExpireOptions,
  type ModuleResultFinalizer,
} from '@webaudit/api/execution-runtime';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import type { ScanState } from '@webaudit/types';

export interface PlannedScanCandidate {
  readonly scanId: string;
  readonly scanPlanId: string;
}

export interface PlannedSweepPort {
  /** Of `scanIds`, those that have a RESOLVED INITIAL plan (they leave the legacy pass; "no plan" stays legacy). */
  withResolvedInitialPlan(scanIds: readonly string[]): Promise<ReadonlySet<string>>;
  /** Sweepable scans whose plan deadline has passed: `startedAt + deadlineMs < now()` on the database clock. */
  findExpiredPlannedScans(
    sweepable: readonly ScanState[],
    limit: number,
  ): Promise<readonly PlannedScanCandidate[]>;
  /** (a) `expirePlanUnits`, then (b) every registered module-result finalizer; both idempotent. */
  prepareForTimeout(scanPlanId: string): Promise<void>;
  /** The self-healing pass: no unit outlives its scan or its REVERIFY plan by more than one sweep interval. */
  selfHeal(limit: number): Promise<number>;
}

export interface PlannedSweepConfig {
  readonly expiry?: ExpireOptions;
  readonly finalizers?: readonly ModuleResultFinalizer[];
}

export function createPlannedSweepPort(
  db: PrismaClient,
  config: PlannedSweepConfig = {},
): PlannedSweepPort {
  return {
    async withResolvedInitialPlan(scanIds) {
      if (scanIds.length === 0) return new Set();
      const rows = await db.scanPlan.findMany({
        where: { scanId: { in: [...scanIds] }, kind: 'INITIAL', state: 'RESOLVED' },
        select: { scanId: true },
      });
      return new Set(rows.flatMap((r) => (r.scanId === null ? [] : [r.scanId])));
    },

    async findExpiredPlannedScans(sweepable, limit) {
      const states = [...sweepable];
      return db.$queryRaw<PlannedScanCandidate[]>`
        SELECT s.id AS "scanId", p.id AS "scanPlanId"
          FROM "ScanPlan" p JOIN "Scan" s ON s.id = p."scanId"
         WHERE p.kind = 'INITIAL' AND p.state = 'RESOLVED'
           AND s.state::text = ANY(${states})
           AND s."startedAt" IS NOT NULL
           AND s."startedAt" + (p."deadlineMs" * interval '1 millisecond') < clock_timestamp()
         ORDER BY s."startedAt" ASC
         LIMIT ${limit}`;
    },

    async prepareForTimeout(scanPlanId) {
      await expirePlanUnits(db, scanPlanId, config.expiry);
      for (const finalizer of config.finalizers ?? [])
        await finalizer.finalizeModuleResults(scanPlanId);
    },

    async selfHeal(limit) {
      const plans = await db.$queryRaw<Array<{ scanPlanId: string }>>`
        SELECT DISTINCT u."scanPlanId"
          FROM "ExecutionUnit" u
          JOIN "ScanPlan" p ON p.id = u."scanPlanId"
          LEFT JOIN "Scan" s ON s.id = p."scanId"
         WHERE u.status::text NOT IN ('SKIPPED','BLOCKED','REFUSED','COMPLETED','FAILED','CANCELLED','KILLED')
           AND ((p.kind = 'INITIAL' AND s.state::text IN ('FAILED','CANCELLED','TIMED_OUT'))
             OR (p.kind = 'REVERIFY' AND p."deadlineMs" IS NOT NULL
                 AND p."resolvedAt" + (p."deadlineMs" * interval '1 millisecond') < clock_timestamp()))
         LIMIT ${limit}`;
      for (const { scanPlanId } of plans) await expirePlanUnits(db, scanPlanId, config.expiry);
      return plans.length;
    },
  };
}
