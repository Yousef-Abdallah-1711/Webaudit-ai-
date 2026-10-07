/**
 * CSS Modules are held to a recorded raw hex/px ratchet. Migrated admin
 * modules are absent from the baseline so they cannot silently return.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEB_ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function findCssModules(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      findCssModules(full, out);
    } else if (entry.endsWith('.module.css')) {
      out.push(full);
    }
  }
}

const HEX_RE = /#[0-9a-fA-F]{3,8}\b/g;
// Negative lookbehind excludes matching the tail of a longer token/word (e.g.
// a hypothetical `--foo-16px-bar`), so this only counts a literal numeric px
// value, matching the intent of the JS-side rule's identical regex.
const PX_RE = /(?<![\w-])[0-9]+px\b/g;

function countRawValues(source: string): { hex: number; px: number } {
  // Strip CSS comments first; documentation is not a raw CSS value.
  // comments *describe* hex literals in prose; that is documentation, not usage.
  const stripped = source.replace(/\/\*[\s\S]*?\*\//g, '');
  return {
    hex: (stripped.match(HEX_RE) ?? []).length,
    px: (stripped.match(PX_RE) ?? []).length,
  };
}

/** Remaining recorded CSS Module counts, relative to `apps/web`. */
const BASELINE: Record<string, { hex: number; px: number }> = {
  // Retained public drawer pseudo-elements and RTL transforms still need the
  // original 640px media query after the rest of Public's styling moved to Tailwind.
  'components/public/Public.special.module.css': { hex: 0, px: 2 },
};

/** The only approved CSS Modules after the Tailwind migration (see exit report). */
const CSS_MODULE_ALLOWLIST = [
  'components/auth/AuthShell.special.module.css',
  'components/public/Public.special.module.css',
];

function cssModuleAllowlistDrift(discovered: string[]): string[] {
  const discoveredSet = new Set(discovered);
  const expectedSet = new Set(CSS_MODULE_ALLOWLIST);
  return [
    ...discovered.filter((file) => !expectedSet.has(file)).map((file) => `unexpected: ${file}`),
    ...CSS_MODULE_ALLOWLIST.filter((file) => !discoveredSet.has(file)).map(
      (file) => `missing: ${file}`,
    ),
  ];
}

describe('CSS Modules raw hex/px is a ratchet, not an unmonitored gap', () => {
  it('allows exactly the documented CSS Modules and requires an intentional exit-report update', () => {
    const files: string[] = [];
    findCssModules(WEB_ROOT, files);
    const discovered = files.map((file) => relative(WEB_ROOT, file).split(sep).join('/'));
    const drift = cssModuleAllowlistDrift(discovered);

    expect(
      drift,
      'CSS Module set changed. Review docs/audits/tailwind-migration-css-module-exit-report.md and deliberately update this allowlist.',
    ).toEqual([]);
  });

  it('the CSS Module allowlist rejects a throwaway sixth module', () => {
    const drift = cssModuleAllowlistDrift([
      ...CSS_MODULE_ALLOWLIST,
      'components/experimental/Extra.module.css',
    ]);

    expect(drift).toContain('unexpected: components/experimental/Extra.module.css');
  });

  it('never exceeds the recorded baseline, and never appears in a file with none recorded', () => {
    const files: string[] = [];
    findCssModules(WEB_ROOT, files);

    const regressions: string[] = [];
    for (const file of files) {
      const rel = relative(WEB_ROOT, file).split(sep).join('/');
      const actual = countRawValues(readFileSync(file, 'utf8'));
      const allowed = BASELINE[rel] ?? { hex: 0, px: 0 };
      if (actual.hex > allowed.hex) {
        regressions.push(`${rel}: hex ${String(actual.hex)} > baseline ${String(allowed.hex)}`);
      }
      if (actual.px > allowed.px) {
        regressions.push(`${rel}: px ${String(actual.px)} > baseline ${String(allowed.px)}`);
      }
    }

    expect(regressions).toEqual([]);
  });

  it('the scanner itself detects a raw hex and a raw px value', () => {
    const result = countRawValues('.x { color: #ff0000; padding: 16px; }');
    expect(result).toEqual({ hex: 1, px: 1 });
  });

  it('does not count a hex/px literal that appears only inside a comment', () => {
    const result = countRawValues(
      '/* the source uses #ff0000 and 16px here */\n.x { color: var(--accent); }',
    );
    expect(result).toEqual({ hex: 0, px: 0 });
  });

  it('does not count a token reference as a raw value', () => {
    const result = countRawValues('.x { padding: var(--space-4); color: var(--accent); }');
    expect(result).toEqual({ hex: 0, px: 0 });
  });
});
