'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { Button, Eyebrow, PromoBar } from '../../../components/ui';
import { PublicPage } from '../../../components/public';
import type publicMessages from '../../../messages/en/public.json';
import styles from './page.module.css';

type PublicKey = keyof typeof publicMessages;

interface LandingPageProps {
  children: ReactNode;
  pricingPreview: ReactNode;
  faq: ReactNode;
}

interface WrapProps {
  children?: React.ReactNode;
}

function Wrap({ children }: WrapProps): React.ReactElement {
  return (
    <section id="loop" data-landing-section="loop" className={styles.wrap}>
      <div className={styles.wrapInner}>{children}</div>
    </section>
  );
}

const LOOP_STEPS: readonly (readonly [string, PublicKey, PublicKey])[] = [
  ['01', 'loop_1t', 'loop_1d'],
  ['02', 'loop_2t', 'loop_2d'],
  ['03', 'loop_3t', 'loop_3d'],
  ['04', 'loop_4t', 'loop_4d'],
];

function Loop(): React.ReactElement {
  const t = useTranslations('public');

  return (
    <Wrap>
      <Eyebrow tone="muted">{t('loop_eyebrow')}</Eyebrow>
      <h2 className={styles.loopH2}>{t('loop_h2')}</h2>
      <div className={styles.loopGrid}>
        {LOOP_STEPS.map(([n, title, body]) => (
          <div key={n} className={styles.loopStep}>
            <div dir="ltr" className={styles.loopNum}>
              {n}
            </div>
            <div className={styles.loopTitle}>{t(title)}</div>
            <div className={styles.loopDesc}>{t(body)}</div>
          </div>
        ))}
      </div>
    </Wrap>
  );
}

function FinalCta(): React.ReactElement {
  const t = useTranslations('public');

  return (
    <section id="final-cta" data-landing-section="final-cta" className={styles.cta}>
      <div className={styles.ctaWash} />
      <div className={styles.ctaInner}>
        <h2 className={styles.ctaH2}>{t('cta_h2')}</h2>
        <p className={styles.ctaLead}>{t('cta_lead')}</p>
        <Button href="/signup">{t('hero_cta')}</Button>
      </div>
    </section>
  );
}

export default function LandingPage({ children, pricingPreview, faq }: LandingPageProps): React.ReactElement {
  const t = useTranslations('public');

  return (
    <div>
      <PromoBar message={t('promo')} />
      <PublicPage active="nav_product">
        {children}
        <Loop />
        {pricingPreview}
        {faq}
        <FinalCta />
      </PublicPage>
    </div>
  );
}
