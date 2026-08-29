/**
 * T024 — Refresh-token rotation and revocation.
 *
 * FR-006: a user stays signed in across sessions without re-entering
 * credentials, and can end the session.
 *
 * Rotation is the security property under test: presenting a refresh token
 * consumes it. A token that still works after being exchanged means a stolen
 * cookie is valid for its whole 7 days.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { createCapturingMailer } from '../helpers/mailer.js';
import { requireAuth, requireOperator } from '../../src/middleware/auth.middleware.js';
import { purgeExpiredAuthTokens } from '../../src/services/auth/cleanup.service.js';
import { refresh } from '../../src/services/auth/session.service.js';
import { deleteAccount } from '../../src/services/auth/deletion.service.js';

// A capturing mailer rather than the console one: the resend tests below have to
// read the tokens that were actually emailed.
const mailer = createCapturingMailer();
const app = createApp({ db: testDb, mailer });
const CREDS = { email: 'session@example.com', password: 'correct-horse-battery-staple' };

beforeEach(async () => {
  await resetDb();
  await seedPlans();
  await request(app).post('/auth/register').send(CREDS).expect(201);
  await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  mailer.clear();
});
afterAll(closeDb);

function cookiesOf(res: request.Response): string[] {
  const raw = res.headers['set-cookie'];
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

async function login() {
  const res = await request(app).post('/auth/login').send(CREDS).expect(200);
  return { accessToken: res.body.accessToken as string, cookies: cookiesOf(res) };
}

describe('login', () => {
  it('returns an access token in the body and a refresh token in an httpOnly cookie', async () => {
    const res = await request(app).post('/auth/login').send(CREDS).expect(200);

    expect(res.body.accessToken).toBeTypeOf('string');
    // The refresh token must never appear in the body — only in a cookie the
    // page cannot read.
    expect(JSON.stringify(res.body)).not.toContain('refresh');

    const cookie = cookiesOf(res).find((c) => c.startsWith('refresh_token='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=(Lax|Strict)/i);
    expect(cookie).toMatch(/Path=\//);
  });

  it('stores the refresh token as a hash, never in the clear', async () => {
    const { cookies } = await login();
    const raw = /refresh_token=([^;]+)/.exec(cookies.join(';'))?.[1];
    expect(raw).toBeTruthy();

    const rows = await testDb.refreshToken.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.tokenHash).not.toBe(raw);
  });
});

describe('refresh rotation', () => {
  it('issues a new access token and a new refresh cookie', async () => {
    const { cookies } = await login();

    const res = await request(app).post('/auth/refresh').set('Cookie', cookies).expect(200);
    expect(res.body.accessToken).toBeTypeOf('string');

    const rotated = cookiesOf(res).find((c) => c.startsWith('refresh_token='));
    expect(rotated).toBeDefined();
    expect(rotated).not.toBe(cookies.find((c) => c.startsWith('refresh_token=')));
  });

  it('revokes the presented token so it cannot be reused', async () => {
    const { cookies } = await login();

    await request(app).post('/auth/refresh').set('Cookie', cookies).expect(200);

    // Replaying the original cookie must fail. This is the whole point of rotation.
    const replay = await request(app).post('/auth/refresh').set('Cookie', cookies);
    expect(replay.status).toBe(401);
  });

  it('refuses an expired refresh token', async () => {
    const { cookies } = await login();
    await testDb.refreshToken.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });

    const res = await request(app).post('/auth/refresh').set('Cookie', cookies);
    expect(res.status).toBe(401);
  });

  it('refuses a request with no cookie at all', async () => {
    const res = await request(app).post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('refuses a forged token that is well-formed but unknown', async () => {
    const res = await request(app)
      .post('/auth/refresh')
      .set('Cookie', ['refresh_token=' + 'a'.repeat(64)]);
    expect(res.status).toBe(401);
  });
});

describe('logout', () => {
  it('revokes the presented token and clears the cookie', async () => {
    const { cookies } = await login();

    const res = await request(app).post('/auth/logout').set('Cookie', cookies).expect(204);

    const cleared = cookiesOf(res).find((c) => c.startsWith('refresh_token='));
    expect(cleared).toMatch(/refresh_token=;|Max-Age=0|Expires=Thu, 01 Jan 1970/i);

    const row = await testDb.refreshToken.findFirstOrThrow();
    expect(row.revokedAt).not.toBeNull();

    // And the token is dead.
    await request(app).post('/auth/refresh').set('Cookie', cookies).expect(401);
  });

  it('does not revoke other sessions of the same user', async () => {
    const a = await login();
    const b = await login();

    await request(app).post('/auth/logout').set('Cookie', a.cookies).expect(204);

    // Signing out of one device must not sign out the others.
    await request(app).post('/auth/refresh').set('Cookie', b.cookies).expect(200);
  });
});

describe('GET /auth/me', () => {
  it('returns the user with both credit balances as distinct figures', async () => {
    const { accessToken } = await login();

    const res = await request(app)
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.email).toBe(CREDS.email);
    expect(res.body).not.toHaveProperty('passwordHash');
    // FR-078: a balance is never one number.
    expect(res.body.credits).toMatchObject({ plan: 50, purchased: 0 });
  });

  it('refuses a missing or malformed bearer token', async () => {
    await request(app).get('/auth/me').expect(401);
    await request(app).get('/auth/me').set('Authorization', 'Bearer nonsense').expect(401);
    await request(app).get('/auth/me').set('Authorization', 'NotBearer x').expect(401);
  });
});

describe('refresh rotation under concurrency (C2)', () => {
  it('accepts exactly one of three simultaneous presentations of the same cookie', async () => {
    const { cookies } = await login();

    // The sequential replay test above passes even when rotation is not atomic:
    // the revoke has already committed by the time the second call reads. Only a
    // genuine race proves the revoke is the gate.
    const results = await Promise.allSettled(
      [1, 2, 3].map(() => request(app).post('/auth/refresh').set('Cookie', cookies)),
    );

    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 0));
    expect(statuses.filter((s) => s === 200)).toHaveLength(1);
    expect(statuses.filter((s) => s === 401)).toHaveLength(2);

    // Exactly one live token afterwards: the winner's replacement.
    const live = await testDb.refreshToken.findMany({ where: { revokedAt: null } });
    expect(live).toHaveLength(1);
  });

  it('rotates once when three callers race the same token inside one tick', async () => {
    const { cookies } = await login();
    const raw = /refresh_token=([^;]+)/.exec(cookies.join(';'))?.[1];
    expect(raw).toBeTruthy();

    // Deliberately below HTTP: three requests over the wire get serialised by
    // connection setup, so all three read the token after the first rotation has
    // already committed — which is why the HTTP-level test above passes even
    // against a non-atomic implementation. Calling the service directly issues
    // all three reads in the same tick, which is the real race.
    const results = await Promise.allSettled([1, 2, 3].map(() => refresh(testDb, raw)));

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(2);

    // One stolen cookie must never become several live sessions.
    const live = await testDb.refreshToken.findMany({ where: { revokedAt: null } });
    expect(live).toHaveLength(1);
  });

  it('keeps the winner signed in — a client racing itself is not a theft signal', async () => {
    const { cookies } = await login();

    const results = await Promise.allSettled(
      [1, 2, 3].map(() => request(app).post('/auth/refresh').set('Cookie', cookies)),
    );
    const winner = results.find((r) => r.status === 'fulfilled' && r.value.status === 200);
    expect(winner).toBeDefined();
    const rotated = cookiesOf((winner as PromiseFulfilledResult<request.Response>).value);

    // Within the reuse grace window the losers must not tear down the family, or
    // every double-submitting browser tab would sign the user out.
    await request(app).post('/auth/refresh').set('Cookie', rotated).expect(200);
  });

  it('revokes every live session when a consumed token is replayed after the grace window', async () => {
    const { cookies } = await login();
    await request(app).post('/auth/refresh').set('Cookie', cookies).expect(200);

    // Age the consumed token past the grace window: this is no longer a race, it
    // is a replay of a token nobody should still hold.
    await testDb.refreshToken.updateMany({
      where: { revokedAt: { not: null } },
      data: { revokedAt: new Date(Date.now() - 60 * 60 * 1000) },
    });

    await request(app).post('/auth/refresh').set('Cookie', cookies).expect(401);

    const live = await testDb.refreshToken.findMany({ where: { revokedAt: null } });
    expect(live).toHaveLength(0);
  });
});

describe('requireOperator (M1, FR-008)', () => {
  // The middleware has no route of its own yet, so the test mounts one. What is
  // under test is the middleware, not a URL.
  const ops = express();
  ops.get('/ops/ping', requireAuth, requireOperator(testDb), (_req, res) => {
    res.status(200).json({ ok: true });
  });

  async function operatorToken(): Promise<string> {
    await testDb.user.update({ where: { email: CREDS.email }, data: { isOperator: true } });
    const res = await request(app).post('/auth/login').send(CREDS).expect(200);
    return res.body.accessToken as string;
  }

  it('admits a current operator', async () => {
    const token = await operatorToken();
    await request(ops).get('/ops/ping').set('Authorization', `Bearer ${token}`).expect(200);
  });

  it('refuses a demoted operator holding a token that still claims the capability', async () => {
    const token = await operatorToken();

    // Demotion inside the access token's 15-minute life. The claim still says
    // operator; the database is the authority.
    await testDb.user.update({ where: { email: CREDS.email }, data: { isOperator: false } });

    const res = await request(ops).get('/ops/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('refuses a token whose user no longer exists', async () => {
    const token = await operatorToken();
    await testDb.user.delete({ where: { email: CREDS.email } });

    const res = await request(ops).get('/ops/ping').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });

  it('refuses an unauthenticated caller', async () => {
    await request(ops).get('/ops/ping').expect(401);
  });
});

describe('token supersession on resend (M4)', () => {
  const FRESH = { email: 'resend@example.com', password: 'correct-horse-battery-staple' };

  function verifyTokens(): string[] {
    return mailer
      .sent()
      .filter((e) => e.kind === 'verify' && e.email === FRESH.email)
      .map((e) => e.token);
  }

  it('invalidates earlier verification tokens when a new one is sent', async () => {
    await request(app).post('/auth/register').send(FRESH).expect(201);
    await request(app).post('/auth/verify/resend').send({ email: FRESH.email }).expect(202);
    await request(app).post('/auth/verify/resend').send({ email: FRESH.email }).expect(202);

    const tokens = verifyTokens();
    expect(tokens).toHaveLength(3);

    // Only the newest link may work. N resends must not mean N live tokens.
    await request(app).get(`/auth/verify/${tokens[0]}`).expect(410);
    await request(app).get(`/auth/verify/${tokens[1]}`).expect(410);
    await request(app).get(`/auth/verify/${tokens[2]}`).expect(200);
  });

  it('invalidates an earlier password-reset token when a new one is requested', async () => {
    await request(app).post('/auth/forgot-password').send({ email: CREDS.email }).expect(202);
    const first = mailer.lastResetToken();
    await request(app).post('/auth/forgot-password').send({ email: CREDS.email }).expect(202);
    const second = mailer.lastResetToken();
    expect(second).not.toBe(first);

    await request(app)
      .post('/auth/reset-password')
      .send({ token: first, password: 'another-correct-horse-staple' })
      .expect(410);
    await request(app)
      .post('/auth/reset-password')
      .send({ token: second, password: 'another-correct-horse-staple' })
      .expect(200);
  });
});

describe('expired auth token cleanup (M5)', () => {
  const DAY = 24 * 60 * 60 * 1000;

  async function currentUserId(): Promise<string> {
    const u = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    return u.id;
  }

  it('deletes rows expired beyond the grace window and keeps everything else', async () => {
    const id = await currentUserId();
    const now = new Date();

    await testDb.emailToken.createMany({
      data: [
        {
          userId: id,
          purpose: 'verify',
          tokenHash: 'stale-email',
          expiresAt: new Date(now.getTime() - 40 * DAY),
        },
        {
          userId: id,
          purpose: 'verify',
          tokenHash: 'recently-expired-email',
          expiresAt: new Date(now.getTime() - DAY),
        },
        {
          userId: id,
          purpose: 'reset',
          tokenHash: 'live-email',
          expiresAt: new Date(now.getTime() + DAY),
        },
      ],
    });
    await testDb.refreshToken.createMany({
      data: [
        { userId: id, tokenHash: 'stale-refresh', expiresAt: new Date(now.getTime() - 40 * DAY) },
        {
          userId: id,
          tokenHash: 'recently-expired-refresh',
          expiresAt: new Date(now.getTime() - DAY),
        },
      ],
    });

    const result = await purgeExpiredAuthTokens(testDb, { graceMs: 30 * DAY, now });
    expect(result).toMatchObject({ emailTokens: 1, refreshTokens: 1 });

    const emailHashes = (await testDb.emailToken.findMany()).map((r) => r.tokenHash);
    expect(emailHashes).toContain('recently-expired-email');
    expect(emailHashes).toContain('live-email');
    expect(emailHashes).not.toContain('stale-email');

    const refreshHashes = (await testDb.refreshToken.findMany()).map((r) => r.tokenHash);
    expect(refreshHashes).toContain('recently-expired-refresh');
    expect(refreshHashes).not.toContain('stale-refresh');
  });

  it('is safe to run when there is nothing to sweep', async () => {
    const result = await purgeExpiredAuthTokens(testDb);
    expect(result).toMatchObject({ emailTokens: 0, refreshTokens: 0 });
  });
});

describe('account deletion artifacts (H4, FR-009)', () => {
  async function seedScanWithWorkspace(): Promise<{ userId: string; workspacePath: string }> {
    const user = await testDb.user.findUniqueOrThrow({ where: { email: CREDS.email } });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://example.com',
        displayName: 'example.com',
      },
    });
    const workspacePath = '/tmp/webaudit/scan-deletion-test';
    await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        capabilitySnapshot: {},
        quotedCredits: 80,
        workspacePath,
      },
    });
    return { userId: user.id, workspacePath };
  }

  it('hands every retained workspace path to the injected purger before deleting rows', async () => {
    const { userId, workspacePath } = await seedScanWithWorkspace();

    const seen: string[][] = [];
    let userStillPresentAtPurgeTime = false;
    const result = await deleteAccount(testDb, userId, {
      purge: async (artifacts) => {
        seen.push([...artifacts.workspacePaths]);
        // Artifacts are destroyed first: a purge that fails must leave a
        // recoverable account, never orphaned customer data.
        userStillPresentAtPurgeTime =
          (await testDb.user.findUnique({ where: { id: userId } })) !== null;
      },
    });

    expect(seen).toEqual([[workspacePath]]);
    expect(userStillPresentAtPurgeTime).toBe(true);
    expect(result).toMatchObject({ artifactsPurged: true, workspacePaths: [workspacePath] });
    expect(await testDb.user.findUnique({ where: { id: userId } })).toBeNull();
  });

  it('reports unpurged artifacts when no purger is wired', async () => {
    const { userId, workspacePath } = await seedScanWithWorkspace();

    const result = await deleteAccount(testDb, userId);

    expect(result.artifactsPurged).toBe(false);
    expect(result.workspacePaths).toEqual([workspacePath]);
    expect(await testDb.user.findUnique({ where: { id: userId } })).toBeNull();
  });

  it('leaves the account intact when artifact destruction fails', async () => {
    const { userId } = await seedScanWithWorkspace();

    await expect(
      deleteAccount(testDb, userId, {
        purge: () => Promise.reject(new Error('object storage unreachable')),
      }),
    ).rejects.toThrow('object storage unreachable');

    // FR-009 is all-or-nothing: a half-deleted account with live artifacts is
    // worse than one the user can ask us to delete again.
    expect(await testDb.user.findUnique({ where: { id: userId } })).not.toBeNull();
  });
});
