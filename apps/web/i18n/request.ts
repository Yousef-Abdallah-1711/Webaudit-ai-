import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { defaultLocale, localeMetadata, type Locale } from './locales';
import { messagesByLocale } from './messages';

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && Object.hasOwn(localeMetadata, value);
}

function localeFromAcceptLanguage(value: string | null): Locale | undefined {
  if (!value) return undefined;
  const preferred = value
    .split(',')
    .map((entry) => ({
      language: entry.split(';')[0]?.trim().toLowerCase(),
      quality: Number(entry.match(/q=([0-9.]+)/)?.[1] ?? 1),
    }))
    .filter((entry) => entry.language && entry.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { language } of preferred) {
    if (isLocale(language)) return language;
    const base = language?.split('-')[0];
    if (isLocale(base)) return base;
  }
  return undefined;
}

export default getRequestConfig(async () => {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const headerLocale = requestHeaders.get('x-wa-locale') ?? undefined;
  const cookieLocale = cookieStore.get('wa-lang')?.value;
  const detected = isLocale(headerLocale)
    ? headerLocale
    : isLocale(cookieLocale)
      ? cookieLocale
      : localeFromAcceptLanguage(requestHeaders.get('accept-language')) ?? defaultLocale;

  return {
    locale: detected,
    messages: messagesByLocale[detected],
  };
});
