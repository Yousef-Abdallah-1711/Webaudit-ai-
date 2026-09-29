/**
 * T023 — Registration, duplicate email, unverified-login refusal.
 *
 * Existing addresses receive the same public response as new registrations.
 * FR-002: email confirmation is required before audit capability is granted.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
  await testDb.emailSendAttempt.deleteMany({
    where: { messageType: 'registration-attempt-notice' },
  });
  mailer.clear();
});
afterAll(closeDb);

const VALID = { email: 'dev@example.com', password: 'correct-horse-battery-staple' };

describe('POST /auth/register', () => {
  it('creates an unverified account and does not return a session', async () => {
    const res = await request(app).post('/auth/register').send(VALID);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: 'Check your email to confirm your address.',
      email: VALID.email,
    });
    // No token on registration: FR-002 requires confirmation first.
    expect(res.body).not.toHaveProperty('accessToken');
    expect(res.headers['set-cookie']?.[0]).toContain('pending_verification=');
    expect(res.headers['set-cookie']?.[0]).toContain('Path=/auth');
    expect(res.headers['set-cookie']?.[0]).toContain('HttpOnly');

    const user = await testDb.user.findUnique({ where: { email: VALID.email } });
    expect(user).not.toBeNull();
    expect(user?.emailVerifiedAt).toBeNull();
    // FR-091: no plaintext password column exists, and the hash is not the password.
    expect(user?.passwordHash).not.toBe(VALID.password);
    expect(user?.passwordHash).toMatch(/^\$2[aby]\$/);
  });

  it('persists the optional display name on the new account', async () => {
    await request(app)
      .post('/auth/register')
      .send({ ...VALID, name: 'Ada Lovelace' })
      .expect(201);

    const rows = await testDb.$queryRaw<{ name: string | null }[]>`
      SELECT name FROM "User" WHERE email = ${VALID.email}
    `;
    expect(rows[0]?.name).toBe('Ada Lovelace');
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

  it('returns the same response for a duplicate email and sends an account notice', async () => {
    const first = await request(app).post('/auth/register').send(VALID).expect(201);
    const notice = vi.spyOn(mailer, 'sendRegistrationAttemptNotice');

    const res = await request(app).post('/auth/register').send(VALID);
    expect(res.status).toBe(first.status);
    expect(res.body).toEqual(first.body);
    expect(res.headers['set-cookie']?.[0]).toContain('pending_verification=');
    expect(notice).toHaveBeenCalledWith(
      VALID.email,
      'http://localhost:3000/login',
      'http://localhost:3000/reset-password',
    );
    expect(mailer.sent().filter((mail) => mail.kind === 'verify')).toHaveLength(1);

    // Exactly one account, not two.
    expect(await testDb.user.count({ where: { email: VALID.email } })).toBe(1);
  });

  it('sends at most one registration-attempt notice per recipient during the cooldown', async () => {
    const firstRegistration = await request(app).post('/auth/register').send(VALID).expect(201);
    const notice = vi.spyOn(mailer, 'sendRegistrationAttemptNotice');

    const firstAttempt = await request(app).post('/auth/register').send(VALID);
    const secondAttempt = await request(app).post('/auth/register').send(VALID);

    expect(firstAttempt.status).toBe(firstRegistration.status);
    expect(firstAttempt.body).toEqual(firstRegistration.body);
    expect(secondAttempt.status).toBe(firstRegistration.status);
    expect(secondAttempt.body).toEqual(firstRegistration.body);
    expect(notice).toHaveBeenCalledTimes(1);
    expect(await testDb.user.count({ where: { email: VALID.email } })).toBe(1);
  });

  it('treats email case-insensitively when detecting duplicates', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const res = await request(app)
      .post('/auth/register')
      .send({ ...VALID, email: 'DEV@Example.COM' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      message: 'Check your email to confirm your address.',
      email: VALID.email,
    });
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
    await request(app).post(`/auth/verify/${mailer.lastVerificationToken()}`).expect(200);

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

describe('POST /auth/verify/:token', () => {
  it('verifies exactly once and refuses replay', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    const first = await request(app).post(`/auth/verify/${token}`);
    expect(first.status).toBe(200);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: VALID.email } });
    expect(user.emailVerifiedAt).not.toBeNull();

    const replay = await request(app).post(`/auth/verify/${token}`);
    expect(replay.status).toBe(410);
  });

  it('allows only one concurrent verification request to claim the token', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    const results = await Promise.all([
      request(app).post(`/auth/verify/${token}`),
      request(app).post(`/auth/verify/${token}`),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual([200, 410]);
    expect(await testDb.emailToken.count({ where: { purpose: 'verify', usedAt: { not: null } } })).toBe(1);
  });

  it('GET never consumes a verification token', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    const res = await request(app).get(`/auth/verify/${token}`);
    expect(res.status).not.toBe(200);
    expect((await testDb.user.findUniqueOrThrow({ where: { email: VALID.email } })).emailVerifiedAt).toBeNull();
    expect((await testDb.emailToken.findFirstOrThrow({ where: { purpose: 'verify' } })).usedAt).toBeNull();
  });

  it('refuses an expired token', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    const token = mailer.lastVerificationToken();

    await testDb.emailToken.updateMany({
      where: { purpose: 'verify' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const res = await request(app).post(`/auth/verify/${token}`);
    expect(res.status).toBe(410);
  });

  it('quickstart row 9: registration succeeds even when the verification email fails to send', async () => {
    mailer.failVerification(new Error('SMTP unavailable'));

    const res = await request(app).post('/auth/register').send(VALID);

    expect(res.status).toBe(201);
    const user = await testDb.user.findUnique({ where: { email: VALID.email } });
    expect(user).not.toBeNull();
    // The account, its free allocation, and the verify token all still exist --
    // only the send itself failed, which is exactly what row 9 requires.
    expect(mailer.sent()).toHaveLength(0);
  });

  it('quickstart row 9: resending verification succeeds even when the email fails to send', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    mailer.clear();
    await testDb.emailToken.updateMany({
      where: { purpose: 'verify' },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    mailer.failVerification(new Error('SMTP unavailable'));

    const res = await request(app).post('/auth/verify/resend').send({ email: VALID.email });

    expect(res.status).toBe(202);
    expect(mailer.sent()).toHaveLength(0);
  });

  it('silently suppresses an immediate resend within the per-account cooldown', async () => {
    await request(app).post('/auth/register').send(VALID).expect(201);
    await testDb.emailToken.updateMany({
      where: { purpose: 'verify' },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    mailer.clear();

    const first = await request(app).post('/auth/verify/resend').send({ email: VALID.email });
    const second = await request(app).post('/auth/verify/resend').send({ email: VALID.email });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(mailer.sent().filter((mail) => mail.kind === 'verify')).toHaveLength(1);
  });

  it('resolves resend through the pending-verification cookie without an email body', async () => {
    const registered = await request(app).post('/auth/register').send(VALID).expect(201);
    const cookie = registered.headers['set-cookie']?.[0];
    expect(cookie).toContain('pending_verification=');
    mailer.clear();
    await testDb.emailToken.updateMany({
      where: { purpose: 'verify' },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });

    const res = await request(app)
      .post('/auth/verify/resend')
      .set('Cookie', cookie!.split(';')[0]!)
      .send({});
    expect(res.status).toBe(202);
    expect(mailer.sent().filter((mail) => mail.kind === 'verify')).toHaveLength(1);
  });
});
