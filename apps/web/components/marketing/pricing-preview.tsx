import { getTranslations } from 'next-intl/server';
import {
  ALL_AREAS,
  AREA_COST,
  FREE_ALLOCATION,
  FULL_AUDIT_COST,
  READINESS_PASS_COST,
  REVERIFY_COST,
  SUM_OF_AREAS,
} from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { cn } from '../../lib/cn';
import { MarketingSectionHeader } from './section-header';

type PublicKey = keyof typeof enPublic;
const AREA_NAMES: Record<(typeof ALL_AREAS)[number], PublicKey> = {
  PERFORMANCE: 'a_perf',
  SECURITY: 'a_sec',
  UI: 'a_des',
  TESTING: 'a_test',
  SEO: 'a_seo',
};

export async function PricingPreview(): Promise<React.ReactElement> {
  const t = await getTranslations('public');
  const highlights = [
    {
      amount: FULL_AUDIT_COST,
      label: t('pricing_preview_full_audit'),
      detail: t('pricing_preview_separate', {
        areaCount: ALL_AREAS.length,
        individualCost: SUM_OF_AREAS,
      }),
    },
    {
      amount: REVERIFY_COST,
      label: t('pricing_preview_recheck'),
      detail: t('pricing_preview_recheck_detail'),
    },
    {
      amount: READINESS_PASS_COST,
      label: t('pricing_cost_readiness_pass'),
      detail: t('pricing_preview_readiness_detail'),
    },
  ];

  return (
    <section
      id="pricing-preview"
      data-landing-section="pricing-preview"
      data-approved-section="pricing"
      className="bg-surface-marketing px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile"
      aria-labelledby="pricing-preview-heading"
    >
      <MarketingSectionHeader
        id="pricing-preview-heading"
        number="08"
        eyebrow={t('pricing_cost_eyebrow')}
        title={t('pricing_preview_heading')}
        lead={t('pricing_preview_lead')}
      />

      <div className="mx-auto max-w-public-marketing rounded-marketing-pricing border border-solid border-border-marketing-pricing bg-surface-marketing-raised p-7 shadow-marketing-pricing max-marketing-mobile:rounded-marketing-pricing-mobile max-marketing-mobile:py-4 max-marketing-mobile:px-marketing-pricing-padding-mobile-x">
        <div className="flex items-center justify-between gap-6 border-x-0 border-t-0 border-b border-solid border-border-marketing pb-5 max-marketing-mobile:items-start">
          <p className="mb-0 max-w-marketing-pricing text-marketing-readiness-copy leading-[1.8] text-marketing-secondary text-pretty">
            {t('pricing_preview_free_copy')}
          </p>
          <p className="m-0 flex-none text-center">
            <strong
              dir="ltr"
              className="block font-mono text-marketing-pricing-total font-black leading-none text-brand-electric"
            >
              {FREE_ALLOCATION}
            </strong>
            <span className="mt-2 block text-marketing-label text-marketing-secondary">
              {t('pricing_preview_credits')}
            </span>
          </p>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-marketing-form-gap max-marketing-mobile:grid-cols-1 max-marketing-mobile:gap-2">
          {highlights.map((item) => (
            <article
              className="rounded-marketing-price-highlight border border-solid border-border-marketing-price-highlight bg-surface-marketing-tag p-4 max-marketing-mobile:grid max-marketing-mobile:grid-cols-[1fr_auto] max-marketing-mobile:items-center max-marketing-mobile:gap-x-2 max-marketing-mobile:gap-y-0.5 max-marketing-mobile:p-marketing-price-highlight-padding-mobile"
              key={item.label}
            >
              <strong
                dir="ltr"
                className="block font-mono text-2xl font-extrabold text-marketing-primary max-marketing-mobile:col-start-2 max-marketing-mobile:row-span-2 max-marketing-mobile:row-start-1 max-marketing-mobile:text-xl"
              >
                {item.amount}
              </strong>
              <span className="mt-1 block text-marketing-label font-bold text-marketing-primary max-marketing-mobile:mt-0">
                {item.label}
              </span>
              <p className="mb-0 mt-2 text-marketing-micro leading-[1.6] text-marketing-secondary max-marketing-mobile:mt-px">
                {item.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-4 grid grid-cols-5 overflow-hidden rounded-marketing-pricing-table border border-solid border-border-marketing max-marketing-mobile:grid-cols-3">
          {ALL_AREAS.map((area, index) => (
            <div
              className={cn(
                'p-3 text-center max-marketing-mobile:py-marketing-cost-cell-mobile max-marketing-mobile:px-1',
                index > 0 && 'border-s border-solid border-border-marketing',
                index > 2 &&
                  'max-marketing-mobile:border-t max-marketing-mobile:border-solid max-marketing-mobile:border-border-marketing',
              )}
              key={area}
            >
              <strong
                dir="ltr"
                className="block font-mono text-base font-extrabold text-marketing-primary"
              >
                {AREA_COST[area]}
              </strong>
              <span className="mt-1 block text-marketing-micro text-marketing-muted">
                {t(AREA_NAMES[area])}
              </span>
            </div>
          ))}
        </div>
        <p className="mb-0 mt-4 text-marketing-micro leading-[1.7] text-marketing-muted">
          {t('pricing_preview_cash_note')}
        </p>
        <a
          className="mt-4 inline-flex min-h-control items-center gap-2 font-bold text-brand-electric underline decoration-border-marketing underline-offset-4 transition-colors motion-reduce:transition-none hover:text-brand-electric-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric"
          href="/pricing"
        >
          {t('pricing_preview_details')}{' '}
          <span aria-hidden="true" className="inline-block rtl:-scale-x-100">
            ↗
          </span>
        </a>
      </div>
    </section>
  );
}
