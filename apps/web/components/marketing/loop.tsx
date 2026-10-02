import { getTranslations } from 'next-intl/server';
import { REVERIFY_COST } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';

import { cn } from '../../lib/cn';

const styles = {
  //  preserve the component-specific intrinsic value where no configured utility token matches
  wrap: cn('py-[calc(var(--space-16)_+_var(--space-6))] px-6 bg-surface-page'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopH2: cn('mt-3 mx-0 mb-[calc(var(--space-5)_+_var(--space-2))] type-h2'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint at 640px
  loopGrid: cn('grid grid-cols-4 gap-3 max-[640px]:grid-cols-1'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopStep: cn('pt-[calc(var(--space-3)_+_(var(--space-1)_/_2))] border-x-0 border-b-0 border-t-[calc(var(--space-1)_-_(var(--space-1)_/_4))] border-solid border-t-accent'),
  loopNum: cn('font-mono text-xs text-text-strong'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  loopTitle: cn('my-[calc(var(--space-2)_-_(var(--space-1)_/_2))] mx-0 text-[calc(var(--space-4)_+_(var(--space-1)_/_4))] font-semibold'),
  loopDesc: cn('type-small text-text-secondary text-pretty'),
};

type PublicKey = keyof typeof enPublic;

interface WrapProps {
  children?: React.ReactNode;
}

function Wrap({ children }: WrapProps): React.ReactElement {
  return (
    <section id="loop" data-landing-section="loop" className={styles.wrap}>
      <div className={cn('max-w-marketing mx-auto')}>{children}</div>
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
            <div className={styles.loopDesc}>
              {body === 'loop_3d' ? t(body, { reverifyCost: REVERIFY_COST }) : t(body)}
            </div>
          </div>
        ))}
      </div>
    </Wrap>
  );
}
