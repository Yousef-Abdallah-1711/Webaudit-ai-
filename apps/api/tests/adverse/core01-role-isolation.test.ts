/**
 * SPEC 009 CORE-01 privilege matrix. These checks use real LOGIN roles over
 * TCP; a superuser session ignores grants and cannot establish the boundary.
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Prisma, PrismaClient } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb, TEST_DB_URL } from '../helpers/db.js';
import { isAuthorized } from '../../src/services/authorization/check.js';
import {
  createEngineRegistry,
  createScanProfile,
  passiveBaselineRegistry,
  resolvePlan,
} from '../../src/services/planning/index.js';
import { makeWorld, WEB_DESTINATION } from '../helpers/safety-fixtures.js';

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

describe('API role can resolve an unchanged passive baseline plan', () => {
  it('reads tenant ownership and persists a passive plan through its real LOGIN connection', async () => {
    const marker = randomBytes(4).toString('hex');
    const user = await testDb.user.create({
      data: {
        email: `core01-api-plan-${suffix}-${marker}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: `https://plan-${marker}.example.com`,
        displayName: 'API plan role test',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 1,
        chargedCredits: 1,
        state: 'QUEUED',
      },
    });
    const api = clientFor('api');
    expect(await hasColumnPrivilege(api, 'Scan', 'id', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Scan', 'userId', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Scan', 'targetId', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Scan', 'chargedCredits', 'SELECT')).toBe(false);
    expect(await hasColumnPrivilege(api, 'Target', 'id', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Target', 'userId', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Target', 'canonicalValue', 'SELECT')).toBe(true);
    expect(await hasColumnPrivilege(api, 'Target', 'displayName', 'SELECT')).toBe(false);

    const result = await resolvePlan(
      {
        db: api as never,
        registry: passiveBaselineRegistry(),
        isAuthorized: (input) => isAuthorized(api as never, input),
      },
      { targetId: target.id, profile: { kind: 'CUSTOM', domains: ['SECURITY'] } },
      'INITIAL',
      new Date(),
      { scanId: scan.id },
    );

    expect(result.state).toBe('RESOLVED');
    if (result.state === 'RESOLVED') {
      expect(result.units).toHaveLength(1);
      expect(await api.scanPlan.findUnique({ where: { id: result.planId } })).toMatchObject({
        userId: user.id,
        scanId: scan.id,
        state: 'RESOLVED',
      });
    }
  });

  it('refuses a cross-tenant scan/target pairing through the real API LOGIN without persisting a plan', async () => {
    const marker = randomBytes(4).toString('hex');
    const owner = await testDb.user.create({
      data: {
        email: `core01-api-owner-${suffix}-${marker}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });
    const other = await testDb.user.create({
      data: {
        email: `core01-api-other-${suffix}-${marker}@example.com`,
        emailVerifiedAt: new Date(),
      },
    });
    const ownerTarget = await testDb.target.create({
      data: {
        userId: owner.id,
        inputType: 'URL',
        canonicalValue: `https://owner-${marker}.example.com`,
        displayName: 'API tenant boundary owner target',
      },
    });
    const otherTarget = await testDb.target.create({
      data: {
        userId: other.id,
        inputType: 'URL',
        canonicalValue: `https://other-${marker}.example.com`,
        displayName: 'API tenant boundary foreign target',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: owner.id,
        targetId: ownerTarget.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 1,
        chargedCredits: 1,
        state: 'QUEUED',
      },
    });
    const api = clientFor('api');

    const result = await resolvePlan(
      {
        db: api as never,
        registry: passiveBaselineRegistry(),
        isAuthorized: (input) => isAuthorized(api as never, input),
      },
      { targetId: otherTarget.id, profile: { kind: 'CUSTOM', domains: ['SECURITY'] } },
      'INITIAL',
      new Date(),
      { scanId: scan.id },
    );

    expect(result).toMatchObject({
      state: 'REFUSED',
      refusalReason: 'SCAN_NOT_FOUND',
      planId: null,
    });
    expect(await api.scanPlan.count({ where: { scanId: scan.id } })).toBe(0);
    expect(await api.executionUnit.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('runs the real F01 authorization query through its login without widening the generic worker role', async () => {
    const marker = randomBytes(4).toString('hex');
    const world = await makeWorld(`core01-api-f01-${suffix}-${marker}@example.com`, {
      classes: ['BROWSER'],
    });
    const api = clientFor('api');

    await expect(
      isAuthorized(api as never, {
        targetId: world.targetId,
        userId: world.userId,
        executionClass: 'BROWSER',
        destination: WEB_DESTINATION,
        now: new Date(),
      }),
    ).resolves.toMatchObject({ outcome: 'AUTHORIZED' });
    expect(await hasTablePrivilege(clientFor('worker'), 'TargetAuthorization', 'SELECT')).toBe(
      false,
    );
  });

  it('resolves an authorized non-passive plan through API grants and a deterministic test engine', async () => {
    const marker = randomBytes(4).toString('hex');
    const world = await makeWorld(`core01-api-active-${suffix}-${marker}@example.com`, {
      classes: ['BROWSER'],
    });
    const scan = await testDb.scan.create({
      data: {
        userId: world.userId,
        targetId: world.targetId,
        requestedModules: ['UI'],
        capabilitySnapshot: {},
        quotedCredits: 1,
        chargedCredits: 1,
        state: 'QUEUED',
      },
    });
    const profile = await createScanProfile(testDb as never, `api-role-${marker}`, {
      defaultDomains: ['UI'],
      domainExecutionClasses: { UI: ['BROWSER'] },
    });
    const api = clientFor('api');

    const result = await resolvePlan(
      {
        db: api as never,
        registry: createEngineRegistry([
          {
            domain: 'UI',
            unitClass: 'BROWSER',
            templates: [
              {
                key: 'api-role-browser',
                engineId: 'test.api-role-browser',
                executionUnitClass: 'BROWSER',
                timeoutPolicyMs: 60_000,
                hardStopMarginMs: 60_000,
                maxAttempts: 1,
                priority: 0,
              },
            ],
          },
        ]),
        isAuthorized: (input) => isAuthorized(api as never, input),
      },
      {
        targetId: world.targetId,
        profile: {
          kind: 'NAMED',
          scanProfileId: profile.scanProfileId,
          scanProfileVersion: profile.version.version,
        },
      },
      'INITIAL',
      new Date(),
      { scanId: scan.id },
    );

    expect(result.state).toBe('RESOLVED');
    if (result.state === 'RESOLVED') {
      expect(result.units[0]?.targetAuthorizationId).toBe(world.grantId);
      expect(await api.executionUnit.count({ where: { scanPlanId: result.planId } })).toBe(1);
    }
  });
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
  it('matches the exact table-level privilege matrix for every CORE-01 table and runtime role', async () => {
    const tableNames = [
      'ScanProfile',
      'ScanProfileVersion',
      'ScanPlan',
      'ExecutionUnit',
      'ExecutionDependency',
      'Evidence',
      'IssueEvidenceLink',
      'Artifact',
      'ExecutionUnitHostClaim',
      'EffectAuthorization',
    ] as const;
    const expected: Record<RoleName, Partial<Record<(typeof tableNames)[number], string[]>>> = {
      api: {
        ScanProfile: ['INSERT', 'SELECT'],
        ScanProfileVersion: ['INSERT', 'SELECT'],
        ScanPlan: ['INSERT', 'SELECT'],
        ExecutionUnit: ['INSERT', 'SELECT'],
        ExecutionDependency: ['INSERT', 'SELECT'],
        Evidence: ['SELECT'],
        IssueEvidenceLink: ['SELECT'],
        Artifact: ['SELECT'],
      },
      worker: {},
      host: {
        ScanProfile: ['SELECT'],
        ScanProfileVersion: ['SELECT'],
        ScanPlan: ['SELECT'],
        ExecutionUnit: ['SELECT'],
        ExecutionDependency: ['SELECT'],
        Evidence: ['INSERT', 'SELECT'],
        IssueEvidenceLink: ['INSERT', 'SELECT'],
        Artifact: ['INSERT', 'SELECT'],
        ExecutionUnitHostClaim: ['INSERT', 'SELECT'],
        EffectAuthorization: ['INSERT', 'SELECT'],
      },
      orchestrator: {
        ScanProfile: ['SELECT'],
        ScanProfileVersion: ['SELECT'],
        ScanPlan: ['SELECT'],
        ExecutionUnit: ['SELECT'],
        ExecutionDependency: ['SELECT'],
        Evidence: ['SELECT'],
        IssueEvidenceLink: ['SELECT'],
        Artifact: ['DELETE', 'SELECT'],
        EffectAuthorization: ['SELECT'],
      },
      operator: {
        ScanPlan: ['SELECT'],
        ExecutionUnit: ['SELECT'],
        ExecutionDependency: ['SELECT'],
      },
      nobody: {},
    };
    for (const roleName of Object.keys(roles) as RoleName[]) {
      const client = clientFor(roleName);
      const matrix = await client.$queryRaw<Array<{ tableName: string; privileges: string[] }>>`
        SELECT t.relname AS "tableName",
          array_remove(ARRAY[
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'SELECT') THEN 'SELECT' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'INSERT') THEN 'INSERT' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'UPDATE') THEN 'UPDATE' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'DELETE') THEN 'DELETE' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'TRUNCATE') THEN 'TRUNCATE' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'REFERENCES') THEN 'REFERENCES' END,
            CASE WHEN has_table_privilege(current_user, format('public.%I', t.relname), 'TRIGGER') THEN 'TRIGGER' END
          ], NULL) AS privileges
        FROM (VALUES ${Prisma.join(tableNames.map((name) => Prisma.sql`(${name})`))}) AS t(relname)
        ORDER BY t.relname
      `;

      expect(matrix).toHaveLength(tableNames.length);
      for (const row of matrix) {
        const wanted = expected[roleName][row.tableName as (typeof tableNames)[number]] ?? [];
        expect(new Set(row.privileges), `${roleName} on ${row.tableName}`).toEqual(new Set(wanted));
        expect(row.privileges).not.toContain('TRUNCATE');
        expect(row.privileges).not.toContain('REFERENCES');
        expect(row.privileges).not.toContain('TRIGGER');
      }
    }

    // Per-column exceptions (for host lifecycle/progress writes and API ownership reads)
    // are asserted separately below; this matrix is deliberately table-level only.
  });

  it('keeps raw lease secrets and F07 tables unreadable to every runtime login', async () => {
    for (const role of Object.keys(roles) as RoleName[]) {
      const client = clientFor(role);
      expect(await hasTablePrivilege(client, 'AdmissionLease', 'SELECT'), role).toBe(false);
      expect(await hasTablePrivilege(client, 'BudgetCounter', 'SELECT'), role).toBe(false);
      expect(await hasTablePrivilege(client, 'KillSwitchState', 'SELECT'), role).toBe(false);
    }
  });

  it('enforces claim/effect ledger access for non-host LOGIN roles', async () => {
    const unitId = await unitIdForDirectWrite();
    const claimId = `core01-role-claim-${suffix}`;
    const effectId = `core01-role-effect-${suffix}`;
    await testDb.executionUnitHostClaim.create({
      data: {
        id: claimId,
        executionUnitId: unitId,
        attempt: 1,
        scanPlanId: `core01-role-plan-${suffix}`,
        userId: `core01-role-user-${suffix}`,
        hostInstanceId: 'fixture-host',
        claimTokenHash: 'a'.repeat(64),
      },
    });
    await testDb.effectAuthorization.create({
      data: {
        id: effectId,
        executionUnitId: unitId,
        attempt: 1,
        kind: 'PROVISION',
        ordinal: 1,
        userId: `core01-role-user-${suffix}`,
      },
    });

    for (const roleName of ['api', 'worker', 'orchestrator', 'operator', 'nobody'] as const) {
      const client = clientFor(roleName);
      await expect(
        client.$queryRaw`SELECT "claimTokenHash" FROM "ExecutionUnitHostClaim" WHERE id = ${claimId}`,
        `${roleName} must not read a host claim`,
      ).rejects.toThrow(/permission denied|42501/i);
      await expect(
        client.$executeRaw`INSERT INTO "ExecutionUnitHostClaim"
          (id,"executionUnitId",attempt,"scanPlanId","userId","hostInstanceId","claimTokenHash")
          VALUES (${`${claimId}-${roleName}`},${unitId},2,'foreign-plan','foreign-user','attacker',${'b'.repeat(64)})`,
        `${roleName} must not create a host claim`,
      ).rejects.toThrow(/permission denied|42501/i);
      const effectRead = client.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "EffectAuthorization" WHERE id = ${effectId}`;
      if (roleName === 'orchestrator') {
        await expect(effectRead).resolves.toEqual([{ id: effectId }]);
      } else {
        await expect(effectRead, `${roleName} must not read effect authorizations`).rejects.toThrow(
          /permission denied|42501/i,
        );
      }
      await expect(
        client.$executeRaw`INSERT INTO "EffectAuthorization"
          (id,"executionUnitId",attempt,kind,ordinal,"userId")
          VALUES (${`${effectId}-${roleName}`},${unitId},2,'PROVISION',2,'foreign-user')`,
        `${roleName} must not create an effect authorization`,
      ).rejects.toThrow(/permission denied|42501/i);
      await expect(
        client.$executeRaw`UPDATE "EffectAuthorization" SET state = 'CONFIRMED' WHERE id = ${effectId}`,
        `${roleName} must not confirm an effect directly`,
      ).rejects.toThrow(/permission denied|42501/i);
      await expect(
        client.$queryRaw`SELECT public.fahes_lock_live_lease('missing-execution')`,
        `${roleName} must not invoke the host-only lease-lock helper`,
      ).rejects.toThrow(/permission denied|42501/i);
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
  it('matches the exact CORE-01 SECURITY DEFINER execution matrix with no PUBLIC grants', async () => {
    const matrix: Record<string, RoleName[]> = {
      'fahes_dependency_same_plan()': [],
      'fahes_finalize_unit(text,text,text,"FailureClass",text,jsonb)': ['host', 'orchestrator'],
      'fahes_lock_execution_evidence(text,text,integer,text,text)': ['host'],
      'fahes_lock_live_lease(text)': ['host'],
      'fahes_pending_stop_reason(text,text,text,text,text)': ['host', 'orchestrator'],
    };

    for (const [signature, allowedRoles] of Object.entries(matrix)) {
      expect(await publicCanExecuteFunction(clientFor('nobody'), signature), signature).toBe(false);
      for (const roleName of Object.keys(roles) as RoleName[]) {
        expect(
          await hasFunctionPrivilege(clientFor(roleName), signature),
          `${roleName}: ${signature}`,
        ).toBe(allowedRoles.includes(roleName));
      }
    }
  });

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
