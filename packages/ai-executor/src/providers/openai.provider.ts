/**
 * The OpenAI adapter. Second vendor in the default chain, which is what makes
 * Principle IV's two-vendor minimum satisfiable.
 *
 * Model and pricing both come from configuration. There is no default model here
 * — unlike the Claude adapter, where the repository has a documented house model
 * — because picking one on the operator's behalf would bake a cost and a
 * capability decision into code that changes on the vendor's schedule.
 *
 * Failure mapping matches the Claude adapter exactly, because the executor's
 * walk must not be able to tell which vendor it is talking to. Any asymmetry
 * here is an asymmetry in fallback behaviour.
 */

import OpenAI from 'openai';
import type { ModelPricing, Provider, ProviderRequest, ProviderResponse } from '../provider.js';

export interface OpenAiOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly pricing: ModelPricing;
  /** For an Azure or gateway deployment. */
  readonly baseURL?: string;
}

export function openAiProvider(options: OpenAiOptions): Provider {
  const client = new OpenAI({
    apiKey: options.apiKey,
    ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
  });

  return {
    vendor: 'openai',
    model: options.model,
    pricing: options.pricing,

    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      try {
        const response = await client.chat.completions.create(
          {
            model: options.model,
            max_completion_tokens: request.maxOutputTokens,
            messages: [
              ...(request.jsonSchemaHint === undefined
                ? []
                : [{ role: 'system' as const, content: request.jsonSchemaHint }]),
              { role: 'user' as const, content: request.text },
            ],
            // JSON mode rather than a strict schema: `validate.ts` owns the
            // schema decision, and two places enforcing it would eventually
            // disagree about what counts as valid.
            response_format: { type: 'json_object' },
          },
          { signal: request.signal },
        );

        const choice = response.choices[0];
        const text = choice?.message.content ?? '';
        const usage = response.usage;

        // A truncated response is a failure with a specific cause worth naming:
        // the fix is a larger budget, not a different vendor.
        if (choice?.finish_reason === 'length') {
          return {
            outcome: 'ERROR',
            text: '',
            promptTokens: usage?.prompt_tokens ?? 0,
            outputTokens: usage?.completion_tokens ?? 0,
            errorMessage: `the response hit the ${String(request.maxOutputTokens)}-token ceiling and was truncated`,
          };
        }

        return {
          outcome: 'SUCCESS',
          text,
          promptTokens: usage?.prompt_tokens ?? 0,
          outputTokens: usage?.completion_tokens ?? 0,
        };
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

function mapError(error: unknown): ProviderResponse {
  const base = { text: '', promptTokens: 0, outputTokens: 0 } as const;

  if (error instanceof OpenAI.RateLimitError) {
    return { ...base, outcome: 'RATE_LIMITED', errorMessage: error.message };
  }
  if (error instanceof OpenAI.APIConnectionTimeoutError) {
    return { ...base, outcome: 'TIMEOUT', errorMessage: error.message };
  }
  if (error instanceof OpenAI.APIError) {
    return { ...base, outcome: 'ERROR', errorMessage: `${String(error.status)} ${error.message}` };
  }
  return {
    ...base,
    outcome: 'ERROR',
    errorMessage: error instanceof Error ? error.message : String(error),
  };
}
