/**
 * T307 — a short, stable identity for a prompt's static instructions, so a
 * historical AiInvocation can be grouped by which prompt wording produced it.
 *
 * Hashes only the text passed to it. Callers MUST pass the prompt's static,
 * pre-assembly `instructions` string (e.g. `MODULE_PROMPTS[module].systemPrompt`)
 * — never the output of `assemblePrompt`, which mixes in scan-specific
 * measured findings and capability notes that vary every call by design.
 * Hashing that would make `promptVersion` different on nearly every
 * invocation, defeating its purpose as a grouping key.
 */
import { createHash } from 'node:crypto';

export function computePromptVersion(instructions: string): string {
  return createHash('sha256').update(instructions, 'utf8').digest('hex').slice(0, 16);
}
