/**
 * Full auth-system security audit (2026-09-10) — CORS, exercised for real.
 *
 * `app.ts`'s `corsOptions()` carries a deliberate design (no wildcard branch,
 * an explicit allowlist read from `WEB_URL`/`CORS_ORIGINS`, `credentials:
 * true` because the refresh cookie requires it) but nothing in this repo had
 * ever sent a real cross-origin request at it — `grep -li cors` across
 * `apps/api/tests` before this file returned nothing. Cookie-based auth makes
 * CORS a genuine authentication boundary, not decoration: a misconfigured
 * allowlist (a wildcard, or an origin reflected back unchecked) would let any
 * website read another user's authenticated responses via the browser the
 * victim is already signed in on.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';

const mailer = createCapturingMailer();
const ALLOWED_ORIGIN = 'https://app.webaudit.example';
const ATTACKER_ORIGIN = 'https://evil.example';

let savedWebUrl: string | undefined;
let savedCorsOrigins: string | undefined;

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  mailer.clear();
  savedWebUrl = process.env['WEB_URL'];
  savedCorsOrigins = process.env['CORS_ORIGINS'];
  process.env['WEB_URL'] = ALLOWED_ORIGIN;
  delete process.env['CORS_ORIGINS'];
});
afterEach(() => {
  if (savedWebUrl === undefined) delete process.env['WEB_URL'];
  else process.env['WEB_URL'] = savedWebUrl;
  if (savedCorsOrigins === undefined) delete process.env['CORS_ORIGINS'];
  else process.env['CORS_ORIGINS'] = savedCorsOrigins;
});
afterAll(closeDb);

describe('CORS on a credentialed, cookie-based API', () => {
  it('reflects the allowed origin with credentials permitted', async () => {
    const app = createApp({ db: testDb, mailer });
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('sends no CORS header at all for an origin not on the allowlist', async () => {
    const app = createApp({ db: testDb, mailer });
    const res = await request(app).get('/health').set('Origin', ATTACKER_ORIGIN);

    // Not "denied with an error" — simply absent, which is what makes the
    // browser itself refuse the page script access to the response.
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    // The request still completes on the server side (CORS is enforced by
    // the browser, not the server) — but no attacker page can read this body.
    expect(res.status).toBe(200);
  });

  it('never emits a wildcard, even with credentials requested', async () => {
    const app = createApp({ db: testDb, mailer });
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).not.toBe('*');
  });

  it('a disallowed-origin preflight for the credentialed login route gets no CORS header either', async () => {
    const app = createApp({ db: testDb, mailer });
    const res = await request(app)
      .options('/auth/login')
      .set('Origin', ATTACKER_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('an allowed-origin preflight for login is granted exactly the methods and headers it needs', async () => {
    const app = createApp({ db: testDb, mailer });
    const res = await request(app)
      .options('/auth/login')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type');

    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toMatch(/POST/);
  });

  it('a request with no Origin header at all (curl, server-to-server) is never blocked by CORS logic', async () => {
    const app = createApp({ db: testDb, mailer });
    await request(app).get('/health').expect(200);
  });

  it('a trailing slash on the configured WEB_URL does not create two distinct, half-matching origins', async () => {
    process.env['WEB_URL'] = `${ALLOWED_ORIGIN}/`;
    const app = createApp({ db: testDb, mailer });
    const res = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);
    expect(res.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  it('an origin that is a substring/prefix of the allowed origin is refused, not fuzzy-matched', async () => {
    const app = createApp({ db: testDb, mailer });
    // "https://app.webaudit.example.evil.com" contains the allowed origin as
    // a literal prefix — a naive `startsWith`/`includes` check would let it
    // through.
    const res = await request(app).get('/health').set('Origin', `${ALLOWED_ORIGIN}.evil.com`);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});
