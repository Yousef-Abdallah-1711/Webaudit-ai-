/**
 * Arbitrary `max-[Npx]:` / `min-[Npx]:` variants must not be used.
 *
 * `tailwind.config.ts` declares object screens (`{ max: '…' }`), and Tailwind
 * 3.4 then silently disables every arbitrary min/max variant ("not supported
 * with a `screens` configuration containing objects"): the class is accepted,
 * no CSS is generated, and the layout quietly ignores the breakpoint. Use a
 * named screen from the config instead.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG_PATH = join(WEB_ROOT, 'tailwind.config.ts');
const ARBITRARY_BREAKPOINT = /\b(?:max|min)-\[[^\]]+\]:/;

/** Marketing sections that are not imported anywhere; they predate the named screens. */
const UNUSED_FILES_ALLOWED: string[] = [];

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

describe('arbitrary breakpoint variants', () => {
  it('are only present in the allowed unused files', () => {
    const offenders = ['app', 'components']
      .flatMap((root) => sourceFiles(join(WEB_ROOT, root)))
      .filter((file) => ARBITRARY_BREAKPOINT.test(readFileSync(file, 'utf8')))
      .map((file) => relative(WEB_ROOT, file).replaceAll('\\', '/'))
      .sort();

    expect(offenders).toEqual([...UNUSED_FILES_ALLOWED].sort());
  });

  it('generates the dashboard sidebar mobile drawer rules', async () => {
    const { default: config } = (await import(/* @vite-ignore */ CONFIG_PATH)) as {
      default: Record<string, unknown>;
    };
    const source = readFileSync(join(WEB_ROOT, 'components/dashboard/Sidebar.tsx'), 'utf8');
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: source, extension: 'tsx' }] }),
    ]).process('@tailwind utilities;', { from: undefined });
    const css = result.css.replace(/\s+/g, ' ');

    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('.max-dashboard-mobile\\:fixed { position: fixed }');
    expect(css).toContain('.max-dashboard-mobile\\:translate-x-0');
    expect(css).toContain('.max-dashboard-mobile\\:rtl\\:translate-x-full');
  });
});
