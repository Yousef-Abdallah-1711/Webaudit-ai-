/**
 * T086 — FR-022: "complete an audit when an individual capability fails, marking
 * the affected area incomplete rather than failing the audit."
 *
 * The distinction the suite keeps pressing on is DEGRADED versus FAILED, because
 * they look similar and mean opposite things to a user. DEGRADED says "we
 * measured some of this area and something went wrong"; FAILED says "we measured
 * none of it". Collapsing them either throws away findings that were paid for or
 * claims coverage that does not exist.
 *
 * SC-011 rests on this: "Disabling any single capability leaves every audit still
 * able to complete." 2G proved the resolution half — a snapshot always resolves.
 * This is the execution half, and it closes the criterion.
 */

import { describe, expect, it } from 'vitest';
import type { CapabilityFinding } from '@webaudit/types';
import type { AuditCapability } from '@webaudit/capability-sdk';
import { createExecutor, fixtureProvider } from '@webaudit/ai-executor';
import { runModule } from '../../src/module-runner/index.js';
import { refusingContext } from '../helpers/stub-registry.js';

const AI_REPLY = JSON.stringify({ summary: 'Interpretation.', insights: [], priorityOrder: [] });

function workingExecutor() {
  return createExecutor({
    chain: [
      fixtureProvider({ vendor: 'vendor-a', model: 'm1', reply: AI_REPLY }),
      fixtureProvider({ vendor: 'vendor-b', model: 'm2', reply: AI_REPLY }),
    ],
    timeoutMs: 1000,
  });
}

function darkExecutor() {
  const dead = (vendor: string) => ({
    vendor,
    model: `${vendor}-m`,
    generate: () => Promise.reject(new Error('provider unavailable')),
  });
  return createExecutor({ chain: [dead('vendor-a'), dead('vendor-b')], timeoutMs: 300 });
}

function finding(id: string, severity: CapabilityFinding['severity'] = 'HIGH'): CapabilityFinding {
  return {
    checkId: `${id}.check`,
    fingerprintParts: [id],
    severity,
    title: `From ${id}`,
    description: 'Measured.',
    fixable: true,
  };
}

function good(id: string, severity: CapabilityFinding['severity'] = 'HIGH'): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () => Promise.resolve([finding(id, severity)]),
  };
}

function thrower(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () => {
      throw new Error(`${id} exploded`);
    },
  };
}

function rejecter(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () => Promise.reject(new Error(`${id} rejected`)),
  };
}

function hanger(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => true,
    runCodeLayer: () =>
      new Promise<CapabilityFinding[]>(() => {
        /* never settles */
      }),
  };
}

function inapplicable(id: string): AuditCapability {
  return {
    id,
    module: 'SECURITY',
    layer: 'CODE',
    canRun: () => false,
    runCodeLayer: () => Promise.reject(new Error('canRun said no; this must never be called')),
  };
}

async function run(capabilities: readonly AuditCapability[], ai = workingExecutor()) {
  return runModule({
    module: 'SECURITY',
    capabilities,
    input: { priorModuleResults: {}, controlLevel: 'NONE', targetUrl: 'https://example.com' },
    executor: ai,
    makeContext: refusingContext,
    timeoutMs: 400,
  });
}

describe('FR-022 - one capability failing degrades the area, never fails it', () => {
  it.each([
    ['throws synchronously', thrower('bad')],
    ['rejects', rejecter('bad')],
    ['hangs past its deadline', hanger('bad')],
  ])('keeps the area DEGRADED when a capability %s', async (_label, bad) => {
    const result = await run([good('ok-1'), bad, good('ok-2')]);

    expect(result.state).toBe('DEGRADED');
    // The two that worked still delivered. That is the whole point.
    expect(result.findings.map((f) => f.checkId).sort()).toEqual(['ok-1.check', 'ok-2.check']);
  });

  it('never throws out of runModule, whatever a capability does', async () => {
    await expect(run([thrower('a'), rejecter('b'), hanger('c')])).resolves.toBeDefined();
  });

  it('records the failure against the capability that caused it', async () => {
    const result = await run([good('ok'), thrower('bad')]);

    const failed = result.executions.find((e) => e.capabilityId === 'bad');
    expect(failed?.succeeded).toBe(false);
    expect(failed?.errorMessage).toContain('exploded');
    expect(failed?.findingCount).toBe(0);

    const worked = result.executions.find((e) => e.capabilityId === 'ok');
    expect(worked?.succeeded).toBe(true);
    expect(worked?.findingCount).toBe(1);
  });

  it('still scores the area, because a DEGRADED area measured something', async () => {
    // FR-053's real requirement: excluding this area would make the overall
    // score rise, which is the inflation it forbids.
    const result = await run([good('ok', 'CRITICAL'), thrower('bad')]);

    expect(result.state).toBe('DEGRADED');
    expect(result.score).not.toBeNull();
    expect(result.score).toBe(75);
  });

  it('reports why it degraded, in the field the report reads', async () => {
    const result = await run([good('ok'), thrower('bad')]);
    expect(result.degradedReason).toContain('bad');
  });
});

describe('the difference between DEGRADED and FAILED', () => {
  it('is FAILED only when every capability failed and nothing was measured', async () => {
    const result = await run([thrower('a'), rejecter('b')]);

    expect(result.state).toBe('FAILED');
    expect(result.findings).toEqual([]);
    // No score. Nothing was measured, so any number would be invented — and a
    // zero would deflate the total as badly as an omission inflates it.
    expect(result.score).toBeNull();
  });

  it('is COMPLETE when everything ran, even if nothing was found', async () => {
    const clean: AuditCapability = {
      id: 'clean',
      module: 'SECURITY',
      layer: 'CODE',
      canRun: () => true,
      runCodeLayer: () => Promise.resolve([]),
    };
    const result = await run([clean]);

    expect(result.state).toBe('COMPLETE');
    expect(result.findings).toEqual([]);
    // A clean area scores 100. This is the case a `findings.length === 0` check
    // for NOT_APPLICABLE would get wrong.
    expect(result.score).toBe(100);
  });

  it('is NOT_APPLICABLE when nothing was applicable, which is not a failure', async () => {
    const result = await run([inapplicable('a'), inapplicable('b')]);

    expect(result.state).toBe('NOT_APPLICABLE');
    expect(result.score).toBeNull();
    expect(result.skippedReason).toBeTruthy();
    // FR-021: skipped, never run, never reported as a pass.
    expect(result.executions.every((e) => e.skippedReason !== undefined)).toBe(true);
  });

  it('is NOT_APPLICABLE when there were no capabilities at all', async () => {
    // The state an operator reaches by disabling every capability in an area.
    const result = await run([]);
    expect(result.state).toBe('NOT_APPLICABLE');
    expect(result.score).toBeNull();
  });

  it('does not call a capability whose canRun returned false', async () => {
    // The inapplicable fixtures reject if invoked, so this passing at all is the
    // assertion. FR-021: "rather than running it or reporting a pass."
    const result = await run([good('ok'), inapplicable('skipped')]);
    expect(result.state).toBe('COMPLETE');
    expect(result.findings).toHaveLength(1);
  });

  it('treats a skip as neither a success nor a failure for the area state', async () => {
    const result = await run([good('ok'), inapplicable('skipped')]);
    expect(result.state).toBe('COMPLETE');
  });
});

describe('SC-011 - the execution half', () => {
  it('completes the area with any single capability removed', async () => {
    const all = ['a', 'b', 'c', 'd'];
    for (const removed of all) {
      const capabilities = all.filter((id) => id !== removed).map((id) => good(id));
      const result = await run(capabilities);

      expect(result.state, `without ${removed}`).toBe('COMPLETE');
      expect(result.findings, `without ${removed}`).toHaveLength(3);
      expect(result.score, `without ${removed}`).not.toBeNull();
    }
  });

  it('completes the area with any single capability broken', async () => {
    const all = ['a', 'b', 'c', 'd'];
    for (const broken of all) {
      const capabilities = all.map((id) => (id === broken ? thrower(id) : good(id)));
      const result = await run(capabilities);

      // DEGRADED, not FAILED, and the other three still delivered.
      expect(result.state, `${broken} broken`).toBe('DEGRADED');
      expect(result.findings, `${broken} broken`).toHaveLength(3);
    }
  });

  it('degrades rather than fails when the AI layer is entirely dark', async () => {
    const withAi: AuditCapability = {
      ...good('with-ai'),
      layer: 'BOTH',
      getSystemPromptAddition: () => 'Consider interactions.',
    };
    const result = await run([withAi], darkExecutor());

    expect(result.state).toBe('DEGRADED');
    // FR-035: the measured findings survive, attributed MEASURED.
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.attribution).toBe('MEASURED');
    expect(result.degradedReason).toMatch(/provider|AI/i);
    expect(result.score).not.toBeNull();
  });

  it('fails the area only when both layers produced nothing', async () => {
    const brokenWithAi: AuditCapability = {
      ...thrower('broken'),
      layer: 'BOTH',
      getSystemPromptAddition: () => 'x',
    };
    const result = await run([brokenWithAi], darkExecutor());

    expect(result.state).toBe('FAILED');
    expect(result.findings).toEqual([]);
    expect(result.score).toBeNull();
  });
});
