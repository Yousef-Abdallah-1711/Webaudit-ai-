import { getTranslations } from 'next-intl/server';
import type enPublic from '../../messages/en/public.json';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  section: cn('py-20 px-6 bg-surface-inverse text-text-on-surface-inverse max-[768px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  inner: cn('grid grid-cols-[minmax(0,_0.85fr)_minmax(0,_1.15fr)] items-start gap-[clamp(var(--space-8),_7vw,_var(--space-16))] max-w-6xl mx-auto max-[1024px]:grid-cols-[minmax(0,_0.75fr)_minmax(0,_1.25fr)] max-[1024px]:gap-8 max-[768px]:grid-cols-[minmax(0,_0.9fr)_minmax(0,_1.1fr)] max-[768px]:gap-5 max-[640px]:block'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  header: cn('max-w-[35rem] pt-4 max-[640px]:pt-0'),
  sampleLabel: cn('m-0 text-text-on-surface-inverse text-sm leading-5 font-semibold'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  heading: cn('mt-5 mb-0 type-h2  text-balance max-[640px]:mt-3 '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  intro: cn('mt-4 mb-0 text-text-on-surface-inverse type-body-lg text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  decision: cn('min-w-0 py-5 px-5 bg-surface-page text-text-primary max-[768px]:px-4 max-[640px]:mt-6 max-[640px]:py-4 max-[640px]:px-3'),
  gate: cn('flex items-center justify-between flex-wrap gap-3 pb-4 border-x-0 border-t-0 border-border-default border-b-hairline border-solid'),
  gateLabel: cn('text-text-secondary text-sm leading-5 font-semibold'),
  gateValue: cn('text-sev-high type-card-title tracking-[0.02em]'),
  modules: cn('m-0 p-0 list-none'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  module: cn('flex items-center justify-between gap-3 min-w-0 py-3 border-x-0 border-t-0 border-border-default border-b-hairline border-solid max-[368px]:items-start'),
  moduleName: cn('min-w-0 text-text-primary type-body break-words'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 368px
  status: cn('flex-none py-1 px-2 rounded-pill text-sm leading-5 font-semibold max-[368px]:whitespace-normal max-[368px]:text-end'),
  pass: cn('bg-sev-resolved-bg text-sev-resolved'),
  blocked: cn('bg-sev-high-bg text-sev-high'),
  warning: cn('bg-sev-medium-bg text-sev-medium'),
  blockers: cn('pt-4 [&>h3]:m-0 [&>h3]:text-text-strong [&>h3]:type-body-bold [&>ul]:grid [&>ul]:gap-2 [&>ul]:mt-3 [&>ul]:mb-0 [&>ul]:ps-5 [&>ul]:text-sev-high [&>ul]:type-small [&>p]:mt-4 [&>p]:mb-0 [&>p]:text-text-secondary [&>p]:type-small [&>p]:text-pretty'),
};

type PublicKey = keyof typeof enPublic;
type ReadinessStatus = 'readiness_status_pass' | 'readiness_status_blocked' | 'readiness_status_warning';

const AREAS: readonly (readonly [PublicKey, ReadinessStatus])[] = [
  ['a_perf', 'readiness_status_pass'],
  ['a_sec', 'readiness_status_pass'],
  ['a_des', 'readiness_status_blocked'],
  ['a_test', 'readiness_status_pass'],
  ['a_seo', 'readiness_status_warning'],
];

const STATUS_CLASS: Record<ReadinessStatus, string> = {
  readiness_status_pass: styles.pass,
  readiness_status_blocked: styles.blocked,
  readiness_status_warning: styles.warning,
};

export async function Readiness(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="readiness"
      data-landing-section="readiness"
      className={styles.section}
      aria-labelledby="readiness-heading"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <p className={styles.sampleLabel}>{t('readiness_sample_label')}</p>
          <h2 id="readiness-heading" className={styles.heading}>
            {t('readiness_h2')}
          </h2>
          <p className={styles.intro}>{t('readiness_intro')}</p>
        </header>

        <div className={styles.decision}>
          <div className={styles.gate}>
            <span className={styles.gateLabel}>{t('readiness_gate_label')}</span>
            <strong className={styles.gateValue}>{t('readiness_gate_no')}</strong>
          </div>
          <ul className={styles.modules}>
            {AREAS.map(([area, status]) => (
              <li className={styles.module} key={area}>
                <span className={styles.moduleName}>{t(area)}</span>
                <span
                  className={`${styles.status} ${STATUS_CLASS[status]}`}
                >
                  {t(status)}
                </span>
              </li>
            ))}
          </ul>
          <div className={styles.blockers}>
            <h3>{t('readiness_blocker_label')}</h3>
            <ul>
              <li>{t('readiness_blocker_design')}</li>
              <li>{t('readiness_blocker_seo')}</li>
            </ul>
            <p>{t('readiness_no_measure')}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
