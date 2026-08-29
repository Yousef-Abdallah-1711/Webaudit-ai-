/**
 * T109 — the first real Playwright test-runner config in this repo.
 *
 * `apps/web/tests/visual/harness.ts` (T246) already uses `@playwright/test`'s
 * `chromium` export directly, but never `playwright test` itself — those
 * specs run through vitest's own `visual` project. `apps/web/tests/e2e/`
 * needs the real runner: `first-audit.spec.ts` boots real services in
 * `test.beforeAll`, and vitest's project model has no equivalent hook shared
 * across every test in a file the way Playwright's does.
 *
 * No `webServer` entry. Every service this suite needs (a local fixture
 * site, the real API, the real worker) is booted in-process inside
 * `first-audit.spec.ts` itself via `startApi`/`startWorker` — the same
 * functions `apps/api`'s own integration tests use — rather than shelled
 * out to as separate processes. `apps/api/package.json`'s own `dev` script
 * still literally says "not implemented"; there is no real way to spawn it
 * as a standalone process yet.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
