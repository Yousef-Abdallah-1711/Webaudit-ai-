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
import { act, createElement } from 'react';
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
      quotedCredits: 80,
      chargedCredits: 80,
    },
  }),
}));

vi.mock('../../lib/realtime.js', () => ({
  // Never fires onEvent/onResync — proves the fix works from the REST
  // resync inside ScanProgress's own refetch, not from a realtime push.
  connectRealtime: vi.fn().mockReturnValue({ close: vi.fn() }),
}));

describe('ScanProgress', () => {
  it('shows the queue position for a queued scan', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getScan).mockResolvedValueOnce({
      scan: {
        id: 'scan-1',
        state: 'QUEUED',
        requestedModules: ['SECURITY'],
        startedAt: null,
        moduleResults: [],
        queuePosition: 3,
        quotedCredits: 80,
        chargedCredits: 80,
      },
    });
    const { ScanProgress } = await import('../../components/scan/ScanProgress.js');
    const mounted = await renderClient(
      createElement(ScanProgress, { scanId: 'scan-1', hostname: 'example.com' }),
    );
    try {
      expect(mounted.html()).toContain('Position in queue: 3');
    } finally {
      mounted.unmount();
    }
  });

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

  it('restores durable execution-unit progress from the authenticated scan resync', async () => {
    const api = await import('../../lib/api.js');
    vi.mocked(api.getScan).mockResolvedValueOnce({
      scan: {
        id: 'scan-1',
        state: 'RUNNING_PHASE_1',
        requestedModules: ['SECURITY'],
        startedAt: new Date().toISOString(),
        moduleResults: [],
        executionPlans: [
          {
            id: 'plan-1',
            kind: 'INITIAL',
            state: 'RESOLVED',
            units: [
              {
                id: 'unit-1',
                executionUnitClass: 'BROWSER',
                status: 'RUNNING',
                progressSnapshot: {
                  label: 'Opening pages',
                  completedUnits: null,
                  totalUnits: null,
                  at: new Date().toISOString(),
                },
                progressIndeterminate: true,
              },
            ],
          },
        ],
        quotedCredits: 80,
        chargedCredits: 80,
      },
    });
    const { ScanProgress } = await import('../../components/scan/ScanProgress.js');
    const mounted = await renderClient(
      createElement(ScanProgress, { scanId: 'scan-1', hostname: 'example.com' }),
    );
    try {
      expect(mounted.html()).toContain('Execution steps');
      expect(mounted.html()).toContain('Browser checks');
      expect(mounted.html()).toContain('Opening pages');
      expect(mounted.html()).toContain('progress is indeterminate');
      expect(mounted.html()).not.toContain('50%');

      const realtime = await import('../../lib/realtime.js');
      const options = vi.mocked(realtime.connectRealtime).mock.calls.at(-1)?.[0];
      expect(options).toBeDefined();
      await act(async () => {
        options?.onEvent({
          type: 'execution:progress',
          scanId: 'scan-1',
          executionPlanId: 'plan-1',
          planKind: 'INITIAL',
          executionUnitId: 'unit-1',
          executionUnitClass: 'BROWSER',
          at: new Date().toISOString(),
          label: 'Pages loaded',
          completedUnits: 2,
          totalUnits: 3,
          indeterminate: false,
        });
      });
      expect(mounted.html()).toContain('Pages loaded — 2 of 3');
    } finally {
      mounted.unmount();
    }
  });
});
