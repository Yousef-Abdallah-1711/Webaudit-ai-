import { getTranslations } from 'next-intl/server';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-page max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.72fr)_minmax(0,_1.28fr)] items-start gap-[clamp(var(--space-8),_8vw,_var(--space-16))] max-w-6xl mx-auto max-[1024px]:grid-cols-[minmax(0,_0.8fr)_minmax(0,_1.2fr)] max-[1024px]:gap-8 max-[768px]:grid-cols-[minmax(0,_0.7fr)_minmax(0,_1.3fr)] max-[768px]:gap-5 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  header: cn('pt-4 max-[640px]:pt-0'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heading: cn('max-w-[11ch] m-0 text-text-strong type-h2  text-balance max-[640px]:max-w-[18ch] '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  ledger: cn('m-0 p-0 max-[640px]:mt-5'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px, 368px; preserve this component-specific grid track ratio; no predefined grid utility matches it
  claim: cn('grid grid-cols-[minmax(0,_0.88fr)_minmax(0,_1.12fr)] gap-6 py-5 border-x-0 border-b-0 border-border-default border-t-hairline border-solid last:border-b-hairline [&>dt]:flex [&>dt]:items-start [&>dt]:gap-3 [&>dt]:text-text-strong [&>dt]:type-body-bold [&>dt]:text-balance [&>dd]:m-0 [&>dd]:text-text-secondary [&>dd]:type-small [&>dd]:text-pretty max-[768px]:grid-cols-1 max-[768px]:gap-2 max-[768px]:py-4 max-[640px]:grid-cols-[minmax(0,_0.9fr)_minmax(0,_1.1fr)] max-[640px]:gap-3 max-[368px]:grid-cols-1 max-[368px]:gap-2'),
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
              <dt>
                {t(title)}
              </dt>
              <dd>{t(body)}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
