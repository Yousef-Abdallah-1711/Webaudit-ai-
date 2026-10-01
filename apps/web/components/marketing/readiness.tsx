import { getTranslations } from 'next-intl/server';
import type enPublic from '../../messages/en/public.json';
import styles from './readiness.module.css';

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
  readiness_status_pass: styles.pass!,
  readiness_status_blocked: styles.blocked!,
  readiness_status_warning: styles.warning!,
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
