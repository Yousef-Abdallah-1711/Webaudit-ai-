/**
 * T091 — which of the four states an area is in.
 *
 * The four look obvious and the boundaries are not. Each is a different sentence
 * to a user, and collapsing any pair either throws away work they paid for or
 * claims coverage that does not exist.
 *
 *   **NOT_APPLICABLE** — nothing was applicable. No capability ran because none
 *   could: preconditions unmet (FR-021), control level too low (FR-017), or the
 *   area has no capabilities enabled. Not a failure, and it scores null because
 *   there is nothing to score.
 *
 *   **FAILED** — capabilities were applicable and produced nothing. Everything
 *   that ran, failed. Scores null: no measurement means any number is invented,
 *   and a zero would deflate the overall score as badly as an omission inflates
 *   it.
 *
 *   **DEGRADED** — something was measured and something went wrong. Either a
 *   capability failed while others succeeded, or the AI layer could not be
 *   reached (FR-035). **Carries a score**, computed from what was measured. This
 *   is the one that is easy to get wrong: leaving it null excludes the area from
 *   the overall average, so an area with ten measured criticals that lost its AI
 *   layer would make the overall score *rise*. That is the inflation FR-053
 *   forbids. `MODULE_STATES_SCORED` in `@webaudit/types` agrees — DEGRADED is
 *   scorable.
 *
 *   **COMPLETE** — everything applicable ran and succeeded. Note that an area
 *   with zero findings is COMPLETE and scores 100; a `findings.length === 0`
 *   check would mistake a clean area for an empty one.
 *
 * An area with no AI-layer capability at all is COMPLETE, not DEGRADED. Most
 * areas are configured that way, and marking them degraded for doing exactly
 * what they were configured to do would make the state meaningless.
 */

import { scoreFromFindings } from '@webaudit/scoring';
import type { ModuleState } from '@webaudit/types';
import type { AttributedFinding } from './attribute.js';
import type { CodeLayerOutcome } from './code-layer.js';
import type { SkippedCapability } from './resolve.js';

export interface StateInput {
  readonly applicableCount: number;
  readonly outcomes: readonly CodeLayerOutcome[];
  readonly skipped: readonly SkippedCapability[];
  readonly findings: readonly AttributedFinding[];
  /** True only when an AI layer existed and could not be reached. */
  readonly aiDegraded: boolean;
  readonly aiDetail?: string;
}

export interface ModuleStateResult {
  readonly state: ModuleState;
  /** Null unless the state is scorable. Never coerced from null to zero. */
  readonly score: number | null;
  /** FR-021: why NOT_APPLICABLE, in words the report shows. */
  readonly skippedReason: string | undefined;
  /** FR-035 and FR-022: why DEGRADED. */
  readonly degradedReason: string | undefined;
}

export function resolveModuleState(input: StateInput): ModuleStateResult {
  const failed = input.outcomes.filter((outcome) => !outcome.succeeded);
  const succeeded = input.outcomes.filter((outcome) => outcome.succeeded);

  // Nothing was applicable. Distinguish "none enabled" from "none applied", so
  // the report can say which — one is an operator decision and the other is a
  // fact about the submission.
  if (input.applicableCount === 0) {
    const reason =
      input.skipped.length === 0
        ? 'No checks are enabled for this area.'
        : input.skipped.map((skip) => `${skip.capabilityId}: ${skip.detail}`).join(' ');
    return {
      state: 'NOT_APPLICABLE',
      score: null,
      skippedReason: reason,
      degradedReason: undefined,
    };
  }

  // Applicable capabilities existed, and nothing came back. Note this is keyed
  // on measurement, not on findings: a capability that ran and found nothing
  // succeeded.
  if (succeeded.length === 0 && input.outcomes.length > 0) {
    return {
      state: 'FAILED',
      score: null,
      skippedReason: undefined,
      degradedReason: failed
        .map((f) => `${f.capabilityId}: ${f.errorMessage ?? 'failed'}`)
        .join('; '),
    };
  }

  // The AI layer was the only thing here and it is dark. There is no measurement
  // to score, so this is a failure of the area rather than a degradation of it.
  if (input.outcomes.length === 0 && input.aiDegraded) {
    return {
      state: 'FAILED',
      score: null,
      skippedReason: undefined,
      degradedReason: input.aiDetail ?? 'The AI layer could not be reached.',
    };
  }

  // **MEASURED only.** `scoreFromFindings`' own contract is "an area's score from
  // what was measured in it", and passing every finding quietly broke it: AI
  // judgements were included, so a clean area scored 0 if the model chose to
  // emit four criticals of its own. The response schema caps insights at 25, so
  // the model could move any area's number anywhere between 0 and its measured
  // value. Principle III says the code layer measures and AI explains what was
  // measured; `SHARED_PREAMBLE` asks the model not to score, but a request in a
  // prompt is not a mechanism. This filter is the mechanism.
  //
  // Judgements are still reported, still shown, still fixable. They are simply
  // not evidence, so they do not move a number that claims to be evidence.
  const score = scoreFromFindings(input.findings.filter((f) => f.attribution === 'MEASURED'));

  if (failed.length > 0 || input.aiDegraded) {
    const reasons: string[] = [];
    if (failed.length > 0) {
      reasons.push(...failed.map((f) => `${f.capabilityId}: ${f.errorMessage ?? 'failed'}`));
    }
    if (input.aiDegraded) reasons.push(input.aiDetail ?? 'The AI layer could not be reached.');
    return {
      state: 'DEGRADED',
      // Scorable. See the module note — this is the FR-053 trap.
      score,
      skippedReason: undefined,
      degradedReason: reasons.join('; '),
    };
  }

  return { state: 'COMPLETE', score, skippedReason: undefined, degradedReason: undefined };
}
