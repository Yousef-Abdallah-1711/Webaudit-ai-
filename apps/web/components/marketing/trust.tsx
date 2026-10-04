import { getTranslations } from 'next-intl/server';

import { cn } from '../../lib/cn';

const styles = {
  section: cn(
    'bg-surface-marketing px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  inner: cn('mx-auto max-w-marketing-evidence'),
  header: cn('mx-auto mb-9 max-w-marketing-section text-center max-marketing-mobile:mb-6'),
  heading: cn(
    'm-0 text-marketing-h2 leading-marketing-h2 font-black tracking-[-0.03em] text-balance text-marketing-primary',
  ),
  ledger: cn(
    'm-0 grid grid-cols-2 border-s border-t border-solid border-border-marketing max-marketing-mobile:grid-cols-1',
  ),
  claim: cn(
    'min-h-marketing-trust-card border-e border-b border-solid border-border-marketing bg-surface-marketing-raised p-6 [&>dt]:m-0 [&>dt]:text-marketing-trust-heading [&>dt]:font-extrabold [&>dt]:text-marketing-primary [&>dd]:mb-0 [&>dd]:mt-2 [&>dd]:text-marketing-description [&>dd]:leading-marketing-description [&>dd]:text-marketing-secondary [&>dd]:text-pretty',
  ),
};

const CLAIMS = [
  ['trust_ssrf_title', 'trust_ssrf_body'],
  ['trust_readonly_title', 'trust_readonly_body'],
  ['trust_source_title', 'trust_source_body'],
  ['trust_retention_title', 'trust_retention_body'],
] as const;

export async function Trust(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="technical-trust"
      data-landing-section="trust"
      data-approved-section="trust"
      className={styles.section}
      aria-labelledby="trust-heading"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <h2 id="trust-heading" className={styles.heading}>
            {t('trust_h2')}
          </h2>
        </header>
        <dl className={styles.ledger}>
          {CLAIMS.map(([title, body]) => (
            <div className={styles.claim} key={title}>
              <dt>{t(title)}</dt>
              <dd>{t(body)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
