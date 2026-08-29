/**
 * T061 — R8: "A detected secret becomes a finding reported to the user with its
 * location, while the value itself is replaced by a stable placeholder token so
 * the AI can still reason about 'a credential appears here'."
 *
 * The mandatory transform at the prompt-assembly boundary. Three properties are
 * load-bearing and each is asserted by the adverse suite.
 *
 * **Detect over the whole segment, then truncate.** A prompt has a size budget,
 * and the obvious implementation clips the file first and scans what is left.
 * That leaks twice over: a key straddling the cut is half-included, and a key
 * past the cut is never reported at all. So detection runs on the complete
 * content, replacement runs on the complete content, and only the redacted
 * result is clipped. Findings are therefore complete even when the prompt is not.
 *
 * **The placeholder is derived from position, never from the value.** A hash
 * would be tempting — it is stable across runs and needs no bookkeeping — but a
 * hash of a credential is still a function of the credential, and while nobody
 * is going to reverse a 40-character random key, `password123` falls to a
 * wordlist in milliseconds. Sending a provider `sha256(password123)` is sending
 * them the password. Placeholders are ordinals.
 *
 * **The value never leaves this function.** `AssembledPrompt.secrets` carries
 * kind and location only. The adverse suite serialises the entire returned
 * object and asserts no planted credential appears anywhere in it, so a value
 * parked in a metadata field fails the build rather than the customer.
 */

import { detectSecrets, severityOf, type SecretKind } from './detect.js';
import {
  sealRedactedPrompt,
  type PlaceholderRecord,
  type RedactedPrompt,
} from './redacted-prompt.js';
import type { Severity } from '@webaudit/types';

/** A span of untrusted material: a file, a captured page, a response body. */
export interface PromptSegment {
  /** What this is, for the model. `config`, `markup`, `dependency-manifest`. */
  readonly label: string;
  /** Where it came from. Appears in the prompt and in every finding. */
  readonly path: string;
  readonly content: string;
}

/**
 * `instructions` is ours and is not scanned; `segments` are the user's and are.
 *
 * Keeping them in separate fields is what lets the assembler be certain which
 * text it must treat as hostile. A single concatenated string would force it to
 * scan our own prompt template, and a template that mentions `api_key` would
 * start redacting itself.
 */
export interface PromptSource {
  readonly instructions: string;
  readonly segments: readonly PromptSegment[];
}

/** A detected secret, with the value removed. Safe to log, queue, and return. */
export interface RedactedSecretRef {
  readonly kind: SecretKind;
  readonly severity: Severity;
  readonly path: string;
  readonly label: string;
  readonly line: number;
  readonly column: number;
  /** Length of what was removed. Useful triage, and not the value. */
  readonly length: number;
  readonly placeholder: string;
}

export interface AssembledPrompt {
  /** The only thing `ai-executor` will accept. */
  readonly prompt: RedactedPrompt;
  /** For `secretsToFindings`. Complete even if the prompt was truncated. */
  readonly secrets: readonly RedactedSecretRef[];
}

export interface AssembleOptions {
  /**
   * Characters of each segment carried into the prompt. Applied *after*
   * redaction — see the module note.
   */
  readonly maxSegmentChars?: number;
}

const DEFAULT_MAX_SEGMENT_CHARS = 24_000;

function placeholderFor(kind: SecretKind, ordinal: number): string {
  // Bracketed and uppercase so it reads as a token rather than as content, and
  // named so the model can still reason about what was there.
  return `[[REDACTED:${kind}:${String(ordinal)}]]`;
}

export function assemblePrompt(
  source: PromptSource,
  options: AssembleOptions = {},
): AssembledPrompt {
  const maxChars = options.maxSegmentChars ?? DEFAULT_MAX_SEGMENT_CHARS;

  const secrets: RedactedSecretRef[] = [];
  const placeholders: PlaceholderRecord[] = [];
  /**
   * One placeholder per distinct value, so three appearances of one key read as
   * one key rather than three. Local to this call and dropped on return — it is
   * the only thing holding credential values.
   */
  const assigned = new Map<string, string>();
  let ordinal = 0;

  const renderedSegments: string[] = [];

  for (const segment of source.segments) {
    const matches = detectSecrets(segment.content);

    // Right to left: replacing from the end keeps every earlier offset valid.
    let redacted = segment.content;
    for (const match of [...matches].reverse()) {
      let placeholder = assigned.get(match.value);
      if (placeholder === undefined) {
        ordinal += 1;
        placeholder = placeholderFor(match.kind, ordinal);
        assigned.set(match.value, placeholder);
        placeholders.push({
          placeholder,
          kind: match.kind,
          location: `${segment.path}:${String(match.line)}:${String(match.column)}`,
        });
      }
      redacted = redacted.slice(0, match.start) + placeholder + redacted.slice(match.end);
    }

    // Recorded in document order, not the reversed replacement order.
    for (const match of matches) {
      secrets.push({
        kind: match.kind,
        severity: severityOf(match.kind),
        path: segment.path,
        label: segment.label,
        line: match.line,
        column: match.column,
        length: match.value.length,
        placeholder: assigned.get(match.value)!,
      });
    }

    const clipped =
      redacted.length > maxChars
        ? `${redacted.slice(0, maxChars)}\n… [truncated ${String(redacted.length - maxChars)} characters]`
        : redacted;

    renderedSegments.push(`--- ${segment.label}: ${segment.path} ---\n${clipped}`);
  }

  const text = [source.instructions, '', ...renderedSegments].join('\n');

  return {
    prompt: sealRedactedPrompt(text, placeholders, secrets.length),
    secrets,
  };
}

/**
 * Redact a single string, for a log line or an error message.
 *
 * FR-091 forbids revealing credentials "in logs, error messages, or AI prompts",
 * and `CodeLayerContext.logger` is described in the capability contract as a
 * "redacted sink". A capability that logs a response body must not put a
 * credential in the platform's logs.
 *
 * Separate from `assemblePrompt` because there is no prompt here and nothing to
 * report: this is a sanitiser, not an audit step. It returns a string, so it
 * cannot be mistaken for something a provider will accept.
 */
export function redactText(text: string): string {
  const matches = detectSecrets(text);
  if (matches.length === 0) return text;

  let redacted = text;
  // Right to left, so each replacement leaves earlier offsets valid.
  for (const match of [...matches].reverse()) {
    redacted =
      redacted.slice(0, match.start) + `[[REDACTED:${match.kind}]]` + redacted.slice(match.end);
  }
  return redacted;
}
