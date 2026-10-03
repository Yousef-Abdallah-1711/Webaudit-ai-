import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { PublicFooter, PublicHeader } from '../../components/public/Public.js';
import { AuthProvider } from '../../components/auth/AuthProvider.js';
import { I18nProvider } from '../../app/theme';

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('public navigation', () => {
  it('marks the active page in desktop and mobile navigation', () => {
    const html = renderToStaticMarkup(
      createElement(
        I18nProvider,
        null,
        createElement(AuthProvider, null, createElement(PublicHeader, { active: 'nav_product' })),
      ),
    );
    const activeLinks = [...html.matchAll(/<a\b[^>]*aria-current="page"[^>]*>/g)].map(
      ([link]) => link ?? '',
    );
    expect(activeLinks).toHaveLength(2);
    expect(activeLinks.every((link) => link.includes('font-semibold'))).toBe(true);
    expect(activeLinks[1]).toContain('max-[640px]:!text-text-strong');
  });

  it('links How it works to the existing audit loop section', () => {
    const html = renderToStaticMarkup(
      createElement(I18nProvider, null, createElement(AuthProvider, null, createElement(PublicHeader))),
    );
    expect(hrefs(html)).toContain('/#loop');
  });

  it('contains no dead hash or nonexistent register links', () => {
    const html = [
      renderToStaticMarkup(
        createElement(I18nProvider, null, createElement(AuthProvider, null, createElement(PublicHeader))),
      ),
      renderToStaticMarkup(
        createElement(I18nProvider, null, createElement(AuthProvider, null, createElement(PublicFooter))),
      ),
    ].join('');
    for (const href of hrefs(html)) {
      expect(href).not.toBe('#');
      expect(href).not.toBe('/register');
    }
  });
});
