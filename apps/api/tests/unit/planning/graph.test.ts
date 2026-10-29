import { describe, expect, it } from 'vitest';
import {
  PlanGraphError,
  dependentsToBlock,
  isEligible,
  isTerminalUnitStatus,
  topologicalOrder,
  transitiveBlocked,
  validateExecutionGraph,
  EXECUTION_UNIT_STATUSES,
  type ExecutionUnitStatus,
  type GraphEdge,
  type GraphUnit,
} from '../../../src/services/planning/graph.js';

const unit = (
  id: string,
  executionUnitClass: GraphUnit['executionUnitClass'] = 'PASSIVE_HTTP',
): GraphUnit => ({
  id,
  executionUnitClass,
});
const edge = (unitId: string, dependsOnUnitId: string): GraphEdge => ({ unitId, dependsOnUnitId });

/** Deterministic PRNG so a failing property case is reproducible from its seed. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random DAG: edges only go from a later index to an earlier one, so it is acyclic by construction. */
function randomDag(seed: number, n: number, density: number) {
  const rand = mulberry32(seed);
  const ids = Array.from({ length: n }, (_, i) => `u${String(i).padStart(3, '0')}`);
  const edges: GraphEdge[] = [];
  for (let i = 1; i < n; i += 1) {
    for (let j = 0; j < i; j += 1)
      if (rand() < density) edges.push(edge(ids[i] as string, ids[j] as string));
  }
  return { ids, edges, rand };
}

describe('validateExecutionGraph (FR-008, FR-013)', () => {
  it('accepts a valid DAG, an empty graph and isolated units', () => {
    expect(() => validateExecutionGraph([], [])).not.toThrow();
    expect(() => validateExecutionGraph([unit('a'), unit('b')], [])).not.toThrow();
    expect(() =>
      validateExecutionGraph([unit('a'), unit('b'), unit('c')], [edge('c', 'a'), edge('c', 'b')]),
    ).not.toThrow();
  });

  const code = (fn: () => void): string | undefined => {
    try {
      fn();
    } catch (e) {
      return (e as PlanGraphError).code;
    }
    return undefined;
  };

  it.each([
    ['empty id', [unit('')], [], 'EMPTY_UNIT_ID'],
    ['duplicate unit', [unit('a'), unit('a')], [], 'DUPLICATE_UNIT'],
    ['unknown class', [{ id: 'a', executionUnitClass: 'NOPE' as never }], [], 'UNKNOWN_CLASS'],
    [
      'edge to a unit outside the plan (cross-plan reference)',
      [unit('a')],
      [edge('a', 'elsewhere')],
      'DANGLING_EDGE',
    ],
    ['edge from a unit outside the plan', [unit('a')], [edge('ghost', 'a')], 'DANGLING_EDGE'],
    ['self dependency', [unit('a')], [edge('a', 'a')], 'SELF_DEPENDENCY'],
    ['duplicate edge', [unit('a'), unit('b')], [edge('b', 'a'), edge('b', 'a')], 'DUPLICATE_EDGE'],
    ['two-node cycle', [unit('a'), unit('b')], [edge('a', 'b'), edge('b', 'a')], 'CYCLE'],
    [
      'three-node cycle behind a tail',
      [unit('t'), unit('a'), unit('b'), unit('c')],
      [edge('t', 'a'), edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
      'CYCLE',
    ],
  ])('refuses %s', (_name, units, edges, expected) => {
    expect(code(() => validateExecutionGraph(units as GraphUnit[], edges as GraphEdge[]))).toBe(
      expected,
    );
  });

  it('reports the cycle it found, in dependency order, closed on its first id', () => {
    try {
      validateExecutionGraph(
        [unit('a'), unit('b'), unit('c')],
        [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')],
      );
      expect.unreachable();
    } catch (e) {
      const cycle = (e as PlanGraphError).cycle as string[];
      expect(cycle[0]).toBe(cycle[cycle.length - 1]);
      expect(new Set(cycle).size).toBe(3);
    }
  });

  it('handles a 20 000-deep chain without recursion (no stack overflow) and detects a cycle closing it', () => {
    const n = 20_000;
    const units = Array.from({ length: n }, (_, i) => unit(`n${String(i)}`));
    const chain = Array.from({ length: n - 1 }, (_, i) =>
      edge(`n${String(i + 1)}`, `n${String(i)}`),
    );
    expect(() => validateExecutionGraph(units, chain)).not.toThrow();
    expect(
      code(() => validateExecutionGraph(units, [...chain, edge('n0', `n${String(n - 1)}`)])),
    ).toBe('CYCLE');
  });

  it('property: every random DAG validates; adding one back-edge that closes a path always creates a cycle', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const { ids, edges, rand } = randomDag(seed, 12, 0.25);
      const units = ids.map((id) => unit(id));
      expect(() => validateExecutionGraph(units, edges), `seed ${String(seed)}`).not.toThrow();
      if (edges.length === 0) continue;
      const picked = edges[Math.floor(rand() * edges.length)] as GraphEdge;
      // u depends on v already; making v depend on u closes a 2-cycle
      const closed = [...edges, edge(picked.dependsOnUnitId, picked.unitId)];
      expect(
        code(() => validateExecutionGraph(units, closed)),
        `seed ${String(seed)}`,
      ).toBe('CYCLE');
    }
  });
});

describe('topologicalOrder (predecessors first, deterministic)', () => {
  it('puts every predecessor before its dependents, for any random DAG', () => {
    for (let seed = 100; seed < 160; seed += 1) {
      const { ids, edges } = randomDag(seed, 15, 0.2);
      const order = topologicalOrder(
        ids.map((id) => unit(id)),
        edges,
      );
      expect(order).toHaveLength(ids.length);
      const position = new Map(order.map((id, i) => [id, i]));
      for (const e of edges) {
        expect(position.get(e.dependsOnUnitId) as number, `seed ${String(seed)}`).toBeLessThan(
          position.get(e.unitId) as number,
        );
      }
    }
  });

  it('is independent of input order (every replica and retry agrees)', () => {
    const { ids, edges, rand } = randomDag(7, 14, 0.3);
    const units = ids.map((id) => unit(id));
    const reference = topologicalOrder(units, edges);
    for (let k = 0; k < 20; k += 1) {
      const shuffledUnits = [...units].sort(() => rand() - 0.5);
      const shuffledEdges = [...edges].sort(() => rand() - 0.5);
      expect(topologicalOrder(shuffledUnits, shuffledEdges)).toEqual(reference);
    }
  });

  it('breaks ties by unit id', () => {
    expect(topologicalOrder([unit('b'), unit('c'), unit('a')], [])).toEqual(['a', 'b', 'c']);
  });

  it('throws on an invalid graph instead of returning a partial order', () => {
    expect(() =>
      topologicalOrder([unit('a'), unit('b')], [edge('a', 'b'), edge('b', 'a')]),
    ).toThrow(PlanGraphError);
  });
});

describe('FR-010 BLOCKED propagation (one level per finalization)', () => {
  // a <- b <- d ; a <- c <- d ; d is a fan-in of b and c
  const edges = [edge('b', 'a'), edge('c', 'a'), edge('d', 'b'), edge('d', 'c')];
  const statuses = (map: Record<string, ExecutionUnitStatus>) => (id: string) =>
    map[id] ?? 'PLANNED';

  it('a COMPLETED unit blocks nothing', () => {
    expect(dependentsToBlock('a', 'COMPLETED', edges, statuses({}))).toEqual([]);
  });

  it.each(['FAILED', 'CANCELLED', 'KILLED', 'REFUSED', 'BLOCKED'] as const)(
    'a %s unit blocks its DIRECT non-terminal dependents only, naming itself',
    (status) => {
      expect(dependentsToBlock('a', status, edges, statuses({}))).toEqual([
        { unitId: 'b', blockedByExecutionUnitId: 'a' },
        { unitId: 'c', blockedByExecutionUnitId: 'a' },
      ]);
    },
  );

  it('does not touch a dependent that is already terminal, so propagation is idempotent', () => {
    const blocked = dependentsToBlock(
      'a',
      'FAILED',
      edges,
      statuses({ b: 'BLOCKED', c: 'COMPLETED' }),
    );
    expect(blocked).toEqual([]);
  });

  it('refuses to propagate from a unit that is not finalized', () => {
    expect(() => dependentsToBlock('a', 'RUNNING', edges, statuses({}))).toThrow(RangeError);
  });

  it('repeated one-level application reaches exactly the transitive dependents', () => {
    for (let seed = 200; seed < 240; seed += 1) {
      const { ids, edges: dag } = randomDag(seed, 14, 0.2);
      const failed = ids[0] as string;
      // simulate the runtime: finalize, then finalize every newly blocked unit, until nothing changes
      const status = new Map<string, ExecutionUnitStatus>(ids.map((id) => [id, 'PLANNED']));
      status.set(failed, 'FAILED');
      const queue = [failed];
      const blockedBy = new Map<string, string>();
      while (queue.length > 0) {
        const current = queue.shift() as string;
        for (const b of dependentsToBlock(
          current,
          status.get(current) as ExecutionUnitStatus,
          dag,
          (id) => status.get(id) as ExecutionUnitStatus,
        )) {
          status.set(b.unitId, 'BLOCKED');
          blockedBy.set(b.unitId, b.blockedByExecutionUnitId);
          queue.push(b.unitId);
        }
      }
      const closure = transitiveBlocked(failed, dag);
      expect([...blockedBy.keys()].sort(), `seed ${String(seed)}`).toEqual(
        [...closure.keys()].sort(),
      );
      // every blocked unit names a predecessor that really is one of its direct predecessors
      for (const [dependent, by] of blockedBy) {
        expect(dag.some((e) => e.unitId === dependent && e.dependsOnUnitId === by)).toBe(true);
      }
    }
  });
});

describe('eligibility and status helpers', () => {
  it('a unit is eligible only when every predecessor is COMPLETED (never dispatched with an unsatisfied dependency)', () => {
    const edges = [edge('c', 'a'), edge('c', 'b')];
    const status = (map: Record<string, ExecutionUnitStatus>) => (id: string) =>
      map[id] ?? 'PLANNED';
    expect(isEligible('a', edges, status({}))).toBe(true);
    expect(isEligible('c', edges, status({ a: 'COMPLETED' }))).toBe(false);
    expect(isEligible('c', edges, status({ a: 'COMPLETED', b: 'COMPLETED' }))).toBe(true);
    expect(isEligible('c', edges, status({ a: 'COMPLETED', b: 'FAILED' }))).toBe(false);
  });

  it('classifies terminal statuses exactly (11 statuses; ADMITTED/DISPATCHED/RUNNING/PLANNED are live)', () => {
    expect(EXECUTION_UNIT_STATUSES).toHaveLength(11);
    const live = EXECUTION_UNIT_STATUSES.filter((s) => !isTerminalUnitStatus(s));
    expect([...live].sort()).toEqual(['ADMITTED', 'DISPATCHED', 'PLANNED', 'RUNNING']);
  });
});
