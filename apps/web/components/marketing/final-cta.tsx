import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION } from '@webaudit/config';
import { Button } from '../ui';
import containerStyles from './section-container.module.css';
import styles from './final-cta.module.css';

export async function FinalCta(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="final-cta" data-landing-section="final-cta" className={styles.cta}>
      <div className={styles.ctaWash} />
      <div className={`${containerStyles.container} ${styles.ctaInner}`}>
        <h2 className={styles.ctaH2}>{t('cta_h2', { freeCredits: FREE_ALLOCATION })}</h2>
        <p className={styles.ctaLead}>{t('cta_lead')}</p>
        <Button href="/signup">{t('hero_cta')}</Button>
      </div>
    </section>
  );
}
