import { getPublicMetadata } from '../../../i18n/metadata';
import type { Locale } from '../../../i18n/locales';
import { Hero } from '../../../components/marketing/hero';
import { ProductionGap } from '../../../components/marketing/production-gap';
import { AuditAreas } from '../../../components/marketing/audit-areas';
import { ReportShowcase } from '../../../components/marketing/report-showcase';
import { Readiness } from '../../../components/marketing/readiness';
import { Remediation } from '../../../components/marketing/remediation';
import { Trust } from '../../../components/marketing/trust';
import { Loop } from '../../../components/marketing/loop';
import { PricingPreview } from '../../../components/marketing/pricing-preview';
import { Faq } from '../../../components/marketing/faq';
import { FinalCta } from '../../../components/marketing/final-cta';
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
    <LandingPage hero={<Hero />}>
      <ReportShowcase />
      <ProductionGap />
      <Loop />
      <Readiness />
      <Remediation />
      <Trust />
      <AuditAreas />
      <PricingPreview />
      <Faq />
      <FinalCta />
    </LandingPage>
  );
}
