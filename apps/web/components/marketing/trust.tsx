import { getTranslations } from 'next-intl/server';
import styles from './trust.module.css';

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
