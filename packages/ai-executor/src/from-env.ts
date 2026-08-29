/**
 * The production wiring: environment to a validated chain.
 *
 * Kept separate from `executor.ts` so the executor itself has no opinion about
 * configuration and stays trivially testable with stub providers — which is what
 * every suite does.
 *
 * The order of the chain is the order of the fallback, and it is taken from
 * `AI_CHAIN` rather than inferred. An inferred order would mean the fallback
 * order changed when someone added a key, which is an operational decision made
 * by accident.
 */

import { createExecutor, type AiExecutor } from './executor.js';
import { pricingFrom } from './pricing.js';
import type { Provider } from './provider.js';
import { claudeProvider } from './providers/claude.provider.js';
import { fixtureProvider, isFixtureMode } from './providers/fixtures.provider.js';
import { geminiProvider } from './providers/gemini.provider.js';
import { openAiProvider } from './providers/openai.provider.js';

export class ProviderNotConfiguredError extends Error {
  override readonly name = 'ProviderNotConfiguredError';
  constructor(name: string, missing: string) {
    super(`The AI chain names "${name}" but ${missing} is not set.`);
  }
}

/** Default order: the house model first, then two independent vendors. */
const DEFAULT_CHAIN = 'anthropic,openai';

type Env = Record<string, string | undefined>;

function buildOne(name: string, env: Env): Provider {
  switch (name) {
    case 'anthropic': {
      const apiKey = env['ANTHROPIC_API_KEY'];
      if (apiKey === undefined || apiKey === '') {
        throw new ProviderNotConfiguredError(name, 'ANTHROPIC_API_KEY');
      }
      return claudeProvider({
        apiKey,
        ...(env['ANTHROPIC_MODEL'] === undefined ? {} : { model: env['ANTHROPIC_MODEL'] }),
        pricing: pricingFrom(
          name,
          {
            input: env['ANTHROPIC_INPUT_USD_PER_MTOK'],
            output: env['ANTHROPIC_OUTPUT_USD_PER_MTOK'],
          },
          ['ANTHROPIC_INPUT_USD_PER_MTOK', 'ANTHROPIC_OUTPUT_USD_PER_MTOK'],
        ),
      });
    }
    case 'openai': {
      const apiKey = env['OPENAI_API_KEY'];
      const model = env['OPENAI_MODEL'];
      if (apiKey === undefined || apiKey === '') {
        throw new ProviderNotConfiguredError(name, 'OPENAI_API_KEY');
      }
      if (model === undefined || model === '') {
        throw new ProviderNotConfiguredError(name, 'OPENAI_MODEL');
      }
      return openAiProvider({
        apiKey,
        model,
        ...(env['OPENAI_BASE_URL'] === undefined ? {} : { baseURL: env['OPENAI_BASE_URL'] }),
        pricing: pricingFrom(
          name,
          { input: env['OPENAI_INPUT_USD_PER_MTOK'], output: env['OPENAI_OUTPUT_USD_PER_MTOK'] },
          ['OPENAI_INPUT_USD_PER_MTOK', 'OPENAI_OUTPUT_USD_PER_MTOK'],
        ),
      });
    }
    case 'google': {
      const apiKey = env['GOOGLE_API_KEY'];
      const model = env['GOOGLE_MODEL'];
      if (apiKey === undefined || apiKey === '') {
        throw new ProviderNotConfiguredError(name, 'GOOGLE_API_KEY');
      }
      if (model === undefined || model === '') {
        throw new ProviderNotConfiguredError(name, 'GOOGLE_MODEL');
      }
      return geminiProvider({
        apiKey,
        model,
        pricing: pricingFrom(
          name,
          { input: env['GOOGLE_INPUT_USD_PER_MTOK'], output: env['GOOGLE_OUTPUT_USD_PER_MTOK'] },
          ['GOOGLE_INPUT_USD_PER_MTOK', 'GOOGLE_OUTPUT_USD_PER_MTOK'],
        ),
      });
    }
    default:
      throw new ProviderNotConfiguredError(name, 'it is not a provider this build knows');
  }
}

/**
 * Build the executor from `process.env`, or from an injected environment.
 *
 * Under `AI_MODE=fixtures` the chain is two zero-cost fixture vendors — enough to
 * satisfy the real two-vendor check, so a suite exercises the same walk
 * production does rather than a configuration production would refuse.
 *
 * @throws ChainConfigurationError / ProviderNotConfiguredError /
 *   PricingNotConfiguredError at boot, never at call time.
 */
export class FixtureModeInProductionError extends Error {
  override readonly name = 'FixtureModeInProductionError';
  constructor() {
    super(
      'AI_MODE=fixtures is set with NODE_ENV=production. Fixture providers answer ' +
        '"{}", so every audit area would degrade and every recorded cost would be ' +
        'zero, with nothing failing loudly enough to notice. Unset AI_MODE.',
    );
  }
}

export function createExecutorFromEnv(env: Env = process.env): AiExecutor {
  if (isFixtureMode() || env['AI_MODE'] === 'fixtures') {
    // Fixture mode is a test affordance and it had no guard, which made it the
    // one setting that could turn the two-vendor check into a formality. The
    // whole argument for validating the chain at boot is that a
    // misconfiguration surfaces during the deploy rather than during an audit;
    // an unguarded `AI_MODE` moved it back to "nobody notices" — and this is a
    // product whose value is telling people the truth about their software.
    if (env['NODE_ENV'] === 'production') throw new FixtureModeInProductionError();

    return createExecutor({
      chain: [
        fixtureProvider({ vendor: 'fixture-primary', model: 'stub-1' }),
        fixtureProvider({ vendor: 'fixture-fallback', model: 'stub-2' }),
      ],
    });
  }

  const names = (env['AI_CHAIN'] ?? DEFAULT_CHAIN)
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== '');

  return createExecutor({ chain: names.map((name) => buildOne(name, env)) });
}
