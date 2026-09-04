/**
 * T226 — where to find `apps/sandbox-runner`, and only that.
 *
 * Deliberately not folded into `config/env.ts`: that file's own header scopes
 * it to auth/secrets specifically (`requireSecret`, `ALLOW_INSECURE_DEV_SECRETS`,
 * the fail-closed-without-a-real-signing-key machinery) — a service base URL is
 * a different kind of configuration entirely and doesn't need any of that.
 *
 * Read LAZILY — this function is called at request time, inside the upload
 * route's handler, never at module load or process boot. `routes/
 * intake.routes.ts` makes the identical call for the identical reason, in its
 * own words: "`createUploadStorage` throws when the R2 variables are unset,
 * and an API that refuses to boot because nobody has configured uploads yet
 * is a worse failure than an upload route that reports the misconfiguration
 * when it is used." A `SANDBOX_RUNNER_URL` that nobody has set yet is the same
 * shape of decision: the rest of this API — scans, billing, everything that
 * isn't capability upload — has no reason to be unreachable over one operator
 * feature nobody has wired up yet.
 */

export class SandboxRunnerNotConfiguredError extends Error {
  override readonly name = 'SandboxRunnerNotConfiguredError';
}

/**
 * Returns the base URL of the `apps/sandbox-runner` deployment (e.g.
 * `http://sandbox-runner.internal:3003`), read fresh from `process.env` on
 * every call. Throws `SandboxRunnerNotConfiguredError` when the variable is
 * unset, empty, or not a well-formed URL — the caller (`capability-upload
 * .service.ts` / `admin/capabilities.routes.ts`) maps that to a 503, never a
 * fallback to unsandboxed execution (Constitution Principle V / R1).
 */
export function getSandboxRunnerUrl(): string {
  const raw = process.env['SANDBOX_RUNNER_URL'];
  if (raw === undefined || raw === '') {
    throw new SandboxRunnerNotConfiguredError(
      'SANDBOX_RUNNER_URL is not set. Capability upload has no sandbox to dispatch to.',
    );
  }
  try {
    void new URL(raw);
  } catch {
    throw new SandboxRunnerNotConfiguredError(`SANDBOX_RUNNER_URL is not a well-formed URL: ${raw}`);
  }
  return raw;
}
