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
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import BillingPage from '../../app/(dashboard)/billing/page';
import PricingPage, { TierGrid, CostTable } from '../../app/[locale]/(public)/pricing/PricingPage';
import { AuthProvider } from '../../components/auth/AuthProvider';
import { I18nProvider } from '../../app/theme';
import publicMessages from '../../messages/en/public.json';

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
    expect(publicMessages.a_perf_d).toBe('Response-header checks for caching and compression');
    expect(publicMessages.a_sec_d).toContain('cookie flags');
    expect(publicMessages.a_sec_d).toContain('known-vulnerable dependencies');
    expect(publicMessages.a_des_d).toContain('broken images');
    expect(publicMessages.a_test_d).toBe('Same-origin broken-link and page-integrity checks');
    expect(publicMessages.a_seo_d).toContain('canonical URL');
    expect(publicMessages.area_cost).toBe('{credits, number} cr');
    expect(publicMessages.areas_note).toContain(
      '{individualCost, number} individually against {fullAuditCost, number} bundled',
    );
    expect(publicMessages.proof_sample_label).toContain('Sample report');

    const table = render(createElement(CostTable));
    expect(table).toContain('10–25 cr');
    expect(table).toContain('80 cr');
  });

  it('does not show a redeemable promo code on the landing page', () => {
    expect(publicMessages.promo).toBe('First audit free — {freeCredits, number} credits');
    expect(publicMessages.promo).not.toContain('START50');
  });
});
