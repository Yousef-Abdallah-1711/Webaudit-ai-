/**
 * T212 — the admin margin screen (`/admin/billing`).
 *
 * Same discipline as `billing-and-pricing.test.ts`: `renderToStaticMarkup`,
 * no jsdom — the page's `useEffect` fetch never fires under static render,
 * so this asserts the pre-data shell. That shell is exactly where the
 * "no fabricated margin percentage" decision has to be legible: the
 * fallback note text (shown before the real `report.note` arrives) must
 * already state the credits-vs-USD-micros distinction, and no percentage
 * sign or "margin %" label may appear anywhere, with or without data.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AdminBillingPage from '../../app/(admin)/admin/billing/page';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(element);
}

describe('AdminBillingPage', () => {
  it('renders the header, stats grid, table, and note card before any data arrives', () => {
    const html = render(createElement(AdminBillingPage));
    expect(html).toContain('Margin');
    expect(html).toContain('Credits recognised');
    expect(html).toContain('Provider cost');
    expect(html).toContain('Capability');
    expect(html).toContain('Why there is no margin percentage here');
  });

  it('never shows a fabricated margin percentage, with or without data', () => {
    const html = render(createElement(AdminBillingPage));
    expect(html).not.toContain('Gross margin');
    expect(html).not.toContain('%');
    expect(html).not.toContain('marginMicros');
    expect(html).not.toContain('marginUsd');
  });

  it('states the credits-vs-USD-micros distinction in the fallback note', () => {
    const html = render(createElement(AdminBillingPage));
    expect(html).toContain('credits');
    expect(html).toContain('USD micros');
  });
});
