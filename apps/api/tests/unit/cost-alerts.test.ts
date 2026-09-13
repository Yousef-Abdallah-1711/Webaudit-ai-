import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { evaluateCostAlerts } from '../../src/services/monitoring/cost-alerts.js';
import { closeDb, resetDb, testDb } from '../helpers/db.js';

describe('cost-alert evaluation', () => {
  beforeEach(async () => {
    await resetDb();
    await testDb.costAlertThreshold.upsert({
      where: { scope: 'GLOBAL' },
      create: { scope: 'GLOBAL', windowMinutes: 60, thresholdMicros: 100 },
      update: { windowMinutes: 60, thresholdMicros: 100, isEnabled: true },
    });
  });
  afterAll(closeDb);

  it('records one global breach and does not repeat it for the same window', async () => {
    const now = new Date('2026-09-13T12:00:00.000Z');
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 150,
        outcome: 'SUCCESS',
        createdAt: new Date('2026-09-13T11:30:00.000Z'),
      },
    });
    await expect(evaluateCostAlerts(testDb, now)).resolves.toMatchObject({ fired: 1 });
    await expect(evaluateCostAlerts(testDb, now)).resolves.toMatchObject({ fired: 0 });
    await expect(testDb.costAlertEvent.count({ where: { scope: 'GLOBAL' } })).resolves.toBe(1);
  });

  it('does not alert when spend is below the configured threshold', async () => {
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 1,
        outputTokens: 1,
        latencyMs: 1,
        costMicros: 99,
        outcome: 'SUCCESS',
      },
    });
    await expect(evaluateCostAlerts(testDb, new Date())).resolves.toMatchObject({ fired: 0 });
    await expect(testDb.costAlertEvent.count()).resolves.toBe(0);
  });
});
