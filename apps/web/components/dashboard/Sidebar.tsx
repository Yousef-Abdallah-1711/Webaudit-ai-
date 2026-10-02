'use client';

/**
 * Ported from design-system/ui_kits/app/Sidebar.jsx (T241).
 *
 * `Sidebar`, `AppShell`, `PageHead` — one file, same as the source.
 *
 * The source's `AppShell({view, setView, children})` takes the active nav
 * item as a controlled prop, set by whatever hosted the preview. There is
 * no such host here — `AppShell` is a real Next.js layout, wrapping
 * `apps/web/app/(dashboard)/layout.tsx`'s `{children}`, so "active" comes
 * from `usePathname()` against each nav item's real route instead. Route
 * paths match the nav keys directly (`/scan`, `/progress`, `/report`,
 * `/fixes`, `/readiness`, `/usage`, `/billing`) rather than inventing a
 * nesting scheme nothing has asked for yet — except `profile`, which
 * tasks.md's own T242 already places at `apps/web/app/(dashboard)/settings/
 * page.tsx`, so its nav entry points at `/settings` to match. `/admin` for
 * the admin-console link is the one educated guess: T243 places the admin
 * shell at `app/(admin)/admin/page.tsx`, which resolves to that path.
 * Adjust these if a later task decides differently; nothing here is a
 * contract.
 *
 * **Credit balance, plan, and identity are real, as of a manual-testing
 * fix**: `1,120` / `77%` / `Khalid Ahmed` / `Pro plan` were the exact
 * placeholder values the vendored source ships, wired to nothing — found
 * live (Playwright MCP against a real dev stack) showing a signed-in free
 * user "1,120 credits" and "Pro plan" while the real account genuinely had
 * 50. `GET /auth/me` (derived from live, unexpired lots, same rule
 * `GET /billing/credits` already uses — FR-078) supplies the real balance,
 * plan id, and email; `GET /billing/plans` supplies the current plan's real
 * `monthlyCredits` so the bar fill is a real fraction, not an invented one.
 * `User` has no `name` column at all (T128's own note) — the email is shown
 * instead of a fabricated name, and initials are derived from it rather
 * than reusing "KA" for every account.
 *
 * The badge on "Fixes" (still a hardcoded `4`) is untouched — out of scope
 * for this fix, which only covers identity/plan/credits.
 *
 * `open`/`setOpen` (sidebar collapse) has no routing meaning — kept as
 * local state, same as the source.
 */
import { usePathname, useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useFormatter, useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@webaudit/config';
import type enDashboard from '../../messages/en/dashboard.json';
import { Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { LangToggle, ThemeToggle } from '../../app/theme';
import {
  getMe,
  getOutstandingIssueCount,
  getPlans,
  type CurrentUser,
  type Plan,
} from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';

// Tailwind classes ported from Sidebar.module.css. Component-specific values
// remain arbitrary utilities where the shared spacing/type tokens have no match.
const styles = {
  shellRoot: 'flex min-h-screen bg-surface-sunken',
  mainCol: 'min-w-0 flex-1',
  // eslint-disable-next-line no-restricted-syntax -- preserve the Sidebar's intrinsic 640px inclusive collapse breakpoint
  main: 'px-8 pt-8 pb-16 max-[640px]:pt-16',
  mainInner: 'mx-auto max-w-app-shell',
  sidebarClosed: 'w-[3.75rem]',
  sidebarOpen: 'w-[15.5rem]',
  // eslint-disable-next-line no-restricted-syntax -- preserve the component's intrinsic 640px inclusive collapse breakpoint and drawer transform
  sidebarMobileClosed: 'max-[640px]:translate-x-[-100%] max-[640px]:rtl:translate-x-full',
  // eslint-disable-next-line no-restricted-syntax -- preserve the component's intrinsic 640px inclusive collapse breakpoint
  sidebarMobileOpen: 'max-[640px]:translate-x-0',
  // eslint-disable-next-line no-restricted-syntax -- preserve the component's intrinsic 640px inclusive collapse breakpoint and mobile drawer sizing
  sidebar: 'sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-0 border-e-hairline border-e-border-default border-solid bg-surface-raised transition-[width] duration-150 ease-[var(--easing)] max-[640px]:fixed max-[640px]:start-0 max-[640px]:inset-y-0 max-[640px]:h-auto max-[640px]:w-[min(15.5rem,85vw)] max-[640px]:z-[950] max-[640px]:transition-transform max-[640px]:duration-150 max-[640px]:ease-[var(--easing)]',
  sidebarHead: 'flex h-[3.75rem] shrink-0 items-center gap-2',
  sidebarHeadClosed: 'justify-center p-0',
  sidebarHeadOpen: 'justify-start px-3 py-0',
  toggleBtn: 'grid h-[2.125rem] w-[2.125rem] shrink-0 cursor-pointer place-items-center rounded-control border-0 bg-transparent text-text-secondary transition-colors duration-150 ease-[var(--easing)]',
  wordmark: 'whitespace-nowrap text-[1rem] font-bold tracking-[-0.01875rem] text-text-strong',
  wordmarkAccent: 'text-accent',
  navScroll: 'flex-1 overflow-y-auto py-[0.375rem]',
  navScrollClosed: 'px-2',
  navScrollOpen: 'px-[0.625rem]',
  navGroup: 'mb-4',
  navGroupLabel: 'px-3 pb-[0.375rem] font-sans text-[0.625rem] leading-5 tracking-[var(--track-eyebrow)] text-text-muted font-bold uppercase',
  navGroupDivider: 'mx-[0.375rem] mb-2 h-px bg-border-default',
  navList: 'flex flex-col gap-0.5',
  navItem: 'flex h-[2.375rem] w-full cursor-pointer items-center gap-[0.6875rem] rounded-control border-0 p-0 text-start font-sans text-[0.875rem] leading-6 transition-colors duration-150 ease-[var(--easing)]',
  navItemClosed: 'justify-center p-0',
  navItemOpen: 'justify-start px-3',
  navItemInactive: 'bg-transparent font-normal text-text-secondary shadow-none hover:bg-white/55',
  // The 2px inset marker is component-specific and uses the exact measured source value.
  navItemActive: 'bg-surface-page font-semibold text-text-strong shadow-[inset_0.125rem_0_0_var(--accent)] hover:bg-surface-page rtl:shadow-[inset_-0.125rem_0_0_var(--accent)]',
  navItemLabel: 'overflow-hidden whitespace-nowrap',
  navItemBadge: 'ms-auto font-mono text-[0.6875rem] text-sev-critical',
  // Top border only; border-0 explicitly clears the other three sides.
  sidebarFoot: 'shrink-0 border-0 border-t-hairline border-t-border-default border-solid',
  sidebarFootClosed: 'px-2 py-3',
  sidebarFootOpen: 'p-3',
  creditsBox: 'mb-3 rounded-card border border-hairline border-border-default bg-surface-page p-3',
  creditsRow: 'flex items-baseline gap-1.5',
  creditsValue: 'font-mono text-[0.9375rem] font-bold text-text-strong',
  creditsLabel: 'font-sans text-[0.75rem] font-normal leading-5 text-text-secondary',
  creditsBar: 'mt-2 h-1 bg-surface-sunken',
  creditsBarFill: 'h-full w-0 bg-accent',
  topUpBtn: 'mt-2.5 h-[1.875rem] w-full cursor-pointer rounded-control border border-hairline border-border-default bg-surface-page font-sans text-[0.75rem] leading-6',
  toolsRow: 'mb-3 flex gap-2',
  toolsThemeToggle: 'flex-1',
  adminLink: 'grid h-9 w-9 place-items-center rounded-control border border-hairline border-border-default text-text-secondary',
  closedTools: 'mb-2.5 grid place-items-center gap-1.5',
  profileBtn: 'flex w-full cursor-pointer items-center gap-2.5 border-0 bg-transparent p-0 text-start text-inherit [font:inherit]',
  accountMenu: 'fixed z-[1000] flex max-w-[calc(100vw_-_var(--space-8))] flex-col min-w-[calc(var(--space-16)_*_3)] rounded-card border border-hairline border-border-default bg-surface-page p-1 text-text-primary',
  accountMenuItem: 'flex min-h-10 w-full cursor-pointer items-center border-0 bg-transparent px-3 text-start type-small text-text-primary no-underline transition-colors duration-150 ease-[var(--easing)] hover:bg-surface-sunken hover:text-text-strong focus-visible:bg-surface-sunken focus-visible:text-text-strong focus-visible:outline focus-visible:outline-hairline focus-visible:outline-text-primary focus-visible:outline-offset-[-0.0625rem]',
  avatar: 'grid h-[1.875rem] w-[1.875rem] shrink-0 place-items-center rounded-pill bg-surface-inverse text-[0.75rem] font-semibold text-text-on-accent',
  profileText: 'overflow-hidden text-start',
  profileName: 'whitespace-nowrap text-[0.8125rem] font-semibold text-text-strong',
  profilePlan: 'whitespace-nowrap text-[0.6875rem] text-text-muted',
  profileChevron: 'ms-auto text-text-muted',
  pageHead: 'mb-6 flex flex-wrap items-end gap-4',
  pageHeadTitle: 'mt-2 mb-0 type-h3 text-text-strong',
  pageHeadMeta: 'mt-1.5 font-mono text-[0.8125rem] text-text-secondary',
  pageHeadActions: 'ms-auto flex gap-2.5',
  // eslint-disable-next-line no-restricted-syntax -- preserve the Sidebar's intrinsic 640px inclusive collapse breakpoint and overlay color
  mobileBackdrop: 'hidden max-[640px]:fixed max-[640px]:inset-0 max-[640px]:z-[900] max-[640px]:block max-[640px]:border-0 max-[640px]:bg-[color-mix(in_srgb,var(--text-strong)_42%,transparent)] max-[640px]:p-0',
  // eslint-disable-next-line no-restricted-syntax -- preserve the Sidebar's intrinsic 640px inclusive collapse breakpoint
  mobileMenuTrigger: 'hidden max-[640px]:fixed max-[640px]:start-2 max-[640px]:top-2 max-[640px]:z-[850] max-[640px]:grid max-[640px]:bg-surface-raised',
};

type DashboardKey = keyof typeof enDashboard;

/** First letter of up to two "words" in the email's local part — real, deterministic, no invented name. */
function initialsFromEmail(email: string): string {
  const local = email.split('@')[0] ?? '';
  const words = local.split(/[.\-_+]/).filter((w) => w.length > 0);
  const source = words.length > 0 ? words : [local];
  return source
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

interface NavEntry {
  readonly key: string;
  readonly href: string;
  readonly label: DashboardKey;
  readonly icon: IconName;
}

const NAV_GROUPS: readonly (readonly [DashboardKey, readonly NavEntry[]])[] = [
  [
    'g_audits',
    [
      { key: 'scan', href: '/scan', label: 'n_scan', icon: 'plus' },
      { key: 'progress', href: '/progress', label: 'n_progress', icon: 'loader' },
      { key: 'report', href: '/report', label: 'n_report', icon: 'fileText' },
      { key: 'fixes', href: '/fixes', label: 'n_fixes', icon: 'check' },
      { key: 'readiness', href: '/readiness', label: 'n_readiness', icon: 'flag' },
    ],
  ],
  [
    'g_account',
    [
      { key: 'usage', href: '/usage', label: 'n_usage', icon: 'barChart' },
      { key: 'billing', href: '/billing', label: 'n_billing', icon: 'creditCard' },
      { key: 'profile', href: '/settings', label: 'n_profile', icon: 'userCircle' },
    ],
  ],
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface NavItemProps {
  open: boolean;
  active: boolean;
  label: string;
  icon: IconName;
  href: string;
  badge?: number | null;
}

function NavItem({
  open,
  active,
  label,
  icon,
  href,
  badge = null,
}: NavItemProps): React.ReactElement {
  const classes = [
    styles.navItem,
    open ? styles.navItemOpen : styles.navItemClosed,
    active ? styles.navItemActive : styles.navItemInactive,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <a href={href} title={open ? undefined : label} className={classes}>
      <Icon name={icon} />
      {open && <span className={styles.navItemLabel}>{label}</span>}
      {open && badge !== null && <span className={styles.navItemBadge}>{badge}</span>}
    </a>
  );
}

export interface SidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({
  open,
  setOpen,
  mobileOpen = false,
  onMobileClose = () => {},
}: SidebarProps): React.ReactElement {
  const format = useFormatter();
  const t = useTranslations('dashboard');
  const pathname = usePathname();
  const router = useRouter();
  const { isOperator, logout } = useAuth();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [outstandingIssues, setOutstandingIssues] = useState<number | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [accountMenuPosition, setAccountMenuPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const focusAccountMenuOnOpenRef = useRef(false);
  const profileButtonRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const contentOpen = open || mobileOpen;

  useEffect(() => {
    let cancelled = false;
    void getMe().then(
      (user) => {
        if (!cancelled) setMe(user);
      },
      () => {
        /* Not signed in yet, or the request failed — the loading fallback below stays up rather than showing a fake identity. */
      },
    );
    void getPlans().then(
      (result) => {
        if (!cancelled) setPlans(result.plans);
      },
      () => {
        /* The bar fill degrades to unfilled below; the balance and identity do not depend on this. */
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void getOutstandingIssueCount().then(
      ({ count }) => {
        if (!cancelled) setOutstandingIssues(count);
      },
      () => {
        /* A badge cannot be inferred safely when the count request fails. */
      },
    );
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const totalCredits = me === null ? null : me.credits.plan + me.credits.purchased;
  const currentPlan = plans.find((p) => p.id === me?.plan);
  const creditsFillPercent =
    totalCredits !== null && currentPlan !== undefined && currentPlan.monthlyCredits > 0
      ? Math.min(100, Math.max(0, (totalCredits / currentPlan.monthlyCredits) * 100))
      : 0;
  const currentPlanLabel =
    me === null
      ? '…'
      : me.plan.length === 0 || me.plan === 'free'
        ? t('plan_free')
        : t('plan_label', {
            plan: `${me.plan.charAt(0).toUpperCase()}${me.plan.slice(1)}`,
          });

  const closeAccountMenu = (restoreFocus = false): void => {
    setAccountMenuOpen(false);
    setAccountMenuPosition(null);
    focusAccountMenuOnOpenRef.current = false;
    if (restoreFocus) profileButtonRef.current?.focus();
  };

  const toggleAccountMenu = (): void => {
    if (accountMenuOpen) {
      closeAccountMenu();
      return;
    }
    focusAccountMenuOnOpenRef.current = true;
    setAccountMenuOpen(true);
  };

  const signOut = async (): Promise<void> => {
    closeAccountMenu();
    await logout();
    router.replace('/');
  };

  const handleAccountMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>): void => {
    const menuItems = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    const currentIndex = menuItems.indexOf(document.activeElement as HTMLElement);
    let nextIndex: number | undefined;

    if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % menuItems.length;
    if (event.key === 'ArrowUp')
      nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = menuItems.length - 1;

    if (nextIndex !== undefined) {
      event.preventDefault();
      menuItems[nextIndex]?.focus();
    } else if (event.key === 'Tab') {
      closeAccountMenu(true);
    }
  };

  useEffect(() => {
    if (!accountMenuOpen) return;

    const positionMenu = (): void => {
      const trigger = profileButtonRef.current;
      const menu = accountMenuRef.current;
      if (!trigger || !menu) return;

      const triggerRect = trigger.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      const tokenGap = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue('--space-2'),
      );
      const gap = Number.isFinite(tokenGap) ? tokenGap : 0;
      const maxLeft = Math.max(gap, window.innerWidth - menuRect.width - gap);
      const left = Math.min(maxLeft, Math.max(gap, triggerRect.right - menuRect.width));
      const above = triggerRect.top - menuRect.height - gap;
      const below = triggerRect.bottom + gap;
      const desiredTop = above >= gap ? above : below;
      const maxTop = Math.max(gap, window.innerHeight - menuRect.height - gap);

      setAccountMenuPosition({
        left,
        top: Math.min(maxTop, Math.max(gap, desiredTop)),
      });
    };

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (profileButtonRef.current?.contains(target) || accountMenuRef.current?.contains(target)) {
        return;
      }
      closeAccountMenu();
    };

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      closeAccountMenu(true);
    };

    positionMenu();
    window.addEventListener('resize', positionMenu);
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('resize', positionMenu);
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!accountMenuOpen || accountMenuPosition === null || !focusAccountMenuOnOpenRef.current) {
      return;
    }

    const firstMenuItem = accountMenuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    if (!firstMenuItem) return;

    firstMenuItem.focus();
    focusAccountMenuOnOpenRef.current = false;
  }, [accountMenuOpen, accountMenuPosition]);

  const sidebarClasses = [
    styles.sidebar,
    contentOpen ? styles.sidebarOpen : styles.sidebarClosed,
    mobileOpen ? styles.sidebarMobileOpen : styles.sidebarMobileClosed,
  ]
    .filter(Boolean)
    .join(' ');
  const headClasses = [
    styles.sidebarHead,
    contentOpen ? styles.sidebarHeadOpen : styles.sidebarHeadClosed,
  ]
    .filter(Boolean)
    .join(' ');
  const navScrollClasses = [
    styles.navScroll,
    contentOpen ? styles.navScrollOpen : styles.navScrollClosed,
  ]
    .filter(Boolean)
    .join(' ');
  const footClasses = [
    styles.sidebarFoot,
    contentOpen ? styles.sidebarFootOpen : styles.sidebarFootClosed,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside id="dashboard-sidebar" className={sidebarClasses}>
      <div className={headClasses}>
        <button
          type="button"
          onClick={() => {
            if (mobileOpen) {
              onMobileClose();
            } else {
              setOpen(!open);
            }
          }}
          id="dashboard-sidebar-mobile-close"
          aria-label={t(mobileOpen || open ? 'sidebar_collapse' : 'sidebar_expand')}
          title={t(mobileOpen || open ? 'sidebar_collapse' : 'sidebar_expand')}
          className={styles.toggleBtn}
        >
          <Icon name="menu" size={19} />
        </button>
        {contentOpen && (
          <div dir="ltr" className={styles.wordmark}>
            <span className={styles.wordmarkAccent}>{PRODUCT_NAME}</span>
          </div>
        )}
      </div>

      <div className={navScrollClasses}>
        {NAV_GROUPS.map(([groupLabel, items]) => (
          <div key={groupLabel} className={styles.navGroup}>
            {contentOpen ? (
              <div className={styles.navGroupLabel}>{t(groupLabel)}</div>
            ) : (
              <div className={styles.navGroupDivider} />
            )}
            <div className={styles.navList}>
              {items.map((item) => (
                <NavItem
                  key={item.key}
                  open={contentOpen}
                  active={isActive(pathname, item.href)}
                  label={t(item.label)}
                  icon={item.icon}
                  href={item.href}
                  badge={item.key === 'fixes' ? outstandingIssues : null}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={footClasses}>
        {contentOpen && (
          <div className={styles.creditsBox}>
            <div className={styles.creditsRow}>
              <span className={styles.creditsValue}>
                {totalCredits === null ? '—' : format.number(totalCredits)}
              </span>
              <span className={styles.creditsLabel}>{t('credits_left')}</span>
            </div>
            <div className={styles.creditsBar}>
              <div
                className={styles.creditsBarFill}
                style={{ width: `${String(creditsFillPercent)}%` }}
              />
            </div>
            <a href="/billing" className={styles.topUpBtn}>
              {t('top_up')}
            </a>
          </div>
        )}
        {contentOpen && (
          <div className={styles.toolsRow}>
            <div className={styles.toolsThemeToggle}>
              <ThemeToggle label />
            </div>
            <LangToggle />
            {isOperator && (
              <a href="/admin" title={t('admin_console')} className={styles.adminLink}>
                <Icon name="shield" size={16} />
              </a>
            )}
          </div>
        )}
        {!contentOpen && (
          <div className={styles.closedTools}>
            <ThemeToggle compact />
          </div>
        )}
        <button
          ref={profileButtonRef}
          type="button"
          id="dashboard-account-trigger"
          className={styles.profileBtn}
          aria-label={t('account_menu')}
          aria-haspopup="menu"
          aria-expanded={accountMenuOpen}
          aria-controls={accountMenuOpen ? 'dashboard-account-menu' : undefined}
          title={contentOpen ? undefined : t('account_menu')}
          onClick={toggleAccountMenu}
        >
          <div className={styles.avatar}>{me === null ? '—' : initialsFromEmail(me.email)}</div>
          {contentOpen && (
            <div className={styles.profileText}>
              <div className={styles.profileName}>{me === null ? '…' : me.email}</div>
              <div className={styles.profilePlan}>{currentPlanLabel}</div>
            </div>
          )}
          {contentOpen && (
            <span className={styles.profileChevron}>
              <Icon name="chevronRight" size={14} />
            </span>
          )}
        </button>
      </div>
      {accountMenuOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={accountMenuRef}
              id="dashboard-account-menu"
              className={styles.accountMenu}
              role="menu"
              aria-labelledby="dashboard-account-trigger"
              aria-orientation="vertical"
              onKeyDown={handleAccountMenuKeyDown}
              style={{
                left: accountMenuPosition?.left ?? 0,
                top: accountMenuPosition?.top ?? 0,
                visibility: accountMenuPosition === null ? 'hidden' : 'visible',
              }}
            >
              <a
                href="/settings"
                className={styles.accountMenuItem}
                role="menuitem"
                onClick={() => closeAccountMenu()}
              >
                {t('n_profile')}
              </a>
              <a
                href="/billing"
                className={styles.accountMenuItem}
                role="menuitem"
                onClick={() => closeAccountMenu()}
              >
                {t('n_billing')}
              </a>
              <button
                type="button"
                className={styles.accountMenuItem}
                role="menuitem"
                onClick={() => void signOut()}
              >
                {t('menu_sign_out')}
              </button>
            </div>,
            document.body,
          )
        : null}
    </aside>
  );
}

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const t = useTranslations('dashboard');
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const mobileDrawerWasOpenRef = useRef(false);

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
      mobileDrawerWasOpenRef.current = true;
      document.getElementById('dashboard-sidebar-mobile-close')?.focus();
      return;
    }

    if (!mobileDrawerWasOpenRef.current) return;
    mobileDrawerWasOpenRef.current = false;
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

  return (
    <div className={styles.shellRoot}>
      <Sidebar
        open={open}
        setOpen={setOpen}
        mobileOpen={mobileDrawerOpen}
        onMobileClose={() => setMobileDrawerOpen(false)}
      />
      {mobileDrawerOpen && (
        <div
          className={styles.mobileBackdrop}
          aria-hidden="true"
          onClick={() => setMobileDrawerOpen(false)}
        />
      )}
      <div className={styles.mainCol} inert={mobileDrawerOpen}>
        <button
          ref={mobileTriggerRef}
          type="button"
          className={`${styles.toggleBtn} ${styles.mobileMenuTrigger}`}
          aria-label={t('mobile_open_menu')}
          aria-controls="dashboard-sidebar"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export interface PageHeadProps {
  eyebrow?: string;
  title: string;
  meta?: string;
  actions?: ReactNode;
}

export function PageHead({ eyebrow, title, meta, actions }: PageHeadProps): React.ReactElement {
  return (
    <div className={styles.pageHead}>
      <div>
        {eyebrow !== undefined && <Eyebrow tone="accent">{eyebrow}</Eyebrow>}
        <h1 className={styles.pageHeadTitle}>{title}</h1>
        {meta !== undefined && <div className={styles.pageHeadMeta}>{meta}</div>}
      </div>
      <div className={styles.pageHeadActions}>{actions}</div>
    </div>
  );
}
