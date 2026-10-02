import { getTranslations } from 'next-intl/server';
import specialStyles from './ai-development.special.module.css';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  section: cn('py-12 px-6 bg-surface-sunken max-[640px]:py-8 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.8fr)_minmax(0,_1.2fr)] items-center gap-[clamp(var(--space-8),_7vw,_var(--space-16))] max-w-6xl mx-auto max-[1024px]:grid-cols-[minmax(0,_0.75fr)_minmax(0,_1.25fr)] max-[1024px]:gap-8 max-[768px]:grid-cols-[minmax(0,_0.9fr)_minmax(0,_1.1fr)] max-[768px]:gap-5 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heading: cn('max-w-[17ch] m-0 text-text-strong type-h2  text-balance max-[640px]:max-w-[22ch] '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  workflow: cn('min-w-0 ps-6 border-0 border-border-default border-s-hairline border-solid max-[768px]:ps-4 max-[640px]:mt-5 max-[640px]:pt-4 max-[640px]:ps-0 max-[640px]:border-s-0 max-[640px]:border-x-0 max-[640px]:border-b-0 max-[640px]:border-t-hairline'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  context: cn('max-w-[58ch] m-0 text-text-secondary type-body text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  steps: cn('flex items-center gap-3 mt-5 max-[368px]:items-start max-[368px]:flex-col'),
  step: cn('flex items-center gap-2 min-w-0 text-text-primary type-small leading-5 !font-semibold'),
  stepMark: cn('grid flex-none w-8 aspect-square place-items-center border-border-default border-hairline border-solid bg-surface-page text-text-muted font-mono text-[0.75rem]'),
  verifyMark: cn('bg-accent text-text-on-accent'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  connector: cn(specialStyles.connector, 'flex-none text-text-muted type-body-lg max-[368px]:ps-2 max-[368px]:rotate-90'),
};

export async function AiDevelopment(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="ai-development"
      data-landing-section="ai-development"
      className={styles.section}
      aria-labelledby="ai-development-heading"
    >
      <div className={styles.inner}>
        <h2 id="ai-development-heading" className={styles.heading}>
          {t('ai_h2')}
        </h2>
        <div className={styles.workflow}>
          <p className={styles.context}>{t('ai_body')}</p>
          <div className={styles.steps}>
            <div className={styles.step}>
              <span className={styles.stepMark} aria-hidden="true">
                01
              </span>
              <span>{t('ai_build_label')}</span>
            </div>
            <span className={styles.connector} aria-hidden="true">
              →
            </span>
            <div className={styles.step}>
              <span className={cn(styles.stepMark, styles.verifyMark)} aria-hidden="true">
                02
              </span>
              <span>{t('ai_verify_label')}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
