/**
 * SPEC 008 T015 (DEC-063, DEC-048/049) — the repeatable maintenance job that
 * (1) reclaims expired admission leases and corrects the counter cache and
 * (2) reconciles stranded kill-switch rows. Registered with the same
 * `upsertJobScheduler` pattern as `timeout-scheduler.ts`, so exactly one worker
 * runs it per interval; the database functions are additionally safe under
 * concurrent instances (skip-locked, never-wait), so a duplicate run is harmless.
 *
 * Reclaim latency is bounded by lease expiry (30 s) plus one interval
 * (default 60 s): about 90 s worst case (research R3).
 */

import type { Queue } from 'bullmq';
import { reclaimExpiredLeases, reconcileStrandedStops } from '@webaudit/api/safety';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { JOB_NAMES } from '../queue/workers.js';

export const SAFETY_SWEEP_JOB_NAME = JOB_NAMES.safetySweep;

const DEFAULT_INTERVAL_MS = 60_000;

function intervalMs(): number {
  const raw = Number(process.env['SAFETY_SWEEP_INTERVAL_MS']);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_INTERVAL_MS;
}

function ackGraceSeconds(): number {
  const raw = Number(process.env['SAFETY_STOP_ACK_GRACE_SECONDS']);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 30;
}

export async function scheduleSafetySweep(maintenanceQueue: Queue): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    'safety-sweep',
    { every: intervalMs() },
    {
      name: SAFETY_SWEEP_JOB_NAME,
      data: { kind: 'safety-sweep' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export interface SafetySweepOutcome {
  reclaimed: number;
  driftCorrected: number;
  acknowledged: number;
  stopped: number;
}

export async function runSafetySweep(db: PrismaClient): Promise<SafetySweepOutcome> {
  const reclaim = await reclaimExpiredLeases(db);
  const reconcile = await reconcileStrandedStops(db, { ackGraceSeconds: ackGraceSeconds() });
  const outcome: SafetySweepOutcome = {
    reclaimed: reclaim.reclaimed,
    driftCorrected: reclaim.driftCorrected,
    acknowledged: reconcile.acknowledged,
    stopped: reconcile.stopped,
  };
  if (outcome.reclaimed + outcome.driftCorrected + outcome.acknowledged + outcome.stopped > 0) {
    console.warn(
      `[safety-sweep] reclaimed ${String(outcome.reclaimed)} lease(s), corrected ${String(outcome.driftCorrected)} counter(s), ` +
        `acknowledged ${String(outcome.acknowledged)} and stopped ${String(outcome.stopped)} stranded stop(s).`,
    );
  }
  return outcome;
}

export function createSafetySweepHandler(deps: { db: PrismaClient }): () => Promise<void> {
  return async function handleSafetySweep(): Promise<void> {
    await runSafetySweep(deps.db);
  };
}
