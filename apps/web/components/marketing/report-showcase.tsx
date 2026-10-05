import { getTranslations } from 'next-intl/server';
import { cn } from '../../lib/cn';
import { MarketingSectionHeader } from './section-header';

const styles = {
  section: cn(
    'bg-surface-marketing px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  frame: cn(
    'mx-auto max-w-marketing-demo rounded-marketing-demo border border-solid border-marketing-demo bg-surface-marketing-raised p-3 shadow-marketing-float',
  ),
  frameBar: cn(
    'flex h-marketing-framebar items-center gap-2 border-x-0 border-b border-t-0 border-solid border-marketing-frame-divider px-3 text-marketing-muted text-marketing-micro',
  ),
  frameDot: cn('size-marketing-dot rounded-full bg-surface-marketing-frame-dot'),
  frameAddress: cn(
    'mx-auto rounded-full bg-surface-marketing-tag px-3 py-1 font-mono text-marketing-micro',
  ),
  demoContent: cn(
    'mx-auto grid max-w-marketing-demo grid-cols-[minmax(0,_0.85fr)_minmax(0,_1.15fr)] items-center gap-marketing-demo-gap p-marketing-demo-padding max-marketing-demo-compact:gap-marketing-demo-gap-compact max-marketing-demo-compact:p-marketing-demo-padding-compact max-marketing-tablet:grid-cols-1 max-marketing-tablet:gap-marketing-demo-gap-mobile max-marketing-mobile:py-marketing-demo-padding-mobile max-marketing-mobile:px-marketing-demo-padding-mobile-x',
  ),
  demoCopy: cn('min-w-0'),
  kicker: cn('mb-0 text-marketing-muted text-marketing-label font-extrabold'),
  demoHeading: cn(
    'mb-0 mt-3 text-marketing-demo-heading leading-marketing-demo-heading font-black text-marketing-primary text-balance',
  ),
  demoBody: cn(
    'mb-0 mt-2.5 text-marketing-body leading-marketing-body text-marketing-secondary text-pretty',
  ),
  tags: cn('mt-4 flex flex-wrap gap-2'),
  tag: cn(
    'rounded-full border border-solid border-border-marketing bg-surface-marketing-tag px-3 py-1.5 text-marketing-label font-bold text-marketing-secondary',
  ),
  finding: cn(
    'min-w-0 rounded-marketing-demo-finding border border-solid border-marketing-finding bg-surface-marketing-raised p-marketing-finding-padding',
  ),
  findingMeta: cn('flex flex-wrap items-center gap-2'),
  severity: cn(
    'inline-flex min-h-6 items-center rounded-full bg-sev-medium-bg px-2.5 text-marketing-micro font-extrabold text-sev-medium',
  ),
  area: cn(
    'inline-flex min-h-6 items-center rounded-full bg-surface-ice px-2.5 text-marketing-micro font-bold text-marketing-secondary',
  ),
  findingTitle: cn(
    'mb-0 mt-4 text-marketing-card-heading font-extrabold text-marketing-primary text-balance',
  ),
  description: cn(
    'mb-0 mt-2 text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
  ),
  evidenceRow: cn(
    'mt-4 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 border-x-0 border-b-0 border-t border-solid border-border-marketing pt-3 text-marketing-label',
  ),
  evidenceLabel: cn('text-marketing-muted font-bold'),
  evidenceValue: cn('min-w-0 break-words font-mono text-marketing-label text-marketing-primary'),
  caption: cn('mb-0 mx-2 mt-3 text-marketing-muted text-marketing-micro text-end'),
} as const;

export async function ReportShowcase(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="report-showcase"
      data-landing-section="report-showcase"
      data-approved-section="report"
      className={styles.section}
      aria-labelledby="report-showcase-heading"
    >
      <MarketingSectionHeader
        id="report-showcase-heading"
        number="01"
        eyebrow={t('report_section_label')}
        title={t('report_h2')}
        lead={t('report_intro')}
      />

      <div className={styles.frame}>
        <div className={styles.frameBar} aria-hidden="true">
          <span className={styles.frameDot} />
          <span className={styles.frameDot} />
          <span className={styles.frameDot} />
          <span dir="ltr" className={styles.frameAddress}>
            fahes / report / sample
          </span>
          <span>{t('report_frame_sample')}</span>
        </div>

        <div className={styles.demoContent}>
          <div className={styles.demoCopy}>
            <p className={styles.kicker}>{t('report_demo_kicker')}</p>
            <h3 className={styles.demoHeading}>{t('report_demo_heading')}</h3>
            <p className={styles.demoBody}>{t('report_demo_body')}</p>
            <div className={styles.tags}>
              <span className={styles.tag}>{t('a_perf')}</span>
              <span className={styles.tag}>{t('report_evidence_label')}</span>
              <span className={styles.tag}>{t('report_prompt_short_label')}</span>
            </div>
          </div>

          <article className={styles.finding} aria-label={t('report_sample_label')}>
            <div className={styles.findingMeta}>
              <span className={styles.severity}>{t('report_severity_medium')}</span>
              <span className={styles.area}>{t('a_perf')}</span>
            </div>
            <h4 className={styles.findingTitle}>{t('report_finding_title')}</h4>
            <p className={styles.description}>{t('report_description')}</p>
            <div className={styles.evidenceRow}>
              <span className={styles.evidenceLabel}>{t('report_location_label')}</span>
              <code dir="ltr" className={styles.evidenceValue}>
                GET https://shop.example/
              </code>
            </div>
            <div className={styles.evidenceRow}>
              <span className={styles.evidenceLabel}>{t('report_evidence_label')}</span>
              <code dir="ltr" className={styles.evidenceValue}>
                {'{"cache-control":null}'}
              </code>
            </div>
          </article>
        </div>
      </div>
      <p className={styles.caption}>{t('report_demo_caption')}</p>
    </section>
  );
}
