import { defineWorkspace } from 'vitest/config';

/**
 * Three projects, three purposes.
 *
 * `unit`    — unit, contract, and integration suites.
 * `adverse` — the eight hostile suites that make the adversarial success
 *             criteria executable (research.md R15). These are the project's
 *             quality gates, not extras.
 * `visual`  — design-fidelity comparison against design-system/reference-pages/
 *             at 1440 and 390 (constitution v1.1.0, Design Adherence).
 *
 * Provider calls are stubbed everywhere: a suite that needs live LLM spend is a
 * broken suite (Principle IV).
 */
export default defineWorkspace([
  {
    /**
     * T237 — the first JSX in this monorepo. `apps/web/components/ui/*.tsx`
     * relies on the automatic JSX runtime (no explicit `React` import per
     * file, matching Next.js's own default); esbuild's transform otherwise
     * falls back to the classic transform and every component throws
     * `ReferenceError: React is not defined` the moment vitest renders one.
     * `tsconfig.json`'s `"jsx": "preserve"` is correct for Next.js's own
     * bundler and irrelevant here — Vite's esbuild transform reads this
     * option instead.
     */
    esbuild: { jsx: 'automatic' },
    test: {
      name: 'unit',
      include: [
        '{apps,packages}/*/tests/{unit,contract,integration}/**/*.test.ts',
        // Suites that sit directly under `tests/` rather than in a subdirectory.
        // tasks.md places the ai-executor chain and schema suites there; without
        // this they match no project and silently never run.
        '{apps,packages}/*/tests/*.test.ts',
      ],
      environment: 'node',
      env: {
        AI_MODE: 'fixtures',
        // config/env.ts fails closed: it refuses to start without real secrets
        // rather than silently signing with a committed constant (finding C3).
        // Suites therefore have to supply them. Deliberately real 48-byte values
        // rather than ALLOW_INSECURE_DEV_SECRETS=true, so the tests exercise the
        // same code path production does.
        JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-anywhere-else-0123456789',
        JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-anywhere-else-0123456789',
        ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMteHg=',
      },
    },
  },
  {
    test: {
      name: 'adverse',
      include: ['{apps,packages}/*/tests/adverse/**/*.test.ts'],
      environment: 'node',
      env: {
        AI_MODE: 'fixtures',
        // config/env.ts fails closed: it refuses to start without real secrets
        // rather than silently signing with a committed constant (finding C3).
        // Suites therefore have to supply them. Deliberately real 48-byte values
        // rather than ALLOW_INSECURE_DEV_SECRETS=true, so the tests exercise the
        // same code path production does.
        JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-anywhere-else-0123456789',
        JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-anywhere-else-0123456789',
        ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMteHg=',
      },
      // Hostile suites spawn processes, bind sockets, and hit timeouts on purpose.
      // Serial execution is set on the CLI (--no-file-parallelism): these suites
      // bind ports for SSRF-rebinding and sandbox-escape and cannot overlap.
      testTimeout: 60_000,
      hookTimeout: 60_000,
    },
  },
  {
    test: {
      name: 'visual',
      include: ['apps/web/tests/visual/**/*.test.ts'],
      environment: 'node',
      env: {
        AI_MODE: 'fixtures',
        // config/env.ts fails closed: it refuses to start without real secrets
        // rather than silently signing with a committed constant (finding C3).
        // Suites therefore have to supply them. Deliberately real 48-byte values
        // rather than ALLOW_INSECURE_DEV_SECRETS=true, so the tests exercise the
        // same code path production does.
        JWT_ACCESS_SECRET: 'test-only-access-secret-not-used-anywhere-else-0123456789',
        JWT_REFRESH_SECRET: 'test-only-refresh-secret-not-used-anywhere-else-0123456789',
        ENCRYPTION_KEY: 'dGVzdC1vbmx5LWVuY3J5cHRpb24ta2V5LTMyYnl0ZXMteHg=',
      },
      testTimeout: 120_000,
    },
  },
]);
