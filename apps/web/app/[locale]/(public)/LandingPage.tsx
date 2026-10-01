import { getTranslations } from 'next-intl/server';
import { FREE_ALLOCATION } from '@webaudit/config';
import type { ReactNode } from 'react';
import { PromoBar } from '../../../components/ui';
import { PublicPage } from '../../../components/public';

interface LandingPageProps {
  children: ReactNode;
}

export default async function LandingPage({ children }: LandingPageProps): Promise<React.ReactElement> {
  const t = await getTranslations('public');

  return (
    <div>
      <PromoBar
        message={t('promo', { freeCredits: FREE_ALLOCATION })}
        dismissLabel={t('dismiss')}
      />
      <PublicPage active="nav_product">{children}</PublicPage>
    </div>
  );
}
