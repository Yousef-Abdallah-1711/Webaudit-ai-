/**
 * T192 / T193 — the billing screen and the public pricing page.
 *
 * Same discipline as dashboard-screens.test.ts: `renderToStaticMarkup`, no
 * jsdom. `BillingPage`'s `useEffect` fetch never fires under static render,
 * so this asserts the pre-data shell — which is exactly where FR-078's two
 * distinct credit lifetimes and the always-present refund line have to be
 * legible. `PricingPage` renders `PublicHeader`, which calls `useAuth()`
 * directly (added after this file was first written) -- wrapped in
 * `AuthProvider` the same way `dashboard-shell.test.ts` established.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import BillingPage from '../../app/(dashboard)/billing/page';
import LandingPage from '../../app/[locale]/(public)/LandingPage';
import PricingPage, { TierGrid, CostTable } from '../../app/[locale]/(public)/pricing/PricingPage';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { I18nProvider } from '../../app/theme';

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(
    createElement(I18nProvider, null, createElement(AuthProvider, null, element)),
  );
}

describe('BillingPage', () => {
  it('shows the two credit lifetimes as distinct figures (FR-078)', () => {
    const html = render(createElement(BillingPage));
    expect(html).toContain('Plan credits');
    expect(html).toContain('Purchased credits');
    expect(html).toContain('Expire at renewal');
    expect(html).toContain('Never expire');
    // The two never appear summed into one figure anywhere.
    expect(html).not.toContain('Total credits');
  });

  it('keeps the refund line visible (FR-078)', () => {
    const html = render(createElement(BillingPage));
    expect(html).toContain('You are never charged for our failures');
  });

  it('renders the plan chooser and a top-up control', () => {
    const html = render(createElement(BillingPage));
    expect(html).toContain('Choose a plan');
    expect(html).toContain('Buy credits');
    expect(html).toContain('Retention');
  });
});

describe('PricingPage', () => {
  it('renders all four tiers with Pro marked as the deepest', () => {
    const html = render(createElement(PricingPage));
    for (const name of ['Free', 'Starter', 'Pro', 'Business']) {
      expect(html).toContain(name);
    }
    expect(html).toContain('Most depth');
  });

  it('states the credit-lifetime rule in the lead', () => {
    const html = render(createElement(PricingPage));
    expect(html).toContain('Plan credits expire at renewal');
    expect(html).toContain('never expire');
  });

  it('TierGrid links every CTA to signup and CostTable lists the re-check price', () => {
    const grid = render(createElement(TierGrid));
    expect(grid.match(/href="\/signup"/g) ?? []).toHaveLength(4);
    const table = render(createElement(CostTable));
    expect(table).toContain('Targeted re-check of one issue');
    expect(table).toContain('3 cr');
  });

  it('shows per-area prices that match AREA_COST and the bundled total', () => {
    const landing = render(createElement(LandingPage));
    const visibleText = landing.replace(/<[^>]*>/g, '|').replace(/\|+/g, '|');
    expect(visibleText).toContain('Performance|Core Web Vitals, bundle composition, request patterns|20 cr');
    expect(visibleText).toContain('Security|Headers, TLS, OWASP checks, leaked credentials, dependency CVEs|20 cr');
    expect(visibleText).toContain('Design|Layout, hierarchy and contrast, against your stated brand intent|25 cr');
    expect(visibleText).toContain('Testing|Functional flows driven in a real browser|20 cr');
    expect(visibleText).toContain('Search visibility|Metadata, crawlability, content structure|10 cr');
    expect(landing).toContain('Five areas cost 95 individually against 80 bundled.');

    const table = render(createElement(CostTable));
    expect(table).toContain('10–25 cr');
    expect(table).toContain('80 cr');
  });

  it('does not show a redeemable promo code on the landing page', () => {
    const landing = render(createElement(LandingPage));
    expect(landing).toContain('First audit free — 50 credits');
    expect(landing).not.toContain('START50');
  });
});
