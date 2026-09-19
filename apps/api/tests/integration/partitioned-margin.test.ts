/**
 * T031 — native PostgreSQL partitioning must remain invisible to the existing
 * margin report. This exercises the real Prisma report queries and catalog
 * against the shared test database; no ORM mock can prove partition pruning
 * remains transparent.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getMarginReport } from '../../src/services/admin/margin.service.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('T031 — partitioned operational telemetry', () => {
  it('keeps the existing margin report result unchanged across the partitioned tables', async () => {
    const user = await testDb.user.create({
      data: { email: 'partitioned-margin-owner@example.com', emailVerifiedAt: new Date() },
    });
    const target = await testDb.target.create({
      data: {
        userId: user.id,
        inputType: 'URL',
        canonicalValue: 'https://partitioned-margin.example.com',
        displayName: 'partitioned margin target',
      },
    });
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY'],
        capabilitySnapshot: {},
        quotedCredits: 80,
        chargedCredits: 80,
        state: 'COMPLETED',
      },
    });
    const capability = await testDb.capability.create({
      data: {
        id: 'partitioned-margin-checker',
        name: 'Partitioned Margin Checker',
        version: '1.0.0',
        module: 'SECURITY',
        layer: 'CODE',
        trust: 'VENDORED',
      },
    });
    const execution = await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: capability.id,
        module: 'SECURITY',
        succeeded: true,
        durationMs: 42,
        costMicros: 321_000,
      },
    });
    await testDb.aiInvocation.create({
      data: {
        executionId: execution.id,
        scanId: scan.id,
        provider: 'fixture-provider',
        model: 'fixture-model',
        chainPosition: 0,
        promptTokens: 10,
        outputTokens: 20,
        latencyMs: 30,
        costMicros: 321_000,
        outcome: 'SUCCESS',
      },
    });

    const report = await getMarginReport(testDb, {
      from: new Date('2020-01-01T00:00:00.000Z'),
      to: new Date('2099-01-01T00:00:00.000Z'),
    });

    expect(report).toMatchObject({
      window: { from: '2020-01-01T00:00:00.000Z', to: '2099-01-01T00:00:00.000Z' },
      perScan: [{ scanId: scan.id, chargedCredits: 80, costMicros: 321_000 }],
      perArea: [{ module: 'SECURITY', chargedCredits: 80, costMicros: 321_000 }],
      perCapability: [
        {
          capabilityId: capability.id,
          capabilityName: 'Partitioned Margin Checker',
          module: 'SECURITY',
          costMicros: 321_000,
          executionCount: 1,
          succeededCount: 1,
          failedCount: 0,
        },
      ],
    });
    expect(Object.keys(report).sort()).toEqual([
      'note',
      'perArea',
      'perCapability',
      'perScan',
      'window',
    ]);

    const relations = await testDb.$queryRaw<
      { relname: string; relkind: string }[]
    >`SELECT c.relname, c.relkind
        FROM pg_class c
        WHERE c.relname IN ('AiInvocation', 'CapabilityExecution')
        ORDER BY c.relname`;
    expect(relations).toEqual([
      { relname: 'AiInvocation', relkind: 'p' },
      { relname: 'CapabilityExecution', relkind: 'p' },
    ]);
  });
});
