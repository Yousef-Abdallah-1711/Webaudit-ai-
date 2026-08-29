/**
 * `AI_MODE=fixtures` — the provider every suite runs against.
 *
 * quickstart.md: "To run without provider spend, use `AI_MODE=fixtures`. Every
 * test suite runs this way; a suite needing live spend is a broken suite."
 * CLAUDE.md says it more bluntly: "Provider calls are always stubbed. A suite
 * that requires live LLM spend is a broken suite."
 *
 * Two properties make it useful rather than merely cheap:
 *
 *   - **Its pricing is zero, explicitly.** Not absent — zero. An absent price
 *     would make a fixture run look like a real run whose model we failed to
 *     price, and the two must never be confusable in a cost report.
 *   - **It is constructed with a vendor name, so a fixture chain can span two
 *     vendors** and satisfy the real startup check. A fixtures mode that could
 *     not pass `buildChain` would mean every suite exercised a configuration
 *     production refuses to run.
 */

import type { Provider, ProviderRequest, ProviderResponse } from '../provider.js';

export interface FixtureOptions {
  readonly vendor: string;
  readonly model: string;
  /**
   * What to return. A function receives the prompt, so a fixture can answer
   * differently per task without the test reaching inside the executor.
   */
  readonly reply?: string | ((request: ProviderRequest) => string);
  readonly outcome?: ProviderResponse['outcome'];
  readonly promptTokens?: number;
  readonly outputTokens?: number;
}

export function fixtureProvider(options: FixtureOptions): Provider {
  return {
    vendor: options.vendor,
    model: options.model,
    // Zero, stated. See the module note.
    pricing: { inputMicrosPerMillion: 0, outputMicrosPerMillion: 0 },
    generate: (request: ProviderRequest): Promise<ProviderResponse> => {
      const reply =
        typeof options.reply === 'function' ? options.reply(request) : (options.reply ?? '{}');
      return Promise.resolve({
        outcome: options.outcome ?? 'SUCCESS',
        text: reply,
        promptTokens: options.promptTokens ?? Math.ceil(request.text.length / 4),
        outputTokens: options.outputTokens ?? Math.ceil(reply.length / 4),
      });
    },
  };
}

/** Whether this process is running without provider spend. */
export function isFixtureMode(): boolean {
  return process.env['AI_MODE'] === 'fixtures';
}
