/**
 * T179 — the three-tab input selector.
 *
 * Two halves, because the component has two kinds of behaviour and only one of
 * them is reachable from a static render.
 *
 * **Markup**, via `renderToStaticMarkup` like every other component suite here:
 * the tab strip, the default tab, and the accepted file type. Effects do not
 * run in a static render, so the repository and archive states are not
 * assertable this way and this suite does not pretend otherwise.
 *
 * **The client calls those states depend on**, against a stubbed `fetch`. This
 * is where the real risk is, and one assertion in particular earns its place:
 * `uploadArchive` must not set `Content-Type`. A hand-set multipart header
 * omits the boundary the browser generates, and the server then cannot parse a
 * body that looks perfectly fine in a network panel — a failure that is
 * invisible until someone tries a real upload.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputTabs } from '../../components/scan/InputTabs';
import { ApiError, listRepositories, uploadArchive } from '../../lib/api';

const render = (el: React.ReactElement): string => renderToStaticMarkup(el);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('InputTabs markup', () => {
  it('offers all three inputs and opens on URL', () => {
    const html = render(createElement(InputTabs, { onChange: () => {} }));
    expect(html).toContain('URL');
    expect(html).toContain('Repository');
    expect(html).toContain('Archive');
    // The URL tab is the one selected, and its field is the one rendered.
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('yoursite.com');
  });

  it('does not render a repository list or a dropzone until their tab is opened', () => {
    // Both are lazy on purpose: opening the repository tab is what triggers the
    // GitHub request, so a user who never opens it never causes one.
    const html = render(createElement(InputTabs, { onChange: () => {} }));
    expect(html).not.toContain('type="file"');
    expect(html).not.toContain('type="radio"');
  });
});

describe('the endpoints the tabs depend on', () => {
  it('uploads as multipart without setting Content-Type itself', async () => {
    let captured: RequestInit | undefined;
    vi.stubGlobal('fetch', (_url: string, init: RequestInit) => {
      captured = init;
      return Promise.resolve(
        new Response(JSON.stringify({ upload: { targetId: 't1', fileCount: 2 } }), { status: 201 }),
      );
    });

    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'project.zip');
    const { upload } = await uploadArchive(file);

    expect(upload.targetId).toBe('t1');
    expect(captured?.body).toBeInstanceOf(FormData);
    const headers = captured?.headers as Record<string, string>;
    expect(Object.keys(headers).map((k) => k.toLowerCase())).not.toContain('content-type');
  });

  it('surfaces an archive refusal as an ApiError carrying the reason', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: {
              code: 'ARCHIVE_REFUSED',
              message:
                'Refused the archive: NON_REGULAR_ENTRY — a symbolic link is never extracted',
              details: { reason: 'NON_REGULAR_ENTRY' },
            },
          }),
          { status: 422 },
        ),
      ),
    );

    const error = await uploadArchive(new File([], 'x.zip')).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    // The message reaches the user verbatim — it names the rule that refused.
    expect((error as ApiError).message).toContain('symbolic link');
    expect((error as ApiError).status).toBe(422);
  });

  it('distinguishes a revoked connection from an empty repository list', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            error: { code: 'REPO_CONNECTION_REVOKED', message: 'Reconnect GitHub…' },
          }),
          { status: 409 },
        ),
      ),
    );

    const error = await listRepositories().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).code).toBe('REPO_CONNECTION_REVOKED');
  });
});
