/**
 * P3 (full-workflow review) — the worker's realtime-progress publisher Redis
 * client had no `.on('error', ...)` handler, unlike every sibling client in
 * this codebase (`apps/worker/src/orchestrator/cancellation.ts`'s subscriber,
 * `apps/api/src/services/queue/cancel-publisher.ts`, and
 * `apps/api/src/middleware/ratelimit.middleware.ts`'s own client all attach
 * one, each with the same comment: "ioredis emits 'error' on every failed
 * reconnection attempt, and an unhandled 'error' on an EventEmitter takes the
 * process down"). `installProcessGuards()` (called earlier in `startWorker`)
 * already contains an uncaught-exception fallout from this, so the gap was
 * never a live crash risk in production — but every unattributed reconnect
 * failure landed in the generic guard's catch-all log line instead of being
 * identified as what it actually was, and there is no reason this one client
 * should be the odd one out.
 *
 * `createPublisherRedisClient` is extracted (mirroring
 * `ratelimit.middleware.ts`'s own `createClient`) so this is directly
 * testable without booting the whole worker service.
 */

import { describe, expect, it } from 'vitest';
import { createPublisherRedisClient } from '../../src/index.js';

describe('the worker publisher Redis client attaches its own error handler', () => {
  it('registers an error listener at construction time', () => {
    // lazyConnect: true — this test asserts the listener is wired, not that a
    // real Redis is reachable, so no real connection attempt should happen.
    const client = createPublisherRedisClient('redis://127.0.0.1:0', { lazyConnect: true });
    try {
      expect(client.listenerCount('error')).toBeGreaterThan(0);
    } finally {
      client.disconnect();
    }
  });

  it('does not throw when an error event fires (the actual failure mode being fixed)', () => {
    const client = createPublisherRedisClient('redis://127.0.0.1:0', { lazyConnect: true });
    try {
      // A Node EventEmitter throws synchronously from `emit('error', ...)`
      // when no listener is registered — this is the exact mechanism that
      // turns an ioredis reconnect failure into an unattributed incident.
      // With the handler in place, emitting must be a no-op crash-wise.
      expect(() => client.emit('error', new Error('synthetic reconnect failure'))).not.toThrow();
    } finally {
      client.disconnect();
    }
  });
});
