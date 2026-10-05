/**
 * The settings form column cannot shrink below ~428px, and it sits beside the
 * 320px plan card and the 248px dashboard sidebar. Together they need ~1095px,
 * so the old 776px collapse let the page overflow horizontally from 780px up to
 * ~1060px (+284px at 780px). The two-column layout now stacks below 1100px; the
 * label/input rows inside keep their own 776px collapse.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('settings layout', () => {
  it('stacks the form and plan card below 1100px and keeps the row collapse at 776px', async () => {
    const source = readFileSync(`${WEB_ROOT}app/(dashboard)/settings/page.tsx`, 'utf8');
    expect(source).toMatch(/layout: '[^']*max-account-stack:grid-cols-1/);
    expect(source).toMatch(/row: '[^']*max-account-collapse:grid-cols-1/);

    const { default: config } = (await import(
      /* @vite-ignore */ `${WEB_ROOT}tailwind.config.ts`
    )) as { default: Record<string, unknown> };
    const result = await postcss([
      tailwindcss({
        ...config,
        content: [{ raw: 'max-account-stack:grid-cols-1 max-account-collapse:grid-cols-1', extension: 'html' }],
      }),
    ]).process('@tailwind utilities;', { from: undefined });
    const css = result.css.replace(/\s+/g, ' ');

    expect(css).toContain('@media (max-width: 1100px)');
    expect(css).toContain('@media (max-width: 776px)');
  });
});
