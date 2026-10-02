/* Wave 5's original section design is documented in design/screen-map.md and research.md R20. */
import { getTranslations } from 'next-intl/server';
import { ALL_AREAS, AREA_COST, FULL_AUDIT_COST, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-raised max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  inner: cn('max-w-6xl mx-auto'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px
  intro: cn('flex items-baseline justify-between gap-8 pb-6 max-[1024px]:gap-6 max-[768px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heading: cn('max-w-[14ch] m-0 text-text-strong type-h2  text-balance max-[640px]:max-w-[18ch] '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px; preserve the component-specific intrinsic value where no configured utility token matches
  lead: cn('max-w-[38rem] m-0 text-text-secondary type-body text-pretty max-[768px]:mt-3 max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px, 368px
  freeLine: cn('flex items-center justify-between gap-6 py-5 border-x-0 border-border-default border-hairline border-solid max-[640px]:items-start max-[368px]:flex-wrap max-[368px]:gap-2'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  freeCopy: cn('m-0 text-text-primary type-body-bold max-[640px]:max-w-[24ch]'),
  freeAmount: cn('flex items-baseline gap-2 flex-none m-0 text-text-strong [&>strong]:text-accent [&>strong]:type-h3 [&>strong]:tabular-nums [&>span]:text-text-secondary [&>span]:type-small'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  costs: cn('flex items-baseline justify-between flex-wrap gap-y-5 gap-x-8 py-5 max-[640px]:items-start max-[640px]:flex-col max-[640px]:gap-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  bundleMath: cn('flex items-baseline flex-wrap gap-2 m-0 text-text-secondary type-small max-[368px]:gap-x-1'),
  recheck: cn('flex items-baseline flex-wrap gap-2 m-0 text-text-secondary type-small'),
  costNumber: cn('text-text-strong type-card-title tabular-nums'),
  arrow: cn('px-1 text-accent type-body-bold'),
  detailsLink: cn('inline-flex items-center gap-2 min-h-control text-text-primary type-small leading-5 !font-bold underline decoration-border-default underline-offset-1 hover:text-accent-hover hover:decoration-current focus-visible:outline focus-visible:outline-hairline focus-visible:outline-focus-ring focus-visible:outline-offset-1'),
};

const INDIVIDUAL_AREAS_COST = Object.values(AREA_COST).reduce((total, cost) => total + cost, 0);

export async function PricingPreview(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="pricing-preview"
      data-landing-section="pricing-preview"
      className={styles.section}
      aria-labelledby="pricing-preview-heading"
    >
      <div className={styles.inner}>
        <div className={styles.intro}>
          <h2 id="pricing-preview-heading" className={styles.heading}>
            {t('pricing_preview_heading')}
          </h2>
          <p className={styles.lead}>{t('pricing_preview_lead')}</p>
        </div>

        <div className={styles.freeLine}>
          <p className={styles.freeCopy}>{t('pricing_preview_free_copy')}</p>
          <p className={styles.freeAmount}>
            <strong>{FREE_ALLOCATION}</strong>
            <span>{t('pricing_preview_credits')}</span>
          </p>
        </div>

        <div className={styles.costs}>
          <p className={styles.bundleMath}>
            <span className={styles.costNumber} dir="ltr">{INDIVIDUAL_AREAS_COST}</span>
            <span>{t('pricing_preview_separate', { areaCount: ALL_AREAS.length })}</span>
            <span className={styles.arrow} aria-hidden="true">→</span>
            <span className={styles.costNumber} dir="ltr">{FULL_AUDIT_COST}</span>
            <span>{t('pricing_preview_bundle', { areaCount: ALL_AREAS.length })}</span>
          </p>
          <p className={styles.recheck}>
            <span className={styles.costNumber} dir="ltr">{REVERIFY_COST}</span>
            <span>{t('pricing_preview_recheck')}</span>
          </p>
        </div>

        <a className={styles.detailsLink} href="/pricing">
          {t('pricing_preview_details')}
          <span aria-hidden="true">↗</span>
        </a>
      </div>
    </section>
  );
}
