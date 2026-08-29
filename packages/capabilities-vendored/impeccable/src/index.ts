/**
 * T140 — impeccable: design-critique contribution to the UI area's single AI
 * call. Named for, and modelled loosely on, the class of "AI design critic"
 * tools the architecture doc's original sketch pointed at (pbakaus/
 * impeccable) — reimplemented here as a first-party prompt contributor,
 * since nothing is vendored from a third party at runtime (Principle II).
 *
 * **No code layer, and that is the whole design.** A design critique is
 * inherently a judgment call, not a measurement — Principle III's "anything
 * measurable is measured [in the code layer]; the AI layer only explains
 * what this found" places critique-of-taste squarely in the AI layer. This
 * capability's job is narrower than "call an AI": per `ai-layer.ts`'s own
 * module note, *no* capability calls a provider — `runAiLayer` assembles one
 * prompt per module from every AI-layer capability's contribution and makes
 * the one call itself. So `getSystemPromptAddition` and `getContextData`
 * are the entire surface here, and both become a labelled *segment* of that
 * prompt, never an instruction the model treats as authoritative — the same
 * boundary that keeps a capability's own text from being a prompt-injection
 * channel (see `ai-layer.ts`'s note on why).
 *
 * `getContextData` draws only on `codeFindings` (this module's own
 * code-layer measurements — chiefly `screenshot-capture`'s) and
 * `input.designIntent` (the questionnaire's answers, US6) — never on a
 * screenshot's pixels directly, since `CapabilityInput.screenshot` has no
 * producer wired yet (a recorded gap, not assumed away here).
 */

import type {
  AuditCapability,
  CapabilityFinding,
  CapabilityInput,
} from '@webaudit/capability-sdk';

function getSystemPromptAddition(): string {
  return [
    'When critiquing this area\'s visual design, weigh these dimensions:',
    '- Spacing and whitespace: consistent rhythm between sections versus cramped or uneven gaps.',
    '- Typographic hierarchy: a clear scale distinguishing headings from body text, not a wall ' +
      'of uniform text.',
    '- Color and contrast: a coherent palette, and sufficient contrast for readability.',
    '- Alignment and grid consistency: elements lining up to a shared grid versus visually ' +
      'drifting.',
    '- Visual noise: clutter or competing focal points versus a clear primary action.',
    'If design intent (audience, tone, brand colors) was provided, judge fit against that intent ' +
      'specifically rather than a generic aesthetic. Cite concrete, specific observations — not ' +
      'vague praise or vague criticism.',
  ].join('\n');
}

function getContextData(
  codeFindings: readonly CapabilityFinding[],
  input: CapabilityInput,
): string {
  const uiFindings = codeFindings.filter((f) => f.checkId.startsWith('ui.'));
  const lines: string[] = [];

  if (uiFindings.length === 0) {
    lines.push('No automated rendering issues were measured for this page.');
  } else {
    lines.push('Automated measurements found for this page:');
    for (const f of uiFindings) {
      lines.push(`- [${f.severity}] ${f.title}: ${f.description}`);
    }
  }

  const intent = input.designIntent;
  if (intent !== undefined) {
    const parts: string[] = [];
    if (intent.audience !== undefined) parts.push(`audience: ${intent.audience}`);
    if (intent.tone !== undefined) parts.push(`tone: ${intent.tone}`);
    if (intent.brandColors !== undefined && intent.brandColors.length > 0) {
      parts.push(`brand colors: ${intent.brandColors.join(', ')}`);
    }
    if (intent.notes !== undefined) parts.push(`notes: ${intent.notes}`);
    if (parts.length > 0) {
      lines.push('', `Stated design intent — ${parts.join('; ')}.`);
    }
  }

  return lines.join('\n');
}

export const impeccable: AuditCapability = {
  id: 'impeccable',
  module: 'UI',
  layer: 'AI',
  canRun: (input: CapabilityInput): boolean => typeof input.targetUrl === 'string',
  getSystemPromptAddition,
  getContextData,
};

export default impeccable;
