/**
 * `completePassiveUnits` (DEC-071, owner Decision A): the Worker Orchestrator completes genuinely passive units.
 * The TypeScript face of `fahes_complete_passive_unit`; the prerequisite, scan-state and deadline checks live in the
 * database function so a caller cannot skip them. Only the orchestrator role may execute it.
 */

import { Prisma } from '../../../prisma/generated/client/index.js';
import type { SafetyDb } from '../safety/db.js';

export interface PassiveCompletionResult {
  completed: string[];
  refused: string[];
  /** Units left PLANNED because a prerequisite (module result, dependency, scan state) does not hold yet. */
  deferred: string[];
}

const NOT_YET = /passive_(module_not_terminal|prerequisite_unmet|scan_not_running)/;

export async function completePassiveUnits(
  db: SafetyDb,
  scanPlanId: string,
): Promise<PassiveCompletionResult> {
  const out: PassiveCompletionResult = { completed: [], refused: [], deferred: [] };
  const units = await db.executionUnit.findMany({
    where: {
      scanPlanId,
      status: 'PLANNED',
      executionUnitClass: { in: ['PASSIVE_HTTP', 'SOURCE_STATIC'] },
    },
    select: { id: true, idempotencyKey: true },
    orderBy: { id: 'asc' },
  });
  for (const unit of units) {
    try {
      const rows = await db.$queryRaw<Array<{ r: { status: string; replayed: boolean } }>>(
        Prisma.sql`SELECT public.fahes_complete_passive_unit(${unit.id}, ${unit.idempotencyKey}) AS r`,
      );
      const status = rows[0]?.r.status;
      if (status === 'COMPLETED') out.completed.push(unit.id);
      else if (status === 'REFUSED') out.refused.push(unit.id);
    } catch (error) {
      if (NOT_YET.test(String((error as Error).message))) out.deferred.push(unit.id);
      else throw error;
    }
  }
  return out;
}
