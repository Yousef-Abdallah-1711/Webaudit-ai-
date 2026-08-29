/**
 * T070 — the registry. R10: "exposes lookup **only** by module and layer. No core
 * code may name a capability."
 *
 * Constitution Principle I, and the reason this file has the API it has. There is
 * no `getHeadersChecker()`, no `CAPABILITY_IDS` constant, no switch on an id.
 * The only questions you can ask are "what runs for SECURITY?" and "what runs
 * for SECURITY's code layer?", which is exactly what an orchestrator needs and
 * nothing more.
 *
 * **`resolveForExecution` and why it is not a violation.** Re-verification has to
 * route a stored issue back to the check that raised it (FR-059), and that means
 * looking a capability up by id. The distinction Principle I draws is between
 * *naming* a capability in source — a literal that couples core to a concrete
 * capability — and *resolving* an id that came out of the database. The first
 * makes the core depend on a capability existing; the second is the core
 * following its own data. The parameter is typed `PersistedCapabilityId` to make
 * that visible at the call site: you cannot pass a string literal to it without
 * a cast, and a cast is greppable.
 *
 * **Served capabilities are the intersection of disk and database.** A row
 * without a directory is not served (the code is gone), and a directory without
 * a row is not served (it has not been reconciled). That is what makes FR-023
 * and FR-024 hold at lookup time and not only at boot: nothing can be resolved
 * that does not have local code behind it.
 */

import type { CapabilityLayer, ModuleType, TrustLevel } from '@webaudit/types';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import type { DiscoveredCapability } from './discover.js';

/**
 * An id that came from persisted data, not from a source literal.
 *
 * A branded string, so `resolveForExecution('headers-checker')` does not compile.
 * The brand is the documentation: if you are writing a literal here, you are
 * naming a capability, and Principle I says the contract is wrong instead.
 */
declare const PERSISTED: unique symbol;
export type PersistedCapabilityId = string & { readonly [PERSISTED]: 'from-database' };

/** Narrow a string that genuinely came out of the database. */
export function persistedId(fromDatabase: string): PersistedCapabilityId {
  return fromDatabase as PersistedCapabilityId;
}

export interface RegisteredCapability {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly module: ModuleType;
  readonly layer: CapabilityLayer;
  readonly trust: TrustLevel;
  readonly requiresCode: boolean;
  readonly requiresScreenshot: boolean;
  readonly requiredControlLevel: 'NONE' | 'ATTESTED' | 'VERIFIED';
  readonly estimatedTokens: number;
  readonly isEnabled: boolean;
  /** Plan ids this capability is restricted to. Empty means every plan (FR-026). */
  readonly restrictedToPlans: readonly string[];
  readonly entrypointPath: string;
}

type RegistryDb = Pick<PrismaClient, 'capability'>;

/**
 * Built once per boot from the reconciled discovery, then read many times.
 *
 * Not a live database query per lookup: a scan resolves its snapshot at start
 * and holds it (R10), so a per-lookup query would be both wasted work and a
 * source of mid-scan drift. `refresh` exists for the operator toggle path, which
 * is the only thing that legitimately changes the answer.
 */
export class CapabilityRegistry {
  private byId = new Map<string, RegisteredCapability>();

  private constructor(entries: readonly RegisteredCapability[]) {
    for (const entry of entries) this.byId.set(entry.id, entry);
  }

  static async build(
    db: RegistryDb,
    discovered: readonly DiscoveredCapability[],
  ): Promise<CapabilityRegistry> {
    const onDisk = new Map(discovered.map((c) => [c.id, c]));
    const rows = await db.capability.findMany({
      where: { id: { in: [...onDisk.keys()] } },
      include: { plans: { select: { planId: true } } },
    });

    const entries: RegisteredCapability[] = [];
    for (const row of rows) {
      const disk = onDisk.get(row.id);
      // Belt and braces: `where id in` already guarantees this, but the
      // intersection is the guarantee and it is cheap to state twice.
      if (disk === undefined) continue;
      entries.push({
        id: row.id,
        name: row.name,
        version: row.version,
        module: row.module,
        layer: row.layer,
        trust: row.trust,
        requiresCode: row.requiresCode,
        requiresScreenshot: row.requiresScreenshot,
        requiredControlLevel: row.requiredControlLevel,
        estimatedTokens: row.estimatedTokens,
        isEnabled: row.isEnabled,
        restrictedToPlans: row.plans.map((p) => p.planId),
        entrypointPath: disk.entrypointPath,
      });
    }
    return new CapabilityRegistry(entries);
  }

  /** Everything served, enabled or not. For the operator console (US7). */
  all(): readonly RegisteredCapability[] {
    return [...this.byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  }

  /**
   * The only lookup an orchestrator should use.
   *
   * @param layer when given, matches capabilities implementing that layer —
   *   `BOTH` satisfies both `CODE` and `AI`, because a capability with two layers
   *   is a participant in each.
   */
  forModule(module: ModuleType, layer?: CapabilityLayer): readonly RegisteredCapability[] {
    return this.all().filter((c) => {
      if (c.module !== module) return false;
      if (layer === undefined) return true;
      return c.layer === layer || c.layer === 'BOTH';
    });
  }

  /** Re-verification's route back to the check that raised an issue (FR-059). */
  resolveForExecution(id: PersistedCapabilityId): RegisteredCapability | null {
    return this.byId.get(id) ?? null;
  }

  /** Whether anything at all is registered. A boot-time sanity signal. */
  get size(): number {
    return this.byId.size;
  }
}
