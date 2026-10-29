import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PLAN_DEADLINE_CONSTANTS as C,
  PlanDeadlineError,
  computePlanDeadline,
  criticalPathMs,
  dispatchDeadlineDecision,
  dispatchThresholdMs,
  effectiveDeadlineAt,
  unitBudgetMs,
  type DeadlineUnit,
  type PlanDeadlineConstants,
} from '../../../src/services/planning/plan-deadline.js';
import { PlanGraphError, type GraphEdge } from '../../../src/services/planning/graph.js';

const NOW = new Date('2026-10-29T12:00:00.000Z');
const HOUR = 3_600_000;

/** The contract's worked example engine: SPEC 011 SOURCE_EXECUTION. */
const sourceExec = (id: string, over: Partial<DeadlineUnit> = {}): DeadlineUnit => ({
  id,
  executionUnitClass: 'SOURCE_EXECUTION',
  timeoutPolicyMs: 2_030_000,
  hardStopMarginMs: 300_000,
  maxAttempts: 1,
  ...over,
});
const passive = (id: string): DeadlineUnit => ({
  id,
  executionUnitClass: 'PASSIVE_HTTP',
  timeoutPolicyMs: 60_000,
  hardStopMarginMs: 60_000,
  maxAttempts: 1,
});
const dep = (unitId: string, dependsOnUnitId: string): GraphEdge => ({ unitId, dependsOnUnitId });
const grant = (hoursFromNow: number) => ({
  id: 'g',
  expiresAt: new Date(NOW.getTime() + hoursFromNow * HOUR),
});

describe('contract defaults', () => {
  it('match the committed amendment', () => {
    expect(C).toEqual({
      legacyMaxDurationMs: 900_000,
      queueWaitAllowanceMs: 60_000,
      planFinalizationMarginMs: 300_000,
      planMaxDeadlineMs: 21_600_000,
    });
  });
});

describe('worked arithmetic — scan-deadline-contract.md', () => {
  it('unitBudgetMs = 1 x (2 030 000 + 300 000 + 60 000) = 2 390 000', () => {
    expect(unitBudgetMs(sourceExec('u'), C)).toBe(2_390_000);
  });

  it('dispatchThresholdMs = 2 030 000 + 300 000 = 2 330 000, and differs from the budget by exactly the queue allowance', () => {
    const u = sourceExec('u');
    expect(dispatchThresholdMs(u)).toBe(2_330_000);
    expect(unitBudgetMs(u, C) - dispatchThresholdMs(u)).toBe(C.queueWaitAllowanceMs);
  });

  it('four chained units behind a passive prefix: 900 000 + 4 x 2 390 000 + 300 000 = 10 760 000 (2 h 59 min 20 s)', () => {
    const units = [
      passive('p'),
      sourceExec('u1'),
      sourceExec('u2'),
      sourceExec('u3'),
      sourceExec('u4'),
    ];
    const edges = [dep('u1', 'p'), dep('u2', 'u1'), dep('u3', 'u2'), dep('u4', 'u3')];
    const result = computePlanDeadline(units, edges, [], NOW);
    expect(result).toEqual({
      deadlineMs: 10_760_000,
      breakdown: {
        passiveWindowMs: 900_000,
        criticalPathMs: 9_560_000,
        finalizationMarginMs: 300_000,
        ceilingMs: 21_600_000,
      },
    });
  });

  it('maxAttempts multiplies every term (each attempt can queue and run to its hard stop)', () => {
    expect(unitBudgetMs(sourceExec('u', { maxAttempts: 3 }), C)).toBe(3 * 2_390_000);
  });
});

describe('computePlanDeadline rules', () => {
  it("rule 1: a passive-only graph keeps today's behaviour exactly (legacyMaxDurationMs, no margin added)", () => {
    const result = computePlanDeadline([passive('a'), passive('b')], [dep('b', 'a')], [], NOW);
    expect(result).toEqual({
      deadlineMs: 900_000,
      breakdown: {
        passiveWindowMs: 900_000,
        criticalPathMs: 0,
        finalizationMarginMs: 0,
        ceilingMs: 21_600_000,
      },
    });
  });

  it('rule 1: the legacy value is read from the constants, not hard-coded', () => {
    const custom: PlanDeadlineConstants = { ...C, legacyMaxDurationMs: 123_000 };
    expect(computePlanDeadline([passive('a')], [], [], NOW, custom)).toMatchObject({
      deadlineMs: 123_000,
    });
  });

  it('rule 2: L is zero when there is no passive unit', () => {
    expect(computePlanDeadline([sourceExec('u')], [], [], NOW)).toMatchObject({
      deadlineMs: 2_390_000 + 300_000,
      breakdown: { passiveWindowMs: 0 },
    });
  });

  it('rule 2: passive units are NOT summed — however many, the passive window is one legacy value', () => {
    const units = [passive('p1'), passive('p2'), passive('p3'), sourceExec('u')];
    expect(computePlanDeadline(units, [], [], NOW)).toMatchObject({
      breakdown: { passiveWindowMs: 900_000 },
    });
  });

  it('parallel siblings do not add; a chain adds', () => {
    const siblings = computePlanDeadline(
      [sourceExec('a'), sourceExec('b'), sourceExec('c')],
      [],
      [],
      NOW,
    );
    const chain = computePlanDeadline(
      [sourceExec('a'), sourceExec('b'), sourceExec('c')],
      [dep('b', 'a'), dep('c', 'b')],
      [],
      NOW,
    );
    expect(siblings).toMatchObject({ breakdown: { criticalPathMs: 2_390_000 } });
    expect(chain).toMatchObject({ breakdown: { criticalPathMs: 3 * 2_390_000 } });
  });

  it('fan-in takes the longer branch', () => {
    const units = [
      sourceExec('a'),
      sourceExec('b', { timeoutPolicyMs: 100_000 }),
      sourceExec('c', { timeoutPolicyMs: 4_000_000 }),
      sourceExec('d'),
    ];
    const edges = [dep('c', 'a'), dep('d', 'b'), dep('d', 'c')]; // a->c->d (long), b->d (short)
    const expected =
      unitBudgetMs(units[0] as DeadlineUnit, C) +
      unitBudgetMs(units[2] as DeadlineUnit, C) +
      unitBudgetMs(units[3] as DeadlineUnit, C);
    expect(criticalPathMs(units, edges, C)).toBe(expected);
  });

  it('a passive unit in the middle of a chain breaks the non-passive path (paths are of non-passive units)', () => {
    const units = [sourceExec('a'), passive('p'), sourceExec('b')];
    const edges = [dep('p', 'a'), dep('b', 'p')];
    expect(criticalPathMs(units, edges, C)).toBe(2_390_000);
  });

  it('property: the critical path equals a brute-force maximum over every non-passive path', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (let seed = 1; seed <= 80; seed += 1) {
      const rand = mulberry32(seed);
      const n = 9;
      const units: DeadlineUnit[] = Array.from({ length: n }, (_, i) =>
        rand() < 0.25
          ? passive(`u${String(i)}`)
          : sourceExec(`u${String(i)}`, {
              timeoutPolicyMs: 1 + Math.floor(rand() * 500_000),
              maxAttempts: 1 + Math.floor(rand() * 3),
            }),
      );
      const edges: GraphEdge[] = [];
      for (let i = 1; i < n; i += 1)
        for (let j = 0; j < i; j += 1)
          if (rand() < 0.3) edges.push(dep(`u${String(i)}`, `u${String(j)}`));
      const byId = new Map(units.map((u) => [u.id, u]));
      const isPassive = (id: string) =>
        (byId.get(id) as DeadlineUnit).executionUnitClass === 'PASSIVE_HTTP';
      const successors = new Map<string, string[]>();
      for (const e of edges)
        successors.set(e.dependsOnUnitId, [...(successors.get(e.dependsOnUnitId) ?? []), e.unitId]);
      // brute force: depth-first over every path that stays inside non-passive units
      const walk = (id: string): number =>
        unitBudgetMs(byId.get(id) as DeadlineUnit, C) +
        Math.max(0, ...(successors.get(id) ?? []).filter((s) => !isPassive(s)).map(walk));
      const brute = Math.max(0, ...units.filter((u) => !isPassive(u.id)).map((u) => walk(u.id)));
      expect(criticalPathMs(units, edges, C), `seed ${String(seed)}`).toBe(brute);
    }
  });

  it('rule 3: over the ceiling is refused; exactly at the ceiling is allowed', () => {
    // L=900 000 + n x 2 390 000 + 300 000 : 8 units = 20 320 000 (ok), 9 units = 22 710 000 (refused)
    const chain = (n: number) => {
      const units = [
        passive('p'),
        ...Array.from({ length: n }, (_, i) => sourceExec(`u${String(i)}`)),
      ];
      const edges = Array.from({ length: n }, (_, i) =>
        dep(`u${String(i)}`, i === 0 ? 'p' : `u${String(i - 1)}`),
      );
      return { units, edges };
    };
    const ok = chain(8);
    expect(computePlanDeadline(ok.units, ok.edges, [], NOW)).toMatchObject({
      deadlineMs: 20_320_000,
    });
    const over = chain(9);
    expect(computePlanDeadline(over.units, over.edges, [], NOW)).toEqual({
      refused: 'PLAN_DEADLINE_EXCEEDS_CEILING',
    });
    const exact: PlanDeadlineConstants = { ...C, planMaxDeadlineMs: 20_320_000 };
    expect(computePlanDeadline(ok.units, ok.edges, [], NOW, exact)).toMatchObject({
      deadlineMs: 20_320_000,
    });
    expect(
      computePlanDeadline(ok.units, ok.edges, [], NOW, { ...exact, planMaxDeadlineMs: 20_319_999 }),
    ).toEqual({ refused: 'PLAN_DEADLINE_EXCEEDS_CEILING' });
  });

  it('rule 4: a grant expiring before the deadline refuses the plan (never clamped); exactly at the deadline is allowed', () => {
    const units = [sourceExec('u')]; // deadline = 2 690 000 ms
    const deadline = 2_690_000;
    const at = { id: 'g', expiresAt: new Date(NOW.getTime() + deadline) };
    const before = { id: 'g', expiresAt: new Date(NOW.getTime() + deadline - 1) };
    expect(computePlanDeadline(units, [], [at], NOW)).toMatchObject({
      deadlineMs: deadline,
      breakdown: { grantCapMs: deadline },
    });
    expect(computePlanDeadline(units, [], [before], NOW)).toEqual({
      refused: 'GRANT_EXPIRES_BEFORE_DEADLINE',
    });
  });

  it('rule 4: every referenced grant is checked, and grantCapMs records the tightest one', () => {
    const units = [sourceExec('u')];
    expect(computePlanDeadline(units, [], [grant(10), grant(2)], NOW)).toMatchObject({
      breakdown: { grantCapMs: 2 * HOUR },
    });
    expect(
      computePlanDeadline(
        units,
        [],
        [grant(10), { id: 'g2', expiresAt: new Date(NOW.getTime() + 60_000) }],
        NOW,
      ),
    ).toEqual({
      refused: 'GRANT_EXPIRES_BEFORE_DEADLINE',
    });
  });

  it('is deterministic and does not mutate its inputs', () => {
    const units = [passive('p'), sourceExec('a'), sourceExec('b')];
    const edges = [dep('a', 'p'), dep('b', 'a')];
    const snapshot = JSON.stringify({ units, edges });
    const a = computePlanDeadline(units, edges, [grant(9)], NOW);
    const b = computePlanDeadline([...units].reverse(), [...edges].reverse(), [grant(9)], NOW);
    expect(a).toEqual(b);
    expect(JSON.stringify({ units, edges })).toBe(snapshot);
  });

  it('fails closed (throws, never a default) for a bad graph or unusable numbers', () => {
    expect(() =>
      computePlanDeadline(
        [sourceExec('a'), sourceExec('b')],
        [dep('a', 'b'), dep('b', 'a')],
        [],
        NOW,
      ),
    ).toThrow(PlanGraphError);
    expect(() => computePlanDeadline([sourceExec('a')], [dep('a', 'ghost')], [], NOW)).toThrow(
      PlanGraphError,
    );
    for (const bad of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() =>
        computePlanDeadline([sourceExec('a', { timeoutPolicyMs: bad })], [], [], NOW),
      ).toThrow(PlanDeadlineError);
      expect(() =>
        computePlanDeadline([sourceExec('a', { maxAttempts: bad })], [], [], NOW),
      ).toThrow(PlanDeadlineError);
      expect(() =>
        computePlanDeadline([sourceExec('a')], [], [], NOW, {
          ...C,
          planFinalizationMarginMs: bad,
        }),
      ).toThrow(PlanDeadlineError);
    }
    expect(() => computePlanDeadline([sourceExec('a')], [], [], new Date('nope'))).toThrow(
      PlanDeadlineError,
    );
    expect(() =>
      computePlanDeadline([sourceExec('a')], [], [{ id: 'g', expiresAt: new Date('nope') }], NOW),
    ).toThrow(PlanDeadlineError);
    expect(() =>
      computePlanDeadline(
        [sourceExec('a', { timeoutPolicyMs: Number.MAX_SAFE_INTEGER })],
        [],
        [],
        NOW,
      ),
    ).toThrow(PlanDeadlineError);
  });
});

describe('the Lemma: a dispatch is never refused merely because earlier units used their full budget', () => {
  it('property: in the worst-case timeline of any chain, remaining time at every pickup >= dispatchThresholdMs', () => {
    function mulberry32(seed: number) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }
    for (let seed = 1; seed <= 200; seed += 1) {
      const rand = mulberry32(seed);
      const n = 1 + Math.floor(rand() * 5);
      const units = Array.from({ length: n }, (_, i) =>
        sourceExec(`u${String(i)}`, {
          timeoutPolicyMs: 1_000 + Math.floor(rand() * 900_000),
          hardStopMarginMs: 1_000 + Math.floor(rand() * 300_000),
          maxAttempts: 1 + Math.floor(rand() * 3),
        }),
      );
      const edges = units.slice(1).map((u, i) => dep(u.id, (units[i] as DeadlineUnit).id));
      const result = computePlanDeadline(
        [passive('p'), ...units],
        [dep('u0', 'p'), ...edges],
        [],
        NOW,
      );
      if ('refused' in result) continue; // beyond the ceiling: the plan was refused, nothing to dispatch
      const D = result.deadlineMs;
      // Worst case: passive work ends at L; each attempt waits the full queue allowance, then runs to its hard stop.
      let t = C.legacyMaxDurationMs;
      for (const u of units) {
        for (let attempt = 1; attempt <= u.maxAttempts; attempt += 1) {
          const pickup = t + C.queueWaitAllowanceMs;
          const remaining = D - pickup;
          expect(
            remaining,
            `seed ${String(seed)} unit ${u.id} attempt ${String(attempt)}`,
          ).toBeGreaterThanOrEqual(dispatchThresholdMs(u));
          t = pickup + u.timeoutPolicyMs + u.hardStopMarginMs;
        }
      }
      expect(D - t, `seed ${String(seed)} slack at the end`).toBeGreaterThanOrEqual(
        C.planFinalizationMarginMs,
      );
    }
  });
});

describe('effectiveDeadlineAt (derived at read time, never stored)', () => {
  const started = new Date('2026-10-29T10:00:00.000Z');
  const resolved = new Date('2026-10-29T09:00:00.000Z');
  const initial = {
    kind: 'INITIAL',
    state: 'RESOLVED',
    deadlineMs: 3_000_000,
    resolvedAt: resolved,
  } as const;

  it('INITIAL plan: startedAt + deadlineMs', () => {
    expect(effectiveDeadlineAt({ startedAt: started }, initial, 900_000)?.toISOString()).toBe(
      '2026-10-29T10:50:00.000Z',
    );
  });

  it('REVERIFY plan: resolvedAt + deadlineMs (a reverify has no scan startedAt anchor)', () => {
    expect(
      effectiveDeadlineAt(
        { startedAt: null },
        { ...initial, kind: 'REVERIFY' },
        900_000,
      )?.toISOString(),
    ).toBe('2026-10-29T09:50:00.000Z');
  });

  it('no plan: legacy behaviour, startedAt + legacyMaxDurationMs', () => {
    expect(effectiveDeadlineAt({ startedAt: started }, null, 900_000)?.toISOString()).toBe(
      '2026-10-29T10:15:00.000Z',
    );
    expect(effectiveDeadlineAt({ startedAt: started }, undefined, 900_000)?.toISOString()).toBe(
      '2026-10-29T10:15:00.000Z',
    );
  });

  it('a REFUSED plan is not a plan: the scan is legacy', () => {
    const refused = {
      kind: 'INITIAL',
      state: 'REFUSED',
      deadlineMs: null,
      resolvedAt: resolved,
    } as const;
    expect(effectiveDeadlineAt({ startedAt: started }, refused, 900_000)?.toISOString()).toBe(
      '2026-10-29T10:15:00.000Z',
    );
  });

  it('before the scan has started there is no anchor (a non-passive unit must not be dispatched)', () => {
    expect(effectiveDeadlineAt({ startedAt: null }, initial, 900_000)).toBeNull();
    expect(effectiveDeadlineAt({ startedAt: null }, null, 900_000)).toBeNull();
  });

  it('retries and restarts cannot move it: the result depends only on the immutable inputs', () => {
    const first = effectiveDeadlineAt({ startedAt: started }, initial, 900_000);
    for (let i = 0; i < 5; i += 1)
      expect(
        effectiveDeadlineAt({ startedAt: new Date(started) }, { ...initial }, 900_000),
      ).toEqual(first);
  });

  it('rejects a RESOLVED plan without a deadline (data-model invariant) rather than defaulting', () => {
    expect(() =>
      effectiveDeadlineAt({ startedAt: started }, { ...initial, deadlineMs: null }, 900_000),
    ).toThrow(PlanDeadlineError);
  });
});

describe('dispatchDeadlineDecision (step 0, before F07)', () => {
  const unit = { timeoutPolicyMs: 2_030_000, hardStopMarginMs: 300_000 }; // threshold 2 330 000
  const deadline = new Date(NOW.getTime() + 2_330_000);
  const decide = (over: Partial<Parameters<typeof dispatchDeadlineDecision>[0]> = {}) =>
    dispatchDeadlineDecision({
      now: NOW,
      effectiveDeadlineAt: deadline,
      scanTerminalState: null,
      unit,
      ...over,
    });

  it('proceeds when exactly the threshold remains (the comparison is strict: refuse only when remaining < threshold)', () => {
    expect(decide()).toEqual({ action: 'PROCEED' });
  });

  it('refuses SCAN_DEADLINE_INSUFFICIENT one millisecond below the threshold', () => {
    expect(decide({ effectiveDeadlineAt: new Date(deadline.getTime() - 1) })).toEqual({
      action: 'REFUSE',
      reason: 'SCAN_DEADLINE_INSUFFICIENT',
    });
  });

  it('refuses SCAN_DEADLINE_EXPIRED at and after the deadline', () => {
    expect(decide({ effectiveDeadlineAt: NOW })).toEqual({
      action: 'REFUSE',
      reason: 'SCAN_DEADLINE_EXPIRED',
    });
    expect(decide({ effectiveDeadlineAt: new Date(NOW.getTime() - 1) })).toEqual({
      action: 'REFUSE',
      reason: 'SCAN_DEADLINE_EXPIRED',
    });
  });

  it.each([
    ['CANCELLED', 'SCAN_CANCELLED'],
    ['FAILED', 'SCAN_FAILED'],
    ['TIMED_OUT', 'SCAN_DEADLINE_EXPIRED'],
  ] as const)(
    'a %s scan refuses with %s even if time remains (no redelivery can resurrect it)',
    (state, reason) => {
      expect(decide({ scanTerminalState: state })).toEqual({ action: 'REFUSE', reason });
    },
  );

  it('defers (does not refuse, does not dispatch) while the scan has no startedAt anchor', () => {
    expect(decide({ effectiveDeadlineAt: null })).toEqual({
      action: 'DEFER',
      reason: 'SCAN_NOT_STARTED',
    });
  });

  it('a terminal scan wins over a missing anchor', () => {
    expect(decide({ effectiveDeadlineAt: null, scanTerminalState: 'CANCELLED' })).toEqual({
      action: 'REFUSE',
      reason: 'SCAN_CANCELLED',
    });
  });
});
