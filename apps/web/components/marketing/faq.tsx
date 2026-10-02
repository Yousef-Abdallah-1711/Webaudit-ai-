/* Wave 5's original section design is documented in design/screen-map.md and research.md R20. */
import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION, FULL_AUDIT_COST, REVERIFY_COST } from '@webaudit/config';
import specialStyles from './faq.special.module.css';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-page max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.72fr)_minmax(0,_1.28fr)] items-start gap-[clamp(var(--space-8),_8vw,_var(--space-16))] max-w-6xl mx-auto max-[1024px]:grid-cols-[minmax(0,_0.8fr)_minmax(0,_1.2fr)] max-[1024px]:gap-8 max-[768px]:grid-cols-[minmax(0,_0.7fr)_minmax(0,_1.3fr)] max-[768px]:gap-5 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  header: cn('sticky top-8 max-[640px]:static'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heading: cn('max-w-[10ch] m-0 text-text-strong type-h2  text-balance max-[640px]:max-w-[15ch] '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  lead: cn('max-w-[30rem] mt-4 mb-0 text-text-secondary type-body text-pretty max-[640px]:mt-3 max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  questions: cn('border-x-0 border-b-0 border-border-default border-t-hairline border-solid max-[640px]:mt-5'),
  item: cn(specialStyles.item, 'border-x-0 border-t-0 border-border-default border-b-hairline border-solid'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  question: cn(specialStyles.question, 'flex items-center justify-between gap-4 min-h-control py-4 text-text-primary type-body-bold text-pretty cursor-pointer list-none focus-visible:outline outline-hairline outline-focus-ring focus-visible:outline-offset-1 max-[640px]:items-start max-[640px]:gap-3 max-[640px]:py-4 max-[640px]:type-body '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  answer: cn('max-w-[65ch] m-0 pt-0 pb-5 text-text-secondary type-body text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
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
