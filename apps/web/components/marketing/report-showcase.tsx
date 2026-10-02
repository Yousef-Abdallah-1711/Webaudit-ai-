import { getTranslations } from 'next-intl/server';
import { CopyPromptButton } from './copy-prompt-button';
import specialStyles from './report-showcase.special.module.css';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-page max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.72fr)_minmax(0,_1.28fr)] items-start gap-[clamp(var(--space-8),_6vw,_var(--space-16))] max-w-6xl mx-auto max-[1024px]:grid-cols-[minmax(0,_0.8fr)_minmax(0,_1.2fr)] max-[1024px]:gap-8 max-[768px]:grid-cols-[minmax(0,_1fr)_minmax(0,_1.35fr)] max-[768px]:gap-5 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  intro: cn('sticky top-8 max-[640px]:static'),
  sampleLabel: cn('table m-0 py-2 px-3 border-border-default border-hairline border-solid text-text-primary type-small leading-5 !font-semibold'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  heading: cn('mt-5 mb-0 type-h2  text-balance max-[640px]:mt-3 '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  lead: cn('mt-4 mb-0 text-text-secondary type-body-lg text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  finding: cn('min-w-0 py-6 px-6 border-border-default border-hairline border-solid bg-surface-sunken max-[768px]:py-5 max-[768px]:px-4 max-[640px]:mt-6 max-[640px]:py-4 max-[640px]:px-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  findingMeta: cn('flex flex-wrap items-center gap-2 max-[368px]:items-start max-[368px]:flex-col'),
  severity: cn('inline-flex items-center min-h-6 px-2 rounded-pill type-small leading-5 !font-semibold bg-sev-medium-bg text-sev-medium'),
  area: cn('inline-flex items-center min-h-6 px-2 rounded-pill type-small leading-5 !font-semibold border-border-default border-hairline border-solid bg-surface-page text-text-secondary'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px
  findingTitle: cn('mt-4 mb-0 text-text-strong type-card-title text-balance max-[768px]:type-body-bold'),
  locationRow: cn('flex flex-wrap items-baseline gap-y-2 gap-x-4 mt-4'),
  fieldLabel: cn('text-text-muted type-small leading-5 !font-semibold'),
  location: cn('min-w-0 text-text-code font-mono text-[0.875rem] break-words'),
  evidenceValue: cn('min-w-0 text-text-code font-mono text-[0.875rem] break-words'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint at 640px
  description: cn('mt-4 mb-0 text-text-primary type-body text-pretty max-[640px]:tracking-normal'),
  evidence: cn('flex flex-wrap items-baseline gap-y-2 gap-x-4 mt-4 pt-4 border-x-0 border-b-0 border-border-default border-t-hairline border-solid'),
  prompt: cn('mt-5 bg-surface-page'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  promptHeading: cn('flex items-center justify-between gap-3 py-3 px-4 bg-surface-inverse text-text-on-surface-inverse [&>h4]:m-0 [&>h4]:type-small [&>h4]:leading-5 [&>h4]:!font-semibold max-[368px]:items-start max-[368px]:flex-col max-[368px]:items-start'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  copyButton: cn('flex-none min-h-control py-2 px-3 border-text-on-surface-inverse border-hairline border-solid rounded-control bg-transparent text-text-on-surface-inverse type-small leading-5 !font-semibold cursor-pointer hover:bg-text-primary focus-visible:outline focus-visible:outline-hairline focus-visible:outline-focus-ring focus-visible:outline-offset-1 max-[368px]:self-start'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  promptText: cn(specialStyles.promptText, 'max-h-88 m-0 py-4 px-4 text-text-primary font-mono text-[0.8125rem] leading-[1.65] overflow-auto break-words whitespace-pre-wrap max-[640px]:max-h-72 max-[640px]:px-3'),
  promptNote: cn('mt-3 mb-0 text-text-secondary type-small text-pretty'),
};

export async function ReportShowcase(): Promise<React.ReactElement> {
  const t = await getTranslations('public');
  const prompt = t('report_prompt_text') ?? '';

  return (
    <section
      id="report-showcase"
      data-landing-section="report-showcase"
      className={styles.section}
      aria-labelledby="report-showcase-heading"
    >
      <div className={styles.inner}>
        <header className={styles.intro}>
          <p className={styles.sampleLabel}>{t('report_sample_label')}</p>
          <h2 id="report-showcase-heading" className={styles.heading}>
            {t('report_h2')}
          </h2>
          <p className={styles.lead}>{t('report_intro')}</p>
        </header>

        <article className={styles.finding} aria-label={t('report_sample_label')}>
          <div className={styles.findingMeta}>
            <span className={styles.severity}>{t('report_severity_medium')}</span>
            <span className={styles.area}>{t('a_perf')}</span>
          </div>
          <h3 className={styles.findingTitle}>{t('report_finding_title')}</h3>
          <div className={styles.locationRow}>
            <span className={styles.fieldLabel}>{t('report_location_label')}</span>
            <code dir="ltr" className={styles.location}>
              GET https://shop.example/
            </code>
          </div>
          <p className={styles.description}>{t('report_description')}</p>
          <div className={styles.evidence}>
            <span className={styles.fieldLabel}>{t('report_evidence_label')}</span>
            <code dir="ltr" className={styles.evidenceValue}>
              {'{"cache-control":null}'}
            </code>
          </div>
          <div className={styles.prompt}>
            <div className={styles.promptHeading}>
              <h4>{t('report_prompt_label')}</h4>
              <CopyPromptButton prompt={prompt} className={styles.copyButton} />
            </div>
            <pre dir="auto" className={styles.promptText}>
              {prompt}
            </pre>
          </div>
          <p className={styles.promptNote}>{t('report_prompt_note')}</p>
        </article>
      </div>
    </section>
  );
}
