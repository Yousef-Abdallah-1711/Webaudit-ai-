/**
 * T080 — Zod validation, treated as a provider-failure condition.
 *
 * R9: "validates every response against the schema — a schema failure is a
 * provider failure and advances the chain." Contract guarantee 3: "A response
 * failing `schema` is a provider failure and advances the chain. Malformed
 * output is never partially accepted."
 *
 * **The thing this module refuses to do is repair.** When a model returns nine
 * usable findings and a tenth with `severity: "very bad"`, keeping the nine is
 * the obliging move and the wrong one: the dropped finding is invisible, the
 * kept ones came from a response the model demonstrably got wrong, and the
 * report says nothing about either. Whole response or nothing, and the next
 * vendor gets the same prompt.
 *
 * **One accommodation, and only one: markdown fences.** Models wrap JSON in
 * ```json blocks constantly. That is a formatting habit, not a failure to
 * understand the schema, and failing over for it would burn the chain and pay
 * two vendors for one answer. Unwrapping a fence is not repair — the JSON inside
 * is unmodified, and if it does not validate it still fails.
 *
 * Nothing else is forgiven. No trailing-comma fixups, no single-quote
 * conversion, no "extract the first {...} we can find" — each of those is a
 * guess about intent, and a guess that happens to parse is worse than a clean
 * failure because it produces a confident answer nobody can trace.
 */

import type { z } from 'zod';

export type ValidationResult<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly problem: string };

/** ```json … ``` or ``` … ```, with optional surrounding whitespace. */
const FENCE = /^\s*```(?:json|JSON)?\s*\r?\n([\s\S]*?)\r?\n?\s*```\s*$/;

/**
 * Strip a markdown code fence if the whole response is one.
 *
 * Deliberately anchored to the whole string. A fence *inside* prose means the
 * model wrote commentary around its answer, which is a different failure — and
 * digging the JSON out of it is the "extract the first braces" heuristic this
 * module does not do.
 */
export function unwrapFence(text: string): string {
  const match = FENCE.exec(text);
  return match?.[1] ?? text;
}

/**
 * Parse and validate a provider's raw text.
 *
 * @returns `ok: false` with a human-readable problem. Never throws: the caller
 *   is a fallback walk, and an exception here would turn a recoverable provider
 *   failure into a failed audit.
 */
export function validateResponse<T>(text: string, schema: z.ZodType<T>): ValidationResult<T> {
  const candidate = unwrapFence(text);

  if (candidate.trim() === '') {
    return { ok: false, problem: 'the provider returned an empty response' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch (error) {
    // Truncated at max_tokens looks exactly like this, and it is worth naming
    // because the fix is a larger budget rather than a different vendor.
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, problem: `the response is not valid JSON (${detail})` };
  }

  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, value: result.data };

  // Every problem, not the first. An operator reading an AiInvocation row needs
  // to see whether the model missed one enum value or the whole shape.
  const problems = result.error.issues
    .slice(0, 8)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ');
  const elided =
    result.error.issues.length > 8 ? ` (+${String(result.error.issues.length - 8)} more)` : '';
  return { ok: false, problem: `the response does not match the schema — ${problems}${elided}` };
}
