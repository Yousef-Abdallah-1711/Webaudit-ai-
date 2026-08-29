/**
 * T077 — SC-012: "Complete unavailability of a single AI provider does not
 * prevent any audit from delivering a report."
 *
 * Read the criterion carefully: *a single* provider. So the primary assertion is
 * that one vendor going completely dark is invisible in the output — the next
 * vendor serves, and the audit is unaffected. That is fully testable here and is
 * the bulk of this suite.
 *
 * The harder neighbour is FR-035: "deliver measured findings without
 * interpretation, and say so, when no AI provider can be reached." So the suite
 * also drives the chain to exhaustion and asserts three things: the executor
 * returns a typed degradation rather than throwing, the code-layer findings
 * survive untouched, and the area is marked DEGRADED with the fact recorded
 * where a user will see it. Principle III is what makes that possible at all —
 * the code layer already measured everything measurable, so losing every
 * provider costs interpretation, not findings.
 *
 * `degradeModule` is the helper the module runner will call at T084. It lives in
 * the executor package because the degradation is the executor's own return
 * type, and testing it here rather than waiting for 2I is what lets SC-012 be
 * green now instead of asserted twice.
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { assemblePrompt } from '@webaudit/redaction';
import type { CapabilityFinding } from '@webaudit/types';
import { createExecutor, degradeModule, type AiResult } from '@webaudit/ai-executor';
import type { Provider, ProviderResponse } from '@webaudit/ai-executor';

const SUMMARY = z.object({ summary: z.string(), findings: z.array(z.string()) });
const GOOD = JSON.stringify({ summary: 'Two headers are missing.', findings: ['csp', 'hsts'] });

function prompt() {
  return assemblePrompt({
    instructions: 'Explain the measured findings.',
    segments: [{ label: 'markup', path: 'index.html', content: '<html lang="en"></html>' }],
  }).prompt;
}

/** What the code layer already measured. It must survive every outage below. */
const MEASURED: readonly CapabilityFinding[] = [
  {
    checkId: 'headers.csp',
    fingerprintParts: ['header', 'content-security-policy'],
    severity: 'HIGH',
    title: 'No Content-Security-Policy header',
    description: 'The response carried no CSP header.',
    fixable: true,
  },
  {
    checkId: 'headers.hsts',
    fingerprintParts: ['header', 'strict-transport-security'],
    severity: 'MEDIUM',
    title: 'No Strict-Transport-Security header',
    description: 'The response carried no HSTS header.',
    fixable: true,
  },
];

function working(vendor: string, reply = GOOD): Provider {
  return {
    vendor,
    model: `${vendor}-model`,
    generate: () =>
      Promise.resolve<ProviderResponse>({
        outcome: 'SUCCESS',
        text: reply,
        promptTokens: 200,
        outputTokens: 80,
      }),
  };
}

/** Completely unavailable: the client itself rejects. */
function down(vendor: string, error = new Error('ECONNREFUSED')): Provider {
  return {
    vendor,
    model: `${vendor}-model`,
    generate: () => Promise.reject(error),
  };
}

/** Reachable but refusing to serve — the realistic outage shape. */
function rateLimited(vendor: string): Provider {
  return {
    vendor,
    model: `${vendor}-model`,
    generate: () =>
      Promise.resolve<ProviderResponse>({
        outcome: 'RATE_LIMITED',
        text: '',
        promptTokens: 0,
        outputTokens: 0,
        errorMessage: '429 too many requests',
      }),
  };
}

function hangs(vendor: string): Provider {
  return {
    vendor,
    model: `${vendor}-model`,
    generate: () =>
      new Promise<ProviderResponse>(() => {
        /* never settles */
      }),
  };
}

async function run(chain: readonly Provider[], timeoutMs = 300): Promise<AiResult<unknown>> {
  const executor = createExecutor({ chain, timeoutMs });
  return executor.run({ task: 'module:security', prompt: prompt(), schema: SUMMARY });
}

// ─── SC-012 proper: one vendor dark ──────────────────────────────────────────

describe('SC-012 - one provider completely unavailable changes nothing', () => {
  it('serves from the second vendor when the first refuses connections', async () => {
    const result = await run([down('vendor-a'), working('vendor-b')]);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect((result.value as { summary: string }).summary).toBe('Two headers are missing.');
    expect(result.invocations.map((i) => i.outcome)).toEqual(['ERROR', 'SUCCESS']);
  });

  it.each([
    ['connection refused', down('vendor-a')],
    ['rate limited', rateLimited('vendor-a')],
    ['timing out', hangs('vendor-a')],
    ['returning an authentication error', down('vendor-a', new Error('401 unauthorized'))],
  ])('survives the first vendor %s', async (_label, broken) => {
    const result = await run([broken, working('vendor-b')]);
    expect(result.ok).toBe(true);
  });

  it('records the dead attempt so an operator can see the outage', async () => {
    // FR-039 records every interaction "including failures". An outage that
    // leaves no trace is an outage nobody notices until the bill changes.
    const result = await run([down('vendor-a', new Error('ECONNREFUSED')), working('vendor-b')]);

    const failed = result.invocations[0]!;
    expect(failed.provider).toBe('vendor-a');
    expect(failed.chainPosition).toBe(0);
    expect(failed.outcome).toBe('ERROR');
    expect(failed.errorMessage).toContain('ECONNREFUSED');
    expect(failed.costMicros).toBe(0);
    expect(failed.latencyMs).toBeGreaterThanOrEqual(0);

    const served = result.invocations[1]!;
    expect(served.chainPosition).toBe(1);
    expect(served.outcome).toBe('SUCCESS');
  });

  it('marks a fallback as position above zero, which is the signal to watch', async () => {
    // The schema comments say it: "Any value above 0 means a fallback carried
    // the request, which is the signal Principle IV exists to make visible."
    const result = await run([down('a'), down('b'), working('c')]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    const served = result.invocations.find((i) => i.outcome === 'SUCCESS')!;
    expect(served.chainPosition).toBe(2);
  });

  it('never throws, whatever the provider does', async () => {
    const nasty: Provider = {
      vendor: 'vendor-a',
      model: 'm',
      generate: () => {
        throw new Error('threw synchronously instead of rejecting');
      },
    };
    await expect(run([nasty, working('vendor-b')])).resolves.toMatchObject({ ok: true });
  });
});

// ─── FR-035: every vendor dark ───────────────────────────────────────────────

describe('FR-035 - total unavailability degrades the area and keeps the findings', () => {
  it('returns a typed degradation rather than throwing', async () => {
    const result = await run([down('vendor-a'), down('vendor-b')]);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.reason).toBe('CHAIN_EXHAUSTED');
    expect(result.invocations).toHaveLength(2);
  });

  it('delivers every measured finding with the area marked DEGRADED', async () => {
    const result = await run([down('vendor-a'), rateLimited('vendor-b')]);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');

    const module = degradeModule({
      module: 'SECURITY',
      measured: MEASURED,
      degradation: result,
    });

    // The findings are all there, and they are MEASURED — not downgraded to a
    // guess because the explainer never ran (FR-032, SC-006).
    expect(module.findings).toHaveLength(2);
    expect(module.findings.map((f) => f.checkId)).toEqual(['headers.csp', 'headers.hsts']);
    expect(module.attribution).toBe('MEASURED');
    expect(module.state).toBe('DEGRADED');
  });

  it('says so, in words a user will read', async () => {
    // FR-035's second clause: "and say so". A silently thinner report is the
    // failure — the user cannot tell an area with nothing wrong from an area
    // nobody interpreted.
    const result = await run([down('a'), down('b')]);
    const module = degradeModule({
      module: 'SECURITY',
      measured: MEASURED,
      degradation: result as never,
    });

    expect(module.notice).toMatch(/could not be reached|no AI provider/i);
    expect(module.notice).toMatch(/measured/i);
  });

  it('decides no score, leaving it to be computed from the measurements', async () => {
    // This assertion used to demand `score: null`, and that was wrong. Excluding
    // a DEGRADED area from the average makes the overall score rise when the
    // worst area in the audit loses its AI layer — the inflation FR-053 forbids.
    // A DEGRADED area is missing interpretation, not measurement, so it carries
    // a score computed from what was measured (MODULE_STATES_SCORED).
    const result = await run([down('a'), down('b')]);
    const module = degradeModule({ module: 'UI', measured: [], degradation: result as never });
    expect(module).not.toHaveProperty('score');
    expect(module.state).toBe('DEGRADED');
  });

  it('degrades with an empty measured set without inventing anything', async () => {
    const result = await run([down('a'), down('b')]);
    const module = degradeModule({ module: 'SEO', measured: [], degradation: result as never });

    expect(module.findings).toEqual([]);
    expect(module.state).toBe('DEGRADED');
    expect(module.notice).toBeTruthy();
  });

  it('carries the invocation records through, so the cost is still attributable', async () => {
    const result = await run([rateLimited('a'), rateLimited('b')]);
    const module = degradeModule({
      module: 'SECURITY',
      measured: MEASURED,
      degradation: result as never,
    });

    // Principle VI: a failed area still has a cost story, even if it is zero.
    expect(module.invocations).toHaveLength(2);
    expect(module.invocations.every((i) => i.costMicros === 0)).toBe(true);
  });
});

// ─── The one thing that must not be a degradation ────────────────────────────

describe('a refused prompt is not a degradation', () => {
  it('throws rather than degrading when the prompt was never redacted', async () => {
    // Degrading here would turn an SC-016 violation into a soft warning and
    // deliver a report as though nothing was wrong. It is a programming error,
    // and it must stop the work.
    const executor = createExecutor({ chain: [working('a'), working('b')] });
    await expect(
      executor.run({ task: 'module:security', prompt: 'raw' as never, schema: SUMMARY }),
    ).rejects.toThrow(/redact/i);
  });
});
