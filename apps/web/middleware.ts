import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, localeMetadata, type Locale } from './i18n/locales';

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
  const locale = detectLocale(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-wa-locale', locale);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-wa-locale', locale);
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
