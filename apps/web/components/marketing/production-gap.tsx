import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { MarketingSectionHeader } from './section-header';

import { cn } from '../../lib/cn';

const styles = {
  section: cn(
    'bg-surface-ice px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  inner: cn('mx-auto max-w-marketing-evidence'),
  principles: cn(
    'mx-auto grid max-w-marketing-demo grid-cols-3 gap-3 max-marketing-tablet:grid-cols-1',
  ),
  principle: cn(
    'min-h-marketing-evidence-card rounded-marketing-principle border border-solid border-border-marketing bg-surface-marketing-raised py-marketing-principle-padding-y px-marketing-principle-padding-x max-marketing-tablet:min-h-0',
  ),
  icon: cn(
    'grid size-9 place-items-center rounded-control bg-surface-electric-soft font-mono text-sm font-extrabold text-brand-electric',
  ),
  title: cn(
    'mb-0 mt-4 text-marketing-principle-heading font-extrabold text-marketing-primary text-balance',
  ),
  body: cn(
    'mb-0 mt-2 text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
  ),
};

type PublicKey = keyof typeof enPublic;

const PRINCIPLES: readonly (readonly [PublicKey, PublicKey])[] = [
  ['gap_1t', 'gap_1d'],
  ['gap_2t', 'gap_2d'],
  ['gap_3t', 'gap_3d'],
];

export async function ProductionGap(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="difference"
      data-landing-section="difference"
      data-approved-section="evidence"
      className={styles.section}
      aria-labelledby="difference-heading"
    >
      <div className={styles.inner}>
        <MarketingSectionHeader
          id="difference-heading"
          number="02"
          eyebrow={t('gap_eyebrow')}
          title={t('gap_h2')}
          lead={t('gap_lead')}
        />
        <div className={styles.principles}>
          {PRINCIPLES.map(([title, body], index) => (
            <article className={styles.principle} key={title}>
              <span className={styles.icon} aria-hidden="true">
                0{index + 1}
              </span>
              <h3 className={styles.title}>{t(title)}</h3>
              <p className={styles.body}>
                {body === 'gap_2d' ? t(body, { reverifyCost: REVERIFY_COST }) : t(body)}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
