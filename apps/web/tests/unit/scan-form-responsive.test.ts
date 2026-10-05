/**
 * The scan form and its 340px quote card sit beside the 248px dashboard
 * sidebar, so they only fit side by side from roughly 1040px. The original
 * 640px collapse left 641–1040px with a content area too narrow for both
 * columns, and the quote card overflowed the page (scrollWidth 937 at 768px).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));

describe('scan form grid', () => {
  it('stacks below 1040px', async () => {
    const source = readFileSync(`${WEB_ROOT}components/scan/ScanForm.tsx`, 'utf8');
    expect(source).toContain('max-scan-stack:grid-cols-1');

    const { default: config } = (await import(
      /* @vite-ignore */ `${WEB_ROOT}tailwind.config.ts`
    )) as { default: Record<string, unknown> };
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: 'max-scan-stack:grid-cols-1', extension: 'html' }] }),
    ]).process('@tailwind utilities;', { from: undefined });

    expect(result.css.replace(/\s+/g, ' ')).toContain('@media (max-width: 1040px)');
  });
});
