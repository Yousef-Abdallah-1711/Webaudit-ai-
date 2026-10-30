/**
 * N02 — the production worker boot registers no execution engine.
 *
 * `startWorker()` with no `executionAdapters` is exactly what the process entrypoint does. Against real Redis and the
 * real test database, no SPEC 009 execution queue or worker may exist: the platform ships no engine (SPEC 010-012),
 * and the deterministic test adapter must only ever arrive through an explicit, test-only injection.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { testDb as db, closeDb } from '@webaudit/api/test-db';
import { startWorker, type WorkerService } from '../../src/index.js';

describe('production worker boot registers zero execution engines (N02)', () => {
  let service: WorkerService | undefined;
  let workspaceDir: string | undefined;
  let previousAiMode: string | undefined;
  let previousWorkspaceDir: string | undefined;

  afterEach(async () => {
    await service?.shutdown('test-cleanup');
    service = undefined;
    if (previousAiMode === undefined) delete process.env['AI_MODE'];
    else process.env['AI_MODE'] = previousAiMode;
    if (previousWorkspaceDir === undefined) delete process.env['WORKSPACE_BASE_DIR'];
    else process.env['WORKSPACE_BASE_DIR'] = previousWorkspaceDir;
    if (workspaceDir !== undefined) rmSync(workspaceDir, { recursive: true, force: true });
  });

  afterAll(closeDb);

  it('starts the legacy consumers but no execution queue or execution worker', async () => {
    previousAiMode = process.env['AI_MODE'];
    previousWorkspaceDir = process.env['WORKSPACE_BASE_DIR'];
    workspaceDir = mkdtempSync(path.join(tmpdir(), 'n02-boot-'));
    process.env['AI_MODE'] = 'fixtures';
    process.env['WORKSPACE_BASE_DIR'] = workspaceDir;

    service = startWorker({ db, installSignalHandlers: false });

    await expect
      .poll(() => service?.workers.scanPhase.isRunning() ?? false, { timeout: 5_000 })
      .toBe(true);
    expect(service.executionQueues).toBeUndefined();
    expect(service.executionWorkers).toBeUndefined();
  }, 15_000);
});
