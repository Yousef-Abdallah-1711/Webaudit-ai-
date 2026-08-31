/**
 * T163 — the fingerprint-based readiness diff (`apps/worker/src/readiness/diff.ts`).
 *
 * FR-068 (direction + size per area) and FR-069 (name any area *or issue* that
 * got worse), as pure-function assertions.
 */

import { describe, expect, it } from 'vitest';
import {
  AREA_REGRESSION_MIN,
  diffAgainstBaseline,
  type ReadinessSnapshot,
} from '../../src/readiness/diff.js';

function snap(
  areas: ReadinessSnapshot['areas'],
  issues: ReadinessSnapshot['issues'] = [],
): ReadinessSnapshot {
  return { areas, issues };
}

describe('diffAgainstBaseline — area changes (FR-068)', () => {
  it('reports direction and signed size for every area', () => {
    const diff = diffAgainstBaseline(
      snap([
        { module: 'SECURITY', state: 'COMPLETE', score: 80 },
        { module: 'SEO', state: 'COMPLETE', score: 60 },
      ]),
      snap([
        { module: 'SECURITY', state: 'COMPLETE', score: 92 },
        { module: 'SEO', state: 'COMPLETE', score: 55 },
      ]),
    );
    const sec = diff.areaChanges.find((c) => c.module === 'SECURITY')!;
    const seo = diff.areaChanges.find((c) => c.module === 'SEO')!;
    expect(sec).toMatchObject({ delta: 12, direction: 'up' });
    expect(seo).toMatchObject({ delta: -5, direction: 'down' });
  });

  it('a change smaller than the noise floor is "unchanged", not a regression', () => {
    const drop = AREA_REGRESSION_MIN - 1;
    const diff = diffAgainstBaseline(
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 80 }]),
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 80 - drop }]),
    );
    expect(diff.areaChanges[0]?.direction).toBe('unchanged');
    expect(diff.regressions).toHaveLength(0);
  });
});

describe('diffAgainstBaseline — regressions are named (FR-069)', () => {
  it('names an area whose score fell, not merely a number', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 85 }]),
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 50 }]),
    );
    expect(diff.regressions).toEqual([
      { kind: 'area', module: 'SECURITY', name: 'Security regressed: score fell from 85 to 50' },
    ]);
  });

  it('names an area that degraded (measured less than before)', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'TESTING', state: 'COMPLETE', score: 80 }]),
      snap([
        { module: 'TESTING', state: 'DEGRADED', score: 80, degradedReason: 'provider chain exhausted' },
      ]),
    );
    expect(diff.regressions[0]?.kind).toBe('area');
    expect(diff.regressions[0]?.name).toContain('Testing regressed');
    expect(diff.regressions[0]?.name).toContain('provider chain exhausted');
  });

  it('names a verified fix that has come back (recurrence)', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 90 }], [
        { fingerprint: 'fp-hsts', severity: 'HIGH', title: 'Missing HSTS', state: 'RESOLVED' },
      ]),
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 90 }], [
        { fingerprint: 'fp-hsts', severity: 'HIGH', title: 'Missing HSTS', state: 'OPEN' },
      ]),
    );
    expect(diff.regressions).toContainEqual({
      kind: 'recurrence',
      fingerprint: 'fp-hsts',
      name: 'Regressed: "Missing HSTS" was verified fixed and has returned',
    });
  });

  it('names a new blocker absent from the original audit', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 90 }], []),
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 90 }], [
        { fingerprint: 'fp-new', severity: 'CRITICAL', title: 'New RCE', state: 'OPEN' },
      ]),
    );
    expect(diff.regressions).toContainEqual({
      kind: 'new-blocker',
      fingerprint: 'fp-new',
      name: 'New critical issue not in the original audit: "New RCE"',
    });
  });

  it('a new LOW issue is not a regression', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'SEO', state: 'COMPLETE', score: 90 }], []),
      snap([{ module: 'SEO', state: 'COMPLETE', score: 90 }], [
        { fingerprint: 'fp-low', severity: 'LOW', title: 'Heading skip', state: 'OPEN' },
      ]),
    );
    expect(diff.regressions).toHaveLength(0);
  });
});

describe('diffAgainstBaseline — improvements', () => {
  it('reports a cleared blocking issue and a risen score', () => {
    const diff = diffAgainstBaseline(
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 60 }], [
        { fingerprint: 'fp-csp', severity: 'HIGH', title: 'Missing CSP', state: 'RESOLVED' },
      ]),
      snap([{ module: 'SECURITY', state: 'COMPLETE', score: 88 }], []),
    );
    expect(diff.improvements.map((i) => i.kind).sort()).toEqual(['area', 'issue-cleared']);
  });
});
