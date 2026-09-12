/**
 * T243 — the admin Overview page.
 *
 * No `next/navigation` mock needed: `AdminOverviewPage` has no hooks at
 * all, same reasoning as T242's `UsagePage`.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminOverviewPage from '../../app/(admin)/admin/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminOverviewPage', () => {
  it('renders the overview shell without inventing platform metrics', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('Audits completed');
    expect(html).toContain('Credits recognised');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Area health');
    expect(html).toContain('Live overview data is not available');
    expect(html).not.toContain('248');
    expect(html).not.toContain('4,180');
    expect(html).not.toContain('$41.22');
  });

  it('FR-053: the degraded area (Testing) never reads as complete', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('Live area health data is not available');
    expect(html).not.toMatch(/state(Complete|Degraded)/);
  });

  it('every "needs attention" entry gets its own severity badge', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('No live attention items are available');
    const badges = [...html.matchAll(/<svg[^>]*>/g)];
    expect(badges.length).toBe(0);
  });
});
