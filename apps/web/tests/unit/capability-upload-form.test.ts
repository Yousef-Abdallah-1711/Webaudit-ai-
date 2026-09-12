// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { uploadCapability } from '../../lib/api.js';
import AdminCapabilitiesPage from '../../app/(admin)/admin/capabilities/page';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('capability upload', () => {
  it('renders real metadata fields and a bundle file control', () => {
    const html = renderToStaticMarkup(createElement(AdminCapabilitiesPage));
    expect(html).toContain('Capability name');
    expect(html).toContain('Version');
    expect(html).toContain('type="file"');
    expect(html).toContain('Upload capability');
  });

  it('sends the bundle as multipart without overriding Content-Type and includes manifest metadata', async () => {
    let capturedUrl = '';
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      capturedUrl = url;
      captured = init;
      return Promise.resolve(
        new Response(JSON.stringify({ passed: true, verdict: { name: 'safe' } }), { status: 200 }),
      );
    });

    const result = await uploadCapability(
      new File(['export default {}'], 'bundle.js', { type: 'text/javascript' }),
      'Security checks',
      '1.2.3',
    );

    expect(result.passed).toBe(true);
    expect(capturedUrl).toContain('/admin/capabilities/upload?');
    expect(capturedUrl).toContain('name=Security+checks');
    expect(capturedUrl).toContain('version=1.2.3');
    expect(captured?.method).toBe('POST');
    expect(captured?.body).toBeInstanceOf(FormData);
    expect(Object.keys((captured?.headers ?? {}) as Record<string, string>)).not.toContain(
      'Content-Type',
    );
  });
});
