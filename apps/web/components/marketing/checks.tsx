import { getTranslations } from 'next-intl/server';
import { ALL_AREAS, AREA_COST, FULL_AUDIT_COST, SUM_OF_AREAS } from '@webaudit/config';
import type enPublic from '../../messages/en/public.json';
import { Eyebrow } from '../ui';

import { cn } from '../../lib/cn';

const styles = {
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 640px
  section: cn('py-20 px-6 bg-surface-page max-[1024px]:py-16 max-[640px]:py-12 max-[640px]:px-4'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  header: cn('max-w-[58ch] mb-8 max-[640px]:mb-6'),
  heading: cn('mt-3 mb-0 type-h2  text-balance '),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  intro: cn('mt-3 mb-0 text-text-secondary type-body-lg text-pretty max-[640px]:type-body max-[640px]:tracking-normal'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoints at 768px and 640px
  bento: cn('grid grid-cols-12 gap-3 m-0 p-0 list-none max-[768px]:gap-2 max-[640px]:grid-cols-6 max-[640px]:gap-2'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  area: cn('flex flex-col justify-between min-w-0 min-h-[clamp(var(--space-16),_18vw,_9.5rem)] py-5 px-5 border-border-default border-hairline border-solid bg-surface-raised max-[768px]:min-h-[clamp(var(--space-16),_20vw,_8.5rem)] max-[768px]:py-4 max-[768px]:px-4 max-[640px]:min-h-0 max-[640px]:py-4 max-[640px]:px-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 768px, 640px; preserve the source responsive clamp expression; no spacing token expresses this fluid value; preserve the component-specific intrinsic value where no configured utility token matches
  performance: cn('col-span-7 row-span-2 min-h-[clamp(var(--space-20),_28vw,_15.75rem)] bg-surface-sunken max-[1024px]:col-span-7 max-[768px]:min-h-[clamp(var(--space-20),_29vw,_13.75rem)] max-[640px]:col-span-6 max-[640px]:row-auto'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 640px
  security: cn('col-span-5 max-[1024px]:col-span-5 max-[640px]:col-span-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 640px
  design: cn('col-span-5 max-[1024px]:col-span-6 max-[640px]:col-span-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 640px
  testing: cn('col-span-4 max-[1024px]:col-span-3 max-[640px]:col-span-6'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 1024px, 640px
  seo: cn('col-span-3 max-[1024px]:col-span-3 max-[640px]:col-span-6'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  areaHeading: cn('flex items-baseline justify-between gap-3 max-[640px]:items-start max-[640px]:flex-col max-[640px]:gap-1'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 768px, 640px
  name: cn('m-0 text-text-strong type-card-title text-balance max-[768px]:type-body-bold max-[640px]:type-body-bold'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint at 640px
  performanceName: cn('type-h3 max-[640px]:type-body-bold'),
  cost: cn('flex-none text-text-muted type-small leading-5 !font-mono'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  description: cn('max-w-[52ch] mt-6 mb-0 text-text-secondary type-small text-pretty max-[640px]:mt-3'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  note: cn('max-w-[66ch] mt-4 mb-0 text-text-muted type-small text-pretty'),
};

type PublicKey = keyof typeof enPublic;

const AREAS: readonly (readonly [PublicKey, PublicKey, number, string])[] = [
  ['a_perf', 'a_perf_d', AREA_COST.PERFORMANCE, styles.performance],
  ['a_sec', 'a_sec_d', AREA_COST.SECURITY, styles.security],
  ['a_des', 'a_des_d', AREA_COST.UI, styles.design],
  ['a_test', 'a_test_d', AREA_COST.TESTING, styles.testing],
  ['a_seo', 'a_seo_d', AREA_COST.SEO, styles.seo],
];

export async function Checks(): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <section id="areas" data-landing-section="areas" className={styles.section}>
      <div className={cn('max-w-marketing mx-auto')}>
        <header className={styles.header}>
          <Eyebrow tone="muted">{t('areas_eyebrow', { areaCount: ALL_AREAS.length })}</Eyebrow>
          <h2 className={styles.heading}>{t('areas_h2')}</h2>
          <p className={styles.intro}>{t('areas_intro')}</p>
        </header>
        <ul className={styles.bento}>
          {AREAS.map(([name, description, credits, layout]) => (
            <li className={`${styles.area} ${layout}`} key={name}>
              <div className={styles.areaHeading}>
                <h3
                  className={cn(styles.name, name === 'a_perf' && styles.performanceName)}
                >
                  {t(name)}
                </h3>
                <span dir="ltr" className={styles.cost}>
                  {t('area_cost', { credits })}
                </span>
              </div>
              <p className={styles.description}>{t(description)}</p>
            </li>
          ))}
        </ul>
        <p className={styles.note}>
          {t('areas_note', {
            areaCount: ALL_AREAS.length,
            individualCost: SUM_OF_AREAS,
            fullAuditCost: FULL_AUDIT_COST,
          })}
        </p>
      </div>
    </section>
  );
}
