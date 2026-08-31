/**
 * T164 — the go / no-go verdict.
 *
 * FR-070: "return an explicit go or no-go verdict, and MUST name the specific
 * blockers behind a no-go." FR-071: "apply published per-area thresholds *and*
 * an absence of regressions when determining a go verdict, and MUST show which
 * criteria passed and which failed."
 *
 * So a *go* needs two things at once: every area at or above its published
 * threshold (`READINESS_THRESHOLDS` in `@webaudit/config` — published, not
 * hidden in this file), and zero regressions from `diff.ts`. Either failing is
 * a no-go, and every failing criterion becomes a named blocker.
 *
 * Pure. `run.ts` feeds it the fresh areas and the diff.
 */

import { READINESS_THRESHOLDS } from '@webaudit/config';
import { overallScore } from '@webaudit/scoring';
import type { ModuleType } from '@webaudit/types';
import type { AreaSnapshot, Regression } from './diff.js';

const MODULE_LABEL: Readonly<Record<ModuleType, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

export interface ModuleOutcome {
  readonly module: ModuleType;
  readonly score: number | null;
  readonly threshold: number;
  readonly pass: boolean;
}

export interface ReadinessVerdictResult {
  readonly isReady: boolean;
  /**
   * The readiness overall score. Unlike a report's overall score this is never
   * null — a readiness verdict is a decision, and "we could not measure enough
   * to judge" is a no-go, which this represents as 0 with a blocker that says
   * so rather than an absent number.
   */
  readonly overallScore: number;
  readonly moduleOutcomes: readonly ModuleOutcome[];
  readonly blockers: readonly string[];
}

export function computeVerdict(input: {
  readonly freshAreas: readonly AreaSnapshot[];
  readonly regressions: readonly Regression[];
}): ReadinessVerdictResult {
  const byModule = new Map(input.freshAreas.map((a) => [a.module, a]));

  const moduleOutcomes: ModuleOutcome[] = (
    Object.keys(READINESS_THRESHOLDS) as ModuleType[]
  ).map((module) => {
    const threshold = READINESS_THRESHOLDS[module];
    const area = byModule.get(module);
    const score = area?.score ?? null;
    return { module, score, threshold, pass: score !== null && score >= threshold };
  });

  const blockers: string[] = [];

  for (const outcome of moduleOutcomes) {
    if (outcome.pass) continue;
    blockers.push(
      outcome.score === null
        ? `${MODULE_LABEL[outcome.module]} could not be audited this pass, so readiness cannot be confirmed for it`
        : `${MODULE_LABEL[outcome.module]} scored ${String(outcome.score)} against a ${String(outcome.threshold)} threshold`,
    );
  }

  // Regressions are blockers even for an area that is otherwise above its
  // threshold — FR-071's "*and* an absence of regressions".
  for (const regression of input.regressions) {
    if (!blockers.includes(regression.name)) blockers.push(regression.name);
  }

  const computed = overallScore(
    input.freshAreas.map((a) => ({ module: a.module, state: a.state, score: a.score })),
  ).score;
  const overall = computed ?? 0;
  if (computed === null) {
    blockers.push('The audit measured nothing, so a readiness verdict cannot be given');
  }

  const isReady = blockers.length === 0;
  return { isReady, overallScore: overall, moduleOutcomes, blockers };
}
