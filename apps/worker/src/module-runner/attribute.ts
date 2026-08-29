/**
 * T090 — attribution, assigned by the runner.
 *
 * FR-032: "label every reported issue as either evidenced by measurement or as an
 * AI judgment, and MUST NOT deliver an unattributed issue." R13's mechanism:
 * assigned "from which layer produced it rather than self-declared, which makes
 * FR-032 and SC-006 mechanical".
 *
 * **The whole design is that a caller cannot supply an attribution.** There are
 * two functions here and neither takes one. `attributeMeasured` stamps MEASURED
 * because it is only ever called with the code layer's output;
 * `attributeJudgment` stamps AI_JUDGMENT because it is only ever called with the
 * AI layer's. A capability's own `attribution` field — which `CapabilityFinding`
 * does not have, so it arrives only from JavaScript or a cast — is dropped on the
 * floor: the output object is built field by field from a fixed list, so an extra
 * property has nowhere to go.
 *
 * The same two locks as `RedactedPrompt` (R8), for the same reason. A
 * module-private `unique symbol` brand means no object literal elsewhere
 * satisfies `AttributedFinding`, and `persistModuleResult` accepts only that type
 * — so an unattributed issue is a compile error. A cast defeats any brand, so
 * there is also a module-private `WeakSet`: `isAttributed` checks membership,
 * which a cast cannot forge.
 *
 * `fixPrompt` is built here too, and that is deliberate rather than incidental.
 * FR-051 requires "a self-contained remediation prompt that can be acted on
 * without reading the rest of the report" for *each* issue — including a MEASURED
 * issue in an area whose AI layer never ran. If the prompt came from the model,
 * every provider outage would deliver issues nobody can act on. So it is
 * generated deterministically from the finding, and the AI layer improves it when
 * it is available rather than being the only source of it.
 */

import { fingerprintOf, normalizeLocation } from '@webaudit/scoring';
import type { Attribution, CapabilityFinding, ModuleType, Severity } from '@webaudit/types';
import type { ModuleInsight } from '../prompts/index.js';

declare const ATTRIBUTED: unique symbol;

/** A finding that has been through this module. The only thing persistable. */
export interface AttributedFinding {
  /** Module-private brand. Unnameable outside this file — that is the point. */
  readonly [ATTRIBUTED]: 'AttributedFinding';
  readonly checkId: string;
  /** R3's stable identity, computed here from the capability's parts. */
  readonly fingerprint: string;
  readonly severity: Severity;
  readonly title: string;
  readonly explanation: string;
  readonly consequence: string;
  readonly location: string | undefined;
  readonly evidence: Readonly<Record<string, unknown>> | undefined;
  /** FR-051. Always present, even with no AI layer. */
  readonly fixPrompt: string;
  /** Set here, from the layer. Never from the finding. */
  readonly attribution: Attribution;
  /** Which layer produced it. For assertions and for the report's grouping. */
  readonly layer: 'CODE' | 'AI';
  readonly fixable: boolean;
}

const attributed = new WeakSet<object>();

function seal(finding: Omit<AttributedFinding, typeof ATTRIBUTED>): AttributedFinding {
  const sealed = finding as unknown as AttributedFinding;
  attributed.add(sealed);
  return Object.freeze(sealed);
}

/** Did this runner produce this issue? The runtime half of the guarantee. */
export function isAttributed(value: unknown): value is AttributedFinding {
  return typeof value === 'object' && value !== null && attributed.has(value);
}

export interface AttributeContext {
  readonly module: ModuleType;
  readonly targetId: string;
  /** Stripped from locations so a re-audit in a new workspace matches (R3). */
  readonly workspaceRoot?: string;
}

/**
 * A remediation prompt that stands alone.
 *
 * Written as an instruction to whoever or whatever will do the work, because
 * FR-052 lets the user copy it in one action and paste it somewhere — often into
 * a coding assistant. It therefore restates the problem rather than referring to
 * "the finding above", which would be meaningless once copied.
 */
function buildFixPrompt(
  finding: {
    title: string;
    description: string;
    location?: string;
    consequence?: string;
    evidence?: unknown;
  },
  module: ModuleType,
): string {
  const lines = [
    `Fix the following ${module.toLowerCase()} issue.`,
    '',
    `Problem: ${finding.title}`,
    `What was measured: ${finding.description}`,
  ];
  if (finding.location !== undefined) lines.push(`Where: ${finding.location}`);
  if (finding.consequence !== undefined) lines.push(`Why it matters: ${finding.consequence}`);
  if (finding.evidence !== undefined) {
    lines.push(`Evidence: ${JSON.stringify(finding.evidence).slice(0, 2000)}`);
  }
  lines.push(
    '',
    'Make the smallest change that resolves this, and do not alter unrelated behaviour.',
    'When you are done, state what you changed so the fix can be re-checked.',
  );
  return lines.join('\n');
}

/**
 * The code layer's findings. MEASURED, always.
 *
 * `insight` is optional and only ever *adds* — a better explanation, a
 * consequence the model worked out, a sharper fix prompt. FR-031 forbids AI
 * interpretation from contradicting, restating, or substituting for a measured
 * value, so severity, title, location and evidence are taken from the
 * measurement and are not overridable here.
 */
export function attributeMeasured(
  findings: readonly CapabilityFinding[],
  context: AttributeContext,
  insight?: ModuleInsight,
): readonly AttributedFinding[] {
  const byCheckId = new Map<string, ModuleInsight['insights'][number]>();
  for (const item of insight?.insights ?? []) {
    for (const checkId of item.relatesToCheckIds) {
      if (!byCheckId.has(checkId)) byCheckId.set(checkId, item);
    }
  }

  return findings.map((finding) => {
    const related = byCheckId.get(finding.checkId);
    const location =
      finding.location === undefined
        ? undefined
        : normalizeLocation(
            finding.location,
            context.workspaceRoot === undefined ? {} : { workspaceRoot: context.workspaceRoot },
          );

    const consequence =
      finding.consequence ??
      related?.consequence ??
      'Left unaddressed, this remains a defect in the audited area.';

    return seal({
      checkId: finding.checkId,
      fingerprint: fingerprintOf({
        targetId: context.targetId,
        module: context.module,
        checkId: finding.checkId,
        parts: [...finding.fingerprintParts],
      }),
      // From the measurement, not the model. FR-031.
      severity: finding.severity,
      title: finding.title,
      explanation:
        related === undefined
          ? finding.description
          : `${finding.description}\n\n${related.explanation}`,
      consequence,
      location,
      evidence: finding.evidence,
      fixPrompt: buildFixPrompt(
        {
          title: finding.title,
          description: finding.description,
          ...(location === undefined ? {} : { location }),
          consequence,
          ...(finding.evidence === undefined ? {} : { evidence: finding.evidence }),
        },
        context.module,
      ),
      attribution: 'MEASURED',
      layer: 'CODE',
      fixable: finding.fixable,
    });
  });
}

/**
 * The AI layer's own observations. AI_JUDGMENT, always.
 *
 * Only insights that are *not* tied to a measured check become issues of their
 * own — one tied to a checkId has already enriched that measured finding above,
 * and emitting it twice would put two rows in the fixes board for one problem
 * and make the remaining-work count wrong (FR-031's "restate as its own").
 */
export function attributeJudgment(
  insight: ModuleInsight,
  context: AttributeContext,
  measuredCheckIds: readonly string[],
): readonly AttributedFinding[] {
  const measured = new Set(measuredCheckIds);

  return insight.insights
    .filter((item) => !item.relatesToCheckIds.some((id) => measured.has(id)))
    .map((item, index) => {
      const checkId = `ai.${context.module.toLowerCase()}.judgment`;
      return seal({
        checkId,
        fingerprint: fingerprintOf({
          targetId: context.targetId,
          module: context.module,
          checkId,
          // The title is the identity: a judgement has no measured location, and
          // the ordinal alone would make every re-audit look like a new issue.
          parts: [item.title, String(index)],
        }),
        severity: item.severity,
        title: item.title,
        explanation: item.explanation,
        consequence: item.consequence,
        location: undefined,
        evidence: undefined,
        fixPrompt: buildFixPrompt(
          { title: item.title, description: item.explanation, consequence: item.consequence },
          context.module,
        ),
        attribution: 'AI_JUDGMENT',
        layer: 'AI',
        fixable: true,
      });
    });
}
