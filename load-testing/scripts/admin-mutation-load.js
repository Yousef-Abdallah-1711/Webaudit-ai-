// Phase 11 (production-without-Paymob-or-AI master plan), P11-T3 — concurrent
// admin-mutation load: plan assignment + credit grant under concurrent
// operator use, against the real deployed (containerized, reverse-proxied)
// topology. New surface from Phase 3/4, never previously load-tested.
//
// One operator login in setup() (not per-VU) — the strict auth limiter
// (10/15min/IP) is not what this test measures; `general` (120/60s/IP) is,
// for the /admin/users/:id/{plan,credits} mutation endpoints themselves.
import http from 'k6/http';
import { check } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const STAGE_VUS = parseInt(__ENV.STAGE_VUS || '5', 10);
const OPERATOR_EMAIL = 'load-operator@webaudit-loadtest.local';
const OPERATOR_PASSWORD = 'load-test-correct-horse-battery-staple';
const TARGET_USER_COUNT = 20;

export const planAssignLatency = new Trend('plan_assign_latency', true);
export const creditGrantLatency = new Trend('credit_grant_latency', true);
export const errorRate = new Rate('admin_mutation_errors');

export const options = {
  scenarios: {
    admin_mutation: {
      executor: 'per-vu-iterations',
      vus: STAGE_VUS,
      iterations: 1,
      maxDuration: '2m',
    },
  },
};

export function setup() {
  // `OPERATOR_TOKEN`, when set, is a directly-minted access token (same
  // `jose` SignJWT call, same secret, same claims shape the real login path
  // produces — the same legitimate pre-authentication technique
  // `load-testing/scripts/post-auth-capacity.mjs` already established) —
  // this test measures admin-mutation concurrency, not the login rate
  // limiter, which has its own separate, already-documented coverage.
  let accessToken = __ENV.OPERATOR_TOKEN;
  if (!accessToken) {
    const res = http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: OPERATOR_EMAIL, password: OPERATOR_PASSWORD }),
      { headers: { 'Content-Type': 'application/json' } },
    );
    if (res.status !== 200) {
      throw new Error(`operator login failed: ${res.status} ${res.body}`);
    }
    accessToken = res.json('accessToken');
  }

  const listRes = http.get(`${BASE_URL}/admin/users?limit=50`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (listRes.status !== 200) {
    throw new Error(`admin user list failed: ${listRes.status} ${listRes.body}`);
  }
  const users = listRes
    .json('users')
    .filter((u) => u.email.startsWith('loadtest-'))
    .slice(0, TARGET_USER_COUNT);
  if (users.length === 0) {
    throw new Error('no seeded loadtest- users found via GET /admin/users');
  }
  return { accessToken, userIds: users.map((u) => u.id) };
}

export default function (data) {
  const userId = data.userIds[(__VU - 1) % data.userIds.length];
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.accessToken}`,
  };

  // Alternate plan assignment so concurrent VUs against overlapping users
  // exercise real contention, not just distinct rows.
  const planId = __VU % 2 === 0 ? 'pro' : 'starter';
  const assignRes = http.post(
    `${BASE_URL}/admin/users/${userId}/plan`,
    JSON.stringify({ planId, reason: `P11-T3 admin-mutation load, VU ${__VU}` }),
    { headers, tags: { step: 'assign_plan' } },
  );
  planAssignLatency.add(assignRes.timings.duration);
  const assignOk = check(assignRes, { 'assign plan: 200': (r) => r.status === 200 });
  if (!assignOk) errorRate.add(1);
  else errorRate.add(0);

  const grantRes = http.post(
    `${BASE_URL}/admin/users/${userId}/credits`,
    JSON.stringify({
      amount: 10,
      kind: 'PURCHASED',
      expiresAt: null,
      reason: `P11-T3 admin-mutation load, VU ${__VU}`,
    }),
    { headers, tags: { step: 'grant_credits' } },
  );
  creditGrantLatency.add(grantRes.timings.duration);
  const grantOk = check(grantRes, { 'grant credits: 201': (r) => r.status === 201 });
  if (!grantOk) errorRate.add(1);
  else errorRate.add(0);
}
