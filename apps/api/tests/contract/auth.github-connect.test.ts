/**
 * T031 — `POST /auth/github/connect` and `DELETE /auth/github/connect`.
 *
 * FR-007: a user connects and disconnects a code-hosting account.
 * FR-091: the stored credential is encrypted at rest and appears in no
 * response, no error, and no log line.
 *
 * Until this suite existed, `token-vault.ts` had no callers at all — the
 * encryption was written and tested but nothing ever sealed a real token. These
 * tests are what make that code live: the round trip asserted below is a token
 * that went through `seal()` on the way into Postgres and `open()` on the way
 * back out.
 */

// Must be first: src/config/env.ts reads process.env at import time.
import './oauth-test-env.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { open } from '../../src/services/auth/token-vault.js';
import { OAUTH_TX_COOKIE } from '../../src/services/auth/oauth-flow.service.js';
import {
  GITHUB_ACCESS_TOKEN,
  cookiesOf,
  configureProviderEnv,
  createOAuthTestApp,
  createProviderStub,
  githubStub,
  type ProviderStub,
} from './oauth-harness.js';

const CREDS = { email: 'connector@example.com', password: 'correct-horse-battery-staple' };

beforeAll(configureProviderEnv);
beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

/** A signed-in user, as the connect route requires. */
async function signIn(app: Express): Promise<string> {
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return (res.body as { accessToken?: string }).accessToken ?? '';
}

interface ConnectSetup {
  app: Express;
  stub: ProviderStub;
  accessToken: string;
  state: string;
  txCookies: string[];
  authorize: URL;
}

async function beginConnect(stub: ProviderStub, intent = 'connect'): Promise<ConnectSetup> {
  const app = createOAuthTestApp(stub.http);
  const accessToken = await signIn(app);

  const started = await request(app).get(`/auth/oauth/github/start?intent=${intent}`).expect(302);
  const authorize = new URL(String(started.headers['location']));

  return {
    app,
    stub,
    accessToken,
    state: authorize.searchParams.get('state') ?? '',
    txCookies: cookiesOf(started.headers),
    authorize,
  };
}

function postConnect(s: ConnectSetup, body: Record<string, string>, path = '/auth/github/connect') {
  return request(s.app)
    .post(path)
    .set('Authorization', `Bearer ${s.accessToken}`)
    .set('Cookie', s.txCookies)
    .send(body);
}

describe('starting the connect handshake', () => {
  it('asks GitHub for repository access and returns the browser to the web app', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));

    const q = s.authorize.searchParams;
    expect(s.authorize.origin + s.authorize.pathname).toBe(
      'https://github.com/login/oauth/authorize',
    );
    // FR-007: repository access is asked for only when connecting, never to
    // sign in.
    expect(q.get('scope')).toContain('repo');
    expect(q.get('redirect_uri')).toBe(
      'https://app.webaudit.test/settings/integrations/github/callback',
    );
    expect(q.get('code_challenge_method')).toBe('S256');
  });

  it('does not ask for repository access when only signing in', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }), 'signin');
    expect(s.authorize.searchParams.get('scope')).not.toContain('repo');
  });
});

describe('POST /auth/github/connect', () => {
  it('seals the token into the database and never returns it', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));

    const res = await postConnect(s, { code: 'github-code', state: s.state });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ connected: true, login: 'octocat' });

    // FR-091, the whole point: the credential is not in the response, in any
    // header, or anywhere in the raw payload.
    const everything = JSON.stringify(res.body) + JSON.stringify(res.headers) + (res.text ?? '');
    expect(everything).not.toContain(GITHUB_ACCESS_TOKEN);
    expect(everything).not.toContain('gho_');
    expect(everything).not.toContain('github-test-client-secret');

    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).not.toBeNull();
    expect(user.githubTokenIv).not.toBeNull();
    expect(user.githubLogin).toBe('octocat');

    // Ciphertext, not the token with extra steps.
    const ciphertext = Buffer.from(user.githubTokenEnc ?? new Uint8Array());
    const iv = Buffer.from(user.githubTokenIv ?? new Uint8Array());
    expect(ciphertext.toString('utf8')).not.toContain(GITHUB_ACCESS_TOKEN);
    expect(iv).toHaveLength(12);

    // And it round-trips: this is a real seal(), not a placeholder.
    expect(open({ ciphertext, iv })).toBe(GITHUB_ACCESS_TOKEN);
  });

  it('spends the pending transaction, so the same code cannot be replayed', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));

    const first = await postConnect(s, { code: 'github-code', state: s.state });
    expect(first.status).toBe(200);
    const cleared = cookiesOf(first.headers).find((c) => c.startsWith(`${OAUTH_TX_COOKIE}=`));
    expect(cleared).toMatch(/oauth_tx=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    // A browser that honours the clearing has nothing left to present.
    const replay = await request(s.app)
      .post('/auth/github/connect')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .send({ code: 'github-code', state: s.state });
    expect(replay.status).toBe(400);
  });

  it('refuses a mismatched state WITHOUT calling GitHub', async () => {
    const stub = githubStub({ email: CREDS.email, verified: true });
    const s = await beginConnect(stub);
    const callsBefore = stub.calls.length;

    const res = await postConnect(s, { code: 'github-code', state: 'not-the-minted-state' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_STATE_INVALID' } });
    expect(stub.calls).toHaveLength(callsBefore);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).toBeNull();
  });

  it('refuses a transaction that was started to sign in, not to connect', async () => {
    const stub = githubStub({ email: CREDS.email, verified: true });
    const s = await beginConnect(stub, 'signin');

    const res = await postConnect(s, { code: 'github-code', state: s.state });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ error: { code: 'OAUTH_STATE_INVALID' } });
    expect(stub.calls).toEqual([]);
  });

  it('refuses an unauthenticated caller', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));

    const res = await request(s.app)
      .post('/auth/github/connect')
      .set('Cookie', s.txCookies)
      .send({ code: 'github-code', state: s.state });

    expect(res.status).toBe(401);
    expect(s.stub.calls).toEqual([]);
  });

  it('validates the body', async () => {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));

    const res = await postConnect(s, { code: 'github-code' });

    expect(res.status).toBe(422);
    expect(res.body).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('stores nothing when GitHub refuses the code', async () => {
    const stub = createProviderStub({ token: { body: { error: 'bad_verification_code' } } });
    const s = await beginConnect(stub);

    const res = await postConnect(s, { code: 'github-code', state: s.state });

    expect(res.status).toBe(502);
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).toBeNull();
  });

  it('stores nothing when the token cannot read a profile — no dead credentials', async () => {
    const stub = createProviderStub({
      token: { body: { access_token: GITHUB_ACCESS_TOKEN } },
      githubUser: { status: 401, body: { message: 'Bad credentials' } },
    });
    const s = await beginConnect(stub);

    const res = await postConnect(s, { code: 'github-code', state: s.state });

    expect(res.status).toBe(502);
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).toBeNull();
    expect(JSON.stringify(res.body)).not.toContain(GITHUB_ACCESS_TOKEN);
  });
});

describe('DELETE /auth/github/connect', () => {
  async function connected(): Promise<ConnectSetup> {
    const s = await beginConnect(githubStub({ email: CREDS.email, verified: true }));
    await postConnect(s, { code: 'github-code', state: s.state }).expect(200);
    return s;
  }

  it('destroys both credential columns', async () => {
    const s = await connected();

    const res = await request(s.app)
      .delete('/auth/github/connect')
      .set('Authorization', `Bearer ${s.accessToken}`);
    expect(res.status).toBe(204);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).toBeNull();
    expect(user.githubTokenIv).toBeNull();
    expect(user.githubLogin).toBeNull();
  });

  it('is also reachable at /auth/github/disconnect', async () => {
    const s = await connected();

    await request(s.app)
      .delete('/auth/github/disconnect')
      .set('Authorization', `Bearer ${s.accessToken}`)
      .expect(204);

    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).toBeNull();
  });

  it('is idempotent', async () => {
    const s = await connected();
    const auth = `Bearer ${s.accessToken}`;

    await request(s.app).delete('/auth/github/connect').set('Authorization', auth).expect(204);
    await request(s.app).delete('/auth/github/connect').set('Authorization', auth).expect(204);
  });

  it('refuses an unauthenticated caller', async () => {
    const s = await connected();

    await request(s.app).delete('/auth/github/connect').expect(401);

    // Still connected: an unauthenticated request changes nothing.
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    expect(user.githubTokenEnc).not.toBeNull();
  });
});
