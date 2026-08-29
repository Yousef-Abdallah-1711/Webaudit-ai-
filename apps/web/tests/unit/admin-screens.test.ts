/**
 * T244 — the last 4 admin screens: Scans, Providers, Log, Settings.
 *
 * Same discipline as admin-overview.test.ts: `renderToStaticMarkup`, no
 * jsdom, no `next/navigation` mock — none of these four pages call
 * `usePathname()`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminScansPage from '../../app/(admin)/admin/scans/page';
import AdminProvidersPage from '../../app/(admin)/admin/providers/page';
import AdminLogPage from '../../app/(admin)/admin/log/page';
import AdminSettingsPage from '../../app/(admin)/admin/settings/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminScansPage', () => {
  it('renders all 5 scan rows', () => {
    const html = render(createElement(AdminScansPage));
    expect(html).toContain('acme.com');
    expect(html).toContain('store.example');
  });

  it('running and complete each get their own tone; degraded and failed share "neutral" — matching the source exactly', () => {
    const html = render(createElement(AdminScansPage));
    const badgeClasses = new Map(
      [...html.matchAll(/<span class="([^"]*)">(running|complete|degraded|failed)</g)].map((m) => [
        m[2],
        m[1],
      ]),
    );
    expect(badgeClasses.get('running')).not.toBe(badgeClasses.get('complete'));
    expect(badgeClasses.get('degraded')).toBe(badgeClasses.get('failed'));
  });
});

describe('AdminProvidersPage', () => {
  it('starts with 3 vendors and no warning banner', () => {
    const html = render(createElement(AdminProvidersPage));
    expect(html).toContain('Anthropic');
    expect(html).toContain('3 vendors');
    expect(html).not.toContain('refused at startup');
  });

  it('gives healthy and degraded providers visually distinct classes', () => {
    const html = render(createElement(AdminProvidersPage));
    const spans = [...html.matchAll(/<span class="([^"]+)">(healthy|degraded)<\/span>/g)];
    const byState = new Map(spans.map((m) => [m[2], m[1]]));
    expect(byState.get('healthy')).not.toBe(byState.get('degraded'));
  });
});

describe('AdminLogPage', () => {
  it('renders every audit entry and the filter box', () => {
    const html = render(createElement(AdminLogPage));
    expect(html).toContain('capability.disable');
    expect(html).toContain('credits.grant');
    expect(html).toContain('provider.reorder');
    expect(html).toContain('Filter by actor or action');
  });
});

describe('AdminSettingsPage', () => {
  it('renders every feature flag, limit, and retention row', () => {
    const html = render(createElement(AdminSettingsPage));
    expect(html).toContain('Repository input');
    expect(html).toContain('Archive upload');
    expect(html).toContain('Scan timeout');
    expect(html).toContain('12 months');
  });

  it('gives an on flag and an off flag visually distinct switch classes', () => {
    // "Repository input" defaults true, "Archive upload" defaults false.
    const html = render(createElement(AdminSettingsPage));
    const switches = [...html.matchAll(/aria-label="([^"]+)" class="([^"]+)"/g)];
    const on = switches.find((m) => m[1] === 'Repository input')?.[2];
    const off = switches.find((m) => m[1] === 'Archive upload')?.[2];
    expect(on).not.toBe(off);
  });
});
