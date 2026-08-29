/**
 * T075 — FR-034 and Principle IV: the chain must span at least two distinct
 * vendors, and that is checked at startup.
 *
 * quickstart.md is explicit about where the check belongs: "Two vendors must be
 * configured or the AI executor **refuses to start** — Principle IV's two-vendor
 * minimum is a startup check, not a runtime surprise." The failure this prevents
 * is not a crash. It is a deployment that looks healthy, serves audits happily
 * for a month, and then loses every AI-layer finding at once the first time its
 * single vendor has an outage — which is exactly what SC-012 says must not
 * happen.
 *
 * The distinction the suite keeps insisting on is **vendor, not entry**. Three
 * Claude models is a chain of three that dies in one outage. A chain length
 * check would pass it; only counting distinct vendors catches it.
 */

import { describe, expect, it } from 'vitest';
import { ChainConfigurationError, buildChain, describeChain } from '../src/chain.js';
import { fixtureProvider } from '../src/providers/fixtures.provider.js';
import type { Provider } from '../src/provider.js';

function stub(vendor: string, model: string): Provider {
  return {
    vendor,
    model,
    generate: () =>
      Promise.resolve({
        outcome: 'SUCCESS',
        text: '{}',
        promptTokens: 1,
        outputTokens: 1,
      }),
  };
}

describe('Principle IV - the chain refuses to start on one vendor', () => {
  it('accepts two distinct vendors', () => {
    const chain = buildChain([stub('anthropic', 'claude-opus-5'), stub('openai', 'gpt-x')]);
    expect(chain).toHaveLength(2);
    expect(describeChain(chain)).toBe('anthropic/claude-opus-5 → openai/gpt-x');
  });

  it('refuses a single provider', () => {
    expect(() => buildChain([stub('anthropic', 'claude-opus-5')])).toThrow(ChainConfigurationError);
  });

  it('refuses three models from one vendor, however long the chain', () => {
    // The case a length check waves through. Three entries, one outage.
    const oneVendor = [
      stub('anthropic', 'claude-opus-5'),
      stub('anthropic', 'claude-sonnet-5'),
      stub('anthropic', 'claude-haiku-4-5'),
    ];
    expect(() => buildChain(oneVendor)).toThrow(/vendor/i);

    try {
      buildChain(oneVendor);
    } catch (error) {
      const failure = error as ChainConfigurationError;
      expect(failure.vendorCount).toBe(1);
      expect(failure.required).toBe(2);
      // The message has to be actionable at 3am: it names what is configured.
      expect(failure.message).toContain('anthropic');
    }
  });

  it('refuses an empty chain rather than starting with no AI at all', () => {
    expect(() => buildChain([])).toThrow(ChainConfigurationError);
  });

  it('treats vendor identity case-insensitively', () => {
    // `Anthropic` and `anthropic` are one vendor. Letting case split them would
    // make the check defeatable by a typo in configuration.
    expect(() => buildChain([stub('Anthropic', 'a'), stub('anthropic', 'b')])).toThrow(
      ChainConfigurationError,
    );
  });

  it('rejects a provider with no vendor or no model rather than counting it', () => {
    expect(() => buildChain([stub('', 'a'), stub('openai', 'b')])).toThrow(/vendor/i);
    expect(() => buildChain([stub('anthropic', ''), stub('openai', 'b')])).toThrow(/model/i);
  });

  it('rejects two entries that are the same vendor and model twice', () => {
    // A duplicated configuration line. It reads as a two-entry chain and is one
    // provider asked twice.
    expect(() =>
      buildChain([stub('anthropic', 'claude-opus-5'), stub('anthropic', 'claude-opus-5')]),
    ).toThrow(ChainConfigurationError);
  });

  it('preserves the configured order, because order is the fallback order', () => {
    const chain = buildChain([
      stub('openai', 'gpt-x'),
      stub('anthropic', 'claude-opus-5'),
      stub('google', 'gemini-y'),
    ]);
    expect(chain.map((p) => p.vendor)).toEqual(['openai', 'anthropic', 'google']);
  });
});

describe('the fixtures chain', () => {
  it('spans two vendors, so tests exercise the real fallback walk', () => {
    // AI_MODE=fixtures must not be a one-vendor shortcut: if the fixture chain
    // could not satisfy the startup check, every suite would be testing a
    // configuration production refuses to run.
    const chain = buildChain([
      fixtureProvider({ vendor: 'fixture-a', model: 'stub-1' }),
      fixtureProvider({ vendor: 'fixture-b', model: 'stub-2' }),
    ]);
    expect(chain).toHaveLength(2);
  });

  it('costs nothing, so a suite can never spend', () => {
    const provider = fixtureProvider({ vendor: 'fixture-a', model: 'stub-1' });
    expect(provider.pricing).toEqual({ inputMicrosPerMillion: 0, outputMicrosPerMillion: 0 });
  });
});
