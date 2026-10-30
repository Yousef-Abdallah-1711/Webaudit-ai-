// Real-HTTP / real-WebSocket acceptance driver for the Docker acceptance stack (infrastructure/docker-compose.acceptance.yml).
// It talks to the published API port only, and uses `docker compose exec postgres psql` as the administrator ONLY to mark
// the throwaway test users verified and to read ledger/plan rows for assertions (the console mailer does not print tokens).
//
//   node scripts/acceptance/docker-e2e.mjs [expect-plans: off|on]
//
// Environment: ACCEPT_API_PORT (4530), ACCEPT_WEB_PORT (4531), ACCEPT_PROJECT (fahes-accept). Never point it at a shared stack.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

const require = createRequire(path.resolve('apps/api/package.json'));
const WebSocket = require('ws');

const API = `http://127.0.0.1:${process.env.ACCEPT_API_PORT ?? '4530'}`;
const WEB = `http://127.0.0.1:${process.env.ACCEPT_WEB_PORT ?? '4531'}`;
const PROJECT = process.env.ACCEPT_PROJECT ?? 'fahes-accept';
const EXPECT_PLANS = (process.argv[2] ?? 'off') === 'on';
const TARGET = 'http://127.0.0.1:8080/';
const PASSWORD = 'correct-horse-battery-staple';
const tag = randomBytes(3).toString('hex');
const results = [];

const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail: String(detail) });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
};

function psql(sql) {
  return execFileSync(
    'docker',
    [
      'compose',
      '-p',
      PROJECT,
      '-f',
      'infrastructure/docker-compose.acceptance.yml',
      '--env-file',
      '.env.acceptance',
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'webaudit',
      '-d',
      'webaudit',
      '-tAc',
      sql,
    ],
    { encoding: 'utf8' },
  ).trim();
}

async function call(method, route, { token, body } = {}) {
  const res = await fetch(`${API}${route}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, json };
}

async function newUser(label) {
  const email = `${label}-${tag}@example.com`;
  const reg = await call('POST', '/auth/register', { body: { email, password: PASSWORD } });
  psql(`update "User" set "emailVerifiedAt"=now() where email='${email}'`);
  const login = await call('POST', '/auth/login', { body: { email, password: PASSWORD } });
  return {
    email,
    token: login.json?.accessToken,
    registerStatus: reg.status,
    loginStatus: login.status,
  };
}

const balance = async (token) => {
  const r = await call('GET', '/billing/credits', { token });
  return r.json?.credits?.available ?? r.json?.balance ?? r.json?.available ?? r.json;
};

function listen(scanId, token) {
  return new Promise((resolve) => {
    const events = [];
    const ws = new WebSocket(`${API.replace('http', 'ws')}/realtime`);
    ws.on('open', () => ws.send(JSON.stringify({ action: 'subscribe', scanId, token })));
    ws.on('message', (d) => events.push(JSON.parse(d.toString())));
    ws.on('error', () => resolve({ events, ws, error: true }));
    setTimeout(() => resolve({ events, ws }), 1500);
  });
}

// ---- web + health ---------------------------------------------------------------------------------------------------
check('api /health 200', (await fetch(`${API}/health`)).status === 200);
for (const p of ['/', '/login', '/pricing']) {
  const r = await fetch(`${WEB}${p}`, { redirect: 'manual' });
  check(`web ${p} responds (<500)`, r.status < 500, r.status);
}

// ---- H01 authentication -----------------------------------------------------------------------------------------------
const a = await newUser('owner');
check('register 201', a.registerStatus === 201, a.registerStatus);
check(
  'login 200 with an access token',
  a.loginStatus === 200 && typeof a.token === 'string',
  a.loginStatus,
);
check(
  'GET /auth/me with token 200',
  (await call('GET', '/auth/me', { token: a.token })).status === 200,
);
check(
  'wrong password refused (401)',
  (await call('POST', '/auth/login', { body: { email: a.email, password: 'wrong-password-123' } }))
    .status === 401,
);
check(
  'protected route without a token refused (401)',
  (await call('GET', '/targets')).status === 401,
);
check(
  'forged token refused (401)',
  (await call('GET', '/targets', { token: 'not.a.token' })).status === 401,
);
const b = await newUser('other');
check(
  'second tenant can log in (' + 'status ' + b.loginStatus + ')',
  b.loginStatus === 200 && typeof b.token === 'string',
);

// ---- H03 targets ------------------------------------------------------------------------------------------------------
const t = await call('POST', '/targets', {
  token: a.token,
  body: { inputType: 'URL', value: TARGET },
});
check('create fixture target 201', t.status === 201, t.status);
const targetId = t.json?.target?.id;
const bad = await call('POST', '/targets', {
  token: a.token,
  body: { inputType: 'URL', value: 'http://169.254.169.254/latest/meta-data' },
});
check('metadata-address target refused', bad.status >= 400 && bad.status < 500, bad.status);
const listA = await call('GET', '/targets', { token: a.token });
check('owner lists own target', JSON.stringify(listA.json).includes(targetId));
const listB = await call('GET', '/targets', { token: b.token });
check('other tenant does not see it', !JSON.stringify(listB.json).includes(targetId));
const quoteB = await call('POST', '/scans/quote', {
  token: b.token,
  body: { targetId, modules: ['SECURITY'] },
});
check(
  'other tenant cannot scan it (404)',
  (
    await call('POST', '/scans', {
      token: b.token,
      body: { targetId, modules: ['SECURITY'], acceptedQuote: 10 },
    })
  ).status === 404,
  quoteB.status,
);

// ---- H04/H05 scan lifecycle (legacy or SPEC 009 plan path, per the stack flag) ----------------------------------------
const modules = ['SECURITY', 'SEO'];
const q = await call('POST', '/scans/quote', { token: a.token, body: { targetId, modules } });
check('quote 200', q.status === 200, q.status);
const before = await balance(a.token);
const created = await call('POST', '/scans', {
  token: a.token,
  body: { targetId, modules, acceptedQuote: q.json.quote.credits },
});
check(
  'scan create 201',
  created.status === 201,
  `${created.status} ${JSON.stringify(created.json).slice(0, 120)}`,
);
const scanId = created.json?.scan?.id;
const sub = await listen(scanId, a.token);
check(
  'owner WebSocket subscription acknowledged',
  sub.events.some((e) => e.type === 'subscribed'),
);
const intruder = await listen(scanId, b.token);
check(
  'other tenant WebSocket subscription refused',
  intruder.events.some((e) => e.type === 'error') &&
    !intruder.events.some((e) => e.type === 'subscribed'),
);
intruder.ws.close();

const terminal = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);
let state = 'QUEUED';
const t0 = Date.now();
while (!terminal.has(state) && Date.now() - t0 < 120_000) {
  const r = await call('GET', `/scans/${scanId}`, { token: a.token });
  state = r.json?.scan?.state ?? state;
  if (!terminal.has(state)) await new Promise((r2) => setTimeout(r2, 1000));
}
check(
  'scan reaches COMPLETED',
  state === 'COMPLETED',
  `${state} after ${Math.round((Date.now() - t0) / 1000)}s`,
);
await new Promise((r) => setTimeout(r, 500));
check(
  'live WebSocket events received during the scan',
  sub.events.filter((e) => e.event || e.type !== 'subscribed').length > 0,
  `${sub.events.length} frames`,
);
sub.ws.close();
const report = await call('GET', `/scans/${scanId}/report`, { token: a.token });
check(
  'report 200 with a score',
  report.status === 200 && report.json?.report?.score !== undefined,
  JSON.stringify(report.json?.report?.score),
);
check('report carries a coverage list', Array.isArray(report.json?.report?.coverage));
const cov = await call('GET', `/scans/${scanId}/coverage`, { token: a.token });
check('coverage endpoint 200', cov.status === 200);
check(
  'other tenant cannot read the report (404)',
  (await call('GET', `/scans/${scanId}/report`, { token: b.token })).status === 404,
);
const after = await balance(a.token);
check(
  'credits were debited once for the scan',
  JSON.stringify(before) !== JSON.stringify(after),
  `${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
);
const debits = psql(
  `select count(*) from "CreditTransaction" where "scanId"='${scanId}' and type='DEBIT'`,
);
check('exactly one DEBIT ledger row for the scan', debits === '1', debits);
const planCount = Number(psql(`select count(*) from "ScanPlan" where "scanId"='${scanId}'`));
if (EXPECT_PLANS) {
  check('SPEC 009: a RESOLVED plan exists', planCount === 1, planCount);
  const units = psql(
    `select string_agg(status::text||':'||coalesce("terminalReason",''),',') from "ExecutionUnit" u join "ScanPlan" p on p.id=u."scanPlanId" where p."scanId"='${scanId}'`,
  );
  check(
    'SPEC 009: every passive unit COMPLETED by the orchestrator',
    units.split(',').length === modules.length &&
      units.split(',').every((u) => u === 'COMPLETED:PASSIVE_COMPLETED_BY_ORCHESTRATOR'),
    units,
  );
  check(
    'SPEC 009: coverage lists the completed units',
    (cov.json?.coverage?.[0]?.completedUnits?.length ?? 0) === modules.length,
  );
} else {
  check('legacy: no plan rows were created', planCount === 0, planCount);
}

// ---- H06 cancellation and refunds -------------------------------------------------------------------------------------
const cancelModules = ['SEO']; // the free plan has 50 credits; the first scan already spent 30
const q2 = await call('POST', '/scans/quote', {
  token: a.token,
  body: { targetId, modules: cancelModules },
});
const bal2 = await balance(a.token);
const c2 = await call('POST', '/scans', {
  token: a.token,
  body: { targetId, modules: cancelModules, acceptedQuote: q2.json.quote.credits },
});
check('second scan created', c2.status === 201, c2.status);
const scan2 = c2.json?.scan?.id;
const cancel = await call('POST', `/scans/${scan2}/cancel`, { token: a.token });
check('cancel 200', cancel.status === 200, cancel.status);
const dup = await call('POST', `/scans/${scan2}/cancel`, { token: a.token });
check('duplicate cancel refused (409)', dup.status === 409, dup.status);
await new Promise((r) => setTimeout(r, 1500));
const bal3 = await balance(a.token);
check(
  'cancelled scan refunded exactly once (balance restored)',
  JSON.stringify(bal2) === JSON.stringify(bal3),
  `${JSON.stringify(bal2)} -> ${JSON.stringify(bal3)}`,
);
const refunds = psql(
  `select count(*) from "CreditTransaction" where "scanId"='${scan2}' and type='REFUND'`,
);
check('exactly one REFUND ledger row', refunds === '1', refunds);
const st2 = (await call('GET', `/scans/${scan2}`, { token: a.token })).json?.scan?.state;
check(
  'cancelled scan stays CANCELLED (not resurrected after the worker settles)',
  st2 === 'CANCELLED',
  st2,
);
await new Promise((r) => setTimeout(r, 4000));
check(
  'still CANCELLED after settling',
  (await call('GET', `/scans/${scan2}`, { token: a.token })).json?.scan?.state === 'CANCELLED',
);
check(
  'cancel after completion refused (409)',
  (await call('POST', `/scans/${scanId}/cancel`, { token: a.token })).status === 409,
);

// ---- reconnect / snapshot recovery -------------------------------------------------------------------------------------
const re = await listen(scanId, a.token);
check(
  'reconnect after completion re-authorises',
  re.events.some((e) => e.type === 'subscribed'),
);
re.ws.close();
const snap = await call('GET', `/scans/${scanId}`, { token: a.token });
check('HTTP snapshot recovers the terminal state', snap.json?.scan?.state === 'COMPLETED');

// ---- logout ------------------------------------------------------------------------------------------------------------
check(
  'logout accepted',
  [200, 204].includes((await call('POST', '/auth/logout', { token: a.token })).status),
);

const failed = results.filter((r) => !r.ok);
console.log(
  `\n${results.length - failed.length}/${results.length} passed (${EXPECT_PLANS ? 'SPEC 009 plans ON' : 'legacy path, plans OFF'})`,
);
process.exit(failed.length === 0 ? 0 : 1);
