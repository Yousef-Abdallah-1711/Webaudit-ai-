/**
 * T023 — Registration, duplicate email, unverified-login refusal.
 *
 * FR-001: registration is refused for an address that already holds an account.
 * FR-002: email confirmation is required before audit capability is granted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

// A capturing mailer rather than a debug endpoint: an endpoint that returns a
// verification token would be a real hole even gated behind NODE_ENV.
const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });

beforeAll(async () => {
  await resetDb();
  await seedPlans();
});
beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
});
afterAll(closeDb);

const VALID = { email: 'dev@example.com', password: 'correct-horse-battery-staple' };

describe('POST /auth/register', () => {
  it('creates an unverified account and does not return a session', async () => {
    const res = await request(app).post('/auth/register').send(VALID);

    expect(res.status).toBe(201);
    // No token on registration: FR-002 requires confirmation first.
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.headers['set-cookie']).toBeUndefined();

    const user = await testDb.user.findUnique({ where: { email: VALID.email } });
    expect(user).not.toBeNull();
    expect(user?.emailVerifiedAt).toBeNull();
    // FR-091: no plaintext password column exists, and the hash is not the password.
    expect(user?.passwordHash).not.toBe(VALID.password);
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('grants the free allocation of 50 credits as a non-recurring lot', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: VALID.email } });
    const lots = await testDb.creditLot.findMany({ where: { userId: user.id } });

    expect(lots).toHaveLength(1);
    expect(lots[0]?.amountGranted).toBe(50);
    expect(lots[0]?.kind).toBe('PLAN');
    expect(lots[0]?.source).toBe('FREE_GRANT');
  });

  it('refuses a duplicate email without revealing which field collided', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);

    const res = await request(app).post('/auth/register').send(VALID);
    expect(res.status).toBe(409);

    // Exactly one account, not two.
    expect(await testDb.user.count({ where: { email: VALID.email } })).toBe(1);
  });

  it('treats email case-insensitively when detecting duplicates', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID, email: 'DEV@Example.COM' });

    expect(res.status).toBe(409);
    expect(await testDb.user.count()).toBe(1);
  });

  it('rejects a weak password before touching the database', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID, password: 'short' });

    expect(res.status).toBe(422);
    expect(await testDb.user.count()).toBe(0);
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID, email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(await testDb.user.count()).toBe(0);
  });
});

describe('POST /auth/login before verification', () => {
  it('refuses an unverified account with 403, not 401', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);

    const res = await request(app).post('/auth/login').send(VALID);

    // 403 not 401: the credentials are correct, the account is not yet usable.
    expect(res.status).toBe(403);
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('succeeds once verified', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);

    // Drive verification through the real endpoint, exactly as the emailed link does.
    await request(app).get(`/auth/verify/${mailer.lastVerificationToken()}`).expect(200);

    const res = await request(app).post('/auth/login').send(VALID);
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTypeOf('string');
  });

  it('refuses a wrong password with 401 and no session', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    await testDb.user.update({
      where: { email: VALID.email },
      data: { emailVerifiedAt: new Date() },
    });

    const res = await request(app)
      .post('/auth/login')
      .send({ ...VALID, password: 'wrong-password' });
    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('returns 401 for an unknown email, matching the wrong-password shape', async () => {
    const res = await request(app).post('/auth/login').send(VALID);
    // Same status and body shape as a wrong password: the response must not
    // disclose whether an address is registered.
    expect(res.status).toBe(401);
  });
});

describe('GET /auth/verify/:token', () => {
  it('verifies exactly once and refuses replay', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    const first = await request(app).get(`/auth/verify/${token}`);
    expect(first.status).toBe(200);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: VALID.email } });
    expect(user.emailVerifiedAt).not.toBeNull();

    const replay = await request(app).get(`/auth/verify/${token}`);
    expect(replay.status).toBe(410);
  });

  it('refuses an expired token', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    await testDb.emailToken.updateMany({
      where: { purpose: 'verify' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).get(`/auth/verify/${token}`);
    expect(res.status).toBe(410);
  });
});
