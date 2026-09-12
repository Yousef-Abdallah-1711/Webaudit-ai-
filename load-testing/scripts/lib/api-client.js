// specs/004-load-testing-harness — shared k6 helpers for the golden-path workflow.
// Every request shape here was confirmed against the real, running apps/api via
// manual curl calls before being encoded (see contracts/golden-path-workflow.md).

import http from 'k6/http';
import { check } from 'k6';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function authHeaders(token) {
  return { ...JSON_HEADERS, Authorization: `Bearer ${token}` };
}

export function login(baseUrl, email, password) {
  const res = http.post(
    `${baseUrl}/auth/login`,
    JSON.stringify({ email, password }),
    { headers: JSON_HEADERS, tags: { step: 'login' } },
  );
  const ok = check(res, {
    'login: 200': (r) => r.status === 200,
  });
  if (!ok) {
    return { ok: false, res };
  }
  const body = res.json();
  return { ok: true, res, accessToken: body.accessToken };
}

export function createTarget(baseUrl, token, value) {
  const res = http.post(
    `${baseUrl}/targets`,
    JSON.stringify({ inputType: 'URL', value }),
    { headers: authHeaders(token), tags: { step: 'create_target' } },
  );
  const ok = check(res, {
    'createTarget: 200 or 201': (r) => r.status === 200 || r.status === 201,
  });
  if (!ok) {
    return { ok: false, res };
  }
  const body = res.json();
  return { ok: true, res, targetId: body.target.id };
}

export function quote(baseUrl, token, targetId, modules) {
  const res = http.post(
    `${baseUrl}/scans/quote`,
    JSON.stringify({ targetId, modules }),
    { headers: authHeaders(token), tags: { step: 'quote' } },
  );
  const ok = check(res, {
    'quote: 200': (r) => r.status === 200,
  });
  if (!ok) {
    return { ok: false, res };
  }
  const body = res.json();
  return { ok: true, res, credits: body.quote.credits };
}

export function createScan(baseUrl, token, targetId, modules, acceptedQuote) {
  const res = http.post(
    `${baseUrl}/scans`,
    JSON.stringify({ targetId, modules, acceptedQuote }),
    { headers: authHeaders(token), tags: { step: 'create_scan' } },
  );
  const ok = check(res, {
    'createScan: 201': (r) => r.status === 201,
  });
  if (!ok) {
    return { ok: false, res };
  }
  const body = res.json();
  return { ok: true, res, scanId: body.scan.id, state: body.scan.state };
}

const TERMINAL_STATES = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT']);

// Polls GET /scans/:id on a fixed interval until a terminal state or timeoutMs elapses.
// Returns { terminal: bool, state, firstProgressAt, terminalAt } — timestamps are k6's
// own Date.now()-equivalent (ms since epoch) for computing custom Trend durations by the caller.
export function pollUntilTerminal(baseUrl, token, scanId, timeoutMs, pollIntervalMs, sleepFn) {
  const deadline = Date.now() + timeoutMs;
  let sawNonQueued = false;
  let firstProgressAt = null;

  while (Date.now() < deadline) {
    const res = http.get(`${baseUrl}/scans/${scanId}`, {
      headers: authHeaders(token),
      tags: { step: 'poll' },
    });
    if (res.status !== 200) {
      return { terminal: false, state: 'POLL_ERROR', firstProgressAt, terminalAt: null };
    }
    const state = res.json().scan.state;

    if (!sawNonQueued && state !== 'QUEUED') {
      sawNonQueued = true;
      firstProgressAt = Date.now();
    }

    if (TERMINAL_STATES.has(state)) {
      return { terminal: true, state, firstProgressAt, terminalAt: Date.now() };
    }

    sleepFn(pollIntervalMs / 1000);
  }

  return { terminal: false, state: 'POLL_TIMEOUT', firstProgressAt, terminalAt: null };
}
