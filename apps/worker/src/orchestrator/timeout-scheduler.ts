/**
 * Engineering-review finding — `sweepTimedOutScans` (T101, FR-038) was built
 * and tested but **never scheduled**: its only caller was a test. A scan whose
 * phase job died (a crash between `debit` and enqueue, a worker OOM mid-run, a
 * Redis blip that lost the job) sat in a non-terminal state for ever, its
 * credits spent, and nothing recovered it.
 *
 * This wires the sweep as a BullMQ **repeatable** job on the maintenance queue
 * (`CONCURRENCY.maintenance = 1`, priority behind every audit — `queues.ts`),
 * so exactly one worker runs it on an interval regardless of replica count.
 */

import type { Queue } from 'bullmq';
import { refundForUndelivered } from '@webaudit/config';
import { refundPartial } from '@webaudit/api/credits';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { sweepTimedOutScans, type SweepOptions } from './timeout.js';
import { createScanEmitter, type EventPublisher } from './emit.js';
import { JOB_NAMES } from '../queue/workers.js';

export const TIMEOUT_SWEEP_JOB_NAME = JOB_NAMES.timeoutSweep;

const DEFAULT_INTERVAL_MS = 60_000;
/** FR-038's "maximum permitted duration". Matches `.env.example`'s SCAN_TIMEOUT_MS. */
const DEFAULT_MAX_DURATION_MS = 15 * 60_000;

function intervalMs(): number {
  const raw = Number(process.env['TIMEOUT_SWEEP_INTERVAL_MS']);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_INTERVAL_MS;
}

function maxScanDurationMs(): number {
  const raw = Number(process.env['SCAN_TIMEOUT_MS']);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_DURATION_MS;
}

/**
 * Register the repeatable job. `upsertJobScheduler` (BullMQ 6) is keyed by the
 * scheduler id, so a redeploy replaces the schedule rather than stacking a
 * second one.
 */
export async function scheduleTimeoutSweep(maintenanceQueue: Queue): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    'timeout-sweep',
    { every: intervalMs() },
    {
      name: TIMEOUT_SWEEP_JOB_NAME,
      data: { kind: 'timeout-sweep' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export interface TimeoutSweepHandlerDeps {
  readonly db: PrismaClient;
  readonly publisher: EventPublisher;
}

/**
 * The handler `workers.ts` dispatches for `TIMEOUT_SWEEP_JOB_NAME`. Builds the
 * `Refunder` and `emitterFor` the sweep needs from the same primitives
 * `terminal-refund.ts` and the orchestrator already use.
 */
export function createTimeoutSweepHandler(
  deps: TimeoutSweepHandlerDeps,
): () => Promise<void> {
  const refund: SweepOptions['refund'] = async ({ scanId, credits, reason }) => {
    const debitTx = await deps.db.creditTransaction.findFirst({
      where: { scanId, type: 'DEBIT' },
      select: { id: true },
    });
    // No debit row means nothing was charged (a scan that timed out before
    // create-scan's debit committed) — nothing to give back.
    if (!debitTx) return;
    await refundPartial(deps.db, { debitTransactionId: debitTx.id, credits, reason });
  };

  return async function runTimeoutSweep(): Promise<void> {
    const outcomes = await sweepTimedOutScans({
      db: deps.db as unknown as SweepOptions['db'],
      emitterFor: (scanId) => createScanEmitter(scanId, { publisher: deps.publisher }),
      refund,
      maxDurationMs: maxScanDurationMs(),
      batchSize: 50,
    });
    const timedOut = outcomes.filter((o) => o.timedOut);
    if (timedOut.length > 0) {
      console.warn(
        `[timeout-sweep] terminated ${String(timedOut.length)} stuck scan(s); ` +
          `refunded ${String(timedOut.reduce((n, o) => n + o.creditsRefunded, 0))} credits total.`,
      );
    }
  };
}

export { refundForUndelivered };
