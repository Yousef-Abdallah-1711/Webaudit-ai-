// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getReportExport } from '../../lib/api.js';

afterEach(() => vi.unstubAllGlobals());

describe('report export', () => {
  it('fetches the owner-scoped HTML export and preserves its filename', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (_url: string) =>
          new Response('<!doctype html><title>Report</title>', {
            status: 200,
            headers: { 'Content-Disposition': 'attachment; filename="scan.html"' },
          }),
      ),
    );

    const result = await getReportExport('scan-123');
    expect(result.html).toContain('<title>Report</title>');
    expect(result.filename).toBe('scan.html');
  });
});
