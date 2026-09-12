/**
 * T309 — proves a prompt's assembled text is stable for a fixed input, so a
 * wording/rule-set/segment-structure change shows up as a snapshot diff in
 * code review instead of shipping unnoticed. Does not evaluate output
 * quality — see the audit's Part 9 §9.1 for why that is intentionally out
 * of scope for this task.
 */
import { describe, expect, it } from 'vitest';
import type { AuditCapability, CapabilityInput } from '@webaudit/capability-sdk';
import { createExecutor, fixtureProvider } from '@webaudit/ai-executor';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { MODULE_TYPES, type ModuleType } from '@webaudit/types';
import { runModule } from '../../src/module-runner/index.js';
import { runMasterSynthesis } from '../../src/orchestrator/master-report.js';
import { SNAPSHOT_CASES } from '../fixtures/prompt-snapshot-inputs.js';
import { refusingContext } from '../helpers/stub-registry.js';

function capabilityReturning(module: ModuleType, findings: readonly unknown[]): AuditCapability {
  return {
    id: 'snapshot-source',
    module,
    layer: 'BOTH',
    canRun: () => true,
    runCodeLayer: () => Promise.resolve(findings as never),
    getContextData: () => '',
  };
}

describe.each(MODULE_TYPES)('%s prompt output is stable', (module) => {
  it.each(SNAPSHOT_CASES.map((c) => [c.name, c.findings] as const))(
    'assembled prompt for "%s"',
    async (_name, findings) => {
      let capturedPromptText = '';
      const executor = createExecutor({
        chain: [
          fixtureProvider({
            vendor: 'vendor-a',
            model: 'm1',
            reply: (request) => {
              capturedPromptText = request.text;
              return JSON.stringify({ summary: 'ok', insights: [], priorityOrder: [] });
            },
          }),
          fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply: '{}' }),
        ],
        timeoutMs: 1000,
      });

      await runModule({
        module,
        capabilities: [capabilityReturning(module, findings)],
        input: {
          priorModuleResults: {},
          targetUrl: 'https://example.com',
        } satisfies CapabilityInput,
        targetControlLevel: 'NONE',
        executor,
        makeContext: refusingContext,
        timeoutMs: 400,
      });

      expect(capturedPromptText).toMatchSnapshot();
    },
  );
});

describe('master-report prompt output is stable', () => {
  it('assembles a stable prompt for representative area results', async () => {
    let capturedPromptText = '';
    const executor = createExecutor({
      chain: [
        fixtureProvider({
          vendor: 'vendor-a',
          model: 'm1',
          reply: (request) => {
            capturedPromptText = request.text;
            return JSON.stringify({
              headline: 'The audit has actionable findings.',
              nextSteps: [],
              crossCuttingThemes: [],
              coverageGaps: [],
            });
          },
        }),
        fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply: '{}' }),
      ],
      timeoutMs: 1000,
    });
    const stubDb = {
      moduleResult: {
        findMany: () =>
          Promise.resolve(
            MODULE_TYPES.map((module, index) => ({
              module,
              state: 'COMPLETE' as const,
              score: 82 - index,
              summary: null,
              skippedReason: null,
            })),
          ),
      },
      scan: { updateMany: () => Promise.resolve({ count: 1 }) },
    } as unknown as PrismaClient;

    await runMasterSynthesis(stubDb, executor, 'snapshot-scan');

    expect(capturedPromptText).toMatchSnapshot();
  });
});
