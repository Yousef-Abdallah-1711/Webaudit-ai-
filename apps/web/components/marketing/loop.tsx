import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';

import { cn } from '../../lib/cn';
import { MarketingSectionHeader } from './section-header';

const styles = {
  //  preserve the component-specific intrinsic value where no configured utility token matches
  wrap: cn(
    'bg-surface-marketing px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  loopGrid: cn(
    'mx-auto grid max-w-public-marketing grid-cols-4 gap-3 max-marketing-tablet:grid-cols-2 max-marketing-mobile:grid-cols-1 max-marketing-mobile:!grid-cols-1',
  ),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopStep: cn(
    'relative min-h-marketing-workflow-card rounded-marketing-workflow border border-solid border-border-marketing bg-surface-marketing-raised py-marketing-workflow-padding-y px-marketing-workflow-padding-x max-marketing-mobile:min-h-0 max-marketing-mobile:px-4 max-marketing-mobile:pb-12 max-marketing-mobile:pt-4',
  ),
  stepHead: cn('flex items-center justify-between text-marketing-muted text-marketing-label font-bold'),
  loopSymbol: cn(
    'grid size-8 place-items-center rounded-full bg-surface-electric-soft font-mono text-sm font-bold text-brand-electric',
  ),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopTitle: cn('mb-0 mt-5 text-marketing-workflow-heading font-extrabold text-marketing-primary'),
  loopDesc: cn(
    'mb-0 mt-2 text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
  ),
  loopCaption: cn(
    'absolute end-5 bottom-4 mb-0 text-marketing-muted text-marketing-description leading-marketing-description text-start max-marketing-mobile:end-4 max-marketing-mobile:bottom-3',
  ),
};

type PublicKey = keyof typeof enPublic;

interface WrapProps {
  children?: React.ReactNode;
}

function Wrap({ children }: WrapProps): React.ReactElement {
  return (
    <section
      id="loop"
      data-landing-section="loop"
      data-approved-section="workflow"
      className={styles.wrap}
      aria-labelledby="loop-heading"
    >
      <div className={cn('mx-auto max-w-public-marketing')}>{children}</div>
    </section>
  );
}

const LOOP_STEPS: readonly (readonly [string, string, PublicKey, PublicKey, PublicKey])[] = [
  ['01', '↗', 'loop_1t', 'loop_1d', 'loop_1_caption'],
  ['02', '≡', 'loop_2t', 'loop_2d', 'loop_2_caption'],
  ['03', '⌘', 'loop_3t', 'loop_3d', 'loop_3_caption'],
  ['04', '✓', 'loop_4t', 'loop_4d', 'loop_4_caption'],
];

export async function Loop(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <Wrap>
      <MarketingSectionHeader
        id="loop-heading"
        number="03"
        eyebrow={t('loop_eyebrow')}
        title={t('loop_h2')}
        lead={t('loop_intro')}
      />
      <div className={styles.loopGrid}>
        {LOOP_STEPS.map(([n, symbol, title, body, caption]) => (
          <article key={n} className={styles.loopStep}>
            <div className={styles.stepHead}>
              <span dir="ltr">{n}</span>
              <span aria-hidden="true" className={styles.loopSymbol}>
                {symbol}
              </span>
            </div>
            <h3 className={styles.loopTitle}>{t(title)}</h3>
            <p className={styles.loopDesc}>
              {body === 'loop_3d' ? t(body, { reverifyCost: REVERIFY_COST }) : t(body)}
            </p>
            <p className={styles.loopCaption}>
              {caption === 'loop_3_caption'
                ? t(caption, { reverifyCost: REVERIFY_COST })
                : t(caption)}
            </p>
          </article>
        ))}
      </div>
    </Wrap>
  );
}
