/**
 * T106 — the three refusals `contracts/http-api.md` names for `POST
 * /scans`: `402` insufficient credits (FR-074), `403` plan or control-level
 * refusal (FR-016, FR-017), `409` duplicate concurrent scan (FR-018). Every
 * case here must refuse *before* any work starts — no `Scan` row, no
 * `CreditTransaction`, nothing queued.
 *
 * **RED right now, and for the right reason** — same as T105
 * (`scans.quote.test.ts`): `/scans` is not mounted in `apps/api/src/app.ts`
 * yet, so every request here gets the catch-all `404`. T110–T112 build the
 * route/service; this file is the executable spec they satisfy.
 *
 * **The FR-017 (control-level) 403 needs a seam that does not exist yet
 * either.** None of the first vertical slice's six capabilities
 * (`headers-checker`, `ssl-analyzer`, `data-leak-scanner`, `owasp-checker`,
 * `meta-checker`, `content-checker`, T119–124) require `VERIFIED` control —
 * they are all passive/observational — so there is no *real* capability
 * today whose selection alone can trigger "every requested check is gated
 * out." Rather than leave FR-017's 403 branch untested until a
 * load-generating capability lands in a later phase, this file follows the
 * same convention `targets.routes.test.ts` already established for
 * `AppDeps.targets` (`{ probe, validateTarget }`): a `scans` seam on
 * `AppDeps` that lets a test substitute which control level a requested
 * module needs, exactly the interface T110–T113 need to expose over the
 * real capability registry anyway. Specifying it here is the executable
 * spec for that interface, not a shortcut around it.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();

/**
 * Every requested module resolves to `NONE` unless a test overrides it —
 * matching the real first-vertical-slice capabilities, none of which are
 * gated. A test that needs an FR-017 403 sets this to `VERIFIED` for the
 * one module it cares about, then restores it in `afterEach`/next
 * `beforeEach`.
 */
const requiredControlLevel = new Map<string, 'NONE' | 'ATTESTED' | 'VERIFIED'>();
const app = createApp({
  db: testDb,
  mailer,
  scans: {
    resolveRequiredControlLevel: (moduleType: string) =>
      requiredControlLevel.get(moduleType) ?? 'NONE',
  },
});

const CREDS = { email: 'refusals@example.com', password: 'correct-horse-battery-staple' };

async function signIn(): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

function auth(bearer: string) {
  return { Authorization: `Bearer ${bearer}` };
}

async function createTarget(bearer: string, inputType = 'URL', value = 'https://example.com/') {
  const res = await request(app)
    .post('/targets')
    .set(auth(bearer))
    .send({ inputType, value })
    .expect(201);
  return (res.body as { target: { id: string } }).target.id;
}

async function quote(
  bearer: string,
  targetId: string,
  modules: readonly string[],
): Promise<number> {
  const res = await request(app)
    .post('/scans/quote')
    .set(auth(bearer))
    .send({ targetId, modules })
    .expect(200);
  return (res.body as { quote: { credits: number } }).quote.credits;
}

let token = '';
let targetId = '';
/**
 * Registration itself grants a free-plan `CreditTransaction` (T038's
 * `grantFreeAllocation`) — every signed-in user here already has exactly
 * one before any `/scans` request. "Charges nothing" means "no *new*
 * transaction", not "the table is empty"; the assertions below compare
 * against this baseline rather than a hardcoded 0.
 */
let baselineTransactionCount = 0;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  requiredControlLevel.clear();
  token = await signIn();
  baselineTransactionCount = await testDb.creditTransaction.count();
  targetId = await createTarget(token);
});
afterAll(closeDb);

describe('POST /scans — 402 insufficient credits (FR-074)', () => {
  it('refuses when the accepted quote exceeds the balance, and charges nothing', async () => {
    // A fresh account's free allocation (50) is below the 80-credit bundle.
    const cost = await quote(token, targetId, ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO']);
    expect(cost).toBe(80);

    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({
        targetId,
        modules: ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'],
        acceptedQuote: cost,
      })
      .expect(402);

    expect(res.body.error.code).toBe('INSUFFICIENT_CREDITS');
    expect(res.body.error.details.required).toBe(80);
    expect(await testDb.scan.count()).toBe(0);
    expect(await testDb.creditTransaction.count()).toBe(baselineTransactionCount);
  });
});

describe('POST /scans — 403 plan refusal (FR-016)', () => {
  it('refuses an input type the free plan does not permit, naming the tier that does', async () => {
    const repoTargetId = await createTarget(token, 'REPOSITORY', 'acme/web-app');
    const cost = await quote(token, repoTargetId, ['SECURITY']);

    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId: repoTargetId, modules: ['SECURITY'], acceptedQuote: cost })
      .expect(403);

    expect(res.body.error.code).toBe('PLAN_UPGRADE_REQUIRED');
    expect(res.body.error.details.inputType).toBe('REPOSITORY');
    // FR-016: "naming the tier that permits it."
    expect(res.body.error.details.requiredTier).toBeTruthy();
    expect(await testDb.scan.count()).toBe(0);
    expect(await testDb.creditTransaction.count()).toBe(baselineTransactionCount);
  });
});

describe('POST /scans — 403 control-level refusal (FR-017)', () => {
  it('refuses when every requested check is gated out on an unverified target', async () => {
    requiredControlLevel.set('SECURITY', 'VERIFIED');
    const cost = await quote(token, targetId, ['SECURITY']);

    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'], acceptedQuote: cost })
      .expect(403);

    expect(res.body.error.code).toBe('CONTROL_LEVEL_REQUIRED');
    expect(res.body.error.details.required).toBe('VERIFIED');
    expect(res.body.error.details.current).toBe('NONE');
    expect(res.body.error.details.methods).toEqual(['FILE', 'DNS']);
    expect(await testDb.scan.count()).toBe(0);
    expect(await testDb.creditTransaction.count()).toBe(baselineTransactionCount);
  });

  it('does NOT refuse the whole scan when only one of several requested checks is gated (US1 scenario 8)', async () => {
    // The contract is explicit: "A scan whose selection includes a gated
    // check still starts; the gated check alone is reported unavailable."
    // This is the boundary T106 draws around T108's own suite — T106 only
    // proves the whole-scan 403 does NOT fire here; the partial-completion
    // behaviour itself belongs to gated-check-partial.test.ts.
    requiredControlLevel.set('SECURITY', 'VERIFIED');
    const cost = await quote(token, targetId, ['SECURITY', 'SEO']);

    await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'], acceptedQuote: cost })
      .expect((res) => {
        if (res.status === 403) {
          throw new Error(
            'a partially-gated selection must not receive the whole-scan 403 CONTROL_LEVEL_REQUIRED',
          );
        }
      });
  });
});

describe('POST /scans — 409 duplicate concurrent scan (FR-018)', () => {
  it('refuses a second scan of the same target while the first is still running', async () => {
    const cost = await quote(token, targetId, ['SECURITY']);
    const first = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'], acceptedQuote: cost })
      .expect(201);
    const firstId = (first.body as { scan: { id: string } }).scan.id;

    const cost2 = await quote(token, targetId, ['SEO']);
    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SEO'], acceptedQuote: cost2 })
      .expect(409);

    expect(res.body.error.code).toBe('DUPLICATE_SCAN');
    expect(res.body.error.details.scanId).toBe(firstId);
    // Only the first scan's charge exists — the refused second request never
    // touched the ledger.
    expect(await testDb.scan.count()).toBe(1);
  });

  it('refuses all but one of N concurrent scans of the same target (review finding H4)', async () => {
    // The read-then-write duplicate check is a TOCTOU race: fired in parallel,
    // every request passes the findFirst before any row is committed. The
    // partial unique index Scan_one_active_per_target is the backstop — exactly
    // one INSERT wins, the rest get 23505 -> P2002 -> 409, and only the winner
    // debits.
    const cost = await quote(token, targetId, ['SECURITY']);
    const attempts = await Promise.all(
      Array.from({ length: 8 }, () =>
        request(app)
          .post('/scans')
          .set(auth(token))
          .send({ targetId, modules: ['SECURITY'], acceptedQuote: cost })
          .then((r) => r.status),
      ),
    );

    const created = attempts.filter((s) => s === 201);
    const refused = attempts.filter((s) => s === 409);
    expect(created).toHaveLength(1);
    expect(refused).toHaveLength(7);

    expect(await testDb.scan.count()).toBe(1);
    // Exactly one new DEBIT beyond the registration free grant.
    const debits = await testDb.creditTransaction.count({
      where: { type: 'DEBIT', reason: 'scan:create' },
    });
    expect(debits).toBe(1);
  });
});
