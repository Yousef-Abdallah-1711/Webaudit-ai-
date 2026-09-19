/**
 * T032 — real-Postgres proof that the detach-and-archive job does exactly
 * what it claims: a dry run touches nothing, a real run exports the old
 * partition's data before dropping it, and neither mode ever comes near a
 * financial/audit table.
 *
 * T031's own migration only pre-creates partitions covering the data that
 * existed at migration time, so this test manually creates one deliberately
 * old partition (2024-01) the same way the migration itself does, to give
 * the archive job something legitimately old to find — this is the real
 * Postgres catalog, not a stand-in.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { Prisma } from '../../prisma/generated/client/index.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';
import {
  ensureFuturePartitions,
  listPartitions,
  runTelemetryArchive,
  type TelemetryArchiveStorage,
} from '../../src/services/storage/telemetry-archive.js';

function createMemoryStorage(): TelemetryArchiveStorage & { readonly objects: Map<string, Uint8Array> } {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async putObject(key, body) {
      objects.set(key, body);
    },
    async getObject(key) {
      const value = objects.get(key);
      if (value === undefined) throw new Error(`no object at ${key}`);
      return value;
    },
  };
}

async function createOldPartition(monthStart: string, monthEnd: string, name: string): Promise<void> {
  // Partition tables are DDL -- resetDb() truncates data, it does not drop
  // dynamically-created partitions -- so make this idempotent across tests
  // that reuse the same old-month name, rather than colliding on rerun.
  await testDb.$executeRaw(Prisma.raw(`DROP TABLE IF EXISTS "${name}"`));
  await testDb.$executeRaw(
    Prisma.raw(
      `CREATE TABLE "${name}" PARTITION OF "AiInvocation" FOR VALUES FROM ('${monthStart}') TO ('${monthEnd}')`,
    ),
  );
}

describe('T032 — telemetry partition archive', () => {
  beforeEach(resetDb);
  afterAll(closeDb);

  it('dry run reports the old partition and its real row count without touching anything', async () => {
    await createOldPartition('2024-01-01', '2024-02-01', 'AiInvocation_2024_01');
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 10,
        outcome: 'SUCCESS',
        createdAt: new Date('2024-01-15T00:00:00.000Z'),
      },
    });

    const storage = createMemoryStorage();
    const results = await runTelemetryArchive(testDb, storage, {
      retentionMonths: 6,
      dryRun: true,
      now: new Date('2026-09-15T00:00:00.000Z'),
    });

    const row = results.find((r) => r.partitionName === 'AiInvocation_2024_01');
    expect(row).toMatchObject({ rowCount: 1, archived: false });
    expect(storage.objects.size).toBe(0);
    // Dry run must not have detached anything -- the partition still exists.
    const stillThere = await listPartitions(testDb, 'AiInvocation');
    expect(stillThere.some((p) => p.partitionName === 'AiInvocation_2024_01')).toBe(true);
  });

  it('a real run exports the partition to storage before detaching and dropping it', async () => {
    await createOldPartition('2024-01-01', '2024-02-01', 'AiInvocation_2024_01');
    await testDb.aiInvocation.create({
      data: {
        provider: 'anthropic',
        model: 'claude',
        chainPosition: 0,
        promptTokens: 5,
        outputTokens: 7,
        latencyMs: 200,
        costMicros: 4_200,
        outcome: 'SUCCESS',
        createdAt: new Date('2024-01-20T00:00:00.000Z'),
      },
    });

    const storage = createMemoryStorage();
    const results = await runTelemetryArchive(testDb, storage, {
      retentionMonths: 6,
      dryRun: false,
      now: new Date('2026-09-15T00:00:00.000Z'),
    });

    const row = results.find((r) => r.partitionName === 'AiInvocation_2024_01');
    expect(row).toMatchObject({ rowCount: 1, archived: true, archiveKey: 'archive/AiInvocation/AiInvocation_2024_01.json' });

    // The export actually contains the real row, not an empty/placeholder body.
    const exported = JSON.parse(new TextDecoder().decode(storage.objects.get(row!.archiveKey!)!)) as {
      rows: { costMicros: number; provider: string }[];
    };
    expect(exported.rows).toHaveLength(1);
    expect(exported.rows[0]).toMatchObject({ provider: 'anthropic', costMicros: 4_200 });

    // The partition is genuinely gone from the catalog -- not just marked.
    const remaining = await listPartitions(testDb, 'AiInvocation');
    expect(remaining.some((p) => p.partitionName === 'AiInvocation_2024_01')).toBe(false);
    await expect(
      testDb.$queryRaw`SELECT to_regclass('"AiInvocation_2024_01"') IS NOT NULL AS exists`,
    ).resolves.toMatchObject([{ exists: false }]);
  });

  it('never touches a financial/audit table row, regardless of mode', async () => {
    await createOldPartition('2024-01-01', '2024-02-01', 'AiInvocation_2024_01');
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 10,
        outcome: 'SUCCESS',
        createdAt: new Date('2024-01-15T00:00:00.000Z'),
      },
    });
    const before = {
      creditTransaction: await testDb.creditTransaction.count(),
      creditAllocation: await testDb.creditAllocation.count(),
      billingEvent: await testDb.billingEvent.count(),
      receipt: await testDb.receipt.count(),
    };

    const storage = createMemoryStorage();
    await runTelemetryArchive(testDb, storage, {
      retentionMonths: 6,
      dryRun: false,
      now: new Date('2026-09-15T00:00:00.000Z'),
    });

    await expect(testDb.creditTransaction.count()).resolves.toBe(before.creditTransaction);
    await expect(testDb.creditAllocation.count()).resolves.toBe(before.creditAllocation);
    await expect(testDb.billingEvent.count()).resolves.toBe(before.billingEvent);
    await expect(testDb.receipt.count()).resolves.toBe(before.receipt);
  });

  it('does not archive a partition inside the retention window', async () => {
    await createOldPartition('2024-01-01', '2024-02-01', 'AiInvocation_2024_01');
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 10,
        outcome: 'SUCCESS',
        createdAt: new Date('2024-01-15T00:00:00.000Z'),
      },
    });

    const storage = createMemoryStorage();
    // "now" is only 2 months after the partition, but retention is 6 -- must not touch it.
    const results = await runTelemetryArchive(testDb, storage, {
      retentionMonths: 6,
      dryRun: false,
      now: new Date('2024-03-15T00:00:00.000Z'),
    });

    expect(results.find((r) => r.partitionName === 'AiInvocation_2024_01')).toBeUndefined();
    const stillThere = await listPartitions(testDb, 'AiInvocation');
    expect(stillThere.some((p) => p.partitionName === 'AiInvocation_2024_01')).toBe(true);
  });

  it('ensureFuturePartitions creates the next N months once, and is a no-op the second time', async () => {
    // This dev/test database already has real partitions pre-created well
    // into the future (a prior migration's own generate_series picked up
    // fixture data with far-future createdAt values) -- so this test uses a
    // month range deliberately far beyond anything that could already exist
    // *from that*, to actually exercise "creates when missing" rather than
    // assume a specific near-term month is still empty.
    //
    // Partition tables are DDL, so resetDb() (which only truncates data)
    // does not undo a previous run of this exact test creating these same
    // 2099 partitions -- drop them first so this test is idempotent across
    // repeated full-suite runs, the same discipline createOldPartition()
    // above already applies for its own partition name.
    const now = new Date('2099-01-15T00:00:00.000Z');
    for (const name of [
      'AiInvocation_2099_01',
      'AiInvocation_2099_02',
      'AiInvocation_2099_03',
      'CapabilityExecution_2099_01',
      'CapabilityExecution_2099_02',
      'CapabilityExecution_2099_03',
    ]) {
      await testDb.$executeRaw(Prisma.raw(`DROP TABLE IF EXISTS "${name}"`));
    }
    const created = await ensureFuturePartitions(testDb, 2, now);
    expect([...created].sort()).toEqual(
      [
        'AiInvocation_2099_01',
        'AiInvocation_2099_02',
        'AiInvocation_2099_03',
        'CapabilityExecution_2099_01',
        'CapabilityExecution_2099_02',
        'CapabilityExecution_2099_03',
      ].sort(),
    );

    const again = await ensureFuturePartitions(testDb, 2, now);
    expect(again).toEqual([]);

    // Proves the partitions are real and usable, not just present in the catalog.
    await expect(
      testDb.aiInvocation.create({
        data: {
          provider: 'test',
          model: 'fixture',
          chainPosition: 0,
          promptTokens: 1,
          outputTokens: 1,
          latencyMs: 1,
          costMicros: 10,
          outcome: 'SUCCESS',
          createdAt: new Date('2099-02-10T00:00:00.000Z'),
        },
      }),
    ).resolves.toMatchObject({ provider: 'test' });
  });
});
