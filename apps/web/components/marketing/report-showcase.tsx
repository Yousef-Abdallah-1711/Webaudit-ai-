import { getTranslations } from 'next-intl/server';
import { CopyPromptButton } from './copy-prompt-button';
import styles from './report-showcase.module.css';

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
              <CopyPromptButton prompt={prompt} className={styles.copyButton!} />
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
