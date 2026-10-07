import { getTranslations } from 'next-intl/server';
import type enPublic from '../../messages/en/public.json';

import { cn } from '../../lib/cn';
import { SectionNo } from './section-header';

const styles = {
  section: cn(
    'bg-surface-ice px-6 py-marketing-section max-marketing-tablet:py-marketing-section-tablet max-marketing-mobile:px-4 max-marketing-mobile:py-marketing-section-mobile',
  ),
  inner: cn(
    'mx-auto grid max-w-marketing-evidence grid-cols-[0.8fr_1.2fr] items-center gap-8 max-marketing-tablet:grid-cols-1 max-marketing-tablet:gap-6',
  ),
  header: cn('max-w-[35rem]'),
  sampleLabel: cn('mb-0 mt-3 text-marketing-muted text-marketing-micro font-bold'),
  heading: cn(
    'mb-0 mt-marketing-section-heading-gap text-marketing-readiness-heading leading-marketing-readiness-heading font-black text-marketing-primary text-balance max-marketing-mobile:mt-marketing-section-heading-gap-mobile max-marketing-mobile:text-marketing-mobile-readiness-heading',
  ),
  intro: cn(
    'mb-0 mt-marketing-section-heading-gap text-marketing-readiness-copy leading-marketing-description text-marketing-secondary text-pretty max-marketing-mobile:mt-marketing-section-heading-gap-mobile max-marketing-mobile:text-marketing-description',
  ),
  decision: cn(
    'min-w-0 rounded-marketing-readiness border border-solid border-border-marketing-readiness bg-surface-marketing-raised py-marketing-principle-padding-y px-6 text-marketing-primary shadow-marketing-card max-marketing-mobile:py-marketing-readiness-padding-mobile-y max-marketing-mobile:px-marketing-readiness-padding-mobile-x',
  ),
  gate: cn(
    'flex flex-wrap items-center justify-between gap-3 border-x-0 border-t-0 border-b border-solid border-border-marketing pb-4',
  ),
  gateLabel: cn('text-marketing-secondary text-marketing-label font-bold'),
  gateValue: cn(
    'rounded-full bg-sev-high-bg px-3 py-1.5 text-sev-high text-marketing-label font-extrabold',
  ),
  modules: cn('m-0 p-0 list-none'),
  module: cn(
    'flex min-w-0 items-center justify-between gap-3 border-x-0 border-t-0 border-b border-solid border-border-marketing py-3 max-marketing-micro:items-start',
  ),
  moduleName: cn('min-w-0 break-words text-marketing-primary type-body'),
  status: cn(
    'flex-none rounded-full px-2.5 py-1 text-marketing-micro font-extrabold max-marketing-micro:whitespace-normal max-marketing-micro:text-end',
  ),
  pass: cn('bg-sev-resolved-bg text-sev-resolved'),
  blocked: cn('bg-sev-high-bg text-sev-high'),
  warning: cn('bg-sev-medium-bg text-sev-medium'),
  blockers: cn(
    'mt-4 rounded-marketing-blocker border-solid border-x-0 border-y-0 !border-s-[0.1875rem] border-s-sev-medium bg-sev-medium-bg px-4 py-3 text-sev-medium [&>h3]:m-0 [&>h3]:text-marketing-label [&>h3]:font-extrabold [&>ul]:mt-2 [&>ul]:mb-0 [&>ul]:grid [&>ul]:gap-2 [&>ul]:ps-5 [&>ul]:text-marketing-label [&>p]:mb-0 [&>p]:mt-3 [&>p]:text-marketing-muted [&>p]:text-marketing-label [&>p]:text-pretty',
  ),
};

type PublicKey = keyof typeof enPublic;
type ReadinessStatus =
  'readiness_status_pass' | 'readiness_status_blocked' | 'readiness_status_warning';

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
      data-approved-section="readiness"
      className={styles.section}
      aria-labelledby="readiness-heading"
    >
      <div className={styles.inner}>
        <header className={styles.header}>
          <SectionNo number="04">{t('readiness_eyebrow')}</SectionNo>
          <h2 id="readiness-heading" className={styles.heading}>
            {t('readiness_h2')}
          </h2>
          <p className={styles.intro}>{t('readiness_intro')}</p>
          <p className={styles.sampleLabel}>{t('readiness_sample_label')}</p>
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
                <span className={`${styles.status} ${STATUS_CLASS[status]}`}>{t(status)}</span>
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
