/**
 * T225 — proves the two claims `infrastructure/sandbox-runner.md` makes
 * about this deployment are true *by construction*, not just by prose:
 *
 *   1. No dependency on a database or queue client exists in this package's
 *      own `package.json` — R1's "NO database credentials" would be a dead
 *      letter the day someone `pnpm add`s one to reach for a shortcut.
 *   2. No source file under `src/` ever references the *name* of a secret
 *      this deployment must never hold (`DATABASE_URL`, `REDIS_URL`,
 *      `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`) — even a
 *      read that would fail today (because the variable is never set here)
 *      is worth catching, because it would silently start working the
 *      moment someone *did* set it on this deployment by mistake.
 *
 * A third case proves the host itself — trusted code, not the sandboxed
 * child — is a real, connectable HTTP server with a liveness route, which
 * is what an orchestrator's own health check depends on.
 *
 * This is an adverse suite, not a unit test: what it defends against is a
 * future change quietly reintroducing exactly the coupling R1 forbids.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSandboxHost, type SandboxHost } from '../../src/host/server.js';

const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC_ROOT = path.join(PACKAGE_ROOT, 'src');

const FORBIDDEN_DEPENDENCIES = [
  '@prisma/client',
  'pg',
  'mysql',
  'mysql2',
  'mongodb',
  'ioredis',
  'redis',
  'bullmq',
];

const FORBIDDEN_ENV_VAR_NAMES = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'ENCRYPTION_KEY',
];

describe('deployment isolation (R1: no network egress, no database credentials)', () => {
  it('declares none of the forbidden database/queue client dependencies', () => {
    const raw = readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as {
      readonly dependencies?: Record<string, string>;
      readonly devDependencies?: Record<string, string>;
    };
    // Both fields, not just `dependencies`: the deployment runbook's own
    // `pnpm install --frozen-lockfile` (no `--prod`) installs devDependencies
    // too in a pnpm workspace, so a client added there would physically land
    // in `node_modules` under the documented deploy command just the same —
    // found by an independent review of this session's own work.
    const dependencyNames = [
      ...Object.keys(parsed.dependencies ?? {}),
      ...Object.keys(parsed.devDependencies ?? {}),
    ];

    for (const forbidden of FORBIDDEN_DEPENDENCIES) {
      expect(dependencyNames).not.toContain(forbidden);
    }
  });

  it('never names a secret this deployment must never hold, anywhere under src/', () => {
    // Node 22's `fs.readdirSync` supports `recursive: true` directly — no
    // hand-rolled directory walk needed.
    const entries = readdirSync(SRC_ROOT, { recursive: true, withFileTypes: true });
    const tsFiles = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => path.join(entry.parentPath, entry.name));

    expect(tsFiles.length).toBeGreaterThan(0); // the walk itself must find real files, or this test proves nothing

    for (const file of tsFiles) {
      const contents = readFileSync(file, 'utf8');
      for (const forbiddenName of FORBIDDEN_ENV_VAR_NAMES) {
        expect(contents, `${file} must never reference ${forbiddenName}`).not.toContain(
          forbiddenName,
        );
      }
    }
  });

  describe('the health route', () => {
    let host: SandboxHost;

    beforeAll(async () => {
      host = await createSandboxHost({ port: 0 });
    });

    afterAll(async () => {
      await host.close();
    });

    it('answers GET /health with 200 {status: "ok"}', async () => {
      const res = await fetch(`http://127.0.0.1:${String(host.port)}/health`);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });
});
