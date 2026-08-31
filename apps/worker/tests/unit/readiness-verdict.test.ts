/**
 * T164 — the go/no-go verdict (`apps/worker/src/readiness/verdict.ts`).
 *
 * FR-070 (explicit verdict + named blockers) and FR-071 (published per-area
 * thresholds AND no regressions), as pure-function assertions.
 */

import { describe, expect, it } from 'vitest';
import { READINESS_THRESHOLDS } from '@webaudit/config';
import { computeVerdict } from '../../src/readiness/verdict.js';
import type { AreaSnapshot, Regression } from '../../src/readiness/diff.js';

const allAreasAt = (score: number): AreaSnapshot[] =>
  (Object.keys(READINESS_THRESHOLDS) as (keyof typeof READINESS_THRESHOLDS)[]).map((module) => ({
    module,
    state: 'COMPLETE' as const,
    score,
  }));

describe('computeVerdict', () => {
  it('go when every area is at or above its published threshold and there are no regressions', () => {
    const v = computeVerdict({ freshAreas: allAreasAt(95), regressions: [] });
    expect(v.isReady).toBe(true);
    expect(v.blockers).toHaveLength(0);
    expect(v.moduleOutcomes.every((o) => o.pass)).toBe(true);
  });

  it('no-go with a named blocker for each area below its threshold, showing score vs threshold', () => {
    const areas: AreaSnapshot[] = [
      { module: 'SECURITY', state: 'COMPLETE', score: 40 },
      { module: 'PERFORMANCE', state: 'COMPLETE', score: 95 },
      { module: 'UI', state: 'COMPLETE', score: 95 },
      { module: 'TESTING', state: 'COMPLETE', score: 95 },
      { module: 'SEO', state: 'COMPLETE', score: 95 },
    ];
    const v = computeVerdict({ freshAreas: areas, regressions: [] });
    expect(v.isReady).toBe(false);
    expect(v.blockers).toContain(
      `Security scored 40 against a ${String(READINESS_THRESHOLDS.SECURITY)} threshold`,
    );
    expect(v.moduleOutcomes.find((o) => o.module === 'SECURITY')?.pass).toBe(false);
  });

  it('no-go when an area is above threshold but a regression exists (FR-071 "*and* an absence of regressions")', () => {
    const regression: Regression = {
      kind: 'recurrence',
      name: 'Regressed: "Missing HSTS" was verified fixed and has returned',
    };
    const v = computeVerdict({ freshAreas: allAreasAt(99), regressions: [regression] });
    expect(v.isReady).toBe(false);
    expect(v.blockers).toContain(regression.name);
  });

  it('an unscored area is a blocker — you cannot ship what could not be audited', () => {
    const areas: AreaSnapshot[] = [
      ...allAreasAt(95).filter((a) => a.module !== 'TESTING'),
      { module: 'TESTING', state: 'FAILED', score: null },
    ];
    const v = computeVerdict({ freshAreas: areas, regressions: [] });
    expect(v.isReady).toBe(false);
    expect(v.blockers.some((b) => b.includes('Testing') && b.includes('could not be audited'))).toBe(
      true,
    );
    expect(v.moduleOutcomes.find((o) => o.module === 'TESTING')?.pass).toBe(false);
  });

  it('overallScore is never null — an audit that measured nothing is a no-go at 0', () => {
    const v = computeVerdict({
      freshAreas: [{ module: 'SECURITY', state: 'FAILED', score: null }],
      regressions: [],
    });
    expect(v.overallScore).toBe(0);
    expect(v.isReady).toBe(false);
  });
});
