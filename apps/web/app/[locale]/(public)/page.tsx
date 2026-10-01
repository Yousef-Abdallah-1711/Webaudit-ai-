import { getPublicMetadata } from '../../../i18n/metadata';
import type { Locale } from '../../../i18n/locales';
import { Hero } from '../../../components/marketing/hero';
import { Proof } from '../../../components/marketing/proof';
import { ProductionGap } from '../../../components/marketing/production-gap';
import { Checks } from '../../../components/marketing/checks';
import { ReportShowcase } from '../../../components/marketing/report-showcase';
import { Readiness } from '../../../components/marketing/readiness';
import { AiDevelopment } from '../../../components/marketing/ai-development';
import { Trust } from '../../../components/marketing/trust';
import { PricingPreview } from '../../../components/marketing/pricing-preview';
import { Faq } from '../../../components/marketing/faq';
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
    <LandingPage pricingPreview={<PricingPreview />} faq={<Faq />}>
      <Hero />
      <Proof />
      <ProductionGap />
      <Checks />
      <ReportShowcase />
      <Readiness />
      <AiDevelopment />
      <Trust />
    </LandingPage>
  );
}
