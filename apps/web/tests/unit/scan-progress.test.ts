// @vitest-environment jsdom
/**
 * ScanProgress.tsx — found via manual testing (Playwright MCP against a
 * real dev stack) that a scan could genuinely complete while every area's
 * badge stayed on "Waiting" forever: per-module state updated only from
 * realtime `module:*` WebSocket events, and the resync path
 * (`onResync` -> `refetch`) only ever re-read the aggregate `scanState`,
 * never per-module state — so a dropped or raced connection (observed
 * live) left the UI permanently wrong even after the report was ready.
 *
 * This mounts the real component with a real jsdom + `act` (renderClient),
 * mocking `lib/api`'s `getScan` and `lib/realtime`'s `connectRealtime` so
 * the fix is proven from the REST resync alone — no realtime event ever
 * fires in this test.
 */
import { createElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderClient } from '../helpers/render-client.js';

vi.mock('../../lib/api.js', () => ({
  getAccessToken: () => 'test-token',
  getScan: vi.fn().mockResolvedValue({
    scan: {
      id: 'scan-1',
      state: 'COMPLETED',
      requestedModules: ['SECURITY', 'SEO'],
      startedAt: new Date().toISOString(),
      moduleResults: [
        { module: 'SECURITY', state: 'COMPLETE' },
        { module: 'SEO', state: 'DEGRADED' },
      ],
    },
  }),
}));

vi.mock('../../lib/realtime.js', () => ({
  // Never fires onEvent/onResync — proves the fix works from the REST
  // resync inside ScanProgress's own refetch, not from a realtime push.
  connectRealtime: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

describe('ScanProgress', () => {
  it("shows each area's real state from the REST resync, even when no realtime event ever arrives", async () => {
    const { ScanProgress } = await import('../../components/scan/ScanProgress.js');
    const mounted = await renderClient(
      createElement(ScanProgress, { scanId: 'scan-1', hostname: 'example.com' }),
    );
    try {
      expect(mounted.html()).toContain('Complete');
      expect(mounted.html()).toContain('Degraded');
      expect(mounted.html()).not.toContain('Waiting');
    } finally {
      mounted.unmount();
    }
  });
});
