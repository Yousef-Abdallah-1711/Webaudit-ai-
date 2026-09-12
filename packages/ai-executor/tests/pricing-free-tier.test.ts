import { afterEach, describe, expect, it } from 'vitest';
import { assemblePrompt } from '@webaudit/redaction';
import { z } from 'zod';
import { createExecutor } from '../src/executor.js';
import { createExecutorFromEnv } from '../src/from-env.js';
import { costMicrosOf, type Provider } from '../src/provider.js';
import { PricingNotConfiguredError, pricingFrom } from '../src/pricing.js';

const originalAiMode = process.env['AI_MODE'];

afterEach(() => {
  if (originalAiMode === undefined) delete process.env['AI_MODE'];
  else process.env['AI_MODE'] = originalAiMode;
});

describe('explicit free-tier provider pricing', () => {
  it('records a real zero cost when a provider is explicitly marked free-tier', async () => {
    const pricing = pricingFrom('free-provider', { freeTier: true }, [
      'FREE_PROVIDER_INPUT_USD_PER_MTOK',
      'FREE_PROVIDER_OUTPUT_USD_PER_MTOK',
    ]);
    const provider = (vendor: string): Provider => ({
      vendor,
      model: 'free-model',
      pricing,
      generate: () =>
        Promise.resolve({
          outcome: 'SUCCESS',
          text: '{"ok":true}',
          promptTokens: 20_000,
          outputTokens: 10_000,
        }),
    });
    const prompt = assemblePrompt({
      instructions: 'Answer as JSON.',
      segments: [{ label: 'input', path: 'input.txt', content: 'safe text' }],
    }).prompt;

    const result = await createExecutor({
      chain: [provider('free-primary'), provider('paid-fallback')],
    }).run({ task: 'free-tier', prompt, schema: z.object({ ok: z.boolean() }) });

    expect(result.ok).toBe(true);
    expect(costMicrosOf(pricing, 20_000, 10_000)).toBe(0);
    expect(result.invocations).toHaveLength(1);
    expect(result.invocations[0]?.costMicros).toBe(0);
  });

  it('still refuses a provider with no price and no explicit free-tier flag', () => {
    expect(() =>
      pricingFrom('openai', {}, ['OPENAI_INPUT_USD_PER_MTOK', 'OPENAI_OUTPUT_USD_PER_MTOK']),
    ).toThrow(PricingNotConfiguredError);
  });

  it('passes an explicit provider free-tier flag through env chain construction', () => {
    delete process.env['AI_MODE'];

    const executor = createExecutorFromEnv({
      NODE_ENV: 'test',
      AI_CHAIN: 'google,openai',
      GOOGLE_API_KEY: 'test-google-key',
      GOOGLE_MODEL: 'gemini-free',
      GOOGLE_FREE_TIER: 'true',
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_MODEL: 'gpt-test',
      OPENAI_INPUT_USD_PER_MTOK: '1.00',
      OPENAI_OUTPUT_USD_PER_MTOK: '2.00',
    });

    expect(executor.chain[0]?.vendor).toBe('google');
    expect(executor.chain[0]?.pricing).toEqual({
      inputMicrosPerMillion: 0,
      outputMicrosPerMillion: 0,
    });
  });
});
