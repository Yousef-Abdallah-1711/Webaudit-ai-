import { describe, expect, it } from 'vitest';
import { heartbeatKey, writeHeartbeat } from '../../src/orchestrator/heartbeat.js';

describe('worker heartbeat', () => {
  it('writes a namespaced timestamp with an expiry', async () => {
    const calls: unknown[][] = [];
    const redis = {
      set: async (...args: unknown[]) => {
        calls.push(args);
        return 'OK';
      },
    };

    await writeHeartbeat(redis, 'worker-a', 30_000);

    expect(heartbeatKey('worker-a')).toBe('worker:heartbeat:worker-a');
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('worker:heartbeat:worker-a');
    expect(calls[0]?.[2]).toBe('PX');
    expect(calls[0]?.[3]).toBe(30_000);
  });
});
