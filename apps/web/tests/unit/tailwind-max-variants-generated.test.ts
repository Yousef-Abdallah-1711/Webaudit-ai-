/**
 * Every `max-<screen>:` class used in the app must actually generate CSS.
 *
 * `tailwind.config.ts` mixes object screens (`{ max: '…' }`) with min-width
 * screens, and Tailwind 3.4 then disables the automatic `max-<screen>` variants
 * ("not supported with a `screens` configuration containing objects"). A class
 * such as `max-account-collapse:grid-cols-1` is accepted silently, emits nothing,
 * and the page never collapses on a phone. This compiles each such class found in
 * the source with the real config and fails for any that produce no rule.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';
import postcss from 'postcss';
import tailwindcss from 'tailwindcss';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CONFIG_PATH = join(WEB_ROOT, 'tailwind.config.ts');
/** A class token whose variant chain contains a `max-<screen>:` prefix. */
const MAX_VARIANT = /^(?:[a-z!][\w-]*:)*max-[a-z][\w-]*:/;

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

/** Escape a class name as Tailwind writes it in a selector (a comma becomes `\2c `). */
function escapeSelector(token: string): string {
  return token.replace(/[^a-zA-Z0-9_-]/g, (character) =>
    character === ',' ? '\\2c ' : `\\${character}`,
  );
}

describe('max-<screen> variants', () => {
  it('all generate CSS with the real Tailwind config', async () => {
    const tokens = new Map<string, string>();
    for (const file of ['app', 'components'].flatMap((root) => sourceFiles(join(WEB_ROOT, root)))) {
      for (const token of readFileSync(file, 'utf8').split(/[\s'"`{}]+/)) {
        // Arbitrary values (`w-[min(15rem,85vw)]`) are checked too; a token cut apart by a
        // quote inside brackets has unbalanced brackets and is skipped.
        const balanced = token.split('[').length === token.split(']').length;
        if (MAX_VARIANT.test(token) && balanced) {
          tokens.set(token, relative(WEB_ROOT, file).replaceAll('\\', '/'));
        }
      }
    }
    expect(tokens.size, 'found max-<screen> classes to check').toBeGreaterThan(10);

    const { default: config } = (await import(/* @vite-ignore */ CONFIG_PATH)) as {
      default: Record<string, unknown>;
    };
    const result = await postcss([
      tailwindcss({ ...config, content: [{ raw: [...tokens.keys()].join(' '), extension: 'html' }] }),
    ]).process('@tailwind utilities;', { from: undefined });

    const dead = [...tokens.entries()]
      .filter(([token]) => !result.css.includes(`.${escapeSelector(token)}`))
      .map(([token, file]) => `${token}  (${file})`);

    expect(dead, 'classes that emit no CSS').toEqual([]);
  });
});
