/**
 * T078 — the one internal interface every provider sits behind.
 *
 * Principle IV: "All AI goes through `ai-executor`. No provider SDK anywhere
 * else." This is the seam that makes that enforceable. A provider's job is to
 * turn one prompt into one string and report what it consumed; it decides
 * nothing about retries, fallback, validation, or cost, because those are
 * properties of the chain and must be identical whichever vendor served.
 *
 * Three deliberate absences:
 *
 *   - **No `retry`.** The contract prohibits "retry loops at call sites", and an
 *     adapter is a call site. A provider that failed advances the chain.
 *   - **No streaming.** Every consumer here wants a validated object, not tokens
 *     as they arrive. Streaming would have to be buffered before `validate.ts`
 *     could see it, so it would buy latency the caller cannot use.
 *   - **No throwing for a refusal.** `outcome` carries the failure. An adapter
 *     may still reject — the executor contains that — but a 429 is data, not an
 *     exception, and treating it as data is what keeps the walk uniform.
 *
 * `pricing` lives on the provider rather than in a central table because the
 * price belongs to the vendor-and-model pair the adapter was constructed with.
 * A central table drifts silently against the models actually configured; FR-081
 * requires *actual* cost, and a stale table produces a confident wrong number.
 */

import type { AiOutcome } from '@webaudit/types';

/**
 * What a model costs, in integer micros per million tokens.
 *
 * Micros per *million* rather than per token so the published dollar rate
 * converts exactly: $5.00/1M is 5_000_000. Per-token would be 5 micros exactly
 * for that rate but a fraction for most others, and rounding at the wrong end
 * makes FR-081's reconciliation drift by cents per thousand calls.
 */
export interface ModelPricing {
  readonly inputMicrosPerMillion: number;
  readonly outputMicrosPerMillion: number;
}

export interface ProviderRequest {
  /** Already redacted. The executor checks before any adapter sees it. */
  readonly text: string;
  /** Nudges the model toward the shape `validate.ts` will demand. */
  readonly jsonSchemaHint?: string;
  readonly signal: AbortSignal;
  readonly maxOutputTokens: number;
}

export interface ProviderResponse {
  readonly outcome: AiOutcome;
  /** The model's raw text. Never trusted — `validate.ts` decides. */
  readonly text: string;
  readonly promptTokens: number;
  readonly outputTokens: number;
  /** Present on failure. Redacted before it is recorded. */
  readonly errorMessage?: string;
}

export interface Provider {
  /**
   * The company, not the model. `anthropic`, `openai`, `google`.
   *
   * This is the field Principle IV's two-vendor minimum counts, so it must
   * identify the entity that has the outage. Two Claude models share a vendor
   * and share an outage.
   */
  readonly vendor: string;
  readonly model: string;
  readonly pricing?: ModelPricing;
  generate(request: ProviderRequest): Promise<ProviderResponse>;
}

/**
 * Cost of one attempt, in integer micros. Zero when pricing is unknown.
 *
 * **The guards are the point.** Token counts arrive from a provider's JSON, and
 * this is the arithmetic that turns them into a number written to a money
 * column. One adapter already defaults absent counts to zero, with the comment
 * that "`NaN` in a money column is a corrupted ledger" — but a defence that
 * lives in one adapter protects only that adapter. A gateway, a future vendor,
 * or a provider having a bad day returning `{"usage": {}}` would otherwise make
 * `totalCostMicros` for the whole scan `NaN`, and a negative count would record
 * a credit we never issued.
 *
 * A malformed count is treated as an unknown cost — zero — rather than as an
 * error, for the same reason unknown pricing is: a scan is not worth failing
 * over a cost we cannot compute, and the invocation row still records the
 * outcome and the tokens as reported.
 */
export function costMicrosOf(
  pricing: ModelPricing | undefined,
  promptTokens: number,
  outputTokens: number,
): number {
  if (pricing === undefined) return 0;
  const prompt = usableCount(promptTokens);
  const output = usableCount(outputTokens);
  const inputCost = (prompt * pricing.inputMicrosPerMillion) / 1_000_000;
  const outputCost = (output * pricing.outputMicrosPerMillion) / 1_000_000;
  // Rounded once, at the end. Rounding each side separately biases the total.
  return Math.round(inputCost + outputCost);
}

/** A token count we are willing to multiply by a price. */
function usableCount(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}
