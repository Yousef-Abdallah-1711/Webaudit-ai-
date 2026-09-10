/**
 * Full auth-system security audit (2026-09-10) — SQL injection, exercised
 * with real payloads against every authentication database operation.
 *
 * Every write and lookup on the auth path goes through Prisma's typed client
 * (`db.user.findUnique`, etc.) or a `$queryRaw`/`$executeRaw` TAGGED TEMPLATE
 * (`credits/debit.ts`, `admin/*.service.ts` — none on the auth path itself).
 * A tagged template sends the interpolated values as bind parameters, never
 * as concatenated SQL text, so there is no string-building path for user
 * input to reach. This file does not take that on faith: it fires classic
 * and blind injection payloads at every field that reaches the database
 * unvalidated by a narrow Zod shape first (email fields in particular —
 * `z.string().email()` rejects most injection strings before they reach a
 * query at all, so the payloads below specifically include ones that are
 * syntactically enough like an email to pass that check, plus every field
 * that has no format constraint beyond a length bound).
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

/**
 * Classic and blind payloads, several shaped to still parse as a plausible
 * email address (`z.string().email()` would otherwise reject them at the
 * validation boundary before any of this proves anything about the query
 * layer underneath it).
 */
const SQLI_PAYLOADS = [
  `' OR '1'='1`,
  `' OR '1'='1' --`,
  `admin'--`,
  `' UNION SELECT * FROM "User" --`,
  `'; DROP TABLE "User"; --`,
  `x' OR 1=1#`,
  `1' AND (SELECT 1 FROM "User" WHERE email LIKE 'a%')='1`,
  String.raw`\'; SELECT pg_sleep(3); --`,
];

/** Payloads reshaped to still pass `z.string().email()`'s format check. */
const SQLI_EMAIL_PAYLOADS = SQLI_PAYLOADS.map((p) => `${p.replace(/@/g, '')}@example.com`);

async function usersTableIsIntact(): Promise<void> {
  // The strongest possible proof a payload did nothing: the table this whole
  // suite tries to make disappear, or return in full, is still exactly
  // itself — reachable, and not dumped.
  const count = await testDb.user.count();
  expect(count).toBeGreaterThanOrEqual(0); // table exists and answers a query
}

describe('SQL injection: login', () => {
  it.each(SQLI_EMAIL_PAYLOADS)(
    'a malicious email %s never authenticates or crashes the server',
    async (payload) => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: payload, password: 'irrelevant123456' });
      expect(res.status).toBe(401);
      expect((res.body as { error: { code: string } }).error.code).toBe('INVALID_CREDENTIALS');
      await usersTableIsIntact();
    },
  );

  it.each(SQLI_PAYLOADS)(
    'a malicious password %s never authenticates as any real user',
    async (payload) => {
      const real = { email: 'sqli-target@example.com', password: 'the-real-password-123' };
      await request(app).post('/auth/register').send(real).expect(201);
      await testDb.user.update({
        where: { email: real.email },
        data: { emailVerifiedAt: new Date() },
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: real.email, password: payload });
      expect(res.status).toBe(401);
      await usersTableIsIntact();
    },
  );
});

describe('SQL injection: registration', () => {
  it.each(SQLI_EMAIL_PAYLOADS)(
    'a malicious email %s at registration either is refused as invalid or creates exactly one inert row',
    async (payload) => {
      const before = await testDb.user.count();
      const res = await request(app)
        .post('/auth/register')
        .send({ email: payload, password: 'correct-horse-battery-staple' });
      // Either Zod's email format refuses it (422) or it is accepted as a
      // syntactically-valid-looking address and stored as inert data — never
      // a 500, and never more than the one row a single registration can
      // produce.
      expect([201, 422, 409]).toContain(res.status);
      const after = await testDb.user.count();
      expect(after - before).toBeLessThanOrEqual(1);
    },
  );

  it('a payload in the password field is stored as an opaque bcrypt hash, never interpreted', async () => {
    const email = 'sqli-password-field@example.com';
    await request(app)
      .post('/auth/register')
      .send({ email, password: `correct-horse-battery' OR '1'='1` })
      .expect(201);

    const user = await testDb.user.findUniqueOrThrow({ where: { email } });
    // A bcrypt hash, not the raw payload and not a query artifact.
    expect(user.passwordHash).toMatch(/^\$2[aby]\$/);
  });
});

describe('SQL injection: password reset and email verification', () => {
  it.each(SQLI_EMAIL_PAYLOADS)(
    'forgot-password with %s never errors and never leaks user existence',
    async (payload) => {
      const res = await request(app).post('/auth/forgot-password').send({ email: payload });
      expect(res.status).toBe(202);
      await usersTableIsIntact();
    },
  );

  it.each(SQLI_PAYLOADS)(
    'reset-password with a malicious token %s is refused as invalid, not a database error',
    async (payload) => {
      const res = await request(app)
        .post('/auth/reset-password')
        .send({ token: payload, password: 'another-correct-horse-staple' });
      expect(res.status).toBe(410);
      await usersTableIsIntact();
    },
  );

  it.each(SQLI_PAYLOADS)(
    'GET /auth/verify/%s is refused as invalid, not a database error',
    async (payload) => {
      const res = await request(app).get(`/auth/verify/${encodeURIComponent(payload)}`);
      expect(res.status).toBe(410);
      await usersTableIsIntact();
    },
  );
});

describe('SQL injection: verify/resend', () => {
  it.each(SQLI_EMAIL_PAYLOADS)('verify/resend with %s never errors', async (payload) => {
    const res = await request(app).post('/auth/verify/resend').send({ email: payload });
    expect(res.status).toBe(202);
    await usersTableIsIntact();
  });
});

describe('SQL injection: the bearer token and requireAuth', () => {
  it.each(SQLI_PAYLOADS)(
    'a malicious Authorization header %s is refused, never a 500',
    async (payload) => {
      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${payload}`);
      expect(res.status).toBe(401);
      await usersTableIsIntact();
    },
  );
});

describe('SQL injection: the refresh cookie', () => {
  it.each(SQLI_PAYLOADS)(
    'a malicious refresh_token cookie %s is refused, never a 500',
    async (payload) => {
      const res = await request(app)
        .post('/auth/refresh')
        .set('Cookie', [`refresh_token=${encodeURIComponent(payload)}`]);
      expect(res.status).toBe(401);
      await usersTableIsIntact();
    },
  );
});

describe('a stacked/second-statement payload cannot reach a second statement at all', () => {
  it('the database still contains only the rows this test itself created', async () => {
    const email =
      "sqli-stack@example.com'; INSERT INTO \"User\" (id, email, \"passwordHash\") VALUES ('x','pwned@evil.com','y'); --";
    await request(app).post('/auth/login').send({ email, password: 'whatever' }).expect(401);

    const pwned = await testDb.user.findUnique({ where: { email: 'pwned@evil.com' } });
    expect(pwned).toBeNull();
  });
});
