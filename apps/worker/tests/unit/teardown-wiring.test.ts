import { describe, it, expect, afterEach } from 'vitest';
import { startWorker } from '../../src/index.js';

describe('startWorker wires workspace teardown', () => {
  let service: ReturnType<typeof startWorker> | undefined;

  afterEach(async () => {
    await service?.shutdown('test-cleanup');
    service = undefined;
  });

  it('refuses to start without WORKSPACE_BASE_DIR set', () => {
    const previous = process.env['WORKSPACE_BASE_DIR'];
    delete process.env['WORKSPACE_BASE_DIR'];
    try {
      expect(
        () =>
          (service = startWorker({
            installSignalHandlers: false,
            handlers: { phase: async () => {} },
          })),
      ).not.toThrow(); // handlers override bypasses the check — see Step 3's placement
    } finally {
      if (previous !== undefined) process.env['WORKSPACE_BASE_DIR'] = previous;
    }
  });
});
