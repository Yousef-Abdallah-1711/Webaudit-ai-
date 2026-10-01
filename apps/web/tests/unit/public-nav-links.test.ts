import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PublicFooter, PublicHeader } from '../../components/public/Public.js';
import { AuthProvider } from '../../components/auth/AuthProvider.js';
import { I18nProvider } from '../../app/theme';

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((match) => match[1] ?? '');
}

describe('public navigation', () => {
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
