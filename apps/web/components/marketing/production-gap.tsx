import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-raised max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.9fr)_minmax(0,_1.1fr)] items-start gap-[clamp(var(--space-8),_8vw,_var(--space-16))] max-w-marketing mx-auto max-[768px]:grid-cols-[minmax(0,_0.8fr)_minmax(0,_1.2fr)] max-[768px]:gap-8 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px
  intro: cn('sticky top-8 max-[768px]:static'),
  heading: cn('mt-3 mb-0 type-h2  text-balance '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  lead: cn('mt-4 mb-0 text-text-secondary type-body-lg text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  principles: cn('m-0 p-0 list-none max-[640px]:mt-6'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it
  principle: cn('grid grid-cols-[auto_minmax(0,_1fr)] gap-4 py-5 border-x-0 border-b-0 border-border-default border-t-hairline border-solid last:border-b-hairline max-[640px]:gap-3 max-[640px]:py-4'),
  icon: cn('w-6 h-6 text-accent'),
  title: cn('m-0 text-text-strong type-body-bold text-balance'),
  body: cn('mt-2 mb-0 text-text-secondary type-small text-pretty'),
};

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
