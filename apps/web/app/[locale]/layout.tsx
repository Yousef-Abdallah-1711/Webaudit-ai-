import { notFound } from 'next/navigation';
import { setRequestLocale } from 'next-intl/server';
import { locales, type Locale } from '../../i18n/locales';
import { LocaleScope } from '../theme';

function isLocale(value: string): value is Locale {
  return locales.includes(value as Locale);
}

export function generateStaticParams(): Array<{ locale: Locale }> {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}>): Promise<React.ReactElement> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  setRequestLocale(locale);
  return <LocaleScope locale={locale}>{children}</LocaleScope>;
}
