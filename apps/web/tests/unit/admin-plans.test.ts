/**
 * T215 — the Plans admin screen (`/admin/plans`).
 *
 * Same discipline as admin-billing.test.ts: `renderToStaticMarkup`, no
 * jsdom — the page's `useEffect` fetch never fires under static render, so
 * this only asserts the pre-data shell: the header, table columns, and the
 * three explanatory cards.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminPlansPage from '../../app/(admin)/admin/plans/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminPlansPage', () => {
  it('renders the header, table columns, and the explanatory cards before any data arrives', () => {
    const html = render(createElement(AdminPlansPage));
    expect(html).toContain('Plans');
    expect(html).toContain('Entitlements');
    expect(html).toContain('Concurrent');
    expect(html).toContain('Retention');
    expect(html).toContain('New plan');
    expect(html).toContain('Credit schedule');
    expect(html).toContain('Two credit lifetimes');
    expect(html).toContain('Top-ups');
  });

  it('never shows a fabricated price column', () => {
    const html = render(createElement(AdminPlansPage));
    expect(html).not.toContain('Price');
  });
});
