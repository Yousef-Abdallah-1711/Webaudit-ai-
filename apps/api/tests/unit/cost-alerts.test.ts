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

  it('does not treat one large legitimate scan as sustained global spend, but does alert once the same window accumulates a sustained pattern of that size', async () => {
    // The threshold is sized for *sustained* spend: 3x a single full-audit-sized
    // invocation. One real scan's total cost — even a large one — must not
    // alone cross it; the window existing at all is what should let repeated,
    // legitimate-looking usage eventually trip it.
    const FULL_AUDIT_COST_MICROS = 8_000_000; // 80 credits x 100,000 micros/credit
    await testDb.costAlertThreshold.update({
      where: { scope: 'GLOBAL' },
      data: { windowMinutes: 60, thresholdMicros: FULL_AUDIT_COST_MICROS * 3 },
    });
    const now = new Date('2026-09-13T12:00:00.000Z');

    // One legitimate, unusually large scan lands well inside the window.
    await testDb.aiInvocation.create({
      data: {
        provider: 'test',
        model: 'fixture',
        chainPosition: 0,
        promptTokens: 10_000,
        outputTokens: 2_000,
        latencyMs: 1_000,
        costMicros: FULL_AUDIT_COST_MICROS,
        outcome: 'SUCCESS',
        createdAt: new Date('2026-09-13T11:45:00.000Z'),
      },
    });
    await expect(evaluateCostAlerts(testDb, now)).resolves.toMatchObject({ fired: 0 });
    await expect(testDb.costAlertEvent.count()).resolves.toBe(0);

    // Two more scans of the same realistic size, still inside the same
    // 60-minute window, is the sustained pattern the threshold exists to
    // catch — the third invocation is what actually crosses 3x.
    await testDb.aiInvocation.createMany({
      data: [
        {
          provider: 'test',
          model: 'fixture',
          chainPosition: 0,
          promptTokens: 10_000,
          outputTokens: 2_000,
          latencyMs: 1_000,
          costMicros: FULL_AUDIT_COST_MICROS,
          outcome: 'SUCCESS',
          createdAt: new Date('2026-09-13T11:50:00.000Z'),
        },
        {
          provider: 'test',
          model: 'fixture',
          chainPosition: 0,
          promptTokens: 10_000,
          outputTokens: 2_000,
          latencyMs: 1_000,
          costMicros: FULL_AUDIT_COST_MICROS,
          outcome: 'SUCCESS',
          createdAt: new Date('2026-09-13T11:55:00.000Z'),
        },
      ],
    });
    await expect(evaluateCostAlerts(testDb, now)).resolves.toMatchObject({ fired: 1 });
    await expect(testDb.costAlertEvent.count()).resolves.toBe(1);
  });
});
