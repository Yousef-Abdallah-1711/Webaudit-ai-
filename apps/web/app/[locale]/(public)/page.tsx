import { getPublicMetadata } from '../../../i18n/metadata';
import type { Locale } from '../../../i18n/locales';
import { Hero } from '../../../components/marketing/hero';
import { Proof } from '../../../components/marketing/proof';
import { ProductionGap } from '../../../components/marketing/production-gap';
import { Checks } from '../../../components/marketing/checks';
import LandingPage from './LandingPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return getPublicMetadata(locale, '/');
}

export default function Page(): React.ReactElement {
  return (
    <LandingPage>
      <Hero />
      <Proof />
      <ProductionGap />
      <Checks />
    </LandingPage>
  );
}
