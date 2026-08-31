/**
 * T085 — FR-030: "complete all deterministic measurement for an area before any
 * AI interpretation of that area begins, and deterministic measurement MUST
 * consume no AI budget."
 *
 * Two claims, and the second is the one CLAUDE.md calls a principle violation:
 * "A code-layer capability that calls an LLM is a principle violation." So the
 * suite records a timeline of every event — each code-layer call, each AI
 * invocation — and asserts on the *order* rather than on a flag somewhere saying
 * the order was respected.
 *
 * Why ordering has to be observed rather than asserted structurally: the runner
 * runs code-layer capabilities *concurrently* (R13), so "code before AI" is a
 * property of a partial order, and the easy bug is an AI call that starts while
 * the slowest code-layer capability is still going. A timeline catches that; a
 * unit test on two sequential functions does not.
 */

import { describe, expect, it } from 'vitest';
import type { CapabilityFinding } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, type Provider } from '@webaudit/ai-executor';
import { runModule } from '../../src/module-runner/index.js';
import { refusingContext } from '../helpers/stub-registry.js';

const AI_REPLY = JSON.stringify({
  summary: 'Interpretation of what was measured.',
  insights: [],
  priorityOrder: [],
});

interface Timeline {
  readonly events: string[];
}

function finding(id: string): CapabilityFinding {
  return {
    checkId: `${id}.check`,
    fingerprintParts: [id],
    severity: 'MEDIUM',
    title: `From ${id}`,
    description: 'Measured.',
    fixable: true,
  };
}

/**
 * A code-layer capability that records when it starts and finishes, and takes a
 * controllable amount of time so the concurrency is real.
 */
function timedCapability(id: string, delayMs: number, timeline: Timeline): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: async () => {
      timeline.events.push(`code:${id}:start`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      timeline.events.push(`code:${id}:end`);
      return [finding(id)];
    },
  };
}

/** An AI-layer contributor. Records when its contribution is collected. */
function aiCapability(id: string, timeline: Timeline): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'BOTH',
    canRun: () => true,
    runCodeLayer: () => {
      timeline.events.push(`code:${id}:start`);
      timeline.events.push(`code:${id}:end`);
      return Promise.resolve([finding(id)]);
    },
    getSystemPromptAddition: () => {
      timeline.events.push(`ai-contribution:${id}`);
      return 'Consider header interactions.';
    },
    getContextData: () => {
      timeline.events.push(`ai-context:${id}`);
      return 'context';
    },
  };
}

function recordingProvider(vendor: string, timeline: Timeline): Provider {
  return {
    vendor,
    model: `${vendor}-m`,
    pricing: { inputMicrosPerMillion: 5_000_000, outputMicrosPerMillion: 25_000_000 },
    generate: () => {
      timeline.events.push(`ai:${vendor}:invoke`);
      return Promise.resolve({
        outcome: 'SUCCESS' as const,
        text: AI_REPLY,
        promptTokens: 1000,
        outputTokens: 200,
      });
    },
  };
}

function executor(timeline: Timeline) {
  return createExecutor({
    chain: [recordingProvider('vendor-a', timeline), recordingProvider('vendor-b', timeline)],
    timeoutMs: 2000,
  });
}

async function run(capabilities: readonly AuditCapability[], timeline: Timeline) {
  return runModule({
    module: 'SECURITY',
    capabilities,
    input: { priorModuleResults: {}, controlLevel: 'NONE', targetUrl: 'https://example.com' },
    executor: executor(timeline),
    makeContext: refusingContext,
    timeoutMs: 2000,
  });
}

describe('FR-030 - every measurement finishes before any interpretation begins', () => {
  it('starts no AI invocation until the slowest code-layer capability has ended', async () => {
    const timeline: Timeline = { events: [] };
    // Deliberately uneven: the first capability finishes long before the third.
    await run(
      [
        timedCapability('fast', 5, timeline),
        timedCapability('medium', 25, timeline),
        aiCapability('slow-with-ai', timeline),
      ],
      timeline,
    );

    const firstAi = timeline.events.findIndex((e) => e.startsWith('ai:'));
    const lastCodeEnd = timeline.events.reduce(
      (last, event, index) => (event.endsWith(':end') ? index : last),
      -1,
    );

    expect(firstAi, timeline.events.join(' | ')).toBeGreaterThan(-1);
    expect(lastCodeEnd, timeline.events.join(' | ')).toBeGreaterThan(-1);
    expect(lastCodeEnd, timeline.events.join(' | ')).toBeLessThan(firstAi);
  });

  it('runs code-layer capabilities concurrently rather than one after another', async () => {
    // R13: "run all code-layer capabilities concurrently". If they were
    // sequential, every start would be immediately followed by its own end.
    const timeline: Timeline = { events: [] };
    await run(
      [
        timedCapability('a', 30, timeline),
        timedCapability('b', 30, timeline),
        timedCapability('c', 30, timeline),
      ],
      timeline,
    );

    const codeEvents = timeline.events.filter((e) => e.startsWith('code:'));
    // All three start before the first one ends.
    expect(codeEvents.slice(0, 3).every((e) => e.endsWith(':start'))).toBe(true);
  });

  it('collects AI-layer contributions only after the code layer is done', async () => {
    const timeline: Timeline = { events: [] };
    await run(
      [timedCapability('slow', 25, timeline), aiCapability('contributor', timeline)],
      timeline,
    );

    const lastCodeEnd = timeline.events.reduce(
      (last, event, index) => (event.endsWith(':end') ? index : last),
      -1,
    );
    const firstContribution = timeline.events.findIndex((e) => e.startsWith('ai-contribution:'));

    expect(firstContribution).toBeGreaterThan(lastCodeEnd);
  });

  it('makes exactly one AI call for the module, not one per capability', async () => {
    // R13: "one AI call per module". Per-capability calls would multiply cost by
    // the capability count for no extra information.
    const timeline: Timeline = { events: [] };
    await run(
      [aiCapability('a', timeline), aiCapability('b', timeline), aiCapability('c', timeline)],
      timeline,
    );

    expect(timeline.events.filter((e) => e.startsWith('ai:'))).toHaveLength(1);
  });

  it('makes no AI call at all when no capability has an AI layer', async () => {
    const timeline: Timeline = { events: [] };
    const result = await run([timedCapability('only-code', 5, timeline)], timeline);

    expect(timeline.events.filter((e) => e.startsWith('ai:'))).toHaveLength(0);
    // And the area still completes. An area with no AI layer is not degraded.
    expect(result.state).toBe('COMPLETE');
  });
});

describe('Principle III - the code layer consumes no AI budget', () => {
  it('records zero cost for every code-layer execution', async () => {
    const timeline: Timeline = { events: [] };
    const result = await run(
      [timedCapability('a', 5, timeline), timedCapability('b', 5, timeline)],
      timeline,
    );

    expect(result.executions).toHaveLength(2);
    for (const execution of result.executions) {
      expect(execution.costMicros, execution.capabilityId).toBe(0);
      expect(execution.invocations, execution.capabilityId).toHaveLength(0);
    }
  });

  it('records zero cost for the code-layer half of a BOTH capability', async () => {
    // The interesting case: this capability does have an AI layer, so its cost
    // is not zero overall. Its *code-layer execution* still must be.
    const timeline: Timeline = { events: [] };
    const result = await run([aiCapability('both-layers', timeline)], timeline);

    const codeExecution = result.executions.find((e) => e.layer === 'CODE');
    expect(codeExecution).toBeDefined();
    expect(codeExecution?.costMicros).toBe(0);
  });

  it('attributes the module AI cost to the module, not to a code-layer execution', async () => {
    const timeline: Timeline = { events: [] };
    const result = await run([aiCapability('contributor', timeline)], timeline);

    // 1000 in at $5/1M = $0.005; 200 out at $25/1M = $0.005. 10_000 micros.
    expect(result.aiCostMicros).toBe(10_000);
    expect(result.aiInvocations).toHaveLength(1);
    // Principle VI: the cost is attributable, and it is not hidden inside a
    // code-layer row that is supposed to be free.
    const codeCost = result.executions.reduce((total, e) => total + e.costMicros, 0);
    expect(codeCost).toBe(0);
  });

  it('poisons global fetch during the code layer, so a stray network call is caught', async () => {
    // The realistic Principle III violation is not an SDK import — eslint stops
    // that — it is a capability reaching the network outside `ctx`.
    const timeline: Timeline = { events: [] };
    let reached = false;
    const sneaky: AuditCapability = {
      id: 'sneaky',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => {
        try {
          await globalThis.fetch('https://api.example.com/v1/messages');
          reached = true;
        } catch {
          // Poisoned, as intended.
        }
        return [finding('sneaky')];
      },
    };

    const result = await run([sneaky], timeline);

    expect(reached).toBe(false);
    // And it is reported, not silently tolerated.
    const execution = result.executions.find((e) => e.capabilityId === 'sneaky');
    expect(execution?.egressViolations).toContain('https://api.example.com/v1/messages');
  });

  it('blames the capability that called, not the ones running beside it', async () => {
    // The first version of the runner credited every concurrent capability with
    // any call, which would have an operator disable an innocent check.
    const timeline: Timeline = { events: [] };
    const offender: AuditCapability = {
      id: 'offender',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        try {
          await globalThis.fetch('https://sneaky.example.com/');
        } catch {
          /* poisoned */
        }
        return [finding('offender')];
      },
    };

    const result = await run(
      [
        offender,
        timedCapability('innocent-1', 20, timeline),
        timedCapability('innocent-2', 20, timeline),
      ],
      timeline,
    );

    const blamed = result.executions.filter((e) => e.egressViolations.length > 0);
    expect(blamed.map((e) => e.capabilityId)).toEqual(['offender']);
    expect(blamed[0]?.egressViolations).toEqual(['https://sneaky.example.com/']);
  });

  it('restores global fetch afterwards', async () => {
    const before = globalThis.fetch;
    const timeline: Timeline = { events: [] };
    await run([timedCapability('a', 5, timeline)], timeline);
    expect(globalThis.fetch).toBe(before);
  });

  it('keeps fetch poisoned for a module still running while a sibling module finishes (review finding H3)', async () => {
    // The orchestrator runs a phase's modules concurrently. A per-call
    // save/restore let the first module's `finally` un-poison `fetch` while a
    // second module's capabilities were still executing — FR-025 enforcement
    // silently off for the rest of that module.
    const before = globalThis.fetch;

    const fast: AuditCapability = {
      id: 'fast-module-cap',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: () => Promise.resolve([finding('fast-module-cap')]),
    };

    let slowReachedNetwork = false;
    const slow: AuditCapability = {
      id: 'slow-module-cap',
      module: 'PERFORMANCE',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: async () => {
        // Outlast the fast module's whole run and its restore.
        await new Promise((resolve) => setTimeout(resolve, 40));
        try {
          await globalThis.fetch('https://after-sibling.example.com/');
          slowReachedNetwork = true;
        } catch {
          /* still poisoned, as it must be */
        }
        return [finding('slow-module-cap')];
      },
    };

    const [, slowResult] = await Promise.all([
      run([fast], { events: [] }),
      runModule({
        module: 'PERFORMANCE',
        capabilities: [slow],
        input: { priorModuleResults: {}, controlLevel: 'NONE', targetUrl: 'https://example.com' },
        executor: executor({ events: [] }),
        makeContext: refusingContext,
        timeoutMs: 2000,
      }),
    ]);

    expect(slowReachedNetwork).toBe(false);
    expect(
      slowResult.executions.find((e) => e.capabilityId === 'slow-module-cap')?.egressViolations,
    ).toContain('https://after-sibling.example.com/');
    // And once BOTH modules are done, the real fetch is back.
    expect(globalThis.fetch).toBe(before);
  });
});
