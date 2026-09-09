/**
 * T119-125, re-founded on real discovery at T249 — the bridge from "a
 * capability exists in `packages/capabilities-vendored/`" to "the
 * orchestrator can run it".
 *
 * **Real filesystem discovery, not a static table — closing Open Decision
 * #13 / Constitution I ("Module, orchestrator, and route code MUST NOT
 * import a concrete skill, reference a skill by identifier, or branch on
 * which skills exist").** This file used to hardcode sixteen `import()`
 * calls bucketed by module, encoding in core exactly the fact Principle I
 * says a skill must declare for itself. It now calls
 * `@webaudit/capability-sdk`'s `discoverManifestsInRoot` — the same walk
 * `apps/api`'s registry runs against the vendored root — reads each
 * capability's own `module` from its manifest, and dynamically imports the
 * manifest's own `entrypointPath`. Nothing here names a capability; the set
 * that exists is whatever real directories with a valid
 * `capability.manifest.json` are on disk.
 *
 * `apps/api`'s dual-root discovery is not reused wholesale — this worker
 * only ever runs *this* process's own trusted, reviewed code (Principle V:
 * untrusted code runs isolated, in `sandbox-runner`, never here), so only
 * the vendored root is walked. `installedRoot` is deliberately absent.
 *
 * Discovery and each capability's dynamic import are cached per module for
 * the life of the process — the vendored tree does not change while a
 * worker is running, and re-walking the filesystem plus re-importing on
 * every phase job would be pure waste. A capability whose manifest or
 * import fails is logged and skipped, exactly as a failed static `import()`
 * was before — one bad capability must not take a whole module down.
 *
 * **`requiredControlLevels` is not wired here — it is wired one file over.**
 * This loader only resolves which capabilities exist; it does not decide
 * what control level each one needs. `orchestrator.ts`'s
 * `requiredControlLevelsFor` reads that mapping from the `Capability` table
 * per phase and passes it into `runModule`, so every capability returned by
 * `loadCapabilities` above is gated against its real DB-declared
 * `requiredControlLevel` at execution time, not just its manifest default.
 */

import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverManifestsInRoot, type DiscoveredManifest } from '@webaudit/capability-sdk';
import type { AuditCapability } from '@webaudit/capability-sdk';
import type { ModuleType } from '@webaudit/types';

/** `packages/capabilities-vendored/`, resolved relative to this file. */
function vendoredRoot(): string {
  return fileURLToPath(new URL('../../../../packages/capabilities-vendored', import.meta.url));
}

let discoveryCache: Promise<readonly DiscoveredManifest[]> | undefined;

/** Walks the vendored root exactly once per process; every caller shares the result. */
function discoverVendored(): Promise<readonly DiscoveredManifest[]> {
  discoveryCache ??= discoverManifestsInRoot(vendoredRoot()).then((result) => {
    for (const rejected of result.rejected) {
      console.error(`[capability-loader] rejected ${rejected.id}: ${rejected.reason}`);
    }
    return result.found;
  });
  return discoveryCache;
}

const importCacheByModule = new Map<ModuleType, Promise<readonly AuditCapability[]>>();

async function loadModuleCapabilities(module: ModuleType): Promise<readonly AuditCapability[]> {
  let cached = importCacheByModule.get(module);
  if (cached === undefined) {
    cached = (async () => {
      const manifests = await discoverVendored();
      const forModule = manifests.filter((m) => m.manifest.module === module);
      const loaded = await Promise.all(
        forModule.map(async (m): Promise<AuditCapability | null> => {
          try {
            const imported = (await import(pathToFileURL(m.entrypointPath).href)) as {
              default?: AuditCapability;
            };
            const capability = imported.default;
            if (capability === undefined) {
              console.error(`[capability-loader] ${m.id} has no default export`);
              return null;
            }
            if (capability.module !== module) {
              // The manifest and the code object disagree about their own
              // module — a data-hygiene bug in that one capability, not
              // something to guess through.
              console.error(
                `[capability-loader] ${m.id} declares module ${capability.module} in code but ` +
                  `${module} in its manifest; skipped`,
              );
              return null;
            }
            return capability;
          } catch (error) {
            console.error(`[capability-loader] failed to load a ${module} capability (${m.id})`, error);
            return null;
          }
        }),
      );
      return loaded.filter((capability): capability is AuditCapability => capability !== null);
    })();
    importCacheByModule.set(module, cached);
  }
  return cached;
}

/**
 * `enabledIds` — the registry's `isEnabled: true` set for this module (review
 * finding / open decision #13). An id not in it is skipped exactly as if its
 * import had failed, and a module whose capabilities are all disabled comes
 * back empty → NOT_APPLICABLE ("the area reports it unavailable" — SC-011).
 * Omit the set to load everything (the pre-registry behaviour, for a caller
 * with no database).
 */
export async function loadCapabilities(
  module: ModuleType,
  enabledIds?: ReadonlySet<string>,
): Promise<readonly AuditCapability[]> {
  const capabilities = await loadModuleCapabilities(module);
  if (enabledIds === undefined) return capabilities;
  return capabilities.filter((capability) => enabledIds.has(capability.id));
}
