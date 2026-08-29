/**
 * T236a — three things about the scaffold that are easy to quietly undo.
 *
 * `next build` (run as part of the manual verification for this task) already
 * proves the app compiles; it does not prove any of the three things below
 * stay true across a later edit, because a working build is silent about all
 * of them. These are plain file-content assertions rather than a rendered
 * check, on purpose: no dev server, no browser, fast and deterministic —
 * `apps/web/tests/visual/` (T246) owns actually rendering something.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = join(import.meta.dirname, '..', '..');

function read(relative: string): string {
  return readFileSync(join(WEB_ROOT, relative), 'utf8');
}

describe('the mobile type scale is actually wired (T126)', () => {
  it('overrides the desktop tokens inside a max-width: 640px media query', () => {
    // CLAUDE.md's own words: "the mobile type tokens are defined but never
    // applied by a media query." typography.css defines both scales; this is
    // the file that has to select between them, and it is the one place that
    // could quietly go back to not doing so.
    const globals = read('app/globals.css');
    const mediaBlock = /@media\s*\(max-width:\s*640px\)\s*\{([^}]*\{[^}]*\}[^}]*)\}/s.exec(globals);
    expect(mediaBlock, 'no max-width: 640px media block in globals.css').not.toBeNull();

    const body = mediaBlock![1]!;
    for (const token of ['--type-display', '--type-h2', '--type-body']) {
      expect(body, `${token} is not overridden inside the mobile media block`).toContain(
        `${token}: var(${token}-mobile)`,
      );
    }
  });
});

describe('design-system/ is never imported at runtime (CLAUDE.md rule 6)', () => {
  const cssFiles = readdirSync(join(WEB_ROOT, 'app/tokens')).filter((f) => f.endsWith('.css'));
  cssFiles.push('globals.css');

  it.each(cssFiles)('%s does not @import design-system/ or a remote URL', (file) => {
    const path = file === 'globals.css' ? `app/${file}` : `app/tokens/${file}`;
    const content = read(path);
    // The header comment on every ported file *names* design-system/ as its
    // source, deliberately — that provenance is worth keeping, and
    // `globals.css` legitimately `@import`s its own sibling files under
    // `./tokens/`. What must never come back is an `@import`/`url(...)` whose
    // target escapes `app/` back out to the repo's design-system/ directory,
    // or that points at a third party — the two ways this file could quietly
    // regain a live runtime dependency this rule forbids.
    const importTargets = [...content.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    const urlTargets = [...content.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    for (const target of [...importTargets, ...urlTargets]) {
      expect(target, `escapes to design-system/: "${target}"`).not.toMatch(/design-system/);
      expect(target, `remote URL: "${target}"`).not.toMatch(/^https?:\/\//);
    }
  });
});

describe('workspace packages stay transpilable (T236a)', () => {
  it('next.config.ts still lists both @webaudit/* dependencies', () => {
    // Without this, importing either package fails to compile rather than
    // failing at runtime — a worse failure to debug, and the reason this is
    // asserted rather than left to be rediscovered.
    const config = read('next.config.ts');
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    const workspaceDeps = Object.entries(pkg.dependencies)
      .filter(([, version]) => version === 'workspace:*')
      .map(([name]) => name);

    expect(workspaceDeps.length).toBeGreaterThan(0);
    for (const name of workspaceDeps) {
      expect(config, `${name} is a workspace dependency but not in transpilePackages`).toContain(
        `'${name}'`,
      );
    }
  });
});
