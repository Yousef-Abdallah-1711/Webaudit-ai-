/* Wave 5's original section design is documented in design/screen-map.md and research.md R20. */
import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION, FULL_AUDIT_COST, REVERIFY_COST } from '@webaudit/config';
import { cn } from '../../lib/cn';

const styles = {
  section: cn(
    'bg-surface-ice px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  inner: cn(
    'mx-auto grid max-w-marketing-evidence grid-cols-[0.72fr_1.28fr] items-start gap-marketing-faq-gap max-marketing-tablet:gap-marketing-faq-gap-tablet max-marketing-mobile:grid-cols-1 max-marketing-mobile:gap-marketing-faq-gap-mobile',
  ),
  header: cn('pt-2'),
  heading: cn(
    'max-w-[12ch] m-0 text-marketing-faq-heading leading-marketing-faq-heading font-black tracking-[-0.03em] text-balance text-marketing-primary max-marketing-mobile:max-w-full',
  ),
  lead: cn(
    'mt-3 mb-0 max-w-[30rem] text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
  ),
  questions: cn('border-x-0 border-b-0 border-t border-solid border-border-marketing'),
  item: cn('group border-x-0 border-t-0 border-b border-solid border-border-marketing'),
  question: cn(
    'flex min-h-marketing-faq-summary cursor-pointer list-none items-center justify-between gap-4 py-3 text-marketing-primary text-marketing-description font-extrabold text-pretty focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-electric focus-visible:outline-offset-2',
  ),
  answer: cn(
    'mb-0 max-w-[65ch] pt-0 pb-5 text-marketing-description leading-marketing-description text-marketing-secondary text-pretty',
  ),
};

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
      data-approved-section="faq"
      className={styles.section}
      aria-labelledby="faq-heading"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id="faq-heading" className={styles.heading}>
            {t('faq_heading')}
          </h2>
          <p className={styles.lead}>{t('faq_lead')}</p>
        </header>
        <div className={styles.questions}>
          {QUESTIONS.map(([question, answer]) => (
            <details
              className={styles.item}
              key={question}
              open={question === 'faq_readonly_question'}
            >
              <summary className={styles.question}>
                <span>{t(question)}</span>
                <span
                  aria-hidden="true"
                  className="flex size-marketing-faq-icon flex-none items-center justify-center rounded-full bg-surface-electric-soft font-mono text-lg font-bold text-brand-electric [dir=rtl]:order-first after:content-['+'] group-open:after:content-['−']"
                />
              </summary>
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
