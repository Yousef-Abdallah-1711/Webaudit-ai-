/**
 * T021a — SPEC 007 `data-model.md` "Audit trail reuse (FR-018 / FR-018a)".
 *
 * Asserts the exact `AuditLogEntry` row shape (`action`, `subjectType`,
 * `subjectId`, `before`, `after`) each lifecycle operation writes. Database-free:
 * an in-memory fake records what `auditLogEntry.create` receives, so the shape is
 * pinned independently of Postgres. (The adverse suite separately proves the rows
 * land atomically with the state change in a real database.)
 *
 * `authorization.replaced` belongs to `narrowAuthorization` (Phase 5, T028) and
 * is deliberately not covered here.
 */

import { describe, expect, it } from 'vitest';
import { classifyEnvironment } from '../../src/services/authorization/classify-environment.js';
import { createAuthorization } from '../../src/services/authorization/create.js';
import { revokeAuthorization } from '../../src/services/authorization/revoke.js';
import type { ControlProbe } from '../../src/services/control-gate/verify.js';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const OWNER = 'user-owner';
const OPERATOR = 'user-operator';
const TARGET = 'target-1';

const probe: ControlProbe = {
  fetchFile: () => Promise.reject(new Error('probe must not be used')),
  resolveTxt: () => Promise.reject(new Error('probe must not be used')),
};

interface AuditData {
  actorId: string;
  action: string;
  subjectType: string;
  subjectId?: string | null;
  before?: unknown;
  after?: unknown;
}

interface GrantRow {
  id: string;
  targetId: string;
  userId: string;
  scopeId: string;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
}

function fakeDb() {
  const audits: AuditData[] = [];
  const grants = new Map<string, GrantRow>();
  let environment: { id: string; classification: string } | null = null;

  const db = {
    audits,
    target: {
      findFirst: async (args: { where: { id: string; userId: string } }) =>
        args.where.id === TARGET && args.where.userId === OWNER
          ? {
              id: TARGET,
              inputType: 'URL',
              canonicalValue: 'https://example.com',
              controlLevel: 'ATTESTED',
              attestedAt: NOW,
            }
          : null,
    },
    targetVerification: { findFirst: async () => null },
    user: {
      findFirst: async (args: { where: { id: string; isOperator: boolean } }) =>
        args.where.id === OPERATOR && args.where.isOperator ? { id: OPERATOR } : null,
    },
    scopeDefinition: { create: async () => ({ id: 'scope-1' }) },
    targetAuthorization: {
      create: async (args: { data: Omit<GrantRow, 'id' | 'revokedAt' | 'revokedBy'> }) => {
        const row: GrantRow = { ...args.data, id: 'grant-1', revokedAt: null, revokedBy: null };
        grants.set(row.id, row);
        return row;
      },
      findMany: async () => [],
      findFirst: async (args: { where: { id: string; userId?: string } }) => {
        const row = grants.get(args.where.id);
        if (row === undefined) return null;
        if (args.where.userId !== undefined && row.userId !== args.where.userId) return null;
        return { ...row };
      },
      updateMany: async (args: {
        where: { id: string; revokedAt: null };
        data: { revokedAt: Date; revokedBy: string };
      }) => {
        const row = grants.get(args.where.id);
        if (row === undefined || row.revokedAt !== null) return { count: 0 };
        row.revokedAt = args.data.revokedAt;
        row.revokedBy = args.data.revokedBy;
        return { count: 1 };
      },
    },
    targetEnvironment: {
      findUnique: async () => environment,
      upsert: async (args: {
        create: { classification: string };
        update: { classification: string };
      }) => {
        environment = {
          id: 'env-1',
          classification: (environment === null ? args.create : args.update).classification,
        };
        return environment;
      },
    },
    auditLogEntry: {
      create: async (args: { data: AuditData }) => {
        audits.push(args.data);
        return args.data;
      },
    },
    // SPEC 008: revocation / reclassification now request a GRANT stop in the same transaction.
    stopCalls: 0,
    $queryRaw: async () => {
      db.stopCalls += 1;
      return [{ r: { created: true, state: 'REQUESTED', scope: 'GRANT', scopeId: 'grant-1' } }];
    },
    $transaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => fn(db),
  };
  return db;
}

type FakeDb = ReturnType<typeof fakeDb>;
// The fake implements only the calls these operations make.
const asDb = <T>(db: FakeDb) => db as unknown as T;

async function grantOne(db: FakeDb) {
  return createAuthorization(
    asDb(db),
    {
      targetId: TARGET,
      requestingUserId: OWNER,
      executionClasses: ['BROWSER'],
      scope: { targetKind: 'WEB', includedHosts: ['example.com'], includedPathPrefixes: [''] },
      environmentRestriction: ['STAGING'],
      budgets: { requestBudget: 1000, concurrencyBudget: 5, durationBudget: 3600 },
    },
    probe,
    NOW,
  );
}

describe('audit row shape (FR-018, FR-018a)', () => {
  it('authorization.granted', async () => {
    const db = fakeDb();
    const grant = await grantOne(db);
    expect(db.audits).toEqual([
      {
        actorId: OWNER,
        action: 'authorization.granted',
        subjectType: 'TargetAuthorization',
        subjectId: grant.id,
        after: {
          executionClasses: ['BROWSER'],
          scopeId: 'scope-1',
          environmentRestriction: ['STAGING'],
          budgets: { requestBudget: 1000, concurrencyBudget: 5, durationBudget: 3600 },
        },
      },
    ]);
  });

  it('authorization.revoked (self)', async () => {
    const db = fakeDb();
    const grant = await grantOne(db);
    db.audits.length = 0;
    const later = new Date(NOW.getTime() + 60_000);
    await revokeAuthorization(
      asDb(db),
      { authorizationId: grant.id, actingUserId: OWNER, actingUserIsOperator: false },
      later,
    );
    expect(db.audits).toEqual([
      {
        actorId: OWNER,
        action: 'authorization.revoked',
        subjectType: 'TargetAuthorization',
        subjectId: grant.id,
        before: { revokedAt: null },
        after: { revokedAt: later.toISOString(), revokedBy: OWNER },
      },
    ]);
  });

  it('authorization.revoked_by_operator', async () => {
    const db = fakeDb();
    const grant = await grantOne(db);
    db.audits.length = 0;
    const later = new Date(NOW.getTime() + 60_000);
    await revokeAuthorization(
      asDb(db),
      { authorizationId: grant.id, actingUserId: OPERATOR, actingUserIsOperator: true },
      later,
    );
    expect(db.audits).toEqual([
      {
        actorId: OPERATOR,
        action: 'authorization.revoked_by_operator',
        subjectType: 'TargetAuthorization',
        subjectId: grant.id,
        before: { revokedAt: null },
        after: { revokedAt: later.toISOString(), revokedBy: OPERATOR },
      },
    ]);
  });

  it('writes no audit row for a no-op revocation of an already-revoked grant', async () => {
    const db = fakeDb();
    const grant = await grantOne(db);
    const input = { authorizationId: grant.id, actingUserId: OWNER, actingUserIsOperator: false };
    await revokeAuthorization(asDb(db), input, new Date(NOW.getTime() + 60_000));
    const count = db.audits.length;
    await revokeAuthorization(asDb(db), input, new Date(NOW.getTime() + 120_000));
    expect(db.audits).toHaveLength(count);
  });

  it('environment.classified then environment.reclassified', async () => {
    const db = fakeDb();
    await classifyEnvironment(asDb(db), {
      targetId: TARGET,
      actingUserId: OWNER,
      classification: 'STAGING',
    });
    await classifyEnvironment(asDb(db), {
      targetId: TARGET,
      actingUserId: OWNER,
      classification: 'PRODUCTION',
    });
    expect(db.audits).toEqual([
      {
        actorId: OWNER,
        action: 'environment.classified',
        subjectType: 'TargetEnvironment',
        subjectId: 'env-1',
        after: { classification: 'STAGING' },
      },
      {
        actorId: OWNER,
        action: 'environment.reclassified',
        subjectType: 'TargetEnvironment',
        subjectId: 'env-1',
        before: { classification: 'STAGING' },
        after: { classification: 'PRODUCTION' },
      },
    ]);
  });
});
