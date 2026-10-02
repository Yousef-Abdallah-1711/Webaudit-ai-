import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION } from '@webaudit/config';
import { Button } from '../ui';

import { cn } from '../../lib/cn';

const styles = {
  cta: cn('relative overflow-hidden py-20 px-6 text-center bg-surface-inverse'),
  ctaWash: cn('absolute inset-0 pointer-events-none bg-wash-br'),
  ctaInner: cn('relative'),
  ctaH2: cn('m-0 type-h2  text-text-on-surface-inverse'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint at 640px
  ctaLead: cn('mt-[calc(var(--space-3)_+_(var(--space-1)_/_2))] mx-0 mb-[calc(var(--space-5)_+_var(--space-2))] type-body text-text-on-surface-inverse-muted text-pretty max-[640px]:tracking-normal'),
};

export async function FinalCta(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="final-cta" data-landing-section="final-cta" className={styles.cta}>
      <div className={styles.ctaWash} />
      <div className={cn('max-w-marketing mx-auto', styles.ctaInner)}>
        <h2 className={styles.ctaH2}>{t('cta_h2', { freeCredits: FREE_ALLOCATION })}</h2>
        <p className={styles.ctaLead}>{t('cta_lead')}</p>
        <Button href="/signup">{t('hero_cta')}</Button>
      </div>
    </section>
  );
}
