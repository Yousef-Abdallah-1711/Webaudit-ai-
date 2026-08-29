/**
 * T089 — the AI layer, assembled through the redaction boundary.
 *
 * R13: "assemble a single prompt from the code-layer output and the AI-layer
 * capabilities' contributions → one AI call per module". One call, not one per
 * capability: per-capability calls would multiply cost by the capability count
 * and produce no information a single call with all the context does not have.
 *
 * **Everything a capability contributes goes in as a segment, never as
 * instructions.** This is the decision worth defending. `assemblePrompt` takes
 * `instructions` — our own text, not scanned for secrets and read by the model as
 * authority — and `segments`, which are untrusted material. A capability's
 * `getSystemPromptAddition()` *reads* like an instruction and is named like one,
 * and the tempting implementation appends it to `instructions`.
 *
 * That would be a prompt-injection channel with a trust level attached to it. An
 * INSTALLED capability is unreviewed by definition (R10, FR-027) — that is what
 * the trust level means — so its text is exactly as trustworthy as the audited
 * site's markup. And a vendored capability is reviewed once, then updated. So
 * every capability contribution is a labelled segment: the model sees it, can
 * reason about it, and cannot be commanded by it. A capability that writes
 * "IGNORE PREVIOUS INSTRUCTIONS" gets that string redacted-and-labelled into the
 * body like any other input.
 *
 * The second consequence of routing through `assemblePrompt` is the one SC-016
 * cares about: code-layer findings carry evidence lifted from the target, and
 * evidence is where a credential ends up. Putting findings through the segment
 * path means they are scanned. Putting them in `instructions` would not be.
 */

import { assemblePrompt, secretsToFindings } from '@webaudit/redaction';
import type { RedactedSecretRef } from '@webaudit/redaction';
import type { AiExecutor, AiInvocationRecord } from '@webaudit/ai-executor';
import type { CapabilityFinding, ModuleType } from '@webaudit/types';
import { containCapabilityCall } from '@webaudit/capability-sdk';
import type { CapabilityInput } from '@webaudit/capability-sdk';
import { MODULE_PROMPTS, type ModuleInsight } from '../prompts/index.js';
import type { ResolvedCapability } from './resolve.js';

export interface AiLayerOptions {
  readonly module: ModuleType;
  readonly applicable: readonly ResolvedCapability[];
  readonly measured: readonly CapabilityFinding[];
  readonly input: CapabilityInput;
  readonly executor: AiExecutor;
  readonly scanId?: string;
  readonly timeoutMs: number;
}

export type AiLayerOutcome =
  | {
      readonly ran: true;
      readonly insight: ModuleInsight;
      readonly invocations: readonly AiInvocationRecord[];
      /**
       * Credentials found in material that came from the target. Reported as
       * findings (FR-056). Never includes one found in a capability's own
       * prompt contribution — see `runAiLayer`.
       */
      readonly secrets: readonly RedactedSecretRef[];
      /** Credentials a capability put in its own notes. A capability defect. */
      readonly contributorSecrets: readonly RedactedSecretRef[];
    }
  | {
      readonly ran: false;
      readonly reason: 'NO_AI_CAPABILITIES' | 'CHAIN_EXHAUSTED';
      readonly detail: string;
      readonly invocations: readonly AiInvocationRecord[];
      readonly secrets: readonly RedactedSecretRef[];
      readonly contributorSecrets: readonly RedactedSecretRef[];
    };

/**
 * Collect a capability's prompt contribution, contained.
 *
 * A contribution that throws costs the module its interpretation if it takes the
 * assembly down with it. It is not worth that, so a throwing contributor is
 * simply omitted.
 */
async function contribution(
  entry: ResolvedCapability,
  measured: readonly CapabilityFinding[],
  input: CapabilityInput,
  timeoutMs: number,
): Promise<string | null> {
  const capability = entry.capability;
  const outcome = await containCapabilityCall(
    async () => {
      const parts: string[] = [];
      if (typeof capability.getSystemPromptAddition === 'function') {
        parts.push(capability.getSystemPromptAddition());
      }
      if (typeof capability.getContextData === 'function') {
        parts.push(capability.getContextData(measured, input));
      }
      await Promise.resolve();
      return parts.filter((part) => typeof part === 'string' && part.trim() !== '').join('\n\n');
    },
    { timeoutMs },
  );

  if (outcome.kind !== 'resolved') return null;
  return outcome.value === '' ? null : outcome.value;
}

/** Findings rendered for the model. Evidence included; it is scanned downstream. */
function renderMeasured(findings: readonly CapabilityFinding[]): string {
  if (findings.length === 0) return 'No findings were measured in this area.';
  return findings
    .map((finding, index) =>
      [
        `${String(index + 1)}. [${finding.severity}] ${finding.title}`,
        `   checkId: ${finding.checkId}`,
        finding.location === undefined ? null : `   location: ${finding.location}`,
        `   measured: ${finding.description}`,
        finding.evidence === undefined
          ? null
          : `   evidence: ${JSON.stringify(finding.evidence).slice(0, 4000)}`,
      ]
        .filter((line) => line !== null)
        .join('\n'),
    )
    .join('\n\n');
}

export async function runAiLayer(options: AiLayerOptions): Promise<AiLayerOutcome> {
  const contributors = options.applicable.filter((entry) => entry.contributesToPrompt);
  if (contributors.length === 0) {
    // Not a degradation. An area with no AI-layer capability was never going to
    // have interpretation, and calling that DEGRADED would mark most areas
    // degraded for doing exactly what they were configured to do.
    return {
      ran: false,
      reason: 'NO_AI_CAPABILITIES',
      detail: 'No capability in this area contributes to interpretation.',
      invocations: [],
      secrets: [],
      contributorSecrets: [],
    };
  }

  const prompt = MODULE_PROMPTS[options.module];

  /**
   * Segments whose contents came from the audited target rather than from a
   * capability's own text. **This set is what makes a secret a finding.**
   *
   * Every segment is redacted, and that part was never in question. What was
   * wrong is what happened next: every secret detected during assembly became a
   * MEASURED finding at the credential's own severity, and the segments include
   * each capability's `getSystemPromptAddition()`. An INSTALLED capability is
   * unreviewed by definition, so a capability that ran no code layer at all
   * could put three fabricated CRITICAL credential issues on a customer's
   * report by embedding key-shaped text in its own prompt contribution — with a
   * `location` naming a path inside our prompt that does not exist in their
   * repository.
   *
   * Attribution correctly refuses to let a capability *declare* that it measured
   * something. This is the same claim earned rather than declared, which is
   * SC-006 defeated through a side door, so the fix belongs here: a secret is
   * only a finding about the target if it was found in material that came from
   * the target.
   */
  const measuredPath = `${options.module.toLowerCase()}/measured.txt`;
  const targetSuppliedPaths = new Set<string>([measuredPath]);

  const segments = [
    {
      label: 'measured-findings',
      path: measuredPath,
      content: renderMeasured(options.measured),
    },
  ];

  for (const entry of contributors) {
    const text = await contribution(entry, options.measured, options.input, options.timeoutMs);
    if (text === null) continue;
    segments.push({
      // Labelled as capability-supplied so the model reads it as material rather
      // than as authority. See the module note.
      label: `capability-notes:${entry.capability.id}`,
      path: `${options.module.toLowerCase()}/notes/${entry.capability.id}.txt`,
      content: text,
    });
  }

  // The only route to a provider. `instructions` is our prompt and nothing else.
  const assembled = assemblePrompt({ instructions: prompt.systemPrompt, segments });

  // Redaction already happened for every segment — a credential a capability
  // pasted into its own notes is still stripped before the prompt leaves. What
  // is filtered here is only which of them may become a *finding about the
  // customer's site*. A secret in a capability's own text is that capability's
  // problem, and it is surfaced as `contributorSecrets` rather than reported to
  // the customer as a credential in their source.
  const secrets = assembled.secrets.filter((secret) => targetSuppliedPaths.has(secret.path));
  const contributorSecrets = assembled.secrets.filter(
    (secret) => !targetSuppliedPaths.has(secret.path),
  );
  for (const secret of contributorSecrets) {
    console.warn(
      `[module-runner] ${secret.kind} in the prompt contribution at ${secret.path}. ` +
        'It was redacted and is not reported as a finding about the target.',
    );
  }

  const result = await options.executor.run({
    task: prompt.task,
    prompt: assembled.prompt,
    schema: prompt.responseSchema,
    ...(options.scanId === undefined ? {} : { scanId: options.scanId }),
  });

  if (!result.ok) {
    return {
      ran: false,
      reason: 'CHAIN_EXHAUSTED',
      detail:
        'No AI provider could be reached for this area, so its findings are what was measured ' +
        'directly, without interpretation.',
      invocations: result.invocations,
      secrets,
      contributorSecrets,
    };
  }

  return {
    ran: true,
    insight: result.value,
    invocations: result.invocations,
    secrets,
    contributorSecrets,
  };
}

/** Credentials found during assembly become findings of their own (FR-056). */
export function secretFindingsFrom(
  secrets: readonly RedactedSecretRef[],
): readonly CapabilityFinding[] {
  return secretsToFindings(secrets);
}
