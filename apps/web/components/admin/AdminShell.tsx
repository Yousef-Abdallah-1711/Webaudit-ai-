'use client';

/**
 * Ported from design-system/ui_kits/admin/AdminShell.jsx (T243).
 *
 * `AdminSidebar`, `AdminShell`, `AHead`, `Table`, `Stat` — one file, same
 * as the source. Same routing translation as `components/dashboard/
 * Sidebar.tsx` (T241): `view`/`setView` (in-memory state in the static
 * preview) became `usePathname()` against real routes. Nav routes are
 * `/admin/{overview,queue,scans,caps,providers,users,plans,margin,log,
 * settings}` — this port's own choice, since the source never named one —
 * except `overview`, which stays at `/admin` itself (this task's own
 * target, `app/(admin)/admin/page.tsx`).
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
import { Badge, Card, Eyebrow } from '../ui';
import { Icon, type IconName } from '../ui/icons';
import { ThemeToggle } from '../../app/theme';
import styles from './AdminShell.module.css';

interface NavEntry {
  readonly key: string;
  readonly href: string;
  readonly label: string;
  readonly icon: IconName;
}

const NAV_GROUPS: readonly (readonly [string, readonly NavEntry[]])[] = [
  [
    'Platform',
    [
      { key: 'overview', href: '/admin', label: 'Overview', icon: 'barChart' },
      { key: 'queue', href: '/admin/queue', label: 'Queue', icon: 'list' },
      { key: 'scans', href: '/admin/scans', label: 'Scans', icon: 'search' },
    ],
  ],
  [
    'Catalogue',
    [
      { key: 'caps', href: '/admin/caps', label: 'Capabilities', icon: 'layoutGrid' },
      { key: 'providers', href: '/admin/providers', label: 'AI providers', icon: 'layers' },
    ],
  ],
  [
    'Commerce',
    [
      { key: 'users', href: '/admin/users', label: 'Users', icon: 'userCircle' },
      { key: 'plans', href: '/admin/plans', label: 'Plans', icon: 'creditCard' },
      { key: 'margin', href: '/admin/margin', label: 'Margin', icon: 'trendingUp' },
    ],
  ],
  [
    'Governance',
    [
      { key: 'log', href: '/admin/log', label: 'Audit log', icon: 'fileText' },
      { key: 'settings', href: '/admin/settings', label: 'Settings', icon: 'settings' },
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
          aria-label={open ? 'Collapse sidebar' : 'Expand sidebar'}
          title={open ? 'Collapse sidebar' : 'Expand sidebar'}
          className={styles.toggleBtn}
        >
          <Icon name="menu" size={19} />
        </button>
        {open && (
          <div className={styles.brand}>
            <span className={styles.wordmark}>
              Web<span className={styles.wordmarkAccent}>Audit</span>
            </span>
            <span className={styles.operatorChip}>operator</span>
          </div>
        )}
      </div>

      <div className={navScrollClasses}>
        {NAV_GROUPS.map(([group, items]) => (
          <div key={group} className={styles.navGroup}>
            {open ? (
              <div className={styles.navGroupLabel}>{group}</div>
            ) : (
              <div className={styles.navGroupDivider} />
            )}
            <div className={styles.navList}>
              {items.map((item) => (
                <ANavItem
                  key={item.key}
                  open={open}
                  active={isActive(pathname, item.href)}
                  label={item.label}
                  icon={item.icon}
                  href={item.href}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className={footClasses}>
        {open && <div className={styles.recordedNote}>every action here is recorded</div>}
        <div className={footRowClasses}>
          <a href="/scan" title="Back to dashboard" className={styles.exitLink}>
            <Icon name="logOut" size={16} />
          </a>
          {open && (
            <a href="/" className={styles.publicSiteLink}>
              Public site
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
  const [open, setOpen] = useState(true);

  return (
    <div className={styles.shellRoot}>
      <AdminSidebar open={open} setOpen={setOpen} />
      <div className={styles.mainCol}>
        <div className={styles.topBar}>
          <span className={styles.topBarOperator}>operator · khalid@webaudit.ai</span>
          <span className={styles.topBarActions}>
            <Badge tone="success">7 workers</Badge>
            <Badge>3 queued</Badge>
            <ThemeToggle />
          </span>
        </div>
        <main dir="ltr" className={styles.main}>
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
            <div key={j} className={styles.tableCell}>
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
