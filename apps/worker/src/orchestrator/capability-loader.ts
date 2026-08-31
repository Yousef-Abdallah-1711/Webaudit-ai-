/**
 * T119-125 — the bridge from "a capability exists in
 * `packages/capabilities-vendored/`" to "the orchestrator can run it".
 *
 * **A static table, not a filesystem scan, and that is a recorded decision
 * rather than an oversight.** The real discovery/validation logic already
 * exists — `apps/api/src/services/registry/discover.ts`'s
 * `discoverCapabilities()` walks `packages/capabilities-vendored/`, reads
 * each `capability.manifest.json`, confirms the directory name matches the
 * manifest id, and confines every path by realpath. Reaching into it from
 * `apps/worker` would mean depending on `apps/api`'s route/business logic in
 * production — a real crack in the boundary T107 drew, unlike the generated
 * Prisma client exception in `db.ts` (no logic there, just types). The
 * clean fix is extracting the manifest-walking logic into `@webaudit/
 * capability-sdk`, which both apps already depend on — not done here, since
 * this vertical slice's capability set is small, fixed, and known at
 * compile time, and building a second discovery mechanism now would risk
 * drifting from the real one before anything forces the two to agree.
 *
 * Each entry below is a dynamic `import()` of the capability's own workspace
 * package — real code, not a stub — so import failures surface per-module
 * (a capability whose package fails to load skips just that one entry
 * rather than the whole module) instead of one bad import taking a phase
 * down. `PERFORMANCE`/`UI`/`TESTING` were empty through T125 (plan.md's
 * stage 10 was not built yet); T136-142 filled them in. Several of those
 * seven lean on `ctx.withPage`, which — per `createCodeLayerContext`'s own
 * contract comment — rejects until a `pageProvider` is wired in here, and
 * none is (T116 built the browser pool in-process inside `apps/probe-pool`
 * only; the cross-process transport that would let `apps/worker` reach it
 * is a separate, still-unbuilt gap, recorded rather than assumed away).
 * Every affected capability degrades to reporting only its `ctx.fetch`-based
 * findings rather than throwing — see each one's own module note.
 *
 * **`requiredControlLevels` is not wired here — it is wired one file over.**
 * This loader only resolves which capabilities exist; it does not decide
 * what control level each one needs. `orchestrator.ts`'s
 * `requiredControlLevelsFor` reads that mapping from the `Capability` table
 * per phase and passes it into `runModule`, so every capability returned by
 * `loadCapabilities` above is gated against its real DB-declared
 * `requiredControlLevel` at execution time, not just its manifest default.
 */

import type { AuditCapability } from '@webaudit/capability-sdk';
import type { ModuleType } from '@webaudit/types';

type CapabilityLoader = () => Promise<{ readonly default: AuditCapability }>;

const CAPABILITY_LOADERS: Readonly<Record<ModuleType, readonly CapabilityLoader[]>> = {
  SECURITY: [
    () => import('@webaudit/capability-headers-checker'),
    () => import('@webaudit/capability-ssl-analyzer'),
    () => import('@webaudit/capability-data-leak-scanner'),
    () => import('@webaudit/capability-owasp-checker'),
  ],
  SEO: [
    () => import('@webaudit/capability-meta-checker'),
    () => import('@webaudit/capability-content-checker'),
  ],
  PERFORMANCE: [
    () => import('@webaudit/capability-lighthouse-analyzer'),
    () => import('@webaudit/capability-network-inspector'),
    () => import('@webaudit/capability-cwv-analyzer'),
  ],
  UI: [
    () => import('@webaudit/capability-screenshot-capture'),
    () => import('@webaudit/capability-impeccable'),
  ],
  TESTING: [
    () => import('@webaudit/capability-playwright-runner'),
    () => import('@webaudit/capability-contradiction-detector'),
  ],
};

/**
 * `enabledIds` — the registry's `isEnabled: true` set for this module (review
 * finding / open decision #13). This static table listed *what exists on disk*
 * and ignored the operator's enable/disable flag entirely, so an operator who
 * disabled a token-burning capability saw it keep running until the next
 * deploy. Passing the set closes that: an id not in it is skipped exactly as if
 * its `import()` had failed, and a module whose capabilities are all disabled
 * comes back empty → NOT_APPLICABLE ("the area reports it unavailable" — SC-011).
 * Omit the set to load everything (the pre-registry behaviour, for a caller
 * with no database).
 */
export async function loadCapabilities(
  module: ModuleType,
  enabledIds?: ReadonlySet<string>,
): Promise<readonly AuditCapability[]> {
  const loaders = CAPABILITY_LOADERS[module];
  const loaded = await Promise.all(
    loaders.map(async (load) => {
      try {
        const capability = (await load()).default;
        if (enabledIds !== undefined && !enabledIds.has(capability.id)) return null;
        return capability;
      } catch (error) {
        console.error(`[capability-loader] failed to load a ${module} capability`, error);
        return null;
      }
    }),
  );
  return loaded.filter((capability): capability is AuditCapability => capability !== null);
}
