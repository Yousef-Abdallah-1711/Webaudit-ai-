/**
 * T253 — `capability-upload.service.ts` needs to know an installed
 * capability's real `module`/`layer` to write a valid
 * `capability.manifest.json` for it, and the only place that data exists
 * post-conformance-check is the capability object `runConformanceSuite`
 * already receives and reads (`checkManifest`'s own module/layer
 * cross-check already proves `capability.module`/`capability.layer` match
 * a valid, Zod-parsed manifest whenever `passed` is true — the same trust
 * level `capabilityId` already relies on in this same report). Before this,
 * `ConformanceReport` dropped that data after using it internally.
 */
import { describe, expect, it } from 'vitest';
import { createCodeLayerContext } from '../../src/context.js';
import { runConformanceSuite } from '../../src/conformance/suite.js';
import type { AuditCapability } from '../../src/contract.js';

describe('ConformanceReport', () => {
  it("exposes the capability's own module and layer, not just its id", async () => {
    const capability: AuditCapability = {
      id: 'field-check',
      module: 'SEO',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => [],
    };

    const report = await runConformanceSuite(capability, {
      makeContext: (signal) => createCodeLayerContext({ capabilityId: capability.id, signal }),
      input: { targetUrl: 'https://example.com/', priorModuleResults: {} },
      rawManifest: {
        id: 'field-check',
        name: 'Field Check',
        version: '1.0.0',
        module: 'SEO',
        layer: 'CODE',
        entrypoint: 'bundle.js',
        requiresCode: false,
        requiresScreenshot: false,
        requiredControlLevel: 'NONE',
        estimatedTokens: 0,
      },
    });

    expect(report.module).toBe('SEO');
    expect(report.layer).toBe('CODE');
  });
});
