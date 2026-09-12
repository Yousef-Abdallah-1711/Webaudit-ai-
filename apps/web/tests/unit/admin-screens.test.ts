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
  it('renders the live-data shell without fabricated provider rows', () => {
    const html = render(createElement(AdminProvidersPage));
    expect(html).toContain('AI providers');
    expect(html).toContain('Loading provider chain');
    expect(html).toContain('persisted for the next worker deployment');
    expect(html).not.toContain('Anthropic');
  });

  it('does not claim provider health before the live chain arrives', () => {
    const html = render(createElement(AdminProvidersPage));
    expect(html).not.toMatch(/<span[^>]*>(healthy|degraded|enabled|disabled)<\/span>/);
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
  it('renders configuration reference data without pretending switches persist', () => {
    const html = render(createElement(AdminSettingsPage));
    expect(html).toContain('Repository input');
    expect(html).toContain('Archive upload');
    expect(html).toContain('Scan timeout');
    expect(html).toContain('12 months');
    expect(html).toContain('Platform settings are read-only');
    expect(html).not.toContain('Save');
    expect(html).not.toMatch(/aria-label="Repository input"/);
  });
});
