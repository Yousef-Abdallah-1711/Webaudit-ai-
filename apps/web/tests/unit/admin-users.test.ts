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

  it('never shows a fabricated "0 accounts" before the real total is known (adversarial review finding)', () => {
    // A dedicated review of this task found this page was the one admin
    // screen that skipped the "don't show a real-looking figure before
    // data arrives" guard every sibling page already has — a plain
    // `useState(0)` rendered "0 accounts" during loading AND on a genuine
    // 401/403 refusal, indistinguishable from a real empty system. The
    // fix withholds the whole meta line until the count is real.
    const html = render(createElement(AdminUsersPage));
    expect(html).not.toContain('0 accounts');
    expect(html).not.toContain('accounts');
  });
});
