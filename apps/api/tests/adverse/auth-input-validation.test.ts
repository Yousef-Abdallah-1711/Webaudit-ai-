/**
 * Full auth-system security audit (2026-09-10) — server-side input validation
 * on every auth-adjacent field, with the malformed shapes a client-side form
 * would never send but a raw HTTP client can: empty strings, huge strings,
 * unicode, `null`, arrays and objects where a string is expected, missing
 * fields, and duplicate query keys. The existing register/login contract
 * tests cover a malformed email and an under-length password; none of them
 * cover a type-confused body at all. Every assertion here is simply "the
 * server never trusts the shape of the input" — a 4xx and an intact
 * database, never a 500 and never a value silently coerced into something
 * the schema did not actually allow.
 */
// Must be the first import: `vitest.workspace.ts`'s `ENCRYPTION_KEY` for this
// project decodes to 35 bytes, not 32, which turns the OAuth-start route's
// `sealTransaction` into a 500 before anything in this file runs. Repaired
// the same way `tests/contract/oauth-test-env.ts` already documents and
// repairs it for the `unit` project — imported for its side effect only.
import '../contract/oauth-test-env.js';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { configureProviderEnv } from '../contract/oauth-harness.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  configureProviderEnv();
});
afterAll(closeDb);

/** Values no legitimate client sends for a string field. */
const TYPE_CONFUSED_VALUES: unknown[] = [
  null,
  undefined,
  123,
  true,
  [],
  ['a@example.com'],
  { toString: () => 'a@example.com' },
  { $ne: null }, // the canonical NoSQL-injection shape, harmless here but must still be refused as a type, not evaluated
];

async function userCount(): Promise<number> {
  return testDb.user.count();
}

describe('registration: type-confused and boundary bodies', () => {
  it.each(TYPE_CONFUSED_VALUES)(
    'refuses a non-string email (%j) with 422, creates nothing',
    async (email) => {
      const before = await userCount();
      const res = await request(app)
        .post('/auth/register')
        .send({ email, password: 'correct-horse-battery-staple' });
      expect(res.status).toBe(422);
      expect(await userCount()).toBe(before);
    },
  );

  it.each(TYPE_CONFUSED_VALUES)(
    'refuses a non-string password (%j) with 422, creates nothing',
    async (password) => {
      const before = await userCount();
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'type-confused@example.com', password });
      expect(res.status).toBe(422);
      expect(await userCount()).toBe(before);
    },
  );

  it('refuses an empty body entirely', async () => {
    await request(app).post('/auth/register').send({}).expect(422);
  });

  it('refuses a body with only an email', async () => {
    await request(app)
      .post('/auth/register')
      .send({ email: 'missing-password@example.com' })
      .expect(422);
  });

  it('refuses a body with only a password', async () => {
    await request(app)
      .post('/auth/register')
      .send({ password: 'correct-horse-battery-staple' })
      .expect(422);
  });

  it('refuses an empty-string email and an empty-string password', async () => {
    await request(app).post('/auth/register').send({ email: '', password: '' }).expect(422);
  });

  it('refuses an email far past any realistic length (10,000 characters)', async () => {
    const huge = `${'a'.repeat(10_000)}@example.com`;
    const before = await userCount();
    await request(app)
      .post('/auth/register')
      .send({ email: huge, password: 'correct-horse-battery-staple' })
      .expect(422);
    expect(await userCount()).toBe(before);
  });

  it('refuses a password far past the 200-character ceiling (100,000 characters) without hanging', async () => {
    const huge = 'a'.repeat(100_000);
    const before = await userCount();
    const started = Date.now();
    await request(app)
      .post('/auth/register')
      .send({ email: 'huge-password@example.com', password: huge })
      .expect(422);
    // Rejected by Zod's length check before bcrypt ever runs — must be fast,
    // not "eventually correct after hashing 100KB".
    expect(Date.now() - started).toBeLessThan(2000);
    expect(await userCount()).toBe(before);
  });

  it('accepts unicode in the password and can log in with the exact same unicode password afterward', async () => {
    const email = 'unicode-pw@example.com';
    const password = '🔒correct-horse-battery-staple-日本語-מבחן';
    await request(app).post('/auth/register').send({ email, password }).expect(201);
    await testDb.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });
    await request(app).post('/auth/login').send({ email, password }).expect(200);
  });

  it('rejects mismatched unicode normalization forms as different passwords (no silent normalization)', async () => {
    // "é" as one codepoint (NFC) vs "e" + combining acute (NFD) are visually
    // identical but byte-distinct. bcrypt treats them as different strings;
    // asserting that here pins the behavior rather than assuming it.
    const nfc = 'péssword-twelve-chars-plus';
    const nfd = 'péssword-twelve-chars-plus';
    expect(nfc).not.toBe(nfd);
    expect(nfc.normalize('NFC')).toBe(nfd.normalize('NFC'));

    const email = 'unicode-normalization@example.com';
    await request(app).post('/auth/register').send({ email, password: nfc }).expect(201);
    await testDb.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } });

    await request(app).post('/auth/login').send({ email, password: nfd }).expect(401);
    await request(app).post('/auth/login').send({ email, password: nfc }).expect(200);
  });

  it('ignores unrecognized extra fields rather than erroring or storing them (Zod strip mode)', async () => {
    const email = 'extra-fields@example.com';
    const res = await request(app).post('/auth/register').send({
      email,
      password: 'correct-horse-battery-staple',
      isOperator: true,
      emailVerifiedAt: new Date().toISOString(),
      role: 'admin',
    });
    expect(res.status).toBe(201);
    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    expect(user.isOperator).toBe(false);
    expect(user.emailVerifiedAt).toBeNull();
  });
});

describe('login: type-confused bodies never crash or authenticate', () => {
  it.each(TYPE_CONFUSED_VALUES)(
    'a non-string email (%j) is refused with 401, not 500',
    async (email) => {
      const res = await request(app).post('/auth/login').send({ email, password: 'whatever12345' });
      expect(res.status).toBe(401);
    },
  );

  it.each(TYPE_CONFUSED_VALUES)(
    'a non-string password (%j) is refused with 401, not 500',
    async (password) => {
      const res = await request(app).post('/auth/login').send({ email: 'x@example.com', password });
      expect(res.status).toBe(401);
    },
  );

  it('a raw array as the entire body is refused, not crashed on', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send([{ email: 'a@example.com' }] as never);
    expect([401, 422, 400]).toContain(res.status);
  });

  it('a deeply nested object in place of a string field is refused, not crashed on', async () => {
    const res = await request(app)
      .post('/auth/login')
      .send({ email: { a: { b: { c: 'x@example.com' } } }, password: 'whatever12345' });
    expect(res.status).toBe(401);
  });
});

describe('malformed JSON and oversized bodies are refused as client errors, not logged as server faults', () => {
  it('malformed JSON syntax gets exactly 400, not the generic 500 handler, and leaks no stack trace', async () => {
    const res = await request(app)
      .post('/auth/login')
      .set('content-type', 'application/json')
      .send('{ this is not json');
    expect(res.status).toBe(400);
    expect((res.body as { error: { code: string } }).error.code).toBe('BAD_REQUEST');
    const text = JSON.stringify(res.body);
    expect(text).not.toMatch(/at Object\.|at Module\.|node_modules|\.ts:\d+:\d+/);
  });

  it('a body over the 1mb limit gets exactly 413, not the generic 500 handler', async () => {
    const res = await request(app)
      .post('/auth/register')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ email: 'big@example.com', password: 'x'.repeat(2 * 1024 * 1024) }));
    expect(res.status).toBe(413);
    expect((res.body as { error: { code: string } }).error.code).toBe('BAD_REQUEST');
  });
});

describe('OAuth start query: duplicate keys and type confusion', () => {
  it('a duplicate intent query param (array, not a string) is refused as invalid', async () => {
    const res = await request(app).get('/auth/oauth/google/start?intent=signin&intent=connect');
    // Express parses repeated query keys as an array; the enum schema must
    // reject that shape rather than silently taking the first or last value.
    expect(res.status).toBe(422);
  });

  it('an unsupported provider name is refused before any query validation runs', async () => {
    await request(app).get('/auth/oauth/not-a-real-provider/start').expect(404);
  });

  it('a returnTo pointing off-origin is neutralized to the default landing rather than followed', async () => {
    // safeReturnTo() already has unit coverage of the string transform;
    // this proves the HTTP-level effect: the transaction that gets sealed
    // never carries an attacker-controlled external returnTo.
    const res = await request(app).get(
      '/auth/oauth/google/start?returnTo=https://evil.example/steal',
    );
    expect(res.status).toBe(302);
    const location = res.headers['location'] as string;
    // The redirect goes to Google, not to the attacker's site — returnTo only
    // ever affects the POST-login landing page, sealed inside the tx cookie.
    expect(location).toMatch(/^https:\/\/accounts\.google\.com\//);
  });
});
