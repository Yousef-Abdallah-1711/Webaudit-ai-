/**
 * Wave 1 fix: the pricing tier grid must actually collapse on small screens.
 *
 * `tailwind.config.ts` declares object screens (`{ max: '…' }`), and Tailwind
 * 3.4 then silently disables every arbitrary `max-[Npx]:` / `min-[Npx]:`
 * variant ("not supported with a `screens` configuration containing
 * objects"). A grid written with `max-[900px]:grid-cols-2` therefore stayed at
 * four columns on a 375px phone and overflowed horizontally. This test
 * compiles the grid's real class string with the real config, so the
 * responsive rules are checked as generated CSS rather than as source text.
 */
import { fileURLToPath } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { I18nProvider } from '../../app/theme';
import { TierGrid } from '../../app/[locale]/(public)/pricing/PricingPage';

// Loaded by path (not a static import) so the config stays outside the TS project,
// where ESLint lists it under allowDefaultProject.
const CONFIG_PATH = fileURLToPath(new URL('../../tailwind.config.ts', import.meta.url));

async function compile(html: string): Promise<string> {
  const { default: config } = (await import(/* @vite-ignore */ CONFIG_PATH)) as {
    default: Record<string, unknown>;
  };
  const result = await postcss([
    tailwindcss({ ...config, content: [{ raw: html, extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined });
  return result.css.replace(/\s+/g, ' ');
}

describe('TierGrid responsive layout', () => {
  it('generates the 2-column and 1-column collapse rules', async () => {
    const html = renderToStaticMarkup(createElement(I18nProvider, null, createElement(TierGrid)));
    const css = await compile(html);

    expect(css).toMatch(/@media \(max-width: 900px\) \{[^}]*grid-cols-2[^}]*repeat\(2,/);
    expect(css).toMatch(/@media \(max-width: 720px\) \{[^}]*grid-cols-1[^}]*repeat\(1,/);
  });
});
