/**
 * SPEC 009 (Context A — Scan Planning) — the pure ExecutionGraph rules.
 *
 * No database, no clock, no I/O: these are the deterministic graph functions the Plan
 * Resolver and the runtime both call (spec FR-005 "pure, deterministic"; FR-046 no AI).
 *
 *  - FR-008  the graph is an explicit DAG of units with declared dependencies;
 *  - FR-013  an edge only ever references a unit of the *same* plan; acyclicity is enforced
 *            at resolution time, by this module, before any row is written
 *            (`data-model.md`: "service-enforced, not DB-CHECK-enforced");
 *  - FR-010  a unit that depends on a non-`COMPLETED` predecessor is `BLOCKED`, naming it.
 *            Propagation is **one level per finalization** (`runtime-finalization-contract.md`
 *            step 5): `dependentsToBlock` answers for one finalized unit; repeated application
 *            reaches every downstream unit.
 *
 * Unit statuses are mirrored locally (they equal `ExecutionUnitStatus` in `data-model.md`)
 * because the Prisma enum does not exist yet — the schema migration is blocked (CORE-01).
 */

export const EXECUTION_UNIT_CLASSES = [
  'PASSIVE_HTTP',
  'SOURCE_STATIC',
  'BROWSER',
  'CRAWLER',
  'SOURCE_EXECUTION',
  'ACTIVE_SECURITY',
  'AUTHENTICATED_WORKFLOW',
  'LOAD_CAPACITY',
  'TELEMETRY',
] as const;
export type ExecutionUnitClass = (typeof EXECUTION_UNIT_CLASSES)[number];

/** Passive units (scan-deadline-contract "Definitions"): never need a `TargetAuthorization`. */
const PASSIVE_CLASSES: ReadonlySet<ExecutionUnitClass> = new Set([
  'PASSIVE_HTTP',
  'SOURCE_STATIC',
  'TELEMETRY',
]);

export function isPassiveClass(unitClass: ExecutionUnitClass): boolean {
  return PASSIVE_CLASSES.has(unitClass);
}

export const EXECUTION_UNIT_STATUSES = [
  'PLANNED',
  'SKIPPED',
  'BLOCKED',
  'ADMITTED',
  'REFUSED',
  'DISPATCHED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'KILLED',
] as const;
export type ExecutionUnitStatus = (typeof EXECUTION_UNIT_STATUSES)[number];

/** Terminal statuses: no transition leaves them (deadline contract, boundary rule 6). */
const TERMINAL_STATUSES: ReadonlySet<ExecutionUnitStatus> = new Set([
  'SKIPPED',
  'BLOCKED',
  'REFUSED',
  'COMPLETED',
  'FAILED',
  'CANCELLED',
  'KILLED',
]);

export function isTerminalUnitStatus(status: ExecutionUnitStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

/** The graph-shape facts every function here needs; richer unit fields live on the callers' types. */
export interface GraphUnit {
  readonly id: string;
  readonly executionUnitClass: ExecutionUnitClass;
}

/** `unitId` depends on `dependsOnUnitId` (`ExecutionDependency.executionUnitId -> dependsOnExecutionUnitId`). */
export interface GraphEdge {
  readonly unitId: string;
  readonly dependsOnUnitId: string;
}

export type PlanGraphErrorCode =
  | 'EMPTY_UNIT_ID'
  | 'DUPLICATE_UNIT'
  | 'UNKNOWN_CLASS'
  | 'DANGLING_EDGE'
  | 'SELF_DEPENDENCY'
  | 'DUPLICATE_EDGE'
  | 'CYCLE';

/** Surfaces as `refusalReason: "cyclic dependency graph"` etc. — a this-spec-internal defect class. */
export class PlanGraphError extends Error {
  constructor(
    readonly code: PlanGraphErrorCode,
    message: string,
    /** For `CYCLE`: one cycle, in dependency order, first id repeated at the end. */
    readonly cycle?: readonly string[],
  ) {
    super(message);
    this.name = 'PlanGraphError';
  }
}

const CLASS_SET: ReadonlySet<string> = new Set(EXECUTION_UNIT_CLASSES);

/**
 * Validates a graph before anything is persisted. Throws `PlanGraphError`; never returns a
 * partially-valid graph. Deterministic: with several defects the first in input order wins.
 */
export function validateExecutionGraph(
  units: readonly GraphUnit[],
  edges: readonly GraphEdge[],
): void {
  const ids = new Set<string>();
  for (const unit of units) {
    if (typeof unit.id !== 'string' || unit.id === '') {
      throw new PlanGraphError('EMPTY_UNIT_ID', 'a unit has an empty id');
    }
    if (ids.has(unit.id)) throw new PlanGraphError('DUPLICATE_UNIT', `duplicate unit ${unit.id}`);
    if (!CLASS_SET.has(unit.executionUnitClass)) {
      throw new PlanGraphError('UNKNOWN_CLASS', `unit ${unit.id} has an unknown class`);
    }
    ids.add(unit.id);
  }

  const seenEdges = new Set<string>();
  for (const edge of edges) {
    // FR-013: only intra-plan edges exist; an id outside this graph is a cross-plan or invented reference.
    if (!ids.has(edge.unitId) || !ids.has(edge.dependsOnUnitId)) {
      throw new PlanGraphError(
        'DANGLING_EDGE',
        `edge ${edge.unitId} -> ${edge.dependsOnUnitId} references a unit outside this plan`,
      );
    }
    if (edge.unitId === edge.dependsOnUnitId) {
      throw new PlanGraphError('SELF_DEPENDENCY', `unit ${edge.unitId} depends on itself`);
    }
    const key = `${edge.unitId}\u0000${edge.dependsOnUnitId}`;
    if (seenEdges.has(key)) {
      throw new PlanGraphError(
        'DUPLICATE_EDGE',
        `duplicate edge ${edge.unitId} -> ${edge.dependsOnUnitId}`,
      );
    }
    seenEdges.add(key);
  }

  const cycle = findCycle(units, edges);
  if (cycle !== null) {
    throw new PlanGraphError('CYCLE', `cyclic dependency graph: ${cycle.join(' -> ')}`, cycle);
  }
}

/** Predecessors of each unit (units it depends on), in deterministic id order. */
export function predecessorsOf(edges: readonly GraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.unitId);
    if (list === undefined) map.set(edge.unitId, [edge.dependsOnUnitId]);
    else list.push(edge.dependsOnUnitId);
  }
  for (const list of map.values()) list.sort();
  return map;
}

/** Direct dependents of each unit, in deterministic id order. */
export function dependentsOf(edges: readonly GraphEdge[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const list = map.get(edge.dependsOnUnitId);
    if (list === undefined) map.set(edge.dependsOnUnitId, [edge.unitId]);
    else list.push(edge.unitId);
  }
  for (const list of map.values()) list.sort();
  return map;
}

/**
 * Iterative depth-first cycle search (no recursion: a hostile or buggy plan must not be able to
 * overflow the stack). Returns one cycle or `null`. Deterministic: nodes and neighbours in id order.
 */
function findCycle(units: readonly GraphUnit[], edges: readonly GraphEdge[]): string[] | null {
  const predecessors = predecessorsOf(edges);
  const ids = units.map((u) => u.id).sort();
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const colour = new Map<string, number>(ids.map((id) => [id, WHITE]));

  for (const root of ids) {
    if (colour.get(root) !== WHITE) continue;
    const path: string[] = [];
    const stack: Array<{ id: string; next: number }> = [{ id: root, next: 0 }];
    colour.set(root, GREY);
    path.push(root);
    while (stack.length > 0) {
      const frame = stack[stack.length - 1] as { id: string; next: number };
      const neighbours = predecessors.get(frame.id) ?? [];
      if (frame.next >= neighbours.length) {
        colour.set(frame.id, BLACK);
        stack.pop();
        path.pop();
        continue;
      }
      const to = neighbours[frame.next] as string;
      frame.next += 1;
      const state = colour.get(to);
      if (state === GREY) {
        const start = path.indexOf(to);
        return [...path.slice(start), to];
      }
      if (state === WHITE) {
        colour.set(to, GREY);
        path.push(to);
        stack.push({ id: to, next: 0 });
      }
    }
  }
  return null;
}

/**
 * Predecessors first. Deterministic (Kahn's algorithm, ties broken by unit id), so every replica and
 * every retry — including `expirePlanUnits`'s "topological order, predecessors first" — agrees.
 * Throws `PlanGraphError` if the graph is invalid.
 */
export function topologicalOrder(
  units: readonly GraphUnit[],
  edges: readonly GraphEdge[],
): string[] {
  validateExecutionGraph(units, edges);
  const predecessors = predecessorsOf(edges);
  const dependents = dependentsOf(edges);
  const remaining = new Map<string, number>(
    units.map((u) => [u.id, (predecessors.get(u.id) ?? []).length]),
  );
  const ready = units
    .filter((u) => remaining.get(u.id) === 0)
    .map((u) => u.id)
    .sort();
  const order: string[] = [];
  while (ready.length > 0) {
    const id = ready.shift() as string;
    order.push(id);
    for (const dependent of dependents.get(id) ?? []) {
      const left = (remaining.get(dependent) ?? 0) - 1;
      remaining.set(dependent, left);
      if (left === 0) {
        ready.push(dependent);
        ready.sort();
      }
    }
  }
  return order;
}

/** A unit blocked by a finalized predecessor (FR-010). */
export interface BlockedDependent {
  readonly unitId: string;
  readonly blockedByExecutionUnitId: string;
}

/**
 * FR-010 / finalization step 5 for ONE finalized unit: when `finalizedStatus` is not `COMPLETED`,
 * every *direct* dependent that is not yet terminal becomes `BLOCKED`, naming the finalized unit.
 * One level only — a dependent's own dependents are handled when that dependent's finalization to
 * `BLOCKED` runs this same rule. A `COMPLETED` unit blocks nothing. A dependent already terminal
 * (finalized earlier, e.g. by another failed predecessor) is left alone, which is also what makes
 * the whole propagation idempotent and order-independent in its *set* of blocked units.
 */
export function dependentsToBlock(
  finalizedUnitId: string,
  finalizedStatus: ExecutionUnitStatus,
  edges: readonly GraphEdge[],
  statusOf: (unitId: string) => ExecutionUnitStatus,
): BlockedDependent[] {
  if (!isTerminalUnitStatus(finalizedStatus)) {
    throw new RangeError(`unit ${finalizedUnitId} is not finalized (${finalizedStatus})`);
  }
  if (finalizedStatus === 'COMPLETED') return [];
  const direct = dependentsOf(edges).get(finalizedUnitId) ?? [];
  return direct
    .filter((id) => !isTerminalUnitStatus(statusOf(id)))
    .map((id) => ({ unitId: id, blockedByExecutionUnitId: finalizedUnitId }));
}

/**
 * Every unit that ends non-`COMPLETED` when `failedUnitId` fails, by repeated one-level application —
 * the closure the runtime reaches over several finalizations. Pure planning/test helper: it lets the
 * resolver and the tests assert the end state without running the runtime.
 */
export function transitiveBlocked(
  failedUnitId: string,
  edges: readonly GraphEdge[],
): Map<string, string> {
  const dependents = dependentsOf(edges);
  const blockedBy = new Map<string, string>();
  const queue: string[] = [failedUnitId];
  while (queue.length > 0) {
    const current = queue.shift() as string;
    for (const dependent of dependents.get(current) ?? []) {
      if (dependent === failedUnitId || blockedBy.has(dependent)) continue;
      blockedBy.set(dependent, current);
      queue.push(dependent);
    }
  }
  return blockedBy;
}

/**
 * A unit is *eligible* to leave `PLANNED` only when every predecessor is `COMPLETED`
 * (FR-008 serial dependencies; FR-010: never dispatched with an unsatisfied dependency).
 */
export function isEligible(
  unitId: string,
  edges: readonly GraphEdge[],
  statusOf: (unitId: string) => ExecutionUnitStatus,
): boolean {
  return (predecessorsOf(edges).get(unitId) ?? []).every((p) => statusOf(p) === 'COMPLETED');
}
