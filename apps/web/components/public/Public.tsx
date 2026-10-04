'use client';

/**
 * Ported from design-system/ui_kits/marketing/Public.jsx (T240).
 *
 * Client-side auth state and next-intl hooks, along with the interactive
 * theme/language controls, keep this shared public shell client-rendered.
 *
 * `Wordmark`, `PublicHeader`, `PublicFooter`, `PublicPage` — one file, same
 * as the source. Static styling uses Tailwind utility strings; only menu
 * pseudo-elements and direction-specific transforms remain in a small CSS
 * Module. The header nav's active-vs-inactive weight/colour and the footer's
 * per-column data stay dynamic, matching the source.
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

import specialStyles from './Public.special.module.css';
import { cn } from '../../lib/cn';
import {
  focusRingBrand,
  focusRingBrandOffset,
  focusRingHighlightOffset,
  marketingPrimaryCta,
  onHeroGhostButton,
  onHeroGhostControl,
} from '../../lib/marketing-cta';

const styles = {
  wordmarkLink: cn('no-underline'),
  header: cn('relative z-20 bg-surface-marketing'),
  headerHero: cn(specialStyles.heroChrome, 'absolute inset-x-0 top-0 z-50 bg-transparent'),
  headerInner: cn('mx-auto flex h-[var(--height-landing-header)] w-[calc(100%-4rem)] max-w-marketing-header items-center gap-8 text-marketing-primary max-marketing-mobile:w-[calc(100%-2rem)] max-marketing-mobile:gap-3'),
  headerInnerHero: cn('text-marketing-inverse'),
  nav: cn('mx-auto flex items-center gap-8 max-marketing-menu:hidden'),
  navLink: cn('py-2 text-sm font-semibold text-marketing-secondary no-underline transition-colors hover:text-brand-marketing', focusRingBrandOffset),
  mobileNavLink: cn('py-3 text-marketing-primary type-body font-semibold no-underline hover:text-brand-marketing', focusRingBrandOffset),
  mobileMenuTrigger: cn('hidden size-landing-header-control shrink-0 place-items-center rounded-full border border-border-marketing-inverse bg-transparent text-marketing-inverse', focusRingHighlightOffset, 'max-marketing-menu:grid'),
  mobileDrawerClose: cn('ms-auto grid size-landing-header-control place-items-center rounded-full border border-border-marketing bg-transparent text-marketing-primary text-2xl', focusRingBrand),
  footerColLinks: cn('[&>a]:focus-visible:outline [&>a]:focus-visible:outline-2 [&>a]:focus-visible:outline-brand-marketing flex flex-col gap-2 [&>a]:text-marketing-secondary [&>a]:type-small [&>a]:no-underline [&>a]:hover:text-brand-marketing'),
  footerLink: cn(focusRingBrand, 'type-small'),
  navLinkActive: cn('text-marketing-primary font-extrabold'),
  headerActions: cn('flex items-center gap-3 max-marketing-menu:hidden'),
  mobileBackdrop: cn('fixed inset-0 z-40 border-0 bg-surface-hero/45 p-0 max-marketing-menu:block'),
  mobileDrawer: cn(specialStyles.mobileDrawer, 'fixed left-1/2 top-[calc(var(--height-landing-header)+var(--space-2))] z-50 hidden w-[calc(100vw-var(--space-marketing-drawer-gutter))] max-w-96 -translate-x-1/2 flex-col gap-5 overflow-y-auto rounded-marketing-card border border-solid border-border-marketing bg-surface-marketing-raised p-5 shadow-marketing-float max-marketing-menu:flex max-marketing-menu:invisible max-marketing-menu:max-h-[calc(100dvh-var(--height-landing-header)-var(--space-8))]'),
  menuIcon: cn(specialStyles.menuIcon, 'relative block h-hairline w-5 bg-current'),
  mobileDrawerOpen: cn(specialStyles.mobileDrawerOpen, 'max-marketing-menu:!visible'),
  mobileNav: cn('flex flex-col gap-2'),
  mobileDrawerActions: cn('mt-auto flex flex-col gap-2 [&_a]:w-full'),
  mobileDrawerControls: cn('flex flex-wrap items-center gap-3 border-y border-solid border-border-marketing py-4'),
  footer: cn('border-x-0 border-b-0 border-t border-solid border-border-marketing bg-surface-marketing-raised text-marketing-primary'),
  footerGrid: cn('mx-auto grid max-w-marketing-footer grid-cols-[1.6fr_repeat(3,minmax(0,1fr))] gap-8 px-6 pb-6 pt-marketing-footer-top max-marketing-mobile:grid-cols-2 max-marketing-mobile:gap-6 max-marketing-mobile:px-4 max-marketing-mobile:pt-9'),
  footerTag: cn('mb-0 mt-3 max-w-[34ch] type-small text-marketing-secondary text-pretty'),
  footerColTitle: cn('mb-3 text-marketing-muted text-marketing-label font-extrabold'),
  footerBottom: cn('mx-auto flex max-w-marketing-footer flex-wrap items-center gap-4 border-x-0 border-b-0 border-t border-solid border-border-marketing px-6 pb-6 pt-5 max-marketing-mobile:px-4'),
  footerCopy: cn('text-marketing-muted type-small'),
  footerZero: cn('ms-auto text-marketing-muted font-mono text-marketing-label'),
  page: cn('flex min-h-screen flex-col bg-surface-page'),
  landingPage: cn('bg-surface-marketing font-marketing text-marketing-primary'),
  pageMain: cn('flex-1'),
};

type PublicNavKey = keyof Pick<
  typeof messagesByLocale.en.navigation,
  'nav_product' | 'nav_how_it_works' | 'nav_pricing'
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
    // eslint-disable-next-line no-restricted-syntax -- preserve the exact legacy wordmark tracking
    <div dir="ltr" className="inline-block whitespace-nowrap font-bold tracking-[-0.4px] text-text-strong" style={{ fontSize: size }}>
      <span className="text-brand-marketing-contrast">{PRODUCT_NAME}</span>
    </div>
  );
}

const NAV: readonly (readonly [href: string, key: PublicNavKey])[] = [
  ['/', 'nav_product'],
  ['/#loop', 'nav_how_it_works'],
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
    const desktopViewport = window.matchMedia('(min-width: 56.3125rem)');
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
    <header className={active === 'nav_product' ? styles.headerHero : styles.header}>
      <div
        className={cn(
          styles.headerInner,
          active === 'nav_product' && styles.headerInnerHero,
        )}
        inert={mobileDrawerOpen}
      >
        <a href="/" className={styles.wordmarkLink}>
          <Wordmark />
        </a>
        <nav className={styles.nav}>
          {NAV.map(([href, key]) => (
            <a
              key={key}
              href={href}
              aria-current={active === key ? 'page' : undefined}
              className={cn(
                styles.navLink,
                active === key && styles.navLinkActive,
                active === 'nav_product' && 'text-marketing-inverse-muted hover:text-marketing-inverse focus-visible:outline-brand-highlight',
              )}
            >
              {tNavigation(key)}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
          {status === 'anonymous' && (
            <>
              <Button variant="ghost" size="sm" href="/login" className={active === 'nav_product' ? onHeroGhostButton : ''}>
                {tCommon('signin')}
              </Button>
              <Button variant="primary" size="sm" href="/signup" className={marketingPrimaryCta}>
                {tCommon('start_free')}
              </Button>
            </>
          )}
          {status === 'authenticated' && (
            <>
              <Button variant="ghost" size="sm" href="/scan" className={active === 'nav_product' ? onHeroGhostButton : ''}>
                {tNavigation('foot_dashboard')}
              </Button>
              {isOperator && (
                <Button variant="primary" size="sm" href="/admin" className={marketingPrimaryCta}>
                  {tNavigation('foot_admin')}
                </Button>
              )}
            </>
          )}
          <LangToggle className={active === 'nav_product' ? onHeroGhostControl : ''} />
          <ThemeToggle className={active === 'nav_product' ? onHeroGhostControl : ''} />
        </div>
        <button
          ref={mobileTriggerRef}
          type="button"
          className={cn(
            styles.mobileMenuTrigger,
            active !== 'nav_product' && 'border-border-marketing text-marketing-primary',
          )}
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
                  ? `${styles.mobileNavLink} text-brand-marketing font-extrabold`
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
          <LangToggle label className="text-marketing-primary" />
          <ThemeToggle label className="text-marketing-primary" />
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
              <Button variant="primary" href="/signup" fullWidth onClick={() => setMobileDrawerOpen(false)} className={marketingPrimaryCta}>
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
                <Button variant="primary" href="/admin" fullWidth onClick={() => setMobileDrawerOpen(false)} className={marketingPrimaryCta}>
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
    <footer className={styles.footer} data-approved-section="footer">
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
  hero?: React.ReactNode;
  children?: React.ReactNode;
}

export function PublicPage({ active, tint, hero, children }: PublicPageProps): ReactElement {
  const hasLandingHero = hero !== undefined;

  return (
    <div
      className={cn(styles.page, hasLandingHero && styles.landingPage, hasLandingHero && 'font-marketing')}
      style={tint !== undefined ? { background: tint } : undefined}
    >
      <PublicHeader {...(active !== undefined ? { active } : {})} />
      <main className={styles.pageMain}>
        {hero}
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}
