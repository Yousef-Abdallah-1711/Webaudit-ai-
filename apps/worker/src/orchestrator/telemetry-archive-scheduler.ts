/**
 * T032 — schedules the detach-and-archive sweep for `AiInvocation`/
 * `CapabilityExecution` partitions, plus the future-partition maintenance
 * that keeps native partitioning able to accept inserts at all. Mirrors
 * `payment-expiry-scheduler.ts`'s shape exactly (T003's established DoD-C
 * pattern for a repeatable maintenance job).
 *
 * **Defaults to dry-run.** `TELEMETRY_ARCHIVE_DRY_RUN` must be explicitly set
 * to `false` for a real detach+drop to run in production — the DoD requires
 * dry-run to be exercised in staging first, and a scheduler that silently
 * defaulted to real deletion would make that impossible to guarantee.
 *
 * **The real retention-window number is not yet decided** (research.md Part
 * D item 5) — `TELEMETRY_ARCHIVE_RETENTION_MONTHS` is a named, easily-changed
 * placeholder (12 months) exactly like T026's cost-alert thresholds shipped
 * with placeholder numbers pending T027's real decision.
 */
import type { Queue } from 'bullmq';
import type { PrismaClient } from '@webaudit/api/prisma-client';
import {
  createTelemetryArchiveStorage,
  ensureFuturePartitions,
  runTelemetryArchive,
  type TelemetryArchiveStorage,
} from '@webaudit/api/telemetry-archive';
import { JOB_NAMES } from '../queue/workers.js';

const DEFAULT_INTERVAL_MS = 24 * 60 * 60_000; // once a day -- this is a bulk, low-frequency sweep
const DEFAULT_RETENTION_MONTHS = 12;
const FUTURE_PARTITION_MONTHS_AHEAD = 3;

function configuredMs(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isDryRun(): boolean {
  // Defaults to true (the safe direction) -- only the literal string "false"
  // turns real detach+drop on.
  return process.env['TELEMETRY_ARCHIVE_DRY_RUN'] !== 'false';
}

export async function scheduleTelemetryArchive(queue: Queue): Promise<void> {
  await queue.upsertJobScheduler(
    'telemetry-archive',
    { every: configuredMs('TELEMETRY_ARCHIVE_INTERVAL_MS', DEFAULT_INTERVAL_MS) },
    {
      name: JOB_NAMES.telemetryArchive,
      data: { kind: 'telemetry-archive' as const },
      opts: { removeOnComplete: true, removeOnFail: 50 },
    },
  );
}

/** Never legitimately called -- dry-run mode makes zero storage calls (see `runTelemetryArchive`). */
const UNUSED_IN_DRY_RUN: TelemetryArchiveStorage = {
  putObject(): Promise<void> {
    throw new Error('telemetry-archive: storage.putObject called during a dry run. This is a bug.');
  },
  getObject(): Promise<Uint8Array> {
    throw new Error('telemetry-archive: storage.getObject called during a dry run. This is a bug.');
  },
};

export function createTelemetryArchiveHandler(
  db: PrismaClient,
  storage: TelemetryArchiveStorage | null = null,
): () => Promise<void> {
  return async () => {
    await ensureFuturePartitions(db, FUTURE_PARTITION_MONTHS_AHEAD);

    const dryRun = isDryRun();
    // Only construct a real R2 client for a real run -- dry run must work in
    // any environment (including one with no R2 credentials configured) since
    // it never touches storage at all; requiring credentials just to compute
    // a report would be a needless, misleading dependency.
    const resolvedStorage = storage ?? (dryRun ? UNUSED_IN_DRY_RUN : createTelemetryArchiveStorage());
    const results = await runTelemetryArchive(db, resolvedStorage, {
      retentionMonths: configuredMs('TELEMETRY_ARCHIVE_RETENTION_MONTHS', DEFAULT_RETENTION_MONTHS),
      dryRun,
    });
    if (results.length > 0) {
      // eslint-disable-next-line no-console -- operational visibility for a low-frequency sweep, same as other sweep handlers in this file's package
      console.log(
        `[telemetry-archive] ${dryRun ? 'dry run' : 'archived'}: ${String(results.length)} partition(s)`,
        results.map((r) => ({ table: r.table, partition: r.partitionName, rows: r.rowCount })),
      );
    }
  };
}
