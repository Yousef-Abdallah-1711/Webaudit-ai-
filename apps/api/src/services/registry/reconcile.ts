/**
 * T069 — reconcile what is on disk against what the database knows.
 *
 * The division of responsibility, which is the only thing worth remembering
 * about this file:
 *
 *   **Disk is the source of existence. The database is the source of enablement.**
 *
 * Discovery decides what exists; an operator decides what runs. That split falls
 * out of two constraints that would otherwise fight:
 *
 *   - FR-019 says adding, removing, updating, enabling or disabling a capability
 *     "requires no product release", and SC-010 gives an operator an hour to put
 *     a new one in front of customers. So enablement lives in the database, where
 *     it can change without a deploy.
 *   - `CapabilityExecution.capability` has no cascade, and Principle VI needs the
 *     per-capability cost history it holds. So a capability row is never deleted.
 *     A removed directory simply stops being discovered, and the registry only
 *     serves capabilities that are in *both* sets.
 *
 * The consequence to be careful about: **reconciliation must never write
 * `isEnabled`.** A restart is not a decision. If reconciliation reset it, every
 * deploy would silently re-enable whatever an operator had turned off — and the
 * capability they disabled because it was burning tokens would come back on its
 * own. `isEnabled` appears in `create` (where a default is needed) and nowhere
 * in `update`.
 *
 * `trust` is the opposite case: it is always written from the discovered value,
 * because the derived answer outranks whatever is stored. A row whose trust
 * drifted — a bad migration, a hand-edit — is corrected on the next boot rather
 * than trusted.
 */

import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { DiscoveryResult } from './discover.js';

export interface ReconcileResult {
  readonly created: readonly string[];
  readonly updated: readonly string[];
  /**
   * Rows whose capability is no longer on disk. Deliberately left in place — see
   * the module note. The registry will not serve them.
   */
  readonly absent: readonly string[];
}

type ReconcileDb = Pick<PrismaClient, 'capability'>;

export async function reconcileCapabilities(
  db: ReconcileDb,
  discovery: DiscoveryResult,
): Promise<ReconcileResult> {
  const existing = await db.capability.findMany({ select: { id: true } });
  const existingIds = new Set(existing.map((row) => row.id));

  const created: string[] = [];
  const updated: string[] = [];

  for (const found of discovery.capabilities) {
    const m = found.manifest;

    // Everything the manifest self-describes (FR-020), plus the derived trust.
    const metadata = {
      name: m.name,
      version: m.version,
      module: m.module,
      layer: m.layer,
      trust: found.trust,
      originalSource: m.originalSource ?? null,
      license: m.license ?? null,
      requiresCode: m.requiresCode,
      requiresScreenshot: m.requiresScreenshot,
      requiredControlLevel: m.requiredControlLevel,
      estimatedTokens: m.estimatedTokens,
      vendoredAt: m.vendoredAt === undefined ? null : parseDate(m.vendoredAt),
      installedAt: found.trust === 'INSTALLED' ? new Date() : null,
    };

    if (existingIds.has(found.id)) {
      // No `isEnabled` here. That is the point of this file.
      await db.capability.update({ where: { id: found.id }, data: metadata });
      updated.push(found.id);
    } else {
      await db.capability.create({
        data: {
          id: found.id,
          ...metadata,
          // A new capability arrives enabled. An operator disabling it is then
          // recorded and never overwritten.
          isEnabled: true,
        },
      });
      created.push(found.id);
    }
  }

  const discoveredIds = new Set(discovery.capabilities.map((c) => c.id));
  const absent = [...existingIds].filter((id) => !discoveredIds.has(id)).sort();

  return { created, updated, absent };
}

/**
 * `vendoredAt` is a hand-written date in a JSON file, so it is parsed
 * defensively: an unusable value becomes null rather than an invalid `Date` that
 * Prisma will reject at insert time and take the whole boot down with.
 */
function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
