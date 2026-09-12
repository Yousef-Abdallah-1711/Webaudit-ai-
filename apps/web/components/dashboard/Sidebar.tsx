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
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { LangToggle, ThemeToggle, useT } from '../../app/theme';
import type { StringKey } from '../../lib/strings';
import {
  getMe,
  getOutstandingIssueCount,
  getPlans,
  type CurrentUser,
  type Plan,
} from '../../lib/api';
import { useAuth } from '../auth/AuthProvider';
import styles from './Sidebar.module.css';

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

function planLabel(planId: string): string {
  return planId.length === 0
    ? 'Free plan'
    : `${planId.charAt(0).toUpperCase()}${planId.slice(1)} plan`;
}

interface NavEntry {
  readonly key: string;
  readonly href: string;
  readonly label: StringKey;
  readonly icon: IconName;
}

const NAV_GROUPS: readonly (readonly [StringKey, readonly NavEntry[]])[] = [
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
}

export function Sidebar({ open, setOpen }: SidebarProps): React.ReactElement {
  const [t] = useT();
  const pathname = usePathname();
  const { isOperator } = useAuth();
  const [me, setMe] = useState<CurrentUser | null>(null);
  const [plans, setPlans] = useState<readonly Plan[]>([]);
  const [outstandingIssues, setOutstandingIssues] = useState<number | null>(null);

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

  const sidebarClasses = [styles.sidebar, open ? styles.sidebarOpen : undefined]
    .filter(Boolean)
    .join(' ');
  const headClasses = [styles.sidebarHead, open ? styles.sidebarHeadOpen : undefined]
    .filter(Boolean)
    .join(' ');
  const navScrollClasses = [styles.navScroll, open ? styles.navScrollOpen : undefined]
    .filter(Boolean)
    .join(' ');
  const footClasses = [styles.sidebarFoot, open ? styles.sidebarFootOpen : undefined]
    .filter(Boolean)
    .join(' ');

  return (
    <aside className={sidebarClasses}>
      <div className={headClasses}>
        <button
          type="button"
          onClick={() => {
            setOpen(!open);
          }}
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          className={styles.toggleBtn}
        >
          <Icon name="menu" size={19} />
        </button>
        {open && (
          <div className={styles.wordmark}>
            Web<span className={styles.wordmarkAccent}>Audit</span> AI
          </div>
        )}
      </div>

      <div className={navScrollClasses}>
        {NAV_GROUPS.map(([groupLabel, items]) => (
          <div key={groupLabel} className={styles.navGroup}>
            {open ? (
              <div className={styles.navGroupLabel}>{t(groupLabel)}</div>
            ) : (
              <div className={styles.navGroupDivider} />
            )}
            <div className={styles.navList}>
              {items.map((item) => (
                <NavItem
                  key={item.key}
                  open={open}
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
        {open && (
          <div className={styles.creditsBox}>
            <div className={styles.creditsRow}>
              <span className={styles.creditsValue}>
                {totalCredits === null ? '—' : totalCredits.toLocaleString()}
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
        {open && (
          <div className={styles.toolsRow}>
            <div className={styles.toolsThemeToggle}>
              <ThemeToggle label />
            </div>
            <LangToggle />
            {isOperator && (
              <a href="/admin" title="Admin console" className={styles.adminLink}>
                <Icon name="shield" size={16} />
              </a>
            )}
          </div>
        )}
        {!open && (
          <div className={styles.closedTools}>
            <ThemeToggle compact />
          </div>
        )}
        <a href="/settings" className={styles.profileBtn}>
          <div className={styles.avatar}>{me === null ? '—' : initialsFromEmail(me.email)}</div>
          {open && (
            <div className={styles.profileText}>
              <div className={styles.profileName}>{me === null ? '…' : me.email}</div>
              <div className={styles.profilePlan}>{me === null ? '…' : planLabel(me.plan)}</div>
            </div>
          )}
          {open && (
            <span className={styles.profileChevron}>
              <Icon name="chevronRight" size={14} />
            </span>
          )}
        </a>
      </div>
    </aside>
  );
}

export interface AppShellProps {
  children?: ReactNode;
}

export function AppShell({ children }: AppShellProps): React.ReactElement {
  const [open, setOpen] = useState(true);
  const [, lang] = useT();
  const pathname = usePathname();
  const activeKey = pathname.split('/').filter(Boolean)[0];
  const bodyDir = lang === 'ar' && !TRANSLATED.has(activeKey ?? '') ? 'ltr' : undefined;

  return (
    <div className={styles.shellRoot}>
      <Sidebar open={open} setOpen={setOpen} />
      <div className={styles.mainCol}>
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
