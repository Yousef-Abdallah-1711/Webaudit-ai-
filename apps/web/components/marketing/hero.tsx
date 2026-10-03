'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { ALL_AREAS, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';
import { Button } from '../ui';
import { storeHeroScanUrl } from '../../lib/hero-scan-handoff';
import { cn } from '../../lib/cn';

const styles = {
  section: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the established 768px and 640px responsive cutoffs
    'relative isolate overflow-hidden bg-surface-marketing-dark py-20 max-[768px]:py-16 max-[640px]:py-12',
  ),
  accentField: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px stack cutoff
    'pointer-events-none absolute end-0 top-12 bottom-12 w-[48%] bg-gradient-brand-subtle max-[900px]:hidden',
  ),
  accentFieldStacked: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px stack cutoff
    'pointer-events-none absolute start-0 end-0 top-[62%] bottom-0 hidden bg-gradient-brand-subtle max-[900px]:block',
  ),
  layout: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 1024px, 900px, and 640px responsive cutoffs
    'relative mx-auto grid max-w-7xl grid-cols-2 items-center gap-12 px-8 max-[1024px]:gap-8 max-[900px]:grid-cols-1 max-[900px]:gap-10 max-[640px]:gap-8 max-[640px]:px-4',
  ),
  copy: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px stack cutoff
    'min-w-0 py-8 max-[900px]:py-0',
  ),
  heading: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px and 640px responsive cutoffs
    'm-0 type-display !font-black text-text-on-accent text-balance max-[900px]:max-w-[18ch] max-[640px]:max-w-[16ch]',
  ),
  headingClause: cn('block'),
  supportingCopy: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px and 640px responsive cutoffs
    'mt-6 mb-0 max-w-[58ch] type-lead text-text-on-accent opacity-80 text-pretty max-[900px]:max-w-[64ch] max-[640px]:mt-4 max-[640px]:type-body max-[640px]:tracking-normal',
  ),
  stats: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 900px and 640px responsive cutoffs and the literal alpha color because Tailwind cannot apply slash opacity to the semantic token
    'mt-9 grid grid-cols-3 gap-5 border-0 !border-t-hairline border-solid border-t-[rgba(250,250,250,0.25)] pt-5 max-[900px]:max-w-[42rem] max-[640px]:mt-7 max-[640px]:grid-cols-1 max-[640px]:gap-3',
  ),
  stat: cn('min-w-0'),
  statValue: cn('block type-h3 !font-bold text-text-on-accent'),
  statLabel: cn('mt-1 block type-small text-text-on-accent opacity-75 text-pretty'),
  scanner: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 1024px, 900px, 768px, and 640px responsive cutoffs and the literal alpha color because Tailwind cannot apply slash opacity to the semantic token
    'relative z-10 -ms-12 min-w-0 rounded-marketing-shell border border-solid !border-hairline border-[rgba(48,32,25,0.15)] bg-text-on-accent p-7 text-surface-marketing-dark max-[1024px]:-ms-6 max-[900px]:ms-0 max-[768px]:max-w-[42rem] max-[768px]:justify-self-start max-[640px]:p-5',
  ),
  scannerHeader: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 640px responsive cutoff
    'mb-7 flex items-center justify-between gap-4 max-[640px]:mb-5',
  ),
  scannerTitle: cn('m-0 type-card-title !font-bold'),
  scannerSignal: cn('inline-flex flex-none items-center gap-2 type-small text-surface-marketing-dark'),
  signalDot: cn('size-2 rounded-full bg-accent'),
  fieldLabel: cn('mb-2 block type-small !font-semibold text-surface-marketing-dark'),
  form: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 640px responsive cutoff
    'grid grid-cols-[minmax(0,1fr)_auto] items-stretch gap-3 max-[640px]:grid-cols-1',
  ),
  input: cn(
    'box-border h-12 min-w-0 w-full rounded-control border border-solid !border-hairline border-[rgba(48,32,25,0.25)] bg-text-on-accent px-4 font-mono type-small text-surface-marketing-dark placeholder:text-[rgba(48,32,25,0.55)] focus-visible:outline focus-visible:outline-hairline focus-visible:outline-focus-ring focus-visible:outline-offset-1',
  ),
  button: cn(
    // eslint-disable-next-line no-restricted-syntax -- preserve the 640px responsive cutoff
    'min-w-[9.5rem] max-[640px]:w-full',
  ),
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
      <div aria-hidden="true" className={styles.accentField} />
      <div aria-hidden="true" className={styles.accentFieldStacked} />
      <div className={styles.layout}>
        <div className={styles.copy}>
          <h1 className={cn(styles.heading, locale === 'ar' && '!font-bold')}>
            <span className={styles.headingClause}>{t('hero_lead')}</span>
            <span className={cn(styles.headingClause, 'text-accent')}>{t('hero_accent')}</span>
          </h1>
          <p className={styles.supportingCopy}>{t('hero_sub')}</p>
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

        <div className={styles.scanner}>
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
    </section>
  );
}
