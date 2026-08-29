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
  it('renders all 4 stat cards and both "needs attention" / "area health" panels', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('Audits completed');
    expect(html).toContain('248');
    expect(html).toContain('Credits recognised');
    expect(html).toContain('Needs attention');
    expect(html).toContain('Area health');
  });

  it('FR-053: the degraded area (Testing) never reads as complete', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('playwright-runner disabled by operator');
    // Every complete area carries an issue count; the degraded one carries
    // a detail string instead — the two must not collapse into one class.
    const stateClasses = [...html.matchAll(/class="[^"]*state(Complete|Degraded)[^"]*"/g)].map(
      (m) => m[1],
    );
    expect(stateClasses).toContain('Complete');
    expect(stateClasses).toContain('Degraded');
  });

  it('every "needs attention" entry gets its own severity badge', () => {
    const html = render(createElement(AdminOverviewPage));
    expect(html).toContain('openai adapter degraded');
    expect(html).toContain('playwright-runner disabled');
    expect(html).toContain('sandbox-runner unavailable');
    const badges = [...html.matchAll(/<svg[^>]*>/g)];
    expect(badges.length).toBeGreaterThanOrEqual(3);
  });
});
