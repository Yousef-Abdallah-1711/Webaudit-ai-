import { afterEach, describe, expect, it } from 'vitest';
import { createExecutorFromEnv } from '../src/from-env.js';

const originalAiMode = process.env['AI_MODE'];

afterEach(() => {
  if (originalAiMode === undefined) delete process.env['AI_MODE'];
  else process.env['AI_MODE'] = originalAiMode;
});

describe('T259 - an explicitly free-tier Google provider can sit in a production-shaped chain', () => {
  it('boots a two-vendor chain without requiring Anthropic configuration or paid primary spend', () => {
    delete process.env['AI_MODE'];

    const executor = createExecutorFromEnv({
      NODE_ENV: 'test',
      AI_CHAIN: 'google,openai',
      GOOGLE_API_KEY: 'test-google-key',
      GOOGLE_MODEL: 'gemini-2.5-flash',
      GOOGLE_FREE_TIER: 'true',
      OPENAI_API_KEY: 'test-openai-key',
      OPENAI_MODEL: 'gpt-test',
      OPENAI_INPUT_USD_PER_MTOK: '1.00',
      OPENAI_OUTPUT_USD_PER_MTOK: '2.00',
    });

    expect(executor.chain.map((provider) => provider.vendor)).toEqual(['google', 'openai']);
    expect(executor.chain[0]?.pricing).toEqual({
      inputMicrosPerMillion: 0,
      outputMicrosPerMillion: 0,
    });
  });
});
