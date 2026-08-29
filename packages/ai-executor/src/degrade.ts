/**
 * FR-035: "deliver measured findings without interpretation, and say so, when no
 * AI provider can be reached."
 *
 * The bridge between a `CHAIN_EXHAUSTED` return and the `ModuleResult` the runner
 * writes at T084. It lives here rather than in the runner because the degradation
 * is this package's own return type, and because SC-012 is testable now: the
 * runner will call this, and what it produces is what a user sees.
 *
 * Three properties, each one a requirement:
 *
 *   - **The findings survive, attributed MEASURED.** Principle III is what makes
 *     this possible: the code layer already measured everything measurable, so a
 *     total provider outage costs interpretation and not findings. They are not
 *     downgraded to AI_JUDGMENT because the explainer never ran (FR-032, SC-006).
 *   - **The score is NOT decided here.** This was wrong when 2H first wrote it:
 *     the module returned `score: null`, which excludes the area from the overall
 *     average — and an excluded area with ten measured criticals makes the
 *     overall score go *up*. That is the inflation FR-053 forbids, caused by
 *     omitting an area whose score was perfectly computable.
 *     `MODULE_STATES_SCORED` in `@webaudit/types` says DEGRADED carries a score,
 *     and it is right: a DEGRADED area is missing interpretation, not
 *     measurement. Scoring is now the runner's, over the measured findings this
 *     function preserves.
 *   - **It says so.** A silently thinner report is the real failure: the user
 *     cannot distinguish an area with nothing wrong from an area nobody
 *     interpreted.
 */

import type { Attribution, CapabilityFinding, ModuleState, ModuleType } from '@webaudit/types';
import type { AiInvocationRecord, AiResult } from './executor.js';

export interface DegradedModule {
  readonly module: ModuleType;
  readonly state: ModuleState;
  /**
   * The findings the code layer measured, unchanged. The caller scores the area
   * from these — see the module note on why this function does not.
   */
  readonly findings: readonly CapabilityFinding[];
  readonly attribution: Attribution;
  /** Shown to the user. FR-035's "and say so". */
  readonly notice: string;
  readonly invocations: readonly AiInvocationRecord[];
}

export interface DegradeInput {
  readonly module: ModuleType;
  /** What the code layer produced. Delivered unchanged. */
  readonly measured: readonly CapabilityFinding[];
  readonly degradation: Extract<AiResult<unknown>, { ok: false }>;
}

export function degradeModule(input: DegradeInput): DegradedModule {
  const tried = input.degradation.invocations.length;
  const vendors = [...new Set(input.degradation.invocations.map((i) => i.provider))];

  return {
    module: input.module,
    state: 'DEGRADED',
    findings: input.measured,
    attribution: 'MEASURED',
    notice:
      `No AI provider could be reached for this area, so the ${String(input.measured.length)} ` +
      'finding(s) below are what was measured directly, without interpretation. ' +
      `${String(tried)} provider attempt(s) were made across ${String(vendors.length)} vendor(s). ` +
      'Nothing here is a judgement, and nothing measurable was skipped.',
    invocations: input.degradation.invocations,
  };
}
