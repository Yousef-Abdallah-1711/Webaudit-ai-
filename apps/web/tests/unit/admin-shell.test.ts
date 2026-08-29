/**
 * T243 — AdminShell, AHead, Table, Stat.
 *
 * Same discipline as dashboard-shell.test.ts: `renderToStaticMarkup`, no
 * jsdom, `next/navigation` mocked since `AdminShell`'s sidebar calls
 * `usePathname()` to derive the active nav item.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { usePathname } from 'next/navigation';
import { AdminShell, AHead, Stat, Table } from '../../components/admin';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/admin'),
}));

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminShell', () => {
  it('renders the operator chip, the top-bar identity, and the children', () => {
    const html = render(createElement(AdminShell, {}, 'page body'));
    expect(html).toContain('operator');
    expect(html).toContain('khalid@webaudit.ai');
    expect(html).toContain('7 workers');
    expect(html).toContain('page body');
  });

  it('marks the current route active in the sidebar', () => {
    vi.mocked(usePathname).mockReturnValue('/admin/queue');
    const html = render(createElement(AdminShell, {}, 'x'));
    // Only "Queue" should carry the active class for this route.
    const activeLinks = [...html.matchAll(/<a[^>]*class="([^"]*navItemActive[^"]*)"/g)];
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]?.[0]).toContain('href="/admin/queue"');
  });
});

describe('AHead', () => {
  it('always renders the eyebrow — unlike the customer PageHead, it is not optional', () => {
    const html = render(createElement(AHead, { eyebrow: 'Platform', title: 'Overview' }));
    expect(html).toContain('Platform');
    expect(html).toContain('Overview');
  });
});

describe('Table', () => {
  it('renders one header cell per column and one row per data row', () => {
    const html = render(
      createElement(Table, {
        cols: [
          { label: 'Scan', width: 120 },
          { label: 'Target', width: '1fr' },
        ],
        rows: [
          ['4f21a8c9', 'acme.com'],
          ['9c02de11', 'shopfront.io'],
        ],
      }),
    );
    expect(html).toContain('Scan');
    expect(html).toContain('Target');
    expect(html).toContain('acme.com');
    expect(html).toContain('shopfront.io');
  });

  it('renders zero rows without crashing', () => {
    const html = render(
      createElement(Table, { cols: [{ label: 'Scan', width: '1fr' }], rows: [] }),
    );
    expect(html).toContain('Scan');
  });
});

describe('Stat', () => {
  it('omits the sub line when none is given, and applies a custom tone when given', () => {
    const withoutSub = render(createElement(Stat, { label: 'Queue depth', value: '3' }));
    const withTone = render(
      createElement(Stat, { label: 'Gross margin', value: '78%', tone: 'var(--sev-resolved)' }),
    );
    expect(withoutSub).toContain('3');
    expect(withTone).toContain('color:var(--sev-resolved)');
  });
});
