/**
 * SPEC 008 / DEC-044 / F-02 §4 — role isolation proven with REAL non-superuser
 * logins (never a superuser session, which ignores every grant). Each login is
 * a member of exactly one `fahes_*` group role; the privilege matrix is
 * asserted in both directions (what must work, and what must be denied).
 *
 * Scope of the claim (F-02 §1): this proves the grants and definer functions on
 * the five SPEC 008 tables. It does not claim isolation for legacy tables, and
 * it does not say the running dev API/worker connect as these roles (they use
 * the shared superuser `DATABASE_URL`).
 */

import { randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '../../prisma/generated/client/index.js';
import { TEST_DB_URL, closeDb, resetDb, testDb } from '../helpers/db.js';
import { admissionRequest, makeWorld } from '../helpers/safety-fixtures.js';
import {
  requestAdmission,
  renewLease,
  releaseLeaseByToken,
} from '../../src/services/safety/admission.js';
import { loadBudgetConsumption } from '../../src/services/safety/budget-counter.js';
import { triggerStop } from '../../src/services/safety/kill-switch.js';

const PASSWORD = randomBytes(12).toString('hex');
const LOGINS = {
  api: { login: 'zz_t_f07_api', group: 'fahes_api' },
  worker: { login: 'zz_t_f07_worker', group: 'fahes_worker_exec' },
  orchestrator: { login: 'zz_t_f07_orch', group: 'fahes_orchestrator' },
  operator: { login: 'zz_t_f07_op', group: 'fahes_operator' },
  nobody: { login: 'zz_t_f07_none', group: null },
} as const;
type Who = keyof typeof LOGINS;

const clients = new Map<Who, PrismaClient>();

function urlFor(login: string): string {
  const url = new URL(TEST_DB_URL);
  url.username = login;
  url.password = PASSWORD;
  return url.toString();
}

function as(who: Who): PrismaClient {
  const client = clients.get(who);
  if (client === undefined) throw new Error('client not ready');
  return client;
}

async function denied(promise: Promise<unknown>): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error, 'expected a permission failure').not.toBeNull();
  expect(String((error as Error).message)).toMatch(/permission denied|42501/i);
}

const FN = {
  admit: `public.f07_admit('t','g','e',NULL,'k',true,true)`,
  renew: `public.f07_renew_lease('l','t')`,
  releaseToken: `public.f07_release_lease_by_token('l','t',false)`,
  releaseExec: `public.f07_release_leases_by_execution('e')`,
  trigger: `public.f07_trigger_stop('GRANT'::"SafetyScope",'g','SYSTEM','SYSTEM_SAFETY_POLICY'::"KillSwitchReason")`,
  pending: `public.f07_stop_pending('e',NULL,'g','t','u')`,
  snapshot: `public.f07_budget_snapshot('t','u')`,
  ack: `public.f07_ack_stop('e','GRANT'::"SafetyScope",'g')`,
  ackAuthority: `public.f07_ack_stop_by_authority('e')`,
  stopped: `public.f07_record_stopped('e','GRANT'::"SafetyScope",'g')`,
  escalated: `public.f07_mark_escalated('e','GRANT'::"SafetyScope",'g')`,
  reclaim: `public.f07_reclaim_expired_leases(10)`,
  reconcile: `public.f07_reconcile_stranded_stops(10,30)`,
  auditTs: `public.f07_record_audit_ts('SAFETY_VIOLATION'::"ExecutionAuditEventType",'a',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'x',NULL)`,
  ownerIds: `public.f07_audit_owner_ids(10)`,
  purge: `public.f07_purge_execution_audit('u', now() - interval '1 day')`,
  purgeUnowned: `public.f07_purge_unowned_execution_audit(now() - interval '1 day')`,
  // internals: executable by no runtime role
  lock: `public.f07_lock_scope('GRANT'::"SafetyScope",'g',true)`,
  audit: `public.f07_audit('SAFETY_VIOLATION'::"ExecutionAuditEventType",'a',NULL,NULL,NULL,NULL,'x')`,
  auditScope: `public.f07_audit_scope('STOPPED'::"ExecutionAuditEventType",'a','GRANT'::"SafetyScope",'g',NULL,'x')`,
  live: `public.f07_scope_has_live_execution('GRANT'::"SafetyScope",'g')`,
} as const;
type Fn = keyof typeof FN;

/** The F-02 §4 EXECUTE matrix. `true` = must be callable, `false` = must be denied. */
const MATRIX: Record<Who, Partial<Record<Fn, boolean>>> = {
  api: {
    admit: true,
    renew: true,
    releaseToken: true,
    trigger: true,
    pending: true,
    snapshot: true,
    auditTs: true,
    releaseExec: false,
    ack: false,
    ackAuthority: false,
    stopped: false,
    escalated: false,
    reclaim: false,
    reconcile: false,
    lock: false,
    audit: false,
    auditScope: false,
    live: false,
    ownerIds: false,
    purge: false,
    purgeUnowned: false,
  },
  worker: {
    renew: true,
    releaseToken: true,
    pending: true,
    ack: true,
    stopped: true,
    escalated: true,
    admit: false,
    releaseExec: false,
    trigger: false,
    snapshot: false,
    ackAuthority: false,
    reclaim: false,
    reconcile: false,
    auditTs: false,
    lock: false,
    audit: false,
    auditScope: false,
    live: false,
    ownerIds: false,
    purge: false,
    purgeUnowned: false,
  },
  orchestrator: {
    releaseExec: true,
    ackAuthority: true,
    reclaim: true,
    reconcile: true,
    trigger: true,
    pending: true,
    stopped: true,
    ack: true,
    auditTs: true,
    admit: false,
    renew: false,
    releaseToken: false,
    snapshot: false,
    escalated: false,
    lock: false,
    audit: false,
    auditScope: false,
    live: false,
    ownerIds: true,
    purge: true,
    purgeUnowned: true,
  },
  operator: {
    trigger: true,
    pending: true,
    admit: false,
    renew: false,
    releaseToken: false,
    releaseExec: false,
    snapshot: false,
    ack: false,
    ackAuthority: false,
    stopped: false,
    escalated: false,
    reclaim: false,
    reconcile: false,
    auditTs: false,
    lock: false,
    audit: false,
    auditScope: false,
    live: false,
    ownerIds: false,
    purge: false,
    purgeUnowned: false,
  },
  nobody: Object.fromEntries(Object.keys(FN).map((k) => [k, false])) as Record<Fn, boolean>,
};

beforeAll(async () => {
  await resetDb();
  for (const { login, group } of Object.values(LOGINS)) {
    await testDb.$executeRawUnsafe(`DROP ROLE IF EXISTS ${login}`);
    await testDb.$executeRawUnsafe(
      `CREATE ROLE ${login} LOGIN PASSWORD '${PASSWORD}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS${group === null ? '' : ` IN ROLE ${group}`}`,
    );
    // The application role also reads the existing SPEC 007 tables (as the real app login does).
    await testDb.$executeRawUnsafe(
      `GRANT SELECT ON "Target","TargetAuthorization","TargetEnvironment","ScopeDefinition" TO ${login}`,
    );
  }
  for (const who of Object.keys(LOGINS) as Who[]) {
    clients.set(
      who,
      new PrismaClient({ datasources: { db: { url: urlFor(LOGINS[who].login) } }, log: [] }),
    );
  }
}, 60_000);

afterAll(async () => {
  for (const client of clients.values()) await client.$disconnect();
  for (const { login } of Object.values(LOGINS)) {
    await testDb.$executeRawUnsafe(`DROP OWNED BY ${login}`);
    await testDb.$executeRawUnsafe(`DROP ROLE IF EXISTS ${login}`);
  }
  await closeDb();
});

describe('the runtime logins are genuinely unprivileged', () => {
  it('are not superusers, not bypassrls and not members of fahes_owner', async () => {
    const rows = await testDb.$queryRawUnsafe<
      Array<{ rolname: string; rolsuper: boolean; rolbypassrls: boolean; owner: boolean }>
    >(
      `SELECT rolname, rolsuper, rolbypassrls, pg_has_role(rolname, 'fahes_owner', 'MEMBER') AS owner
       FROM pg_roles WHERE rolname LIKE 'zz_t_f07_%' OR rolname LIKE 'fahes_%'`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(9);
    for (const r of rows.filter((x) => x.rolname !== 'fahes_owner')) {
      expect(r.rolsuper, r.rolname).toBe(false);
      expect(r.rolbypassrls, r.rolname).toBe(false);
      expect(r.owner, r.rolname).toBe(false);
    }
    const group = rows.find((r) => r.rolname === 'fahes_owner');
    expect(group?.rolsuper).toBe(false);
  });
});

describe('direct table access is denied to every runtime role', () => {
  const TABLES = ['BudgetCounter', 'AdmissionLease', 'BudgetConsumption', 'KillSwitchState'];
  for (const who of Object.keys(LOGINS) as Who[]) {
    it(`${who}: no SELECT/INSERT/UPDATE/DELETE/TRUNCATE on the safety tables`, async () => {
      for (const table of TABLES) {
        await denied(as(who).$queryRawUnsafe(`SELECT * FROM "${table}" LIMIT 1`));
        await denied(as(who).$executeRawUnsafe(`UPDATE "${table}" SET id = id`));
        await denied(as(who).$executeRawUnsafe(`DELETE FROM "${table}"`));
        await denied(as(who).$executeRawUnsafe(`TRUNCATE TABLE "${table}"`));
      }
      await denied(
        as(who).$executeRawUnsafe(
          `INSERT INTO "BudgetCounter" (id,"targetAuthorizationId","userId","updatedAt") VALUES ('a','b','c',now())`,
        ),
      );
      await denied(
        as(who).$executeRawUnsafe(
          `INSERT INTO "KillSwitchState" (id,scope,"scopeId",state,"triggeredBy",reason) VALUES ('a','GRANT','b','STOPPED','c','USER_CANCELLATION')`,
        ),
      );
    });
  }

  it('only the api role may read the audit trail, and no role may write it directly', async () => {
    await expect(
      as('api').$queryRawUnsafe(`SELECT count(*) FROM "ExecutionAuditEvent"`),
    ).resolves.toBeDefined();
    for (const who of ['worker', 'orchestrator', 'operator', 'nobody'] as const) {
      await denied(as(who).$queryRawUnsafe(`SELECT * FROM "ExecutionAuditEvent" LIMIT 1`));
    }
    for (const who of Object.keys(LOGINS) as Who[]) {
      await denied(
        as(who).$executeRawUnsafe(
          `INSERT INTO "ExecutionAuditEvent" (id,"eventType","actorId",outcome) VALUES ('a','STOPPED','x','y')`,
        ),
      );
      await denied(
        as(who).$executeRawUnsafe(`UPDATE "ExecutionAuditEvent" SET outcome = 'forged'`),
      );
      await denied(as(who).$executeRawUnsafe(`DELETE FROM "ExecutionAuditEvent"`));
    }
  });
});

describe('the EXECUTE matrix (F-02 §4)', () => {
  for (const who of Object.keys(MATRIX) as Who[]) {
    for (const [fn, allowed] of Object.entries(MATRIX[who]) as Array<[Fn, boolean]>) {
      it(`${who} ${allowed ? 'can' : 'cannot'} call ${fn}`, async () => {
        const call = as(who).$queryRawUnsafe(`SELECT ${FN[fn]}`);
        if (allowed) {
          // It may legitimately refuse the made-up arguments; it must not be a permission failure.
          const error = await call.then(
            () => null,
            (e: unknown) => e,
          );
          if (error !== null)
            expect(String((error as Error).message)).not.toMatch(/permission denied/i);
        } else {
          await denied(call);
        }
      });
    }
  }
});

describe('definer functions cannot be hijacked or escaped', () => {
  it('cannot assume the owner role or create objects in public', async () => {
    for (const who of ['api', 'worker', 'orchestrator'] as const) {
      await expect(as(who).$executeRawUnsafe(`SET ROLE fahes_owner`)).rejects.toThrow();
      await denied(as(who).$executeRawUnsafe(`CREATE TABLE public.zz_hijack (id int)`));
    }
  });

  it('a shadow temp table or a hostile search_path does not change what a definer function reads', async () => {
    const world = await makeWorld('hijack@example.com');
    const baseline = await as('api').$queryRaw<Array<{ r: unknown }>>`
      SELECT public.f07_budget_snapshot(${world.targetId}, ${world.userId}) AS r`;
    // run on ONE connection so the temp table and the search_path are really in effect
    const shadowed = await as('api').$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "BudgetCounter" (LIKE public."TargetAuthorization")`,
      );
      await tx.$executeRawUnsafe(`CREATE TEMP TABLE "Target" (LIKE public."Target")`);
      await tx.$executeRawUnsafe(`SET LOCAL search_path = pg_temp, public`);
      return tx.$queryRaw<
        Array<{ r: unknown }>
      >`SELECT public.f07_budget_snapshot(${world.targetId}, ${world.userId}) AS r`;
    });
    expect(shadowed[0]?.r).toEqual(baseline[0]?.r);
    const admitted = await as('api').$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `CREATE TEMP TABLE "TargetAuthorization" (LIKE public."TargetAuthorization")`,
      );
      await tx.$executeRawUnsafe(`SET LOCAL search_path = pg_temp, public`);
      return tx.$queryRaw<Array<{ r: { outcome: string; reason?: string } }>>`
        SELECT public.f07_admit(${world.targetId}, ${world.grantId}, 'e-h', NULL, 'k-h', true, true) AS r`;
    });
    expect(admitted[0]?.r.outcome).toBe('GRANTED');
  });
});

describe('the TypeScript services work end-to-end as a non-superuser runtime', () => {
  beforeEach(async () => {
    await testDb.$executeRawUnsafe(
      `TRUNCATE TABLE "ExecutionAuditEvent","KillSwitchState","BudgetConsumption","AdmissionLease","BudgetCounter"`,
    );
  });

  it('api: admission, renewal, release, stop and budget snapshot succeed with no direct table privilege', async () => {
    const world = await makeWorld('e2e-role@example.com');
    const db = as('api');
    const granted = await requestAdmission(db, admissionRequest(world));
    if (granted.outcome !== 'GRANTED' || !granted.leaseId || !granted.holderToken)
      throw new Error(JSON.stringify(granted));
    const ids = { leaseId: granted.leaseId, holderToken: granted.holderToken };
    expect((await renewLease(db, ids)).status).toBe('RENEWED');
    expect(
      (await loadBudgetConsumption(db, { targetId: world.targetId, userId: world.userId })).get(
        world.grantId,
      ),
    ).toEqual({
      requestsConsumed: 1,
      concurrencyInUse: 1,
    });
    expect(await releaseLeaseByToken(db, ids)).toEqual({ released: true });
    const stop = await triggerStop(db, {
      scope: 'GRANT',
      scopeId: world.grantId,
      triggeredBy: 'SYSTEM',
      reason: 'SYSTEM_SAFETY_POLICY',
    });
    expect(stop.created).toBe(true);
    // the same login still cannot touch the rows it just caused to be written
    await denied(db.$queryRawUnsafe(`SELECT * FROM "AdmissionLease"`));
  });

  it('worker: cannot admit (forged-tenant charge impossible) but can renew and release its own lease by token', async () => {
    const world = await makeWorld('e2e-worker@example.com');
    const granted = await requestAdmission(as('api'), admissionRequest(world));
    if (granted.outcome !== 'GRANTED' || !granted.leaseId || !granted.holderToken)
      throw new Error('lease');
    await denied(as('worker').$queryRawUnsafe(`SELECT ${FN.admit}`));
    expect(
      (
        await renewLease(as('worker'), {
          leaseId: granted.leaseId,
          holderToken: granted.holderToken,
        })
      ).status,
    ).toBe('RENEWED');
    expect(
      (await renewLease(as('worker'), { leaseId: granted.leaseId, holderToken: 'guess' })).status,
    ).toBe('FENCED');
    expect(
      await releaseLeaseByToken(as('worker'), {
        leaseId: granted.leaseId,
        holderToken: granted.holderToken,
      }),
    ).toEqual({ released: true });
  });
});
