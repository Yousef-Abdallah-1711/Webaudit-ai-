/**
 * DEC-071 (owner Decision A): passive-unit completion, over real LOGIN roles. Positive and negative database tests for
 * `fahes_complete_passive_unit` and the narrowed `PLANNED -> COMPLETED` edge in `fahes_unit_guard`.
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb, TEST_DB_URL } from '../helpers/db.js';
import { completePassiveUnits } from '../../src/services/execution-runtime/passive-completion.js';
import { continueScanIfPlanTerminal } from '../../src/services/execution-runtime/plan-gate.js';

const suffix = randomBytes(4).toString('hex');
const password = randomBytes(16).toString('hex');
const roles = {
  api: { login: `zz_t_pc_api_${suffix}`, group: 'fahes_api', mayComplete: false },
  worker: { login: `zz_t_pc_worker_${suffix}`, group: 'fahes_worker_exec', mayComplete: false },
  host: { login: `zz_t_pc_host_${suffix}`, group: 'fahes_exec_host', mayComplete: false },
  orchestrator: { login: `zz_t_pc_orch_${suffix}`, group: 'fahes_orchestrator', mayComplete: true },
  // What the production worker login must be given for the barrier to run: worker_exec (legacy tables) + orchestrator.
  workerOrchestrator: {
    login: `zz_t_pc_wo_${suffix}`,
    group: 'fahes_worker_exec, fahes_orchestrator',
    mayComplete: true,
  },
  operator: { login: `zz_t_pc_op_${suffix}`, group: 'fahes_operator', mayComplete: false },
  nobody: { login: `zz_t_pc_none_${suffix}`, group: null, mayComplete: false },
} as const;
type RoleName = keyof typeof roles;
const clients = new Map<RoleName, PrismaClient>();

function clientFor(role: RoleName): PrismaClient {
  const c = clients.get(role);
  if (!c) throw new Error(`missing ${role} client`);
  return c;
}

let seq = 0;
const uid = (p: string): string => `${p}-${suffix}-${String(++seq)}`;

interface World {
  userId: string;
  scanId: string;
  planId: string;
}

async function makeWorld(
  o: {
    scanState?: 'RUNNING_PHASE_3' | 'CANCELLED';
    startedAt?: Date | null;
    deadlineMs?: number;
  } = {},
): Promise<World> {
  const user = await testDb.user.create({
    data: { email: `${uid('pc')}@example.com`, emailVerifiedAt: new Date() },
  });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: `https://${uid('t')}.example.com`,
      displayName: 'example.com',
    },
  });
  const scan = await testDb.scan.create({
    data: {
      userId: user.id,
      targetId: target.id,
      state: o.scanState ?? 'RUNNING_PHASE_3',
      requestedModules: ['SECURITY'],
      capabilitySnapshot: [],
      quotedCredits: 0,
      chargedCredits: 0,
      startedAt: o.startedAt === undefined ? new Date() : o.startedAt,
    },
  });
  const plan = await testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId: user.id,
      scanId: scan.id,
      state: 'RESOLVED',
      deadlineMs: o.deadlineMs ?? 900_000,
    },
  });
  return { userId: user.id, scanId: scan.id, planId: plan.id };
}

async function makeUnit(
  w: World,
  o: { cls?: string; domain?: string | null; id?: string; dependsOn?: string } = {},
): Promise<{ id: string; key: string }> {
  const id = o.id ?? uid('unit');
  const key = `${id}:1`;
  const cls = o.cls ?? 'PASSIVE_HTTP';
  const config = o.domain === null ? {} : { domain: o.domain ?? 'SECURITY' };
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,
       "timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status)
     VALUES ($1,$2,$3,'t',$4::"ExecutionUnitClass",'baseline.security',$5::jsonb,0,1000,'{}'::jsonb,$7,$6,'PLANNED')`,
    id,
    w.planId,
    w.userId,
    cls,
    JSON.stringify(config),
    key,
    cls === 'BROWSER',
  );
  if (o.dependsOn !== undefined) {
    await testDb.executionDependency.create({
      data: { executionUnitId: id, dependsOnExecutionUnitId: o.dependsOn },
    });
  }
  return { id, key };
}

const setModule = (
  w: World,
  state: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'DEGRADED' | 'FAILED' | 'NOT_APPLICABLE',
) =>
  testDb.moduleResult.upsert({
    where: { scanId_module: { scanId: w.scanId, module: 'SECURITY' } },
    create: { scanId: w.scanId, module: 'SECURITY', state },
    update: { state },
  });

const statusOf = async (id: string): Promise<string> =>
  (await testDb.executionUnit.findUniqueOrThrow({ where: { id } })).status;

const complete = (role: RoleName, unit: { id: string; key: string }) =>
  clientFor(role).$queryRawUnsafe<Array<{ r: { status: string; replayed: boolean } }>>(
    `SELECT public.fahes_complete_passive_unit($1, $2) AS r`,
    unit.id,
    unit.key,
  );

beforeAll(async () => {
  await resetDb();
  for (const { login, group } of Object.values(roles)) {
    await testDb.$executeRawUnsafe(
      `CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS${group ? ` IN ROLE ${group}` : ''}`,
    );
  }
  for (const role of Object.keys(roles) as RoleName[]) {
    const url = new URL(TEST_DB_URL);
    url.username = roles[role].login;
    url.password = password;
    clients.set(role, new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] }));
    await clientFor(role).$queryRaw`SELECT current_user`;
  }
}, 60_000);

afterAll(async () => {
  for (const client of clients.values()) await client.$disconnect();
  for (const { login } of Object.values(roles)) {
    await testDb.$executeRawUnsafe(`DROP OWNED BY ${login}`);
    await testDb.$executeRawUnsafe(`DROP ROLE IF EXISTS ${login}`);
  }
  await closeDb();
});

describe('who may complete a passive unit', () => {
  for (const [name, role] of Object.entries(roles) as Array<[RoleName, (typeof roles)[RoleName]]>) {
    it(`${name} ${role.mayComplete ? 'can' : 'cannot'} execute fahes_complete_passive_unit`, async () => {
      const rows = await clientFor(name).$queryRaw<Array<{ allowed: boolean }>>`
        SELECT has_function_privilege(current_user, to_regprocedure('public.fahes_complete_passive_unit(text,text)'), 'EXECUTE') AS allowed`;
      expect(rows[0]?.allowed).toBe(role.mayComplete);
    });
  }
});

describe('fahes_complete_passive_unit (orchestrator login)', () => {
  it('completes a passive unit once its module result is COMPLETE, recording the reason, and replays idempotently', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await setModule(w, 'COMPLETE');
    const first = await complete('orchestrator', u);
    expect(first[0]?.r).toEqual({ status: 'COMPLETED', replayed: false });
    const row = await testDb.executionUnit.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.status).toBe('COMPLETED');
    expect(row.terminalReason).toBe('PASSIVE_COMPLETED_BY_ORCHESTRATOR');
    expect(row.completedAt).not.toBeNull();
    const again = await complete('orchestrator', u);
    expect(again[0]?.r).toEqual({ status: 'COMPLETED', replayed: true });
  });

  it('accepts a DEGRADED module result as complete', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await setModule(w, 'DEGRADED');
    expect((await complete('orchestrator', u))[0]?.r.status).toBe('COMPLETED');
  });

  it('refuses (never completes) the unit when its module FAILED or was NOT_APPLICABLE', async () => {
    for (const state of ['FAILED', 'NOT_APPLICABLE'] as const) {
      const w = await makeWorld();
      const u = await makeUnit(w);
      await setModule(w, state);
      expect((await complete('orchestrator', u))[0]?.r.status).toBe('REFUSED');
      const row = await testDb.executionUnit.findUniqueOrThrow({ where: { id: u.id } });
      expect(row.terminalReason).toBe(`PASSIVE_MODULE_${state}`);
    }
  });

  it('does not complete while the module is PENDING/RUNNING or has no result row', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await expect(complete('orchestrator', u)).rejects.toThrow(/passive_module_not_terminal/);
    await setModule(w, 'PENDING');
    await expect(complete('orchestrator', u)).rejects.toThrow(/passive_module_not_terminal/);
    await setModule(w, 'RUNNING');
    await expect(complete('orchestrator', u)).rejects.toThrow(/passive_module_not_terminal/);
    expect(await statusOf(u.id)).toBe('PLANNED');
  });

  it('does not complete while a dependency is not COMPLETED', async () => {
    const w = await makeWorld();
    const first = await makeUnit(w);
    const second = await makeUnit(w, { dependsOn: first.id });
    await setModule(w, 'COMPLETE');
    await expect(complete('orchestrator', second)).rejects.toThrow(/passive_prerequisite_unmet/);
    expect(await statusOf(second.id)).toBe('PLANNED');
    expect((await complete('orchestrator', first))[0]?.r.status).toBe('COMPLETED');
    expect((await complete('orchestrator', second))[0]?.r.status).toBe('COMPLETED');
  });

  it('refuses a non-passive unit, a stale idempotency key and a unit without a domain', async () => {
    const w = await makeWorld();
    await setModule(w, 'COMPLETE');
    const browser = await makeUnit(w, { cls: 'BROWSER' });
    await expect(complete('orchestrator', browser)).rejects.toThrow(/passive_unit_not_completable/);
    const stale = await makeUnit(w);
    await expect(complete('orchestrator', { id: stale.id, key: 'stale' })).rejects.toThrow(
      /passive_stale_idempotency_key/,
    );
    const noDomain = await makeUnit(w, { domain: null });
    await expect(complete('orchestrator', noDomain)).rejects.toThrow(/passive_unit_without_domain/);
    for (const u of [browser, stale, noDomain]) expect(await statusOf(u.id)).toBe('PLANNED');
  });

  it('does not complete after cancellation, before the scan has started, or past the database-clock deadline', async () => {
    const cancelled = await makeWorld({ scanState: 'CANCELLED' });
    const notStarted = await makeWorld({ startedAt: null });
    const expired = await makeWorld({
      startedAt: new Date(Date.now() - 3_600_000),
      deadlineMs: 1_000,
    });
    for (const w of [cancelled, notStarted, expired]) {
      const u = await makeUnit(w);
      await setModule(w, 'COMPLETE');
      await expect(complete('orchestrator', u)).rejects.toThrow(/passive_scan_not_running/);
      expect(await statusOf(u.id)).toBe('PLANNED');
    }
  });

  it('is denied to every other runtime role', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await setModule(w, 'COMPLETE');
    for (const role of ['api', 'worker', 'host', 'operator', 'nobody'] as const) {
      await expect(complete(role, u)).rejects.toThrow(/permission denied|42501/i);
    }
    expect(await statusOf(u.id)).toBe('PLANNED');
  });
});

describe('the PLANNED -> COMPLETED edge cannot be forged', () => {
  it('rejects a direct COMPLETED write by every runtime login, even with the flag set by the caller', async () => {
    const w = await makeWorld();
    await setModule(w, 'COMPLETE');
    for (const role of ['orchestrator', 'workerOrchestrator', 'host', 'api', 'worker'] as const) {
      const u = await makeUnit(w);
      await expect(
        clientFor(role).$transaction(async (tx) => {
          await tx.$executeRawUnsafe(`SELECT set_config('fahes.passive_completion', 'on', true)`);
          await tx.$executeRawUnsafe(
            `UPDATE "ExecutionUnit" SET status='COMPLETED' WHERE id=$1`,
            u.id,
          );
        }),
      ).rejects.toThrow();
      expect(await statusOf(u.id)).toBe('PLANNED');
    }
  });

  it('keeps PLANNED -> COMPLETED closed for a passive class without the flag, and for a non-passive class with it', async () => {
    const w = await makeWorld();
    const passive = await makeUnit(w);
    await expect(
      testDb.$executeRawUnsafe(
        `UPDATE "ExecutionUnit" SET status='COMPLETED' WHERE id=$1`,
        passive.id,
      ),
    ).rejects.toThrow(/invalid_transition/);
    const browser = await makeUnit(w, { cls: 'BROWSER' });
    await expect(
      testDb.$transaction(async (tx) => {
        await tx.$executeRawUnsafe(`SELECT set_config('fahes.passive_completion', 'on', true)`);
        await tx.$executeRawUnsafe(
          `UPDATE "ExecutionUnit" SET status='COMPLETED' WHERE id=$1`,
          browser.id,
        );
      }),
    ).rejects.toThrow(/invalid_transition/);
    expect(await statusOf(passive.id)).toBe('PLANNED');
    expect(await statusOf(browser.id)).toBe('PLANNED');
  });
});

describe('completePassiveUnits (TypeScript face)', () => {
  it('completes what is ready, leaves the rest deferred, and touches nothing outside the plan', async () => {
    const ready = await makeWorld();
    const other = await makeWorld();
    const a = await makeUnit(ready);
    const b = await makeUnit(other);
    await setModule(ready, 'COMPLETE');
    const orchestratorDb = clientFor('orchestrator') as unknown as Parameters<
      typeof completePassiveUnits
    >[0];
    const result = await completePassiveUnits(orchestratorDb, ready.planId);
    expect(result).toEqual({ completed: [a.id], refused: [], deferred: [] });
    expect(await statusOf(b.id)).toBe('PLANNED');
    const none = await completePassiveUnits(orchestratorDb, other.planId);
    expect(none.deferred).toEqual([b.id]);
  });
});

// The barrier's own reads of Scan/ModuleResult run on the superuser fixture client here: no runtime login has legacy-table
// grants in this database (finding G-4, V01). Only the new privileged operation, the completion, runs on the real login.
describe('plan-unit barrier with orchestrator-owned passive completion (completion on a real login)', () => {
  const asDb = (role: RoleName) =>
    clientFor(role) as unknown as Parameters<typeof continueScanIfPlanTerminal>[0];

  function gateDeps(scanId: string, enqueued: string[], withCompletion: boolean) {
    return {
      claimContinuation: async () =>
        (
          await testDb.scan.updateMany({
            where: { id: scanId, state: 'RUNNING_PHASE_3' },
            data: { state: 'RUNNING_MASTER' },
          })
        ).count === 1,
      enqueueMaster: () => {
        enqueued.push(scanId);
        return Promise.resolve();
      },
      ...(withCompletion
        ? {
            completePassiveUnits: (planId: string) =>
              completePassiveUnits(asDb('workerOrchestrator'), planId),
          }
        : {}),
    };
  }

  it('stays not-ready without the orchestrator hook, then continues exactly once with it', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await setModule(w, 'COMPLETE');
    const enqueued: string[] = [];
    expect(
      await continueScanIfPlanTerminal(testDb, w.scanId, gateDeps(w.scanId, enqueued, false)),
    ).toBe('not-ready');
    expect(await statusOf(u.id)).toBe('PLANNED');

    expect(
      await continueScanIfPlanTerminal(testDb, w.scanId, gateDeps(w.scanId, enqueued, true)),
    ).toBe('continued');
    expect(await statusOf(u.id)).toBe('COMPLETED');
    expect(enqueued).toEqual([w.scanId]);
    // a duplicate barrier call (worker restart, redelivery) neither re-enqueues nor re-completes
    expect(
      await continueScanIfPlanTerminal(testDb, w.scanId, gateDeps(w.scanId, enqueued, true)),
    ).toBe('not-ready');
    expect(enqueued).toHaveLength(1);
  });

  it('does not continue while the module is still running', async () => {
    const w = await makeWorld();
    const u = await makeUnit(w);
    await setModule(w, 'RUNNING');
    const enqueued: string[] = [];
    expect(
      await continueScanIfPlanTerminal(testDb, w.scanId, gateDeps(w.scanId, enqueued, true)),
    ).toBe('not-ready');
    expect(await statusOf(u.id)).toBe('PLANNED');
    expect(enqueued).toEqual([]);
  });
});
