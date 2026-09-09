/**
 * T244 — the last 4 admin screens: Scans, Providers, Log, Settings.
 *
 * Same discipline as admin-overview.test.ts: `renderToStaticMarkup`, no
 * jsdom, no `next/navigation` mock — none of these four pages call
 * `usePathname()`.
 *
 * AdminScansPage and AdminLogPage were originally Server Components
 * rendering 5 hardcoded placeholder rows each (this file's own git history
 * has the versions that asserted "acme.com"/"capability.disable" render
 * unconditionally). Both were wired to real GET /admin/scans and GET
 * /admin/audit-log — real data now only arrives after a `useEffect` fetch,
 * which `renderToStaticMarkup` never runs, so — same discipline as
 * admin-users.test.ts — these two now assert only the pre-data shell and
 * the "don't show a real-looking figure before data arrives" guard.
 * `admin-error-paths.test.ts` covers the real refusal path for both.
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
  it('renders the header and table columns before any data arrives', () => {
    const html = render(createElement(AdminScansPage));
    expect(html).toContain('Scans');
    expect(html).toContain('Target');
    expect(html).toContain('Customer');
    expect(html).toContain('Charged');
    expect(html).toContain('Score');
  });

  it('shows no "Load more" control and no fabricated total before any data arrives', () => {
    const html = render(createElement(AdminScansPage));
    expect(html).not.toContain('Load more');
    expect(html).not.toContain('total');
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
  it('renders the header and table columns before any data arrives', () => {
    const html = render(createElement(AdminLogPage));
    expect(html).toContain('Audit log');
    expect(html).toContain('Actor');
    expect(html).toContain('Action');
    expect(html).toContain('Subject');
  });

  it('shows no "Load more" control and no fabricated total before any data arrives', () => {
    const html = render(createElement(AdminLogPage));
    expect(html).not.toContain('Load more');
    expect(html).not.toContain('entries');
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
