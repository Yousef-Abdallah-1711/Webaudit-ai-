'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ALL_AREAS, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';
import { Button } from '../ui';
import { storeHeroScanUrl } from '../../lib/hero-scan-handoff';
import { cn } from '../../lib/cn';

const styles = {
  section: cn('w-full'),
  layout: cn(
    // eslint-disable-next-line no-restricted-syntax -- retain H15's measured inset and tablet stacking breakpoint via semantic spacing utilities
    'relative isolate mx-auto grid min-h-landing-hero max-w-landing-hero grid-cols-landing-hero items-center gap-x-10 rounded-landing-canvas bg-surface-marketing-dark px-landing-inset-x py-landing-inset-y text-text-on-accent max-[1024px]:min-h-0 max-[1024px]:grid-cols-1 max-[1024px]:gap-y-0 max-[1024px]:px-6 max-[1024px]:py-10 max-[640px]:px-4 max-[640px]:py-7',
  ),
  copy: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the tablet stacking breakpoint from the approved H15 mobile adaptation
    'relative z-10 col-start-1 row-start-1 min-w-0 translate-y-[var(--offset-landing-copy-y)] max-[1024px]:col-start-1 max-[1024px]:row-start-1 max-[1024px]:translate-y-0',
  ),
  heading: cn(
    'm-0 max-w-landing-copy text-[length:var(--type-landing-title)] leading-landing-title !font-bold text-balance tracking-tight',
  ),
  headingClause: cn('block'),
  supportingCopy: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the established 640px mobile typography breakpoint
    'mt-4 mb-0 max-w-landing-copy opacity-80 text-pretty max-[640px]:mt-3 max-[640px]:tracking-normal',
  ),
  visual: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve H15's measured tablet desktop-to-mobile composition breakpoint
    'z-10 col-start-2 row-span-2 row-start-1 flex min-w-0 items-center self-stretch max-[1024px]:relative max-[1024px]:col-start-1 max-[1024px]:row-span-1 max-[1024px]:row-start-2 max-[1024px]:w-full max-[1024px]:pt-16',
  ),
  core: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve H15's measured core position and responsive placement
    'pointer-events-none absolute z-0 top-landing-core w-landing-core h-landing-core rounded-full bg-gradient-brand-subtle max-[1024px]:top-0 max-[1024px]:left-1/2 max-[1024px]:right-auto max-[1024px]:-translate-x-1/2 max-[1024px]:w-44 max-[1024px]:h-44',
  ),
  scanner: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve H15's tablet and 640px scanner layout cutoffs
    'relative z-10 w-full max-w-landing-scanner min-w-0 rounded-landing-scanner bg-surface-raised p-6 text-surface-marketing-dark shadow-float max-[1024px]:mx-auto max-[1024px]:max-w-xl max-[1024px]:translate-x-0 max-[640px]:p-5',
  ),
  // eslint-disable-next-line no-restricted-syntax -- preserve the scanner's 640px mobile spacing adjustment
  scannerHeader: cn('mb-landing-scanner-gap flex items-center justify-between gap-4 max-[640px]:mb-4'),
  scannerTitle: cn('m-0 text-[length:var(--type-landing-scanner-title)] leading-[normal] font-extrabold'),
  scannerSignal: cn(
    'inline-flex flex-none items-center gap-2 text-xs text-surface-marketing-dark',
  ),
  signalDot: cn('size-2 rounded-full bg-accent'),
  fieldLabel: cn('sr-only'),
  form: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 640px stacked control breakpoint and input/button tracks
    'grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-2.5 max-[640px]:grid-cols-1',
  ),
  input: cn(
    'box-border h-landing-control min-w-0 w-full rounded-control border border-solid !border-hairline border-border-control bg-surface-page px-landing-input-x font-mono text-[length:var(--type-landing-control)] text-surface-marketing-dark placeholder:text-text-secondary focus-visible:outline focus-visible:outline-hairline focus-visible:outline-focus-ring focus-visible:outline-offset-1',
  ),
  button: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 640px full-width mobile action and H15 button inset
    'h-landing-control px-landing-control-x text-[length:var(--type-landing-control)] max-[640px]:h-12 max-[640px]:w-full',
  ),
  stats: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve H15's tablet evidence-rail breakpoint
    'relative z-10 col-start-1 row-start-2 mt-6 flex w-full max-w-full gap-10 text-right max-[1024px]:col-start-1 max-[1024px]:row-start-3 max-[1024px]:mt-6 max-[1024px]:justify-between max-[640px]:gap-3',
  ),
  stat: cn('min-w-0'),
  statValue: cn('block text-[length:var(--type-landing-stat-value)] leading-[normal] !font-bold text-text-on-accent'),
  statLabel: cn('mt-1 block text-[length:var(--type-landing-stat-label)] leading-[normal] text-text-on-accent opacity-75 text-pretty'),
} as const;

export function Hero(): React.ReactElement {
  const t = useTranslations('public');
  const locale = useLocale();
  const [url, setUrl] = useState('');

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    storeHeroScanUrl(url);
    window.location.assign('/signup');
  }

  return (
    <section id="hero" data-landing-section="hero" className={styles.section}>
      <div className={styles.layout}>
        <div className={cn(styles.copy, locale === 'en' && 'max-w-md')}>
          <h1 className={styles.heading}>
            <span className={styles.headingClause}>{t('hero_lead')}</span>
            <span className={cn(styles.headingClause, 'text-accent')}>{t('hero_accent')}</span>
          </h1>
          <p
            className={cn(
              styles.supportingCopy,
              locale === 'ar'
                // eslint-disable-next-line no-restricted-syntax -- preserve the Arabic support-copy 640px typography breakpoint
                ? 'text-[length:var(--type-landing-copy)] leading-landing-copy max-[640px]:type-body'
                : 'type-body',
            )}
          >
            {t('hero_sub')}
          </p>
        </div>

        <div className={styles.visual}>
          <div
            aria-hidden="true"
            className={cn(
              styles.core,
              locale === 'ar'
                // eslint-disable-next-line no-restricted-syntax -- preserve H15's 1024px responsive core alignment
                ? 'left-[var(--offset-landing-core-inline)] max-[1024px]:left-1/2'
                // eslint-disable-next-line no-restricted-syntax -- mirror the core for English while retaining the responsive center position
                : 'right-[var(--offset-landing-core-inline)] max-[1024px]:right-auto max-[1024px]:left-1/2',
            )}
          />
          <div
            className={cn(
              styles.scanner,
              locale === 'ar'
                // eslint-disable-next-line no-restricted-syntax -- retain H15's scanner overlap at the Arabic core
                ? 'translate-x-[var(--offset-landing-scanner)] max-[1024px]:translate-x-0'
                // eslint-disable-next-line no-restricted-syntax -- mirror scanner overlap into the English core
                : '-translate-x-[var(--offset-landing-scanner)] max-[1024px]:translate-x-0',
            )}
          >
            <div className={styles.scannerHeader}>
              <p className={styles.scannerTitle}>{t('hero_cta')}</p>
              <span className={styles.scannerSignal}>
                <span aria-hidden="true" className={styles.signalDot} />
                <span className="opacity-70" dir="ltr">HTTPS</span>
              </span>
            </div>
            <form action="/signup" onSubmit={handleSubmit}>
              <label htmlFor="hero-url" className={styles.fieldLabel}>
                {t('hero_url_example_label')}
              </label>
              <div className={styles.form}>
                <input
                  id="hero-url"
                  type="text"
                  inputMode="url"
                  name="url"
                  autoComplete="url"
                  dir="ltr"
                  value={url}
                  onChange={(event) => {
                    setUrl(event.target.value);
                  }}
                  placeholder={`https://${t('url_ph')}`}
                  className={styles.input}
                />
                <Button type="submit" className={styles.button}>
                  {t('hero_cta')}
                </Button>
              </div>
            </form>
          </div>
        </div>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <strong className={styles.statValue}>{FREE_ALLOCATION}</strong>
            <span className={styles.statLabel}>{t('stat_credits')}</span>
          </div>
          <div className={styles.stat}>
            <strong className={styles.statValue}>{ALL_AREAS.length}</strong>
            <span className={styles.statLabel}>{t('stat_areas')}</span>
          </div>
          <div className={styles.stat}>
            <strong className={styles.statValue}>{REVERIFY_COST}</strong>
            <span className={styles.statLabel}>{t('stat_recheck')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
