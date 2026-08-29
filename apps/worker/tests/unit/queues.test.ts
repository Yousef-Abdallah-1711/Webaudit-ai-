/**
 * The worker cannot boot if `createQueues`/`createWorkers` cannot construct.
 *
 * Nothing anywhere in the repository called either function before this suite —
 * `workers.test.ts` exercises `dispatch()` against structural fakes, and no
 * other file constructs a real `Queue` or `Worker`. That gap hid a boot-time
 * defect: BullMQ 6.2.0 (the version pinned in `apps/worker/package.json`)
 * unconditionally rejects any queue name containing a colon —
 * `QueueBase`'s constructor throws `Queue name cannot contain :` — and every
 * name in `QUEUE_NAMES` was `webaudit:scan-phase` / `webaudit:reverify` /
 * `webaudit:maintenance`. `startWorker()` does catch the throw and exits
 * non-zero rather than looking healthy, but the practical result was the same
 * either way: the worker service, as committed, could not start in any real
 * deployment, regardless of configuration.
 */

import { afterAll, describe, expect, it } from 'vitest';
import { createQueues, QUEUE_NAMES, redisConnection } from '../../src/queue/queues.js';
import { createWorkers } from '../../src/queue/workers.js';

const REDIS_URL = process.env['REDIS_URL'] ?? 'redis://127.0.0.1:6389';

describe('the pinned BullMQ version accepts every queue name this repo defines', () => {
  it('has no colon in any queue name', () => {
    // The mechanical fact `QueueBase` enforces. Asserted directly so a future
    // rename that reintroduces a colon fails here, in a millisecond, rather
    // than at deploy time against a real Redis.
    for (const name of Object.values(QUEUE_NAMES)) {
      expect(name).not.toContain(':');
    }
  });

  describe('against a real Redis', () => {
    const connection = redisConnection(REDIS_URL);
    let created: { close(): Promise<void> } | undefined;

    afterAll(async () => {
      if (created !== undefined) await created.close();
    });

    it('constructs every production queue without throwing', () => {
      // This is the actual regression: BullMQ validates the name synchronously
      // in the constructor, before any Redis round trip, so a bad name throws
      // right here — which is exactly what happened before the rename.
      const queues = createQueues(connection);
      created = queues;
      expect(queues.scanPhase.name).toBe(QUEUE_NAMES.scanPhase);
      expect(queues.reverify.name).toBe(QUEUE_NAMES.reverify);
      expect(queues.maintenance.name).toBe(QUEUE_NAMES.maintenance);
    });

    it('constructs every production worker without throwing', async () => {
      const workers = createWorkers({ connection });
      await workers.close(true);
    });
  });
});
