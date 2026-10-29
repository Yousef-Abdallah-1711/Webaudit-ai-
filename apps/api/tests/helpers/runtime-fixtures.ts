/**
 * Fixtures for the SPEC 009 runtime suites: a world with a grant, a scan, a RESOLVED plan and hand-built units/edges,
 * so each test controls the exact state it needs (the resolver has its own suite). All against real PostgreSQL.
 */

import { testDb } from './db.js';
import { makeWorld, type SafetyWorld } from './safety-fixtures.js';

let seq = 0;
export const uid = (p: string): string =>
  `${p}-${String(++seq)}-${Math.random().toString(36).slice(2, 8)}`;

const CHECKPOINT = [
  'BROWSER',
  'CRAWLER',
  'SOURCE_EXECUTION',
  'ACTIVE_SECURITY',
  'AUTHENTICATED_WORKFLOW',
  'LOAD_CAPACITY',
];

export interface RuntimeWorld extends SafetyWorld {
  scanId: string;
  planId: string;
}

export interface WorldOptions {
  scanState?: string;
  /** Milliseconds before now that the scan started; null leaves `startedAt` unset. */
  startedAgoMs?: number | null;
  deadlineMs?: number;
  durationBudget?: number;
  planKind?: 'INITIAL' | 'REVERIFY';
}

export async function makeRuntimeWorld(o: WorldOptions = {}): Promise<RuntimeWorld> {
  const world = await makeWorld(`${uid('rt')}@example.com`, {
    durationBudget: o.durationBudget ?? 86_400,
  });
  const startedAgo = o.startedAgoMs === undefined ? 1_000 : o.startedAgoMs;
  const scan = await testDb.scan.create({
    data: {
      userId: world.userId,
      targetId: world.targetId,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 10,
      chargedCredits: 10,
      state: (o.scanState ?? 'RUNNING_PHASE_1') as never,
      ...(startedAgo === null ? {} : { startedAt: new Date(Date.now() - startedAgo) }),
    },
  });
  const plan = await testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId: world.userId,
      scanId: scan.id,
      state: 'RESOLVED',
      deadlineMs: o.deadlineMs ?? 3_600_000,
    },
  });
  return { ...world, scanId: scan.id, planId: plan.id };
}

export interface UnitSpec {
  status?: string;
  cls?: string;
  failureClass?: string | null;
  timeoutPolicyMs?: number;
  grant?: string | null;
  attempt?: number;
  configuration?: unknown;
  engineId?: string;
}

export async function makeUnit(
  w: RuntimeWorld,
  o: UnitSpec = {},
): Promise<{ id: string; key: string; attempt: number }> {
  const id = uid('unit');
  const cls = o.cls ?? 'BROWSER';
  const checkpoint = CHECKPOINT.includes(cls);
  const attempt = o.attempt ?? 1;
  const grant = o.grant === undefined ? (checkpoint ? w.grantId : null) : o.grant;
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","targetAuthorizationId","executionUnitClass","engineId",configuration,priority,
       "timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status,"failureClass",attempt)
     VALUES ($1,$2,$3,$4,$5,$6::"ExecutionUnitClass",$13,$14::jsonb,0,$7,'{}'::jsonb,$8,$9,$10::"ExecutionUnitStatus",$11::"FailureClass",$12)`,
    id,
    w.planId,
    w.userId,
    w.targetId,
    grant,
    cls,
    o.timeoutPolicyMs ?? 60_000,
    checkpoint,
    `${id}:${String(attempt)}`,
    o.status ?? 'PLANNED',
    o.failureClass ?? null,
    attempt,
    o.engineId ?? 'engine.x',
    JSON.stringify(o.configuration ?? {}),
  );
  return { id, key: `${id}:${String(attempt)}`, attempt };
}

export async function addEdge(unit: string, dependsOn: string): Promise<void> {
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionDependency"(id,"executionUnitId","dependsOnExecutionUnitId") VALUES ($1,$2,$3)`,
    uid('e'),
    unit,
    dependsOn,
  );
}

export async function statusOf(id: string): Promise<string> {
  const r = await testDb.$queryRawUnsafe<Array<{ status: string }>>(
    `SELECT status::text AS status FROM "ExecutionUnit" WHERE id=$1`,
    id,
  );
  return r[0]!.status;
}

export async function reasonOf(id: string): Promise<{
  status: string;
  terminalReason: string | null;
  failureClass: string | null;
  blockedBy: string | null;
}> {
  const r = await testDb.$queryRawUnsafe<
    Array<{
      status: string;
      terminalReason: string | null;
      failureClass: string | null;
      blockedBy: string | null;
    }>
  >(
    `SELECT status::text AS status, "terminalReason", "failureClass"::text AS "failureClass", "blockedByExecutionUnitId" AS "blockedBy" FROM "ExecutionUnit" WHERE id=$1`,
    id,
  );
  return r[0]!;
}

export async function setScan(scanId: string, data: Record<string, unknown>): Promise<void> {
  await testDb.scan.update({ where: { id: scanId }, data: data as never });
}
