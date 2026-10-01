import { getTranslations } from 'next-intl/server';
import { Button, StatRow, TwoToneHeading } from '../ui';
import containerStyles from './section-container.module.css';
import styles from './hero.module.css';

export async function Hero(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="hero" data-landing-section="hero" className={styles.hero}>
      <div className={containerStyles.container}>
        <TwoToneHeading lead={t('hero_lead')} accent={t('hero_accent')} />
        <p className={styles.heroSub}>{t('hero_sub')}</p>
        <div className={styles.heroAction}>
          <div className={styles.urlExample}>
            <span dir="ltr" className={styles.urlExampleValue}>
              https://{t('url_ph')}
            </span>
            <span className={styles.urlExampleCaption}>{t('hero_url_example_label')}</span>
          </div>
          <Button href="/signup">{t('hero_cta')}</Button>
        </div>
        <div className={styles.heroStats}>
          <StatRow
            align="center"
            items={[
              { value: '50', label: t('stat_credits') },
              { value: '5', label: t('stat_areas') },
              { value: '3', label: t('stat_recheck') },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
