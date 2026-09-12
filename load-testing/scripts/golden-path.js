// specs/004-load-testing-harness — the staged concurrency scenario.
//
// Each VU: login (its own dedicated seeded user) -> create target (fixed public
// URL, shared across all VUs -- research.md Decision 2/4, revised) -> quote ->
// create scan -> poll to terminal. Run one stage per invocation via STAGE_VUS,
// per research.md Decision 3.
//
// One VU, one dedicated user -- never shared -- because target canonicalization
// discards path/query to the bare origin (confirmed by a real curl call, see
// contracts/golden-path-workflow.md), so two VUs sharing a user would collide on
// Scan_one_active_per_target the moment both are mid-scan at once.

import { sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';
import { login, createTarget, quote, createScan, pollUntilTerminal } from './lib/api-client.js';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const STAGE_VUS = parseInt(__ENV.STAGE_VUS || '1', 10);
const POLL_TIMEOUT_MS = parseInt(__ENV.POLL_TIMEOUT_MS || '300000', 10); // 5 min, matches the ~5-min typical-audit target
const POLL_INTERVAL_MS = parseInt(__ENV.POLL_INTERVAL_MS || '2000', 10);

const LOAD_TEST_PASSWORD = 'load-test-correct-horse-battery-staple';
const TARGET_URL = 'https://example.com/';
const MODULES = ['SECURITY'];

// research.md Decision 2, revised: 65 seeded users, one dedicated per VU.
function emailForVu(vuId) {
  return `loadtest-${vuId}@webaudit-loadtest.local`;
}

export const quoteLatency = new Trend('quote_latency', true);
export const scanCreateLatency = new Trend('scan_create_latency', true);
export const timeToFirstProgress = new Trend('time_to_first_progress', true);
export const timeToTerminal = new Trend('time_to_terminal', true);
export const errorRate = new Rate('golden_path_errors');

export const options = {
  scenarios: {
    golden_path: {
      executor: 'per-vu-iterations',
      vus: STAGE_VUS,
      iterations: 1,
      maxDuration: `${Math.ceil(POLL_TIMEOUT_MS / 1000) + 60}s`,
    },
  },
};

export default function goldenPath() {
  const vuId = __VU; // k6 VU ids are 1-indexed
  const email = emailForVu(vuId);

  const loginResult = login(BASE_URL, email, LOAD_TEST_PASSWORD);
  if (!loginResult.ok) {
    errorRate.add(1);
    return;
  }
  const token = loginResult.accessToken;

  const targetResult = createTarget(BASE_URL, token, TARGET_URL);
  if (!targetResult.ok) {
    errorRate.add(1);
    return;
  }
  const targetId = targetResult.targetId;

  const quoteStart = Date.now();
  const quoteResult = quote(BASE_URL, token, targetId, MODULES);
  quoteLatency.add(Date.now() - quoteStart);
  if (!quoteResult.ok) {
    errorRate.add(1);
    return;
  }

  const scanCreateStart = Date.now();
  const scanResult = createScan(BASE_URL, token, targetId, MODULES, quoteResult.credits);
  scanCreateLatency.add(Date.now() - scanCreateStart);
  if (!scanResult.ok) {
    errorRate.add(1);
    return;
  }

  const iterationStart = Date.now();
  const pollResult = pollUntilTerminal(
    BASE_URL,
    token,
    scanResult.scanId,
    POLL_TIMEOUT_MS,
    POLL_INTERVAL_MS,
    sleep,
  );

  if (pollResult.firstProgressAt !== null) {
    timeToFirstProgress.add(pollResult.firstProgressAt - iterationStart);
  }

  if (!pollResult.terminal || pollResult.state !== 'COMPLETED') {
    errorRate.add(1);
    return;
  }

  timeToTerminal.add(pollResult.terminalAt - iterationStart);
  errorRate.add(0);
}
