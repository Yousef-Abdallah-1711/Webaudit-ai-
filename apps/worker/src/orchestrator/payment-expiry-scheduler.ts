import type { Queue } from 'bullmq';
import { sweepExpiredPendingPayments } from '@webaudit/api/billing';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { JOB_NAMES } from '../queue/workers.js';

const DEFAULT_INTERVAL_MS = 60_000;
const DEFAULT_ABANDONMENT_WINDOW_MS = 60 * 60_000;

function configuredMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export async function schedulePaymentExpirySweep(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'payment-expiry-sweep',
    { every: configuredMs('PAYMENT_EXPIRY_SWEEP_INTERVAL_MS', DEFAULT_INTERVAL_MS) },
    {
      name: JOB_NAMES.paymentExpirySweep,
      data: { kind: 'payment-expiry-sweep' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export function createPaymentExpirySweepHandler(db: PrismaClient): () => Promise<void> {
  return async () => {
    await sweepExpiredPendingPayments(db, {
      abandonmentWindowMs: configuredMs(
        'PAYMENT_ABANDONMENT_WINDOW_MS',
        DEFAULT_ABANDONMENT_WINDOW_MS,
      ),
    });
  };
}
