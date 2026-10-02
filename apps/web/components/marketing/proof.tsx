import { getTranslations } from 'next-intl/server';
import { ModuleStatus, ScoreArc } from '../report';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  proofSection: cn('py-12 px-6 bg-surface-sunken max-[768px]:py-8 max-[640px]:py-6 max-[640px]:px-4'),
  sampleLabel: cn('table mb-3 mt-0 py-2 px-3 border-border-default border-hairline border-solid bg-surface-page text-text-primary type-small leading-5 !font-semibold'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  proofArtifact: cn('py-6 px-6 border-border-default border-hairline border-solid bg-surface-page max-[640px]:py-4 max-[640px]:px-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  proofRow: cn('flex items-center flex-wrap gap-10 max-[768px]:gap-6 max-[640px]:flex-col max-[640px]:items-stretch max-[640px]:gap-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  proofModules: cn('flex flex-[1_1_22rem] flex-col gap-2 min-w-0 max-[640px]:basis-auto'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  proofNote: cn('max-w-[62ch] mt-6 mb-0 text-text-secondary type-small text-pretty'),
};

export async function Proof(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section
      id="proof"
      data-landing-section="proof"
      className={styles.proofSection}
      aria-label={t('proof_sample_label')}
    >
      <div className={cn('max-w-marketing mx-auto')}>
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
