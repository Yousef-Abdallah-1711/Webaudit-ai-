import type { Metadata } from 'next';
import { PRODUCT_NAME } from '@webaudit/config';
import { defaultLocale, locales, type Locale } from './locales';

function publicPath(locale: Locale, pathname: '/' | '/pricing'): string {
  const path = pathname === '/' ? '' : pathname;
  return locale === defaultLocale ? pathname : `/${locale}${path}`;
}

export function getPublicMetadata(locale: Locale, pathname: '/' | '/pricing'): Metadata {
  return {
    title: PRODUCT_NAME,
    description: 'An honest audit of your software.',
    alternates: {
      canonical: publicPath(locale, pathname),
      languages: {
        ...Object.fromEntries(locales.map((available) => [available, publicPath(available, pathname)])),
        'x-default': publicPath(defaultLocale, pathname),
      },
    },
  };
}
