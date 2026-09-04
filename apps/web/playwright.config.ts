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
 * functions `apps/api`'s own integration tests use — rather than shelled out
 * to as separate processes. That choice predates a real fix: at T109,
 * `apps/api/package.json`'s own `dev` script still literally said "not
 * implemented", so there was no way to spawn it as a standalone process at
 * all. It has run a real `tsx --watch src/index.ts` since long before T227
 * (stale note corrected here, Phase 11) — but `first-audit.spec.ts`'s
 * in-process composition is still the right shape for that file's own needs
 * (a throwaway port, an isolated test database, no separate process to
 * manage), so it is unchanged. T227/T229 (`accessibility.spec.ts`,
 * `no-external-requests.spec.ts`) are the first specs in this directory that
 * genuinely need a `webServer`-shaped `apps/web` (a real browser rendering a
 * real page) rather than a raw HTTP client against a real API — they reuse
 * `apps/web/tests/visual/harness.ts`'s `startServer` (a real `next start`
 * child process, T246) directly in their own `test.beforeAll` instead of
 * adding a config-level `webServer` entry here, since a `webServer` entry
 * would also spin up a full `next build`/`next start` for `first-audit.spec.ts`,
 * which never touches a browser page and does not need one.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  // T227/T229: `fullyParallel: false` only serialises tests *within* a file —
  // Playwright still ran `accessibility.spec.ts` and `no-external-requests.spec.ts`
  // in two workers by default, and both files' own `test.beforeAll` shells out
  // to `npx next build` against the same `apps/web` (the same `.next` output
  // directory), which raced and broke one of the two builds the first time
  // this was tried together. `workers: 1` makes every file in this directory
  // run one after another, matching what `fullyParallel: false` already
  // implied for tests within a file.
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'retain-on-failure',
  },
});
