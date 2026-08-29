/**
 * The only way into this package — and, by R8, the only way to a provider.
 *
 * `package.json` exports exactly `.`, so nothing else can import `detect.ts` or
 * `redacted-prompt.ts`. That is not tidiness:
 *
 *   - `detect.ts` returns `SecretMatch`, which carries the credential `value`.
 *     It stays internal so no credential ever crosses this boundary. Everything
 *     exported here is value-free.
 *   - `sealRedactedPrompt` is the constructor for the type `ai-executor` accepts.
 *     It stays internal so `assemblePrompt` is the only route to one, which is
 *     what makes SC-016 a compile error rather than a review item.
 *
 * The public surface is four functions: one assembler, one type guard, one
 * findings mapper, and `redactText` for log lines and error messages (FR-091,
 * and the capability contract's "redacted sink"). `redactText` returns a plain
 * string, so it cannot be mistaken for something a provider will accept — the
 * only route to that is still `assemblePrompt`. The adverse suite asserts these
 * exact names, so adding a second prompt constructor here fails the build.
 */

export { assemblePrompt, redactText } from './assemble.js';
export type {
  AssembleOptions,
  AssembledPrompt,
  PromptSegment,
  PromptSource,
  RedactedSecretRef,
} from './assemble.js';

export { isRedactedPrompt } from './redacted-prompt.js';
export type { PlaceholderRecord, RedactedPrompt } from './redacted-prompt.js';

export { SECRET_CHECK_ID, secretsToFindings } from './to-findings.js';
export type { SecretFinding } from './to-findings.js';

export { SECRET_KINDS } from './detect.js';
export type { SecretKind } from './detect.js';
