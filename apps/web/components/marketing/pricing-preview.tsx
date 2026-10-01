/* Wave 5's original section design is documented in design/screen-map.md and research.md R20. */
import { getTranslations } from 'next-intl/server';
import { ALL_AREAS, AREA_COST, FULL_AUDIT_COST, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';
import styles from './pricing-preview.module.css';

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
