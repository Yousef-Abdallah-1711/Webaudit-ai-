'use client';

/**
 * Ported from design-system/ui_kits/marketing/Public.jsx (T240).
 *
 * Client-side auth state and next-intl hooks, along with the interactive
 * theme/language controls, keep this shared public shell client-rendered.
 *
 * `Wordmark`, `PublicHeader`, `PublicFooter`, `PublicPage` — one file, same
 * as the source. Static styling moved to `Public.module.css` (raw px/hex
 * inline style objects fail this repo's adherence lint, T245); the header
 * nav's active-vs-inactive weight/colour and the footer's per-column data
 * stay dynamic, matching the source.
 *
 * Public navigation and footer links use existing product routes only.
 * Documentation/changelog destinations do not exist, and readiness is
 * authenticated, so neither is exposed as an anonymous footer destination.
 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
} from 'react';
import { PRODUCT_NAME } from '@webaudit/config';
import { useTranslations } from 'next-intl';
import { Button } from '../ui';
import { LangToggle, ThemeToggle } from '../../app/theme';
import { useAuth } from '../auth/AuthProvider';
import type { messagesByLocale } from '../../i18n/messages';
import styles from './Public.module.css';

type PublicNavKey = keyof Pick<
  typeof messagesByLocale.en.navigation,
  'nav_product' | 'nav_pricing'
>;
type FooterHeadingKey = keyof Pick<
  typeof messagesByLocale.en.navigation,
  'foot_product' | 'foot_pricing' | 'foot_account'
>;
type FooterItemKey =
  | keyof Pick<typeof messagesByLocale.en.common, 'signin' | 'start_free'>
  | keyof Pick<typeof messagesByLocale.en.navigation, 'nav_product' | 'foot_pricing'>
  | keyof Pick<typeof messagesByLocale.en.scan, 'credits'>
  | keyof Pick<typeof messagesByLocale.en.dashboard, 'top_up'>;

export interface WordmarkProps {
  size?: number;
}

export function Wordmark({ size = 19 }: WordmarkProps): ReactElement {
  return (
    // eslint-disable-next-line no-restricted-syntax -- preserve the exact wordmark tracking from Public.module.css
    <div dir="ltr" className="inline-block whitespace-nowrap font-bold tracking-[-0.4px] text-text-strong" style={{ fontSize: size }}>
      <span className="text-accent">{PRODUCT_NAME}</span>
    </div>
  );
}

const NAV: readonly (readonly [href: string, key: PublicNavKey])[] = [
  ['/', 'nav_product'],
  ['/pricing', 'nav_pricing'],
];

export interface PublicHeaderProps {
  active?: PublicNavKey;
}

export function PublicHeader({ active }: PublicHeaderProps): ReactElement {
  const tCommon = useTranslations('common');
  const tNavigation = useTranslations('navigation');
  const { status, isOperator } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerRef = useRef<HTMLElement>(null);
  const drawerWasOpenRef = useRef(false);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const desktopViewport = window.matchMedia('(min-width: 40.0625rem)');
    const closeOnDesktop = (): void => {
      if (desktopViewport.matches) setMobileDrawerOpen(false);
    };
    closeOnDesktop();
    desktopViewport.addEventListener('change', closeOnDesktop);
    return () => desktopViewport.removeEventListener('change', closeOnDesktop);
  }, []);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (mobileDrawerOpen) {
      drawerWasOpenRef.current = true;
      mobileDrawerRef.current?.querySelector<HTMLElement>('[data-drawer-initial-focus]')?.focus();
      return;
    }

    if (!drawerWasOpenRef.current) return;
    drawerWasOpenRef.current = false;
    mobileTriggerRef.current?.focus();
  }, [mobileDrawerOpen]);

  useEffect(() => {
    if (!mobileDrawerOpen) return;
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setMobileDrawerOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileDrawerOpen]);

  const trapDrawerFocus = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key !== 'Tab') return;
    const focusable = mobileDrawerRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  return (
    <header className={styles.header}>
      <div className={styles.headerInner} inert={mobileDrawerOpen}>
        <a href="/" className={styles.wordmarkLink}>
          <Wordmark />
        </a>
        <nav className={styles.nav}>
          {NAV.map(([href, key]) => (
            <a
              key={key}
              href={href}
              aria-current={active === key ? 'page' : undefined}
              className={
                active === key ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {tNavigation(key)}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <LangToggle />
          <ThemeToggle />
          {status === 'anonymous' && (
            <>
              <Button variant="ghost" size="sm" href="/login">
                {tCommon('signin')}
              </Button>
              <Button size="sm" href="/signup">
                {tCommon('start_free')}
              </Button>
            </>
          )}
          {status === 'authenticated' && (
            <>
              <Button variant="ghost" size="sm" href="/scan">
                {tNavigation('foot_dashboard')}
              </Button>
              {isOperator && (
                <Button size="sm" href="/admin">
                  {tNavigation('foot_admin')}
                </Button>
              )}
            </>
          )}
        </div>
        <button
          ref={mobileTriggerRef}
          type="button"
          className={styles.mobileMenuTrigger}
          aria-label={tNavigation(mobileDrawerOpen ? 'mobile_close_menu' : 'mobile_open_menu')}
          aria-controls="public-mobile-drawer"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen((isOpen) => !isOpen)}
        >
          <span aria-hidden="true" className={styles.menuIcon} />
        </button>
      </div>
      {mobileDrawerOpen && (
        <button
          type="button"
          className={styles.mobileBackdrop}
          aria-hidden="true"
          tabIndex={-1}
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      <section
        ref={mobileDrawerRef}
        id="public-mobile-drawer"
        className={
          mobileDrawerOpen
            ? `${styles.mobileDrawer} ${styles.mobileDrawerOpen}`
            : styles.mobileDrawer
        }
        role="dialog"
        aria-modal={mobileDrawerOpen || undefined}
        aria-label={tNavigation('mobile_navigation')}
        aria-hidden={!mobileDrawerOpen}
        inert={!mobileDrawerOpen}
        onKeyDown={trapDrawerFocus}
      >
        <button
          type="button"
          className={styles.mobileDrawerClose}
          aria-label={tNavigation('mobile_close_menu')}
          data-drawer-initial-focus
          onClick={() => setMobileDrawerOpen(false)}
        >
          <span aria-hidden="true">×</span>
        </button>
        <nav className={styles.mobileNav} aria-label={tNavigation('mobile_navigation')}>
          {NAV.map(([href, key]) => (
            <a
              key={key}
              href={href}
              className={
                active === key
                  ? `${styles.mobileNavLink} ${styles.navLinkActive}`
                  : styles.mobileNavLink
              }
              aria-current={active === key ? 'page' : undefined}
              onClick={() => setMobileDrawerOpen(false)}
            >
              {tNavigation(key)}
            </a>
          ))}
        </nav>
        <div className={styles.mobileDrawerControls}>
          <LangToggle label />
          <ThemeToggle label />
        </div>
        <div className={styles.mobileDrawerActions}>
          {status === 'anonymous' && (
            <>
              <Button
                variant="ghost"
                href="/login"
                fullWidth
                onClick={() => setMobileDrawerOpen(false)}
              >
                {tCommon('signin')}
              </Button>
              <Button href="/signup" fullWidth onClick={() => setMobileDrawerOpen(false)}>
                {tCommon('start_free')}
              </Button>
            </>
          )}
          {status === 'authenticated' && (
            <>
              <Button
                variant="ghost"
                href="/scan"
                fullWidth
                onClick={() => setMobileDrawerOpen(false)}
              >
                {tNavigation('foot_dashboard')}
              </Button>
              {isOperator && (
                <Button href="/admin" fullWidth onClick={() => setMobileDrawerOpen(false)}>
                  {tNavigation('foot_admin')}
                </Button>
              )}
            </>
          )}
        </div>
      </section>
    </header>
  );
}

const FOOTER_COLUMNS: readonly (readonly [
  FooterHeadingKey,
  readonly (readonly [FooterItemKey, string])[],
])[] = [
  ['foot_product', [['nav_product', '/']]],
  [
    'foot_pricing',
    [
      ['foot_pricing', '/pricing'],
      ['credits', '/pricing'],
      ['top_up', '/pricing'],
    ],
  ],
  [
    'foot_account',
    [
      ['signin', '/login'],
      ['start_free', '/signup'],
    ],
  ],
];

export function PublicFooter(): ReactElement {
  const tCommon = useTranslations('common');
  const tDashboard = useTranslations('dashboard');
  const tNavigation = useTranslations('navigation');
  const tScan = useTranslations('scan');
  const { status, isOperator } = useAuth();
  const translateFooterItem = (key: FooterItemKey): string => {
    switch (key) {
      case 'signin':
      case 'start_free':
        return tCommon(key);
      case 'nav_product':
      case 'foot_pricing':
        return tNavigation(key);
      case 'credits':
        return tScan(key);
      case 'top_up':
        return tDashboard(key);
    }
  };

  return (
    <footer className={styles.footer}>
      <div className={styles.footerGrid}>
        <div>
          <Wordmark size={17} />
          <p className={styles.footerTag}>{tNavigation('foot_tag')}</p>
        </div>
        {FOOTER_COLUMNS.map(([heading, items]) => (
          <div key={heading}>
            <div className={styles.footerColTitle}>{tNavigation(heading)}</div>
            <div className={styles.footerColLinks}>
              {items.map(([item, href]) => (
                <a key={item} href={href}>
                  {translateFooterItem(item)}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={styles.footerBottom}>
        <span className={styles.footerCopy}>© 2026 {PRODUCT_NAME}</span>
        {status === 'authenticated' && (
          <a href="/scan" className={styles.footerLink}>
            {tNavigation('foot_dashboard')}
          </a>
        )}
        {status === 'authenticated' && isOperator && (
          <a href="/admin" className={styles.footerLink}>
            {tNavigation('foot_admin')}
          </a>
        )}
        <span dir="ltr" className={styles.footerZero}>
          {tNavigation('foot_zero')}
        </span>
      </div>
    </footer>
  );
}

export interface PublicPageProps {
  active?: PublicNavKey;
  tint?: string;
  children?: React.ReactNode;
}

export function PublicPage({ active, tint, children }: PublicPageProps): ReactElement {
  return (
    <div className={styles.page} style={tint !== undefined ? { background: tint } : undefined}>
      <PublicHeader {...(active !== undefined ? { active } : {})} />
      <main className={styles.pageMain}>{children}</main>
      <PublicFooter />
    </div>
  );
}
