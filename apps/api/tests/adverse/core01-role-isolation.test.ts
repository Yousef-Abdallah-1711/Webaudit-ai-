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

async function hasTablePrivilege(
  client: PrismaClient,
  table: string,
  privilege: string,
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_table_privilege(current_user, format('%I.%I', 'public', ${table}), ${privilege}) AS allowed
  `;
  return rows[0]!.allowed;
}

async function hasColumnPrivilege(
  client: PrismaClient,
  table: string,
  column: string,
  privilege: string,
): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_column_privilege(current_user, format('%I.%I', 'public', ${table}), ${column}, ${privilege}) AS allowed
  `;
  return rows[0]!.allowed;
}

async function hasFunctionPrivilege(client: PrismaClient, signature: string): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT has_function_privilege(current_user, to_regprocedure(${`public.${signature}`}), 'EXECUTE') AS allowed
  `;
  return rows[0]!.allowed;
}

async function publicCanExecuteFunction(client: PrismaClient, signature: string): Promise<boolean> {
  const rows = await client.$queryRaw<Array<{ allowed: boolean }>>`
    SELECT EXISTS (
      SELECT 1
        FROM pg_proc p
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) acl
       WHERE p.oid = to_regprocedure(${`public.${signature}`})
         AND acl.grantee = 0
         AND acl.privilege_type = 'EXECUTE'
    ) AS allowed
  `;
  return rows[0]!.allowed;
}

async function unitIdForDirectWrite(): Promise<string> {
  const marker = randomBytes(4).toString('hex');
  const user = await testDb.user.create({
    data: { email: `core01-role-${suffix}-${marker}@example.com`, emailVerifiedAt: new Date() },
  });
  const plan = await testDb.scanPlan.create({
    data: {
      kind: 'INITIAL',
      userId: user.id,
      scanId: `core01-role-scan-${suffix}-${marker}`,
      state: 'RESOLVED',
      deadlineMs: 1_000_000,
    },
  });
  const id = `core01-role-unit-${suffix}-${marker}`;
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

describe('CORE-01 table and column grants use the intended runtime roles', () => {
  it('keeps raw lease secrets and F07 tables unreadable to every runtime login', async () => {
    for (const role of Object.keys(roles) as RoleName[]) {
      const client = clientFor(role);
      expect(await hasTablePrivilege(client, 'AdmissionLease', 'SELECT'), role).toBe(false);
      expect(await hasTablePrivilege(client, 'BudgetCounter', 'SELECT'), role).toBe(false);
      expect(await hasTablePrivilege(client, 'KillSwitchState', 'SELECT'), role).toBe(false);
    }
  });

  it('allows the API to create plans and units but not to mutate them', async () => {
    const api = clientFor('api');
    expect(await hasTablePrivilege(api, 'ScanPlan', 'SELECT')).toBe(true);
    expect(await hasTablePrivilege(api, 'ScanPlan', 'INSERT')).toBe(true);
    expect(await hasTablePrivilege(api, 'ExecutionUnit', 'INSERT')).toBe(true);
    expect(await hasTablePrivilege(api, 'ExecutionUnit', 'UPDATE')).toBe(false);
    expect(await hasColumnPrivilege(api, 'ExecutionUnit', 'status', 'UPDATE')).toBe(false);
    expect(await hasTablePrivilege(clientFor('worker'), 'ExecutionUnit', 'SELECT')).toBe(false);
    expect(await hasTablePrivilege(clientFor('nobody'), 'ExecutionUnit', 'SELECT')).toBe(false);
  });

  it('limits host writes to lifecycle columns and append-only execution records', async () => {
    const host = clientFor('host');
    expect(await hasTablePrivilege(host, 'ExecutionUnit', 'SELECT')).toBe(true);
    expect(await hasTablePrivilege(host, 'Scan', 'SELECT')).toBe(false);
    expect(await hasColumnPrivilege(host, 'Scan', 'id', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'Scan', 'state', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'Scan', 'startedAt', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'Scan', 'chargedCredits', 'SELECT')).toBe(false);
    expect(await hasColumnPrivilege(host, 'Target', 'userId', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'Target', 'canonicalValue', 'SELECT')).toBe(false);
    expect(await hasTablePrivilege(host, 'TargetAuthorization', 'SELECT')).toBe(true);
    expect(await hasTablePrivilege(host, 'ScopeDefinition', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'TargetEnvironment', 'classification', 'SELECT')).toBe(
      true,
    );
    expect(await hasColumnPrivilege(host, 'TargetEnvironment', 'id', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(host, 'ExecutionUnit', 'status', 'UPDATE')).toBe(true);
    expect(await hasColumnPrivilege(host, 'ExecutionUnit', 'progressSnapshot', 'UPDATE')).toBe(
      true,
    );
    expect(await hasColumnPrivilege(host, 'ExecutionUnit', 'configuration', 'UPDATE')).toBe(false);
    expect(await hasColumnPrivilege(host, 'ExecutionUnit', 'userId', 'UPDATE')).toBe(false);
    expect(await hasTablePrivilege(host, 'ExecutionUnit', 'INSERT')).toBe(false);
    expect(await hasTablePrivilege(host, 'ExecutionUnitHostClaim', 'INSERT')).toBe(true);
    expect(await hasTablePrivilege(host, 'ExecutionUnitHostClaim', 'UPDATE')).toBe(false);
    expect(await hasTablePrivilege(host, 'Evidence', 'INSERT')).toBe(true);
    expect(await hasTablePrivilege(host, 'Evidence', 'UPDATE')).toBe(false);
    expect(await hasTablePrivilege(host, 'Evidence', 'DELETE')).toBe(false);
    expect(await hasColumnPrivilege(host, 'EffectAuthorization', 'state', 'UPDATE')).toBe(true);
    expect(await hasColumnPrivilege(host, 'EffectAuthorization', 'userId', 'UPDATE')).toBe(false);
  });

  it('gives the orchestrator only the artifact cleanup/update path and keeps operator read-only', async () => {
    const orchestrator = clientFor('orchestrator');
    expect(await hasTablePrivilege(orchestrator, 'Artifact', 'DELETE')).toBe(true);
    expect(await hasTablePrivilege(orchestrator, 'Artifact', 'INSERT')).toBe(false);
    expect(await hasColumnPrivilege(orchestrator, 'Evidence', 'artifactId', 'UPDATE')).toBe(true);
    expect(await hasColumnPrivilege(orchestrator, 'Evidence', 'inlinePayload', 'UPDATE')).toBe(
      false,
    );

    const operator = clientFor('operator');
    expect(await hasTablePrivilege(operator, 'ExecutionUnit', 'SELECT')).toBe(true);
    expect(await hasTablePrivilege(operator, 'ExecutionUnit', 'UPDATE')).toBe(false);
    expect(await hasTablePrivilege(operator, 'Evidence', 'SELECT')).toBe(false);
  });
});

describe('SECURITY DEFINER entry points are granted narrowly', () => {
  it('does not leave a SECURITY DEFINER trigger helper executable by PUBLIC', async () => {
    expect(
      await publicCanExecuteFunction(clientFor('nobody'), 'fahes_dependency_same_plan()'),
    ).toBe(false);
  });

  it('keeps the cross-plan dependency trigger working for the API while rejecting a forged edge', async () => {
    const api = clientFor('api');
    const first = await unitIdForDirectWrite();
    const second = await unitIdForDirectWrite();

    await expect(
      api.executionDependency.create({
        data: {
          id: `core01-cross-plan-${suffix}`,
          executionUnitId: first,
          dependsOnExecutionUnitId: second,
        },
      }),
    ).rejects.toThrow(/dependency_cross_plan/i);
  });

  it('allows admission to API and host, but not a generic worker or operator', async () => {
    const signature = 'f07_admit(text,text,text,text,text,boolean,boolean,text)';
    expect(await hasFunctionPrivilege(clientFor('api'), signature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('host'), signature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('worker'), signature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('operator'), signature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('nobody'), signature)).toBe(false);
  });

  it('grants the host only the F07 read/audit helpers needed by the shared admission service', async () => {
    const budget = 'f07_budget_snapshot(text,text)';
    const audit =
      'f07_record_audit_ts("ExecutionAuditEventType",text,text,text,text,text,text,text,text,text,jsonb)';
    expect(await hasFunctionPrivilege(clientFor('host'), budget)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('host'), audit)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('worker'), budget)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('worker'), audit)).toBe(false);
  });

  it('allows lease liveness reads only through the host-owned narrow function', async () => {
    const signature = 'fahes_lock_live_lease(text)';
    expect(await hasFunctionPrivilege(clientFor('host'), signature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('api'), signature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('worker'), signature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('orchestrator'), signature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('operator'), signature)).toBe(false);
  });

  it('does not expose raw stop rows; only the scoped stop functions can be called', async () => {
    const stopSignature = 'f07_stop_pending(text,text,text,text,text)';
    const reasonSignature = 'fahes_pending_stop_reason(text,text,text,text,text)';
    expect(await hasFunctionPrivilege(clientFor('worker'), stopSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('api'), stopSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('host'), stopSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('operator'), stopSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('host'), reasonSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('orchestrator'), reasonSignature)).toBe(true);
    expect(await hasFunctionPrivilege(clientFor('api'), reasonSignature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('worker'), reasonSignature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('operator'), reasonSignature)).toBe(false);
    expect(await hasFunctionPrivilege(clientFor('nobody'), reasonSignature)).toBe(false);
  });
});
