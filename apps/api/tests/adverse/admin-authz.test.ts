/**
 * T202 — SC/FR-008: "Operator capability is refused server-side regardless
 * of how the request is constructed." This is the adversarial closing test
 * for Session 4 (US7 admin backend): every admin route this phase built —
 * users, plans, margin, capabilities, providers, queue — must be reachable
 * by an operator and refused for everyone else, and that must be true of the
 * REAL mounted application, not a hand-built router around one file.
 *
 * Unlike every other `admin.*.test.ts` file in this directory tree (which
 * each build a standalone `express()` app around a single unmounted router —
 * see their own headers), this test goes through `createApp()`, the actual
 * production app factory, hitting the real `/admin` prefix wired in `app.ts`
 * (T211). That distinction is the entire point: a route file's own contract
 * test proves the route works once mounted with `requireOperator` in front of
 * it; this test proves `app.ts` actually put it there. A future admin route
 * added under `routes/admin/` and forgotten in `adminRoutes` (`routes/admin/
 * index.ts`) would pass every existing `admin.*.test.ts` file and still be
 * exploitable — only a test against the real mounted app catches that.
 *
 * "However constructed" is tested three ways per route, matching
 * `requireOperator`'s own module note (`auth.middleware.ts`) on exactly what
 * FR-008 forbids trusting:
 *   1. no Authorization header at all — 401.
 *   2. a real, valid access token for a genuine non-operator account — 403.
 *   3. a token whose JWT claims `isOperator: true` but whose account row in
 *      the database does not — 403. `requireOperator` reads the database,
 *      never the claim, specifically so a stale or forged claim (a token
 *      minted before demotion, or one an attacker constructed by hand) grants
 *      nothing. A test that only tried case 2 would not distinguish "checks
 *      the database" from "trusts the token" — case 3 is the one that would
 *      fail if `requireOperator` were ever accidentally simplified back to
 *      reading `req.auth.isOperator` from the claim.
 *
 * Each of the three refusal cases is checked against every declared route
 * with an empty/placeholder body — the auth gate is mounted ahead of every
 * route's own body validation (`requireAuth`+`requireOperator` run at the
 * `/admin` router level, before any sub-router's handler), so what the body
 * contains cannot matter to whether the gate refuses first.
 *
 * A confirming positive case closes the loop: a genuine operator hitting each
 * no-parameter GET route gets 200, not 401/403 — proving the refusal above is
 * really the operator gate and not, say, a typo'd path 404ing for everyone.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { SignJWT } from 'jose';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

const app = createApp({ db: testDb });

async function signToken(userId: string, claimIsOperator: boolean): Promise<string> {
  return new SignJWT({ isOperator: claimIsOperator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(env.accessTtl)
    .sign(env.accessSecret);
}

async function makeAccount(isOperatorInDb: boolean): Promise<{ userId: string; token: string }> {
  const user = await testDb.user.create({
    data: {
      email: `admin-authz-${isOperatorInDb ? 'op' : 'nonop'}-${Math.random().toString(36).slice(2)}@example.com`,
      emailVerifiedAt: new Date(),
      isOperator: isOperatorInDb,
    },
  });
  return { userId: user.id, token: await signToken(user.id, isOperatorInDb) };
}

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

interface RouteCase {
  readonly method: 'get' | 'post' | 'patch' | 'delete';
  readonly path: string;
}

/** Every admin route this phase (Session 4 / US7 backend) built. */
const ROUTES: readonly RouteCase[] = [
  { method: 'get', path: '/admin/users' },
  { method: 'get', path: '/admin/users/some-id' },
  { method: 'patch', path: '/admin/users/some-id' },
  { method: 'get', path: '/admin/plans' },
  { method: 'post', path: '/admin/plans' },
  { method: 'get', path: '/admin/plans/some-id' },
  { method: 'patch', path: '/admin/plans/some-id' },
  { method: 'get', path: '/admin/margin' },
  { method: 'get', path: '/admin/capabilities' },
  { method: 'patch', path: '/admin/capabilities/some-id' },
  { method: 'delete', path: '/admin/capabilities/some-id' },
  // T226 (Session 8) added real sandbox dispatch here — found missing from
  // this list by a final production-readiness review (2026-09-04): every
  // other admin.*.test.ts file builds a standalone router around one file
  // and never asserts a 403 on this specific route either, so nothing was
  // actually proving requireOperator gates it in the real mounted app.
  { method: 'post', path: '/admin/capabilities/upload' },
  { method: 'get', path: '/admin/providers' },
  { method: 'patch', path: '/admin/providers' },
  { method: 'get', path: '/admin/queue' },
  { method: 'post', path: '/admin/queue/some-job-id/retry' },
  { method: 'post', path: '/admin/queue/some-job-id/cancel' },
];

/** No-path-param GET routes, safe to hit for a real 200 with no seeded data. */
const NO_PARAM_GET_ROUTES: readonly string[] = [
  '/admin/users',
  '/admin/plans',
  '/admin/margin',
  '/admin/capabilities',
  '/admin/providers',
  '/admin/queue',
];

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('every admin route refuses a non-operator, however constructed (FR-008)', () => {
  it.each(ROUTES)('$method $path — no Authorization header at all — 401', async ({ method, path }) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(401);
  });

  it.each(ROUTES)(
    '$method $path — a valid token for a genuine non-operator account — 403',
    async ({ method, path }) => {
      const { token } = await makeAccount(false);
      const res = await request(app)[method](path).set(auth(token)).send({});
      expect(res.status).toBe(403);
    },
  );

  it.each(ROUTES)(
    '$method $path — a token claiming isOperator: true whose account is not one in the database — 403',
    async ({ method, path }) => {
      const user = await testDb.user.create({
        data: {
          email: `admin-authz-forged-${Math.random().toString(36).slice(2)}@example.com`,
          emailVerifiedAt: new Date(),
          isOperator: false,
        },
      });
      const forgedToken = await signToken(user.id, true);
      const res = await request(app)[method](path).set(auth(forgedToken)).send({});
      expect(res.status).toBe(403);
    },
  );
});

describe('a genuine operator is admitted (closing the loop — the refusal above is the operator gate, not a dead route)', () => {
  it.each(NO_PARAM_GET_ROUTES)('GET %s — a real operator gets 200', async (path) => {
    const { token } = await makeAccount(true);
    const res = await request(app).get(path).set(auth(token));
    expect(res.status).toBe(200);
  });
});
