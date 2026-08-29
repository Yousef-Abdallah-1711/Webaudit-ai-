/**
 * Principle VI, the half that is easy to miss: **record real provider cost**.
 *
 * "Never charge for our failures" is the memorable half and it was already
 * enforced — a refused call refunds. The other half is that the ledger must be
 * true, and three ways it could be false survived 2H because each looks like a
 * conservative choice when read rather than run.
 *
 *   1. **A billed call recorded at zero.** The executor decided billability from
 *      the *outcome*, so anything not SUCCESS cost nothing. That is right for a
 *      timeout or a connection refusal and wrong for the two cases where an
 *      adapter returns real, non-guessed token counts on a non-SUCCESS outcome:
 *      OpenAI truncating at `finish_reason: 'length'`, and Claude declining with
 *      `stop_reason: 'refusal'`. The truncated one is the most expensive call
 *      the chain can make — output ran to the ceiling — and it was booked at
 *      zero. Nothing surfaces until someone reconciles against an invoice, which
 *      is exactly the scenario `pricing.ts` exists to prevent.
 *
 *   2. **`NaN` in a money column.** `costMicrosOf` did integer-micro arithmetic
 *      with no finiteness or sign guard. One adapter defends itself by
 *      defaulting absent counts to zero; that defence belongs at the
 *      arithmetic, because a gateway or a future adapter returning a malformed
 *      `usage` block makes the whole scan's `totalCostMicros` `NaN`.
 *
 *   3. **Fixture mode reachable in production.** `AI_MODE=fixtures` returned two
 *      stub vendors that satisfy the two-vendor check and answer `{}`. Set in
 *      production, every area degrades, every cost is zero, and nothing refuses
 *      to boot. The whole argument for a startup-time chain check is that a
 *      misconfiguration surfaces during the deploy; one environment variable
 *      moved it back to "nobody notices".
 */

import { describe, expect, it } from 'vitest';
import { createExecutor } from '../../src/executor.js';
import { costMicrosOf, type Provider } from '../../src/provider.js';
import { pricingFrom } from '../../src/pricing.js';
import { createExecutorFromEnv } from '../../src/from-env.js';
import { assemblePrompt } from '@webaudit/redaction';
import { z } from 'zod';

/** $3 per million in, $15 per million out — a realistic frontier rate. */
const PRICING = pricingFrom('test-vendor', { input: '3.00', output: '15.00' }, [
  'TEST_INPUT',
  'TEST_OUTPUT',
]);

const SCHEMA = z.object({ ok: z.boolean() });

function prompt() {
  return assemblePrompt({
    instructions: 'Answer as JSON.',
    segments: [{ label: 'body', path: 'a.txt', content: 'nothing sensitive' }],
  }).prompt;
}

/** A provider that reports a non-SUCCESS outcome while reporting real usage. */
function billedButFailed(vendor: string, outcome: 'ERROR' | 'RATE_LIMITED'): Provider {
  return {
    vendor,
    model: `${vendor}-m`,
    pricing: PRICING,
    generate: () =>
      Promise.resolve({
        outcome,
        text: '',
        promptTokens: 20_000,
        outputTokens: 16_000,
        errorMessage: 'the response hit the token ceiling and was truncated',
      }),
  };
}

async function runAgainst(chain: readonly Provider[]) {
  const executor = createExecutor({ chain: [...chain], timeoutMs: 1000 });
  return executor.run({ task: 'test', prompt: prompt(), schema: SCHEMA });
}

describe('a call that consumed tokens is recorded at what it cost', () => {
  it('bills a truncated response that reported real token counts', async () => {
    const result = await runAgainst([
      billedButFailed('vendor-a', 'ERROR'),
      billedButFailed('vendor-b', 'ERROR'),
    ]);

    // 20000 in at $3/Mtok is 60000 micros; 16000 out at $15/Mtok is 240000.
    const expected = costMicrosOf(PRICING, 20_000, 16_000);
    expect(expected).toBe(300_000);

    for (const invocation of result.invocations) {
      // Recording zero here is $0.30 of real spend that reconciliation cannot
      // see, per occurrence, on the most expensive call the chain makes.
      expect(invocation.costMicros).toBe(expected);
    }
  });

  it('still records zero when the provider reported no usage at all', async () => {
    // The conservative case the original rule was written for. A provider that
    // never answered consumed nothing, and inventing a number for it would be
    // the opposite error.
    // Distinct vendors: the chain refuses a repeated entry, because "a repeated
    // entry adds spend, not resilience".
    const dead = (vendor: string): Provider => ({
      vendor,
      model: 'm',
      pricing: PRICING,
      generate: () => Promise.reject(new Error('connection refused')),
    });

    const result = await runAgainst([dead('vendor-dead-a'), dead('vendor-dead-b')]);
    for (const invocation of result.invocations) {
      expect(invocation.costMicros).toBe(0);
    }
  });

  it('records zero for a provider with no pricing rather than guessing', async () => {
    const unpriced = (vendor: string): Provider => ({
      vendor,
      model: 'm',
      generate: () =>
        Promise.resolve({
          outcome: 'ERROR' as const,
          text: '',
          promptTokens: 9_000,
          outputTokens: 9_000,
        }),
    });
    const result = await runAgainst([unpriced('unpriced-a'), unpriced('unpriced-b')]);
    for (const invocation of result.invocations) {
      expect(invocation.costMicros).toBe(0);
    }
  });
});

describe('costMicrosOf never returns a value a ledger cannot hold', () => {
  it.each([
    ['NaN prompt tokens', Number.NaN, 100],
    ['NaN output tokens', 100, Number.NaN],
    ['Infinite prompt tokens', Number.POSITIVE_INFINITY, 100],
    ['negative prompt tokens', -1_000_000, 100],
    ['negative output tokens', 100, -1_000_000],
  ])('refuses %s', (_label, promptTokens, outputTokens) => {
    const micros = costMicrosOf(PRICING, promptTokens, outputTokens);
    expect(Number.isFinite(micros)).toBe(true);
    // Money in this system is a non-negative integer count of micros. A negative
    // cost is a credit we never issued.
    expect(Number.isInteger(micros)).toBe(true);
    expect(micros).toBeGreaterThanOrEqual(0);
  });

  it('still computes an ordinary call exactly', () => {
    expect(costMicrosOf(PRICING, 1_000_000, 1_000_000)).toBe(3_000_000 + 15_000_000);
    expect(costMicrosOf(PRICING, 0, 0)).toBe(0);
  });
});

describe('fixture mode cannot be switched on in production', () => {
  const base = {
    AI_MODE: 'fixtures',
    ANTHROPIC_API_KEY: 'k',
    OPENAI_API_KEY: 'k',
  } as const;

  it('refuses to build a fixture chain when NODE_ENV is production', () => {
    expect(() => createExecutorFromEnv({ ...base, NODE_ENV: 'production' })).toThrow(/AI_MODE/);
  });

  it('still builds a fixture chain outside production', () => {
    // The suites depend on this, and `AI_MODE=fixtures` is how the whole test
    // run avoids live provider spend.
    expect(() => createExecutorFromEnv({ ...base, NODE_ENV: 'test' })).not.toThrow();
  });
});
