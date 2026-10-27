/**
 * T009 + T012a — SPEC 007 `contracts/authorization-check-contract.md`.
 *
 * Database-free: `isAuthorized` takes a structural read-only client, and the
 * fake here exposes only `findMany`/`findFirst`. A write attempt would be a
 * TypeError, which is how "a decision, not a reservation" (FR-024) is held.
 *
 * Scope here is the Phase 3 slice: AUTHORIZED, NO_MATCHING_GRANT,
 * ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED, plus OUT_OF_SCOPE and the interim
 * REVOKED/EXPIRED handling that keeps the check fail-closed until User Story 2
 * moves state derivation into derive-state.ts (T022/T023). BUDGET_EXHAUSTED is
 * not exercised: no consumption data exists in this spec (F07 owns metering).
 */

import { describe, expect, it, vi } from 'vitest';
import type { ExecutionClass, TargetEnvironmentClassification } from '@webaudit/types';
import {
  isAuthorized,
  type AuthorizationCheckDb,
  type AuthorizationGrantRow,
} from '../../src/services/authorization/check.js';
import type {
  ScopeDefinitionData,
  WebDestination,
} from '../../src/services/authorization/scope-match.js';

const NOW = new Date('2026-10-25T12:00:00.000Z');
const FUTURE = new Date('2026-11-25T12:00:00.000Z');
const PAST = new Date('2026-10-01T12:00:00.000Z');

function scope(overrides: Partial<ScopeDefinitionData> = {}): ScopeDefinitionData {
  return {
    targetKind: 'WEB',
    includedHosts: ['*.example.com', 'example.com'],
    excludedHosts: [],
    includedPathPrefixes: [''],
    excludedPathPrefixes: [],
    schemes: [],
    ports: [],
    repositoryFullName: null,
    includedRefs: [],
    excludedRefs: [],
    ...overrides,
  };
}

function grant(overrides: Partial<AuthorizationGrantRow> = {}): AuthorizationGrantRow {
  return {
    id: 'grant-1',
    targetId: 'target-1',
    userId: 'user-1',
    executionClasses: ['BROWSER'],
    environmentRestriction: ['STAGING'],
    grantedAt: new Date('2026-10-20T00:00:00.000Z'),
    requestBudget: 1000,
    concurrencyBudget: 5,
    expiresAt: FUTURE,
    revokedAt: null,
    scope: scope(),
    ...overrides,
  };
}

function fakeDb(
  grants: AuthorizationGrantRow[],
  environment: TargetEnvironmentClassification | null,
) {
  const findMany = vi.fn(async () => grants);
  const findFirst = vi.fn(async () =>
    environment === null ? null : { classification: environment },
  );
  const db: AuthorizationCheckDb = {
    targetAuthorization: { findMany },
    targetEnvironment: { findFirst },
  };
  return { db, findMany, findFirst };
}

const destination: WebDestination = {
  host: 'api.example.com',
  path: '/v1',
  scheme: 'https',
  port: null,
};

function input(overrides: Partial<Parameters<typeof isAuthorized>[1]> = {}) {
  return {
    targetId: 'target-1',
    userId: 'user-1',
    executionClass: 'BROWSER' as ExecutionClass,
    destination,
    now: NOW,
    ...overrides,
  };
}

describe('isAuthorized — AUTHORIZED', () => {
  it('returns the grant id when class, state, scope and environment all satisfy one grant', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: 'grant-1',
    });
  });

  it('returns the first grant that independently satisfies every condition', async () => {
    const { db } = fakeDb(
      [
        grant({ id: 'wrong-scope', scope: scope({ includedHosts: ['other.example.com'] }) }),
        grant({ id: 'good' }),
        grant({ id: 'also-good' }),
      ],
      'STAGING',
    );
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: 'good',
    });
  });
});

describe('isAuthorized — NO_MATCHING_GRANT', () => {
  it('refuses when the target has no grants at all', async () => {
    const { db } = fakeDb([], 'STAGING');
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'NO_MATCHING_GRANT',
    });
  });

  it('refuses when no grant lists the requested execution class', async () => {
    const { db } = fakeDb([grant({ executionClasses: ['CRAWLER'] })], 'STAGING');
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'NO_MATCHING_GRANT',
    });
  });

  it('does not trust the database layer to have filtered by class, user or target', async () => {
    const { db } = fakeDb(
      [
        grant({ id: 'other-user', userId: 'user-2' }),
        grant({ id: 'other-target', targetId: 'target-2' }),
      ],
      'STAGING',
    );
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'NO_MATCHING_GRANT',
    });
  });

  it('queries grants scoped to the target AND the requesting user, never by id alone', async () => {
    const { db, findMany } = fakeDb([], 'STAGING');
    await isAuthorized(db, input());
    expect(findMany).toHaveBeenCalledTimes(1);
    const args = findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(args[0].where).toMatchObject({ targetId: 'target-1', userId: 'user-1' });
  });

  it('treats a malformed grant row as unusable, never as permission', async () => {
    const malformed = grant({ scope: null as unknown as ScopeDefinitionData });
    const { db } = fakeDb([malformed], 'STAGING');
    const result = await isAuthorized(db, input());
    expect(result.outcome).toBe('REFUSED');
  });

  it('lets a database failure surface as a thrown error, never as AUTHORIZED', async () => {
    const db: AuthorizationCheckDb = {
      targetAuthorization: {
        findMany: async () => {
          throw new Error('connection reset');
        },
      },
      targetEnvironment: { findFirst: async () => ({ classification: 'STAGING' }) },
    };
    await expect(isAuthorized(db, input())).rejects.toThrow('connection reset');
  });
});

describe('isAuthorized — ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED', () => {
  it('refuses when the target has no environment classification', async () => {
    const { db } = fakeDb([grant()], null);
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
      grantId: 'grant-1',
    });
  });

  it('refuses when the classification is outside the grant environmentRestriction', async () => {
    const { db } = fakeDb([grant({ environmentRestriction: ['STAGING'] })], 'PRODUCTION');
    await expect(isAuthorized(db, input())).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
      grantId: 'grant-1',
    });
  });

  it('classification alone never authorizes: PRODUCTION classified, no grant, is refused', async () => {
    const { db } = fakeDb([], 'PRODUCTION');
    const result = await isAuthorized(db, input());
    expect(result).toEqual({ outcome: 'REFUSED', reason: 'NO_MATCHING_GRANT' });
  });

  it('reads the environment fresh on every call (reclassification takes effect immediately)', async () => {
    let classification: TargetEnvironmentClassification = 'STAGING';
    const db: AuthorizationCheckDb = {
      targetAuthorization: { findMany: async () => [grant()] },
      targetEnvironment: { findFirst: async () => ({ classification }) },
    };
    expect((await isAuthorized(db, input())).outcome).toBe('AUTHORIZED');
    classification = 'PRODUCTION';
    expect(await isAuthorized(db, input())).toMatchObject({
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
    });
  });

  it('joins the environment through the owning target and user (tenant isolation)', async () => {
    const { db, findFirst } = fakeDb([grant()], 'STAGING');
    await isAuthorized(db, input());
    const args = findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(args[0].where).toMatchObject({ targetId: 'target-1', target: { userId: 'user-1' } });
  });
});

describe('isAuthorized — scope and interim state handling', () => {
  it('refuses OUT_OF_SCOPE for a destination the grant scope does not admit', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    const result = await isAuthorized(
      db,
      input({ destination: { ...destination, host: 'evil.net' } }),
    );
    expect(result).toEqual({ outcome: 'REFUSED', reason: 'OUT_OF_SCOPE', grantId: 'grant-1' });
  });

  it('refuses REVOKED, never AUTHORIZED, for a revoked grant', async () => {
    const { db } = fakeDb([grant({ revokedAt: PAST })], 'STAGING');
    expect(await isAuthorized(db, input())).toEqual({
      outcome: 'REFUSED',
      reason: 'REVOKED',
      grantId: 'grant-1',
    });
  });

  it('refuses EXPIRED once now >= expiresAt (boundary inclusive)', async () => {
    const { db } = fakeDb([grant({ expiresAt: NOW })], 'STAGING');
    expect(await isAuthorized(db, input())).toEqual({
      outcome: 'REFUSED',
      reason: 'EXPIRED',
      grantId: 'grant-1',
    });
  });

  it('REVOKED takes precedence over EXPIRED when both hold', async () => {
    const { db } = fakeDb([grant({ revokedAt: PAST, expiresAt: PAST })], 'STAGING');
    expect(await isAuthorized(db, input())).toMatchObject({ reason: 'REVOKED' });
  });

  it('reports the reason from the grant that got furthest through the checks', async () => {
    const { db } = fakeDb(
      [
        grant({ id: 'revoked', revokedAt: PAST }),
        grant({ id: 'scope-miss', scope: scope({ includedHosts: ['other.example.com'] }) }),
        grant({ id: 'env-miss', environmentRestriction: ['DEVELOPMENT'] }),
      ],
      'STAGING',
    );
    expect(await isAuthorized(db, input())).toEqual({
      outcome: 'REFUSED',
      reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED',
      grantId: 'env-miss',
    });
  });

  it('never combines two grants: right scope on one and right environment on another is refused', async () => {
    const { db } = fakeDb(
      [
        grant({ id: 'scope-ok-env-bad', environmentRestriction: ['DEVELOPMENT'] }),
        grant({
          id: 'env-ok-scope-bad',
          scope: scope({ includedHosts: ['other.example.com'] }),
        }),
      ],
      'STAGING',
    );
    expect((await isAuthorized(db, input())).outcome).toBe('REFUSED');
  });

  it('a REPOSITORY destination is refused by a WEB-scope grant', async () => {
    const { db } = fakeDb([grant({ executionClasses: ['SOURCE_EXECUTION'] })], 'STAGING');
    const result = await isAuthorized(
      db,
      input({
        executionClass: 'SOURCE_EXECUTION',
        destination: { repositoryFullName: 'acme/widgets', ref: 'main', path: '/' },
      }),
    );
    expect(result).toMatchObject({ outcome: 'REFUSED', reason: 'OUT_OF_SCOPE' });
  });
});

describe('isAuthorized — composite grant (T012a, FR-006)', () => {
  const composite = grant({
    executionClasses: ['AUTHENTICATED_WORKFLOW', 'ACTIVE_SECURITY'],
    environmentRestriction: ['STAGING', 'DEVELOPMENT'],
  });

  it('evaluates each listed class independently against the same scope and budgets', async () => {
    const { db } = fakeDb([composite], 'STAGING');
    for (const executionClass of ['AUTHENTICATED_WORKFLOW', 'ACTIVE_SECURITY'] as const) {
      await expect(isAuthorized(db, input({ executionClass }))).resolves.toEqual({
        outcome: 'AUTHORIZED',
        grantId: 'grant-1',
      });
    }
  });

  it('does not authorize a class the composite grant does not list', async () => {
    const { db } = fakeDb([composite], 'STAGING');
    await expect(isAuthorized(db, input({ executionClass: 'LOAD_CAPACITY' }))).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'NO_MATCHING_GRANT',
    });
  });

  it('a refusal for one listed class does not leak into the other (per-class scope check)', async () => {
    const { db } = fakeDb([composite], 'STAGING');
    const bad = await isAuthorized(
      db,
      input({
        executionClass: 'ACTIVE_SECURITY',
        destination: { ...destination, host: 'evil.net' },
      }),
    );
    const good = await isAuthorized(db, input({ executionClass: 'AUTHENTICATED_WORKFLOW' }));
    expect(bad).toMatchObject({ reason: 'OUT_OF_SCOPE' });
    expect(good.outcome).toBe('AUTHORIZED');
  });
});

describe('isAuthorized — decision, not reservation (FR-024)', () => {
  it('is repeatable and performs only reads', async () => {
    const { db, findMany, findFirst } = fakeDb([grant()], 'STAGING');
    const first = await isAuthorized(db, input());
    const second = await isAuthorized(db, input());
    expect(second).toEqual(first);
    expect(Object.keys(db.targetAuthorization)).toEqual(['findMany']);
    expect(Object.keys(db.targetEnvironment)).toEqual(['findFirst']);
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findFirst).toHaveBeenCalledTimes(2);
  });
});

describe('isAuthorized — BUDGET_EXHAUSTED stub seam (T019, FR-015)', () => {
  // Production metering is SPEC 008's. These tests only pin how a caller-supplied
  // consumption snapshot is classified; absent data never reports exhaustion.
  const used = (requestsConsumed: number, concurrencyInUse: number) =>
    new Map([['grant-1', { requestsConsumed, concurrencyInUse }]]);

  it('refuses BUDGET_EXHAUSTED once requests consumed reach requestBudget', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    await expect(isAuthorized(db, input({ consumption: used(1000, 0) }))).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'BUDGET_EXHAUSTED',
      grantId: 'grant-1',
    });
  });

  it('refuses BUDGET_EXHAUSTED once concurrency in use reaches concurrencyBudget', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    await expect(isAuthorized(db, input({ consumption: used(0, 5) }))).resolves.toMatchObject({
      reason: 'BUDGET_EXHAUSTED',
    });
  });

  it('authorizes one unit below each limit', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    await expect(isAuthorized(db, input({ consumption: used(999, 4) }))).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: 'grant-1',
    });
  });

  it('never reports exhaustion when no consumption data is supplied', async () => {
    const { db } = fakeDb([grant()], 'STAGING');
    await expect(isAuthorized(db, input())).resolves.toMatchObject({ outcome: 'AUTHORIZED' });
    await expect(isAuthorized(db, input({ consumption: new Map() }))).resolves.toMatchObject({
      outcome: 'AUTHORIZED',
    });
  });

  it('is distinguishable from REVOKED and EXPIRED, which win over it', async () => {
    const exhausted = used(1000, 5);
    const revoked = fakeDb([grant({ revokedAt: PAST })], 'STAGING');
    await expect(
      isAuthorized(revoked.db, input({ consumption: exhausted })),
    ).resolves.toMatchObject({ reason: 'REVOKED' });
    const expired = fakeDb([grant({ expiresAt: PAST })], 'STAGING');
    await expect(
      isAuthorized(expired.db, input({ consumption: exhausted })),
    ).resolves.toMatchObject({ reason: 'EXPIRED' });
  });

  it('is evaluated only after scope and environment pass (FR-013 order)', async () => {
    const exhausted = used(1000, 5);
    const outOfScope = fakeDb([grant()], 'STAGING');
    await expect(
      isAuthorized(
        outOfScope.db,
        input({ consumption: exhausted, destination: { ...destination, host: 'evil.net' } }),
      ),
    ).resolves.toMatchObject({ reason: 'OUT_OF_SCOPE' });
    const wrongEnv = fakeDb([grant()], 'DEVELOPMENT');
    await expect(
      isAuthorized(wrongEnv.db, input({ consumption: exhausted })),
    ).resolves.toMatchObject({ reason: 'ENVIRONMENT_UNCLASSIFIED_OR_NOT_PERMITTED' });
  });

  it('exhausting one grant does not affect another grant that still has budget', async () => {
    const { db } = fakeDb([grant({ id: 'grant-1' }), grant({ id: 'grant-2' })], 'STAGING');
    await expect(isAuthorized(db, input({ consumption: used(1000, 0) }))).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: 'grant-2',
    });
  });
});

describe('isAuthorized — side-effect-free (T019a, FR-024)', () => {
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  }

  /** A db that throws on any access other than the two documented read calls. */
  function strictReadOnlyDb(rows: AuthorizationGrantRow[]): AuthorizationCheckDb {
    const only = (name: string, fn: () => Promise<unknown>) =>
      new Proxy({} as Record<string, unknown>, {
        get(_target, prop) {
          if (prop === name) return fn;
          throw new TypeError(`unexpected access: ${name}.${String(prop)}`);
        },
      });
    return new Proxy({} as Record<string, unknown>, {
      get(_target, prop) {
        if (prop === 'targetAuthorization') return only('findMany', async () => rows);
        if (prop === 'targetEnvironment') {
          return only('findFirst', async () => ({ classification: 'STAGING' }));
        }
        throw new TypeError(`unexpected access: ${String(prop)}`);
      },
    }) as unknown as AuthorizationCheckDb;
  }

  it('returns identical results for identical inputs and never mutates a grant row', async () => {
    const row = deepFreeze(grant());
    const snapshot = JSON.stringify(row);
    const db = strictReadOnlyDb([row]);
    const consumption = deepFreeze(
      new Map([['grant-1', { requestsConsumed: 3, concurrencyInUse: 1 }]]),
    );

    const first = await isAuthorized(db, input({ consumption }));
    const second = await isAuthorized(db, input({ consumption }));

    expect(second).toEqual(first);
    expect(first.outcome).toBe('AUTHORIZED');
    expect(JSON.stringify(row)).toBe(snapshot);
    expect(consumption.get('grant-1')).toEqual({ requestsConsumed: 3, concurrencyInUse: 1 });
  });

  it('harness self-check: the strict db rejects every write-shaped access', () => {
    const db = strictReadOnlyDb([]) as unknown as Record<string, Record<string, unknown>>;
    for (const write of ['update', 'updateMany', 'create', 'delete', 'upsert']) {
      expect(() => db['targetAuthorization']?.[write], write).toThrow(TypeError);
    }
    expect(() => db['auditLogEntry']).toThrow(TypeError);
    expect(() => db['$transaction']).toThrow(TypeError);
  });

  it('does not consume budget as a side effect of an AUTHORIZED check', async () => {
    const row = deepFreeze(grant({ requestBudget: 1 }));
    const db = strictReadOnlyDb([row]);
    // One request of budget, none consumed: repeated checks all pass because the
    // decision never reserves the last unit.
    for (let i = 0; i < 3; i++) {
      await expect(isAuthorized(db, input())).resolves.toMatchObject({ outcome: 'AUTHORIZED' });
    }
  });
});
