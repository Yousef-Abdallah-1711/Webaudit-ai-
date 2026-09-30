import { getPublicMetadata } from '../../../i18n/metadata';
import type { Locale } from '../../../i18n/locales';
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
  return <LandingPage />;
}
