/**
 * T032 — detach-and-archive for the operational-telemetry partitions T031
 * created (`AiInvocation`/`CapabilityExecution`, monthly, named
 * `<table>_YYYY_MM`). Per data-model.md §5.3, this is deliberately NOT a
 * copy-then-delete row scanner: a whole month's partition is exported to R2
 * as one object, then detached and dropped as a single operation, so there
 * is no window where a row exists in neither place.
 *
 * **Reuses the existing R2 integration** (`R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/
 * `R2_SECRET_ACCESS_KEY`/`R2_BUCKET`, same as `services/storage/reports.ts`)
 * rather than a second client — only the object-key prefix differs
 * (`archive/<table>/<partition>.json` vs. `scans/<scanId>/...`).
 *
 * **Never touches a financial/audit table.** `CreditTransaction`,
 * `CreditAllocation`, `BillingEvent`, and `Receipt` are not partitioned by
 * this feature (data-model.md §5.1) and nothing here references them —
 * confirmed by this file containing no such table name.
 */

import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Prisma, type PrismaClient } from '../../../prisma/generated/client/index.js';

const ARCHIVABLE_TABLES = ['AiInvocation', 'CapabilityExecution'] as const;
export type ArchivableTable = (typeof ARCHIVABLE_TABLES)[number];

export interface TelemetryArchiveStorage {
  putObject(key: string, body: Uint8Array, contentType: string): Promise<void>;
  getObject(key: string): Promise<Uint8Array>;
}

export interface TelemetryArchiveStorageOptions {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

function optionsFromEnv(): TelemetryArchiveStorageOptions {
  const accountId = process.env['R2_ACCOUNT_ID'];
  const accessKeyId = process.env['R2_ACCESS_KEY_ID'];
  const secretAccessKey = process.env['R2_SECRET_ACCESS_KEY'];
  const bucket = process.env['R2_BUCKET'];
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      'R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET must all be set to ' +
        'archive a telemetry partition.',
    );
  }
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function createTelemetryArchiveStorage(
  options: TelemetryArchiveStorageOptions = optionsFromEnv(),
): TelemetryArchiveStorage {
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${options.accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
  });
  return {
    async putObject(key, body, contentType): Promise<void> {
      await client.send(
        new PutObjectCommand({ Bucket: options.bucket, Key: key, Body: body, ContentType: contentType }),
      );
    },
    async getObject(key): Promise<Uint8Array> {
      const result = await client.send(new GetObjectCommand({ Bucket: options.bucket, Key: key }));
      if (result.Body === undefined) throw new Error(`No archive object at ${key}.`);
      return result.Body.transformToByteArray();
    },
  };
}

function archiveKeyFor(table: ArchivableTable, partitionName: string): string {
  return `archive/${table}/${partitionName}.json`;
}

/** A real child partition of `table`, discovered from Postgres's own catalog — never assumed. */
export interface PartitionInfo {
  readonly table: ArchivableTable;
  readonly partitionName: string;
  readonly monthStart: Date;
  readonly monthEnd: Date;
}

const MONTH_PARTITION_BOUND =
  /FOR VALUES FROM \('([^']+)'(?:::[\w ]+)?\) TO \('([^']+)'(?:::[\w ]+)?\)/;

/**
 * Lists every real child partition of `table`, parsed from Postgres's own
 * `pg_get_expr` bound description — not a name computed in JS and assumed to
 * exist, so a partition this code did not expect (a manually created one, a
 * naming drift) is still discovered correctly.
 */
export async function listPartitions(
  db: PrismaClient,
  table: ArchivableTable,
): Promise<readonly PartitionInfo[]> {
  const rows = await db.$queryRaw<readonly { name: string; bound: string }[]>(Prisma.sql`
    SELECT c.relname AS name, pg_get_expr(c.relpartbound, c.oid) AS bound
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = ${Prisma.raw(`'"${table}"'::regclass`)}
    ORDER BY c.relname ASC
  `);
  const partitions: PartitionInfo[] = [];
  for (const row of rows) {
    const match = MONTH_PARTITION_BOUND.exec(row.bound);
    if (match === null) continue; // a default/catch-all partition, if any -- never archived here
    partitions.push({
      table,
      partitionName: row.name,
      monthStart: new Date(match[1]!),
      monthEnd: new Date(match[2]!),
    });
  }
  return partitions;
}

async function rowCountOf(db: PrismaClient, partitionName: string): Promise<number> {
  const rows = await db.$queryRaw<readonly { count: bigint }[]>(
    Prisma.sql`SELECT COUNT(*)::bigint AS count FROM ${Prisma.raw(`"${partitionName}"`)}`,
  );
  return Number(rows[0]?.count ?? 0n);
}

export interface PartitionArchivePlanItem {
  readonly table: ArchivableTable;
  readonly partitionName: string;
  readonly monthStart: string;
  readonly monthEnd: string;
  readonly rowCount: number;
}

export interface PartitionArchiveResult extends PartitionArchivePlanItem {
  readonly archived: boolean;
  readonly archiveKey?: string;
}

/**
 * The core job. `dryRun: true` (the default, and what production MUST run
 * first per T032's DoD) only reports what would be touched — it issues no
 * DDL and uploads nothing. `dryRun: false` actually exports each candidate
 * partition to R2, then detaches and drops it, one partition at a time (a
 * failure partway through leaves already-processed partitions correctly
 * archived and gone, and leaves the rest untouched for the next run — never
 * a half-exported, half-dropped single partition, since detach+drop only
 * runs after the export upload has already succeeded).
 */
export async function runTelemetryArchive(
  db: PrismaClient,
  storage: TelemetryArchiveStorage,
  options: { readonly retentionMonths: number; readonly dryRun: boolean; readonly now?: Date },
): Promise<readonly PartitionArchiveResult[]> {
  const now = options.now ?? new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - options.retentionMonths, 1);
  const results: PartitionArchiveResult[] = [];

  for (const table of ARCHIVABLE_TABLES) {
    const partitions = await listPartitions(db, table);
    const candidates = partitions.filter((p) => p.monthEnd <= cutoff);
    for (const partition of candidates) {
      const rowCount = await rowCountOf(db, partition.partitionName);
      const planItem: PartitionArchivePlanItem = {
        table,
        partitionName: partition.partitionName,
        monthStart: partition.monthStart.toISOString(),
        monthEnd: partition.monthEnd.toISOString(),
        rowCount,
      };

      if (options.dryRun) {
        results.push({ ...planItem, archived: false });
        continue;
      }

      const archiveKey = archiveKeyFor(table, partition.partitionName);
      const rows = await db.$queryRaw<readonly Record<string, unknown>[]>(
        Prisma.sql`SELECT * FROM ${Prisma.raw(`"${partition.partitionName}"`)}`,
      );
      const body = new TextEncoder().encode(
        JSON.stringify({ table, partitionName: partition.partitionName, rows }, jsonSafe),
      );
      await storage.putObject(archiveKey, body, 'application/json');

      // Only after the archive upload has succeeded: detach (an instant
      // catalog operation) then drop (now a plain, no-longer-partitioned
      // table). Never delete rows without the export existing first.
      await db.$executeRaw(
        Prisma.raw(`ALTER TABLE "${table}" DETACH PARTITION "${partition.partitionName}"`),
      );
      await db.$executeRaw(Prisma.raw(`DROP TABLE "${partition.partitionName}"`));

      results.push({ ...planItem, archived: true, archiveKey });
    }
  }
  return results;
}

function jsonSafe(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

/**
 * The other half of keeping native partitioning working at all: T031's
 * migration only pre-created partitions covering the data that existed at
 * migration time. With no future partitions, an insert for a month beyond
 * the last created one fails outright ("no partition of relation found for
 * row"). Run alongside the archive sweep so the two are never scheduled
 * separately and one is never forgotten.
 */
export async function ensureFuturePartitions(
  db: PrismaClient,
  monthsAhead: number,
  now: Date = new Date(),
): Promise<readonly string[]> {
  const created: string[] = [];
  for (let offset = 0; offset <= monthsAhead; offset += 1) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    const suffix = `${String(monthStart.getFullYear())}_${String(monthStart.getMonth() + 1).padStart(2, '0')}`;
    for (const table of ARCHIVABLE_TABLES) {
      const partitionName = `${table}_${suffix}`;
      const exists = await db.$queryRaw<readonly { exists: boolean }[]>(
        Prisma.sql`SELECT to_regclass(${`"${partitionName}"`}) IS NOT NULL AS exists`,
      );
      if (exists[0]?.exists === true) continue;
      await db.$executeRaw(
        Prisma.raw(
          `CREATE TABLE "${partitionName}" PARTITION OF "${table}" FOR VALUES FROM ` +
            `('${monthStart.toISOString()}') TO ('${monthEnd.toISOString()}')`,
        ),
      );
      created.push(partitionName);
    }
  }
  return created;
}
