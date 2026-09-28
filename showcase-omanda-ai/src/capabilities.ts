/**
 * The capability registry for the showcase runner.
 *
 * This is a VERBATIM mirror of `apps/worker/src/orchestrator/capability-loader.ts`'s
 * static import table — the same 13 vendored capabilities, the same module
 * grouping. Nothing here is a stub: each entry imports the real
 * `packages/capabilities-vendored/<name>` workspace package and uses its
 * `default` export, which is the real `AuditCapability` object the product ships.
 *
 * If a capability is added/removed in the product's loader, mirror it here.
 */

import type { AuditCapability } from '@webaudit/capability-sdk';
import type { ModuleType } from '@webaudit/types';

type Loader = () => Promise<{ readonly default: AuditCapability }>;

export const CAPABILITY_LOADERS: Readonly<Record<ModuleType, readonly Loader[]>> = {
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

/** Human labels for the report / dashboard. Matches the design system's area names. */
export const MODULE_LABEL: Readonly<Record<ModuleType, string>> = {
  SECURITY: 'Security',
  PERFORMANCE: 'Performance',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

/** The order the product runs areas in (phase 1 first, UI in phase 2). */
export const MODULE_ORDER: readonly ModuleType[] = [
  'SECURITY',
  'SEO',
  'PERFORMANCE',
  'TESTING',
  'UI',
];

export async function loadCapabilities(module: ModuleType): Promise<readonly AuditCapability[]> {
  const loaders = CAPABILITY_LOADERS[module];
  const loaded = await Promise.all(
    loaders.map(async (load) => {
      try {
        return (await load()).default;
      } catch (error) {
        console.error(`[capabilities] failed to load a ${module} capability`, error);
        return null;
      }
    }),
  );
  return loaded.filter((c): c is AuditCapability => c !== null);
}
