import { getTranslations } from 'next-intl/server';
import { AREA_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';
import containerStyles from './section-container.module.css';
import styles from './checks.module.css';

type PublicKey = keyof typeof enPublic;

const AREAS: readonly (readonly [PublicKey, PublicKey, number, string])[] = [
  ['a_perf', 'a_perf_d', AREA_COST.PERFORMANCE, styles.performance!],
  ['a_sec', 'a_sec_d', AREA_COST.SECURITY, styles.security!],
  ['a_des', 'a_des_d', AREA_COST.UI, styles.design!],
  ['a_test', 'a_test_d', AREA_COST.TESTING, styles.testing!],
  ['a_seo', 'a_seo_d', AREA_COST.SEO, styles.seo!],
];

export async function Checks(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="areas" data-landing-section="areas" className={styles.section}>
      <div className={containerStyles.container}>
        <header className={styles.header}>
          <Eyebrow tone="muted">{t('areas_eyebrow')}</Eyebrow>
          <h2 className={styles.heading}>{t('areas_h2')}</h2>
          <p className={styles.intro}>{t('areas_intro')}</p>
        </header>
        <ul className={styles.bento}>
          {AREAS.map(([name, description, credits, layout]) => (
            <li className={`${styles.area} ${layout}`} key={name}>
              <div className={styles.areaHeading}>
                <h3 className={styles.name}>{t(name)}</h3>
                <span dir="ltr" className={styles.cost}>
                  {t('area_cost', { credits })}
                </span>
              </div>
              <p className={styles.description}>{t(description)}</p>
            </li>
          ))}
        </ul>
        <p className={styles.note}>{t('areas_note')}</p>
      </div>
    </section>
  );
}
