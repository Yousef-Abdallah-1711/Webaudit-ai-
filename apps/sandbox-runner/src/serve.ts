/**
 * T225 — the real process entrypoint. `src/index.ts` is only a
 * `SERVICE_NAME` export, not a bootstrap; nothing before this session ever
 * turned `createSandboxHost` into a running process. This file does exactly
 * that and nothing more.
 *
 * Deliberately minimal, on purpose: this is trusted host code (the code
 * that forks children, not the code that runs inside them), so a plain
 * startup line is fine here — the "never let `logger` cross into the
 * sandbox" rule (see `child-harness/context.ts`'s own note) is about the
 * untrusted `vm.Context`, not about this file. T231 — the listening line
 * below goes through `@webaudit/config`'s `createLogger` (structured JSON,
 * redacted per FR-091) rather than a raw `console.warn`, matching the same
 * swap made in `apps/api/src/index.ts` and `apps/worker/src/index.ts`. No
 * `@prisma/client`, no `ioredis`, no `bullmq` import belongs here or
 * anywhere else in this package (R1: "NO network egress, NO database
 * credentials") — see `infrastructure/sandbox-runner.md` and `tests/
 * adverse/deployment-isolation.test.ts` for what keeps that true over time.
 */
import { createLogger } from '@webaudit/config';
import { createSandboxHost } from './host/server.js';

const logger = createLogger('sandbox-runner');

function parsePort(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

const port = parsePort(process.env['SANDBOX_RUNNER_PORT'] ?? process.env['PORT'], 3003);
const host = process.env['SANDBOX_RUNNER_HOST'] ?? '127.0.0.1';

const sandboxHost = await createSandboxHost({ port, host });

logger.info(`listening on http://${host}:${String(sandboxHost.port)}`);

async function shutdown(): Promise<void> {
  await sandboxHost.close();
  process.exit(0);
}

process.on('SIGTERM', () => {
  void shutdown();
});
process.on('SIGINT', () => {
  void shutdown();
});
