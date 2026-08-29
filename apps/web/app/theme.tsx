'use client';

/**
 * Ported from design-system/ui_kits/theme.jsx (T248).
 *
 * The source is a module-scope pub-sub store: `waStore` calls
 * `document.documentElement.setAttribute(...)` the moment the module loads,
 * which is fine in the design system's client-only preview but not here —
 * Next renders this module on the server first, where `document` and
 * `localStorage` don't exist. Every place the source touched either
 * unconditionally is now guarded on `typeof window !== 'undefined'`; nothing
 * else about the store, the hooks, or the two toggle components changed.
 *
 * The source has no equivalent of `ThemeScript` — it didn't need one, since
 * it never faced a server-rendered first paint. `ThemeScript` is the "no
 * flash" piece the T248 task text calls for: an inline, synchronous script
 * that applies the stored theme/lang to `<html>` before the browser paints
 * anything, so the client bundle finishing later (and this module's own
 * store re-deriving the same value) is a no-op, not a visible flip. Render
 * it once, in the root layout's `<head>`.
 */
import { useEffect, useReducer } from 'react';
import { WA_STRINGS, type Lang, type StringKey } from '../lib/strings';
import styles from './theme.module.css';

const isBrowser = typeof window !== 'undefined';

function waRead(key: string, fallback: string): string {
  if (!isBrowser) return fallback;
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

interface Store<T extends string> {
  v: T;
  subs: Set<() => void>;
  set(next: T): void;
}

function createStore<T extends string>(
  key: string,
  initial: T,
  apply: (value: T) => void,
): Store<T> {
  const store: Store<T> = {
    v: waRead(key, initial) as T,
    subs: new Set(),
    set(next) {
      store.v = next;
      if (isBrowser) {
        try {
          localStorage.setItem(key, next);
        } catch {
          // storage unavailable (private mode, quota) — in-memory state still updates
        }
      }
      apply(next);
      store.subs.forEach((notify) => {
        notify();
      });
    },
  };
  if (isBrowser) apply(store.v);
  return store;
}

type Theme = 'light' | 'dark';

const waTheme = createStore<Theme>('wa-theme', 'light', (value) => {
  document.documentElement.setAttribute('data-theme', value);
});

const waLang = createStore<Lang>('wa-lang', 'en', (value) => {
  const html = document.documentElement;
  html.lang = value;
  html.dir = value === 'ar' ? 'rtl' : 'ltr';
});

function waUse<T extends string>(store: Store<T>): [T, (value: T) => void] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    store.subs.add(force);
    return () => {
      store.subs.delete(force);
    };
  }, [store, force]);
  return [store.v, (value: T) => store.set(value)];
}

export function useTheme(): [Theme, (value: Theme) => void] {
  return waUse(waTheme);
}

export function useLang(): [Lang, (value: Lang) => void] {
  return waUse(waLang);
}

export function useT(): [(key: StringKey) => string, Lang, (value: Lang) => void] {
  const [lang, setLang] = useLang();
  const t = (key: StringKey): string => WA_STRINGS[lang][key] ?? WA_STRINGS.en[key] ?? key;
  return [t, lang, setLang];
}

/**
 * Reads `wa-theme`/`wa-lang` and applies them to `<html>` before first
 * paint. Render once in the root layout's `<head>`.
 */
export function ThemeScript(): React.ReactElement {
  const script = `(function(){try{
    var t=localStorage.getItem('wa-theme')||'light';
    var l=localStorage.getItem('wa-lang')||'en';
    var h=document.documentElement;
    h.setAttribute('data-theme',t);
    h.lang=l;h.dir=l==='ar'?'rtl':'ltr';
  }catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}

const SUN_PATH =
  'M12 4V2m0 20v-2m8-8h2M2 12h2m13.7-5.7 1.4-1.4M4.9 19.1l1.4-1.4m11.4 0 1.4 1.4M4.9 4.9l1.4 1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z';
const MOON_PATH = 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z';
const GLOBE_PATH =
  'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c2.5 2.4 2.5 15.6 0 18M12 3C9.5 5.4 9.5 18.6 12 21';

export interface ThemeToggleProps {
  compact?: boolean;
  label?: boolean;
}

export function ThemeToggle({
  compact = false,
  label = false,
}: ThemeToggleProps): React.ReactElement {
  const [theme, setTheme] = useTheme();
  const dark = theme === 'dark';
  const [t] = useT();

  const classes = [
    styles.toggle,
    styles.themeToggle,
    compact ? styles.compact : undefined,
    label ? styles.labeled : undefined,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      onClick={() => {
        setTheme(dark ? 'light' : 'dark');
      }}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={dark ? 'Light' : 'Dark'}
      className={classes}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={dark ? MOON_PATH : SUN_PATH} />
      </svg>
      {label && <span>{dark ? t('theme_dark') : t('theme_light')}</span>}
    </button>
  );
}

export interface LangToggleProps {
  label?: boolean;
}

export function LangToggle({ label = false }: LangToggleProps): React.ReactElement {
  const [lang, setLang] = useLang();
  const next: Lang = lang === 'ar' ? 'en' : 'ar';

  const classes = [styles.toggle, styles.langToggle, label ? styles.labeled : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      onClick={() => {
        setLang(next);
      }}
      aria-label={`Switch to ${next === 'ar' ? 'Arabic' : 'English'}`}
      title={next === 'ar' ? 'العربية' : 'English'}
      className={classes}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d={GLOBE_PATH} />
      </svg>
      <span>{lang === 'ar' ? 'EN' : 'ع'}</span>
    </button>
  );
}
