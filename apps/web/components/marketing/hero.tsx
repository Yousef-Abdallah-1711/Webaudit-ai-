import { getTranslations } from 'next-intl/server';
import { ALL_AREAS, FREE_ALLOCATION, REVERIFY_COST } from '@webaudit/config';
import { Button, StatRow, TwoToneHeading } from '../ui';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  hero: cn('pt-20 pb-24 px-6 text-center max-[768px]:pt-16 max-[768px]:pb-20 max-[640px]:pt-12 max-[640px]:pb-16 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heroSub: cn('max-w-[62ch] mt-5 mx-auto mb-0 type-lead text-text-secondary text-pretty max-[768px]:max-w-[54ch] max-[768px]:type-body-lg max-[640px]:mt-4 max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  heroAction: cn('flex items-stretch flex-wrap gap-3 max-w-[70ch] mt-8 mx-auto mb-0 max-[640px]:flex-col max-[640px]:mt-6'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  urlExample: cn('flex flex-[1_1_20rem] items-center justify-between gap-3 min-w-0 min-h-control py-2 px-4 bg-surface-field text-start border-border-control border-hairline border-solid max-[640px]:basis-auto max-[640px]:flex-col max-[640px]:items-start max-[640px]:gap-1 max-[640px]:min-h-0'),
  urlExampleValue: cn('overflow-hidden text-text-primary font-mono text-ellipsis whitespace-nowrap'),
  urlExampleCaption: cn('flex-none text-text-muted type-small'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  heroStats: cn('flex justify-center mt-5 max-[640px]:mt-4'),
};

export async function Hero(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="hero" data-landing-section="hero" className={styles.hero}>
      <div className={cn('max-w-marketing mx-auto')}>
        <TwoToneHeading lead={t('hero_lead')} accent={t('hero_accent')} />
        <p className={styles.heroSub}>{t('hero_sub')}</p>
        <div className={styles.heroAction}>
          <div className={styles.urlExample}>
            <span dir="ltr" className={styles.urlExampleValue}>
              https://{t('url_ph')}
            </span>
            <span className={styles.urlExampleCaption}>{t('hero_url_example_label')}</span>
          </div>
          <Button href="/signup">{t('hero_cta')}</Button>
        </div>
        <div className={styles.heroStats}>
          <StatRow
            align="center"
            items={[
              { value: String(FREE_ALLOCATION), label: t('stat_credits') },
              { value: String(ALL_AREAS.length), label: t('stat_areas') },
              { value: String(REVERIFY_COST), label: t('stat_recheck') },
            ]}
          />
        </div>
      </div>
    </section>
  );
}
