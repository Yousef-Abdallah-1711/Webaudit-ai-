/**
 * N01 (DEC-072 / DEC-073 / DEC-074): `POST /scans` with an optional server-validated `profile`, and the SPEC 009 plan
 * path behind its flag. Real PostgreSQL; the queue producer is a stub (the plan is persisted before anything is enqueued).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { totalAvailable } from '../../src/services/credits/balance.js';
import {
  createScanProfile,
  passiveBaselineRegistry,
  type EngineRegistry,
} from '../../src/services/planning/index.js';

const enqueued: string[] = [];
const producer = {
  enqueueFirstPhase: (input: { scanId: string }) => {
    enqueued.push(input.scanId);
    return Promise.resolve({ jobId: `fake:${input.scanId}` });
  },
  enqueuePhaseTwo: (input: { scanId: string }) =>
    Promise.resolve({ jobId: `fake:${input.scanId}` }),
  close: () => Promise.resolve(),
};
const mailer = createCapturingMailer();

function appWith(planIntegration: { registry: EngineRegistry } | null) {
  return createApp({ db: testDb, mailer, scans: { producer, planIntegration } });
}
const off = appWith(null);
const on = appWith({ registry: passiveBaselineRegistry() });

const PASSWORD = 'correct-horse-battery-staple';
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signIn(app: typeof off, email: string): Promise<{ token: string; userId: string }> {
  await request(app).post('/auth/register').send({ email, password: PASSWORD }).expect(201);
  const user = await testDb.user.update({
    where: { email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app)
    .post('/auth/login')
    .send({ email, password: PASSWORD })
    .expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

async function targetFor(app: typeof off, token: string, host = 'example.com'): Promise<string> {
  const res = await request(app)
    .post('/targets')
    .set(auth(token))
    .send({ inputType: 'URL', value: `https://${host}/` })
    .expect(201);
  return (res.body as { target: { id: string } }).target.id;
}

const MODULES = ['SECURITY', 'SEO'] as const;

async function post(
  app: typeof off,
  token: string,
  targetId: string,
  extra: Record<string, unknown> = {},
) {
  const quote = await request(app)
    .post('/scans/quote')
    .set(auth(token))
    .send({ targetId, modules: MODULES })
    .expect(200);
  const acceptedQuote = (quote.body as { quote: { credits: number } }).quote.credits;
  return request(app)
    .post('/scans')
    .set(auth(token))
    .send({ targetId, modules: MODULES, acceptedQuote, ...extra });
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  enqueued.length = 0;
});
afterAll(closeDb);

describe('flag OFF (legacy flow)', () => {
  it('creates a legacy scan with no plan for a request without a profile', async () => {
    const { token } = await signIn(off, 'off-default@example.com');
    const targetId = await targetFor(off, token);
    const res = await post(off, token, targetId).then((r) => r);
    expect(res.status).toBe(201);
    expect(await testDb.scanPlan.count()).toBe(0);
    expect(enqueued).toHaveLength(1);
  });

  it('accepts the documented default profile name and still creates a legacy scan', async () => {
    const { token } = await signIn(off, 'off-named@example.com');
    const targetId = await targetFor(off, token);
    expect((await post(off, token, targetId, { profile: 'PASSIVE_BASELINE' })).status).toBe(201);
    expect(await testDb.scanPlan.count()).toBe(0);
  });

  it('refuses any other profile before charging anything', async () => {
    const { token, userId } = await signIn(off, 'off-other@example.com');
    const targetId = await targetFor(off, token);
    const before = await totalAvailable(testDb, userId);
    const res = await post(off, token, targetId, { profile: 'deep-audit' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: { code: 'PROFILE_UNAVAILABLE', details: { reason: 'EXECUTION_PLANS_DISABLED' } },
    });
    expect(await testDb.scan.count()).toBe(0);
    expect(await totalAvailable(testDb, userId)).toBe(before);
    expect(enqueued).toHaveLength(0);
  });

  it('rejects a malformed profile name', async () => {
    const { token } = await signIn(off, 'off-bad@example.com');
    const targetId = await targetFor(off, token);
    const res = await post(off, token, targetId, { profile: 'bad profile!' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNSUPPORTED_PROFILE');
  });
});

describe('flag ON (isolated)', () => {
  it('persists a RESOLVED passive plan with one PLANNED unit per requested module, charging the same as the legacy flow', async () => {
    const { token, userId } = await signIn(on, 'on-default@example.com');
    const targetId = await targetFor(on, token);
    const before = await totalAvailable(testDb, userId);
    const res = await post(on, token, targetId, {
      // a client can never choose engines or classes: unknown fields are not read
      engineId: 'evil.engine',
      executionClass: 'ACTIVE_SECURITY',
    });
    expect(res.status).toBe(201);
    const scan = (res.body as { scan: { id: string; chargedCredits: number } }).scan;
    const plan = await testDb.scanPlan.findFirstOrThrow({
      where: { scanId: scan.id },
      include: { executionUnits: true },
    });
    expect(plan).toMatchObject({ kind: 'INITIAL', state: 'RESOLVED', userId });
    expect(plan.executionUnits).toHaveLength(MODULES.length);
    for (const unit of plan.executionUnits) {
      expect(unit.status).toBe('PLANNED');
      expect(unit.executionUnitClass).toBe('PASSIVE_HTTP');
      expect(unit.engineId).toMatch(/^baseline\./);
      expect(unit.targetAuthorizationId).toBeNull();
    }
    expect(
      plan.executionUnits.map((u) => (u.configuration as { domain: string }).domain).sort(),
    ).toEqual([...MODULES].sort());
    expect(before - (await totalAvailable(testDb, userId))).toBe(scan.chargedCredits);
    expect(enqueued).toEqual([scan.id]);
  });

  it('answers a duplicate request with the existing 409 and creates no second plan', async () => {
    const { token } = await signIn(on, 'on-dup@example.com');
    const targetId = await targetFor(on, token);
    expect((await post(on, token, targetId)).status).toBe(201);
    expect((await post(on, token, targetId)).status).toBe(409);
    expect(await testDb.scanPlan.count()).toBe(1);
  });

  it('does not let a tenant plan against another tenant target', async () => {
    const owner = await signIn(on, 'on-owner@example.com');
    const intruder = await signIn(on, 'on-intruder@example.com');
    const targetId = await targetFor(on, owner.token, 'example.org');
    expect((await post(on, intruder.token, targetId)).status).toBe(404);
    expect(await testDb.scanPlan.count()).toBe(0);
    expect(await testDb.scan.count()).toBe(0);
  });

  it('refuses an unknown profile with no charge, no scan and no plan', async () => {
    const { token, userId } = await signIn(on, 'on-unknown@example.com');
    const targetId = await targetFor(on, token);
    const before = await totalAvailable(testDb, userId);
    const res = await post(on, token, targetId, { profile: 'does-not-exist' });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('UNSUPPORTED_PROFILE');
    expect(await testDb.scan.count()).toBe(0);
    expect(await totalAvailable(testDb, userId)).toBe(before);
  });

  it('defers a profile that needs a non-passive engine: PROFILE_UNAVAILABLE, nothing charged, nothing enqueued', async () => {
    const { token, userId } = await signIn(on, 'on-deferred@example.com');
    const targetId = await targetFor(on, token);
    await createScanProfile(testDb, 'browser-audit', {
      defaultDomains: ['SECURITY'],
      domainExecutionClasses: { SECURITY: ['BROWSER'] },
    });
    const before = await totalAvailable(testDb, userId);
    const res = await post(on, token, targetId, { profile: 'browser-audit' });
    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({
      error: { code: 'PROFILE_UNAVAILABLE', details: { reason: 'NO_ENGINE_AVAILABLE' } },
    });
    expect(await testDb.scan.count()).toBe(0);
    expect(await testDb.scanPlan.count()).toBe(0);
    expect(await totalAvailable(testDb, userId)).toBe(before);
    expect(enqueued).toHaveLength(0);
  });

  it('plans a system-defined passive profile and records its version on the plan', async () => {
    const { token } = await signIn(on, 'on-named@example.com');
    const targetId = await targetFor(on, token);
    const created = await createScanProfile(testDb, 'passive-security-seo', {
      defaultDomains: ['SECURITY', 'SEO'],
      domainExecutionClasses: { SECURITY: ['PASSIVE_HTTP'], SEO: ['PASSIVE_HTTP'] },
    });
    const res = await post(on, token, targetId, { profile: 'passive-security-seo' });
    expect(res.status).toBe(201);
    const plan = await testDb.scanPlan.findFirstOrThrow({ where: { state: 'RESOLVED' } });
    expect(plan.scanProfileVersionId).toBe(created.version.id);
  });

  it('fails closed when planning is refused after the debit: full refund, scan FAILED, nothing enqueued', async () => {
    const base = passiveBaselineRegistry();
    let calls = 0;
    // passes the pre-debit coverage check, then loses its engines before the resolver reads them
    const flaky: EngineRegistry = {
      templatesFor: (domain, cls) =>
        ++calls <= MODULES.length ? base.templatesFor(domain, cls) : [],
    };
    const app = appWith({ registry: flaky });
    const { token, userId } = await signIn(app, 'on-refused@example.com');
    const targetId = await targetFor(app, token);
    const before = await totalAvailable(testDb, userId);
    const res = await post(app, token, targetId);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('PLAN_REFUSED');
    expect(JSON.stringify(res.body)).not.toMatch(/NO_ENGINE_REGISTERED/);
    const scan = await testDb.scan.findFirstOrThrow({});
    expect(scan.state).toBe('FAILED');
    expect(await totalAvailable(testDb, userId)).toBe(before);
    expect(enqueued).toHaveLength(0);
  });
});
