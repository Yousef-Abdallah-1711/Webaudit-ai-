/**
 * P9-T4 (master plan, Phase 9) — the refresh-token cookie's `Secure`
 * attribute must track the real, current connection, not just `NODE_ENV`.
 *
 * `env.isProduction` is a frozen snapshot read once at module import
 * (`@webaudit/config`), so exercising the real production branch of
 * `setRefreshCookie` (`apps/api/src/routes/auth.routes.ts`) needs a real
 * child process with `NODE_ENV=production` — the same reasoning and the same
 * `spawn(tsx, ...)` harness `email-boot-guard.test.ts` already uses for the
 * same class of problem.
 *
 * The bug this guards against was real, not hypothetical: a login through
 * this repository's own production compose stack, before this fix, returned
 * `Set-Cookie: ...; Secure` over a plain HTTP connection (the reverse proxy's
 * genuine interim state before a real TLS certificate exists — P8-T5). A
 * browser refuses to store a `Secure` cookie received over HTTP, so every
 * login in that exact, real, documented deployment state would have silently
 * failed to persist a session. `secure` must instead depend on `req.secure`
 * (which itself reads the trusted `X-Forwarded-Proto` hop once `trust proxy`
 * is set), so it becomes accurate the moment the proxy actually terminates
 * TLS, with no further code change owed.
 */

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import http from 'node:http';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const TSX_CLI = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const API_ENTRY = join(REPO_ROOT, 'apps', 'api', 'src', 'index.ts');
const TEST_PORT = 38123;

const BASE_ENV: Record<string, string | undefined> = {
  ...process.env,
  NODE_ENV: 'production',
  PORT: String(TEST_PORT),
  DATABASE_URL:
    process.env['DATABASE_URL'] ??
    'postgresql://webaudit:webaudit_dev@localhost:5442/webaudit?schema=public',
  REDIS_URL: 'redis://localhost:6389/15',
  JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-anywhere-else-0123456789',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-anywhere-else-0123456789',
  // Must decode to exactly 32 bytes (token-vault.ts's own guard) — this
  // route seals a real transaction cookie, unlike email-boot-guard.test.ts's
  // 35-byte placeholder, which never reaches token-vault at all.
  ENCRYPTION_KEY: 's9rlUG792zpUsod0ou7OInX8XmhevEXRWV5PSsWsYf0=',
  WEB_URL: 'http://localhost:3010',
  EMAIL_TRANSPORT: undefined,
  SMTP_USER: undefined,
  SMTP_PASSWORD: undefined,
  RESEND_API_KEY: 'placeholder-resend-key-not-a-real-credential',
  EMAIL_FROM: 'no-reply@example.com',
  TRUST_PROXY_HOPS: '1',
  GITHUB_OAUTH_CLIENT_ID: 'placeholder-client-id-not-real',
  GITHUB_OAUTH_CLIENT_SECRET: 'placeholder-client-secret-not-real',
};

function startChild(): Promise<{ kill: () => void }> {
  return new Promise((resolve, reject) => {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(BASE_ENV)) {
      if (value !== undefined) cleaned[key] = value;
    }
    const child = spawn(process.execPath, [TSX_CLI, API_ENTRY], {
      cwd: REPO_ROOT,
      stdio: 'pipe',
      env: cleaned,
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (!settled && /listening/i.test(stdout)) {
        settled = true;
        resolve({ kill: () => child.kill('SIGKILL') });
      }
    });
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('exit', (code) => {
      if (!settled) {
        reject(
          new Error(`api exited before listening (code ${String(code)})\nstdout: ${stdout}\nstderr: ${stderr}`),
        );
      }
    });
    setTimeout(() => {
      if (!settled) {
        reject(new Error(`api did not log "listening" within 15s\nstdout: ${stdout}\nstderr: ${stderr}`));
      }
    }, 15_000);
  });
}

interface StartResult {
  readonly status: number | undefined;
  readonly setCookie: string | undefined;
}

/**
 * `GET /auth/oauth/github/start` always sets the pending-transaction cookie
 * (`setTransactionCookie`) with no real credentials or database state
 * needed — the same `secure: env.isProduction && req.secure` codepath this
 * file exists to prove, without the complication of seeding a real user.
 */
function oauthStart(extraHeaders: Record<string, string>): Promise<StartResult> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port: TEST_PORT,
        path: '/auth/oauth/github/start',
        method: 'GET',
        headers: extraHeaders,
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({
            status: res.statusCode,
            setCookie: res.headers['set-cookie']?.[0],
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('cookie Secure attribute tracks the real connection, not just NODE_ENV — real child process', () => {
  it(
    'NODE_ENV=production over a plain HTTP connection with no trusted TLS hop: the cookie is set but never Secure',
    async () => {
      const server = await startChild();
      try {
        const result = await oauthStart({});
        expect(result.status).toBe(302); // real redirect to the provider, confirms the route ran
        expect(result.setCookie).toBeDefined();
        expect(result.setCookie).not.toMatch(/;\s*Secure/i);
      } finally {
        server.kill();
      }
    },
    20_000,
  );

  it(
    'NODE_ENV=production behind a trusted X-Forwarded-Proto: https hop (real TLS termination at the proxy): the cookie is Secure',
    async () => {
      const server = await startChild();
      try {
        const result = await oauthStart({
          'X-Forwarded-Proto': 'https',
          'X-Forwarded-For': '203.0.113.7',
        });
        expect(result.status).toBe(302);
        expect(result.setCookie).toBeDefined();
        expect(result.setCookie).toMatch(/;\s*Secure/i);
      } finally {
        server.kill();
      }
    },
    20_000,
  );
});
