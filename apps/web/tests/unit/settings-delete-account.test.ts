// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteAccount } from '../../lib/api.js';
import SettingsPage from '../../app/(dashboard)/settings/page';

afterEach(() => vi.unstubAllGlobals());

describe('account deletion', () => {
  it('exposes an explicit confirmation before the destructive action', () => {
    const html = renderToStaticMarkup(createElement(SettingsPage));
    expect(html).toContain('Type DELETE to confirm');
    expect(html).toContain('Delete my account');
  });

  it('calls DELETE /auth/me and accepts the empty 204 response', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    await deleteAccount();
    expect(captured?.method).toBe('DELETE');
  });
});
