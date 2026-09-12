import { afterEach, describe, expect, it, vi } from 'vitest';
import { createMasterReportExecutorFromEnv } from '../src/from-env.js';
import { createExecutor, fixtureProvider } from '../src/index.js';

afterEach(() => {
  vi.unstubAllEnvs();
});

function fallbackExecutor() {
  return createExecutor({
    chain: [
      fixtureProvider({ vendor: 'a', model: 'm1' }),
      fixtureProvider({ vendor: 'b', model: 'm2' }),
    ],
  });
}

describe('createMasterReportExecutorFromEnv', () => {
  it('returns the fallback executor unchanged when unset', () => {
    const fallback = fallbackExecutor();
    const result = createMasterReportExecutorFromEnv({}, fallback);
    expect(result).toBe(fallback);
  });

  it('builds a distinct, independently-validated chain when set', () => {
    vi.stubEnv('AI_MODE', 'live');
    const fallback = fallbackExecutor();
    const env = {
      AI_CHAIN_MASTER_REPORT: 'anthropic,openai',
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_INPUT_USD_PER_MTOK: '3.00',
      ANTHROPIC_OUTPUT_USD_PER_MTOK: '15.00',
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-test',
      OPENAI_INPUT_USD_PER_MTOK: '1.00',
      OPENAI_OUTPUT_USD_PER_MTOK: '2.00',
    };
    const result = createMasterReportExecutorFromEnv(env, fallback);
    expect(result).not.toBe(fallback);
    expect(result.chain.map((p) => p.vendor)).toEqual(['anthropic', 'openai']);
  });

  it('fails at boot exactly like the primary chain does for a malformed override', () => {
    vi.stubEnv('AI_MODE', 'live');
    const fallback = fallbackExecutor();
    expect(() =>
      createMasterReportExecutorFromEnv({ AI_CHAIN_MASTER_REPORT: 'anthropic' }, fallback),
    ).toThrow();
  });

  it('ignores the override under fixture mode', () => {
    const fallback = fallbackExecutor();
    const result = createMasterReportExecutorFromEnv(
      { AI_MODE: 'fixtures', AI_CHAIN_MASTER_REPORT: 'anthropic,openai' },
      fallback,
    );
    expect(result).toBe(fallback);
  });
});
