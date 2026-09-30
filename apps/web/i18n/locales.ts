export const localeMetadata = {
  en: { label: 'English', direction: 'ltr' },
  ar: { label: 'العربية', direction: 'rtl' },
} as const;

export type Locale = keyof typeof localeMetadata;
export const locales = Object.keys(localeMetadata) as [Locale, ...Locale[]];
export const defaultLocale: Locale = 'en';
