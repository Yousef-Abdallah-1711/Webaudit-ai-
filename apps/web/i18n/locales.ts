export const localeMetadata = {
  en: { label: 'English', shortLabel: 'EN', direction: 'ltr' },
  ar: { label: 'العربية', shortLabel: 'ع', direction: 'rtl' },
} as const;

export type Locale = keyof typeof localeMetadata;
export const locales = Object.keys(localeMetadata) as [Locale, ...Locale[]];
export const defaultLocale: Locale = 'en';
