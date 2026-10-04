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

const styles = {
  wordmarkLink: cn('no-underline'),
  header: cn('sticky top-0 z-20 bg-transparent px-4 pt-3 pb-3'),
  headerHero: cn('relative z-20 bg-transparent px-0 pt-0 pb-3.5'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  headerInner: cn('flex items-center gap-6 h-control my-0 mx-auto px-4 rounded-card border border-hairline border-border-default border-solid bg-surface-raised shadow-card max-[640px]:gap-3 max-[640px]:px-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source 640px mobile header controls
  headerInnerHero: cn('max-w-landing-hero h-landing-header rounded-landing-nav max-[640px]:gap-3 max-[640px]:px-3'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  nav: cn('flex gap-4 max-[640px]:hidden'),
  navLink: cn('py-2 text-text-secondary text-[0.875rem] font-normal no-underline transition-colors hover:text-text-strong focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-ring focus-visible:outline-offset-2'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileNavLink: cn('hover:text-text-strong focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-ring focus-visible:outline-offset-2 max-[640px]:py-3 max-[640px]:text-text-secondary max-[640px]:type-body max-[640px]:tracking-normal max-[640px]:no-underline'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileMenuTrigger: cn('focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-ring focus-visible:outline-offset-2 hidden max-[640px]:grid max-[640px]:place-items-center max-[640px]:w-control max-[640px]:h-control max-[640px]:ms-auto max-[640px]:p-0 max-[640px]:border-0 max-[640px]:text-text-strong max-[640px]:bg-transparent max-[640px]:cursor-pointer'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileDrawerClose: cn('focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-ring focus-visible:outline-offset-2 max-[640px]:self-end max-[640px]:w-control max-[640px]:h-control max-[640px]:p-0 max-[640px]:border-0 max-[640px]:text-text-strong max-[640px]:bg-transparent max-[640px]:type-h3 max-[640px]:cursor-pointer'),
  footerColLinks: cn('[&>a]:focus-visible:outline [&>a]:focus-visible:outline-1 [&>a]:focus-visible:outline-accent-ring [&>a]:focus-visible:outline-offset-2 flex flex-col gap-2 [&>a]:text-text-secondary [&>a]:type-small [&>a]:no-underline [&>a]:hover:text-text-strong'),
  footerLink: cn('focus-visible:outline focus-visible:outline-1 focus-visible:outline-accent-ring focus-visible:outline-offset-2 type-small'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source breakpoint at 640px and force the active style past the responsive body token
  navLinkActive: cn('text-text-strong font-semibold max-[640px]:!text-text-strong max-[640px]:!font-semibold'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  headerActions: cn('flex items-center gap-2 ms-auto max-[640px]:hidden'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the intrinsic overlay stacking index 1
  mobileBackdrop: cn('hidden max-[640px]:block max-[640px]:fixed max-[640px]:inset-0 max-[640px]:z-[1] max-[640px]:p-0 max-[640px]:border-0 max-[640px]:bg-[color-mix(in_srgb,var(--text-strong)_42%,transparent)]'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the intrinsic drawer size and stacking index 2, which have no configured equivalent
  mobileDrawer: cn(specialStyles.mobileDrawer, 'hidden max-[640px]:flex max-[640px]:fixed max-[640px]:start-0 max-[640px]:inset-y-0 max-[640px]:z-[2] max-[640px]:w-[min(20rem,88vw)] max-[640px]:flex-col max-[640px]:gap-6 max-[640px]:py-6 max-[640px]:px-5 max-[640px]:overflow-y-auto max-[640px]:invisible max-[640px]:border-0 max-[640px]:border-border-default max-[640px]:border-e-hairline max-[640px]:border-solid max-[640px]:bg-surface-page'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve the component-specific intrinsic value where no configured utility token matches
  menuIcon: cn(specialStyles.menuIcon, 'max-[640px]:block max-[640px]:w-5 max-[640px]:h-hairline max-[640px]:bg-current max-[640px]:relative'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileDrawerOpen: cn(specialStyles.mobileDrawerOpen, 'max-[640px]:!visible'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileNav: cn('max-[640px]:flex max-[640px]:flex-col max-[640px]:gap-2'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileDrawerActions: cn('max-[640px]:flex max-[640px]:flex-col max-[640px]:gap-2 max-[640px]:mt-auto'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px
  mobileDrawerControls: cn('max-[640px]:flex max-[640px]:flex-wrap max-[640px]:items-center max-[640px]:gap-2'),
  footer: cn('bg-surface-raised border-x-0 border-b-0 border-border-default border-t-hairline border-solid'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the source CSS breakpoint(s) at 640px; preserve this component-specific grid track ratio; no predefined grid utility matches it; preserve the component-specific intrinsic value where no configured utility token matches
  footerGrid: cn('grid grid-cols-[1.6fr_repeat(3,_1fr)] gap-8 max-w-public-shell my-0 mx-auto pt-12 px-6 pb-6 max-[640px]:grid-cols-1 max-[640px]:gap-6 max-[640px]:pt-8 max-[640px]:px-4 max-[640px]:pb-6'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  footerTag: cn('max-w-[34ch] mt-3 mb-0 type-small text-text-secondary text-pretty'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the component-specific intrinsic value where no configured utility token matches
  footerColTitle: cn('mb-3 text-text-muted type-eyebrow text-[11px] uppercase'),
  //  preserve the component-specific intrinsic value where no configured utility token matches
  footerBottom: cn('flex flex-wrap items-center gap-4 max-w-public-shell my-0 mx-auto pt-5 px-6 pb-8 border-x-0 border-b-0 border-border-default border-t-hairline border-solid'),
  footerCopy: cn('text-text-muted type-small'),
  footerZero: cn('ms-auto text-text-muted font-mono text-[0.75rem]'),
  page: cn('flex min-h-screen flex-col bg-surface-page'),
  landingPage: cn('bg-surface-marketing'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the 900px frame gutter change in the H15 responsive composition
  landingStage: cn('mx-auto w-full max-w-landing-frame px-7 max-[900px]:px-2.5'),
  landingFrame: cn('overflow-hidden rounded-landing-frame border border-solid border-border-default bg-surface-marketing shadow-card'),
  // eslint-disable-next-line no-restricted-syntax -- preserve the H15 900px frame inset and vertical transition
  landingHeroBand: cn('bg-surface-marketing px-6 pt-3.5 pb-6 max-[900px]:px-2.5 max-[900px]:pt-2.5 max-[900px]:pb-3'),
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
      <span className="text-accent">{PRODUCT_NAME}</span>
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
    <header className={active === 'nav_product' ? styles.headerHero : styles.header}>
      <div
        className={cn(
          styles.headerInner,
          active === 'nav_product' ? styles.headerInnerHero : 'max-w-public-shell',
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
              className={
                active === key ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink
              }
            >
              {tNavigation(key)}
            </a>
          ))}
        </nav>
        <div className={styles.headerActions}>
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
          <LangToggle />
          <ThemeToggle />
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
  promo?: React.ReactNode;
  hero?: React.ReactNode;
  children?: React.ReactNode;
}

export function PublicPage({ active, tint, promo, hero, children }: PublicPageProps): ReactElement {
  const hasLandingHero = promo !== undefined && hero !== undefined;

  return (
    <div
      className={cn(styles.page, hasLandingHero && styles.landingPage)}
      style={tint !== undefined ? { background: tint } : undefined}
    >
      {hasLandingHero ? (
        <div className={styles.landingStage}>
          <div className={styles.landingFrame}>
            {promo}
            <div className={styles.landingHeroBand}>
              <PublicHeader {...(active !== undefined ? { active } : {})} />
              {hero}
            </div>
          </div>
        </div>
      ) : (
        <PublicHeader {...(active !== undefined ? { active } : {})} />
      )}
      <main className={styles.pageMain}>{children}</main>
      <PublicFooter />
    </div>
  );
}
