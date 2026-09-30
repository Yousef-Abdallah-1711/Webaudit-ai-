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
import { localeMetadata } from '../../i18n/locales';
import { Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { LangToggle, ThemeToggle, useLang } from '../../app/theme';
import {
  getMe,
  getOutstandingIssueCount,
  getPlans,
  type CurrentUser,
  type Plan,
} from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import styles from './Sidebar.module.css';

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

/** Views whose copy is translated. Everything else stays pinned to LTR
 * rather than being mirrored by the global dir=rtl — the source's own note. */
const TRANSLATED = new Set(['scan']);

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
    open ? styles.navItemOpen : undefined,
    active ? styles.navItemActive : undefined,
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
    if (restoreFocus) profileButtonRef.current?.focus();
  };

  const toggleAccountMenu = (): void => {
    if (accountMenuOpen) {
      closeAccountMenu();
      return;
    }
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
      closeAccountMenu();
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
      menu.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
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

  const sidebarClasses = [
    styles.sidebar,
    contentOpen ? styles.sidebarOpen : undefined,
    mobileOpen ? styles.sidebarMobileOpen : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const headClasses = [styles.sidebarHead, contentOpen ? styles.sidebarHeadOpen : undefined]
    .filter(Boolean)
    .join(' ');
  const navScrollClasses = [styles.navScroll, contentOpen ? styles.navScrollOpen : undefined]
    .filter(Boolean)
    .join(' ');
  const footClasses = [styles.sidebarFoot, contentOpen ? styles.sidebarFootOpen : undefined]
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
          aria-controls="dashboard-account-menu"
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
  const [lang] = useLang();
  const pathname = usePathname();
  const activeKey = pathname.split('/').filter(Boolean)[0];
  const bodyDir =
    localeMetadata[lang].direction === 'rtl' && !TRANSLATED.has(activeKey ?? '')
      ? 'ltr'
      : undefined;

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
      <div className={styles.mainCol}>
        <button
          type="button"
          className={`${styles.toggleBtn} ${styles.mobileMenuTrigger}`}
          aria-label={t('mobile_open_menu')}
          aria-controls="dashboard-sidebar"
          aria-expanded={mobileDrawerOpen}
          onClick={() => setMobileDrawerOpen(true)}
        >
          <Icon name="menu" />
        </button>
        <main dir={bodyDir} className={styles.main}>
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
