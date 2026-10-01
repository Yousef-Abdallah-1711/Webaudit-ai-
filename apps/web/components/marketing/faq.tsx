/* Wave 5's original section design is documented in design/screen-map.md and research.md R20. */
import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION, FULL_AUDIT_COST, REVERIFY_COST } from '@webaudit/config';
import styles from './faq.module.css';

const QUESTIONS = [
  ['faq_readonly_question', 'faq_readonly_answer'],
  ['faq_data_question', 'faq_data_answer'],
  ['faq_ai_question', 'faq_ai_answer'],
  ['faq_readiness_question', 'faq_readiness_answer'],
  ['faq_free_question', 'faq_free_answer'],
  ['faq_recheck_question', 'faq_recheck_answer'],
] as const;

const FREE_ANSWER_VALUES = {
  freeCredits: FREE_ALLOCATION,
  fullAuditCost: FULL_AUDIT_COST,
};
const RECHECK_ANSWER_VALUES = { reverifyCost: REVERIFY_COST };

export async function Faq(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="faq"
      data-landing-section="faq"
      className={styles.section}
      aria-labelledby="faq-heading"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id="faq-heading" className={styles.heading}>{t('faq_heading')}</h2>
          <p className={styles.lead}>{t('faq_lead')}</p>
        </header>
        <div className={styles.questions}>
          {QUESTIONS.map(([question, answer]) => (
            <details className={styles.item} key={question}>
              <summary className={styles.question}>{t(question)}</summary>
              <p className={styles.answer}>
                {answer === 'faq_free_answer'
                  ? t(answer, FREE_ANSWER_VALUES)
                  : answer === 'faq_recheck_answer'
                    ? t(answer, RECHECK_ANSWER_VALUES)
                    : t(answer)}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
