/** FR-027/027a — durable progress snapshot and ephemeral emit, against real PostgreSQL. */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, resetDb, testDb } from '../../helpers/db.js';
import { makeRuntimeWorld, makeUnit } from '../../helpers/runtime-fixtures.js';
import { finalizeExecutionUnit } from '../../../src/services/execution-runtime/index.js';
import {
  PROGRESS_LIMITS,
  emitProgress,
  normalizeTick,
  snapshotProgress,
  unitProgressChannel,
} from '../../../src/services/execution-runtime/progress.js';

beforeAll(async () => {
  await resetDb();
});
afterAll(async () => {
  await closeDb();
});

describe('normalizeTick (rule 1: never fabricate a percentage)', () => {
  it('is indeterminate whenever the total is unknown or zero, whatever else is claimed', () => {
    expect(normalizeTick({ label: 'x' })).toMatchObject({
      indeterminate: true,
      totalUnits: null,
      completedUnits: null,
    });
    expect(normalizeTick({ label: 'x', completedUnits: 3 })).toMatchObject({
      indeterminate: true,
      completedUnits: null,
    });
    expect(normalizeTick({ label: 'x', completedUnits: 0, totalUnits: 0 })).toMatchObject({
      indeterminate: true,
    });
    expect(normalizeTick({ label: 'x', completedUnits: 1, totalUnits: 4 })).toEqual({
      label: 'x',
      completedUnits: 1,
      totalUnits: 4,
      indeterminate: false,
    });
    expect(
      normalizeTick({ label: 'x', completedUnits: 1, totalUnits: 4, indeterminate: true })
        .indeterminate,
    ).toBe(true);
  });

  it.each([
    [{ label: '' }],
    [{ label: ' ' }],
    [{ label: 'x'.repeat(PROGRESS_LIMITS.labelMax + 1) }],
    [{ label: 'x', completedUnits: -1, totalUnits: 3 }],
    [{ label: 'x', completedUnits: 1.5, totalUnits: 3 }],
    [{ label: 'x', completedUnits: 5, totalUnits: 3 }],
    [{ label: 'x', totalUnits: Number.NaN }],
  ])('refuses an invalid tick %j', (tick) => {
    expect(() => normalizeTick(tick as never)).toThrow();
  });
});

describe('snapshotProgress', () => {
  it('writes in place (one row), throttles non-boundary writes, lets a boundary through', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w, { status: 'RUNNING' });
    expect(
      await snapshotProgress(testDb, u.id, { label: 'a', completedUnits: 1, totalUnits: 4 }),
    ).toBe('APPLIED');
    expect(
      await snapshotProgress(testDb, u.id, { label: 'b', completedUnits: 2, totalUnits: 4 }),
    ).toBe('THROTTLED');
    expect(
      await snapshotProgress(
        testDb,
        u.id,
        { label: 'c', completedUnits: 3, totalUnits: 4 },
        { boundary: true },
      ),
    ).toBe('APPLIED');
    const row = (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!;
    expect(row.progressSnapshot).toMatchObject({ label: 'c', completedUnits: 3, totalUnits: 4 });
    expect(row.progressIndeterminate).toBe(false);
    expect(await snapshotProgress(testDb, u.id, { label: 'd' }, { boundary: true })).toBe(
      'APPLIED',
    );
    expect(
      (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!.progressIndeterminate,
    ).toBe(true);
    expect(
      await snapshotProgress(
        testDb,
        u.id,
        { label: 'e', completedUnits: 1, totalUnits: 2 },
        { minIntervalMs: 0 },
      ),
    ).toBe('APPLIED');
  });

  it('rejects a write for a terminal unit and reports an anomaly (FR-027a); the trigger would refuse it anyway', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w, { status: 'RUNNING' });
    await finalizeExecutionUnit(testDb, u.id, u.key, { kind: 'COMPLETED' });
    const anomalies: string[] = [];
    expect(
      await snapshotProgress(
        testDb,
        u.id,
        { label: 'late' },
        { boundary: true, onAnomaly: (m) => anomalies.push(m) },
      ),
    ).toBe('REJECTED_TERMINAL');
    expect(anomalies).toHaveLength(1);
    expect(
      (await testDb.executionUnit.findUnique({ where: { id: u.id } }))!.progressSnapshot,
    ).toBeNull();
    expect(await snapshotProgress(testDb, 'ghost', { label: 'x' })).toBe('NOT_FOUND');
    const planned = await makeUnit(w, { status: 'PLANNED' });
    expect(await snapshotProgress(testDb, planned.id, { label: 'x' })).toBe('NOT_ACTIVE');
  });

  it('is last-write-wins under concurrent writers: always exactly one row and a valid snapshot', async () => {
    const w = await makeRuntimeWorld();
    const u = await makeUnit(w, { status: 'RUNNING' });
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        snapshotProgress(
          testDb,
          u.id,
          { label: `t${String(i)}`, completedUnits: i, totalUnits: 8 },
          { minIntervalMs: 0 },
        ),
      ),
    );
    const rows = await testDb.executionUnit.findMany({ where: { id: u.id } });
    expect(rows).toHaveLength(1);
    expect((rows[0]!.progressSnapshot as { label: string }).label).toMatch(/^t[0-7]$/);
  });
});

describe('emitProgress (ephemeral)', () => {
  it('publishes to the per-unit channel, never touches Postgres, and survives a failing publisher or an invalid tick', async () => {
    const publish = vi.fn(() => Promise.resolve(1));
    emitProgress({ publish }, 'u1', { label: 'go', completedUnits: 1, totalUnits: 2 });
    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, message] = publish.mock.calls[0] as unknown as [string, string];
    expect(channel).toBe(unitProgressChannel('u1'));
    expect(JSON.parse(message)).toMatchObject({
      executionUnitId: 'u1',
      label: 'go',
      indeterminate: false,
    });
    emitProgress({ publish }, 'u1', { label: '' });
    expect(publish).toHaveBeenCalledTimes(1);
    expect(() =>
      emitProgress({ publish: () => Promise.reject(new Error('redis down')) }, 'u1', {
        label: 'x',
      }),
    ).not.toThrow();
    await new Promise((r) => setTimeout(r, 10));
  });
});
