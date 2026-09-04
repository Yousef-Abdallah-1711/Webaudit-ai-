/**
 * T215 — the Users admin screen (`/admin/users`).
 *
 * Same discipline as admin-billing.test.ts: `renderToStaticMarkup`, no
 * jsdom — the page's `useEffect` fetch never fires under static render, so
 * this only asserts the pre-data shell: the header and the table columns.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminUsersPage from '../../app/(admin)/admin/users/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminUsersPage', () => {
  it('renders the header and table columns before any data arrives', () => {
    const html = render(createElement(AdminUsersPage));
    expect(html).toContain('Users');
    expect(html).toContain('Email');
    expect(html).toContain('Plan');
    expect(html).toContain('Plan credits');
    expect(html).toContain('Purchased');
    expect(html).toContain('State');
    expect(html).toContain('Created');
  });

  it('shows no "Load more" control and no fabricated Audits/Renews columns before any data arrives', () => {
    const html = render(createElement(AdminUsersPage));
    expect(html).not.toContain('Load more');
    expect(html).not.toContain('Audits');
    expect(html).not.toContain('Renews');
  });
});
