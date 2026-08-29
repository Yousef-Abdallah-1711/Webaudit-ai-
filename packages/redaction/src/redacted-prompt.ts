/**
 * T060 — R8: "Nothing reaches a provider except through an assembler whose input
 * type is 'unredacted' and whose output type is 'redacted'; the provider client
 * accepts only the latter."
 *
 * This is the type that makes SC-016 a compile error instead of a code-review
 * habit. `AiExecutor.run` takes a `RedactedPrompt`
 * (contracts/realtime-and-internal.md §2, guarantee 1), and the only way to get
 * one is `assemblePrompt`.
 *
 * **Two locks, because one is not enough.**
 *
 * The *brand* is a module-private `unique symbol`. It is declared here and never
 * exported, so no other module can name the key, and no object literal outside
 * this file can satisfy the interface. That stops every honest mistake — a
 * capability that assembles its own string simply does not typecheck.
 *
 * The brand alone is still defeated by `as unknown as RedactedPrompt`, which no
 * type system can prevent. So there is also a *registry*: a module-private
 * `WeakSet` of every prompt this package sealed. `isRedactedPrompt` checks
 * membership, which a cast cannot forge — the object was never sealed, so it was
 * never added.
 *
 * A consequence worth stating, because it looks like a bug the first time it
 * bites: **a prompt does not survive serialisation.** Registry membership is
 * per-object, so a prompt pushed through a BullMQ payload and revived by
 * `JSON.parse` fails `isRedactedPrompt`. That is correct and deliberate. Redaction
 * is a property of a transform that ran, not a flag travelling with the data; a
 * queue payload someone hand-edited would otherwise arrive "redacted". Queue the
 * *source*, and assemble on the far side.
 */

declare const REDACTED_BRAND: unique symbol;

/** One secret that was removed, and what stands in its place. */
export interface PlaceholderRecord {
  readonly placeholder: string;
  readonly kind: string;
  /** Where the secret was, for correlating with the finding. Never the value. */
  readonly location: string;
}

export interface RedactedPrompt {
  /** Module-private brand. Unnameable outside this file — that is the point. */
  readonly [REDACTED_BRAND]: 'RedactedPrompt';
  /** The provider-bound text. Every detected secret already replaced. */
  readonly text: string;
  readonly placeholders: readonly PlaceholderRecord[];
  /** How many replacements were made. Zero is a normal, common answer. */
  readonly redactionCount: number;
}

/**
 * Every prompt this package sealed.
 *
 * Weak so a prompt is collectable; a strong set would pin every prompt for the
 * life of the process, and prompts are large.
 */
const sealed = new WeakSet<object>();

/**
 * Not exported from `index.ts`. `assemble.ts` is the only caller, which is what
 * makes `assemblePrompt` the only route to a `RedactedPrompt`.
 */
export function sealRedactedPrompt(
  text: string,
  placeholders: readonly PlaceholderRecord[],
  redactionCount: number,
): RedactedPrompt {
  const prompt = { text, placeholders, redactionCount } as unknown as RedactedPrompt;
  sealed.add(prompt);
  return Object.freeze(prompt);
}

/**
 * Did this package produce this prompt?
 *
 * The runtime half of the guarantee. `ai-executor` should call it on entry (2H,
 * T075–T083) so a cast cannot smuggle a raw string past the type system.
 */
export function isRedactedPrompt(value: unknown): value is RedactedPrompt {
  return typeof value === 'object' && value !== null && sealed.has(value);
}
