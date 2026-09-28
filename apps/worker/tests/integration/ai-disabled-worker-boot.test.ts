/**
 * P1-T3 — the full `startWorker()` boot, against real Redis and the real test
 * Postgres database, with no `handlers`/`executor` override — meaning the
 * real `createExecutorFromEnv()` call at `src/index.ts:255` genuinely runs,
 * exactly as a production boot would. `ai-disabled-boot.test.ts` (unit)
 * already proves the construction *ingredients* don't throw in isolation;
 * this proves the full service actually starts and begins consuming its
 * queues under `AI_MODE=disabled` + `NODE_ENV=production`, with zero AI
 * provider credentials of any kind.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { testDb as db, closeDb } from '@webaudit/api/test-db';
import { startWorker, type WorkerService } from '../../src/index.js';

describe('startWorker() boots for real under AI_MODE=disabled + NODE_ENV=production', () => {
  let service: WorkerService | undefined;
  let workspaceDir: string;
  let previousNodeEnv: string | undefined;
  let previousAiMode: string | undefined;
  let previousWorkspaceDir: string | undefined;

  afterEach(async () => {
    await service?.shutdown('test-cleanup');
    service = undefined;
    if (previousNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = previousNodeEnv;
    if (previousAiMode === undefined) delete process.env['AI_MODE'];
    else process.env['AI_MODE'] = previousAiMode;
    if (previousWorkspaceDir === undefined) delete process.env['WORKSPACE_BASE_DIR'];
    else process.env['WORKSPACE_BASE_DIR'] = previousWorkspaceDir;
    // Every AI provider key must be absent for this test to mean anything —
    // clear whatever the local shell/.env happens to carry.
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['AI_CHAIN'];
    rmSync(workspaceDir, { recursive: true, force: true });
  });

  afterAll(closeDb);

  it(
    'starts without throwing ProviderNotConfiguredError or ChainConfigurationError, ' +
      'and begins consuming the queue',
    async () => {
      previousNodeEnv = process.env['NODE_ENV'];
      previousAiMode = process.env['AI_MODE'];
      previousWorkspaceDir = process.env['WORKSPACE_BASE_DIR'];
      workspaceDir = mkdtempSync(path.join(tmpdir(), 'ai-disabled-boot-'));

      process.env['NODE_ENV'] = 'production';
      process.env['AI_MODE'] = 'disabled';
      process.env['WORKSPACE_BASE_DIR'] = workspaceDir;
      delete process.env['ANTHROPIC_API_KEY'];
      delete process.env['OPENAI_API_KEY'];
      delete process.env['GOOGLE_API_KEY'];
      delete process.env['AI_CHAIN'];

      // No `handlers`, no `executor` override: this exercises the exact
      // production construction path, including the real
      // `createExecutorFromEnv()` call this fix targets.
      expect(() => {
        service = startWorker({ db, installSignalHandlers: false });
      }).not.toThrow();

      expect(service).toBeDefined();
      // A real, connected BullMQ worker for the scan-phase queue is the
      // concrete evidence "begins consuming the queue" asks for — `isRunning()`
      // only reports true once the worker has established its Redis
      // connection and entered its processing loop.
      await expect
        .poll(() => service?.workers.scanPhase.isRunning() ?? false, { timeout: 5_000 })
        .toBe(true);
    },
    15_000,
  );

  it('the same configuration WITHOUT AI_MODE=disabled still refuses to boot (regression guard)', () => {
    previousNodeEnv = process.env['NODE_ENV'];
    previousAiMode = process.env['AI_MODE'];
    previousWorkspaceDir = process.env['WORKSPACE_BASE_DIR'];
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'ai-disabled-boot-regress-'));

    process.env['NODE_ENV'] = 'production';
    delete process.env['AI_MODE'];
    process.env['WORKSPACE_BASE_DIR'] = workspaceDir;
    delete process.env['ANTHROPIC_API_KEY'];
    delete process.env['OPENAI_API_KEY'];
    delete process.env['GOOGLE_API_KEY'];
    delete process.env['AI_CHAIN'];

    expect(() => {
      service = startWorker({ db, installSignalHandlers: false });
    }).toThrow(/ANTHROPIC_API_KEY/);
    service = undefined; // never constructed — nothing to shut down
  });
});
