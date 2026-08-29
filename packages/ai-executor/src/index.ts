/**
 * Principle IV's boundary. The only component in the product that holds a
 * provider client, and the only route from a prompt to a model.
 *
 * `eslint.config.js` enforces the other half: `@anthropic-ai/sdk`, `openai`, and
 * the Google SDKs are restricted imports everywhere except this package. If a
 * capability, a route, or the worker needs a model, it needs this package.
 *
 * `createExecutorFromEnv` is the production entry point and does two things a
 * caller must not be able to skip: it validates the chain at construction
 * (Principle IV's two-vendor minimum, checked at boot rather than at call time)
 * and it refuses a provider with no configured price (FR-081).
 */

export { createExecutor, UnredactedPromptError } from './executor.js';
export type {
  AiExecutor,
  AiInvocationRecord,
  AiRequest,
  AiResult,
  ExecutorOptions,
} from './executor.js';

export { buildChain, ChainConfigurationError, describeChain } from './chain.js';

export { validateResponse, unwrapFence } from './validate.js';
export type { ValidationResult } from './validate.js';

export { degradeModule } from './degrade.js';
export type { DegradeInput, DegradedModule } from './degrade.js';

export { recordInvocations, totalCostMicros, totalTokens } from './record.js';
export type { InvocationWriter, RecordOutcome, RecordTarget } from './record.js';

export { computeDrift } from './drift.js';
export type { CapabilityDrift, DriftOptions, ExecutionSample } from './drift.js';

export { costMicrosOf } from './provider.js';
export type { ModelPricing, Provider, ProviderRequest, ProviderResponse } from './provider.js';

export { dollarsPerMillionToMicros, pricingFrom, PricingNotConfiguredError } from './pricing.js';

export { fixtureProvider, isFixtureMode } from './providers/fixtures.provider.js';
export type { FixtureOptions } from './providers/fixtures.provider.js';

export { claudeProvider, CLAUDE_DEFAULT_MODEL } from './providers/claude.provider.js';
export { openAiProvider } from './providers/openai.provider.js';
export { geminiProvider } from './providers/gemini.provider.js';

export { createExecutorFromEnv } from './from-env.js';
