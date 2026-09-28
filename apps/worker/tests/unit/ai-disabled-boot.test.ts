import { describe, expect, it } from 'vitest';
import { createExecutorFromEnv, createMasterReportExecutorFromEnv } from '@webaudit/ai-executor';
import { moduleTimeoutForExecutor } from '../../src/index.js';

/**
 * P1-T3 — the exact construction sequence `startWorker()` runs at
 * `src/index.ts:255-257` when no `handlers`/`executor` override is supplied,
 * reproduced directly against `NODE_ENV=production`, `AI_MODE=disabled`, and
 * zero AI provider credentials of any kind. This is the boot-time
 * ingredient-level proof; the full `startWorker()` call (real Redis/DB) is
 * covered separately in `apps/worker/tests/integration/ai-disabled-worker-boot.test.ts`.
 */
describe('worker boot ingredients under AI_MODE=disabled + NODE_ENV=production', () => {
  it('constructs the executor, master-report executor, and module timeout without throwing, ' +
    'with no ANTHROPIC_API_KEY / OPENAI_API_KEY / GOOGLE_API_KEY set', () => {
    const env = {
      NODE_ENV: 'production',
      AI_MODE: 'disabled',
      // Deliberately absent: ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY,
      // AI_CHAIN. This is the exact configuration discovery identified as the
      // one that made the worker refuse to boot before this fix.
    };

    let executor: ReturnType<typeof createExecutorFromEnv> | undefined;
    expect(() => {
      executor = createExecutorFromEnv(env);
    }).not.toThrow();

    expect(() => {
      createMasterReportExecutorFromEnv(env, executor!);
    }).not.toThrow();

    expect(() => moduleTimeoutForExecutor(executor!)).not.toThrow();
    expect(executor!.chain).toEqual([]);
  });

  it('the same configuration without AI_MODE=disabled still throws (proves this is a real fix, not a no-op)', () => {
    // `isFixtureMode()` reads real `process.env['AI_MODE']`, which this
    // workspace's own local dev `.env` sets to "fixtures" — clear it so this
    // assertion exercises the real pre-fix default path, not the fixtures
    // branch (see the same note in packages/ai-executor/tests/disabled-mode.test.ts).
    const previous = process.env['AI_MODE'];
    delete process.env['AI_MODE'];
    try {
      const env = {
        NODE_ENV: 'production',
        // AI_MODE unset — the pre-fix default path.
      };
      expect(() => createExecutorFromEnv(env)).toThrow(/ANTHROPIC_API_KEY/);
    } finally {
      if (previous !== undefined) process.env['AI_MODE'] = previous;
    }
  });
});
