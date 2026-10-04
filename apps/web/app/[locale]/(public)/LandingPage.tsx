import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION } from '@webaudit/config';
import type { ReactNode } from 'react';
import { PromoBar } from '../../../components/ui';
import { PublicPage } from '../../../components/public';

interface LandingPageProps {
  hero: ReactNode;
  children: ReactNode;
}

export default async function LandingPage({
  hero,
  children,
}: LandingPageProps): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <PublicPage
      active="nav_product"
      promo={
        <PromoBar
          message={t('promo', { freeCredits: FREE_ALLOCATION })}
          dismissLabel={t('dismiss')}
          className="h-landing-promo py-0 text-xs"
        />
      }
      hero={hero}
    >
      {children}
    </PublicPage>
  );
}
