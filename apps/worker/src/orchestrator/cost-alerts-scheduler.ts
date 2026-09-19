/**
 * T028 — schedules the repeatable cost-alert computation sweep (FR-C01-C04).
 * Mirrors `payment-expiry-scheduler.ts`'s shape exactly (T003's established
 * DoD-C pattern for a repeatable maintenance job).
 *
 * Found and closed as a real gap, not a pre-existing task: `evaluateCostAlerts`
 * (`apps/api/src/services/monitoring/cost-alerts.ts`) and its admin endpoints
 * existed and were unit-tested, but nothing anywhere ever called it on a
 * schedule — the exact same class of gap T023 found for Sentry's `captureMessage`
 * (SDK/logic wired, nothing invoking it). Without this, `CostAlertThreshold`
 * rows and `captureAlert('cost_runaway', ...)` would never fire in a real
 * deployment regardless of how much AI spend a user or the platform racked up.
 */
import type { Queue } from 'bullmq';
import { evaluateCostAlerts } from '@webaudit/api/cost-alerts';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { JOB_NAMES } from '../queue/workers.js';

const DEFAULT_INTERVAL_MS = 5 * 60_000;

function configuredMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function scheduleCostAlertsSweep(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'cost-alerts-sweep',
    { every: configuredMs('COST_ALERTS_SWEEP_INTERVAL_MS', DEFAULT_INTERVAL_MS) },
    {
      name: JOB_NAMES.costAlertsSweep,
      data: { kind: 'cost-alerts-sweep' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export function createCostAlertsSweepHandler(db: PrismaClient): () => Promise<void> {
  return async () => {
    await evaluateCostAlerts(db);
  };
}
