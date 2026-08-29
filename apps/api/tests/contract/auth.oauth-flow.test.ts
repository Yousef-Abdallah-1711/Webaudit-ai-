/**
 * T030 — `GET /auth/oauth/:provider/start` and `/callback`.
 *
 * FR-003 (sign in with a provider, provider-confirmed address counts as
 * confirmed) and FR-004 (a matching confirmed address joins the existing
 * account) over HTTP, end to end, with every provider response stubbed.
 *
 * The two failures these tests exist to prevent:
 *
 *  - **Login CSRF.** A callback whose `state` does not match the one we minted
 *    must be refused *before* the authorisation code is used. If the exchange
 *    runs first, an attacker can plant their own code in a victim's callback
 *    and silently sign the victim into the attacker's account. So these tests
 *    assert not only the status but that the provider was never called.
 *  - **Takeover via an unverified provider address.** If a provider hands us an
 *    address it has not confirmed, anyone who can claim that address there
 *    inherits the local account.
 */

// Must be first: src/config/env.ts reads process.env at import time.
import './oauth-test-env.js';
import { createHash } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import {
  GOOGLE_ACCESS_TOKEN,
  cookieValue,
  cookiesOf,
  configureProviderEnv,
  createOAuthTestApp,
  createProviderStub,
  githubStub,
  googleStub,
  type ProviderStub,
} from './oauth-harness.js';
import {
  OAUTH_TX_COOKIE,
  redirectUriFor,
  sealTransaction,
} from '../../src/services/auth/oauth-flow.service.js';

beforeAll(configureProviderEnv);
beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

const EMAIL = 'social@example.com';

interface Started {
  app: Express;
  stub: ProviderStub;
  authorize: URL;
  state: string;
  cookies: string[];
}

/** Runs `/start` and returns everything the callback step needs. */
async function start(stub: ProviderStub, provider = 'google', query = ''): Promise<Started> {
  const app = createOAuthTestApp(stub.http);
  const res = await request(app).get(`/auth/oauth/${provider}/start${query}`);
  expect(res.status).toBe(302);

  const authorize = new URL(String(res.headers['location']));
  const state = authorize.searchParams.get('state');
  expect(state).toBeTruthy();
  return { app, stub, authorize, state: state ?? '', cookies: cookiesOf(res.headers) };
}

function callback(s: Started, params: Record<string, string>, provider = 'google') {
  return request(s.app)
    .get(`/auth/oauth/${provider}/callback`)
    .query(params)
    .set('Cookie', s.cookies);
}

describe('GET /auth/oauth/:provider/start', () => {
  it('redirects to the provider with state and an S256 PKCE challenge', async () => {
    const s = await start(googleStub({ email: EMAIL, emailVerified: true }));

    expect(s.authorize.origin + s.authorize.pathname).toBe(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );
    const q = s.authorize.searchParams;
    expect(q.get('response_type')).toBe('code');
    expect(q.get('client_id')).toBe('google-test-client-id');
    expect(q.get('redirect_uri')).toBe('https://api.webaudit.test/auth/oauth/google/callback');
    expect(q.get('scope')).toContain('email');
    expect(q.get('state')?.length).toBeGreaterThanOrEqual(20);
    expect(q.get('code_challenge_method')).toBe('S256');
    expect(q.get('code_challenge')?.length).toBeGreaterThanOrEqual(43);
    // The challenge is a hash, so the verifier must not be in the URL.
    expect(s.authorize.search).not.toContain('code_verifier');
    // The client secret must never leave the server.
    expect(s.authorize.search).not.toContain('google-test-client-secret');
  });

  it('stores the pending transaction in an httpOnly cookie, sealed', async () => {
    const s = await start(googleStub({ email: EMAIL, emailVerified: true }));

    const raw = s.cookies.find((c) => c.startsWith(`${OAUTH_TX_COOKIE}=`));
    expect(raw).toBeDefined();
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/SameSite=Lax/i);

    // Sealed, not merely encoded: neither the state nor the verifier is
    // readable in the cookie a browser holds.
    const value = cookieValue(s.cookies, OAUTH_TX_COOKIE) ?? '';
    expect(value).not.toContain(s.state);
    expect(value).not.toContain('codeVerifier');
  });

  it('refuses a provider it does not support', async () => {
    const app = createOAuthTestApp(createProviderStub({}).http);
    const res = await request(app).get('/auth/oauth/myspace/start');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'PROVIDER_UNSUPPORTED' } });
  });

  describe('when the provider is not configured on this deployment', () => {
    let saved: string | undefined;
    beforeEach(() => {
      saved = process.env['GITHUB_OAUTH_CLIENT_SECRET'];
      delete process.env['GITHUB_OAUTH_CLIENT_SECRET'];
    });
    afterEach(() => {
      if (saved !== undefined) process.env['GITHUB_OAUTH_CLIENT_SECRET'] = saved;
    });

    it('says so plainly instead of crashing', async () => {
      const app = createOAuthTestApp(createProviderStub({}).http);
      const res = await request(app).get('/auth/oauth/github/start');

      expect(res.status).toBe(501);
      expect(res.body).toMatchObject({ error: { code: 'PROVIDER_NOT_CONFIGURED' } });
      // And it does not name the variable's value anywhere.
      expect(JSON.stringify(res.body)).not.toContain('client_secret');
    });
  });
});

describe('GET /auth/oauth/:provider/callback — refusals', () => {
  it('refuses a mismatched state WITHOUT calling the provider', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: 'not-the-state-we-minted' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_STATE_INVALID' } });
    // The point of the test: no token exchange, no profile fetch, nothing.
    expect(stub.calls).toEqual([]);
    expect(await testDb.user.count()).toBe(0);
  });

  it('refuses a callback with no state at all', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code' });

    expect(res.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it('refuses a callback with no pending transaction cookie', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const app = createOAuthTestApp(stub.http);

    const res = await request(app)
      .get('/auth/oauth/google/callback')
      .query({ code: 'provider-code', state: 'anything' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_STATE_INVALID' } });
    expect(stub.calls).toEqual([]);
  });

  it('refuses a tampered transaction cookie', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    // Flip the last character of the sealed value. GCM authentication fails.
    const sealed = cookieValue(s.cookies, OAUTH_TX_COOKIE) ?? '';
    const flipped = sealed.slice(0, -1) + (sealed.endsWith('A') ? 'B' : 'A');

    const res = await request(s.app)
      .get('/auth/oauth/google/callback')
      .query({ code: 'provider-code', state: s.state })
      .set('Cookie', [`${OAUTH_TX_COOKIE}=${flipped}`]);

    expect(res.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it('refuses an expired transaction', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const app = createOAuthTestApp(stub.http);
    const state = 'a'.repeat(43);
    const expired = sealTransaction({
      provider: 'google',
      intent: 'signin',
      state,
      codeVerifier: 'v'.repeat(48),
      redirectUri: redirectUriFor('google', 'signin'),
      returnTo: '',
      expiresAt: Date.now() - 1000,
    });

    const res = await request(app)
      .get('/auth/oauth/google/callback')
      .query({ code: 'provider-code', state })
      .set('Cookie', [`${OAUTH_TX_COOKIE}=${expired}`]);

    expect(res.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it('refuses a transaction started for a different provider', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state }, 'github');

    expect(res.status).toBe(400);
    expect(stub.calls).toEqual([]);
  });

  it('reports a provider-side refusal without touching the token endpoint', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { error: 'access_denied', state: s.state });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_DENIED' } });
    expect(stub.calls).toEqual([]);
  });

  it('refuses an unverified provider email — the takeover vector', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: false });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state });

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ error: { code: 'PROVIDER_EMAIL_UNVERIFIED' } });
    // No account, and no session.
    expect(await testDb.user.count()).toBe(0);
    expect(await testDb.refreshToken.count()).toBe(0);
    expect(cookiesOf(res.headers).some((c) => c.startsWith('refresh_token='))).toBe(false);
  });

  it('refuses to join an existing account on an unverified provider email', async () => {
    await testDb.user.create({
      data: { email: EMAIL, emailVerifiedAt: new Date(), passwordHash: null },
    });
    const stub = googleStub({ email: EMAIL, emailVerified: false });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state });

    expect(res.status).toBe(403);
    expect(await testDb.oAuthIdentity.count()).toBe(0);
  });

  it('turns a token-endpoint refusal into a 502, not a 500', async () => {
    const stub = createProviderStub({
      token: { status: 200, body: { error: 'bad_verification_code' } },
    });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_EXCHANGE_FAILED' } });
    // The provider's own error text is not echoed to the caller.
    expect(JSON.stringify(res.body)).not.toContain('bad_verification_code');
  });

  it('turns an unreadable profile into a 502', async () => {
    const stub = createProviderStub({
      token: { body: { access_token: GOOGLE_ACCESS_TOKEN } },
      googleUserinfo: { body: { unexpected: true } },
    });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state });

    expect(res.status).toBe(502);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_PROFILE_FAILED' } });
  });
});

describe('GET /auth/oauth/:provider/callback — success', () => {
  it('proves possession of the PKCE verifier at the exchange', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);
    const challenge = s.authorize.searchParams.get('code_challenge');

    await callback(s, { code: 'provider-code', state: s.state }).expect(302);

    const exchange = stub.tokenRequests[0];
    expect(exchange).toBeDefined();
    const verifier = exchange?.get('code_verifier') ?? '';
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    // The verifier hashes to the challenge the provider was given at /start.
    expect(createHash('sha256').update(verifier).digest('base64url')).toBe(challenge);
    expect(exchange?.get('grant_type')).toBe('authorization_code');
    expect(exchange?.get('redirect_uri')).toBe(
      'https://api.webaudit.test/auth/oauth/google/callback',
    );
  });

  it('creates a confirmed account with its free allocation (FR-003)', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state });
    expect(res.status).toBe(302);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: EMAIL } });
    // A provider-confirmed address is already confirmed here.
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.passwordHash).toBeNull();
    const lots = await testDb.creditLot.findMany({ where: { userId: user.id } });
    expect(lots).toHaveLength(1);
  });

  it('sets the same refresh cookie a password login sets, and no token in the URL', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    const res = await callback(s, { code: 'provider-code', state: s.state }).expect(302);

    const cookies = cookiesOf(res.headers);
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));
    expect(refresh).toBeDefined();
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Lax/i);
    expect(await testDb.refreshToken.count()).toBe(1);

    // The pending transaction is spent.
    const cleared = cookies.find((c) => c.startsWith(`${OAUTH_TX_COOKIE}=`));
    expect(cleared).toMatch(/oauth_tx=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    // FR-091: the provider token appears in no header and no body.
    const location = String(res.headers['location']);
    expect(location).not.toContain(GOOGLE_ACCESS_TOKEN);
    expect(location).not.toContain('access_token');
    expect(JSON.stringify(res.headers)).not.toContain(GOOGLE_ACCESS_TOKEN);
    expect(res.text ?? '').not.toContain(GOOGLE_ACCESS_TOKEN);
  });

  it('hands the browser a session it can use', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);
    const res = await callback(s, { code: 'provider-code', state: s.state }).expect(302);

    // The web app exchanges the refresh cookie for an access token, exactly as
    // it would after a password login.
    const refreshed = await request(s.app)
      .post('/auth/refresh')
      .set('Cookie', cookiesOf(res.headers))
      .expect(200);
    const accessToken = (refreshed.body as { accessToken?: string }).accessToken ?? '';

    const me = await request(s.app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect((me.body as { email?: string }).email).toBe(EMAIL);
  });

  it('joins an existing password account on a matching confirmed email (FR-004)', async () => {
    const existing = await testDb.user.create({
      data: {
        email: EMAIL,
        passwordHash: '$2b$12$fakehashfakehashfakehashfakehashfakehashfakehashfake',
        emailVerifiedAt: new Date(),
      },
    });
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub);

    await callback(s, { code: 'provider-code', state: s.state }).expect(302);

    // One account, not two. This is the expensive-to-fix failure.
    expect(await testDb.user.count()).toBe(1);
    const identity = await testDb.oAuthIdentity.findFirstOrThrow();
    expect(identity.userId).toBe(existing.id);
    const session = await testDb.refreshToken.findFirstOrThrow();
    expect(session.userId).toBe(existing.id);
  });

  it('returns the browser to a same-origin path when asked', async () => {
    const stub = googleStub({ email: EMAIL, emailVerified: true });
    const s = await start(stub, 'google', '?returnTo=%2Fsettings%2Fbilling');

    const res = await callback(s, { code: 'provider-code', state: s.state }).expect(302);
    expect(res.headers['location']).toBe('https://app.webaudit.test/settings/billing');
  });

  it('will not be turned into an open redirect', async () => {
    for (const attempt of ['https://evil.example/x', '//evil.example/x', '/\\evil.example']) {
      await resetDb();
      await seedPlans();
      const stub = googleStub({ email: EMAIL, emailVerified: true });
      const s = await start(stub, 'google', `?returnTo=${encodeURIComponent(attempt)}`);

      const res = await callback(s, { code: 'provider-code', state: s.state }).expect(302);
      expect(res.headers['location']).toBe('https://app.webaudit.test/dashboard');
    }
  });

  it('reads the verified primary address from GitHub, not the public profile', async () => {
    // GitHub's /user carries no verified flag and may show a non-primary alias,
    // so the join decision has to come from /user/emails.
    const stub = githubStub({ email: 'gh@example.com', verified: true, login: 'octocat' });
    const s = await start(stub, 'github');

    await callback(s, { code: 'provider-code', state: s.state }, 'github').expect(302);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: 'gh@example.com' } });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(stub.calls.map((c) => c.url)).toContain('https://api.github.com/user/emails');
  });

  it('refuses a GitHub primary address GitHub has not verified', async () => {
    const stub = githubStub({ email: 'gh@example.com', verified: false });
    const s = await start(stub, 'github');

    const res = await callback(s, { code: 'provider-code', state: s.state }, 'github');

    expect(res.status).toBe(403);
    expect(await testDb.user.count()).toBe(0);
  });

  it('signs the same identity in again without creating a second account', async () => {
    const first = googleStub({ email: EMAIL, emailVerified: true });
    const a = await start(first);
    await callback(a, { code: 'code-1', state: a.state }).expect(302);

    const second = googleStub({ email: EMAIL, emailVerified: true });
    const b = await start(second);
    await callback(b, { code: 'code-2', state: b.state }).expect(302);

    expect(await testDb.user.count()).toBe(1);
    expect(await testDb.oAuthIdentity.count()).toBe(1);
    expect(await testDb.refreshToken.count()).toBe(2);
  });
});
