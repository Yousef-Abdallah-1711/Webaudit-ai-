/**
 * P2-T2 (master plan, Phase 2) — the API's production email fail-closed
 * behaviour, proven against the real process boundary.
 *
 * `createDefaultMailer` (`apps/api/src/app.ts:109-129`) branches on
 * `env.isProduction`, and `@webaudit/config`'s `env` is a frozen snapshot
 * read once at module import — mutating `process.env['NODE_ENV']` after
 * `startApi()` has already run in this test process cannot reach it (the
 * module's own comments on `ApiServiceOptions.billing`/`.rateLimiters` say
 * so explicitly). The only honest way to exercise the real production branch
 * is therefore a real child process with `NODE_ENV=production` set before
 * anything in `@webaudit/config` is ever imported — the same `spawn(tsx,
 * ...)` pattern `apps/worker/tests/adverse/process-crash-containment.test.ts`
 * already uses for the same class of problem (a guarantee that can only be
 * observed from outside the process it protects).
 */

import { describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { TEST_DB_URL } from '../helpers/db.js';
import { isolatedChildEnv } from '../helpers/isolated-database.js';

const REPO_ROOT = join(__dirname, '..', '..', '..', '..');
const TSX_CLI = join(REPO_ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const API_ENTRY = join(REPO_ROOT, 'apps', 'api', 'src', 'index.ts');
// Use the disposable Redis endpoint selected for the test run. Falling back to
// the application's shared development Redis made this process-boundary test
// depend on and connect to an unrelated local DB 15 instance.
const TEST_REDIS_URL =
  process.env['TEST_REDIS_URL'] ??
  `redis://${process.env['EXEC_TEST_REDIS'] ?? '127.0.0.1:6399'}/15`;

interface SpawnResult {
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** Real dev-local, non-production secrets already used by this checkout's own `.env` / vitest config — not sensitive. */
const BASE_ENV = {
  // `DATABASE_URL` comes from the validated test configuration and replaces the
  // ambient value: the booted API must never reach the development database.
  ...isolatedChildEnv(process.env, TEST_DB_URL),
  NODE_ENV: 'production',
  PORT: '0',
  REDIS_URL: TEST_REDIS_URL,
  JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-anywhere-else-0123456789',
  JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-anywhere-else-0123456789',
  ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMteHg=',
  WEB_URL: 'http://localhost:3010',
};

const CHILD_DEADLINE_MS = 60_000;

function runChild(
  env: Record<string, string | undefined>,
  waitForListening: boolean,
): Promise<SpawnResult> {
  return new Promise((resolve, reject) => {
    // `spawn`'s `env` option does NOT treat `{ KEY: undefined }` as "absent" —
    // Node stringifies it to the literal string "undefined", which is a real
    // value as far as `process.env['KEY']` is concerned. Every key this test
    // means to omit must be deleted from the object, not merely set to
    // `undefined`.
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(env)) {
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
    const finish = (result: SpawnResult): void => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      resolve(result);
    };
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
      if (waitForListening && /listening/i.test(stdout)) finish({ code: null, stdout, stderr });
      // The refusal case never exits on its own; end it on the real signal (the
      // entrypoint's boot-time throw) instead of waiting out the deadline.
      if (!waitForListening && /refusing to start/i.test(stdout + stderr)) settleSoon();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      if (!waitForListening && /refusing to start/i.test(stdout + stderr)) settleSoon();
    });
    function settleSoon(): void {
      // Let the rest of the error text arrive before the child is killed.
      setTimeout(() => finish({ code: null, stdout, stderr }), 500);
    }
    child.on('error', reject);
    child.on('exit', (code) => finish({ code, stdout, stderr }));
    // The boot-time throw case logs its error near-instantly but does not
    // exit on its own (see the module note in the first test below), so this
    // fallback is what actually ends that case. tsx startup can take several
    // seconds on Windows, and far longer on a loaded machine (reproduced: 16
    // CPU-bound processes made the old 15 s deadline expire with no output), so
    // this is only a generous upper bound; every case ends earlier on its signal.
    setTimeout(() => finish({ code: null, stdout, stderr }), CHILD_DEADLINE_MS);
  });
}

describe('production email fail-closed boot guard — real child process', () => {
  it(
    'NODE_ENV=production with no EMAIL_TRANSPORT defaults to SMTP and refuses to start without SMTP credentials',
    async () => {
      const result = await runChild(
        {
          ...BASE_ENV,
          EMAIL_TRANSPORT: undefined,
          RESEND_API_KEY: 'placeholder-resend-key-not-a-real-credential',
          EMAIL_FROM: undefined,
          SMTP_USER: undefined,
          SMTP_PASSWORD: undefined,
        },
        false,
      );
      const combined = result.stdout + result.stderr;
      // The real, load-bearing evidence: the entrypoint's own `.catch()`
      // logged the exact boot-time throw this fix depends on.
      expect(combined, `stdout: ${result.stdout}\nstderr: ${result.stderr}`).toMatch(
        /refusing to start/i,
      );
      expect(combined).toMatch(/SMTP_USER is required/);
      // It must never have reached `listening` — the mailer construction
      // throws before the server binds a port at all.
      expect(combined).not.toMatch(/listening/i);
      // Note: `result.code` is not asserted here. `startApi()`'s rejection
      // sets `process.exitCode = 1` but does not force an immediate exit —
      // the realtime fan-out's Redis subscriber connects *before* the mailer
      // is constructed and keeps the event loop alive, so this process is
      // killed by this test's own timeout rather than exiting on its own.
      // That is a real, minor operational characteristic of the entrypoint
      // (worth a follow-up: a boot failure should tear down what it already
      // opened before giving up), not a defect in the fail-closed guard
      // itself, which the log assertions above already prove fired correctly.
    },
    CHILD_DEADLINE_MS + 10_000,
  );

  it(
    'NODE_ENV=production with explicit SMTP transport and real-shaped SMTP credentials boots successfully',
    async () => {
      const result = await runChild(
        {
          ...BASE_ENV,
          EMAIL_TRANSPORT: 'SMTP',
          SMTP_HOST: 'smtp.hostinger.com',
          SMTP_PORT: '465',
          SMTP_USER: 'no-reply@example.com',
          SMTP_PASSWORD: 'placeholder-password-not-a-real-credential',
          EMAIL_FROM: 'no-reply@example.com',
        },
        true,
      );
      expect(
        result.stdout + result.stderr,
        `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toMatch(/listening/i);
    },
    CHILD_DEADLINE_MS + 10_000,
  );

  it(
    'NODE_ENV=production with no transport override and real-shaped SMTP credentials boots successfully',
    async () => {
      const result = await runChild(
        {
          ...BASE_ENV,
          EMAIL_TRANSPORT: undefined,
          SMTP_HOST: 'smtp.hostinger.com',
          SMTP_PORT: '465',
          SMTP_USER: 'no-reply@example.com',
          SMTP_PASSWORD: 'placeholder-password-not-a-real-credential',
          RESEND_API_KEY: 'placeholder-resend-key-not-a-real-credential',
          EMAIL_FROM: 'no-reply@example.com',
        },
        true,
      );
      expect(
        result.stdout + result.stderr,
        `stdout: ${result.stdout}\nstderr: ${result.stderr}`,
      ).toMatch(/listening/i);
    },
    CHILD_DEADLINE_MS + 10_000,
  );
});
