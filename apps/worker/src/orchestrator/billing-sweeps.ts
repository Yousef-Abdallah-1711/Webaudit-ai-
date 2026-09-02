/**
 * T188 + T189 scheduling — the billing maintenance sweep.
 *
 * One repeatable job on the maintenance queue (`CONCURRENCY.maintenance = 1`,
 * so exactly one replica runs it) that does, in order:
 *
 *   1. **Renew** every subscription whose period has ended — expire the closing
 *      period's plan credits, grant the new period's, advance the boundary
 *      (`renewDueSubscriptions` → `renewSubscription`, FR-078).
 *   2. **Warn** every subscription whose period ends within the lead window and
 *      has not been warned this period (`sendRenewalWarnings`, FR-078).
 *   3. **Retain** — warn about, then remove, reports past their plan's retention
 *      period (`enforceRetention`, FR-092).
 *
 * The pure work lives in `apps/api`'s billing and storage services, reached
 * through the `@webaudit/api/billing` / `@webaudit/api/storage-retention`
 * package subpaths — the same shape the reverify runner uses for
 * `@webaudit/api/issues`. Email goes through a console mailer here (no SMTP is
 * wired anywhere yet); R2 is left unconfigured (`storage: null`) so a retention
 * removal still clears the database rows.
 */

import type { Queue } from 'bullmq';
import { renewDueSubscriptions, sendRenewalWarnings } from '@webaudit/api/billing';
import { enforceRetention } from '@webaudit/api/storage-retention';
import { createConsoleMailer } from '@webaudit/api/email';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import { JOB_NAMES } from '../queue/workers.js';

export const BILLING_SWEEP_JOB_NAME = JOB_NAMES.billingSweep;

const DEFAULT_INTERVAL_MS = 6 * 60 * 60_000; // every 6 hours

function intervalMs(): number {
  const raw = Number(process.env['BILLING_SWEEP_INTERVAL_MS']);
  return Number.isFinite(raw) && raw >= 60_000 ? raw : DEFAULT_INTERVAL_MS;
}

export async function scheduleBillingSweeps(maintenanceQueue: Queue): Promise<void> {
  await maintenanceQueue.upsertJobScheduler(
    'billing-sweep',
    { every: intervalMs() },
    {
      name: BILLING_SWEEP_JOB_NAME,
      data: { kind: 'billing-sweep' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

export interface BillingSweepDeps {
  readonly db: PrismaClient;
  readonly webUrl?: string;
}

export function createBillingSweepHandler(deps: BillingSweepDeps): () => Promise<void> {
  const mailer = createConsoleMailer();
  const webUrl = deps.webUrl ?? process.env['WEB_URL'] ?? '';

  return async function runBillingSweep(): Promise<void> {
    const renew = await renewDueSubscriptions(deps.db);
    const warned = await sendRenewalWarnings(deps.db, mailer);
    const retention = await enforceRetention(deps.db, { mailer, storage: null, webUrl });

    if (renew.renewed + renew.lapsed + warned.warned + retention.warned + retention.removed > 0) {
      console.warn(
        `[billing-sweep] renewed ${String(renew.renewed)}, lapsed ${String(renew.lapsed)}, ` +
          `renewal-warned ${String(warned.warned)}, retention-warned ${String(retention.warned)}, ` +
          `reports removed ${String(retention.removed)}.`,
      );
    }
  };
}
