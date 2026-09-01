/**
 * T170 — FR-021 for the source-only capabilities.
 *
 * "System MUST skip a capability whose preconditions are unmet and report it as
 * not applicable, rather than running it or reporting a pass."
 *
 * The phrase that carries the weight is **"rather than ... reporting a pass"**.
 * The tempting shape for a source capability on a URL-only audit is to run,
 * find nothing (there is nothing to read), and return an empty array — which
 * the runner would score as a clean COMPLETE. A user auditing a live URL would
 * then be told their dependencies are fine, which is not something anybody
 * measured. NOT_APPLICABLE is the honest answer and this suite pins it.
 *
 * Three things are asserted, and the middle one is the one that would rot
 * silently:
 *
 *   1. `canRun` is false with no source, so the capability is skipped.
 *   2. The skip reason is **PRECONDITIONS**, not CAN_RUN_FAILED. A `canRun`
 *      that threw would also produce a skip, and the module would also come out
 *      NOT_APPLICABLE — the audit would look correct while the capability was
 *      broken. Only the reason code distinguishes them.
 *   3. An area whose every capability is source-only resolves NOT_APPLICABLE
 *      with a `skippedReason`, and scores **null** rather than zero, because
 *      FR-053 forbids an unmeasured area from moving the overall score.
 *
 * No database and no network. `runModule` needs neither, the capabilities are
 * the real vendored ones, and the AI executor is in fixtures mode — a suite
 * that needed a live provider would be a broken suite (Principle IV).
 */

import { describe, expect, it } from 'vitest';
import { createExecutorFromEnv } from '@webaudit/ai-executor';
import { createCodeLayerContext } from '@webaudit/capability-sdk';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import bundleAnalyzer from '@webaudit/capability-bundle-analyzer';
import cssAnalyzer from '@webaudit/capability-css-analyzer';
import dependencyScanner from '@webaudit/capability-dependency-scanner';
import { resolveApplicable, runModule } from '../../src/module-runner/index.js';

process.env['AI_MODE'] ??= 'fixtures';
process.env['AI_CHAIN'] ??= 'anthropic,openai';

const SOURCE_ONLY: readonly {
  readonly module: 'SECURITY' | 'PERFORMANCE' | 'UI';
  readonly capability: AuditCapability;
}[] = [
  { module: 'SECURITY', capability: dependencyScanner },
  { module: 'PERFORMANCE', capability: bundleAnalyzer },
  { module: 'UI', capability: cssAnalyzer },
];

/** Exactly what the orchestrator builds for a URL target: no `code` key. */
const URL_ONLY_INPUT: CapabilityInput = {
  targetUrl: 'https://example.com/',
  priorModuleResults: {},
  controlLevel: 'NONE',
};

/**
 * And what it builds for an attached-source scan. The listing alone is what
 * `canRun` reads, so this needs no files on disk to prove applicability flips.
 */
const SOURCE_INPUT: CapabilityInput = {
  priorModuleResults: {},
  controlLevel: 'NONE',
  code: {
    files: [
      { path: 'package.json', sizeBytes: 320 },
      { path: 'dist/app.js', sizeBytes: 900_000 },
      { path: 'styles/main.css', sizeBytes: 12_000 },
    ],
    frameworks: [],
  },
};

describe.each(SOURCE_ONLY)('$capability.id on a URL-only audit', ({ module, capability }) => {
  it('is skipped, and skipped for the reason that means "not applicable"', async () => {
    const resolution = await resolveApplicable({
      capabilities: [capability],
      input: URL_ONLY_INPUT,
    });

    expect(resolution.applicable).toHaveLength(0);
    expect(resolution.skipped).toHaveLength(1);
    // PRECONDITIONS, never CAN_RUN_FAILED. See the module note: both produce a
    // skip, and only one of them means the capability is working.
    expect(resolution.skipped[0]?.reason).toBe('PRECONDITIONS');
    expect(resolution.skipped[0]?.capabilityId).toBe(capability.id);
  });

  it('becomes applicable the moment source is attached', async () => {
    const resolution = await resolveApplicable({
      capabilities: [capability],
      input: SOURCE_INPUT,
    });

    expect(resolution.skipped).toHaveLength(0);
    expect(resolution.applicable.map((entry) => entry.capability.id)).toEqual([capability.id]);
  });

  it('leaves its area NOT_APPLICABLE with a null score, not a clean pass', async () => {
    const result = await runModule({
      module,
      capabilities: [capability],
      input: URL_ONLY_INPUT,
      executor: createExecutorFromEnv(),
      makeContext: (signal, capabilityId) => createCodeLayerContext({ signal, capabilityId }),
      timeoutMs: 5_000,
      scanId: 'no-source-applicability',
    });

    expect(result.state).toBe('NOT_APPLICABLE');
    // Null, not zero. A zero would say "we measured this area and it is bad";
    // null says "we measured nothing here", and only one of those is true.
    expect(result.score).toBeNull();
    expect(result.findings).toHaveLength(0);
    expect(result.skippedReason).toContain(capability.id);
  });
});

describe('the code layer never runs for a capability that was skipped', () => {
  it('records a skip row and no execution row', async () => {
    let contextsBuilt = 0;

    const result = await runModule({
      module: 'SECURITY',
      capabilities: [dependencyScanner],
      input: URL_ONLY_INPUT,
      executor: createExecutorFromEnv(),
      makeContext: (signal, capabilityId) => {
        contextsBuilt += 1;
        return createCodeLayerContext({ signal, capabilityId });
      },
      timeoutMs: 5_000,
      scanId: 'no-source-applicability-2',
    });

    // FR-021's "rather than running it". A context is built per code-layer
    // invocation, so zero contexts is the observable form of "never invoked".
    expect(contextsBuilt).toBe(0);

    const rows = result.executions;
    expect(rows).toHaveLength(1);
    expect(rows[0]?.skippedReason).toBeDefined();
    expect(rows[0]?.findingCount).toBe(0);
    // Principle III: a skip costs nothing, and the row has to say so.
    expect(rows[0]?.costMicros).toBe(0);
  });
});
