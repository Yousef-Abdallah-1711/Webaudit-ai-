import { getPublicMetadata } from '../../../../i18n/metadata';
import type { Locale } from '../../../../i18n/locales';
import PricingPage from './PricingPage';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  return getPublicMetadata(locale, '/pricing');
}

export default function Page(): React.ReactElement {
  return <PricingPage />;
}
