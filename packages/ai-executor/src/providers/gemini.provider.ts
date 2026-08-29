/**
 * The Google adapter. A third vendor, so a two-vendor outage still leaves a
 * chain — which is the difference between SC-012 holding and holding narrowly.
 *
 * Uses `@google/genai`, the current SDK. `eslint.config.js` names the older
 * `@google/generative-ai` in its restricted-imports list; that entry is kept and
 * this package name added alongside it, so the rule keeps meaning whichever one a
 * future contributor reaches for.
 *
 * Model and pricing come from configuration, as with OpenAI.
 *
 * One shape difference worth naming: Gemini reports usage as
 * `usageMetadata.promptTokenCount` / `candidatesTokenCount`, and both are
 * optional in the response type. They are defaulted to zero rather than left
 * undefined, because an absent token count that flows into a cost calculation
 * produces `NaN` micros — and `NaN` in a money column is a corrupted ledger
 * rather than a missing number.
 */

import { GoogleGenAI } from '@google/genai';
import type { ModelPricing, Provider, ProviderRequest, ProviderResponse } from '../provider.js';

export interface GeminiOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly pricing: ModelPricing;
}

export function geminiProvider(options: GeminiOptions): Provider {
  const client = new GoogleGenAI({ apiKey: options.apiKey });

  return {
    vendor: 'google',
    model: options.model,
    pricing: options.pricing,

    async generate(request: ProviderRequest): Promise<ProviderResponse> {
      try {
        const response = await client.models.generateContent({
          model: options.model,
          contents: request.text,
          config: {
            maxOutputTokens: request.maxOutputTokens,
            responseMimeType: 'application/json',
            abortSignal: request.signal,
            ...(request.jsonSchemaHint === undefined
              ? {}
              : { systemInstruction: request.jsonSchemaHint }),
          },
        });

        const usage = response.usageMetadata;
        return {
          outcome: 'SUCCESS',
          text: response.text ?? '',
          promptTokens: usage?.promptTokenCount ?? 0,
          outputTokens: usage?.candidatesTokenCount ?? 0,
        };
      } catch (error) {
        return mapError(error);
      }
    },
  };
}

/**
 * The SDK does not export typed error classes, so the status is read off the
 * error shape. String matching on messages is avoided as far as possible — the
 * status code is stable, the wording is not.
 */
function mapError(error: unknown): ProviderResponse {
  const base = { text: '', promptTokens: 0, outputTokens: 0 } as const;
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: unknown }).status;
  const code = typeof status === 'number' ? status : undefined;

  if (code === 429) return { ...base, outcome: 'RATE_LIMITED', errorMessage: message };
  if (code === 408 || code === 504) return { ...base, outcome: 'TIMEOUT', errorMessage: message };
  if (error instanceof Error && error.name === 'AbortError') {
    return { ...base, outcome: 'TIMEOUT', errorMessage: message };
  }
  return {
    ...base,
    outcome: 'ERROR',
    errorMessage: code === undefined ? message : `${String(code)} ${message}`,
  };
}
