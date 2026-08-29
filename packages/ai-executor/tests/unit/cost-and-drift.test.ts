/**
 * T081 / T082 — cost in integer micros, and drift that only fires when it means
 * something.
 *
 * The float tests are the point of the first half. CLAUDE.md's rule is "Money in
 * integer micros. Never floats", and FR-081 requires reconciliation against
 * credits charged — a total that drifts by fractions of a cent per call is a
 * margin report that disagrees with the ledger, which is worse than no margin
 * report.
 */

import { describe, expect, it } from 'vitest';
import { costMicrosOf, dollarsPerMillionToMicros, pricingFrom } from '../../src/index.js';
import { PricingNotConfiguredError } from '../../src/pricing.js';
import { computeDrift } from '../../src/drift.js';
import { recordInvocations, totalCostMicros, totalTokens } from '../../src/record.js';
import type { AiInvocationRecord } from '../../src/executor.js';

describe('dollar rates become exact integer micros', () => {
  it.each([
    ['5.00', 5_000_000],
    ['25.00', 25_000_000],
    ['3', 3_000_000],
    ['0.15', 150_000],
    ['0.075', 75_000],
    ['1.000001', 1_000_001],
    ['0', 0],
  ])('%s per million becomes %i micros', (raw, expected) => {
    expect(dollarsPerMillionToMicros(raw)).toBe(expected);
  });

  it('never produces a fraction, even for rates a float cannot represent', () => {
    // 0.1 + 0.2 !== 0.3 is the whole reason this function does string
    // arithmetic rather than multiplying by 1e6.
    for (const raw of ['0.1', '0.2', '0.3', '0.07', '0.29']) {
      expect(Number.isInteger(dollarsPerMillionToMicros(raw))).toBe(true);
    }
    expect(dollarsPerMillionToMicros('0.1') + dollarsPerMillionToMicros('0.2')).toBe(
      dollarsPerMillionToMicros('0.3'),
    );
  });
});

describe('pricing is configuration, and its absence is loud', () => {
  it('parses a configured pair', () => {
    expect(pricingFrom('anthropic', { input: '5.00', output: '25.00' }, ['A', 'B'])).toEqual({
      inputMicrosPerMillion: 5_000_000,
      outputMicrosPerMillion: 25_000_000,
    });
  });

  it.each([
    ['both missing', {}],
    ['input missing', { output: '25.00' }],
    ['output missing', { input: '5.00' }],
    ['not a number', { input: 'free', output: '25.00' }],
    ['a currency symbol', { input: '$5.00', output: '25.00' }],
    ['negative', { input: '-5.00', output: '25.00' }],
    ['empty string', { input: '', output: '' }],
  ])('refuses %s rather than defaulting to zero', (_label, env) => {
    // Defaulting to zero would make the provider look free, and a free provider
    // is the one line in a cost report nobody investigates.
    expect(() => pricingFrom('openai', env, ['OPENAI_IN', 'OPENAI_OUT'])).toThrow(
      PricingNotConfiguredError,
    );
  });

  it('names the variables an operator has to set', () => {
    try {
      pricingFrom('openai', {}, ['OPENAI_INPUT_USD_PER_MTOK', 'OPENAI_OUTPUT_USD_PER_MTOK']);
    } catch (error) {
      expect((error as Error).message).toContain('OPENAI_INPUT_USD_PER_MTOK');
      expect((error as Error).message).toContain('OPENAI_OUTPUT_USD_PER_MTOK');
    }
  });
});

describe('costMicrosOf', () => {
  const opus = { inputMicrosPerMillion: 5_000_000, outputMicrosPerMillion: 25_000_000 };

  it('computes a real invocation exactly', () => {
    // 200k in at $5/1M = $1.00; 50k out at $25/1M = $1.25. Total $2.25.
    expect(costMicrosOf(opus, 200_000, 50_000)).toBe(2_250_000);
  });

  it('always returns an integer', () => {
    for (const [prompt, output] of [
      [1, 1],
      [7, 3],
      [999, 1],
      [123_457, 65_539],
    ] as const) {
      expect(Number.isInteger(costMicrosOf(opus, prompt, output))).toBe(true);
    }
  });

  it('rounds once at the end rather than per side', () => {
    // Rounding each side separately biases the total upward or downward
    // systematically; over a million calls that is real money.
    const cheap = { inputMicrosPerMillion: 1, outputMicrosPerMillion: 1 };
    expect(costMicrosOf(cheap, 1, 1)).toBe(0);
    expect(costMicrosOf(cheap, 500_000, 500_001)).toBe(1);
  });

  it('is zero when the model is unpriced, not NaN', () => {
    expect(costMicrosOf(undefined, 1000, 1000)).toBe(0);
  });

  it('is zero for a zero-token attempt', () => {
    expect(costMicrosOf(opus, 0, 0)).toBe(0);
  });
});

const record = (over: Partial<AiInvocationRecord> = {}): AiInvocationRecord => ({
  provider: 'anthropic',
  model: 'claude-opus-5',
  chainPosition: 0,
  promptTokens: 100,
  outputTokens: 50,
  latencyMs: 400,
  costMicros: 1_750,
  outcome: 'SUCCESS',
  ...over,
});

describe('recording every attempt', () => {
  it('writes one row per invocation, linked to the execution', async () => {
    const written: unknown[] = [];
    const db = {
      aiInvocation: {
        createMany: (args: { data: unknown[] }) => {
          written.push(...args.data);
          return Promise.resolve({ count: args.data.length });
        },
      },
    };

    const outcome = await recordInvocations(db, { executionId: 'exec_1', scanId: 'scan_1' }, [
      record({ outcome: 'ERROR', chainPosition: 0, costMicros: 0 }),
      record({ outcome: 'SUCCESS', chainPosition: 1 }),
    ]);

    expect(outcome.written).toBe(2);
    // FR-039 records failures too: an outage that leaves no row is invisible.
    expect(written).toHaveLength(2);
    expect(written[0]).toMatchObject({ executionId: 'exec_1', outcome: 'ERROR' });
  });

  it('reports a write failure instead of raising it', async () => {
    // The audit already happened. Losing a row must not lose the audit.
    const db = {
      aiInvocation: {
        createMany: () => Promise.reject(new Error('connection terminated')),
      },
    };
    const outcome = await recordInvocations(db, { scanId: 's' }, [record()]);
    expect(outcome.written).toBe(0);
    expect(outcome.problem).toContain('connection terminated');
  });

  it('writes nothing for an empty set', async () => {
    let called = false;
    const db = {
      aiInvocation: {
        createMany: () => {
          called = true;
          return Promise.resolve({ count: 0 });
        },
      },
    };
    expect((await recordInvocations(db, {}, [])).written).toBe(0);
    expect(called).toBe(false);
  });

  it('totals cost and tokens across an operation', () => {
    const invocations = [
      record({ costMicros: 0, promptTokens: 100, outputTokens: 0, outcome: 'RATE_LIMITED' }),
      record({ costMicros: 2_250_000, promptTokens: 200_000, outputTokens: 50_000 }),
    ];
    expect(totalCostMicros(invocations)).toBe(2_250_000);
    // Failed attempts consumed tokens too, and FR-082 compares against reality.
    expect(totalTokens(invocations)).toBe(250_100);
  });
});

describe('drift only speaks when it means something', () => {
  const samples = (id: string, declared: number, actuals: readonly number[]) =>
    actuals.map((actual) => ({
      capabilityId: id,
      estimatedTokens: declared,
      actualTokens: actual,
    }));

  it('says nothing below the sample floor', () => {
    // Nine executions of a wildly overspending capability is still nine.
    expect(computeDrift(samples('a', 1000, Array(9).fill(9000)))).toEqual([]);
  });

  it('surfaces sustained overshoot', () => {
    const drift = computeDrift(samples('greedy', 1000, Array(12).fill(3000)));
    expect(drift).toHaveLength(1);
    expect(drift[0]?.direction).toBe('OVERSHOOT');
    expect(drift[0]?.ratio).toBe(3);
    expect(drift[0]?.samples).toBe(12);
  });

  it('is not moved by a single outlier', () => {
    // Eleven honest runs and one enormous site. A mean would flag this; the
    // median is what makes the signal worth reading.
    const actuals = [...Array(11).fill(1000), 500_000];
    expect(computeDrift(samples('honest', 1000, actuals))).toEqual([]);
  });

  it('reports under-declaration separately, and never as a risk', () => {
    const drift = computeDrift(samples('timid', 10_000, Array(12).fill(2000)));
    expect(drift[0]?.direction).toBe('UNDERSHOOT');
    expect(drift[0]?.note).toMatch(/not a platform cost risk/i);
  });

  it('says nothing when the estimate is honest', () => {
    expect(computeDrift(samples('fine', 1000, Array(20).fill(1050)))).toEqual([]);
  });

  it('calls a zero declaration that spends tokens a principle violation', () => {
    // A CODE-layer capability declaring zero and consuming tokens is not drift.
    const drift = computeDrift(samples('code-layer-liar', 0, Array(12).fill(500)));
    expect(drift).toHaveLength(1);
    expect(drift[0]?.ratio).toBe(Number.POSITIVE_INFINITY);
    expect(drift[0]?.note).toMatch(/Principle III/);
  });

  it('leaves an honest zero declaration alone', () => {
    expect(computeDrift(samples('true-code-layer', 0, Array(20).fill(0)))).toEqual([]);
  });

  it('orders the worst offender first', () => {
    const drift = computeDrift([
      ...samples('twice', 1000, Array(12).fill(2000)),
      ...samples('tenfold', 1000, Array(12).fill(10_000)),
    ]);
    expect(drift.map((d) => d.capabilityId)).toEqual(['tenfold', 'twice']);
  });
});
