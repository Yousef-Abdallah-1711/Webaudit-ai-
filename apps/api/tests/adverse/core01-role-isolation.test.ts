/**
 * SPEC 009 CORE-01 privilege matrix. These checks use real LOGIN roles over
 * TCP; a superuser session ignores grants and cannot establish the boundary.
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb, TEST_DB_URL } from '../helpers/db.js';

const suffix = randomBytes(4).toString('hex');
const password = randomBytes(16).toString('hex');
const roles = {
  api: { login: `zz_t_009_api_${suffix}`, group: 'fahes_api', mayFinalize: false },
  worker: { login: `zz_t_009_worker_${suffix}`, group: 'fahes_worker_exec', mayFinalize: false },
  host: { login: `zz_t_009_host_${suffix}`, group: 'fahes_exec_host', mayFinalize: true },
  orchestrator: {
    login: `zz_t_009_orch_${suffix}`,
    group: 'fahes_orchestrator',
    mayFinalize: true,
  },
  operator: { login: `zz_t_009_operator_${suffix}`, group: 'fahes_operator', mayFinalize: false },
  nobody: { login: `zz_t_009_nobody_${suffix}`, group: null, mayFinalize: false },
} as const;

type RoleName = keyof typeof roles;
const clients = new Map<RoleName, PrismaClient>();

function databaseUrl(login: string): string {
  const url = new URL(TEST_DB_URL);
  url.username = login;
  url.password = password;
  return url.toString();
}

function clientFor(role: RoleName): PrismaClient {
  const client = clients.get(role);
  if (!client) throw new Error(`missing ${role} login client`);
  return client;
}

async function hasFinalizePrivilege(client: PrismaClient): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_function_privilege(current_user, p.oid, 'EXECUTE') AS allowed
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fahes_finalize_unit'
  `;
  expect(rows).toHaveLength(1);
  return rows[0]!.allowed;
}

async function hasStatusUpdatePrivilege(client: PrismaClient): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_column_privilege(current_user, c.oid, 'status', 'UPDATE') AS allowed
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ExecutionUnit'
  `;
  expect(rows).toHaveLength(1);
  return rows[0]!.allowed;
}

async function unitIdForDirectWrite(): Promise<string> {
  const user = await testDb.user.create({
    data: { email: `core01-role-${suffix}@example.com`, emailVerifiedAt: new Date() },
  });
  const plan = await testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId: user.id,
      scanId: `core01-role-scan-${suffix}`,
      state: 'RESOLVED',
      deadlineMs: 1_000_000,
    },
  });
  const id = `core01-role-unit-${suffix}`;
  await testDb.$executeRawUnsafe(
    `INSERT INTO "ExecutionUnit" (id,"scanPlanId","userId","targetId","executionUnitClass","engineId",configuration,priority,
       "timeoutPolicyMs","retryPolicy","requiresSafetyCheckpoint","idempotencyKey",status)
     VALUES ($1,$2,$3,'target',$4::"ExecutionUnitClass",'engine.test','{}'::jsonb,0,1000,'{}'::jsonb,true,$5,'PLANNED')`,
    id,
    plan.id,
    user.id,
    'BROWSER',
    `${id}:1`,
  );
  return id;
}

async function callFinalize(client: PrismaClient): Promise<unknown> {
  return client.$queryRawUnsafe(
    `SELECT public.fahes_finalize_unit('missing-unit', 'key', 'REFUSED', NULL, NULL, NULL)`,
  );
}

beforeAll(async () => {
  await resetDb();
  for (const { login, group } of Object.values(roles)) {
    await testDb.$executeRawUnsafe(
      `CREATE ROLE ${login} LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS${group ? ` IN ROLE ${group}` : ''}`,
    );
  }
  for (const role of Object.keys(roles) as RoleName[]) {
    clients.set(
      role,
      new PrismaClient({ datasources: { db: { url: databaseUrl(roles[role].login) } }, log: [] }),
    );
  }
  for (const role of Object.keys(roles) as RoleName[]) {
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

describe('fahes_finalize_unit is callable only by the execution host and orchestrator', () => {
  for (const [roleName, role] of Object.entries(roles) as Array<
    [RoleName, (typeof roles)[RoleName]]
  >) {
    it(`${roleName} ${role.mayFinalize ? 'can' : 'cannot'} finalize`, async () => {
      const client = clientFor(roleName);
      expect(await hasFinalizePrivilege(client)).toBe(role.mayFinalize);

      if (role.mayFinalize) {
        await expect(callFinalize(client)).rejects.toThrow(/unit_not_found/i);
      } else {
        await expect(callFinalize(client)).rejects.toThrow(/permission denied|42501/i);
      }
    });
  }
});

describe('terminal status writes remain guarded even for the execution host', () => {
  it('grants status-column updates only to the host, then rejects a direct terminal write', async () => {
    for (const role of Object.keys(roles) as RoleName[]) {
      expect(await hasStatusUpdatePrivilege(clientFor(role))).toBe(role === 'host');
    }

    const unitId = await unitIdForDirectWrite();
    await expect(
      clientFor('host').$executeRawUnsafe(
        `UPDATE "ExecutionUnit" SET status = 'REFUSED'::"ExecutionUnitStatus" WHERE id = $1`,
        unitId,
      ),
    ).rejects.toThrow(/terminal_write_forbidden|42501/i);
  });
});
