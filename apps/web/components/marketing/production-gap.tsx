import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';
import styles from './production-gap.module.css';

type PublicKey = keyof typeof enPublic;

const PRINCIPLES: readonly (readonly [PublicKey, PublicKey, string])[] = [
  ['gap_1t', 'gap_1d', 'M5 12h14M12 5l7 7-7 7'],
  ['gap_2t', 'gap_2d', 'm5 12 4 4L19 6'],
  ['gap_3t', 'gap_3d', 'M12 3v18m9-9H3'],
];

export async function ProductionGap(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="difference" data-landing-section="difference" className={styles.section}>
      <div className={styles.inner}>
        <div className={styles.intro}>
          <Eyebrow tone="muted">{t('gap_eyebrow')}</Eyebrow>
          <h2 className={styles.heading}>{t('gap_h2')}</h2>
          <p className={styles.lead}>{t('gap_lead')}</p>
        </div>
        <ul className={styles.principles}>
          {PRINCIPLES.map(([title, body, path]) => (
            <li className={styles.principle} key={title}>
              <svg
                className={styles.icon}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d={path} />
              </svg>
              <div>
                <h3 className={styles.title}>{t(title)}</h3>
                <p className={styles.body}>
                  {body === 'gap_2d' ? t(body, { reverifyCost: REVERIFY_COST }) : t(body)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
