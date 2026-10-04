import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';

import { cn } from '../../lib/cn';

const styles = {
  //  preserve the component-specific intrinsic value where no configured utility token matches
  wrap: cn(
    'bg-surface-marketing px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopH2: cn(
    'mx-auto mb-9 mt-3 max-w-marketing-section text-center text-marketing-h2 leading-marketing-h2 font-black tracking-[-0.03em] text-marketing-primary text-balance',
  ),
  loopGrid: cn(
    'mx-auto grid max-w-public-marketing grid-cols-4 gap-3 max-marketing-tablet:grid-cols-2 max-marketing-mobile:grid-cols-1',
  ),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopStep: cn(
    'relative min-h-marketing-workflow-card rounded-marketing-workflow border border-solid border-border-marketing bg-surface-marketing-raised py-marketing-workflow-padding-y px-marketing-workflow-padding-x max-marketing-mobile:min-h-0 max-marketing-mobile:py-4 max-marketing-mobile:px-4',
  ),
  loopNum: cn(
    'flex size-8 items-center justify-center rounded-full bg-surface-electric-soft font-mono text-marketing-label font-extrabold text-brand-electric',
  ),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopTitle: cn('mb-0 mt-5 text-marketing-workflow-heading font-extrabold text-marketing-primary'),
  loopDesc: cn(
    'mb-0 mt-2 text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
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
    >
      <div className={cn('mx-auto max-w-public-marketing')}>{children}</div>
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
      <p className="mb-0 text-marketing-muted text-marketing-label font-extrabold">
        {t('loop_eyebrow')}
      </p>
      <h2 className={styles.loopH2}>{t('loop_h2')}</h2>
      <div className={styles.loopGrid}>
        {LOOP_STEPS.map(([n, title, body]) => (
          <article key={n} className={styles.loopStep}>
            <div dir="ltr" className={styles.loopNum}>
              {n}
            </div>
            <h3 className={styles.loopTitle}>{t(title)}</h3>
            <p className={styles.loopDesc}>
              {body === 'loop_3d' ? t(body, { reverifyCost: REVERIFY_COST }) : t(body)}
            </p>
          </article>
        ))}
      </div>
    </Wrap>
  );
}
