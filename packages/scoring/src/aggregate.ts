/**
 * T092 — FR-053: "mark any area that did not complete as incomplete in the
 * report, and MUST NOT let its absence inflate the overall score."
 *
 * The word doing the work is **inflate**. The obvious reading of FR-053 — "an
 * incomplete area gets no score" — is wrong in a way that inverts the
 * requirement, and it is worth spelling out because this repository got it wrong
 * once already (see the note on DEGRADED below).
 *
 * Consider a SECURITY area with ten measured critical findings whose AI layer
 * could not be reached. If that area scores null and is excluded, the overall
 * score goes *up*, because the worst area in the audit has quietly left the
 * average. The user sees a healthier number than the truth. That is precisely
 * the inflation FR-053 forbids, and it is caused by excluding an area that had a
 * perfectly computable score.
 *
 * So the rule is about *evidence*, not about completeness:
 *
 *   - **COMPLETE and DEGRADED carry a score.** Both measured something. A
 *     DEGRADED area is missing interpretation, not measurement, and
 *     `MODULE_STATES_SCORED` in `@webaudit/types` says exactly this.
 *   - **FAILED, NOT_APPLICABLE, PENDING and RUNNING score null.** Nothing was
 *     measured, so any number would be invented — and an invented zero would
 *     deflate the total as badly as an omission inflates it.
 *
 * **Never coerce null to zero.** An area nobody could audit is not an area that
 * failed its audit. `?? 0` anywhere near this file is a defect.
 *
 * The per-area formula is an engineering choice, not a specified one — the
 * specification requires "a score for each audited area" (FR-048) and says
 * nothing about how. It is recorded as an open decision.
 */

import { MODULE_STATES_SCORED, SEVERITY_ORDER } from '@webaudit/types';
import type { ModuleState, ModuleType, Severity } from '@webaudit/types';

/**
 * What one finding costs an area, out of 100.
 *
 * Chosen so four criticals reach zero: an area with four unpatched critical
 * defects is not meaningfully better than one with six, and a curve that keeps
 * distinguishing them wastes resolution where nobody needs it. INFO costs
 * nothing by design — an informational note is not a defect, and letting it
 * shave a point would make a clean audit unreachable.
 */
export const SEVERITY_WEIGHT: Readonly<Record<Severity, number>> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 2,
  INFO: 0,
};

/** Whether a state carries a score at all. The FR-053 decision, in one place. */
export function isScorable(state: ModuleState): boolean {
  return (MODULE_STATES_SCORED as readonly ModuleState[]).includes(state);
}

export interface ScoreInput {
  readonly severity: Severity;
}

/**
 * An area's score from what was measured in it.
 *
 * Deterministic and order-independent: the same findings in any order give the
 * same number, which is what makes a re-audit comparable (FR-069).
 *
 * @returns 0-100 inclusive.
 */
export function scoreFromFindings(findings: readonly ScoreInput[]): number {
  const deduction = findings.reduce(
    (total, finding) => total + SEVERITY_WEIGHT[finding.severity],
    0,
  );
  return Math.max(0, 100 - deduction);
}

export interface AreaScore {
  readonly module: ModuleType;
  readonly state: ModuleState;
  /** Null when the state carries no score. Never coerced. */
  readonly score: number | null;
}

export interface OverallScore {
  /** Null when no area produced a score — an audit that measured nothing. */
  readonly score: number | null;
  /** Which areas contributed, so a report can say what the number is over. */
  readonly scoredModules: readonly ModuleType[];
  /** Which did not, and are shown as incomplete instead (FR-053). */
  readonly unscoredModules: readonly ModuleType[];
}

/**
 * The overall health score (FR-048).
 *
 * An unweighted mean over the areas that produced a score. Unweighted on
 * purpose: weighting would encode a claim about which area matters most to this
 * user, and the product does not know that. The per-area scores are shown
 * alongside, so a reader who cares more about security than SEO can see both.
 */
export function overallScore(areas: readonly AreaScore[]): OverallScore {
  const scored: ModuleType[] = [];
  const unscored: ModuleType[] = [];
  let total = 0;

  for (const area of areas) {
    // Both conditions, deliberately. A state that should carry a score but has
    // a null one is a bug upstream, and averaging it in as zero would hide the
    // bug behind a plausible number.
    if (isScorable(area.state) && area.score !== null) {
      scored.push(area.module);
      total += area.score;
    } else {
      unscored.push(area.module);
    }
  }

  return {
    score: scored.length === 0 ? null : Math.round(total / scored.length),
    scoredModules: scored,
    unscoredModules: unscored,
  };
}

/** Worst severity present, for an area summary badge. Null when there are none. */
export function worstSeverity(findings: readonly ScoreInput[]): Severity | null {
  let worst: Severity | null = null;
  for (const finding of findings) {
    if (worst === null || SEVERITY_ORDER[finding.severity] < SEVERITY_ORDER[worst]) {
      worst = finding.severity;
    }
  }
  return worst;
}
