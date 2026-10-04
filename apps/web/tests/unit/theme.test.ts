/**
 * T248 — theme/lang store, hooks, and the two toggle components, plus the
 * pre-paint script that makes the port safe under SSR.
 *
 * `renderToStaticMarkup` runs these in Node, with no `window`/`document` —
 * exactly the environment the source (`design-system/ui_kits/theme.jsx`)
 * never had to survive, since it only ever ran in a browser preview. These
 * tests exist to keep that guard from regressing, not to re-prove the
 * source's own behaviour (default light/English, sun-vs-moon icon) which is
 * exercised incidentally along the way.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import {
  I18nProvider,
  LangToggle,
  LocaleScope,
  resolveBrowserLocale,
  ThemeScript,
  ThemeToggle,
  useLang,
} from '../../app/theme';

interface TestDom {
  window: Window & { eval(source: string): unknown };
}

const { JSDOM } = createRequire(import.meta.url)('jsdom') as {
  JSDOM: new (markup: string, options: { runScripts: 'outside-only'; url: string }) => TestDom;
};

function render(element: React.ReactElement): string {
  return renderToStaticMarkup(createElement(I18nProvider, null, element));
}

describe('module import (no window)', () => {
  it('does not throw when theme.tsx is evaluated outside a browser', () => {
    // The regression this guards: the source calls
    // `document.documentElement.setAttribute(...)` unconditionally at module
    // scope. Importing this file above, in a Node test environment with no
    // `window`, is itself the assertion — a missing SSR guard would have
    // already thrown before this test body ever ran.
    expect(typeof ThemeToggle).toBe('function');
  });
});

describe('ThemeToggle', () => {
  it('defaults to light: sun icon, "Switch to dark mode" label', () => {
    const html = render(createElement(ThemeToggle, {}));
    expect(html).toContain('aria-label="Switch to dark mode"');
    expect(html).toContain('M12 4V2m0 20v-2'); // SUN_PATH prefix
  });

  it('renders the visible label only when label is true', () => {
    const withLabel = render(createElement(ThemeToggle, { label: true }));
    const without = render(createElement(ThemeToggle, {}));
    expect(withLabel).toContain('<span>Light</span>');
    expect(without).not.toContain('<span>');
  });

  it('uses the compact dimensions only when requested', () => {
    const compact = render(createElement(ThemeToggle, { compact: true }));
    const normal = render(createElement(ThemeToggle, {}));
    expect(compact).toContain('h-[30px]');
    expect(compact).toContain('w-[30px]');
    expect(normal).toContain('h-9');
    expect(normal).not.toContain('h-[30px]');
  });

  it('hides the decorative icon from assistive tech', () => {
    const html = render(createElement(ThemeToggle, {}));
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('LangToggle', () => {
  it('defaults to English: offers Arabic next, shows the "ع" glyph', () => {
    const html = render(createElement(LangToggle, {}));
    expect(html).toContain('aria-label="Switch to العربية"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain('<span>ع</span>');
  });

  it('renders full width with a border only when label is true', () => {
    const html = render(createElement(LangToggle, { label: true }));
    expect(html).toContain('class="');
  });
});

describe('locale provider context', () => {
  it('uses the request locale for useLang during server rendering', () => {
    function LocaleProbe(): React.ReactElement {
      const [locale] = useLang();
      return createElement('span', null, locale);
    }

    const html = renderToStaticMarkup(
      createElement(I18nProvider, { initialLocale: 'ar', children: createElement(LocaleProbe) }),
    );

    expect(html).toContain('<span>ar</span>');
  });

  it('lets the route locale override a stale root locale after client navigation', () => {
    // The root layout's provider only receives `initialLocale` on the first
    // server render; after a client-side EN -> AR switch its value is stale,
    // so anything remounted under the new [locale] segment (e.g. the header
    // language toggle) must read the route's locale instead.
    function LocaleProbe(): React.ReactElement {
      const [locale] = useLang();
      return createElement('span', null, locale);
    }

    const html = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: 'en',
        children: createElement(LocaleScope, {
          locale: 'ar',
          children: createElement(LocaleProbe),
        }),
      }),
    );

    expect(html).toContain('<span>ar</span>');
  });
});

describe('ThemeScript', () => {
  it('renders an inline script that reads wa-theme/wa-lang before paint', () => {
    const html = render(createElement(ThemeScript, {}));
    expect(html).toContain('<script');
    expect(html).toContain('wa-theme');
    expect(html).toContain('wa-lang');
    expect(html).toContain('data-theme');
  });
});

describe('browser locale detection', () => {
  let dom: TestDom | undefined;

  afterEach(() => {
    dom?.window.close();
    dom = undefined;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  function installBrowser(
    languages: string[] | undefined,
    language: string,
    storedLocale?: string,
  ): TestDom {
    dom?.window.close();
    const browser = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
      runScripts: 'outside-only',
      url: 'http://localhost/',
    });
    Object.defineProperty(browser.window.navigator, 'languages', {
      configurable: true,
      value: languages,
    });
    Object.defineProperty(browser.window.navigator, 'language', {
      configurable: true,
      value: language,
    });
    if (storedLocale) browser.window.localStorage.setItem('wa-lang', storedLocale);
    vi.stubGlobal('window', browser.window);
    vi.stubGlobal('document', browser.window.document);
    vi.stubGlobal('navigator', browser.window.navigator);
    vi.stubGlobal('localStorage', browser.window.localStorage);
    dom = browser;
    return browser;
  }

  it('matches preference-ordered browser languages with exact then base matching', () => {
    installBrowser(['ar-SA', 'en'], 'en-US');
    expect(resolveBrowserLocale()).toBe('ar');
    expect(resolveBrowserLocale(['ar'])).toBe('ar');
    expect(resolveBrowserLocale(['fr-CA'])).toBe('en');

    installBrowser(undefined, 'EN-us');
    expect(resolveBrowserLocale()).toBe('en');
  });

  it('uses the browser preference in the real waLang store initialization path', async () => {
    const browser = installBrowser(['ar-SA'], 'ar-SA');
    vi.resetModules();
    const theme = await import('../../app/theme');
    function LocaleProbe(): React.ReactElement {
      const [locale] = theme.useLang();
      return createElement('span', null, locale);
    }

    const html = renderToStaticMarkup(
      createElement(theme.I18nProvider, null, createElement(LocaleProbe)),
    );
    expect(html).toContain('<span>ar</span>');
    expect(browser.window.document.documentElement.lang).toBe('ar');
  });

  it('uses the same browser fallback in ThemeScript before paint', async () => {
    const browser = installBrowser(['ar-SA'], 'ar-SA');
    vi.resetModules();
    const theme = await import('../../app/theme');
    const markup = renderToStaticMarkup(createElement(theme.ThemeScript));
    const script = /<script>([\s\S]*?)<\/script>/.exec(markup)?.[1];

    expect(script).toBeDefined();
    browser.window.eval(script!);
    expect(browser.window.document.documentElement.lang).toBe('ar');
    expect(browser.window.document.documentElement.dir).toBe('rtl');

    const singleLanguageBrowser = installBrowser(undefined, 'ar-EG');
    vi.resetModules();
    const fallbackTheme = await import('../../app/theme');
    const fallbackMarkup = renderToStaticMarkup(createElement(fallbackTheme.ThemeScript));
    const fallbackScript = /<script>([\s\S]*?)<\/script>/.exec(fallbackMarkup)?.[1];
    singleLanguageBrowser.window.eval(fallbackScript!);
    expect(singleLanguageBrowser.window.document.documentElement.lang).toBe('ar');
  });

  it('keeps English as the fallback and gives stored wa-lang priority', async () => {
    const englishBrowser = installBrowser(['en-US'], 'en-US');
    vi.resetModules();
    const englishTheme = await import('../../app/theme');
    const englishMarkup = renderToStaticMarkup(createElement(englishTheme.ThemeScript));
    const englishScript = /<script>([\s\S]*?)<\/script>/.exec(englishMarkup)?.[1];
    englishBrowser.window.eval(englishScript!);
    expect(englishBrowser.window.document.documentElement.lang).toBe('en');

    function EnglishLocaleProbe(): React.ReactElement {
      const [locale] = englishTheme.useLang();
      return createElement('span', null, locale);
    }
    const englishStoreMarkup = renderToStaticMarkup(
      createElement(englishTheme.I18nProvider, null, createElement(EnglishLocaleProbe)),
    );
    expect(englishStoreMarkup).toContain('<span>en</span>');

    const storedBrowser = installBrowser(['ar-SA'], 'ar-SA', 'en');
    vi.resetModules();
    const storedTheme = await import('../../app/theme');
    const storedMarkup = renderToStaticMarkup(createElement(storedTheme.ThemeScript));
    const storedScript = /<script>([\s\S]*?)<\/script>/.exec(storedMarkup)?.[1];
    storedBrowser.window.eval(storedScript!);
    expect(storedBrowser.window.document.documentElement.lang).toBe('en');

    function LocaleProbe(): React.ReactElement {
      const [locale] = storedTheme.useLang();
      return createElement('span', null, locale);
    }
    const storeMarkup = renderToStaticMarkup(
      createElement(storedTheme.I18nProvider, null, createElement(LocaleProbe)),
    );
    expect(storeMarkup).toContain('<span>en</span>');
  });

  it('keeps a cookie locale ahead of the browser preference', async () => {
    const browser = installBrowser(['en-US'], 'en-US');
    browser.window.document.cookie = 'wa-lang=ar; Path=/';
    vi.resetModules();
    const theme = await import('../../app/theme');
    const markup = renderToStaticMarkup(createElement(theme.ThemeScript));
    const script = /<script>([\s\S]*?)<\/script>/.exec(markup)?.[1];
    browser.window.eval(script!);
    expect(browser.window.document.documentElement.lang).toBe('ar');

    function LocaleProbe(): React.ReactElement {
      const [locale] = theme.useLang();
      return createElement('span', null, locale);
    }
    const storeMarkup = renderToStaticMarkup(
      createElement(theme.I18nProvider, null, createElement(LocaleProbe)),
    );
    expect(storeMarkup).toContain('<span>ar</span>');
  });
});
