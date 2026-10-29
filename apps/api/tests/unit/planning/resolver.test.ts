/**
 * SPEC 009 — ScanConfiguration, scan profiles and the Plan Resolver, against the real isolated PostgreSQL
 * and the real F01 `isAuthorized` (a spy wraps it so freshness is observable, never replaced).
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import { makeWorld, type SafetyWorld } from '../../helpers/safety-fixtures.js';
import { isAuthorized } from '../../../src/services/authorization/check.js';
import {
  computePlanDeadline,
  createEngineRegistry,
  createScanProfile,
  parseScanConfiguration,
  passiveBaselineRegistry,
  publishScanProfileVersion,
  resolvePlan,
  resolveScanProfileVersion,
  ScanProfileError,
  type EngineRegistry,
  type EngineTemplateUnit,
  type ResolvePlanDeps,
} from '../../../src/services/planning/index.js';

let seq = 0;
const uniq = (p: string): string =>
  `${p}-${String(++seq)}-${Math.random().toString(36).slice(2, 7)}`;

async function makeScan(world: SafetyWorld): Promise<string> {
  const scan = await testDb.scan.create({
    data: {
      userId: world.userId,
      targetId: world.targetId,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: 10,
      chargedCredits: 10,
      // Terminal: the platform allows one *active* scan per target, and these tests need many plans.
      state: 'COMPLETED',
      completedAt: new Date(),
    },
  });
  return scan.id;
}

const browser = (key: string, o: Partial<EngineTemplateUnit> = {}): EngineTemplateUnit => ({
  key,
  engineId: `test.${key}`,
  executionUnitClass: 'BROWSER',
  timeoutPolicyMs: 600_000,
  hardStopMarginMs: 60_000,
  maxAttempts: 1,
  priority: 1,
  ...o,
});

const registryOf = (templates: EngineTemplateUnit[]): EngineRegistry =>
  createEngineRegistry([{ domain: 'UI', unitClass: 'BROWSER', templates }]);

function deps(
  registry: EngineRegistry,
  spy = vi.fn(isAuthorized.bind(null, testDb as never)),
): ResolvePlanDeps & { spy: typeof spy } {
  return { db: testDb, registry, isAuthorized: (i) => spy(i), spy };
}

/** Passive baseline: a CUSTOM configuration maps every domain to PASSIVE_HTTP. */
const cfgP = (targetId: string, domains: Array<'UI' | 'SECURITY'> = ['UI']) => ({
  targetId,
  profile: { kind: 'CUSTOM' as const, domains },
});
let browserProfileId = '';
/** UI -> BROWSER through a named profile (the engine registry decides the units). */
const cfg = (targetId: string) => ({
  targetId,
  profile: { kind: 'NAMED' as const, scanProfileId: browserProfileId },
});
const NOW = new Date();

beforeAll(async () => {
  await resetDb();
  browserProfileId = await namedBrowserProfile();
});
afterAll(async () => {
  await closeDb();
});

describe('ScanConfiguration', () => {
  const base = { targetId: 't1', profile: { kind: 'CUSTOM', domains: ['SEO'] } };

  it('accepts a valid named and custom configuration', () => {
    expect(parseScanConfiguration(base).ok).toBe(true);
    expect(
      parseScanConfiguration({
        targetId: 't',
        profile: { kind: 'NAMED', scanProfileId: 'p', scanProfileVersion: 2 },
      }).ok,
    ).toBe(true);
  });

  it.each([
    ['not an object', null],
    ['missing target', { profile: base.profile }],
    ['empty domains', { ...base, profile: { kind: 'CUSTOM', domains: [] } }],
    ['unknown domain', { ...base, profile: { kind: 'CUSTOM', domains: ['NOPE'] } }],
    ['duplicate domain', { ...base, profile: { kind: 'CUSTOM', domains: ['SEO', 'SEO'] } }],
    ['unknown top-level key', { ...base, extra: 1 }],
    ['unknown profile kind', { ...base, profile: { kind: 'MAGIC' } }],
    [
      'bad version',
      { targetId: 't', profile: { kind: 'NAMED', scanProfileId: 'p', scanProfileVersion: 0 } },
    ],
    [
      'secret key in perDomainConfig',
      {
        ...base,
        profile: { kind: 'CUSTOM', domains: ['SEO'], perDomainConfig: { SEO: { apiKey: 'x' } } },
      },
    ],
    [
      'nested secret key',
      {
        ...base,
        profile: {
          kind: 'CUSTOM',
          domains: ['SEO'],
          perDomainConfig: { SEO: { a: [{ b: { Authorization: 'x' } }] } },
        },
      },
    ],
    [
      'unknown domain config key',
      { ...base, profile: { kind: 'CUSTOM', domains: ['SEO'], perDomainConfig: { NOPE: {} } } },
    ],
    [
      'oversized perDomainConfig',
      {
        ...base,
        profile: {
          kind: 'CUSTOM',
          domains: ['SEO'],
          perDomainConfig: { SEO: { blob: 'x'.repeat(20_000) } },
        },
      },
    ],
  ])('refuses %s', (_name, input) => {
    const r = parseScanConfiguration(input);
    expect(r.ok).toBe(false);
  });

  it('allows the opaque credentialBindingRef and never echoes a submitted value', () => {
    expect(
      parseScanConfiguration({
        ...base,
        profile: {
          kind: 'CUSTOM',
          domains: ['SEO'],
          perDomainConfig: { SEO: { credentialBindingRef: 'ref-1' } },
        },
      }).ok,
    ).toBe(true);
    const r = parseScanConfiguration({
      ...base,
      profile: {
        kind: 'CUSTOM',
        domains: ['SEO'],
        perDomainConfig: { SEO: { password: 'hunter2-SECRET' } },
      },
    });
    expect(JSON.stringify(r)).not.toContain('hunter2');
  });

  it('survives hostile depth without a stack overflow', () => {
    let deep: Record<string, unknown> = {};
    for (let i = 0; i < 50_000; i++) deep = { n: deep };
    const r = parseScanConfiguration({
      ...base,
      profile: { kind: 'CUSTOM', domains: ['SEO'], perDomainConfig: { SEO: deep } },
    });
    expect(r.ok).toBe(false);
  });
});

describe('scan profiles', () => {
  const v1 = {
    defaultDomains: ['SEO', 'UI'] as const,
    domainExecutionClasses: { SEO: ['PASSIVE_HTTP'], UI: ['PASSIVE_HTTP'] } as never,
  };

  it('creates version 1, publishes new versions, never edits a published one', async () => {
    const slug = uniq('prof');
    const { scanProfileId, version } = await createScanProfile(testDb, slug, {
      ...v1,
      defaultDomains: [...v1.defaultDomains],
    });
    expect(version.version).toBe(1);
    const second = await publishScanProfileVersion(testDb, scanProfileId, {
      defaultDomains: ['SEO'],
      domainExecutionClasses: { SEO: ['PASSIVE_HTTP'] },
    });
    expect(second.version).toBe(2);
    expect((await resolveScanProfileVersion(testDb, scanProfileId)).version).toBe(2);
    const again = await resolveScanProfileVersion(testDb, scanProfileId, 1);
    expect(again.defaultDomains).toEqual(['SEO', 'UI']);
    await expect(
      createScanProfile(testDb, slug, { ...v1, defaultDomains: [...v1.defaultDomains] }),
    ).rejects.toMatchObject({ code: 'SLUG_TAKEN' });
    await expect(resolveScanProfileVersion(testDb, scanProfileId, 99)).rejects.toBeInstanceOf(
      ScanProfileError,
    );
  });

  it.each([
    ['empty domains', { defaultDomains: [], domainExecutionClasses: {} }],
    ['domain without a class', { defaultDomains: ['SEO'], domainExecutionClasses: {} }],
    ['empty class list', { defaultDomains: ['SEO'], domainExecutionClasses: { SEO: [] } }],
    ['unknown class', { defaultDomains: ['SEO'], domainExecutionClasses: { SEO: ['WARP_DRIVE'] } }],
    [
      'duplicate class',
      {
        defaultDomains: ['SEO'],
        domainExecutionClasses: { SEO: ['PASSIVE_HTTP', 'PASSIVE_HTTP'] },
      },
    ],
    [
      'mapped non-default domain',
      {
        defaultDomains: ['SEO'],
        domainExecutionClasses: { SEO: ['PASSIVE_HTTP'], UI: ['PASSIVE_HTTP'] },
      },
    ],
    [
      'duplicate domain',
      { defaultDomains: ['SEO', 'SEO'], domainExecutionClasses: { SEO: ['PASSIVE_HTTP'] } },
    ],
  ])('refuses an invalid profile: %s', async (_n, input) => {
    await expect(createScanProfile(testDb, uniq('bad'), input as never)).rejects.toMatchObject({
      code: 'INVALID_PROFILE',
    });
  });

  it('refuses a bad slug and an unknown profile', async () => {
    await expect(
      createScanProfile(testDb, 'Bad Slug!', { ...v1, defaultDomains: [...v1.defaultDomains] }),
    ).rejects.toMatchObject({ code: 'INVALID_PROFILE' });
    await expect(
      publishScanProfileVersion(testDb, 'nope', { ...v1, defaultDomains: [...v1.defaultDomains] }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('keeps concurrent publishes unique and monotonic', async () => {
    const { scanProfileId } = await createScanProfile(testDb, uniq('conc'), {
      ...v1,
      defaultDomains: [...v1.defaultDomains],
    });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        publishScanProfileVersion(testDb, scanProfileId, {
          defaultDomains: ['SEO'],
          domainExecutionClasses: { SEO: ['PASSIVE_HTTP'] },
        }),
      ),
    );
    const versions = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value.version] : []));
    expect(new Set(versions).size).toBe(versions.length);
    const stored = await testDb.scanProfileVersion.findMany({
      where: { scanProfileId },
      orderBy: { version: 'asc' },
    });
    expect(stored.map((s) => s.version)).toEqual(stored.map((_, i) => i + 1));
  });
});

describe('resolvePlan', () => {
  it('resolves a passive-only plan to the legacy deadline with no grant and no F01 call', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`);
    const scanId = await makeScan(world);
    const d = deps(passiveBaselineRegistry());
    const plan = await resolvePlan(d, cfgP(world.targetId, ['SECURITY', 'UI']), 'INITIAL', NOW, {
      scanId,
    });
    expect(plan.state).toBe('RESOLVED');
    if (plan.state !== 'RESOLVED') return;
    expect(plan.deadlineMs).toBe(900_000);
    expect(plan.units).toHaveLength(2);
    expect(
      plan.units.every((u) => u.targetAuthorizationId === null && u.status === 'PLANNED'),
    ).toBe(true);
    expect(d.spy).not.toHaveBeenCalled();
    const row = (await testDb.scanPlan.findUnique({ where: { id: plan.planId } }))!;
    expect(row).toMatchObject({
      state: 'RESOLVED',
      kind: 'INITIAL',
      scanId,
      userId: world.userId,
      deadlineMs: 900_000,
    });
  });

  it('plans a non-passive graph: grant by reference, checkpoint computed, deadline = computePlanDeadline', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const scanId = await makeScan(world);
    const templates = [
      browser('a'),
      browser('b', { dependsOnKeys: ['a'], timeoutPolicyMs: 300_000 }),
    ];
    const d = deps(registryOf(templates));
    const plan = await resolvePlan(d, cfg(world.targetId), 'INITIAL', NOW, { scanId });
    expect((plan as { refusalReason?: string }).refusalReason ?? 'ok').toBe('ok');
    if (plan.state !== 'RESOLVED') return;
    expect(d.spy).toHaveBeenCalledTimes(1);
    expect(d.spy.mock.calls[0]![0]).toMatchObject({
      targetId: world.targetId,
      userId: world.userId,
      executionClass: 'BROWSER',
    });
    const units = await testDb.executionUnit.findMany({ where: { scanPlanId: plan.planId } });
    expect(units).toHaveLength(2);
    expect(
      units.every(
        (u) =>
          u.targetAuthorizationId === world.grantId &&
          u.requiresSafetyCheckpoint &&
          u.status === 'PLANNED',
      ),
    ).toBe(true);
    expect(units.every((u) => u.idempotencyKey === `${u.id}:1`)).toBe(true);
    const grant = (await testDb.targetAuthorization.findUnique({ where: { id: world.grantId } }))!;
    const expected = computePlanDeadline(
      plan.units.map((u) => ({
        id: u.id,
        executionUnitClass: u.executionUnitClass,
        timeoutPolicyMs: u.key === 'a' ? 600_000 : 300_000,
        hardStopMarginMs: 60_000,
        maxAttempts: 1,
      })),
      plan.edges.map((e) => ({ unitId: e.unitId, dependsOnUnitId: e.dependsOnUnitId })),
      [{ id: grant.id, expiresAt: grant.expiresAt }],
      NOW,
    ) as { deadlineMs: number };
    expect(plan.deadlineMs).toBe(expected.deadlineMs);
    expect(plan.deadlineMs).toBeGreaterThan(1_000_000);
    const edges = await testDb.executionDependency.findMany({
      where: { executionUnitId: { in: units.map((u) => u.id) } },
    });
    expect(edges).toHaveLength(1);
  });

  it('refuses the whole plan, persists no units, when F01 refuses (revoked / no grant / out of scope)', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`);
    const scanId = await makeScan(world);
    await testDb.targetAuthorization.update({
      where: { id: world.grantId },
      data: { revokedAt: new Date() },
    });
    const plan = await resolvePlan(
      deps(registryOf([browser('a')])),
      cfg(world.targetId),
      'INITIAL',
      NOW,
      { scanId },
    );
    expect(plan).toMatchObject({ state: 'REFUSED', refusalReason: 'REVOKED:BROWSER' });
    expect(await testDb.executionUnit.count({ where: { scanPlanId: plan.planId! } })).toBe(0);
    expect(await testDb.scanPlan.findUnique({ where: { id: plan.planId! } })).toMatchObject({
      state: 'REFUSED',
      deadlineMs: null,
    });

    const w2 = await makeWorld(`${uniq('w')}@example.com`, { classes: ['CRAWLER'] });
    const p2 = await resolvePlan(
      deps(registryOf([browser('a')])),
      cfg(w2.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(w2) },
    );
    expect(p2).toMatchObject({ state: 'REFUSED', refusalReason: 'NO_MATCHING_GRANT:BROWSER' });
  });

  it('refuses a non-passive class with no registered engine instead of planning it empty', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`);
    const scanId = await makeScan(world);
    const plan = await resolvePlan(
      deps(passiveBaselineRegistry()),
      { targetId: world.targetId, profile: { kind: 'NAMED', scanProfileId: browserProfileId } },
      'INITIAL',
      NOW,
      { scanId },
    );
    expect(plan).toMatchObject({ state: 'REFUSED' });
    expect((plan as { refusalReason: string }).refusalReason).toMatch(
      /^NO_ENGINE_REGISTERED:UI:BROWSER$/,
    );
  });

  it('calls F01 fresh on every resolution (never cached)', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const d = deps(registryOf([browser('a')]));
    for (let i = 0; i < 3; i++)
      await resolvePlan(d, cfg(world.targetId), 'INITIAL', NOW, { scanId: await makeScan(world) });
    expect(d.spy).toHaveBeenCalledTimes(3);
  });

  it('is deterministic in structure and returns the stored plan for a repeated call (FR-011)', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const t = [
      browser('a'),
      browser('b', { dependsOnKeys: ['a'] }),
      browser('c', { dependsOnKeys: ['a'] }),
    ];
    const shape = (p: Awaited<ReturnType<typeof resolvePlan>>) => {
      if (p.state !== 'RESOLVED') throw new Error('expected RESOLVED');
      const key = new Map(p.units.map((u) => [u.id, u.key]));
      return {
        keys: p.units.map((u) => u.key).sort(),
        edges: p.edges.map((e) => `${key.get(e.unitId)}>${key.get(e.dependsOnUnitId)}`).sort(),
        deadline: p.deadlineMs,
      };
    };
    const one = await resolvePlan(deps(registryOf(t)), cfg(world.targetId), 'INITIAL', NOW, {
      scanId: await makeScan(world),
    });
    const two = await resolvePlan(
      deps(registryOf([...t].reverse())),
      cfg(world.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(world) },
    );
    expect(shape(one)).toEqual(shape(two));

    const scanId = await makeScan(world);
    const d = deps(registryOf(t));
    const first = await resolvePlan(d, cfg(world.targetId), 'INITIAL', NOW, { scanId });
    const second = await resolvePlan(d, cfg(world.targetId), 'INITIAL', NOW, { scanId });
    expect(second).toMatchObject({
      state: 'RESOLVED',
      replayed: true,
      planId: (first as { planId: string }).planId,
    });
    expect(d.spy).toHaveBeenCalledTimes(1);
    expect(await testDb.scanPlan.count({ where: { scanId } })).toBe(1);
  });

  it('creates exactly one plan under concurrent resolution of the same scan', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const scanId = await makeScan(world);
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        resolvePlan(
          deps(registryOf([browser('a'), browser('b', { dependsOnKeys: ['a'] })])),
          cfg(world.targetId),
          'INITIAL',
          NOW,
          { scanId },
        ),
      ),
    );
    expect(new Set(results.map((r) => r.planId)).size).toBe(1);
    expect(await testDb.scanPlan.count({ where: { scanId } })).toBe(1);
    expect(await testDb.executionUnit.count({ where: { scanPlan: { scanId } } })).toBe(2);
  });

  it('refuses a cyclic or dangling template graph and writes nothing', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const cyc = await resolvePlan(
      deps(
        registryOf([
          browser('a', { dependsOnKeys: ['b'] }),
          browser('b', { dependsOnKeys: ['a'] }),
        ]),
      ),
      cfg(world.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(world) },
    );
    expect(cyc).toMatchObject({ state: 'REFUSED', refusalReason: 'cyclic dependency graph' });
    const dangling = await resolvePlan(
      deps(registryOf([browser('a', { dependsOnKeys: ['ghost'] })])),
      cfg(world.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(world) },
    );
    expect((dangling as { refusalReason: string }).refusalReason).toMatch(/unknown dependency/);
    expect(await testDb.executionUnit.count({ where: { userId: world.userId } })).toBe(0);
  });

  it('refuses before any debit when the deadline exceeds the 6 h ceiling or outlives the grant', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const big = Array.from({ length: 24 }, (_, i) =>
      browser(`s${String(i)}`, {
        timeoutPolicyMs: 900_000,
        ...(i > 0 ? { dependsOnKeys: [`s${String(i - 1)}`] } : {}),
      }),
    );
    const over = await resolvePlan(deps(registryOf(big)), cfg(world.targetId), 'INITIAL', NOW, {
      scanId: await makeScan(world),
    });
    expect(over).toMatchObject({
      state: 'REFUSED',
      refusalReason: 'PLAN_DEADLINE_EXCEEDS_CEILING',
    });

    const short = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 60 });
    const grantRefused = await resolvePlan(
      deps(registryOf([browser('a')])),
      cfg(short.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(short) },
    );
    expect(grantRefused).toMatchObject({
      state: 'REFUSED',
      refusalReason: 'GRANT_EXPIRES_BEFORE_DEADLINE',
    });
  });

  it('fails closed to REFUSED when F01 throws or the database is unusable', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`);
    const throwing: ResolvePlanDeps = {
      db: testDb,
      registry: registryOf([browser('a')]),
      isAuthorized: () => Promise.reject(new Error('boom: secret-detail')),
    };
    const r = await resolvePlan(throwing, cfg(world.targetId), 'INITIAL', NOW, {
      scanId: await makeScan(world),
    });
    expect(r).toMatchObject({ state: 'REFUSED', refusalReason: 'INTERNAL_ERROR' });
    expect(JSON.stringify(r)).not.toContain('secret-detail');
    expect(await testDb.executionUnit.count({ where: { userId: world.userId } })).toBe(0);
  });

  it('re-derives tenancy: a scan or target the caller does not own is refused, never planned', async () => {
    const mine = await makeWorld(`${uniq('w')}@example.com`);
    const theirs = await makeWorld(`${uniq('w')}@example.com`);
    const scanId = await makeScan(mine);
    const crossed = await resolvePlan(
      deps(passiveBaselineRegistry()),
      cfgP(theirs.targetId, ['UI']),
      'INITIAL',
      NOW,
      { scanId },
    );
    expect(crossed.state).toBe('REFUSED');
    const ghost = await resolvePlan(
      deps(passiveBaselineRegistry()),
      cfgP(mine.targetId, ['UI']),
      'INITIAL',
      NOW,
      { scanId: 'does-not-exist' },
    );
    expect(ghost).toMatchObject({ state: 'REFUSED', planId: null });
    expect(await testDb.scanPlan.count({ where: { userId: theirs.userId } })).toBe(0);
  });

  it('marks units skipped when an engine precondition is false, and propagates to dependents', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const plan = await resolvePlan(
      deps(
        registryOf([
          browser('a', { skipWhen: () => 'NOT_APPLICABLE' }),
          browser('b', { dependsOnKeys: ['a'] }),
          browser('c'),
        ]),
      ),
      cfg(world.targetId),
      'INITIAL',
      NOW,
      { scanId: await makeScan(world) },
    );
    expect(plan.state).toBe('RESOLVED');
    const rows = await testDb.executionUnit.findMany({
      where: { scanPlanId: (plan as { planId: string }).planId },
    });
    const byEngine = Object.fromEntries(rows.map((r) => [r.engineId, r]));
    expect(byEngine['test.a']).toMatchObject({
      status: 'SKIPPED',
      skippedReason: 'NOT_APPLICABLE',
    });
    expect(byEngine['test.b']).toMatchObject({
      status: 'SKIPPED',
      skippedReason: 'PREDECESSOR_SKIPPED',
    });
    expect(byEngine['test.c']).toMatchObject({ status: 'PLANNED' });
  });

  it('resolves a REVERIFY plan from the finding itself, with the finding location as destination', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`, { durationBudget: 86_400 });
    const scanId = await makeScan(world);
    const mr = await testDb.moduleResult.create({
      data: { scanId, module: 'UI', state: 'COMPLETE', score: 50, summary: 's' },
    });
    const issue = await testDb.issue.create({
      data: {
        scanId,
        moduleResultId: mr.id,
        fingerprint: uniq('fp'),
        checkId: 'c',
        severity: 'HIGH',
        title: 't',
        explanation: 'e',
        consequence: 'c',
        location: '/admin/login',
        attribution: 'MEASURED',
        fixPrompt: 'f',
      },
    });
    const d = deps(registryOf([browser('a')]));
    const plan = await resolvePlan(d, cfgP(world.targetId), 'REVERIFY', NOW, {
      reverifyIssueId: issue.id,
      reverifyClass: 'BROWSER',
    });
    expect(plan.state).toBe('RESOLVED');
    expect(d.spy.mock.calls[0]![0]).toMatchObject({
      destination: { host: 'example.com', path: '/admin/login' },
    });
    expect(
      await testDb.scanPlan.findUnique({ where: { id: (plan as { planId: string }).planId } }),
    ).toMatchObject({
      kind: 'REVERIFY',
      reverifyIssueId: issue.id,
      scanId: null,
      userId: world.userId,
    });
    const bad = await resolvePlan(
      d,
      { targetId: world.targetId, profile: { kind: 'CUSTOM', domains: ['UI', 'SEO'] } },
      'REVERIFY',
      NOW,
      { reverifyIssueId: issue.id },
    );
    expect(bad.state).toBe('REFUSED');
  });

  it('snapshots the profile version it resolved, unaffected by a later publish (FR-003)', async () => {
    const world = await makeWorld(`${uniq('w')}@example.com`);
    const { scanProfileId, version } = await createScanProfile(testDb, uniq('snap'), {
      defaultDomains: ['SEO'],
      domainExecutionClasses: { SEO: ['PASSIVE_HTTP'] },
    });
    const plan = await resolvePlan(
      deps(passiveBaselineRegistry()),
      { targetId: world.targetId, profile: { kind: 'NAMED', scanProfileId } },
      'INITIAL',
      NOW,
      { scanId: await makeScan(world) },
    );
    expect(plan).toMatchObject({ state: 'RESOLVED', scanProfileVersionId: version.id });
    await publishScanProfileVersion(testDb, scanProfileId, {
      defaultDomains: ['UI'],
      domainExecutionClasses: { UI: ['PASSIVE_HTTP'] },
    });
    const stored = await testDb.scanPlan.findUnique({
      where: { id: (plan as { planId: string }).planId },
    });
    expect(stored!.scanProfileVersionId).toBe(version.id);
  });
});

async function namedBrowserProfile(): Promise<string> {
  const { scanProfileId } = await createScanProfile(testDb, uniq('br'), {
    defaultDomains: ['UI'],
    domainExecutionClasses: { UI: ['BROWSER'] },
  });
  return scanProfileId;
}
