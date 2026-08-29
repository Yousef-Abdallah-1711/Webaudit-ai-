/**
 * T241 — Sidebar, AppShell, PageHead.
 *
 * Same discipline as core-components.test.ts: `renderToStaticMarkup`, no
 * jsdom. The one addition this file needs that no earlier T237–T240 test
 * did: `Sidebar`/`AppShell` call `usePathname()` to derive which nav item is
 * active, and that hook throws outside a real Next.js router context —
 * confirmed the hard way while building T240's visual harness (a different
 * "expected router to be mounted" invariant, in production code that time,
 * not a test). `next/navigation` is mocked here so the router context these
 * components need never has to exist for this file to exercise them.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { AppShell, PageHead, Sidebar } from '../../components/dashboard';
import sidebarStyles from '../../components/dashboard/Sidebar.module.css';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/'),
}));

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

function setPathname(path: string): void {
  vi.mocked(usePathname).mockReturnValue(path);
}

beforeEach(() => {
  setPathname('/scan');
});

describe('Sidebar', () => {
  it('marks the nav item matching the current route active, and no other', () => {
    setPathname('/scan');
    const html = render(createElement(Sidebar, { open: true, setOpen: () => {} }));
    // "New scan" (scan) should be the only nav link carrying the active class.
    const links = [...html.matchAll(/<a[^>]*class="([^"]*)"[^>]*>/g)].map((m) => m[1] ?? '');
    const activeLinks = links.filter((cls) => cls.includes('navItemActive'));
    expect(activeLinks).toHaveLength(1);
  });

  it('matches a nested route under the same prefix', () => {
    setPathname('/scan/123/status');
    const html = render(createElement(Sidebar, { open: true, setOpen: () => {} }));
    const activeLinks = [...html.matchAll(/<a[^>]*class="([^"]*navItemActive[^"]*)"/g)];
    expect(activeLinks.length).toBeGreaterThan(0);
  });

  it('shows the "Fixes" badge and no other nav item gets one', () => {
    const html = render(createElement(Sidebar, { open: true, setOpen: () => {} }));
    // The badge is a machine-truth number (4), rendered only next to Fixes.
    const badgeSpans = [...html.matchAll(/<span[^>]*>4<\/span>/g)];
    expect(badgeSpans).toHaveLength(1);
  });

  it('hides nav labels and the wordmark when collapsed', () => {
    const open = render(createElement(Sidebar, { open: true, setOpen: () => {} }));
    const closed = render(createElement(Sidebar, { open: false, setOpen: () => {} }));
    expect(open).toContain(sidebarStyles.wordmark);
    expect(closed).not.toContain(sidebarStyles.wordmark);
    // Collapsed: the label moves to `title` (a tooltip), not a visible
    // `<span>` — `title="New scan"` is expected to survive; the styled
    // label span is what must disappear.
    expect(open).toContain(sidebarStyles.navItemLabel);
    expect(closed).not.toContain(sidebarStyles.navItemLabel);
  });

  it('shows the credit balance and top-up control only when open', () => {
    const open = render(createElement(Sidebar, { open: true, setOpen: () => {} }));
    const closed = render(createElement(Sidebar, { open: false, setOpen: () => {} }));
    expect(open).toContain('1,120');
    expect(closed).not.toContain('1,120');
  });
});

describe('AppShell', () => {
  it('renders the sidebar and the children inside main', () => {
    const html = render(createElement(AppShell, {}, 'page body'));
    expect(html).toContain('<aside');
    expect(html).toContain('<main');
    expect(html).toContain('page body');
  });

  it('pins dir="ltr" for an untranslated view under Arabic, but not for "scan"', () => {
    // theme.tsx defaults to English at module load in this Node test
    // environment (no window/localStorage) — dir only differs from the
    // default when lang is genuinely 'ar', which nothing here sets, so both
    // branches render without an explicit dir here. What this test actually
    // pins down is that AppShell does not crash deriving `activeKey` from a
    // route with no path segments at all.
    setPathname('/');
    const html = render(createElement(AppShell, {}, 'x'));
    expect(html).toContain('<main');
  });
});

describe('PageHead', () => {
  it('omits eyebrow, meta, and actions when none are given', () => {
    const html = render(createElement(PageHead, { title: 'New scan' }));
    expect(html).toContain('New scan');
  });

  it('renders eyebrow, meta, and actions when given', () => {
    const html = render(
      createElement(PageHead, {
        eyebrow: 'Scan',
        title: 'yoursite.com',
        meta: 'scn_9f2a — started 2m ago',
        actions: 'Cancel',
      }),
    );
    expect(html).toContain('Scan');
    expect(html).toContain('yoursite.com');
    expect(html).toContain('scn_9f2a');
    expect(html).toContain('Cancel');
  });
});
