import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecutorFromEnv, createMasterReportExecutorFromEnv } from '../src/from-env.js';

/**
 * P1-T1/P1-T2/P1-T5 — `AI_MODE=disabled`: production-safe, zero-provider,
 * zero-network AI mode, and its permanent adjacency to the fixtures guard it
 * must never weaken (master plan, Phase 1).
 */

const originalAiMode = process.env['AI_MODE'];

afterEach(() => {
  if (originalAiMode === undefined) delete process.env['AI_MODE'];
  else process.env['AI_MODE'] = originalAiMode;
});

describe('AI_MODE=disabled and AI_MODE=fixtures in production — kept permanently distinct', () => {
  it('AI_MODE=fixtures + NODE_ENV=production is still rejected', () => {
    expect(() =>
      createExecutorFromEnv({
        NODE_ENV: 'production',
        AI_MODE: 'fixtures',
      }),
    ).toThrow('AI_MODE=fixtures is set with NODE_ENV=production');
  });

  it('AI_MODE=disabled + NODE_ENV=production is accepted', () => {
    expect(() =>
      createExecutorFromEnv({
        NODE_ENV: 'production',
        AI_MODE: 'disabled',
      }),
    ).not.toThrow();
  });
});

describe('AI_MODE=disabled — zero providers, zero network calls', () => {
  it('constructs with no AI provider keys of any kind set', () => {
    const executor = createExecutorFromEnv({
      NODE_ENV: 'production',
      AI_MODE: 'disabled',
      // Explicitly absent: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY.
    });
    expect(executor.chain).toEqual([]);
  });

  it('never calls buildChain — an AI_CHAIN value is ignored entirely, not validated', () => {
    // If this reached buildChain, an unknown "bogus-vendor" name would throw
    // ProviderNotConfiguredError from buildOne. It must not even be looked at.
    expect(() =>
      createExecutorFromEnv({
        NODE_ENV: 'production',
        AI_MODE: 'disabled',
        AI_CHAIN: 'bogus-vendor',
      }),
    ).not.toThrow();
  });

  it('.run() resolves to a typed DISABLED result with no invocations, making no network call', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const executor = createExecutorFromEnv({ NODE_ENV: 'production', AI_MODE: 'disabled' });

    const result = await executor.run({
      task: 'module:security',
      // A disabled executor must not touch `prompt` at all — including never
      // validating it — so an intentionally invalid stand-in is safe here.
      prompt: { text: 'irrelevant' } as never,
      schema: { parse: (v: unknown) => v } as never,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('DISABLED');
      expect(result.invocations).toEqual([]);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it('does not throw ChainConfigurationError even though buildChain([]) alone would', () => {
    // Sanity check on the documented reasoning in from-env.ts: this proves the
    // disabled path is a genuinely separate branch, not a zero-length chain
    // reaching buildChain.
    expect(() => createExecutorFromEnv({ NODE_ENV: 'production', AI_MODE: 'disabled' })).not.toThrow(
      /ChainConfigurationError|distinct vendors/,
    );
  });
});

describe('AI_MODE=disabled — real two-vendor invariant is untouched for real chains', () => {
  // `isFixtureMode()` reads real `process.env['AI_MODE']` (not the injected env
  // object), and this workspace's own local `.env` sets `AI_MODE=fixtures` for
  // dev — so these two assertions must clear it first, exactly like
  // `free-tier-chain.test.ts` already does, or they would silently take the
  // fixtures branch instead of exercising a real chain.
  it('a real AI_CHAIN with only one vendor still throws ChainConfigurationError', () => {
    delete process.env['AI_MODE'];
    expect(() =>
      createExecutorFromEnv({
        NODE_ENV: 'test',
        AI_CHAIN: 'anthropic',
        ANTHROPIC_API_KEY: 'test-key',
        ANTHROPIC_INPUT_USD_PER_MTOK: '1.00',
        ANTHROPIC_OUTPUT_USD_PER_MTOK: '2.00',
      }),
    ).toThrow(/requires at least 2/);
  });

  it('an empty real AI_CHAIN still throws ChainConfigurationError (not treated as disabled)', () => {
    delete process.env['AI_MODE'];
    expect(() =>
      createExecutorFromEnv({
        NODE_ENV: 'test',
        AI_CHAIN: '',
      }),
    ).toThrow(/No AI providers are configured/);
  });
});

describe('createMasterReportExecutorFromEnv under AI_MODE=disabled', () => {
  it('returns the disabled fallback unchanged even when AI_CHAIN_MASTER_REPORT is set', async () => {
    const fallback = createExecutorFromEnv({ NODE_ENV: 'production', AI_MODE: 'disabled' });
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const masterExecutor = createMasterReportExecutorFromEnv(
      {
        NODE_ENV: 'production',
        AI_MODE: 'disabled',
        AI_CHAIN_MASTER_REPORT: 'anthropic,openai',
        ANTHROPIC_API_KEY: 'would-be-real-key',
        OPENAI_API_KEY: 'would-be-real-key',
        OPENAI_MODEL: 'gpt-test',
      },
      fallback,
    );

    expect(masterExecutor.chain).toEqual([]);
    expect(masterExecutor).toBe(fallback);

    const result = await masterExecutor.run({
      task: 'master-report',
      prompt: { text: 'irrelevant' } as never,
      schema: { parse: (v: unknown) => v } as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('DISABLED');
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
