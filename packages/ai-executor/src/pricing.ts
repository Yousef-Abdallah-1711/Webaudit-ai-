/**
 * Where a model's price comes from — and why it is not a table in this file.
 *
 * FR-081 requires the system to "record actual provider cost per operation so
 * that it can be reconciled against credits charged". A price table baked into
 * code cannot do that for long: vendors change rates, introduce promotional
 * pricing, and retire models, and the table goes stale **silently** while
 * continuing to produce a confident wrong number in every margin report. The
 * failure has no symptom until someone reconciles against an invoice.
 *
 * So pricing is configuration, and a provider with no configured price **refuses
 * to be constructed**. That is deliberately louder than defaulting to zero:
 * zero-cost invocations make a provider look free, which is the one wrong answer
 * that nobody investigates.
 *
 * Published rates at the time of writing, for the operator filling in `.env`:
 *
 *   | Model             | Input $/1M | Output $/1M |
 *   | ----------------- | ---------- | ----------- |
 *   | claude-opus-5     | 5.00       | 25.00       |
 *   | claude-sonnet-5   | 3.00       | 15.00       |
 *   | claude-haiku-4-5  | 1.00       | 5.00        |
 *
 * OpenAI and Google rates are deliberately not listed: this repository has a
 * house Claude model and no house model for the others, so quoting a rate for a
 * model nobody has chosen would be inventing both.
 */

import { z } from 'zod';
import type { ModelPricing } from './provider.js';

export class PricingNotConfiguredError extends Error {
  override readonly name = 'PricingNotConfiguredError';
  constructor(vendor: string, variables: readonly string[]) {
    super(
      `No price is configured for the ${vendor} provider. Set ${variables.join(' and ')} to the ` +
        'published dollar rate per million tokens. FR-081 requires actual cost; an unpriced ' +
        'provider would record every invocation as free.',
    );
  }
}

/**
 * A dollar rate per million tokens, as an operator would read it off a pricing
 * page — `"5.00"`, `"0.15"`.
 *
 * Six decimal places at most, which bounds the input domain. That bound matters
 * for the note below.
 */
const dollarRate = z
  .string()
  .trim()
  .regex(/^\d+(?:\.\d{1,6})?$/, 'must be a dollar amount per million tokens, e.g. 5.00');

/**
 * `"5.00"` becomes 5_000_000 micros per million tokens.
 *
 * Implemented by shuffling digits rather than by `parseFloat(raw) * 1e6`.
 * Honesty about how much that buys: within the six-decimal domain the regex
 * above enforces, a rounded float multiply gives the same answer every time —
 * the error is around 1e-10 and rounding absorbs it. A mutation test confirmed
 * that, so this is defence in depth rather than a fix for a live bug.
 *
 * It is still the right implementation, for two reasons that are not about this
 * function. It has no rounding step, so there is nothing to reason about when
 * someone widens the regex to eight decimals or a vendor starts quoting rates
 * per billion tokens — the domain assumption that makes the float safe is
 * invisible at the call site and would not be revisited. And it keeps the rule
 * CLAUDE.md states without an exception: money never becomes a float, so nobody
 * has to work out whether this particular float was harmless.
 *
 * The exactness that is genuinely load-bearing is downstream, in
 * `costMicrosOf`, where token counts multiply these rates and the result is
 * stored. That one is asserted directly.
 */
export function dollarsPerMillionToMicros(raw: string): number {
  const [whole, fraction = ''] = raw.split('.');
  // Digit shuffling rather than arithmetic: pad the fraction to six places and
  // read the whole thing as an integer. No float is constructed at any point.
  const micros = `${whole ?? '0'}${fraction.padEnd(6, '0').slice(0, 6)}`;
  return Number.parseInt(micros, 10);
}

export interface PricingEnv {
  readonly input?: string | undefined;
  readonly output?: string | undefined;
}

/**
 * @throws PricingNotConfiguredError when either half is missing or malformed.
 */
export function pricingFrom(
  vendor: string,
  env: PricingEnv,
  variableNames: readonly [string, string],
): ModelPricing {
  const input = dollarRate.safeParse(env.input ?? '');
  const output = dollarRate.safeParse(env.output ?? '');
  if (!input.success || !output.success) {
    throw new PricingNotConfiguredError(vendor, variableNames);
  }
  return {
    inputMicrosPerMillion: dollarsPerMillionToMicros(input.data),
    outputMicrosPerMillion: dollarsPerMillionToMicros(output.data),
  };
}
