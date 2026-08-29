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
 * Credit balance (1,120 / 77%), the badge on "Fixes" (4), and the profile
 * identity (Khalid Ahmed / KA / Pro plan) are the exact placeholder values
 * the vendored source shows — not real data, and this port doesn't invent
 * a wiring for them that doesn't exist yet either.
 *
 * `open`/`setOpen` (sidebar collapse) has no routing meaning — kept as
 * local state, same as the source.
 */
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { LangToggle, ThemeToggle, useT } from '../../app/theme';
import type { StringKey } from '../../lib/strings';
import styles from './Sidebar.module.css';

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
                  badge={item.key === 'fixes' ? 4 : null}
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
              <span className={styles.creditsValue}>1,120</span>
              <span className={styles.creditsLabel}>{t('credits_left')}</span>
            </div>
            <div className={styles.creditsBar}>
              <div className={styles.creditsBarFill} />
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
            <a href="/admin" title="Admin console" className={styles.adminLink}>
              <Icon name="shield" size={16} />
            </a>
          </div>
        )}
        {!open && (
          <div className={styles.closedTools}>
            <ThemeToggle compact />
          </div>
        )}
        <a href="/settings" className={styles.profileBtn}>
          <div className={styles.avatar}>KA</div>
          {open && (
            <div className={styles.profileText}>
              <div className={styles.profileName}>Khalid Ahmed</div>
              <div className={styles.profilePlan}>Pro plan</div>
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
