import { describe, expect, it, vi } from 'vitest';
import type { Queue } from 'bullmq';
import { scheduleAuthTokenCleanup } from '../../src/orchestrator/auth-token-cleanup-scheduler.js';
import { JOB_NAMES } from '../../src/queue/workers.js';

describe('auth-token cleanup schedule', () => {
  it('upserts a daily repeatable job on the existing maintenance queue', async () => {
    const upsertJobScheduler = vi.fn(() => Promise.resolve());
    await scheduleAuthTokenCleanup({ upsertJobScheduler } as unknown as Queue);
    expect(upsertJobScheduler).toHaveBeenCalledWith(
      'auth-token-cleanup',
      { every: 24 * 60 * 60_000 },
      {
        name: JOB_NAMES.authTokenCleanup,
        data: { kind: 'auth-token-cleanup' },
        opts: { removeOnComplete: true, removeOnFail: 50 },
      },
    );
  });
});
