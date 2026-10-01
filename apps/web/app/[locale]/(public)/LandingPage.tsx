import { getTranslations } from 'next-intl/server';
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
      <PromoBar message={t('promo')} />
      <PublicPage active="nav_product">{children}</PublicPage>
    </div>
  );
}
