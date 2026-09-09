/**
 * T253 — where to find `apps/sandbox-runner`, from `apps/worker`'s side.
 * Mirrors `apps/api/src/config/sandbox.ts`'s `getSandboxRunnerUrl` exactly;
 * not shared, because this codebase does not centralize env reading across
 * apps — `apps/worker` has no `config/env.ts`-equivalent at all (every
 * file that touches `process.env` in this package does so directly,
 * inline, at its own call site: `db.ts`'s `DATABASE_URL` check is the
 * existing precedent this file follows).
 *
 * Read lazily, at the point an installed capability is actually about to
 * be dispatched — not at worker boot. A worker with zero installed
 * capabilities discovered must not refuse to start over a variable it
 * will never need.
 */
export class SandboxRunnerNotConfiguredError extends Error {
  override readonly name = 'SandboxRunnerNotConfiguredError';
}

export function getSandboxRunnerUrl(): string {
  const raw = process.env['SANDBOX_RUNNER_URL'];
  if (raw === undefined || raw === '') {
    throw new SandboxRunnerNotConfiguredError(
      'SANDBOX_RUNNER_URL is not set. An installed capability cannot be dispatched without it.',
    );
  }
  return raw;
}
