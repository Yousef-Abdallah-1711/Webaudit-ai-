/**
 * SPEC 007 (F01) adverse suite — Phase 3 / User Story 1.
 *
 * T010  FR-004   createAuthorization refuses without live ATTESTED+ control
 * T011  FR-015a  PRODUCTION may not be combined with the active classes
 *                (and the SOURCE_EXECUTION exemption is asserted explicitly)
 * T012  FR-011   budget ceilings
 * T011a FR-007   a Scope can never reach past the Target it is granted on
 * T012c FR-001/17a/18a  classifyEnvironment is owner-only and audited
 *
 * Phase 4 / User Story 2 (appended below):
 * T017 FR-014 revocation bites on the next check   T018 FR-012 expiry
 * T019 FR-015 BUDGET_EXHAUSTED via a pre-set consumption stub (SPEC 008 owns metering)
 * T020 FR-016/17/19 revoke authority + non-disclosure   T021 FR-017 operator revoke audit
 *
 * Phase 5 / User Story 3 (appended below):
 * T026 FR-009/FR-016 narrowAuthorization replaces, never edits in place
 *
 * Constitution Principle X: ownership is not authorization, and a verified
 * Target must not become a licence to name some other host. Every refusal here
 * also asserts that nothing was written — a refused grant leaves no row.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { ExecutionClass, TargetEnvironmentClassification } from '@webaudit/types';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import { attestControl } from '../../src/services/control-gate/attest.js';
import { ControlLevelRequiredError } from '../../src/services/control-gate/reconfirm.js';
import type { ControlProbe } from '../../src/services/control-gate/verify.js';
import { createAuthorization } from '../../src/services/authorization/create.js';
import { classifyEnvironment } from '../../src/services/authorization/classify-environment.js';
import { isAuthorized } from '../../src/services/authorization/check.js';
import type { BudgetConsumption } from '../../src/services/authorization/derive-state.js';
import { revokeAuthorization } from '../../src/services/authorization/revoke.js';
import { narrowAuthorization } from '../../src/services/authorization/narrow.js';
import {
  AuthorizationNotFoundError,
  AuthorizationValidationError,
} from '../../src/services/authorization/errors.js';
import type {
  AuthorizationBudgets,
  CreateAuthorizationInput,
  ScopeDefinitionInput,
} from '../../src/services/authorization/types.js';

beforeEach(resetDb);
afterAll(closeDb);

/** Never consulted for ATTESTED targets; fails loudly if a grant path ever probes. */
const probe: ControlProbe = {
  fetchFile: () => Promise.reject(new Error('probe must not be used')),
  resolveTxt: () => Promise.reject(new Error('probe must not be used')),
};

const BUDGETS: AuthorizationBudgets = {
  requestBudget: 1000,
  concurrencyBudget: 5,
  durationBudget: 3600,
};

async function makeUser(email: string): Promise<string> {
  const user = await testDb.user.create({ data: { email, emailVerifiedAt: new Date() } });
  return user.id;
}

async function makeTarget(
  userId: string,
  opts: {
    inputType?: 'URL' | 'REPOSITORY' | 'ARCHIVE';
    canonicalValue?: string;
    attest?: boolean;
  } = {},
): Promise<string> {
  const canonicalValue = opts.canonicalValue ?? 'https://example.com';
  const target = await testDb.target.create({
    data: {
      userId,
      inputType: opts.inputType ?? 'URL',
      canonicalValue,
      displayName: canonicalValue,
    },
  });
  if (opts.attest !== false) await attestControl(testDb, { targetId: target.id, userId });
  return target.id;
}

function webScope(overrides: Partial<ScopeDefinitionInput> = {}): ScopeDefinitionInput {
  return {
    targetKind: 'WEB',
    includedHosts: ['example.com'],
    includedPathPrefixes: [''],
    ...overrides,
  };
}

function repoScope(overrides: Partial<ScopeDefinitionInput> = {}): ScopeDefinitionInput {
  return {
    targetKind: 'REPOSITORY',
    repositoryFullName: 'acme/widgets',
    includedRefs: ['main'],
    includedPathPrefixes: [''],
    ...overrides,
  };
}

function request(
  userId: string,
  targetId: string,
  overrides: Partial<CreateAuthorizationInput> = {},
): CreateAuthorizationInput {
  return {
    targetId,
    requestingUserId: userId,
    executionClasses: ['BROWSER'],
    scope: webScope(),
    environmentRestriction: ['STAGING'],
    budgets: BUDGETS,
    ...overrides,
  };
}

async function writtenRows() {
  return {
    grants: await testDb.targetAuthorization.count(),
    scopes: await testDb.scopeDefinition.count(),
    audits: await testDb.auditLogEntry.count({
      where: { action: { startsWith: 'authorization.' } },
    }),
  };
}

async function expectRefusedWithCode(
  promise: Promise<unknown>,
  code: AuthorizationValidationError['code'],
): Promise<void> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AuthorizationValidationError);
  expect((error as AuthorizationValidationError).code).toBe(code);
  expect(await writtenRows()).toEqual({ grants: 0, scopes: 0, audits: 0 });
}

describe('createAuthorization — happy path and ownership', () => {
  it('creates a grant, its scope and the authorization.granted audit entry', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    const now = new Date('2026-10-25T12:00:00.000Z');

    const grant = await createAuthorization(testDb, request(userId, targetId), probe, now);

    expect(grant).toMatchObject({
      targetId,
      userId,
      grantedBy: userId,
      executionClasses: ['BROWSER'],
      environmentRestriction: ['STAGING'],
      requestBudget: 1000,
      concurrencyBudget: 5,
      durationBudget: 3600,
      revokedAt: null,
    });
    expect(grant.grantedAt.toISOString()).toBe(now.toISOString());
    expect(grant.expiresAt.toISOString()).toBe('2026-10-25T13:00:00.000Z');

    const audit = await testDb.auditLogEntry.findFirstOrThrow({
      where: { action: 'authorization.granted' },
    });
    expect(audit).toMatchObject({
      actorId: userId,
      subjectType: 'TargetAuthorization',
      subjectId: grant.id,
      before: null,
    });
    expect(audit.after).toMatchObject({
      executionClasses: ['BROWSER'],
      scopeId: grant.scopeId,
      environmentRestriction: ['STAGING'],
      budgets: BUDGETS,
    });
  });

  it('refuses a Target owned by someone else exactly as it refuses a nonexistent one', async () => {
    const owner = await makeUser('owner@example.com');
    const stranger = await makeUser('stranger@example.com');
    const targetId = await makeTarget(owner);

    const other = await createAuthorization(testDb, request(stranger, targetId), probe).catch(
      (e: unknown) => e,
    );
    const missing = await createAuthorization(
      testDb,
      request(stranger, 'does-not-exist'),
      probe,
    ).catch((e: unknown) => e);

    expect(other).toBeInstanceOf(AuthorizationNotFoundError);
    expect(missing).toBeInstanceOf(AuthorizationNotFoundError);
    expect((other as Error).message.replace(targetId, 'X')).toBe(
      (missing as Error).message.replace('does-not-exist', 'X'),
    );
    expect(await writtenRows()).toEqual({ grants: 0, scopes: 0, audits: 0 });
  });
});

describe('T010 — FR-004: control level must be ATTESTED or stronger', () => {
  it('refuses when the live-reconfirmed control level is NONE', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId, { attest: false });

    const error = await createAuthorization(testDb, request(userId, targetId), probe).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ControlLevelRequiredError);
    expect(await writtenRows()).toEqual({ grants: 0, scopes: 0, audits: 0 });
  });

  it('does not trust a stored VERIFIED flag with no live verification behind it', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId, { attest: false });
    await testDb.target.update({ where: { id: targetId }, data: { controlLevel: 'VERIFIED' } });

    const error = await createAuthorization(testDb, request(userId, targetId), probe).catch(
      (e: unknown) => e,
    );

    expect(error).toBeInstanceOf(ControlLevelRequiredError);
    expect(await writtenRows()).toEqual({ grants: 0, scopes: 0, audits: 0 });
  });
});

describe('T011 — FR-015a: PRODUCTION with the active classes', () => {
  const ACTIVE: ExecutionClass[] = ['ACTIVE_SECURITY', 'AUTHENTICATED_WORKFLOW', 'LOAD_CAPACITY'];

  for (const executionClass of ACTIVE) {
    it(`refuses PRODUCTION in environmentRestriction alongside ${executionClass}`, async () => {
      const userId = await makeUser('owner@example.com');
      const targetId = await makeTarget(userId);
      await expectRefusedWithCode(
        createAuthorization(
          testDb,
          request(userId, targetId, {
            executionClasses: [executionClass],
            environmentRestriction: ['STAGING', 'PRODUCTION'],
          }),
          probe,
        ),
        'PRODUCTION_NOT_PERMITTED',
      );
    });
  }

  it('refuses when only one of several listed classes is an active class', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    await expectRefusedWithCode(
      createAuthorization(
        testDb,
        request(userId, targetId, {
          executionClasses: ['BROWSER', 'ACTIVE_SECURITY'],
          environmentRestriction: ['PRODUCTION'],
        }),
        probe,
      ),
      'PRODUCTION_NOT_PERMITTED',
    );
  });

  it('ACCEPTS a SOURCE_EXECUTION grant with PRODUCTION (FR-015a exemption, asserted on purpose)', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId, {
      inputType: 'REPOSITORY',
      canonicalValue: 'acme/widgets',
    });

    const grant = await createAuthorization(
      testDb,
      request(userId, targetId, {
        executionClasses: ['SOURCE_EXECUTION'],
        scope: repoScope(),
        environmentRestriction: ['PRODUCTION'],
      }),
      probe,
    );

    expect(grant.environmentRestriction).toEqual(['PRODUCTION']);
  });

  it('allows non-production environments for the active classes', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    const envs: TargetEnvironmentClassification[] = ['STAGING', 'DEVELOPMENT'];
    const grant = await createAuthorization(
      testDb,
      request(userId, targetId, {
        executionClasses: ['ACTIVE_SECURITY'],
        environmentRestriction: envs,
      }),
      probe,
    );
    expect(grant.environmentRestriction).toEqual(envs);
  });
});

describe('T012 — FR-011: budget ceilings', () => {
  const cases: Array<[string, Partial<AuthorizationBudgets>]> = [
    ['requestBudget above 1,000,000', { requestBudget: 1_000_001 }],
    ['concurrencyBudget above 1,000', { concurrencyBudget: 1_001 }],
    ['durationBudget above 2,592,000s', { durationBudget: 2_592_001 }],
    ['requestBudget of 0', { requestBudget: 0 }],
    ['concurrencyBudget of 0', { concurrencyBudget: 0 }],
    ['durationBudget of 0', { durationBudget: 0 }],
    ['a negative budget', { requestBudget: -1 }],
    ['a non-integer budget', { requestBudget: 1.5 }],
    ['a NaN budget', { durationBudget: Number.NaN }],
    ['an infinite budget', { durationBudget: Number.POSITIVE_INFINITY }],
  ];

  for (const [label, override] of cases) {
    it(`refuses ${label}`, async () => {
      const userId = await makeUser('owner@example.com');
      const targetId = await makeTarget(userId);
      await expectRefusedWithCode(
        createAuthorization(
          testDb,
          request(userId, targetId, { budgets: { ...BUDGETS, ...override } }),
          probe,
        ),
        'BUDGET_OUT_OF_RANGE',
      );
    });
  }

  it('accepts exactly the platform maximums', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    const grant = await createAuthorization(
      testDb,
      request(userId, targetId, {
        budgets: { requestBudget: 1_000_000, concurrencyBudget: 1_000, durationBudget: 2_592_000 },
      }),
      probe,
    );
    expect(grant.requestBudget).toBe(1_000_000);
  });
});

describe('request shape — classes and restriction', () => {
  it('refuses empty, duplicated or unrecognized execution classes', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    for (const executionClasses of [
      [],
      ['BROWSER', 'BROWSER'],
      ['PASSIVE_HTTP'],
    ] as unknown as ExecutionClass[][]) {
      await expectRefusedWithCode(
        createAuthorization(testDb, request(userId, targetId, { executionClasses }), probe),
        'EXECUTION_CLASSES_INVALID',
      );
    }
  });

  it('refuses an empty or unrecognized environmentRestriction', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    for (const environmentRestriction of [
      [],
      ['QA'],
    ] as unknown as TargetEnvironmentClassification[][]) {
      await expectRefusedWithCode(
        createAuthorization(testDb, request(userId, targetId, { environmentRestriction }), probe),
        'ENVIRONMENT_RESTRICTION_INVALID',
      );
    }
  });
});

describe('T011a — a Scope can never reach past its own Target (FR-007)', () => {
  async function refused(canonicalValue: string, scope: ScopeDefinitionInput): Promise<void> {
    const userId = await makeUser(`u-${Math.random().toString(36).slice(2)}@example.com`);
    const targetId = await makeTarget(userId, { canonicalValue });
    await expectRefusedWithCode(
      createAuthorization(testDb, request(userId, targetId, { scope }), probe),
      'SCOPE_NOT_BOUNDED_TO_TARGET',
    );
    await resetDb();
  }

  async function accepted(canonicalValue: string, scope: ScopeDefinitionInput): Promise<void> {
    const userId = await makeUser(`u-${Math.random().toString(36).slice(2)}@example.com`);
    const targetId = await makeTarget(userId, { canonicalValue });
    const grant = await createAuthorization(testDb, request(userId, targetId, { scope }), probe);
    expect(grant.id).toBeTruthy();
    await resetDb();
  }

  // The spec writes the Target as `example.com`; real URL targets store the
  // origin. Both forms must bound identically.
  for (const canonicalValue of ['https://example.com', 'example.com']) {
    describe(`Target canonicalValue ${canonicalValue}`, () => {
      it('refuses an unrelated host', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['google.com'] }));
      });

      it('refuses the wildcard *.com', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['*.com'] }));
      });

      it('refuses a bare-suffix look-alike (attackerexample.com)', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['attackerexample.com'] }));
        await refused(canonicalValue, webScope({ includedHosts: ['*.attackerexample.com'] }));
      });

      it('refuses a reversed-contains look-alike (example.com.attacker.net)', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['example.com.attacker.net'] }));
        await refused(canonicalValue, webScope({ includedHosts: ['*.example.com.attacker.net'] }));
      });

      it('refuses a Unicode homograph of the Target host', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['еxample.com'] })); // Cyrillic е
      });

      it('applies the same bound to excludedHosts', async () => {
        await refused(
          canonicalValue,
          webScope({ includedHosts: ['example.com'], excludedHosts: ['google.com'] }),
        );
      });

      it('refuses one bad entry among good ones', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['example.com', 'google.com'] }));
      });

      it('refuses an unparseable host entry rather than guessing', async () => {
        await refused(canonicalValue, webScope({ includedHosts: ['exa mple.com'] }));
        await refused(canonicalValue, webScope({ includedHosts: [''] }));
      });

      it('accepts the Target host, its subdomains and wildcards, in any case or trailing-dot form', async () => {
        for (const host of [
          'example.com',
          'EXAMPLE.COM',
          'Staging.Example.Com',
          'example.com.',
          '*.example.com',
          '*.Staging.Example.com',
          'a.b.example.com',
        ]) {
          await accepted(canonicalValue, webScope({ includedHosts: [host] }));
        }
      });
    });
  }

  it('refuses a REPOSITORY scope whose repositoryFullName differs from the Target', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId, {
      inputType: 'REPOSITORY',
      canonicalValue: 'acme/widgets',
    });
    for (const repositoryFullName of ['acme/other', 'evil/acme/widgets', 'acme/widgets2']) {
      await expectRefusedWithCode(
        createAuthorization(
          testDb,
          request(userId, targetId, {
            executionClasses: ['SOURCE_EXECUTION'],
            scope: repoScope({ repositoryFullName }),
          }),
          probe,
        ),
        'SCOPE_NOT_BOUNDED_TO_TARGET',
      );
    }
  });

  it('accepts a REPOSITORY scope naming exactly the Target repository', async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId, {
      inputType: 'REPOSITORY',
      canonicalValue: 'acme/widgets',
    });
    const grant = await createAuthorization(
      testDb,
      request(userId, targetId, { executionClasses: ['SOURCE_EXECUTION'], scope: repoScope() }),
      probe,
    );
    expect(grant.id).toBeTruthy();
  });

  it('refuses a scope whose kind does not match the Target inputType', async () => {
    const userId = await makeUser('owner@example.com');
    const urlTarget = await makeTarget(userId);
    await expectRefusedWithCode(
      createAuthorization(testDb, request(userId, urlTarget, { scope: repoScope() }), probe),
      'SCOPE_KIND_MISMATCH',
    );
    const repoTarget = await makeTarget(userId, {
      inputType: 'REPOSITORY',
      canonicalValue: 'acme/widgets',
    });
    await expectRefusedWithCode(
      createAuthorization(testDb, request(userId, repoTarget, { scope: webScope() }), probe),
      'SCOPE_KIND_MISMATCH',
    );
  });

  // S-7 (closure 2026-10-28): data-model.md requires an ARCHIVE Target to use the
  // REPOSITORY scope shape ("an archive's content is source regardless of transport").
  // Until now no test created an ARCHIVE Target at all.
  it('treats an ARCHIVE Target as source: a REPOSITORY scope is accepted, a WEB scope is refused', async () => {
    const userId = await makeUser('owner@example.com');
    const archiveKey = 'uploads/owner/0123456789abcdef.zip';
    const targetId = await makeTarget(userId, {
      inputType: 'ARCHIVE',
      canonicalValue: archiveKey,
    });
    await expectRefusedWithCode(
      createAuthorization(testDb, request(userId, targetId, { scope: webScope() }), probe),
      'SCOPE_KIND_MISMATCH',
    );
    const grant = await createAuthorization(
      testDb,
      request(userId, targetId, {
        executionClasses: ['SOURCE_EXECUTION'],
        scope: repoScope({ repositoryFullName: archiveKey }),
      }),
      probe,
    );
    expect(grant.id).toBeTruthy();
  });

  it("refuses a scope that carries the other kind's fields", async () => {
    const userId = await makeUser('owner@example.com');
    const targetId = await makeTarget(userId);
    await expectRefusedWithCode(
      createAuthorization(
        testDb,
        request(userId, targetId, { scope: webScope({ repositoryFullName: 'acme/widgets' }) }),
        probe,
      ),
      'SCOPE_MALFORMED',
    );
  });
});

describe('T012c — classifyEnvironment (FR-001, FR-017a, FR-018a)', () => {
  it('refuses a non-owner with the same shape as a nonexistent Target, and writes nothing', async () => {
    const owner = await makeUser('owner@example.com');
    const stranger = await makeUser('stranger@example.com');
    const targetId = await makeTarget(owner, { attest: false });

    const other = await classifyEnvironment(testDb, {
      targetId,
      actingUserId: stranger,
      classification: 'STAGING',
    }).catch((e: unknown) => e);
    const missing = await classifyEnvironment(testDb, {
      targetId: 'does-not-exist',
      actingUserId: stranger,
      classification: 'STAGING',
    }).catch((e: unknown) => e);

    expect(other).toBeInstanceOf(AuthorizationNotFoundError);
    expect(missing).toBeInstanceOf(AuthorizationNotFoundError);
    expect(await testDb.targetEnvironment.count()).toBe(0);
    expect(
      await testDb.auditLogEntry.count({ where: { action: { startsWith: 'environment.' } } }),
    ).toBe(0);
  });

  it("has no operator variant: there is no way to classify another user's Target", async () => {
    const owner = await makeUser('owner@example.com');
    const operator = await makeUser('operator@example.com');
    const targetId = await makeTarget(owner, { attest: false });
    await expect(
      classifyEnvironment(testDb, {
        targetId,
        actingUserId: operator,
        classification: 'PRODUCTION',
      }),
    ).rejects.toBeInstanceOf(AuthorizationNotFoundError);
  });

  it('writes environment.classified on first call and environment.reclassified on the next', async () => {
    const owner = await makeUser('owner@example.com');
    const targetId = await makeTarget(owner, { attest: false });

    const first = await classifyEnvironment(testDb, {
      targetId,
      actingUserId: owner,
      classification: 'STAGING',
    });
    expect(first).toMatchObject({ targetId, classification: 'STAGING', classifiedBy: owner });

    const second = await classifyEnvironment(testDb, {
      targetId,
      actingUserId: owner,
      classification: 'PRODUCTION',
    });
    expect(second.id).toBe(first.id); // updated in place: one current row per Target
    expect(second.classification).toBe('PRODUCTION');
    expect(await testDb.targetEnvironment.count({ where: { targetId } })).toBe(1);

    const entries = await testDb.auditLogEntry.findMany({
      where: { subjectType: 'TargetEnvironment' },
      orderBy: { createdAt: 'asc' },
    });
    expect(entries.map((e) => e.action)).toEqual([
      'environment.classified',
      'environment.reclassified',
    ]);
    expect(entries[0]).toMatchObject({
      actorId: owner,
      subjectId: first.id,
      before: null,
      after: { classification: 'STAGING' },
    });
    expect(entries[1]).toMatchObject({
      actorId: owner,
      subjectId: first.id,
      before: { classification: 'STAGING' },
      after: { classification: 'PRODUCTION' },
    });
  });

  it('refuses an unrecognized classification and writes nothing', async () => {
    const owner = await makeUser('owner@example.com');
    const targetId = await makeTarget(owner, { attest: false });
    await expect(
      classifyEnvironment(testDb, {
        targetId,
        actingUserId: owner,
        classification: 'QA' as unknown as TargetEnvironmentClassification,
      }),
    ).rejects.toBeInstanceOf(AuthorizationValidationError);
    expect(await testDb.targetEnvironment.count()).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Phase 4 / User Story 2 — revocation, expiry, derived state
// ---------------------------------------------------------------------------

const T0 = new Date('2026-10-25T12:00:00.000Z');
const minutesAfter = (m: number) => new Date(T0.getTime() + m * 60_000);

const webDestination = { host: 'example.com', path: '/', scheme: 'https', port: null } as const;

function check(
  userId: string,
  targetId: string,
  now: Date,
  extra: { consumption?: ReadonlyMap<string, BudgetConsumption> } = {},
) {
  return isAuthorized(testDb, {
    targetId,
    userId,
    executionClass: 'BROWSER',
    destination: webDestination,
    now,
    ...extra,
  });
}

async function makeOperator(email: string): Promise<string> {
  const user = await testDb.user.create({
    data: { email, emailVerifiedAt: new Date(), isOperator: true },
  });
  return user.id;
}

/** An owner, a classified STAGING Target, and one live BROWSER grant created at T0. */
async function grantedFixture() {
  return grantedFixtureFor('owner@example.com');
}

async function grantedFixtureFor(email: string) {
  const ownerId = await makeUser(email);
  const targetId = await makeTarget(ownerId);
  await classifyEnvironment(testDb, {
    targetId,
    actingUserId: ownerId,
    classification: 'STAGING',
  });
  const grant = await createAuthorization(testDb, request(ownerId, targetId), probe, T0);
  return { ownerId, targetId, grant };
}

async function revocationAudits() {
  return testDb.auditLogEntry.findMany({
    where: { action: { in: ['authorization.revoked', 'authorization.revoked_by_operator'] } },
    orderBy: { createdAt: 'asc' },
  });
}

describe('T017 — revocation is effective on the very next check (FR-014)', () => {
  it('AUTHORIZED before revocation, REFUSED/REVOKED for the identical call right after', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();

    await expect(check(ownerId, targetId, minutesAfter(1))).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: grant.id,
    });

    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );

    await expect(check(ownerId, targetId, minutesAfter(1))).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'REVOKED',
      grantId: grant.id,
    });
  });

  it('records revokedAt and revokedBy on the grant', async () => {
    const { ownerId, grant } = await grantedFixture();
    const revoked = await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );
    expect(revoked.revokedAt?.toISOString()).toBe(minutesAfter(2).toISOString());
    expect(revoked.revokedBy).toBe(ownerId);
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt?.toISOString()).toBe(minutesAfter(2).toISOString());
    expect(stored.revokedBy).toBe(ownerId);
  });

  it('revoking one grant leaves a sibling grant on the same Target usable (never merged)', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    const sibling = await createAuthorization(testDb, request(ownerId, targetId), probe, T0);
    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );
    await expect(check(ownerId, targetId, minutesAfter(3))).resolves.toEqual({
      outcome: 'AUTHORIZED',
      grantId: sibling.id,
    });
  });
});

describe('T018 — expiry is distinguishable from revocation (FR-012)', () => {
  it('is AUTHORIZED one millisecond before expiresAt and EXPIRED at expiresAt', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    await expect(
      check(ownerId, targetId, new Date(grant.expiresAt.getTime() - 1)),
    ).resolves.toMatchObject({ outcome: 'AUTHORIZED' });
    await expect(check(ownerId, targetId, grant.expiresAt)).resolves.toEqual({
      outcome: 'REFUSED',
      reason: 'EXPIRED',
      grantId: grant.id,
    });
  });

  it('reports REVOKED, not EXPIRED, for a revoked grant checked before expiry', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );
    const live = await check(ownerId, targetId, minutesAfter(3));
    expect(live).toMatchObject({ reason: 'REVOKED' });
    const afterExpiry = await check(ownerId, targetId, new Date(grant.expiresAt.getTime() + 1000));
    expect(afterExpiry).toMatchObject({ reason: 'REVOKED' });
  });
});

describe('T019 — BUDGET_EXHAUSTED via the pre-set consumption stub (FR-015)', () => {
  // SPEC 008 owns real metering; here consumption is only a caller-supplied input.
  it('refuses BUDGET_EXHAUSTED when pre-set consumption meets a budget, distinct from REVOKED/EXPIRED', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    const exhaustedByRequests = new Map([
      [grant.id, { requestsConsumed: BUDGETS.requestBudget, concurrencyInUse: 0 }],
    ]);
    const exhaustedByConcurrency = new Map([
      [grant.id, { requestsConsumed: 0, concurrencyInUse: BUDGETS.concurrencyBudget }],
    ]);
    for (const consumption of [exhaustedByRequests, exhaustedByConcurrency]) {
      await expect(check(ownerId, targetId, minutesAfter(1), { consumption })).resolves.toEqual({
        outcome: 'REFUSED',
        reason: 'BUDGET_EXHAUSTED',
        grantId: grant.id,
      });
    }
  });

  it('does not report exhaustion without consumption data, and leaves the grant untouched', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    const before = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    await expect(check(ownerId, targetId, minutesAfter(1))).resolves.toMatchObject({
      outcome: 'AUTHORIZED',
    });
    const after = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(after).toEqual(before);
  });
});

describe('T020 — revokeAuthorization authority and non-disclosure (FR-016/017/019)', () => {
  async function failureOf(promise: Promise<unknown>): Promise<AuthorizationNotFoundError> {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(AuthorizationNotFoundError);
    return error as AuthorizationNotFoundError;
  }

  it('gives a non-owner non-operator the same NotFound as a nonexistent id, and changes nothing', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    const strangerId = await makeUser('stranger@example.com');

    const foreign = await failureOf(
      revokeAuthorization(testDb, {
        authorizationId: grant.id,
        actingUserId: strangerId,
        actingUserIsOperator: false,
      }),
    );
    const missing = await failureOf(
      revokeAuthorization(testDb, {
        authorizationId: 'does-not-exist',
        actingUserId: strangerId,
        actingUserIsOperator: false,
      }),
    );

    expect(foreign.name).toBe(missing.name);
    expect(foreign.code).toBe(missing.code);
    expect(foreign.message.replace(grant.id, 'ID')).toBe(
      missing.message.replace('does-not-exist', 'ID'),
    );

    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
    expect(stored.revokedBy).toBeNull();
    expect(await revocationAudits()).toEqual([]);
    await expect(check(ownerId, targetId, minutesAfter(1))).resolves.toMatchObject({
      outcome: 'AUTHORIZED',
    });
  });

  it('does not trust a caller-supplied operator flag: the database isOperator decides', async () => {
    const { grant } = await grantedFixture();
    const impostorId = await makeUser('impostor@example.com'); // isOperator = false in the database
    const error = await failureOf(
      revokeAuthorization(testDb, {
        authorizationId: grant.id,
        actingUserId: impostorId,
        actingUserIsOperator: true,
      }),
    );
    expect(error.code).toBe('NOT_FOUND');
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
    expect(await revocationAudits()).toEqual([]);
  });

  it('does not let a database operator revoke without claiming it either (flag false = owner path only)', async () => {
    const { grant } = await grantedFixture();
    const operatorId = await makeOperator('ops-noclaim@example.com');
    await failureOf(
      revokeAuthorization(testDb, {
        authorizationId: grant.id,
        actingUserId: operatorId,
        actingUserIsOperator: false,
      }),
    );
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
  });
});

describe('T021 — operator revocation is a distinct, audited safety action (FR-017)', () => {
  it('lets an operator revoke another user grant and writes authorization.revoked_by_operator', async () => {
    const { ownerId, targetId, grant } = await grantedFixture();
    const operatorId = await makeOperator('ops@example.com');

    const revoked = await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: operatorId, actingUserIsOperator: true },
      minutesAfter(2),
    );

    expect(revoked.revokedBy).toBe(operatorId);
    expect(revoked.userId).toBe(ownerId); // the grant still belongs to its owner
    const audits = await revocationAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'authorization.revoked_by_operator',
      actorId: operatorId,
      subjectType: 'TargetAuthorization',
      subjectId: grant.id,
      before: { revokedAt: null },
    });
    expect(audits[0]?.after).toEqual({
      revokedAt: minutesAfter(2).toISOString(),
      revokedBy: operatorId,
    });
    await expect(check(ownerId, targetId, minutesAfter(3))).resolves.toMatchObject({
      reason: 'REVOKED',
    });
  });

  it('records an operator revoking their OWN grant as ordinary self-revocation', async () => {
    const operatorId = await makeOperator('ops-owner@example.com');
    const targetId = await makeTarget(operatorId);
    await classifyEnvironment(testDb, {
      targetId,
      actingUserId: operatorId,
      classification: 'STAGING',
    });
    const grant = await createAuthorization(testDb, request(operatorId, targetId), probe, T0);
    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: operatorId, actingUserIsOperator: true },
      minutesAfter(2),
    );
    const audits = await revocationAudits();
    expect(audits.map((a) => a.action)).toEqual(['authorization.revoked']);
  });

  it('writes authorization.revoked (not the operator action) for an owner self-revocation', async () => {
    const { ownerId, grant } = await grantedFixture();
    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );
    const audits = await revocationAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      action: 'authorization.revoked',
      actorId: ownerId,
      subjectType: 'TargetAuthorization',
      subjectId: grant.id,
      before: { revokedAt: null },
    });
    expect(audits[0]?.after).toEqual({
      revokedAt: minutesAfter(2).toISOString(),
      revokedBy: ownerId,
    });
  });
});

describe('revokeAuthorization — idempotent on terminal grants', () => {
  it('a second revocation is a no-op: same row, no new audit entry', async () => {
    const { ownerId, grant } = await grantedFixture();
    const input = {
      authorizationId: grant.id,
      actingUserId: ownerId,
      actingUserIsOperator: false,
    };
    const first = await revokeAuthorization(testDb, input, minutesAfter(2));
    const second = await revokeAuthorization(testDb, input, minutesAfter(5));
    expect(second.revokedAt?.toISOString()).toBe(first.revokedAt?.toISOString());
    expect(second.revokedBy).toBe(ownerId);
    expect(await revocationAudits()).toHaveLength(1);
  });

  it('an already-expired grant is left as it is: no revokedAt, no audit entry', async () => {
    const { ownerId, grant } = await grantedFixture();
    const result = await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      grant.expiresAt,
    );
    expect(result.revokedAt).toBeNull();
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
    expect(await revocationAudits()).toEqual([]);
  });

  it('two concurrent revocations produce exactly one audit entry', async () => {
    const { ownerId, grant } = await grantedFixture();
    const operatorId = await makeOperator('ops-race@example.com');
    const results = await Promise.all([
      revokeAuthorization(
        testDb,
        { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
        minutesAfter(2),
      ),
      revokeAuthorization(
        testDb,
        { authorizationId: grant.id, actingUserId: operatorId, actingUserIsOperator: true },
        minutesAfter(2),
      ),
    ]);
    expect(results.every((row) => row.revokedAt !== null)).toBe(true);
    const audits = await revocationAudits();
    expect(audits).toHaveLength(1);
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedBy).toBe(audits[0]?.actorId);
  });
});

// ---------------------------------------------------------------------------
// Phase 5 / User Story 3 — narrowing by replacement (FR-009, FR-016)
// ---------------------------------------------------------------------------

describe('T026 — narrowAuthorization replaces, never edits (FR-009/FR-016)', () => {
  const narrowedScope = (): ScopeDefinitionInput =>
    webScope({ includedHosts: ['api.example.com'], includedPathPrefixes: ['/v1'] });

  async function narrowFixture() {
    const fixture = await grantedFixture();
    const originalScope = await testDb.scopeDefinition.findUniqueOrThrow({
      where: { id: fixture.grant.scopeId },
    });
    return { ...fixture, originalScope };
  }

  it('revokes the original, creates a new grant on a NEW scope, and never mutates the old scope', async () => {
    const { ownerId, targetId, grant, originalScope } = await narrowFixture();

    const replacement = await narrowAuthorization(
      testDb,
      {
        originalAuthorizationId: grant.id,
        actingUserId: ownerId,
        narrowedScope: narrowedScope(),
      },
      probe,
      minutesAfter(2),
    );

    expect(replacement.id).not.toBe(grant.id);
    expect(replacement.scopeId).not.toBe(grant.scopeId);
    expect(replacement).toMatchObject({
      targetId,
      userId: ownerId,
      grantedBy: ownerId,
      executionClasses: grant.executionClasses,
      environmentRestriction: grant.environmentRestriction,
      revokedAt: null,
    });

    // The original grant is revoked, and nothing else about it changed.
    const original = await testDb.targetAuthorization.findUniqueOrThrow({
      where: { id: grant.id },
    });
    expect(original.revokedAt?.toISOString()).toBe(minutesAfter(2).toISOString());
    expect(original.revokedBy).toBe(ownerId);
    expect({ ...original, revokedAt: null, revokedBy: null }).toEqual({
      ...grant,
      revokedAt: null,
      revokedBy: null,
    });

    // The historical scope row is byte-for-byte what it was.
    const scopeAfter = await testDb.scopeDefinition.findUniqueOrThrow({
      where: { id: grant.scopeId },
    });
    expect(scopeAfter).toEqual(originalScope);
    expect(await testDb.scopeDefinition.count()).toBe(2);

    // Behaviour: only the narrowed destination is authorized now.
    const narrowed = { host: 'api.example.com', path: '/v1/x', scheme: 'https', port: null };
    const broad = { host: 'example.com', path: '/', scheme: 'https', port: null };
    await expect(
      isAuthorized(testDb, {
        targetId,
        userId: ownerId,
        executionClass: 'BROWSER',
        destination: narrowed,
        now: minutesAfter(3),
      }),
    ).resolves.toEqual({ outcome: 'AUTHORIZED', grantId: replacement.id });
    await expect(
      isAuthorized(testDb, {
        targetId,
        userId: ownerId,
        executionClass: 'BROWSER',
        destination: broad,
        now: minutesAfter(3),
      }),
    ).resolves.toMatchObject({ outcome: 'REFUSED' });
  });

  it('writes authorization.granted for the new grant and authorization.replaced on the original', async () => {
    const { ownerId, grant } = await narrowFixture();
    await testDb.auditLogEntry.deleteMany({});
    const replacement = await narrowAuthorization(
      testDb,
      { originalAuthorizationId: grant.id, actingUserId: ownerId, narrowedScope: narrowedScope() },
      probe,
      minutesAfter(2),
    );
    const audits = await testDb.auditLogEntry.findMany({
      where: { action: { startsWith: 'authorization.' } },
      orderBy: { action: 'asc' },
    });
    expect(audits.map((a) => a.action)).toEqual([
      'authorization.granted',
      'authorization.replaced',
    ]);
    expect(audits[0]).toMatchObject({
      actorId: ownerId,
      subjectType: 'TargetAuthorization',
      subjectId: replacement.id,
    });
    expect(audits[1]).toMatchObject({
      actorId: ownerId,
      subjectType: 'TargetAuthorization',
      subjectId: grant.id,
      after: { replacedByGrantId: replacement.id },
    });
  });

  it('defaults request/concurrency to the original and never extends its lifetime', async () => {
    const { ownerId, grant } = await narrowFixture();
    const replacement = await narrowAuthorization(
      testDb,
      { originalAuthorizationId: grant.id, actingUserId: ownerId, narrowedScope: narrowedScope() },
      probe,
      minutesAfter(30),
    );
    expect(replacement.requestBudget).toBe(grant.requestBudget);
    expect(replacement.concurrencyBudget).toBe(grant.concurrencyBudget);
    expect(replacement.expiresAt.getTime()).toBeLessThanOrEqual(grant.expiresAt.getTime());
    expect(replacement.durationBudget).toBeLessThanOrEqual(grant.durationBudget);
  });

  it('accepts lower budgets but refuses any budget above the original (narrowing only)', async () => {
    const { ownerId, grant } = await narrowFixture();
    const lower = await narrowAuthorization(
      testDb,
      {
        originalAuthorizationId: grant.id,
        actingUserId: ownerId,
        narrowedScope: narrowedScope(),
        narrowedBudgets: { requestBudget: 10, concurrencyBudget: 1, durationBudget: 60 },
      },
      probe,
      minutesAfter(2),
    );
    expect(lower).toMatchObject({ requestBudget: 10, concurrencyBudget: 1, durationBudget: 60 });

    const second = await grantedFixtureFor('owner2@example.com');
    for (const narrowedBudgets of [
      { requestBudget: BUDGETS.requestBudget + 1 },
      { concurrencyBudget: BUDGETS.concurrencyBudget + 1 },
      { durationBudget: BUDGETS.durationBudget + 1 },
    ]) {
      await expect(
        narrowAuthorization(
          testDb,
          {
            originalAuthorizationId: second.grant.id,
            actingUserId: second.ownerId,
            narrowedScope: narrowedScope(),
            narrowedBudgets,
          },
          probe,
          minutesAfter(2),
        ),
      ).rejects.toMatchObject({ code: 'BUDGET_OUT_OF_RANGE' });
    }
    const untouched = await testDb.targetAuthorization.findUniqueOrThrow({
      where: { id: second.grant.id },
    });
    expect(untouched.revokedAt).toBeNull();
  });

  it('is atomic: an invalid narrowed scope leaves the original live and writes nothing', async () => {
    const { ownerId, targetId, grant } = await narrowFixture();
    const before = await writtenRows();
    await expect(
      narrowAuthorization(
        testDb,
        {
          originalAuthorizationId: grant.id,
          actingUserId: ownerId,
          narrowedScope: webScope({ includedHosts: ['google.com'] }),
        },
        probe,
        minutesAfter(2),
      ),
    ).rejects.toMatchObject({ code: 'SCOPE_NOT_BOUNDED_TO_TARGET' });
    expect(await writtenRows()).toEqual(before);
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
    await expect(check(ownerId, targetId, minutesAfter(3))).resolves.toMatchObject({
      outcome: 'AUTHORIZED',
    });
  });

  it('gives a non-owner and an operator the same NotFound as a nonexistent grant (no operator variant)', async () => {
    const { grant } = await narrowFixture();
    const strangerId = await makeUser('stranger@example.com');
    const operatorId = await makeOperator('ops@example.com');
    const messages: string[] = [];
    for (const [actingUserId, id] of [
      [strangerId, grant.id],
      [operatorId, grant.id],
      [strangerId, 'does-not-exist'],
    ] as const) {
      const error = await narrowAuthorization(
        testDb,
        { originalAuthorizationId: id, actingUserId, narrowedScope: narrowedScope() },
        probe,
        minutesAfter(2),
      ).then(
        () => null,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(AuthorizationNotFoundError);
      messages.push((error as Error).message.replace(id, 'ID'));
    }
    expect(new Set(messages).size).toBe(1);
    const stored = await testDb.targetAuthorization.findUniqueOrThrow({ where: { id: grant.id } });
    expect(stored.revokedAt).toBeNull();
    expect(await testDb.targetAuthorization.count()).toBe(1);
  });

  it('refuses to narrow a grant that is already revoked or expired', async () => {
    const { ownerId, grant } = await narrowFixture();
    await revokeAuthorization(
      testDb,
      { authorizationId: grant.id, actingUserId: ownerId, actingUserIsOperator: false },
      minutesAfter(2),
    );
    await expect(
      narrowAuthorization(
        testDb,
        {
          originalAuthorizationId: grant.id,
          actingUserId: ownerId,
          narrowedScope: narrowedScope(),
        },
        probe,
        minutesAfter(3),
      ),
    ).rejects.toMatchObject({ code: 'GRANT_NOT_ACTIVE' });

    const other = await grantedFixtureFor('owner3@example.com');
    await expect(
      narrowAuthorization(
        testDb,
        {
          originalAuthorizationId: other.grant.id,
          actingUserId: other.ownerId,
          narrowedScope: narrowedScope(),
        },
        probe,
        other.grant.expiresAt,
      ),
    ).rejects.toMatchObject({ code: 'GRANT_NOT_ACTIVE' });
    expect(await testDb.targetAuthorization.count()).toBe(2);
  });

  it('two concurrent narrowings of one grant: exactly one wins, one replaced audit row', async () => {
    const { ownerId, grant } = await narrowFixture();
    const attempt = () =>
      narrowAuthorization(
        testDb,
        {
          originalAuthorizationId: grant.id,
          actingUserId: ownerId,
          narrowedScope: narrowedScope(),
        },
        probe,
        minutesAfter(2),
      );
    const results = await Promise.allSettled([attempt(), attempt()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason).toMatchObject({ code: 'GRANT_NOT_ACTIVE' });
    expect(await testDb.targetAuthorization.count()).toBe(2);
    expect(await testDb.auditLogEntry.count({ where: { action: 'authorization.replaced' } })).toBe(
      1,
    );
  });
});
