/**
 * The Anthropic adapter. One of the three places in this repository permitted to
 * hold a provider client (Principle IV); `eslint.config.js` refuses the import
 * everywhere else.
 *
 * `claude-opus-5` is the default model. Pricing at the time of writing is
 * **$5.00 per million input tokens and $25.00 per million output** — but it is
 * read from configuration, not hardcoded, for the reason in `pricing.ts`: FR-081
 * requires *actual* cost, and a table baked into code goes stale silently while
 * continuing to produce a confident wrong number.
 *
 * Notes on the request shape, each of which is a current-API detail that a
 * remembered pattern gets wrong:
 *
 *   - **`max_tokens` is required** and is a hard ceiling the model cannot see.
 *   - **Thinking is on by default on Opus 5**; the `thinking` parameter is
 *     omitted rather than configured. `budget_tokens` is rejected with a 400 on
 *     this model family, and `{type: 'disabled'}` has two documented failure
 *     modes (a tool call written into visible text, and leaked `<thinking>`
 *     tags), so it is not used.
 *   - **No assistant prefill.** Removed on this family; a prefill returns 400.
 *     The response shape is constrained by the prompt and validated by
 *     `validate.ts` instead.
 *
 * Every failure becomes an outcome rather than an exception, so the executor's
 * walk stays uniform: a 429 is `RATE_LIMITED`, a timeout is `TIMEOUT`, anything
 * else is `ERROR`.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { ModelPricing, Provider, ProviderRequest, ProviderResponse } from '../provider.js';

export interface ClaudeOptions {
  readonly apiKey: string;
  /** Defaults to `claude-opus-5`. Never date-suffixed — the id is complete. */
  readonly model?: string;
  readonly pricing: ModelPricing;
}

export const CLAUDE_DEFAULT_MODEL = 'claude-opus-5';

export function claudeProvider(options: ClaudeOptions): Provider {
  const model = options.model ?? CLAUDE_DEFAULT_MODEL;
  const client = new Anthropic({ apiKey: options.apiKey });

  return {
    vendor: 'anthropic',
    model,
    pricing: options.pricing,

    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      try {
        const response = await client.messages.create(
          {
            model,
            max_tokens: request.maxOutputTokens,
            messages: [{ role: 'user', content: request.text }],
            ...(request.jsonSchemaHint === undefined ? {} : { system: request.jsonSchemaHint }),
          },
          { signal: request.signal },
        );

        // `content` is a discriminated union; narrowing is required before
        // reading `.text`, and a response can carry several text blocks.
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        // A safety decline is a real outcome, not an error, and it must not be
        // retried against the same model.
        if (response.stop_reason === 'refusal') {
          return {
            outcome: 'ERROR',
            text: '',
            promptTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            errorMessage: `the model declined this request (${response.stop_details?.category ?? 'unspecified'})`,
          };
        }

        return {
          outcome: 'SUCCESS',
          text,
          promptTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        };
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

function mapError(error: unknown): ProviderResponse {
  const base = { text: '', promptTokens: 0, outputTokens: 0 } as const;

  if (error instanceof Anthropic.RateLimitError) {
    return { ...base, outcome: 'RATE_LIMITED', errorMessage: error.message };
  }
  if (error instanceof Anthropic.APIConnectionTimeoutError) {
    return { ...base, outcome: 'TIMEOUT', errorMessage: error.message };
  }
  if (error instanceof Anthropic.APIError) {
    return { ...base, outcome: 'ERROR', errorMessage: `${String(error.status)} ${error.message}` };
  }
  return {
    ...base,
    outcome: 'ERROR',
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}
