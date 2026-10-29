/**
 * Engine declarations the Plan Resolver consumes (execution-plan-contract step 4:
 * "each engine's own declared dependency template").
 *
 * Engines for the non-passive classes belong to later specs (010/011/012), so the platform
 * registry below declares only what exists today: the passive baseline. A non-passive class
 * with no declared engine is refused by the resolver (fail closed), never planned empty.
 */

import type { ModuleType } from '@webaudit/types';
import { isPassiveClass, type ExecutionUnitClass } from './graph.js';
import { DEFAULT_PLAN_DEADLINE_CONSTANTS } from './plan-deadline.js';

export interface EngineTemplateUnit {
  /** Unique within one (domain, class) expansion; edges refer to it. */
  readonly key: string;
  readonly engineId: string;
  readonly executionUnitClass: ExecutionUnitClass;
  readonly timeoutPolicyMs: number;
  readonly hardStopMarginMs: number;
  /** FR-024: > 1 only for an engine that proved idempotence; 1 otherwise. */
  readonly maxAttempts: number;
  readonly priority: number;
  /** Keys of templates in the same expansion this unit waits for. */
  readonly dependsOnKeys?: readonly string[];
  readonly configuration?: Readonly<Record<string, unknown>>;
  /** Engine-declared, side-effect-free precondition; a returned string is the `skippedReason`. */
  readonly skipWhen?: (domainConfig: unknown) => string | null;
}

export interface EngineRegistry {
  templatesFor(domain: ModuleType, unitClass: ExecutionUnitClass): readonly EngineTemplateUnit[];
}

/** A registry from an explicit table; later engine specs register through this. */
export function createEngineRegistry(
  table: ReadonlyArray<{
    domain: ModuleType;
    unitClass: ExecutionUnitClass;
    templates: readonly EngineTemplateUnit[];
  }>,
): EngineRegistry {
  const byKey = new Map<string, readonly EngineTemplateUnit[]>();
  for (const row of table) {
    const k = `${row.domain}:${row.unitClass}`;
    if (byKey.has(k)) throw new Error(`duplicate engine registration for ${k}`);
    for (const t of row.templates) {
      if (t.executionUnitClass !== row.unitClass)
        throw new Error(`template ${t.key} class mismatch for ${k}`);
    }
    byKey.set(k, row.templates);
  }
  return { templatesFor: (domain, unitClass) => byKey.get(`${domain}:${unitClass}`) ?? [] };
}

/** Baseline mapping used by a CUSTOM configuration: every domain is today's passive audit (FR-040). */
export const DEFAULT_CUSTOM_DOMAIN_CLASSES: Readonly<Record<ModuleType, ExecutionUnitClass[]>> = {
  PERFORMANCE: ['PASSIVE_HTTP'],
  SECURITY: ['PASSIVE_HTTP'],
  UI: ['PASSIVE_HTTP'],
  TESTING: ['PASSIVE_HTTP'],
  SEO: ['PASSIVE_HTTP'],
};

/**
 * The platform registry: passive baseline only. Each passive domain is one unit bounded by the legacy
 * scan duration (the legacy 15-minute value is the passive window, U-1), no retries, checkpoint-free.
 */
export function passiveBaselineRegistry(): EngineRegistry {
  const legacyMs = DEFAULT_PLAN_DEADLINE_CONSTANTS.legacyMaxDurationMs;
  const rows = (['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'] as const).flatMap((domain) =>
    (['PASSIVE_HTTP'] as const).map((unitClass) => ({
      domain,
      unitClass,
      templates: [
        {
          key: `${domain}:${unitClass}`,
          engineId: `baseline.${domain.toLowerCase()}`,
          executionUnitClass: unitClass,
          timeoutPolicyMs: legacyMs,
          hardStopMarginMs: 0,
          maxAttempts: 1,
          priority: 0,
        } satisfies EngineTemplateUnit,
      ],
    })),
  );
  return createEngineRegistry(rows);
}

export { isPassiveClass };
