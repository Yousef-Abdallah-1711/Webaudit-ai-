import { describe, expect, it } from 'vitest';
import { REALTIME_REDIS_OPTIONS } from '../../src/index.js';

describe('realtime Redis timeout policy', () => {
  it('bounds connection and command waits', () => {
    expect(REALTIME_REDIS_OPTIONS.connectTimeout).toBe(2_000);
    expect(REALTIME_REDIS_OPTIONS.commandTimeout).toBe(500);
    expect(REALTIME_REDIS_OPTIONS.maxRetriesPerRequest).toBeNull();
  });
});
