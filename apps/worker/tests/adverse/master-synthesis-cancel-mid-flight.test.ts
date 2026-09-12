/**
 * P3 (full-workflow review, Section 6b) — `runMasterSynthesis`'s `db.scan.update`
 * writes `overallScore`/`summary` unconditionally once the AI call returns,
 * with no check for a cancellation discovered while that call was still in
 * flight. Unlike `runAndPersistModule`'s two checkpoints (P0-CANCEL-1), this
 * write carries no credit/billing consequence — it is a data-consistency nit,
 * not a financial one — but a cancelled scan gaining a computed score/summary
 * after the fact is still wrong: `CANCELLED` should stay exactly as the
 * cancel route left it.
 *
 * This test drives `runMasterSynthesis` directly (not the full phase
 * handler) since it is a small, pure-enough function to test in isolation:
 * a fake executor whose `run()` blocks on a controllable promise lets this
 * test cancel mid-flight deterministically, the same synchronization style
 * `cancel-mid-flight-no-charge.test.ts` uses for the module-level checkpoint.
 */

import { describe, expect, it } from 'vitest';
import type { AiExecutor, AiResult } from '@webaudit/ai-executor';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { runMasterSynthesis } from '../../src/orchestrator/master-report.js';

function fakeDb(onScanUpdate: (args: unknown) => void): PrismaClient {
  return {
    moduleResult: {
      findMany: () =>
        Promise.resolve([
          { module: 'SECURITY', state: 'COMPLETE', score: 80, summary: null, skippedReason: null },
        ]),
    },
    scan: {
      updateMany: (args: unknown) => {
        onScanUpdate(args);
        return Promise.resolve({ count: 1 });
      },
    },
  } as unknown as PrismaClient;
}

function fakeExecutor(gate: Promise<void>): AiExecutor {
  return {
    chain: [],
    run: async <T>(): Promise<AiResult<T>> => {
      await gate; // still "in flight" until the test releases it
      return {
        ok: true,
        value: { headline: 'stale summary — must never be persisted' } as T,
        invocations: [],
      };
    },
  };
}

describe('P3 — master synthesis discovers cancellation before its own scan write, not after', () => {
  it('does not write Scan.overallScore/summary once cancellation is discovered, even though the AI call already resolved', async () => {
    let scanUpdateCalls = 0;
    const db = fakeDb(() => {
      scanUpdateCalls += 1;
    });

    let releaseExecutor: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseExecutor = resolve;
    });
    const executor = fakeExecutor(gate);

    let cancelled = false;
    const isCancelled = (): boolean => cancelled;

    const resultPromise = runMasterSynthesis(db, executor, 'scan-1', isCancelled);

    // Cancellation is discovered while executor.run() is still pending —
    // exactly the window the module-level checkpoints already guard.
    cancelled = true;
    releaseExecutor();
    await resultPromise;

    expect(scanUpdateCalls).toBe(0);
  });

  it('still writes normally when never cancelled (no regression to the happy path)', async () => {
    let scanUpdateCalls = 0;
    const db = fakeDb(() => {
      scanUpdateCalls += 1;
    });
    const executor = fakeExecutor(Promise.resolve());

    const result = await runMasterSynthesis(db, executor, 'scan-1');

    expect(scanUpdateCalls).toBe(1);
    expect(result.summary).toBe('stale summary — must never be persisted');
  });

  it('guards the persistence write on RUNNING_MASTER state', async () => {
    let updateArgs: unknown;
    const db = fakeDb((args) => {
      updateArgs = args;
    });
    const executor = fakeExecutor(Promise.resolve());

    await runMasterSynthesis(db, executor, 'scan-1');

    expect(updateArgs).toMatchObject({
      where: { id: 'scan-1', state: 'RUNNING_MASTER' },
      data: { overallScore: 80, summary: 'stale summary — must never be persisted' },
    });
  });
});
