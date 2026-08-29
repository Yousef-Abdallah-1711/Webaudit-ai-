/**
 * A real `resolveRequiredControlLevel`, backed by the `Capability` table.
 *
 * `apps/api/src/routes/scans.routes.ts`'s `ScanRoutesDeps.resolveRequiredControlLevel`
 * seam already exists and is already correctly consumed by
 * `services/intake/create-scan.ts` for the FR-017 whole-scan gate. Until this
 * module, `apps/api/src/index.ts` never built a real implementation, so the
 * `() => 'NONE'` default in `scans.routes.ts` always won in production and
 * the gate was never actually enforced outside of tests that inject their
 * own stub.
 *
 * The contract (established by `apps/api/tests/contract/scans.refusals.test.ts`)
 * is one control level per module type: "the level below which nothing in
 * this module can run" — the *minimum* `requiredControlLevel` among that
 * module's enabled capabilities. If the target's level reaches that minimum,
 * at least one capability in the module unlocks, so the module must not be
 * treated as wholly gated out. A module with no registered (or no enabled)
 * capabilities gates nothing — it returns `NONE`.
 */

import { isModuleType, controlLevelRank, type ControlLevel } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';

export function buildResolveRequiredControlLevel(
  db: Pick<PrismaClient, 'capability'>,
): (moduleType: string) => Promise<ControlLevel> {
  return async (moduleType: string): Promise<ControlLevel> => {
    // The seam is typed `string` (matching `ScanRoutesDeps`), but the
    // `Capability.module` column is an enum. Every real caller (the Zod-
    // validated `/scans` route body, `create-scan.ts`'s own `ModuleType`)
    // only ever passes a valid module type through; an invalid one gates
    // nothing rather than throwing, same as a module with no capabilities.
    if (!isModuleType(moduleType)) return 'NONE';
    const rows = await db.capability.findMany({
      where: { module: moduleType, isEnabled: true },
      select: { requiredControlLevel: true },
    });
    if (rows.length === 0) return 'NONE';
    let min: ControlLevel = rows[0]!.requiredControlLevel;
    for (const row of rows) {
      const level = row.requiredControlLevel;
      if (controlLevelRank(level) < controlLevelRank(min)) min = level;
    }
    return min;
  };
}
