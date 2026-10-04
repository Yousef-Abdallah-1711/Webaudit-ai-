'use client';

/** Approved Fahes hero. Keeps the existing localized signup handoff; it never starts a scan here. */
import { useLocale, useTranslations } from 'next-intl';
import { ALL_AREAS, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';
import { ScanHandoffForm } from './scan-handoff-form';
import { cn } from '../../lib/cn';

const styles = {
  section:
    'relative isolate flex min-h-[var(--height-landing-hero)] items-start justify-center overflow-hidden bg-surface-hero px-6 pb-32 pt-marketing-hero-top text-marketing-inverse max-marketing-tablet:min-h-marketing-tablet-hero max-marketing-mobile:min-h-[var(--height-landing-hero)] max-marketing-mobile:px-5 max-marketing-mobile:pb-20 max-marketing-mobile:pt-marketing-hero-top-mobile',
  atmosphere:
    'pointer-events-none absolute inset-0 -z-20 bg-atmosphere after:absolute after:inset-x-0 after:bottom-0 after:h-44 after:bg-gradient-to-b after:from-transparent after:to-surface-marketing',
  stars:
    'pointer-events-none absolute inset-y-marketing-stars inset-x-[5%] -z-10 opacity-50 bg-marketing-stars max-marketing-mobile:inset-x-[1%] top-marketing-mobile-stars-top bottom-marketing-mobile-stars-bottom max-marketing-mobile:opacity-35',
  art: 'pointer-events-none absolute inset-x-0 top-20 -z-10 h-[calc(100%-var(--height-marketing-art-offset))] w-full opacity-70 max-marketing-mobile:inset-x-0 max-marketing-mobile:top-20 max-marketing-mobile:h-[calc(100%-var(--height-marketing-mobile-art-offset))] max-marketing-mobile:w-full',
  inner: 'mx-auto my-auto w-full max-w-landing-hero text-center',
  eyebrow: 'flex items-center justify-center gap-marketing-form text-xs font-bold tracking-wide text-marketing-inverse-muted max-marketing-mobile:text-marketing-micro',
  eyebrowDot: 'size-[var(--size-marketing-dot)] rounded-full bg-brand-highlight shadow-marketing-glow',
  kicker: 'mb-0 mt-5 text-xs font-extrabold text-marketing-inverse-muted',
  heading:
    'mx-auto mt-3 max-w-full text-marketing-display leading-marketing-display font-black tracking-[-0.035em] text-balance',
  headingLine: 'block',
  headingAccent:
    'block bg-gradient-brand-marketing bg-clip-text text-transparent',
  supportingCopy:
    'mx-auto mt-5 max-w-marketing-copy text-base leading-[1.8] text-marketing-inverse-muted text-pretty max-marketing-mobile:mt-3 max-marketing-mobile:text-marketing-mobile-copy max-marketing-mobile:leading-[1.75]',
  scanner:
    'mx-auto mt-9 w-full max-w-landing-scanner rounded-landing-scanner border border-white/20 bg-white/[0.09] p-4 shadow-marketing-float backdrop-blur-xl max-marketing-mobile:mt-6 max-marketing-mobile:rounded-marketing-card max-marketing-mobile:p-3',
  scannerHeader: 'mb-3 flex items-center justify-between gap-3 text-xs font-bold text-marketing-inverse-muted',
  scannerSignal: 'inline-flex items-center gap-2 text-marketing-inverse-muted',
  signalDot: 'size-[var(--size-marketing-dot)] rounded-full bg-brand-highlight',
  stats: 'mx-auto mt-7 flex w-full max-w-landing-scanner justify-center border-t border-white/20',
  stat: 'min-w-0 flex-1 px-3 pt-4 text-center',
  statDivider: 'border-s border-white/15',
  statValue: 'block font-mono text-marketing-stat font-extrabold leading-marketing-stat text-marketing-inverse max-marketing-mobile:text-marketing-mobile-stat',
  statLabel: 'mt-1 block text-marketing-label text-marketing-inverse-muted max-marketing-mobile:text-marketing-micro',
} as const;

export function Hero(): React.ReactElement {
  const t = useTranslations('public');
  const locale = useLocale();
  return (
    <section
      id="hero"
      data-landing-section="hero"
      aria-labelledby="hero-heading"
      className={styles.section}
    >
      <div aria-hidden="true" className={styles.atmosphere} />
      <div aria-hidden="true" className={styles.stars} />
      <svg aria-hidden="true" className={styles.art} viewBox="0 0 1440 720" fill="none">
        <ellipse cx="720" cy="575" rx="620" ry="260" stroke="var(--brand-electric-pulse)" strokeOpacity=".15" />
        <ellipse cx="720" cy="575" rx="490" ry="205" stroke="var(--brand-electric-bright)" strokeOpacity=".12" />
        <ellipse cx="720" cy="575" rx="360" ry="150" stroke="var(--brand-electric-pulse)" strokeOpacity=".1" />
        <path d="M80 520C270 300 455 280 720 520s450 220 640 0" stroke="var(--brand-electric-bright)" strokeOpacity=".18" />
      </svg>
      <div className={styles.inner}>
        <p className={styles.eyebrow}>
          <span aria-hidden="true" className={styles.eyebrowDot} />
          {t('promo', { freeCredits: FREE_ALLOCATION })}
        </p>
        <p className={styles.kicker}>{t('hero_kicker')}</p>
        <h1 id="hero-heading" className={styles.heading}>
          <span className={styles.headingLine}>{t('hero_lead')}</span>
          <span className={styles.headingAccent}>{t('hero_accent')}</span>
        </h1>
        <p className={styles.supportingCopy}>{t('hero_sub')}</p>
        <div className={styles.scanner} data-scan-handoff>
          <div className={styles.scannerHeader}>
            <p className="m-0">{t('hero_cta')}</p>
            <span className={styles.scannerSignal}>
              <span aria-hidden="true" className={styles.signalDot} />
              <span dir="ltr">HTTPS</span>
            </span>
          </div>
          <ScanHandoffForm
            id={`hero-url-${locale}`}
            label={t('hero_url_example_label')}
            placeholder={`https://${t('url_ph')}`}
            note={t('hero_handoff_note')}
            submitLabel={t('hero_cta')}
            tone="dark"
          />
        </div>
        <div className={styles.stats}>
          {[
            [FREE_ALLOCATION, t('stat_credits')],
            [ALL_AREAS.length, t('stat_areas')],
            [REVERIFY_COST, t('stat_recheck')],
          ].map(([value, label], index) => (
            <div
              className={cn(styles.stat, index > 0 && styles.statDivider)}
              key={`${value}-${label}`}
            >
              <strong className={styles.statValue}>{value}</strong>
              <span className={styles.statLabel}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
