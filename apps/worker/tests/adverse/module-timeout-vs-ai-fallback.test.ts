import { describe, expect, it } from 'vitest';
import {
  AI_PROVIDER_ATTEMPT_TIMEOUT_MS,
  type AiExecutor,
  type Provider,
} from '@webaudit/ai-executor';
import { moduleTimeoutForExecutor } from '../../src/index.js';

function executorWithChain(length: number): AiExecutor {
  const chain = Array.from({ length }, (_, index): Provider => {
    const n = String(index);
    return {
      vendor: `vendor-${n}`,
      model: `model-${n}`,
      generate: () => Promise.reject(new Error('not used')),
    };
  });

  return {
    chain,
    run: () => Promise.reject(new Error('not used')),
  };
}

describe('T256 - the module timeout composes with the AI fallback budget', () => {
  it('gives every configured provider a full executor attempt plus an orchestration margin', () => {
    const timeout = moduleTimeoutForExecutor(executorWithChain(2));

    // The old production default was 60_000ms. That lets the first provider
    // consume its full attempt budget and kills the module before the fallback
    // provider can finish its own executor-controlled timeout.
    expect(timeout).toBeGreaterThan(2 * AI_PROVIDER_ATTEMPT_TIMEOUT_MS);
  });

  it('scales when a third vendor is added to the chain', () => {
    expect(moduleTimeoutForExecutor(executorWithChain(3))).toBeGreaterThan(
      3 * AI_PROVIDER_ATTEMPT_TIMEOUT_MS,
    );
  });
});
