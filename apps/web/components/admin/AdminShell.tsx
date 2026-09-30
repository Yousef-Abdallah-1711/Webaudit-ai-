'use client';

/**
 * Ported from design-system/ui_kits/admin/AdminShell.jsx (T243).
 *
 * `AdminSidebar`, `AdminShell`, `AHead`, `Table`, `Stat` — one file, same
 * as the source. Same routing translation as `components/dashboard/
 * Sidebar.tsx` (T241): `view`/`setView` (in-memory state in the static
 * preview) became `usePathname()` against real routes. Nav routes follow
 * `design/screen-map.md`'s routing table exactly: `/admin/{queue,scans,
 * capabilities,providers,users,plans,billing,log,settings}` — except
 * `overview`, which stays at `/admin` itself (this task's own target,
 * `app/(admin)/admin/page.tsx`). Two of these (`capabilities`, `billing`)
 * were corrected in Session 5 (T212/T213): this file originally used `caps`
 * and `margin`, which never matched screen-map.md's table and would have
 * 404'd once those two real pages were built at their documented routes.
 *
 * The "back to dashboard" link points at `/scan`, the customer sidebar's
 * own first nav item (T241) — a reasonable default, not a contract. The
 * "Public site" link points at `/`, the one link here with a real,
 * already-decided target (T240's landing page).
 *
 * The source's `const [theme,setTheme]=useTheme()` in `AdminShell` is
 * dead: neither binding is read anywhere in its JSX — `<ThemeToggle/>`
 * subscribes to the same store independently. Not ported; this repo's
 * `noUnusedLocals` would refuse it, and porting dead code isn't "port,
 * never author" so much as porting a source-level oversight.
 *
 * `Table`'s `cols[].width` is `number | '1fr'`, not the source's raw CSS
 * strings (`'120px'`) — this repo's raw-px lint rule (T245) forbids that
 * literal in a `.tsx` file, and T244's screens each declare several. `Table`
 * appends `px` itself, the same move as `Card`'s `padding: number` (T237).
 */
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PRODUCT_NAME } from '@webaudit/config';
import { Badge, Card, Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { ThemeToggle } from '../../app/theme';
import { useAuth } from '../auth/AuthProvider';
import styles from './AdminShell.module.css';

interface NavEntry {
  readonly key: string;
  readonly href: string;
  readonly label:
    | 'overview'
    | 'queue'
    | 'scans'
    | 'capabilities'
    | 'providers'
    | 'users'
    | 'plans'
    | 'margin'
    | 'audit_log'
    | 'settings';
  readonly icon: IconName;
}

const NAV_GROUPS: readonly (readonly [
  'group_platform' | 'group_catalogue' | 'group_commerce' | 'group_governance',
  readonly NavEntry[],
])[] = [
  [
    'group_platform',
    [
      { key: 'overview', href: '/admin', label: 'overview', icon: 'barChart' },
      { key: 'queue', href: '/admin/queue', label: 'queue', icon: 'list' },
      { key: 'scans', href: '/admin/scans', label: 'scans', icon: 'search' },
    ],
  ],
  [
    'group_catalogue',
    [
      { key: 'caps', href: '/admin/capabilities', label: 'capabilities', icon: 'layoutGrid' },
      { key: 'providers', href: '/admin/providers', label: 'providers', icon: 'layers' },
    ],
  ],
  [
    'group_commerce',
    [
      { key: 'users', href: '/admin/users', label: 'users', icon: 'userCircle' },
      { key: 'plans', href: '/admin/plans', label: 'plans', icon: 'creditCard' },
      { key: 'margin', href: '/admin/billing', label: 'margin', icon: 'trendingUp' },
    ],
  ],
  [
    'group_governance',
    [
      { key: 'log', href: '/admin/log', label: 'audit_log', icon: 'fileText' },
      { key: 'settings', href: '/admin/settings', label: 'settings', icon: 'settings' },
    ],
  ],
];

/**
 * "Overview" lives at `/admin` itself, the same path every other admin nav
 * entry is nested under — a plain prefix match would mark it active on
 * every admin route, not just its own. It gets an exact match instead;
 * every other entry keeps matching its own nested routes too.
 */
function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface ANavItemProps {
  open: boolean;
  active: boolean;
  label: string;
  icon: IconName;
  href: string;
}

function ANavItem({ open, active, label, icon, href }: ANavItemProps): React.ReactElement {
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
    </a>
  );
}

interface AdminSidebarProps {
  open: boolean;
  setOpen: (open: boolean) => void;
}

function AdminSidebar({ open, setOpen }: AdminSidebarProps): React.ReactElement {
  const pathname = usePathname();
  const t = useTranslations('admin');

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
  const footRowClasses = [styles.footRow, open ? styles.footRowOpen : undefined]
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
          aria-label={t(open ? 'sidebar_collapse' : 'sidebar_expand')}
          title={t(open ? 'sidebar_collapse' : 'sidebar_expand')}
          className={styles.toggleBtn}
        >
          <Icon name="menu" size={19} />
        </button>
        {open && (
          <div className={styles.brand}>
            <div className={styles.wordmark}>
              <span className={styles.wordmarkAccent}>{PRODUCT_NAME}</span>
            </div>
            <span className={styles.operatorChip}>{t('operator')}</span>
          </div>
        )}
      </div>

      <div className={navScrollClasses}>
        {NAV_GROUPS.map(([group, items]) => (
          <div key={group} className={styles.navGroup}>
            {open ? (
              <div className={styles.navGroupLabel}>{t(group)}</div>
            ) : (
              <div className={styles.navGroupDivider} />
            )}
            <div className={styles.navList}>
              {items.map((item) => (
                <ANavItem
                  key={item.key}
                  open={open}
                  active={isActive(pathname, item.href)}
                  label={t(item.label)}
                  icon={item.icon}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={footClasses}>
        {open && <div className={styles.recordedNote}>{t('actions_recorded')}</div>}
        <div className={footRowClasses}>
          <a href="/scan" title={t('back_dashboard')} className={styles.exitLink}>
            <Icon name="logOut" size={16} />
          </a>
          {open && (
            <a href="/" className={styles.publicSiteLink}>
              {t('public_site')}
            </a>
          )}
        </div>
      </div>
    </aside>
  );
}

export interface AdminShellProps {
  children?: ReactNode;
}

export function AdminShell({ children }: AdminShellProps): React.ReactElement {
  const t = useTranslations('admin');
  const [open, setOpen] = useState(true);
  const { user } = useAuth();

  return (
    <div className={styles.shellRoot}>
      <AdminSidebar open={open} setOpen={setOpen} />
      <div className={styles.mainCol}>
        <div className={styles.topBar}>
          <span className={styles.topBarOperator}>
            {t('operator_header', { email: user?.email ?? t('unavailable') })}
          </span>
          <span className={styles.topBarActions}>
            <Badge>{t('workers_unavailable')}</Badge>
            <Badge>{t('queue_unavailable')}</Badge>
            <ThemeToggle />
          </span>
        </div>
        <main className={styles.main}>
          <div className={styles.mainInner}>{children}</div>
        </main>
      </div>
    </div>
  );
}

export interface AHeadProps {
  eyebrow: string;
  title: string;
  meta?: string;
  actions?: ReactNode;
}

export function AHead({ eyebrow, title, meta, actions }: AHeadProps): React.ReactElement {
  return (
    <div className={styles.head}>
      <div>
        <Eyebrow tone="accent">{eyebrow}</Eyebrow>
        <h1 className={styles.headTitle}>{title}</h1>
        {meta !== undefined && <div className={styles.headMeta}>{meta}</div>}
      </div>
      <div className={styles.headActions}>{actions}</div>
    </div>
  );
}

export interface TableColumn {
  readonly label: string;
  /** A number of px, or the literal '1fr' for the column that should fill remaining space. */
  readonly width: number | '1fr';
}

export interface TableProps {
  cols: readonly TableColumn[];
  rows: readonly (readonly ReactNode[])[];
}

export function Table({ cols, rows }: TableProps): React.ReactElement {
  const gridTemplateColumns = cols
    .map((c) => (c.width === '1fr' ? c.width : `${String(c.width)}px`))
    .join(' ');

  return (
    <div className={styles.table}>
      <div className={styles.tableHeadRow} style={{ gridTemplateColumns }}>
        {cols.map((col) => (
          <span key={col.label} className={styles.tableHeadCell}>
            {col.label}
          </span>
        ))}
      </div>
      {rows.map((row, i) => (
        <div
          key={i}
          className={i > 0 ? `${styles.tableRow} ${styles.tableRowBordered}` : styles.tableRow}
          style={{ gridTemplateColumns }}
        >
          {row.map((cell, j) => (
            <div key={j} dir="auto" className={styles.tableCell}>
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export interface StatProps {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}

export function Stat({ label, value, sub, tone }: StatProps): React.ReactElement {
  return (
    <Card padding={20} eyebrow={label}>
      <div className={styles.statValue} style={tone !== undefined ? { color: tone } : undefined}>
        {value}
      </div>
      {sub !== undefined && <div className={styles.statSub}>{sub}</div>}
    </Card>
  );
}
