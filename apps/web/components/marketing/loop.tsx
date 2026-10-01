import { getTranslations } from 'next-intl/server';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';
import containerStyles from './section-container.module.css';
import styles from './loop.module.css';

type PublicKey = keyof typeof enPublic;

interface WrapProps {
  children?: React.ReactNode;
}

function Wrap({ children }: WrapProps): React.ReactElement {
  return (
    <section id="loop" data-landing-section="loop" className={styles.wrap}>
      <div className={containerStyles.container}>{children}</div>
    </section>
  );
}

const LOOP_STEPS: readonly (readonly [string, PublicKey, PublicKey])[] = [
  ['01', 'loop_1t', 'loop_1d'],
  ['02', 'loop_2t', 'loop_2d'],
  ['03', 'loop_3t', 'loop_3d'],
  ['04', 'loop_4t', 'loop_4d'],
];

export async function Loop(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <Wrap>
      <Eyebrow tone="muted">{t('loop_eyebrow')}</Eyebrow>
      <h2 className={styles.loopH2}>{t('loop_h2')}</h2>
      <div className={styles.loopGrid}>
        {LOOP_STEPS.map(([n, title, body]) => (
          <div key={n} className={styles.loopStep}>
            <div dir="ltr" className={styles.loopNum}>
              {n}
            </div>
            <div className={styles.loopTitle}>{t(title)}</div>
            <div className={styles.loopDesc}>{t(body)}</div>
          </div>
        ))}
      </div>
    </Wrap>
  );
}
