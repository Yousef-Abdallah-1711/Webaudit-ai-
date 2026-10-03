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

  it('keeps the four tier border states and the cost rows distinct', () => {
    const grid = render(createElement(TierGrid));
    const tierClasses = [...grid.matchAll(/<div class="([^"]*)"/g)]
      .map((match) => match[1] ?? '')
      .filter((className) => className.includes('flex-col') && className.includes('rounded-card'));

    expect(tierClasses).toHaveLength(4);
    expect(tierClasses.filter((className) => className.includes('border-accent'))).toHaveLength(1);
    expect(tierClasses.filter((className) => className.includes('border-border-default'))).toHaveLength(3);
    expect(grid).toContain('text-[1.125rem] font-bold');
    expect(grid).toContain('font-mono text-[0.8125rem] text-text-secondary');

    const table = render(createElement(CostTable));
    const rowClasses = [...table.matchAll(/<div class="([^"]*)">(?=<span class="type-body !tracking-normal">)/g)].map(
      (match) => match[1] ?? '',
    );
    expect(rowClasses).toHaveLength(4);
    expect(rowClasses[0]).not.toContain('border-t-hairline');
    expect(rowClasses.slice(1).every((className) => className.includes('border-x-0 border-b-0 border-t-hairline'))).toBe(true);
    expect(rowClasses.every((className) => className.includes('flex px-[1.125rem] py-3.5'))).toBe(true);
    expect(table).toContain('ms-auto font-mono text-[0.875rem]');
  });

  it('preserves the original heading, lead, and inherited typography metrics', () => {
    const html = render(createElement(PricingPage));
    expect(html).toContain('class="px-6 pt-[4.5rem] pb-11 text-center"');
    expect(html).toContain('class="m-0 type-display"');
    expect(html).toContain(
      'class="mx-auto mt-[1.125rem] mb-0 max-w-[56ch] type-lead text-text-secondary"',
    );
    expect(html).toContain('class="type-body !tracking-normal"');
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
