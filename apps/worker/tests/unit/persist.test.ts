/**
 * T093 — persistence, and the third lock on SC-006.
 *
 * The first two locks are the type (only `attribute.ts` can make an
 * `AttributedFinding`) and the schema (`Issue.attribution` is non-nullable).
 * This is the middle one: a runtime check at the last point before data becomes
 * a report someone reads.
 */

import { describe, expect, it } from 'vitest';
import { runModule } from '../../src/module-runner/index.js';
import { persistModuleResult } from '../../src/module-runner/persist.js';
import { UnattributedFindingError } from '../../src/module-runner/persist.js';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, fixtureProvider } from '@webaudit/ai-executor';
import { refusingContext } from '../helpers/stub-registry.js';

const AI_REPLY = JSON.stringify({
  summary: 'Interpretation.',
  insights: [
    {
      relatesToCheckIds: [],
      title: 'A standalone judgement',
      explanation: 'Not tied to a measurement.',
      consequence: 'Worth considering.',
      severity: 'LOW',
    },
  ],
  priorityOrder: [],
});

/** A writer that records what it was asked to write. */
function recorder() {
  const moduleResults: unknown[] = [];
  const issues: unknown[] = [];
  const executions: unknown[] = [];
  const invocations: unknown[] = [];

  const db = {
    moduleResult: {
      upsert: (args: { create: unknown; update: unknown }) => {
        moduleResults.push(args.create);
        return Promise.resolve({ id: 'mr_1' });
      },
    },
    issue: {
      createMany: (args: { data: unknown[] }) => {
        issues.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      },
    },
    capabilityExecution: {
      create: (args: { data: unknown }) => {
        executions.push(args.data);
        return Promise.resolve({ id: `ce_${String(executions.length)}` });
      },
    },
    aiInvocation: {
      createMany: (args: { data: unknown[] }) => {
        invocations.push(...args.data);
        return Promise.resolve({ count: args.data.length });
      },
    },
  };

  return { db, moduleResults, issues, executions, invocations };
}

function capability(id: string, withAi: boolean): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: withAi ? 'BOTH' : 'CODE',
    canRun: () => true,
    runCodeLayer: () =>
      Promise.resolve([
        {
          checkId: `${id}.check`,
          fingerprintParts: [id],
          severity: 'HIGH' as const,
          title: `From ${id}`,
          description: 'Measured.',
          fixable: true,
        },
      ]),
    ...(withAi ? { getSystemPromptAddition: () => 'Consider interactions.' } : {}),
  };
}

function executor() {
  return createExecutor({
    chain: [
      fixtureProvider({
        vendor: 'vendor-a',
        model: 'm1',
        reply: AI_REPLY,
        promptTokens: 1000,
        outputTokens: 200,
      }),
      fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply: AI_REPLY }),
    ],
    timeoutMs: 1000,
  });
}

async function runAndPersist(capabilities: readonly AuditCapability[]) {
  const result = await runModule({
    module: 'SECURITY',
    capabilities,
    input: { priorModuleResults: {}, controlLevel: 'NONE', targetUrl: 'https://example.com' },
    executor: executor(),
    makeContext: refusingContext,
    timeoutMs: 1000,
    scanId: 'scan_1',
    targetId: 'tgt_1',
  });

  const store = recorder();
  const persisted = await persistModuleResult(store.db, {
    scanId: 'scan_1',
    module: result.module,
    state: result.state,
    score: result.score,
    summary: result.summary,
    skippedReason: result.skippedReason,
    degradedReason: result.degradedReason,
    findings: result.findings,
    executions: result.executions,
    aiInvocations: result.aiInvocations,
    aiCostMicros: result.aiCostMicros,
    startedAt: new Date('2026-08-24T00:00:00.000Z'),
    completedAt: new Date('2026-08-24T00:00:01.000Z'),
  });

  return { result, store, persisted };
}

describe('persisting a module result', () => {
  it('writes one issue per finding, each with an attribution', async () => {
    const { store, persisted } = await runAndPersist([capability('a', true)]);

    expect(persisted.issuesWritten).toBeGreaterThan(0);
    for (const issue of store.issues as { attribution: string }[]) {
      expect(['MEASURED', 'AI_JUDGMENT']).toContain(issue.attribution);
    }
  });

  it('writes the fields FR-050 and FR-051 require', async () => {
    const { store } = await runAndPersist([capability('a', false)]);
    const issue = store.issues[0] as Record<string, unknown>;

    expect(issue.title).toBeTruthy();
    expect(issue.explanation).toBeTruthy();
    expect(issue.consequence).toBeTruthy();
    // FR-051: self-contained, so it restates the problem rather than referring
    // to "the finding above" — meaningless once copied (FR-052).
    expect(String(issue.fixPrompt)).toContain('From a');
    expect(String(issue.fixPrompt)).not.toMatch(/above|below|see the report/i);
    expect(String(issue.fingerprint)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('passes a null score through rather than coercing it to zero', async () => {
    // The FR-053 trap in its persistence form. `?? 0` here would deflate the
    // overall average with an invented number.
    const failing: AuditCapability = {
      id: 'broken',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: () => Promise.reject(new Error('boom')),
    };
    const { result, store } = await runAndPersist([failing]);

    expect(result.state).toBe('FAILED');
    expect((store.moduleResults[0] as { score: number | null }).score).toBeNull();
  });

  it('records zero cost on every code-layer execution row', async () => {
    const { store } = await runAndPersist([capability('a', false), capability('b', false)]);
    const codeRows = (store.executions as { capabilityId: string; costMicros: number }[]).filter(
      (row) => !row.capabilityId.startsWith('module-ai:'),
    );

    expect(codeRows).toHaveLength(2);
    for (const row of codeRows) expect(row.costMicros).toBe(0);
  });

  it('puts the module AI cost on its own execution row', async () => {
    const { store } = await runAndPersist([capability('a', true)]);
    const aiRow = (store.executions as { capabilityId: string; costMicros: number }[]).find((row) =>
      row.capabilityId.startsWith('module-ai:'),
    );

    // 1000 in at $5/1M plus 200 out at $25/1M. Fixture pricing is zero, so this
    // asserts the row exists and is attributable rather than a specific figure.
    expect(aiRow).toBeDefined();
    expect(aiRow?.capabilityId).toBe('module-ai:security');
    // Principle VI: attributable, and not smeared across contributors.
    const codeCost = (store.executions as { capabilityId: string; costMicros: number }[])
      .filter((row) => !row.capabilityId.startsWith('module-ai:'))
      .reduce((total, row) => total + row.costMicros, 0);
    expect(codeCost).toBe(0);
  });

  it('links every AI invocation to an execution row', async () => {
    const { store } = await runAndPersist([capability('a', true)]);
    for (const invocation of store.invocations as { executionId: string; scanId: string }[]) {
      expect(invocation.executionId).toBeTruthy();
      expect(invocation.scanId).toBe('scan_1');
    }
  });

  it('records a skip so it is distinguishable from a capability that never existed', async () => {
    const skipped: AuditCapability = {
      id: 'skipped',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => false,
      runCodeLayer: () => Promise.reject(new Error('must not run')),
    };
    const { store } = await runAndPersist([capability('a', false), skipped]);

    const row = (store.executions as { capabilityId: string; skippedReason: string | null }[]).find(
      (e) => e.capabilityId === 'skipped',
    );
    expect(row?.skippedReason).toBeTruthy();
  });
});

describe('SC-006 - persistence refuses an unattributed finding', () => {
  it('throws for a forged finding rather than writing it', async () => {
    const store = recorder();
    const forged = {
      checkId: 'forged.check',
      fingerprint: 'a'.repeat(64),
      severity: 'CRITICAL',
      title: 'Forged',
      explanation: 'x',
      consequence: 'y',
      fixPrompt: 'z',
      attribution: 'MEASURED',
      layer: 'CODE',
    };

    await expect(
      persistModuleResult(store.db, {
        scanId: 'scan_1',
        module: 'SECURITY',
        state: 'COMPLETE',
        score: 100,
        summary: undefined,
        skippedReason: undefined,
        degradedReason: undefined,
        findings: [forged] as never,
        executions: [],
        aiInvocations: [],
        aiCostMicros: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      }),
    ).rejects.toBeInstanceOf(UnattributedFindingError);

    // Nothing was written. The check runs before the first insert, so a forged
    // finding cannot land half a module's rows before being caught.
    expect(store.moduleResults).toEqual([]);
    expect(store.issues).toEqual([]);
  });

  it('names the check in the error, so the offending path is findable', async () => {
    const store = recorder();
    try {
      await persistModuleResult(store.db, {
        scanId: 's',
        module: 'SEO',
        state: 'COMPLETE',
        score: 100,
        summary: undefined,
        skippedReason: undefined,
        degradedReason: undefined,
        findings: [{ checkId: 'meta.title' }] as never,
        executions: [],
        aiInvocations: [],
        aiCostMicros: 0,
        startedAt: new Date(),
        completedAt: new Date(),
      });
    } catch (error) {
      expect((error as Error).message).toContain('meta.title');
      expect((error as Error).message).toContain('SC-006');
    }
  });
});
