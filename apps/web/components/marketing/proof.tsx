import { getTranslations } from 'next-intl/server';
import { ModuleStatus, ScoreArc } from '../report';
import styles from './proof.module.css';

export async function Proof(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="proof"
      data-landing-section="proof"
      className={styles.proofSection}
      aria-label={t('proof_sample_label')}
    >
      <div className={styles.proofInner}>
        <p className={styles.sampleLabel}>{t('proof_sample_label')}</p>
        <div className={styles.proofArtifact}>
          <div className={styles.proofRow}>
            <ScoreArc score={84} delta={23} />
            <div className={styles.proofModules}>
              <ModuleStatus area={t('a_sec')} state="complete" issues={7} />
              <ModuleStatus area={t('a_perf')} state="complete" issues={4} />
              <ModuleStatus area={t('a_test')} state="degraded" detail="2 / 5" />
            </div>
          </div>
          <p className={styles.proofNote}>{t('proof_note')}</p>
        </div>
      </div>
    </section>
  );
}
