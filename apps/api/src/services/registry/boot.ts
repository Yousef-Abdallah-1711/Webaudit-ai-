/**
 * T119-125 — wires `discoverCapabilities`/`reconcileCapabilities` (T068/T069,
 * built in Phase 2G) into API boot for the first time.
 *
 * **A real, pre-existing gap this closes.** Both functions have existed
 * since Phase 2G, fully built and tested in isolation, but nothing ever
 * called them together against a real filesystem root — `packages/
 * capabilities-vendored/` was empty until T119-124, so there was nothing to
 * discover and no pressure to wire the boot sequence. It surfaced as a
 * `CapabilityExecution_capabilityId_fkey` foreign-key violation the first
 * time a real capability actually ran a scan: `persistModuleResult` writes
 * a `CapabilityExecution` row keyed on the capability's id, and the row
 * only exists once this reconciliation has run at least once. Discovery is
 * disk → memory; reconciliation is memory → the `Capability` table
 * (`reconcile.ts`'s own module note: "disk is the source of existence, the
 * database is the source of enablement") — a scan can be charged for and
 * executed against a capability the database has never heard of without it.
 *
 * **Soft-fails**, unlike `REDIS_URL`'s hard boot refusal. A discovery/
 * reconciliation problem should not take down auth, billing, or anything
 * else the API serves that has nothing to do with capabilities — and
 * `discoverCapabilities` itself already never throws for one bad capability
 * (`rejected`/`trustClaims` are reported, not raised). Only a database
 * failure during reconciliation could throw here, and a boot failure for
 * every route because one capability row could not be upserted is a worse
 * outcome than degrading to "capabilities were not reconciled this boot,"
 * logged loudly.
 */

import { fileURLToPath } from 'node:url';
import type { PrismaClient } from '../../../prisma/generated/client/index.js';
import { discoverCapabilities } from './discover.js';
import { reconcileCapabilities } from './reconcile.js';

/** `packages/capabilities-vendored/`, resolved relative to this file. */
function defaultVendoredRoot(): string {
  return fileURLToPath(new URL('../../../../../packages/capabilities-vendored', import.meta.url));
}

/**
 * No installed-capability store exists yet (FR-027's sandboxed path is a
 * later feature) — pointed at a directory that need not exist.
 * `discoverCapabilities` already treats a missing root as "found nothing"
 * rather than an error.
 */
function defaultInstalledRoot(): string {
  return (
    process.env['INSTALLED_CAPABILITIES_ROOT'] ??
    fileURLToPath(new URL('../../../../../var/capabilities-installed', import.meta.url))
  );
}

export interface ReconcileAtBootOptions {
  readonly vendoredRoot?: string;
  readonly installedRoot?: string;
}

export async function reconcileCapabilitiesAtBoot(
  db: Pick<PrismaClient, 'capability'>,
  options: ReconcileAtBootOptions = {},
): Promise<void> {
  try {
    const discovery = await discoverCapabilities({
      vendoredRoot: options.vendoredRoot ?? defaultVendoredRoot(),
      installedRoot: options.installedRoot ?? defaultInstalledRoot(),
    });
    if (discovery.rejected.length > 0) {
      console.warn(
        `[registry] ${String(discovery.rejected.length)} capability directory(ies) rejected at ` +
          `boot: ${discovery.rejected.map((r) => `${r.id || r.directory}: ${r.reason}`).join('; ')}`,
      );
    }
    const result = await reconcileCapabilities(db, discovery);
    console.warn(
      `[registry] reconciled ${String(result.created.length)} new, ` +
        `${String(result.updated.length)} updated, ${String(result.absent.length)} absent capabilities.`,
    );
  } catch (error) {
    console.error(
      `[registry] capability reconciliation failed at boot; capabilities from a previous ` +
        `reconcile (if any) are still served, but nothing new was picked up: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
