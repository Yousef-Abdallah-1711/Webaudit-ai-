/** SPEC 009 FR-035 wiring: the repeatable reaper job, its dispatch, and the production store factory. */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testDb as db, resetDb, closeDb } from '@webaudit/api/test-db';
import {
  artifactKeyFor,
  createArtifactStoreFromEnv,
  createMemoryArtifactStore,
} from '@webaudit/api/evidence';
import { createArtifactReaperHandler } from '../../src/orchestrator/artifact-reaper.js';
import { dispatch, JOB_NAMES } from '../../src/queue/workers.js';

beforeAll(async () => {
  await resetDb();
});
afterAll(closeDb);

describe('artifact reaper job', () => {
  it('reclaims only old, unreferenced objects and reports the counts', async () => {
    const store = createMemoryArtifactStore();
    const orphan = artifactKeyFor('scanA', 'unitA', 'a'.repeat(64));
    const fresh = artifactKeyFor('scanA', 'unitA', 'b'.repeat(64));
    await store.put(orphan, new Uint8Array([1]), 'image/png');
    await store.put(fresh, new Uint8Array([2]), 'image/png');
    store.backdate(orphan, new Date(Date.now() - 3 * 3_600_000));
    expect(await createArtifactReaperHandler({ db, store })()).toEqual({
      scanned: 2,
      reclaimed: 1,
    });
    expect([...store.objects.keys()]).toEqual([fresh]);
  });

  it('is a no-op without an object store (no R2 credentials)', async () => {
    expect(await createArtifactReaperHandler({ db, store: null })()).toEqual({
      scanned: 0,
      reclaimed: 0,
    });
  });

  it('dispatch routes the repeatable job to the handler, validates its payload strictly, and refuses it when unhandled', async () => {
    let ran = 0;
    await dispatch(
      {
        name: JOB_NAMES.artifactReaper,
        queueName: 'maintenance',
        data: { kind: 'artifact-reaper' },
      },
      { artifactReaper: () => ((ran += 1), Promise.resolve()) },
    );
    expect(ran).toBe(1);
    await expect(
      dispatch(
        {
          name: JOB_NAMES.artifactReaper,
          queueName: 'maintenance',
          data: { kind: 'artifact-reaper', extra: 1 },
        },
        { artifactReaper: () => Promise.resolve() },
      ),
    ).rejects.toThrow();
    await expect(
      dispatch(
        {
          name: JOB_NAMES.artifactReaper,
          queueName: 'maintenance',
          data: { kind: 'artifact-reaper' },
        },
        {},
      ),
    ).rejects.toThrow();
  });
});

describe('createArtifactStoreFromEnv', () => {
  it('returns null unless every R2 variable is present, and a store when they are', () => {
    expect(createArtifactStoreFromEnv({})).toBeNull();
    expect(
      createArtifactStoreFromEnv({
        R2_ACCOUNT_ID: 'a',
        R2_ACCESS_KEY_ID: 'k',
        R2_SECRET_ACCESS_KEY: 's',
      }),
    ).toBeNull();
    const store = createArtifactStoreFromEnv({
      R2_ACCOUNT_ID: 'a',
      R2_ACCESS_KEY_ID: 'k',
      R2_SECRET_ACCESS_KEY: 's',
      R2_BUCKET: 'b',
    });
    expect(store).not.toBeNull();
    expect(typeof store!.put).toBe('function');
  });
});
