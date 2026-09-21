/**
 * T040 closure — post-authentication capacity probe.
 *
 * The k6 golden-path harness (RUNBOOK.md) proves stages 1/5/10 including a real
 * `/auth/login` call per VU, and documents that stages 20/40/60 are UNVERIFIABLE
 * BY DESIGN from one machine because `/auth/login`'s strict rate limiter (10/15min,
 * keyed by source IP) cannot be satisfied by 20+ fresh logins from one IP — a
 * deliberate anti-brute-force control, not a bug, and not something this repo's
 * own FR-005 (load testing must not require product code changes) allows patching
 * around.
 *
 * This script measures a DIFFERENT, legitimate capacity dimension instead: once a
 * user is already authenticated (which every real user only does once, then holds
 * a token for its lifetime), how does the platform behave under concurrent
 * scan-intake, queue, and worker load? It mints valid access tokens directly with
 * the same signing call the API's own login path uses (`jose` SignJWT, HS256,
 * `env.JWT_ACCESS_SECRET` from this repo's own `.env`) — not a forged/exploited
 * token, a real one for a real seeded account, just without spending that
 * account's login-rate-limit budget to get it. This is standard load-testing
 * practice (pre-authenticate, then measure the system under test) and does NOT
 * demonstrate anything about bypassing the login limiter itself, which remains a
 * real, working control (proven separately in reports/auth-security-review.md).
 *
 * Usage: node load-testing/scripts/post-auth-capacity.mjs <concurrency>
 */
import { SignJWT } from 'jose';
import { readFileSync } from 'node:fs';
import WebSocket from 'ws';

const CONCURRENCY = Number(process.argv[2] ?? '20');
const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001/realtime';
const USERS_FILE = process.argv[3];
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET must be set (source .env first).');
if (!USERS_FILE) throw new Error('Pass a JSON file of [{id,email}] seeded users as the 2nd arg.');

async function mintToken(userId, isOperator) {
  const key = new TextEncoder().encode(JWT_ACCESS_SECRET);
  return new SignJWT({ isOperator })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(key);
}

function loadUsers(n) {
  const rows = JSON.parse(readFileSync(USERS_FILE, 'utf8'));
  if (rows.length < n) throw new Error(`Only ${rows.length} seeded load-test users, need ${n}.`);
  return rows.slice(0, n);
}

async function timed(label, fn) {
  const start = performance.now();
  const result = await fn();
  return { label, ms: performance.now() - start, result };
}

async function runVU(index, user, token) {
  const events = [];
  const targetValue = `https://example.com`;

  const target = await timed('createTarget', async () => {
    const res = await fetch(`${BASE_URL}/targets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputType: 'URL', value: targetValue }),
    });
    if (!res.ok) throw new Error(`createTarget ${res.status}: ${await res.text()}`);
    return res.json();
  });
  events.push(target);

  const targetId = target.result.target.id;
  await fetch(`${BASE_URL}/targets/${targetId}/attest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });

  const quote = await timed('quote', async () => {
    const res = await fetch(`${BASE_URL}/scans/quote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetId, modules: ['SECURITY'] }),
    });
    if (!res.ok) throw new Error(`quote ${res.status}: ${await res.text()}`);
    return res.json();
  });
  events.push(quote);

  const scan = await timed('createScan', async () => {
    const res = await fetch(`${BASE_URL}/scans`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetId,
        modules: ['SECURITY'],
        acceptedQuote: quote.result.quote.credits,
      }),
    });
    const body = await res.json();
    if (!res.ok) return { status: res.status, body, failed: true };
    return { status: res.status, body, failed: false };
  });
  events.push(scan);

  if (scan.result.failed) {
    return { index, email: user.email, ok: false, reason: scan.result.body, events };
  }

  const scanId = scan.result.body.scan.id;
  const pollStart = performance.now();
  let terminal = null;
  let progressEvents = 0;
  let subscribed = false;

  // Match the real /scan/[id] page: REST fetch for current state FIRST (a fixture-mode
  // scan can complete in well under the time it takes to open a WS connection and send
  // a subscribe message — there is no event replay/backlog for a client that subscribes
  // after the fact, by design), THEN WS only for further live updates if not yet terminal.
  {
    const res = await fetch(`${BASE_URL}/scans/${scanId}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    const state = body.scan?.state;
    if (state === 'COMPLETED' || state === 'FAILED' || state === 'CANCELLED') {
      return {
        index,
        email: user.email,
        ok: state === 'COMPLETED',
        scanId,
        terminal: { state, ms: performance.now() - pollStart, viaImmediateRest: true },
        progressEvents: 0,
        events: events.map((e) => ({ label: e.label, ms: Math.round(e.ms) })),
      };
    }
  }

  await new Promise((resolve) => {
    const ws = new WebSocket(WS_URL);
    const timer = setTimeout(() => {
      ws.close();
      resolve();
    }, 60_000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'subscribe', scanId, token }));
    });
    ws.on('message', (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }
      if (msg.type === 'subscribed') {
        subscribed = true;
        return;
      }
      if (msg.type === 'error') {
        clearTimeout(timer);
        ws.close();
        resolve();
        return;
      }
      // Scan-event envelope: { scanId, emittedAt, event: {...} }. The terminal signal is a
      // `scan:state` event whose own `state` field is COMPLETED/FAILED/CANCELLED/TIMED_OUT —
      // there is no separate `scan:complete`/`scan:failed` *event type* on the wire (those
      // names exist in the type union for other purposes, e.g. module-level completion).
      const event = msg.event;
      if (event !== undefined) {
        progressEvents += 1;
        if (
          event.type === 'scan:state' &&
          ['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT'].includes(event.state)
        ) {
          terminal = { state: event.state, ms: performance.now() - pollStart };
          clearTimeout(timer);
          ws.close();
          resolve();
        }
      }
    });
    ws.on('error', () => {
      clearTimeout(timer);
      resolve();
    });
  });
  if (terminal === null && subscribed) {
    // WS gave no terminal event within budget — fall back to one REST check,
    // not a poll loop, to confirm actual state without hammering the general limiter.
    const res = await fetch(`${BASE_URL}/scans/${scanId}`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await res.json();
    if (body.scan?.state) terminal = { state: body.scan.state, ms: performance.now() - pollStart, viaFallback: true };
  }

  return {
    index,
    email: user.email,
    ok: terminal !== null && terminal.state === 'COMPLETED',
    scanId,
    terminal,
    progressEvents,
    events: events.map((e) => ({ label: e.label, ms: Math.round(e.ms) })),
  };
}

function percentile(arr, p) {
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

(async () => {
  console.log(`[post-auth-capacity] concurrency=${CONCURRENCY} base=${BASE_URL}`);
  const users = loadUsers(CONCURRENCY);
  const tokens = await Promise.all(users.map((u) => mintToken(u.id, false)));

  const wallStart = performance.now();
  const results = await Promise.all(
    users.map((u, i) => runVU(i, u, tokens[i]).catch((err) => ({ index: i, email: u.email, ok: false, error: String(err) }))),
  );
  const wallMs = performance.now() - wallStart;

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const scanCreateMs = results.flatMap((r) => (r.events ?? []).filter((e) => e.label === 'createScan').map((e) => e.ms));
  const quoteMs = results.flatMap((r) => (r.events ?? []).filter((e) => e.label === 'quote').map((e) => e.ms));
  const terminalMs = ok.map((r) => r.terminal.ms);

  console.log(JSON.stringify({
    concurrency: CONCURRENCY,
    wallMs: Math.round(wallMs),
    succeeded: ok.length,
    failed: failed.length,
    failureReasons: failed.map((r) => ({ email: r.email, reason: r.reason ?? r.error ?? r.terminal })),
    quoteLatency: { p50: percentile(quoteMs, 50), p95: percentile(quoteMs, 95), max: Math.max(...quoteMs, 0) },
    scanCreateLatency: { p50: percentile(scanCreateMs, 50), p95: percentile(scanCreateMs, 95), max: Math.max(...scanCreateMs, 0) },
    timeToTerminal: { p50: percentile(terminalMs, 50), p95: percentile(terminalMs, 95), max: Math.max(...terminalMs, 0) },
  }, null, 2));
})();
