/**
 * Full auth-system security audit (2026-09-10) — rate limiting on credential
 * endpoints, actually exercised.
 *
 * `ratelimit.middleware.ts` carries an extensive design rationale (bcrypt cost
 * 12 makes every login attempt real CPU, so an unlimited login endpoint is a
 * denial-of-service primitive) and `app.ts` wires the strict limiter onto
 * every credential path. Neither had ever been exercised by a test: `grep` for
 * `createRateLimiters` or `rateLimiters:` across `apps/api/tests` before this
 * file returned nothing, and `createApp` disables the limiter entirely under
 * `NODE_ENV=test` (`shouldRateLimit()`) so every other suite in this repo runs
 * with it off. A control that no test has ever driven is a control nobody has
 * verified. This file boots the limiter for real — in-memory store, no Redis
 * dependency — against the actual `/auth/*` routes.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import {
  createRateLimiters,
  type RateLimiters,
} from '../../src/middleware/ratelimit.middleware.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
let limiters: RateLimiters;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  // In-memory store (`redisUrl: null`) so this suite needs no Redis and is not
  // sensitive to another test's Redis-backed counters. Small window/limit so
  // the test runs in milliseconds rather than minutes.
  limiters = createRateLimiters({
    redisUrl: null,
    strictLimit: 3,
    strictWindowMs: 60_000,
    generalLimit: 5,
    generalWindowMs: 60_000,
  });
});
afterEach(async () => {
  await limiters.shutdown();
});
afterAll(closeDb);

const CREDS = { email: 'ratelimit@example.com', password: 'correct-horse-battery-staple' };

describe('the strict limiter actually refuses a credential-endpoint brute force', () => {
  it('login: the 4th attempt within the window is refused, the first 3 are not', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: CREDS.email, password: 'wrong-password-attempt' });
      statuses.push(res.status);
    }

    // All 3 within budget are real refusals (401, wrong credentials) — the
    // limiter must not interfere with legitimate traffic under the limit.
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    // The 4th is the limiter itself, not the login logic.
    expect(statuses[3]).toBe(429);
  });

  it('counts successful logins too — a valid-credential replay loop is exactly the CPU-exhaustion vector', async () => {
    await request(createApp({ db: testDb, mailer }))
      .post('/auth/register')
      .send(CREDS)
      .expect(201);
    await testDb.user.update({
      where: { email: CREDS.email },
      data: { emailVerifiedAt: new Date() },
    });

    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/auth/login').send(CREDS);
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
  });

  it('registration spam is refused after the limit, independent of login', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: `spam-${String(i)}@example.com`, password: 'correct-horse-battery-staple' });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([201, 201, 201]);
    expect(statuses[3]).toBe(429);
  });

  it('password-reset request spam is refused after the limit', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/auth/forgot-password').send({ email: CREDS.email });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses[3]).toBe(429);
  });

  it('verification-resend spam is refused after the limit', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const res = await request(app).post('/auth/verify/resend').send({ email: CREDS.email });
      statuses.push(res.status);
    }

    expect(statuses.slice(0, 3)).toEqual([202, 202, 202]);
    expect(statuses[3]).toBe(429);
  });

  it('a client refused by the limiter learns nothing about how close it was', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });
    for (let i = 0; i < 3; i += 1) {
      await request(app).post('/auth/login').send({ email: CREDS.email, password: 'x' });
    }
    const res = await request(app)
      .post('/auth/login')
      .send({ email: CREDS.email, password: 'x' })
      .expect(429);

    expect(JSON.stringify(res.body)).not.toMatch(/\b3\b|\blimit\b|\bwindow\b/i);
    expect(res.headers).toHaveProperty('retry-after');
  });

  it('keys by client IP: a different address gets its own untouched budget', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/auth/login')
        .set('X-Forwarded-For', '203.0.113.5')
        .send({ email: CREDS.email, password: 'x' })
        .expect(401);
    }
    await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '203.0.113.5')
      .send({ email: CREDS.email, password: 'x' })
      .expect(429);

    // A different address is a different bucket, exhausted or not.
    await request(app)
      .post('/auth/login')
      .set('X-Forwarded-For', '198.51.100.9')
      .send({ email: CREDS.email, password: 'x' })
      .expect(401);
  });

  it('login, register, forgot-password, and verify/resend share ONE combined budget per client', async () => {
    // `app.ts` mounts the exact same `limiters.strict` middleware instance —
    // one store, one counter — on every path in `CREDENTIAL_PATHS`. This is
    // not an oversight to route around: a shared budget across every
    // unauthenticated, mail-sending-or-CPU-costly path is a *stricter*
    // posture than N independent budgets would be — it caps an attacker's
    // total sensitive-action rate from one address at 3 (here) regardless of
    // which of these paths they spread the attempts across, closing the gap
    // an independent-budget design would leave (spam registration on one
    // counter while brute-forcing login on another, for a combined rate
    // higher than any single limit implies). Confirmed directly rather than
    // assumed: exhausting the budget on `/login` refuses `/register` too,
    // from the same client, in the same window.
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/auth/login')
        .send({ email: CREDS.email, password: 'x' })
        .expect(401);
    }
    await request(app)
      .post('/auth/register')
      .send({ email: 'shared-budget@example.com', password: 'correct-horse-battery-staple' })
      .expect(429);
  });

  it('a preflight OPTIONS request never spends the credential budget', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    for (let i = 0; i < 5; i += 1) {
      await request(app).options('/auth/login').set('Origin', 'http://localhost:3000');
    }
    // The real budget (3) must still be fully available.
    for (let i = 0; i < 3; i += 1) {
      await request(app)
        .post('/auth/login')
        .send({ email: CREDS.email, password: 'x' })
        .expect(401);
    }
    await request(app).post('/auth/login').send({ email: CREDS.email, password: 'x' }).expect(429);
  });
});

describe('the general limiter covers everything else, including authenticated routes', () => {
  it('refuses excess traffic on a non-credential route once its own (looser) limit is hit', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const res = await request(app).get('/auth/me');
      statuses.push(res.status);
    }
    // Every one of these is unauthenticated (401) until the general limiter's
    // own budget of 5 is spent, then the 6th is refused before auth even runs.
    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('/health is never throttled, by either limiter', async () => {
    const app = createApp({ db: testDb, mailer, rateLimiters: limiters });
    for (let i = 0; i < 20; i += 1) {
      await request(app).get('/health').expect(200);
    }
  });
});
