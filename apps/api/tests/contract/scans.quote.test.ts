/**
 * T105 — FR-011/FR-012: `POST /scans/quote` states the exact cost of a
 * selection and charges nothing; `POST /scans` refuses to start chargeable
 * work without an explicit `acceptedQuote`, and that quote must still match
 * the current price — no silent reprice between quote and accept.
 *
 * **RED right now, and for the right reason.** No `/scans` route is mounted
 * anywhere in `apps/api/src/app.ts` yet — every request in this file hits
 * the catch-all `404 { error: { code: 'NOT_FOUND' } }`. T110 (quote
 * calculation), T111 (scan creation), and T112 (wiring the routes) are what
 * turn this file green; it is the executable spec they satisfy, not a test
 * of anything that exists today.
 *
 * The credit figures below (`SECURITY`=20, `SEO`=10, all-5 bundle=80) come
 * straight from `packages/config/src/pricing.ts`'s `AREA_COST`/
 * `quoteAreas()` — already built, already tested in isolation
 * (`packages/config`'s own suite) — this file is what proves the HTTP
 * surface actually calls it rather than reinventing the numbers.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

const CREDS = { email: 'quote@example.com', password: 'correct-horse-battery-staple' };

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

async function createTarget(bearer: string): Promise<string> {
  const res = await request(app)
    .post('/targets')
    .set(auth(bearer))
    .send({ inputType: 'URL', value: 'https://example.com/' })
    .expect(201);
  return (res.body as { target: { id: string } }).target.id;
}

let token = '';
let targetId = '';
/**
 * Registration itself grants a free-plan `CreditTransaction` (T038's
 * `grantFreeAllocation`, run inside `registration.service.ts`) — every
 * signed-in user in this file already has exactly one before any `/scans`
 * request. "Charges nothing" therefore means "no *new* transaction", not
 * "the table is empty"; the assertions below compare against this baseline
 * rather than a hardcoded 0.
 */
let baselineTransactionCount = 0;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  token = await signIn();
  targetId = await createTarget(token);
  baselineTransactionCount = await testDb.creditTransaction.count();
});
afterAll(closeDb);

describe('POST /scans/quote', () => {
  it('quotes a partial selection as the sum of its area costs (FR-011)', async () => {
    const res = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'] })
      .expect(200);

    expect(res.body.quote.credits).toBe(30); // SECURITY 20 + SEO 10
    expect(res.body.quote.modules).toEqual(['SECURITY', 'SEO']);
  });

  it('bundles all 5 areas to 80, not the 95 sum of individual costs', async () => {
    const res = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['PERFORMANCE', 'SECURITY', 'UI', 'TESTING', 'SEO'] })
      .expect(200);

    expect(res.body.quote.credits).toBe(80);
  });

  it('charges nothing: no CreditTransaction and no Scan row is written', async () => {
    await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'] })
      .expect(200);

    expect(await testDb.creditTransaction.count()).toBe(baselineTransactionCount);
    expect(await testDb.scan.count()).toBe(0);
  });

  it('rejects an empty selection rather than quoting 0 and letting it through', async () => {
    const res = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: [] })
      .expect(400);
    expect(res.body.error.code).toBe('INVALID_REQUEST');
  });

  it('requires authentication', async () => {
    await request(app)
      .post('/scans/quote')
      .send({ targetId, modules: ['SECURITY'] })
      .expect(401);
  });
});

describe('POST /scans — quote-then-accept (FR-012)', () => {
  it('refuses to start without an acceptedQuote', async () => {
    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'] })
      .expect(400);

    expect(res.body.error.code).toBe('INVALID_REQUEST');
    expect(await testDb.scan.count()).toBe(0);
  });

  it('refuses a stale or fabricated acceptedQuote — no silent reprice', async () => {
    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY'], acceptedQuote: 999 })
      .expect(422);

    expect(res.body.error.code).toBe('QUOTE_MISMATCH');
    expect(await testDb.scan.count()).toBe(0);
    expect(await testDb.creditTransaction.count()).toBe(baselineTransactionCount);
  });

  it('starts and charges exactly the accepted quote, no more and no less', async () => {
    const quote = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: ['SECURITY', 'SEO'] })
      .expect(200);

    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({
        targetId,
        modules: ['SECURITY', 'SEO'],
        acceptedQuote: (quote.body as { quote: { credits: number } }).quote.credits,
      })
      .expect(201);

    expect(res.body.scan.quotedCredits).toBe(30);

    const row = await testDb.scan.findUniqueOrThrow({
      where: { id: (res.body as { scan: { id: string } }).scan.id },
    });
    expect(row.chargedCredits).toBe(30);
  });
});
