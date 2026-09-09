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
 * **T253 adds a second root — `installedRoot`, the same directory
 * `apps/api`'s upload path writes an operator-uploaded, passing-conformance
 * bundle into. This worker still never runs that code in-process.**
 * Constitution Non-Negotiable #5 — untrusted code runs in `sandbox-runner`
 * only, no exceptions — applies exactly as much to a real scan as it does
 * to the upload-time conformance check. So an installed manifest's
 * `entrypointPath` is read as inert bytes (`readFile`, never `import()`)
 * and wrapped in a plain object whose `canRun`/`runCodeLayer` dispatch to
 * `sandbox-runner` over HTTP (`makeSandboxedCapability`, below) — the real
 * decision and the real findings both come back from a sandboxed process,
 * never this one. Kept as a genuinely separate discovery walk and a
 * genuinely separate loading path from the vendored one, rather than
 * merged into one list with a trust flag threaded through — the two paths
 * do fundamentally different things with what they find, and collapsing
 * them into one code path would be the easiest way to one day blur that
 * difference by accident.
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

import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { discoverManifestsInRoot, type DiscoveredManifest } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { runCodeLayerCheck } from '@webaudit/sandbox-runner/dispatch';
import { SANDBOX_LIMITS } from '@webaudit/config';
import type { ModuleType } from '@webaudit/types';
import { getSandboxRunnerUrl } from './sandbox-config.js';

/** `packages/capabilities-vendored/`, resolved relative to this file. */
function vendoredRoot(): string {
  return fileURLToPath(new URL('../../../../packages/capabilities-vendored', import.meta.url));
}

/**
 * The same directory `apps/api`'s registry writes uploaded bundles into
 * (T253) — `INSTALLED_CAPABILITIES_ROOT` env var, or the repo-relative
 * default `apps/api/src/services/registry/boot.ts`'s `defaultInstalledRoot`
 * already uses. Duplicated rather than imported: `apps/worker` does not
 * depend on `apps/api`'s registry module (only its generated Prisma
 * client, per Open Decision #10), and this is a five-line function, not
 * shared logic worth a new package subpath.
 */
function installedRoot(): string {
  return (
    process.env['INSTALLED_CAPABILITIES_ROOT'] ??
    fileURLToPath(new URL('../../../../var/capabilities-installed', import.meta.url))
  );
}

let vendoredDiscoveryCache: Promise<readonly DiscoveredManifest[]> | undefined;
let installedDiscoveryCache: Promise<readonly DiscoveredManifest[]> | undefined;

/** Walks the vendored root exactly once per process; every caller shares the result. */
function discoverVendored(): Promise<readonly DiscoveredManifest[]> {
  vendoredDiscoveryCache ??= discoverManifestsInRoot(vendoredRoot()).then((result) => {
    for (const rejected of result.rejected) {
      console.error(`[capability-loader] rejected ${rejected.id}: ${rejected.reason}`);
    }
    return result.found;
  });
  return vendoredDiscoveryCache;
}

/**
 * T253. A separate root walk from `discoverVendored` — never merged into
 * one list — because what happens next diverges completely: a vendored
 * manifest's entrypoint gets `import()`'d into this process; an installed
 * manifest's never does.
 */
function discoverInstalled(): Promise<readonly DiscoveredManifest[]> {
  installedDiscoveryCache ??= discoverManifestsInRoot(installedRoot()).then((result) => {
    for (const rejected of result.rejected) {
      console.error(`[capability-loader] rejected installed ${rejected.id}: ${rejected.reason}`);
    }
    return result.found;
  });
  return installedDiscoveryCache;
}

/**
 * A capability whose `canRun`/`runCodeLayer` never execute in this
 * process — every call is a real HTTP dispatch to `sandbox-runner`,
 * carrying the on-disk bundle bytes read once at construction (not
 * re-read per call; the bundle does not change while a worker runs, the
 * same assumption `discoverVendored`'s cache already makes about the
 * vendored tree).
 *
 * **This is the one and only place in `apps/worker` an installed
 * capability's bytes are read from disk, and they are never passed to
 * `import()`, `eval`, `new Function`, or anything else that would execute
 * them in this process.** They are base64-encoded (inside
 * `runCodeLayerCheck`) and sent as the body of an HTTP request — inert
 * data, not code, from this process's point of view.
 */
function makeSandboxedCapability(manifest: DiscoveredManifest, bundle: Uint8Array): AuditCapability {
  const { id, module, layer } = manifest.manifest;

  async function dispatch(input: CapabilityInput) {
    const outcome = await runCodeLayerCheck(getSandboxRunnerUrl(), {
      requestId: randomUUID(),
      capabilityBundle: bundle,
      input,
      limits: SANDBOX_LIMITS,
    });
    if (!outcome.ok) {
      throw new Error(`sandbox dispatch failed for installed capability ${id}: ${outcome.reason}`);
    }
    return outcome;
  }

  return {
    id,
    module,
    layer,
    // The real decision happens inside the one sandbox dispatch
    // runCodeLayer makes (sandbox-runner's runCodeLayerOp folds canRun
    // into that same call, T253) — this always optimistically returns
    // true so `resolve.ts` adds it to `applicable` and reaches
    // `runCodeLayer`, which is where the real answer actually comes from.
    // One round trip per call, not two.
    canRun: () => true,
    runCodeLayer: async (input) => {
      const outcome = await dispatch(input);
      return outcome.applicable ? [...outcome.findings] : [];
    },
  };
}

const importCacheByModule = new Map<ModuleType, Promise<readonly AuditCapability[]>>();

async function loadModuleCapabilities(module: ModuleType): Promise<readonly AuditCapability[]> {
  let cached = importCacheByModule.get(module);
  if (cached === undefined) {
    cached = (async () => {
      const [vendoredManifests, installedManifests] = await Promise.all([
        discoverVendored(),
        discoverInstalled(),
      ]);

      const vendoredForModule = vendoredManifests.filter((m) => m.manifest.module === module);
      const loadedVendored = await Promise.all(
        vendoredForModule.map(async (m): Promise<AuditCapability | null> => {
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

      const installedForModule = installedManifests.filter((m) => m.manifest.module === module);
      const loadedInstalled = await Promise.all(
        installedForModule.map(async (m): Promise<AuditCapability | null> => {
          try {
            const bundle = await readFile(m.entrypointPath);
            return makeSandboxedCapability(m, bundle);
          } catch (error) {
            console.error(
              `[capability-loader] failed to read an installed ${module} capability (${m.id})`,
              error,
            );
            return null;
          }
        }),
      );

      return [...loadedVendored, ...loadedInstalled].filter(
        (capability): capability is AuditCapability => capability !== null,
      );
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
