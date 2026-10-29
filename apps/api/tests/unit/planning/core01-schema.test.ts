/**
 * SPEC 009 CORE-01 — database-enforced invariants, against the real isolated PostgreSQL.
 * Nothing here is mocked: the checks, triggers and `fahes_finalize_unit` run in the database.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import {
  admissionRequest,
  liveLeaseCount,
  makeWorld,
  counterOf,
} from '../../helpers/safety-fixtures.js';
import { requestAdmission } from '../../../src/services/safety/index.js';
import {
  EXECUTION_UNIT_STATUSES,
  isTerminalUnitStatus,
} from '../../../src/services/planning/index.js';

let seq = 0;
const uid = (p: string): string =>
  `${p}-${String(++seq)}-${Math.random().toString(36).slice(2, 8)}`;

async function makeUser(): Promise<string> {
  const u = await testDb.user.create({
    data: { email: `${uid('u')}@example.com`, emailVerifiedAt: new Date() },
  });
  return u.id;
}

async function makePlan(userId: string) {
  return testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId,
      scanId: uid('scan'),
      state: 'RESOLVED',
      deadlineMs: 1_000_000,
    },
  });
}

interface UnitOpts {
  status?: string;
  cls?: string;
  failureClass?: string | null;
  blockedBy?: string | null;
  skippedReason?: string | null;
  id?: string;
}

async function makeUnit(
  planId: string,
  userId: string,
  o: UnitOpts = {},
): Promise<{ id: string; key: string }> {
  const id = o.id ?? uid('unit');
  const key = `${id}:1`;
  const cls = o.cls ?? 'BROWSER';
  const checkpoint = [
    'BROWSER',
    'CRAWLER',
    'SOURCE_EXECUTION',
    'ACTIVE_SECURITY',
    'AUTHENTICATED_WORKFLOW',
    'LOAD_CAPACITY',
  ].includes(cls);
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,
       "timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status,"failureClass","blockedByExecutionUnitId","skippedReason")
     VALUES ($1,$2,$3,'t1',$4::"ExecutionUnitClass",'engine.x','{}'::jsonb,0,1000,'{}'::jsonb,$5,$6,$7::"ExecutionUnitStatus",
       $8::"FailureClass",$9,$10)`,
    id,
    planId,
    userId,
    cls,
    checkpoint,
    key,
    o.status ?? 'PLANNED',
    o.failureClass ?? null,
    o.blockedBy ?? null,
    o.skippedReason ?? null,
  );
  return { id, key };
}

async function statusOf(id: string): Promise<string> {
  const r = await testDb.$queryRawUnsafe<{ status: string }[]>(
    `SELECT status FROM "ExecutionUnit" WHERE id=$1`,
    id,
  );
  return r[0]!.status;
}

async function addEdge(unit: string, dependsOn: string): Promise<void> {
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionDependency"(id,"executionUnitId","dependsOnExecutionUnitId") VALUES ($1,$2,$3)`,
    uid('e'),
    unit,
    dependsOn,
  );
}

async function finalize(
  id: string,
  key: string,
  kind: string,
  fc: string | null = null,
  reason: string | null = null,
) {
  const r = await testDb.$queryRawUnsafe<
    { r: { status: string; replayed: boolean; outcomeMatches: boolean; blocked: string[] } }[]
  >(
    `SELECT public.fahes_finalize_unit($1,$2,$3,$4::"FailureClass",$5) AS r`,
    id,
    key,
    kind,
    fc,
    reason,
  );
  return r[0]!.r;
}

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe('ScanPlan invariants', () => {
  it('requires a bounded deadline iff RESOLVED, and a subject consistent with kind', async () => {
    const userId = await makeUser();
    const base = { userId, scanId: uid('s') };
    await expect(
      testDb.scanPlan.create({ data: { ...base, state: 'RESOLVED' } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.create({ data: { ...base, state: 'RESOLVED', deadlineMs: 0 } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.create({ data: { ...base, state: 'RESOLVED', deadlineMs: 21_600_001 } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.create({ data: { ...base, state: 'REFUSED', deadlineMs: 5 } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.create({ data: { userId, kind: 'INITIAL', state: 'REFUSED' } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.create({
        data: { userId, kind: 'REVERIFY', scanId: uid('s'), state: 'REFUSED' },
      }),
    ).rejects.toThrow();
    await testDb.scanPlan.create({ data: { ...base, state: 'RESOLVED', deadlineMs: 21_600_000 } });
    await testDb.scanPlan.create({
      data: { userId, scanId: uid('s'), state: 'REFUSED', refusalReason: 'x' },
    });
    await testDb.scanPlan.create({
      data: {
        userId,
        kind: 'REVERIFY',
        reverifyIssueId: uid('i'),
        state: 'RESOLVED',
        deadlineMs: 1,
      },
    });
  });

  it('allows exactly one initial plan per scan and never updates a plan', async () => {
    const userId = await makeUser();
    const scanId = uid('s');
    const plan = await testDb.scanPlan.create({
      data: { userId, scanId, state: 'RESOLVED', deadlineMs: 10 },
    });
    await expect(
      testDb.scanPlan.create({ data: { userId, scanId, state: 'REFUSED' } }),
    ).rejects.toThrow();
    await expect(
      testDb.scanPlan.update({ where: { id: plan.id }, data: { deadlineMs: 11 } }),
    ).rejects.toThrow(/immutable_row/);
  });
});

describe('ExecutionUnit shape', () => {
  it('computes requiresSafetyCheckpoint from the class, keeps passive units grant-free, ties failureClass to FAILED', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const insert = (
      cls: string,
      checkpoint: boolean,
      extra = '',
      status = 'PLANNED',
      fc: string | null = null,
    ) =>
      testDb.$executeRawUnsafe(
        `INSERT INTO "ExecutionUnit"(id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status,"failureClass"${extra ? ',"targetAuthorizationId"' : ''})
         VALUES ($1,$2,$3,'t',$4::"ExecutionUnitClass",'e','{}',0,1,'{}',$5,$6,$7::"ExecutionUnitStatus",$8::"FailureClass"${extra ? ",'grant'" : ''})`,
        uid('u'),
        plan.id,
        userId,
        cls,
        checkpoint,
        uid('k'),
        status,
        fc,
      );
    await expect(insert('BROWSER', false)).rejects.toThrow();
    await expect(insert('PASSIVE_HTTP', true)).rejects.toThrow();
    await expect(insert('PASSIVE_HTTP', false, 'grant')).rejects.toThrow();
    await expect(insert('PASSIVE_HTTP', false, '', 'FAILED')).rejects.toThrow();
    await expect(
      insert('PASSIVE_HTTP', false, '', 'FAILED', 'DETERMINISTIC_FINDING'),
    ).rejects.toThrow();
    await expect(insert('PASSIVE_HTTP', false, '', 'PLANNED', 'ENGINE_DEFECT')).rejects.toThrow();
    await insert('BROWSER', true, 'grant');
    await insert('PASSIVE_HTTP', false);
    await insert('PASSIVE_HTTP', false, '', 'FAILED', 'ENGINE_DEFECT');
  });

  it('rejects a duplicate idempotency key inside a plan', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const a = await makeUnit(plan.id, userId);
    await expect(
      testDb.$executeRawUnsafe(
        `INSERT INTO "ExecutionUnit"(id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,"timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey") VALUES ($1,$2,$3,'t','BROWSER','e','{}',0,1,'{}',true,$4)`,
        uid('u'),
        plan.id,
        userId,
        a.key,
      ),
    ).rejects.toThrow();
  });
});

describe('ExecutionUnit transition table (every ordered pair of the 11 statuses)', () => {
  const ALLOWED = new Set([
    'PLANNED>ADMITTED',
    'PLANNED>BLOCKED',
    'PLANNED>REFUSED',
    'PLANNED>COMPLETED:TELEMETRY',
    'ADMITTED>DISPATCHED',
    'ADMITTED>REFUSED',
    'DISPATCHED>RUNNING',
    'DISPATCHED>REFUSED',
    'RUNNING>COMPLETED',
    'RUNNING>FAILED',
    'RUNNING>CANCELLED',
    'RUNNING>KILLED',
  ]);

  async function attempt(from: string, to: string, cls: string): Promise<boolean> {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const fc = from === 'FAILED' ? 'ENGINE_DEFECT' : null;
    const blocker = from === 'BLOCKED' ? (await makeUnit(plan.id, userId)).id : null;
    const u = await makeUnit(plan.id, userId, {
      status: from,
      cls,
      failureClass: fc,
      blockedBy: blocker,
      skippedReason: from === 'SKIPPED' ? 'precondition' : null,
    });
    try {
      await testDb.$executeRawUnsafe(
        `UPDATE "ExecutionUnit" SET status=$2::"ExecutionUnitStatus","failureClass"=$3::"FailureClass","blockedByExecutionUnitId"=$4,"skippedReason"=$5 WHERE id=$1`,
        u.id,
        to,
        to === 'FAILED' ? 'ENGINE_DEFECT' : null,
        to === 'BLOCKED' ? 'someone' : null,
        to === 'SKIPPED' ? 'r' : null,
      );
      return (await statusOf(u.id)) === to;
    } catch {
      expect(await statusOf(u.id)).toBe(from);
      return false;
    }
  }

  it('permits exactly the documented edges and nothing else', async () => {
    const results: string[] = [];
    for (const from of EXECUTION_UNIT_STATUSES) {
      for (const to of EXECUTION_UNIT_STATUSES) {
        if (from === to) continue;
        const ok = await attempt(from, to, 'BROWSER');
        const expected = ALLOWED.has(`${from}>${to}`);
        if (ok !== expected)
          results.push(`${from}>${to}: got ${String(ok)} expected ${String(expected)}`);
      }
    }
    expect(results).toEqual([]);
  }, 180_000);

  it('lets only TELEMETRY complete straight from PLANNED', async () => {
    expect(await attempt('PLANNED', 'COMPLETED', 'TELEMETRY')).toBe(true);
    expect(await attempt('PLANNED', 'COMPLETED', 'PASSIVE_HTTP')).toBe(false);
  });

  it('agrees with the TypeScript terminal classification', () => {
    const terminalByTable = new Set<string>(
      EXECUTION_UNIT_STATUSES.filter((s) => ![...ALLOWED].some((e) => e.startsWith(`${s}>`))),
    );
    expect(new Set(EXECUTION_UNIT_STATUSES.filter(isTerminalUnitStatus))).toEqual(terminalByTable);
  });

  it('freezes identity columns and a terminal row, including progress (FR-027a)', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const u = await makeUnit(plan.id, userId, { status: 'RUNNING' });
    for (const col of [
      `"userId"='other'`,
      `"targetId"='other'`,
      `"engineId"='x', "idempotencyKey"='k2'`,
      `configuration='{"a":1}'`,
    ]) {
      await expect(
        testDb.$executeRawUnsafe(`UPDATE "ExecutionUnit" SET ${col} WHERE id=$1`, u.id),
      ).rejects.toThrow();
    }
    await testDb.$executeRawUnsafe(
      `UPDATE "ExecutionUnit" SET "progressSnapshot"='{"p":1}' WHERE id=$1`,
      u.id,
    );
    await finalize(u.id, u.key, 'COMPLETED');
    await expect(
      testDb.$executeRawUnsafe(
        `UPDATE "ExecutionUnit" SET "progressSnapshot"='{"p":2}' WHERE id=$1`,
        u.id,
      ),
    ).rejects.toThrow(/terminal/);
  });
});

describe('ExecutionDependency', () => {
  it('rejects self edges, cross-plan edges and edge updates; cascades with the unit', async () => {
    const userId = await makeUser();
    const p1 = await makePlan(userId);
    const p2 = await makePlan(userId);
    const a = await makeUnit(p1.id, userId);
    const b = await makeUnit(p1.id, userId);
    const c = await makeUnit(p2.id, userId);
    await expect(addEdge(a.id, a.id)).rejects.toThrow();
    await expect(addEdge(a.id, c.id)).rejects.toThrow(/cross_plan/);
    await addEdge(b.id, a.id);
    await expect(addEdge(b.id, a.id)).rejects.toThrow();
    await expect(
      testDb.$executeRawUnsafe(
        `UPDATE "ExecutionDependency" SET "dependsOnExecutionUnitId"=$1 WHERE "executionUnitId"=$2`,
        c.id,
        b.id,
      ),
    ).rejects.toThrow(/immutable_row/);
  });
});

describe('fahes_finalize_unit', () => {
  it('finalizes once, replays an identical call and never re-finalizes with a different outcome', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const u = await makeUnit(plan.id, userId, { status: 'RUNNING' });
    const first = await finalize(u.id, u.key, 'FAILED', 'TIMEOUT', 'SCAN_DEADLINE');
    expect(first).toMatchObject({ status: 'FAILED', replayed: false });
    expect(await finalize(u.id, u.key, 'FAILED', 'TIMEOUT')).toMatchObject({
      status: 'FAILED',
      replayed: true,
      outcomeMatches: true,
    });
    expect(await finalize(u.id, u.key, 'COMPLETED')).toMatchObject({
      status: 'FAILED',
      replayed: true,
      outcomeMatches: false,
    });
    const row = (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!;
    expect(row).toMatchObject({
      status: 'FAILED',
      failureClass: 'TIMEOUT',
      terminalReason: 'SCAN_DEADLINE',
    });
    expect(row.completedAt).not.toBeNull();
  });

  it('refuses a stale idempotency key, an unknown unit, bad arguments and illegal edges without changing anything', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const u = await makeUnit(plan.id, userId, { status: 'PLANNED' });
    await expect(finalize(u.id, 'stale', 'REFUSED')).rejects.toThrow(/stale_idempotency_key/);
    await expect(finalize('nope', 'k', 'REFUSED')).rejects.toThrow(/unit_not_found/);
    await expect(finalize(u.id, u.key, 'BOGUS')).rejects.toThrow(/invalid_kind/);
    await expect(finalize(u.id, u.key, 'FAILED')).rejects.toThrow(/invalid_failure_class/);
    await expect(finalize(u.id, u.key, 'COMPLETED', 'TIMEOUT')).rejects.toThrow(
      /invalid_failure_class/,
    );
    await expect(finalize(u.id, u.key, 'FAILED', 'DETERMINISTIC_FINDING')).rejects.toThrow(
      /invalid_failure_class/,
    );
    await expect(finalize(u.id, u.key, 'KILLED')).rejects.toThrow(/invalid_transition/);
    await expect(finalize(u.id, u.key, 'COMPLETED')).rejects.toThrow(/invalid_transition/);
    expect(await statusOf(u.id)).toBe('PLANNED');
    expect(await finalize(u.id, u.key, 'REFUSED', null, 'SCAN_DEADLINE_EXPIRED')).toMatchObject({
      status: 'REFUSED',
    });
  });

  it('blocks dependents transitively in the same transaction; COMPLETED blocks nothing; terminal dependents are left alone', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    // chain a -> b -> c, diamond a -> d, d -> e, b -> e ; f already COMPLETED depends on a
    const a = await makeUnit(plan.id, userId, { status: 'RUNNING' });
    const [b, c, d, e] = [
      await makeUnit(plan.id, userId),
      await makeUnit(plan.id, userId),
      await makeUnit(plan.id, userId),
      await makeUnit(plan.id, userId),
    ];
    const f = await makeUnit(plan.id, userId, { status: 'COMPLETED' });
    for (const [x, y] of [
      [b, a],
      [c, b],
      [d, a],
      [e, d],
      [e, b],
      [f, a],
    ] as const)
      await addEdge(x.id, y.id);
    const out = await finalize(a.id, a.key, 'FAILED', 'ENGINE_DEFECT');
    expect(new Set(out.blocked)).toEqual(new Set([b.id, c.id, d.id, e.id]));
    for (const x of [b, c, d, e]) expect(await statusOf(x.id)).toBe('BLOCKED');
    expect(await statusOf(f.id)).toBe('COMPLETED');
    const blockedBy = await testDb.executionUnit.findMany({
      where: { id: { in: [b.id, c.id, d.id, e.id] } },
      select: { id: true, blockedByExecutionUnitId: true },
    });
    expect(
      Object.fromEntries(blockedBy.map((r) => [r.id, r.blockedByExecutionUnitId])),
    ).toMatchObject({ [b.id]: a.id, [c.id]: b.id, [d.id]: a.id });
    expect([b.id, d.id]).toContain(blockedBy.find((r) => r.id === e.id)!.blockedByExecutionUnitId);

    const ok = await makeUnit(plan.id, userId, { status: 'RUNNING' });
    const dep = await makeUnit(plan.id, userId);
    await addEdge(dep.id, ok.id);
    expect((await finalize(ok.id, ok.key, 'COMPLETED')).blocked).toEqual([]);
    expect(await statusOf(dep.id)).toBe('PLANNED');
  });

  it('releases the F07 lease and abandons unconfirmed effect authorizations in the same transaction', async () => {
    const world = await makeWorld(`${uid('w')}@example.com`);
    const plan = await makePlan(world.userId);
    const u = await makeUnit(plan.id, world.userId, { status: 'RUNNING' });
    const granted = await requestAdmission(testDb, admissionRequest(world, { executionId: u.id }));
    expect(granted.outcome).toBe('GRANTED');
    expect(await liveLeaseCount(world.grantId)).toBe(1);
    await testDb.effectAuthorization.createMany({
      data: [
        { executionUnitId: u.id, attempt: 1, kind: 'REQUEST', ordinal: 1, userId: world.userId },
        {
          executionUnitId: u.id,
          attempt: 1,
          kind: 'REQUEST',
          ordinal: 2,
          userId: world.userId,
          state: 'AUTHORIZED',
        },
      ],
    });
    await testDb.effectAuthorization.update({
      where: {
        executionUnitId_attempt_kind_ordinal: {
          executionUnitId: u.id,
          attempt: 1,
          kind: 'REQUEST',
          ordinal: 1,
        },
      },
      data: { state: 'CONFIRMED', confirmedAt: new Date() },
    });
    await finalize(u.id, u.key, 'COMPLETED');
    expect(await liveLeaseCount(world.grantId)).toBe(0);
    expect((await counterOf(world.grantId))!.activeConcurrency).toBe(0);
    const states = await testDb.effectAuthorization.findMany({
      where: { executionUnitId: u.id },
      orderBy: { ordinal: 'asc' },
      select: { state: true },
    });
    expect(states.map((s) => s.state)).toEqual(['CONFIRMED', 'ABANDONED']);
  });

  it('is all-or-nothing: a failure after the lease release rolls the release back', async () => {
    const world = await makeWorld(`${uid('w')}@example.com`);
    const plan = await makePlan(world.userId);
    const u = await makeUnit(plan.id, world.userId, { status: 'RUNNING' });
    await requestAdmission(testDb, admissionRequest(world, { executionId: u.id }));
    // A RUNNING unit with a dependent whose CHECK cannot be satisfied makes the BLOCKED write fail: break it on purpose.
    const dep = await makeUnit(plan.id, world.userId);
    await addEdge(dep.id, u.id);
    await testDb.$executeRawUnsafe(
      `ALTER TABLE "ExecutionUnit" ADD CONSTRAINT "tmp_never" CHECK (status <> 'BLOCKED') NOT VALID`,
    );
    try {
      await expect(finalize(u.id, u.key, 'FAILED', 'ENGINE_DEFECT')).rejects.toThrow();
    } finally {
      await testDb.$executeRawUnsafe(`ALTER TABLE "ExecutionUnit" DROP CONSTRAINT "tmp_never"`);
    }
    expect(await statusOf(u.id)).toBe('RUNNING');
    expect(await statusOf(dep.id)).toBe('PLANNED');
    expect(await liveLeaseCount(world.grantId)).toBe(1);
    expect((await counterOf(world.grantId))!.activeConcurrency).toBe(1);
  });

  it('serializes concurrent finalizations: one wins, the other replays, the lease is released once', async () => {
    const world = await makeWorld(`${uid('w')}@example.com`);
    const plan = await makePlan(world.userId);
    const u = await makeUnit(plan.id, world.userId, { status: 'RUNNING' });
    await requestAdmission(testDb, admissionRequest(world, { executionId: u.id }));
    const outcomes = await Promise.all([
      finalize(u.id, u.key, 'COMPLETED'),
      finalize(u.id, u.key, 'FAILED', 'TIMEOUT'),
      finalize(u.id, u.key, 'KILLED', null, 'OPERATOR'),
      finalize(u.id, u.key, 'CANCELLED'),
    ]);
    expect(outcomes.filter((o) => !o.replayed)).toHaveLength(1);
    const final = outcomes.find((o) => !o.replayed)!.status;
    expect(outcomes.every((o) => o.status === final)).toBe(true);
    expect(await statusOf(u.id)).toBe(final);
    expect((await counterOf(world.grantId))!.activeConcurrency).toBe(0);
  });
});

describe('claims and effect ledger', () => {
  it('admits one claim per (unit, attempt), never updates it', async () => {
    const userId = await makeUser();
    const plan = await makePlan(userId);
    const u = await makeUnit(plan.id, userId);
    const claim = {
      executionUnitId: u.id,
      attempt: 1,
      scanPlanId: plan.id,
      userId,
      hostInstanceId: 'h1',
      claimTokenHash: 'a'.repeat(64),
    };
    const created = await testDb.executionUnitHostClaim.create({ data: claim });
    await expect(
      testDb.executionUnitHostClaim.create({ data: { ...claim, hostInstanceId: 'h2' } }),
    ).rejects.toThrow();
    await expect(
      testDb.executionUnitHostClaim.update({
        where: { id: created.id },
        data: { hostInstanceId: 'h2' },
      }),
    ).rejects.toThrow(/immutable_row/);
    await testDb.executionUnitHostClaim.create({ data: { ...claim, attempt: 2 } });
  });

  it('allows only AUTHORIZED -> CONFIRMED | ABANDONED', async () => {
    const userId = await makeUser();
    const base = { executionUnitId: uid('u'), attempt: 1, kind: 'PROVISION', userId };
    const e = await testDb.effectAuthorization.create({ data: { ...base, ordinal: 1 } });
    await expect(
      testDb.effectAuthorization.create({ data: { ...base, ordinal: 1 } }),
    ).rejects.toThrow();
    await expect(
      testDb.effectAuthorization.update({ where: { id: e.id }, data: { state: 'AUTHORIZED' } }),
    ).rejects.toThrow();
    await expect(
      testDb.effectAuthorization.update({
        where: { id: e.id },
        data: { kind: 'OTHER', state: 'CONFIRMED' },
      }),
    ).rejects.toThrow();
    await testDb.effectAuthorization.update({ where: { id: e.id }, data: { state: 'CONFIRMED' } });
    await expect(
      testDb.effectAuthorization.update({ where: { id: e.id }, data: { state: 'ABANDONED' } }),
    ).rejects.toThrow();
  });
});
