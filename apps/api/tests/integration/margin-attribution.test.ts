/**
 * T203 — SC-009: "margin is attributable to the individual capability that
 * caused the cost." FR-085: operators see revenue, provider cost, and
 * resulting margin per audit, per area, and per capability.
 *
 * This is deliberately adversarial about the capability level: it seeds two
 * DIFFERENT capabilities in the SAME module, on the SAME scan, with
 * DIFFERENT `costMicros`. A version of the aggregation that blends cost at
 * the module level (e.g. summing all SECURITY spend and reporting it under
 * whichever capability happens to be first, or splitting it evenly across
 * the module's capabilities regardless of actual spend) would make this
 * test fail: it asserts each capability's own reported cost equals its own
 * executions' sum, not an even split and not the module total.
 *
 * No dollar figure is asserted anywhere here on purpose — `chargedCredits`
 * (credits, revenue) and `costMicros` (real USD micros, cost) are different
 * units with no published conversion rate in this codebase (PROGRESS.md
 * Open Decision #3). Inventing one to produce a single "margin" number would
 * be a fabrication; this test instead asserts both are reported side by
 * side, correctly attributed, and that no computed dollar-margin field is
 * invented in its place.
 */

import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getMarginReport } from '../../src/services/admin/margin.service.js';
import { closeDb, resetDb, seedPlans, testDb } from '../helpers/db.js';

async function seedUserAndTarget() {
  const user = await testDb.user.create({
    data: { email: 'margin-owner@example.com', emailVerifiedAt: new Date() },
  });
  const target = await testDb.target.create({
    data: {
      userId: user.id,
      inputType: 'URL',
      canonicalValue: 'https://margin.example.com',
      displayName: 'margin target',
    },
  });
  return { user, target };
}

async function seedScan(userId: string, targetId: string, chargedCredits: number) {
  return testDb.scan.create({
    data: {
      userId,
      targetId,
      requestedModules: ['SECURITY'],
      capabilitySnapshot: {},
      quotedCredits: chargedCredits,
      chargedCredits,
      state: 'COMPLETED',
    },
  });
}

async function seedCapability(id: string, name: string) {
  return testDb.capability.create({
    data: {
      id,
      name,
      version: '1.0.0',
      module: 'SECURITY',
      layer: 'CODE',
      trust: 'VENDORED',
    },
  });
}

beforeEach(async () => {
  await resetDb();
  await seedPlans();
});
afterAll(closeDb);

describe('SC-009 — margin/cost is attributable to the individual capability', () => {
  it('reports each capability\'s own cost, not a module-blended or evenly-split figure', async () => {
    const { user, target } = await seedUserAndTarget();
    const scan = await seedScan(user.id, target.id, 80);

    const capA = await seedCapability('headers-checker', 'Headers Checker');
    const capB = await seedCapability('csp-analyzer', 'CSP Analyzer');

    // Capability A: two executions, 1_000_000 + 2_000_000 = 3_000_000, one failed.
    await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: capA.id,
        module: 'SECURITY',
        succeeded: true,
        durationMs: 120,
        costMicros: 1_000_000,
      },
    });
    await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: capA.id,
        module: 'SECURITY',
        succeeded: false,
        durationMs: 80,
        costMicros: 2_000_000,
        errorMessage: 'provider timeout',
      },
    });

    // Capability B: one execution, 500_000 — deliberately much smaller than A's
    // total AND smaller than an even split of the module's 3_500_000 total
    // (which would be 1_750_000 each if a bug divided evenly).
    await testDb.capabilityExecution.create({
      data: {
        scanId: scan.id,
        capabilityId: capB.id,
        module: 'SECURITY',
        succeeded: true,
        durationMs: 40,
        costMicros: 500_000,
      },
    });

    const report = await getMarginReport(testDb, {});

    // Per-capability: exact attribution, not blended, not evenly split.
    const rowA = report.perCapability.find((r) => r.capabilityId === capA.id);
    const rowB = report.perCapability.find((r) => r.capabilityId === capB.id);
    expect(rowA).toBeDefined();
    expect(rowB).toBeDefined();
    expect(rowA?.costMicros).toBe(3_000_000);
    expect(rowB?.costMicros).toBe(500_000);
    expect(rowA?.capabilityName).toBe('Headers Checker');
    expect(rowB?.capabilityName).toBe('CSP Analyzer');
    expect(rowA?.executionCount).toBe(2);
    expect(rowA?.succeededCount).toBe(1);
    expect(rowA?.failedCount).toBe(1);
    expect(rowB?.executionCount).toBe(1);
    expect(rowB?.succeededCount).toBe(1);
    expect(rowB?.failedCount).toBe(0);

    // The bug this test exists to catch: neither capability's own figure may
    // equal the module-wide blended total, and neither may equal an even
    // split of it.
    const moduleTotal = 3_500_000;
    const evenSplit = moduleTotal / 2;
    expect(rowA?.costMicros).not.toBe(moduleTotal);
    expect(rowB?.costMicros).not.toBe(moduleTotal);
    expect(rowA?.costMicros).not.toBe(evenSplit);
    expect(rowB?.costMicros).not.toBe(evenSplit);

    // Per-area (module) still correctly sums to the true total across both
    // capabilities — this proves the per-capability split isn't achieved by
    // simply under-reporting the module level either.
    const area = report.perArea.find((r) => r.module === 'SECURITY');
    expect(area?.costMicros).toBe(moduleTotal);

    // Per-scan: revenue (chargedCredits) and cost (costMicros) reported side
    // by side, correctly summed, no fabricated margin figure.
    const scanRow = report.perScan.find((r) => r.scanId === scan.id);
    expect(scanRow?.chargedCredits).toBe(80);
    expect(scanRow?.costMicros).toBe(moduleTotal);

    // No invented dollar-per-credit conversion anywhere in the report shape.
    expect(report).not.toHaveProperty('marginMicros');
    expect(report).not.toHaveProperty('marginUsd');
    expect(report.perCapability[0]).not.toHaveProperty('chargedCredits');
    expect(typeof report.note).toBe('string');
    expect(report.note.length).toBeGreaterThan(0);
  });

  it('per-area revenue split can leave a scan\'s own areas summing to less than its chargedCredits (documented floor-rounding shortfall)', async () => {
    // 80 credits across 3 requested modules does not divide evenly:
    // floor(80/3) = 26 per module, 26*3 = 78 -- 2 credits are not attributed
    // to any area. This is the exact, documented tradeoff in margin.service.ts's
    // module note and the response's own `note` field, not an accident.
    const { user, target } = await seedUserAndTarget();
    const scan = await testDb.scan.create({
      data: {
        userId: user.id,
        targetId: target.id,
        requestedModules: ['SECURITY', 'SEO', 'TESTING'],
        capabilitySnapshot: {},
        quotedCredits: 80,
        chargedCredits: 80,
        state: 'COMPLETED',
      },
    });

    const report = await getMarginReport(testDb, {});
    const scanAreas = report.perArea.filter((r) =>
      ['SECURITY', 'SEO', 'TESTING'].includes(r.module),
    );
    expect(scanAreas).toHaveLength(3);
    for (const area of scanAreas) {
      expect(area.chargedCredits).toBe(26); // floor(80 / 3)
    }
    const summedBack = scanAreas.reduce((sum, a) => sum + a.chargedCredits, 0);
    // Strictly less than the scan's real chargedCredits -- the 2-credit
    // remainder is not attributed anywhere, exactly as documented.
    expect(summedBack).toBe(78);
    expect(summedBack).toBeLessThan(scan.chargedCredits);
  });
});
