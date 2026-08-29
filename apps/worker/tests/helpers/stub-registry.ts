/**
 * A registry built from specs rather than from disk and a database.
 *
 * SC-011 is a property of the *resolution logic*, not of any particular set of
 * capabilities, and the product has no real capabilities yet — they arrive with
 * Phase 3. Driving the assertion off a fixture set keeps it hermetic and, more
 * usefully, lets the set be chosen to be hostile: two capabilities per area so
 * "disable one" is a meaningful thing to say, plus plan-restricted,
 * control-gated, and input-dependent members so every status branch is reached.
 *
 * `CapabilityRegistry.build` reads a database. This constructs the same shape
 * directly, which is the only structural liberty taken: `resolveSnapshot`
 * consumes `forModule`, and that is what is being tested.
 */

import type { CapabilityLayer, ControlLevel, ModuleType } from '@webaudit/types';
import type { CodeLayerContext } from '@webaudit/capability-sdk';
import type {
  CapabilityRegistry,
  RegisteredCapability,
} from '../../../api/src/services/registry/registry.js';

export interface StubSpec {
  readonly id: string;
  readonly module: ModuleType;
  readonly layer: CapabilityLayer;
  readonly requiresCode: boolean;
  readonly requiresScreenshot: boolean;
  readonly requiredControlLevel: ControlLevel;
  readonly estimatedTokens: number;
  readonly restrictedToPlans: readonly string[];
}

function spec(
  id: string,
  module: ModuleType,
  layer: CapabilityLayer,
  overrides: Partial<Omit<StubSpec, 'id' | 'module' | 'layer'>> = {},
): StubSpec {
  return {
    id,
    module,
    layer,
    requiresCode: overrides.requiresCode ?? false,
    requiresScreenshot: overrides.requiresScreenshot ?? false,
    requiredControlLevel: overrides.requiredControlLevel ?? 'NONE',
    estimatedTokens: overrides.estimatedTokens ?? (layer === 'CODE' ? 0 : 2_000),
    restrictedToPlans: overrides.restrictedToPlans ?? [],
  };
}

/**
 * Two or more per area, and every branch of `statusFor` represented.
 *
 * The load-generation capability is the one that matters most: it is
 * `requiredControlLevel: VERIFIED`, so it exercises the
 * unavailable-pending-verification path that US1 scenario 8 describes.
 */
export const STUB_CAPABILITIES: readonly StubSpec[] = [
  spec('headers-checker', 'SECURITY', 'CODE'),
  spec('tls-inspector', 'SECURITY', 'CODE'),
  spec('dependency-auditor', 'SECURITY', 'CODE', { requiresCode: true }),
  spec('threat-narrator', 'SECURITY', 'AI', { estimatedTokens: 4_000 }),

  spec('page-weight', 'PERFORMANCE', 'CODE'),
  spec('render-timings', 'PERFORMANCE', 'CODE'),
  spec('load-generator', 'PERFORMANCE', 'CODE', { requiredControlLevel: 'VERIFIED' }),

  spec('contrast-checker', 'UI', 'CODE'),
  spec('layout-shift', 'UI', 'CODE', { requiresScreenshot: true }),
  spec('design-critic', 'UI', 'BOTH', { requiresScreenshot: true, estimatedTokens: 6_000 }),

  spec('coverage-reader', 'TESTING', 'CODE', { requiresCode: true }),
  spec('test-smells', 'TESTING', 'CODE', { requiresCode: true }),
  spec('suite-advisor', 'TESTING', 'AI', {
    requiresCode: true,
    estimatedTokens: 3_000,
    restrictedToPlans: ['pro'],
  }),

  spec('meta-tags', 'SEO', 'CODE'),
  spec('structured-data', 'SEO', 'CODE'),
  spec('content-strategist', 'SEO', 'AI', { estimatedTokens: 5_000, restrictedToPlans: ['pro'] }),
];

function toRegistered(spec: StubSpec, disabled: ReadonlySet<string>): RegisteredCapability {
  return {
    id: spec.id,
    name: spec.id,
    version: '1.0.0',
    module: spec.module,
    layer: spec.layer,
    trust: 'VENDORED',
    requiresCode: spec.requiresCode,
    requiresScreenshot: spec.requiresScreenshot,
    requiredControlLevel: spec.requiredControlLevel,
    estimatedTokens: spec.estimatedTokens,
    isEnabled: !disabled.has(spec.id),
    restrictedToPlans: spec.restrictedToPlans,
    entrypointPath: `/stub/${spec.id}/index.js`,
  };
}

/** A registry over the specs, with the named ids disabled. */
export function buildStubRegistry(
  specs: readonly StubSpec[],
  disabled: readonly string[] = [],
): CapabilityRegistry {
  const off = new Set(disabled);
  const entries = specs.map((s) => toRegistered(s, off));
  const all = (): readonly RegisteredCapability[] =>
    [...entries].sort((a, b) => a.id.localeCompare(b.id));

  return {
    all,
    forModule(module: ModuleType, layer?: CapabilityLayer) {
      return all().filter((c) => {
        if (c.module !== module) return false;
        if (layer === undefined) return true;
        return c.layer === layer || c.layer === 'BOTH';
      });
    },
    resolveForExecution(id: string) {
      return entries.find((c) => c.id === id) ?? null;
    },
    get size() {
      return entries.length;
    },
  } as unknown as CapabilityRegistry;
}

/**
 * A context that refuses everything.
 *
 * Correct for a conformance run: the suite is testing the capability's own
 * behaviour, and a capability that needs the network to be well-behaved is a
 * capability whose conformance depends on a third party.
 */
export function refusingContext(signal: AbortSignal): CodeLayerContext {
  const refuse = (what: string) => (): never => {
    throw new Error(`${what} is unavailable during conformance`);
  };
  const ctx: Record<string, unknown> = {
    fetch: refuse('ctx.fetch'),
    withPage: refuse('ctx.withPage'),
    readFile: refuse('ctx.readFile'),
    glob: refuse('ctx.glob'),
    logger: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    signal,
  };
  return ctx as unknown as CodeLayerContext;
}

/** Everything `runConformanceSuite` needs, for a capability under test. */
export function makeConformanceDeps(capabilityId: string) {
  return {
    makeContext: refusingContext,
    input: {
      targetUrl: 'https://example.com',
      priorModuleResults: {},
      controlLevel: 'NONE' as const,
    },
    rawManifest: {
      id: capabilityId,
      name: capabilityId,
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      entrypoint: 'dist/index.js',
      estimatedTokens: 0,
    },
    timeoutMs: 1_000,
    abortGraceMs: 500,
  };
}
