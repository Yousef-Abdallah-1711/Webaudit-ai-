/**
 * T163 — the fingerprint-based diff between a readiness pass and its baseline.
 *
 * FR-068: "compare each area against the original audit and report the
 * direction and size of change." FR-069: "identify and name any area *or
 * issue* that has become worse." R3's fingerprint is what makes the issue half
 * possible — an issue that was `RESOLVED` in the baseline and is present again
 * in the fresh audit is the same problem, recognised across audits, and that
 * is a regression the user needs named, not a number that dropped.
 *
 * Pure. No database, no network — the orchestrator (`run.ts`) reads both sides
 * and hands them here.
 *
 * **Three kinds of regression, all named** (FR-069's "named, not merely
 * counted"):
 *
 *   1. **Area score fell** by more than `AREA_REGRESSION_MIN` points, or the
 *      area's state degraded (it measured less than it did before).
 *   2. **A verified fix came back** — a fresh issue whose fingerprint reached
 *      `RESOLVED` in the baseline (also what `markRecurrences` flags REOPENED).
 *   3. **A new blocker appeared** — a fresh CRITICAL/HIGH issue whose
 *      fingerprint is absent from the baseline entirely (the edge case
 *      "the readiness pass discovers new critical issues absent from the
 *      original audit").
 */

import { SEVERITIES_BLOCKING } from '@webaudit/types';
import type { ModuleState, ModuleType, Severity } from '@webaudit/types';

/** Below this, an area score change is noise, not a reported direction. */
export const AREA_REGRESSION_MIN = 3;

const MODULE_LABEL: Readonly<Record<ModuleType, string>> = {
  PERFORMANCE: 'Performance',
  SECURITY: 'Security',
  UI: 'Design',
  TESTING: 'Testing',
  SEO: 'Search visibility',
};

export interface AreaSnapshot {
  readonly module: ModuleType;
  readonly state: ModuleState;
  readonly score: number | null;
  readonly degradedReason?: string | null;
}

export interface IssueSnapshot {
  readonly fingerprint: string;
  readonly severity: Severity;
  readonly title: string;
  /** The baseline issue's final state; only `RESOLVED` matters for the diff. */
  readonly state: string;
}

export interface ReadinessSnapshot {
  readonly areas: readonly AreaSnapshot[];
  readonly issues: readonly IssueSnapshot[];
}

export interface AreaChange {
  readonly module: ModuleType;
  readonly baselineScore: number | null;
  readonly freshScore: number | null;
  /** Signed points; null when either side has no score. */
  readonly delta: number | null;
  readonly direction: 'up' | 'down' | 'unchanged' | 'incomparable';
}

export interface Regression {
  readonly kind: 'area' | 'recurrence' | 'new-blocker';
  /** Human-readable, ready to drop into `blockers` (FR-070). */
  readonly name: string;
  readonly module?: ModuleType;
  readonly fingerprint?: string;
}

export interface Improvement {
  readonly kind: 'area' | 'issue-cleared';
  readonly name: string;
  readonly module?: ModuleType;
}

export interface ReadinessDiff {
  /** One entry per area, always — FR-068 wants direction *and* size for each. */
  readonly areaChanges: readonly AreaChange[];
  readonly regressions: readonly Regression[];
  readonly improvements: readonly Improvement[];
}

/**
 * How much confidence an area's state carries, worst-last. A readiness pass
 * moving an area to a higher rank than the baseline is a regression *of the
 * audit* — the verdict is now less trustworthy for that area — even when the
 * numeric score is unchanged (a DEGRADED area still carries a score, FR-053).
 */
const STATE_RANK: Readonly<Record<ModuleState, number>> = {
  COMPLETE: 0,
  DEGRADED: 1,
  RUNNING: 2,
  PENDING: 2,
  FAILED: 3,
  NOT_APPLICABLE: 3,
};

function isBlocking(severity: Severity): boolean {
  return (SEVERITIES_BLOCKING as readonly Severity[]).includes(severity);
}

export function diffAgainstBaseline(
  baseline: ReadinessSnapshot,
  fresh: ReadinessSnapshot,
): ReadinessDiff {
  const baselineArea = new Map(baseline.areas.map((a) => [a.module, a]));
  const areaChanges: AreaChange[] = [];
  const regressions: Regression[] = [];
  const improvements: Improvement[] = [];

  for (const area of fresh.areas) {
    const before = baselineArea.get(area.module);
    const label = MODULE_LABEL[area.module];
    const bScore = before?.score ?? null;
    const fScore = area.score;
    const delta = bScore !== null && fScore !== null ? fScore - bScore : null;

    let direction: AreaChange['direction'];
    if (delta === null) direction = 'incomparable';
    else if (delta >= AREA_REGRESSION_MIN) direction = 'up';
    else if (delta <= -AREA_REGRESSION_MIN) direction = 'down';
    else direction = 'unchanged';

    areaChanges.push({
      module: area.module,
      baselineScore: bScore,
      freshScore: fScore,
      delta,
      direction,
    });

    // Area regression: the score fell meaningfully, or the area's state carries
    // less confidence than it did before (e.g. COMPLETE → DEGRADED).
    const stateDegraded =
      before !== undefined && STATE_RANK[area.state] > STATE_RANK[before.state];
    if (direction === 'down') {
      regressions.push({
        kind: 'area',
        module: area.module,
        name: `${label} regressed: score fell from ${String(bScore)} to ${String(fScore)}`,
      });
    } else if (stateDegraded) {
      const why = area.degradedReason ?? 'the area could not be fully audited this pass';
      regressions.push({
        kind: 'area',
        module: area.module,
        name: `${label} regressed: ${before.state.toLowerCase()} → ${area.state.toLowerCase()} (${why})`,
      });
    } else if (direction === 'up') {
      improvements.push({
        kind: 'area',
        module: area.module,
        name: `${label} improved: score rose from ${String(bScore)} to ${String(fScore)}`,
      });
    }
  }

  // Issue-level diff, keyed on the R3 fingerprint.
  const baselineByFingerprint = new Map(baseline.issues.map((i) => [i.fingerprint, i]));
  const freshFingerprints = new Set(fresh.issues.map((i) => i.fingerprint));

  for (const issue of fresh.issues) {
    const before = baselineByFingerprint.get(issue.fingerprint);
    if (before !== undefined && before.state === 'RESOLVED') {
      regressions.push({
        kind: 'recurrence',
        fingerprint: issue.fingerprint,
        name: `Regressed: "${issue.title}" was verified fixed and has returned`,
      });
    } else if (before === undefined && isBlocking(issue.severity)) {
      regressions.push({
        kind: 'new-blocker',
        fingerprint: issue.fingerprint,
        name: `New ${issue.severity.toLowerCase()} issue not in the original audit: "${issue.title}"`,
      });
    }
  }

  // Improvements: a blocking issue that was in the baseline and is gone now.
  for (const issue of baseline.issues) {
    if (isBlocking(issue.severity) && !freshFingerprints.has(issue.fingerprint)) {
      improvements.push({
        kind: 'issue-cleared',
        name: `Cleared: "${issue.title}" (${issue.severity.toLowerCase()}) no longer appears`,
      });
    }
  }

  return { areaChanges, regressions, improvements };
}
