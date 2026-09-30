import { describe, expect, it } from 'vitest';
import { getPublicMetadata } from '../../i18n/metadata.js';

describe('public locale metadata', () => {
  it('sets the English landing canonical and all landing language alternates', () => {
    const metadata = getPublicMetadata('en', '/');

    expect(metadata.alternates).toEqual({
      canonical: '/',
      languages: {
        en: '/',
        ar: '/ar',
        'x-default': '/',
      },
    });
  });

  it('sets the Arabic landing canonical and keeps alternates identical across locales', () => {
    const englishMetadata = getPublicMetadata('en', '/');
    const arabicMetadata = getPublicMetadata('ar', '/');

    expect(arabicMetadata.alternates).toEqual({
      canonical: '/ar',
      languages: {
        en: '/',
        ar: '/ar',
        'x-default': '/',
      },
    });
    expect(arabicMetadata.alternates?.languages).toEqual(englishMetadata.alternates?.languages);
  });

  it('sets the English pricing canonical and all pricing language alternates', () => {
    const metadata = getPublicMetadata('en', '/pricing');

    expect(metadata.alternates).toEqual({
      canonical: '/pricing',
      languages: {
        en: '/pricing',
        ar: '/ar/pricing',
        'x-default': '/pricing',
      },
    });
  });

  it('sets the Arabic pricing canonical and keeps the English x-default', () => {
    const metadata = getPublicMetadata('ar', '/pricing');

    expect(metadata.alternates).toEqual({
      canonical: '/ar/pricing',
      languages: {
        en: '/pricing',
        ar: '/ar/pricing',
        'x-default': '/pricing',
      },
    });
  });

  it('provides the same nonlocalized title and description for every public locale and route', () => {
    const metadata = [
      getPublicMetadata('en', '/'),
      getPublicMetadata('ar', '/'),
      getPublicMetadata('en', '/pricing'),
      getPublicMetadata('ar', '/pricing'),
    ];

    for (const entry of metadata) {
      expect(entry.title).toBe('Fahes');
      expect(entry.description).toBe('An honest audit of your software.');
    }
    expect(new Set(metadata.map(({ title }) => title)).size).toBe(1);
    expect(new Set(metadata.map(({ description }) => description)).size).toBe(1);
  });
});
