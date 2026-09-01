/**
 * T171 — a revoked repository connection fails clearly and costs nothing.
 *
 * "Clearly" is doing real work in that sentence, so this suite asserts on all
 * three parts of it rather than on a status code:
 *
 *   - **The failure is specific.** A `409` with `REPO_CONNECTION_REVOKED` and a
 *     message naming the remedy. A generic `500`, or a `403` that reads like a
 *     permissions problem with the *target*, would send a user looking in the
 *     wrong place — and the most likely wrong place is their GitHub repository
 *     settings, which are fine.
 *   - **Nothing is charged.** Principle VI. Asserted as "the balance is
 *     unchanged *and* no transaction row of any type exists for this user",
 *     because a debit followed by a compensating refund also leaves the balance
 *     unchanged, and that is a materially worse outcome: it puts a charge and a
 *     refund on a statement for an audit that never ran. The distinction is
 *     invisible to a balance check alone, which is why both assertions are here.
 *   - **No scan row is left behind.** A FAILED scan in the history for a
 *     credential that expired is noise the user cannot act on and did not cause.
 *
 * The revocation itself is injected through `AppDeps.scans.checkRepositoryConnection`
 * rather than by pointing a real client at GitHub. The thing under test is what
 * this codebase does with a revocation, not GitHub's status codes — and
 * `repos.unit.test.ts` covers the mapping from 401/403 to the typed error.
 */

// FIRST — `src/config/env.ts` latches `process.env` on first import, and the
// second case below seals a GitHub token. See the module's own note.
import '../contract/oauth-test-env.js';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';
import { RepositoryConnectionRevokedError } from '../../src/services/intake/repos.js';
import { totalAvailable } from '../../src/services/credits/balance.js';
import { seal } from '../../src/services/auth/token-vault.js';

const CREDS = { email: 'repo-revoked@example.com', password: 'correct-horse-battery-staple' };
const MODULES = ['SECURITY', 'SEO'] as const;

/** Substitutes for the live GitHub check. Records that it was consulted. */
function revokedConnection(): { check: () => Promise<never>; calls: () => number } {
  let calls = 0;
  return {
    check: () => {
      calls += 1;
      return Promise.reject(new RepositoryConnectionRevokedError(401));
    },
    calls: () => calls,
  };
}

async function signInOnPro(): Promise<{ token: string; userId: string }> {
  await request(createApp({ db: testDb }))
    .post('/auth/register')
    .send(CREDS)
    .expect(201);
  const user = await testDb.user.update({
    where: { email: CREDS.email },
    data: { emailVerifiedAt: new Date() },
  });
  // REPOSITORY is a Pro input type (seedPlans). Without this the request would
  // be refused by FR-016 before it ever reached the connection check, and the
  // suite would pass for the wrong reason.
  await testDb.subscription.create({
    data: {
      userId: user.id,
      planId: 'pro',
      status: 'ACTIVE',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  await testDb.creditLot.create({
    data: {
      userId: user.id,
      kind: 'PLAN',
      source: 'PLAN_RENEWAL',
      amountGranted: 1200,
      amountRemaining: 1200,
      expiresAt: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  const res = await request(createApp({ db: testDb }))
    .post('/auth/login')
    .send(CREDS)
    .expect(200);
  return { token: (res.body as { accessToken: string }).accessToken, userId: user.id };
}

function auth(bearer: string): Record<string, string> {
  return { Authorization: `Bearer ${bearer}` };
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('a revoked repository connection', () => {
  it('refuses the scan with REPO_CONNECTION_REVOKED and charges nothing', async () => {
    const { token, userId } = await signInOnPro();
    const revoked = revokedConnection();
    const app = createApp({ db: testDb, scans: { checkRepositoryConnection: revoked.check } });

    const target = await request(app)
      .post('/targets')
      .set(auth(token))
      .send({ inputType: 'REPOSITORY', value: 'acme/storefront' })
      .expect(201);
    const targetId = (target.body as { target: { id: string } }).target.id;

    const before = await totalAvailable(testDb, userId);
    const quoted = await request(app)
      .post('/scans/quote')
      .set(auth(token))
      .send({ targetId, modules: MODULES })
      .expect(200);
    const credits = (quoted.body as { quote: { credits: number } }).quote.credits;
    expect(credits).toBeGreaterThan(0); // Otherwise "charged nothing" proves nothing.

    const res = await request(app)
      .post('/scans')
      .set(auth(token))
      .send({ targetId, modules: MODULES, acceptedQuote: credits })
      .expect(409);

    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('REPO_CONNECTION_REVOKED');
    expect(body.error.message).toMatch(/reconnect github/i);
    expect(revoked.calls()).toBe(1);

    expect(await totalAvailable(testDb, userId)).toBe(before);
    // Not a debit-then-refund. Nothing at all. (The signup grant is the only
    // transaction this user has, and it is not a movement this request made.)
    expect(
      await testDb.creditTransaction.count({
        where: { userId, type: { in: ['DEBIT', 'REFUND'] } },
      }),
    ).toBe(0);
    expect(await testDb.scan.count({ where: { userId } })).toBe(0);
  });

  it('reports the same revocation on GET /repos rather than an empty list', async () => {
    const { token, userId } = await signInOnPro();
    // A connection that exists and is sealed correctly — the revocation is on
    // GitHub's side, which is the only place it can be.
    const sealed = seal('ghp_a_token_github_no_longer_honours');
    await testDb.user.update({
      where: { id: userId },
      data: { githubTokenEnc: sealed.ciphertext, githubTokenIv: sealed.iv },
    });

    const app = createApp({
      db: testDb,
      intake: {
        githubFetch: () =>
          Promise.resolve({
            url: 'https://api.github.com/user/repos',
            status: 401,
            headers: {},
            redirects: [],
            bytes: () => new Uint8Array(),
            text: () => '',
          }),
      },
    });

    // An empty `200 []` would be the tempting failure mode here, and it is the
    // one this asserts against: a user whose token expired would see "you have
    // no repositories" and go looking for a bug in their GitHub account.
    const res = await request(app).get('/repos').set(auth(token)).expect(409);
    expect((res.body as { error: { code: string } }).error.code).toBe('REPO_CONNECTION_REVOKED');
  });

  it('tells a user with no connection at all to connect one', async () => {
    const { token } = await signInOnPro();
    const app = createApp({ db: testDb });

    const res = await request(app).get('/repos').set(auth(token)).expect(409);
    const body = res.body as { error: { code: string; message: string } };
    expect(body.error.code).toBe('REPO_CONNECTION_MISSING');
    expect(body.error.message).toMatch(/connect github/i);
  });
});
