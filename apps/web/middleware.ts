import { NextRequest, type NextResponse } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { defaultLocale, localeMetadata, type Locale } from './i18n/locales';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && Object.hasOwn(localeMetadata, value);
}

function detectLocale(request: NextRequest): Locale {
  const saved = request.cookies.get('wa-lang')?.value;
  if (isLocale(saved)) return saved;

  const languages = request.headers
    .get('accept-language')
    ?.split(',')
    .map((part) => ({
      language: part.split(';')[0]?.trim().toLowerCase(),
      quality: Number(part.match(/q=([0-9.]+)/)?.[1] ?? 1),
    }))
    .filter((part) => part.language && part.quality > 0)
    .sort((a, b) => b.quality - a.quality);

  for (const { language } of languages ?? []) {
    if (isLocale(language)) return language;
    const base = language?.split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

export function middleware(request: NextRequest): NextResponse {
  const prefixedLocale = request.nextUrl.pathname.match(/^\/(en|ar)(?:\/|$)/)?.[1];
  const locale = prefixedLocale && isLocale(prefixedLocale) ? prefixedLocale : detectLocale(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-wa-locale', locale);
  const localizedRequest = new NextRequest(request, { headers: requestHeaders });
  const response = handleI18nRouting(localizedRequest);
  response.headers.set('x-wa-locale', locale);
  return response;
}

export const config = {
  matcher: ['/', '/pricing', '/ar', '/ar/pricing'],
};
