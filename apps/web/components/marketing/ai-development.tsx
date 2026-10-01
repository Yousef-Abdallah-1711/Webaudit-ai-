import { getTranslations } from 'next-intl/server';
import styles from './ai-development.module.css';

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
            <div className={`${styles.step} ${styles.verify}`}>
              <span className={styles.stepMark} aria-hidden="true">
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
