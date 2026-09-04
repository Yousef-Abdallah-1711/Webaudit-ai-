/**
 * @webaudit/sandbox-runner
 *
 * Untrusted capability isolation (R1).
 * NO network egress, NO database credentials — an escape must yield access to
 * nothing worth having.
 *
 * T226 — `createSandboxHost`/`SandboxHost` are re-exported from here so an
 * out-of-package caller (an integration test in `apps/api`, most concretely
 * — see `tests/contract/admin.capabilities.test.ts`'s "T226 — real dispatch"
 * suite) can boot a real host through this package's public `"."` subpath
 * rather than reaching past it into `./src/host/server.js` directly. Real
 * request dispatch itself goes through `./conformance` (`runConformanceCheck`,
 * over HTTP) — this export exists for tests and any other caller that needs
 * to stand up a real, in-process sandbox host, not for production request
 * handling.
 */

export const SERVICE_NAME = '@webaudit/sandbox-runner' as const;

export { createSandboxHost, newRequestId } from './host/server.js';
export type { SandboxHost, CreateSandboxHostOptions } from './host/server.js';
