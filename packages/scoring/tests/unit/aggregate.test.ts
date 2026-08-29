/**
 * T092 — FR-053: "mark any area that did not complete as incomplete in the
 * report, and MUST NOT let its absence inflate the overall score."
 *
 * Both failure directions get their own block, because the requirement is
 * usually read as only one of them and both are real:
 *
 *   **Inflation** — excluding an area that had a computable score. An area with
 *   ten measured criticals whose AI layer went dark, scored null and dropped from
 *   the average, makes the overall number go *up*. This is the direction FR-053
 *   names, and the direction this repository got wrong in 2H before the runner
 *   was written.
 *
 *   **Deflation** — including an area that measured nothing, as a zero. An area
 *   nobody could audit is not an area that failed its audit, and a `?? 0`
 *   anywhere near this file invents a number and punishes the user for it.
 */

import { describe, expect, it } from 'vitest';
import {
  isScorable,
  overallScore,
  scoreFromFindings,
  SEVERITY_WEIGHT,
  worstSeverity,
  type AreaScore,
} from '../../src/index.js';
import type { ModuleState, Severity } from '@webaudit/types';

const f = (severity: Severity) => ({ severity });

describe('scoreFromFindings', () => {
  it('scores a clean area 100', () => {
    expect(scoreFromFindings([])).toBe(100);
  });

  it('deducts by severity', () => {
    expect(scoreFromFindings([f('CRITICAL')])).toBe(75);
    expect(scoreFromFindings([f('HIGH')])).toBe(88);
    expect(scoreFromFindings([f('MEDIUM')])).toBe(95);
    expect(scoreFromFindings([f('LOW')])).toBe(98);
  });

  it('charges nothing for INFO', () => {
    // An informational note is not a defect. Letting it shave a point would put
    // a clean audit permanently out of reach.
    expect(scoreFromFindings([f('INFO'), f('INFO'), f('INFO')])).toBe(100);
    expect(SEVERITY_WEIGHT.INFO).toBe(0);
  });

  it('floors at zero rather than going negative', () => {
    expect(scoreFromFindings(Array.from({ length: 20 }, () => f('CRITICAL')))).toBe(0);
  });

  it('is order-independent, so a re-audit is comparable', () => {
    const a = scoreFromFindings([f('CRITICAL'), f('LOW'), f('MEDIUM')]);
    const b = scoreFromFindings([f('MEDIUM'), f('CRITICAL'), f('LOW')]);
    expect(a).toBe(b);
  });

  it('reaches zero at four criticals', () => {
    expect(scoreFromFindings(Array.from({ length: 4 }, () => f('CRITICAL')))).toBe(0);
    expect(scoreFromFindings(Array.from({ length: 3 }, () => f('CRITICAL')))).toBe(25);
  });
});

describe('isScorable', () => {
  it.each<[ModuleState, boolean]>([
    ['COMPLETE', true],
    // The one that matters: a DEGRADED area measured something, so it has a
    // score, so excluding it would inflate the total.
    ['DEGRADED', true],
    ['FAILED', false],
    ['NOT_APPLICABLE', false],
    ['PENDING', false],
    ['RUNNING', false],
  ])('%s -> %s', (state, expected) => {
    expect(isScorable(state)).toBe(expected);
  });
});

describe('FR-053 - an omitted area must not inflate the overall score', () => {
  it('includes a DEGRADED area, so losing the AI layer cannot raise the score', () => {
    // The scenario in one test. SECURITY measured four criticals and lost its
    // interpretation; if it dropped out, the overall would be 100.
    const areas: AreaScore[] = [
      { module: 'SECURITY', state: 'DEGRADED', score: 0 },
      { module: 'SEO', state: 'COMPLETE', score: 100 },
    ];
    const result = overallScore(areas);

    expect(result.score).toBe(50);
    expect(result.scoredModules).toEqual(['SECURITY', 'SEO']);
    expect(result.unscoredModules).toEqual([]);
  });

  it('is strictly lower than the same audit with the bad area omitted', () => {
    const withBadArea = overallScore([
      { module: 'SECURITY', state: 'DEGRADED', score: 20 },
      { module: 'SEO', state: 'COMPLETE', score: 90 },
    ]);
    const omitted = overallScore([{ module: 'SEO', state: 'COMPLETE', score: 90 }]);

    expect(withBadArea.score!).toBeLessThan(omitted.score!);
  });

  it('averages only over areas that produced a score', () => {
    const result = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 80 },
      { module: 'PERFORMANCE', state: 'COMPLETE', score: 60 },
      { module: 'TESTING', state: 'NOT_APPLICABLE', score: null },
    ]);

    expect(result.score).toBe(70);
    expect(result.unscoredModules).toEqual(['TESTING']);
  });
});

describe('FR-053 - an unmeasured area must not deflate it either', () => {
  it('excludes NOT_APPLICABLE rather than counting it as zero', () => {
    // A source-only area with no source attached. Counting it zero would
    // halve this audit's score for something the user did not do wrong.
    const result = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 100 },
      { module: 'TESTING', state: 'NOT_APPLICABLE', score: null },
    ]);
    expect(result.score).toBe(100);
  });

  it('excludes FAILED rather than counting it as zero', () => {
    const result = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 90 },
      { module: 'UI', state: 'FAILED', score: null },
    ]);
    expect(result.score).toBe(90);
    expect(result.unscoredModules).toEqual(['UI']);
  });

  it.each<ModuleState>(['FAILED', 'NOT_APPLICABLE', 'PENDING', 'RUNNING'])(
    'never averages a %s area in, even if a score is somehow present',
    (state) => {
      // Defence against an upstream bug: a non-scorable state carrying a number
      // is wrong, and averaging it in would hide the bug behind a plausible
      // total.
      const result = overallScore([
        { module: 'SECURITY', state: 'COMPLETE', score: 100 },
        { module: 'UI', state, score: 0 },
      ]);
      expect(result.score).toBe(100);
    },
  );

  it('excludes a scorable state whose score is null, rather than reading it as zero', () => {
    // The other half of the same defence: COMPLETE with a null score is an
    // upstream bug, and `?? 0` would turn it into a silent 0-point area.
    const result = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 100 },
      { module: 'UI', state: 'COMPLETE', score: null },
    ]);
    expect(result.score).toBe(100);
    expect(result.unscoredModules).toEqual(['UI']);
  });
});

describe('overallScore edges', () => {
  it('is null when nothing was scored, not zero', () => {
    // An audit that measured nothing has no score. Reporting 0 would tell the
    // user their site is as bad as possible.
    const result = overallScore([
      { module: 'SECURITY', state: 'FAILED', score: null },
      { module: 'SEO', state: 'NOT_APPLICABLE', score: null },
    ]);
    expect(result.score).toBeNull();
    expect(result.scoredModules).toEqual([]);
  });

  it('is null for an empty audit', () => {
    expect(overallScore([]).score).toBeNull();
  });

  it('rounds to an integer', () => {
    const result = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 100 },
      { module: 'SEO', state: 'COMPLETE', score: 99 },
      { module: 'UI', state: 'COMPLETE', score: 98 },
    ]);
    expect(result.score).toBe(99);
    expect(Number.isInteger(result.score)).toBe(true);
  });

  it('does not weight one area above another', () => {
    // Weighting would encode a claim about which area matters most to this user,
    // and the product does not know that. Per-area scores are shown alongside.
    const securityBad = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 0 },
      { module: 'SEO', state: 'COMPLETE', score: 100 },
    ]);
    const seoBad = overallScore([
      { module: 'SECURITY', state: 'COMPLETE', score: 100 },
      { module: 'SEO', state: 'COMPLETE', score: 0 },
    ]);
    expect(securityBad.score).toBe(seoBad.score);
  });
});

describe('worstSeverity', () => {
  it('picks the worst present', () => {
    expect(worstSeverity([f('LOW'), f('CRITICAL'), f('MEDIUM')])).toBe('CRITICAL');
    expect(worstSeverity([f('LOW'), f('INFO')])).toBe('LOW');
  });

  it('is null for an area with no findings, not INFO', () => {
    expect(worstSeverity([])).toBeNull();
  });
});
