/**
 * T247 — the vendored icon subset.
 *
 * Same rendering discipline as the other component suites. The one thing
 * worth a dedicated assertion here, beyond "it renders the right path": that
 * the four de-duplicated glyphs (see paths.ts's module note) really are
 * shared rather than accidentally re-diverging, since the whole point of
 * vendoring them once was to stop `toggle`/`usage`/`billing`/`report` from
 * drifting into near-but-not-quite-identical copies the way scattered inline
 * SVGs tend to.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS, Icon, type IconName } from '../../components/ui/icons';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('Icon', () => {
  it('renders every vendored name to a real, non-empty path', () => {
    for (const name of Object.keys(ICON_PATHS) as IconName[]) {
      const html = render(createElement(Icon, { name }));
      expect(html, name).toContain('<svg');
      expect(html, name).toContain(`d="${ICON_PATHS[name]}"`);
    }
  });

  it('defaults to the size and stroke width both source shells used for nav icons', () => {
    const html = render(createElement(Icon, { name: 'menu' }));
    expect(html).toContain('width="17"');
    expect(html).toContain('height="17"');
    expect(html).toContain('stroke-width="1.9"');
  });

  it('honours a caller-supplied size and stroke width', () => {
    const html = render(createElement(Icon, { name: 'menu', size: 24, strokeWidth: 2.4 }));
    expect(html).toContain('width="24"');
    expect(html).toContain('stroke-width="2.4"');
  });

  it('is decorative: aria-hidden, and merges a caller class without dropping the base one', () => {
    const html = render(createElement(Icon, { name: 'check', className: 'nav-icon' }));
    expect(html).toContain('aria-hidden="true"');
    expect(html).toMatch(/class="[^"]*\bnav-icon\b[^"]*"/);
  });
});

describe('the de-duplicated glyphs stay de-duplicated', () => {
  // Sidebar.jsx's `toggle` and AdminShell.jsx's `toggle` were byte-identical
  // in source; `usage`/`overview` and `billing`/`plans` and `report`/`log`
  // each collapsed to one export here. This is not a claim about the icon
  // set generally — it is a regression guard against a future edit widening
  // one exported path while leaving the others where they were, silently
  // reintroducing the drift vendoring them once was meant to close.
  it('barChart matches the path AttributionMark already ships for "measured"', () => {
    // AttributionMark.tsx embeds this path directly rather than importing
    // Icon (it predates this module and is a documented, self-contained
    // port); the two must still agree, since they are the same glyph.
    expect(ICON_PATHS.barChart).toBe('M4 20V10m5 10V4m5 16v-7m5 7V8');
  });

  it('has exactly one export per distinct glyph, not one per screen that used it', () => {
    const paths = Object.values(ICON_PATHS);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
